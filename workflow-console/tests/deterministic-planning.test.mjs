import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {buildDeterministicPlanningDocuments} from '../lib/deterministic-planning.mjs';
import {validatePlanningDocuments} from '../../tools/planning-contract/compile-production-manifest.mjs';
import {
  createSemanticCreativeSequence,
  validateShotCreativeFields,
} from '../../tools/planning-contract/creative-contract.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const contract = JSON.parse(await fs.readFile(
  path.join(workspaceRoot, 'style-library/styles/project/modern-ip-host-explainer/PLANNING_CONTRACT.json'),
  'utf8',
));
const motionLibrary = JSON.parse(await fs.readFile(
  path.join(workspaceRoot, 'style-library/motion-library/knowledge-explainer-v1.json'),
  'utf8',
));

const makeInputs = (cueCount, {cueSeconds = 4} = {}) => {
  const cues = Array.from({length: cueCount}, (_, index) => ({
    id: `cue-${String(index + 1).padStart(3, '0')}`,
    start: index * cueSeconds,
    end: (index + 1) * cueSeconds,
    text: `这是第${index + 1}个用于确定性规划回归的原文。`,
  }));
  const projectId = `baseline-${cueCount}`;
  const narrationSha256 = 'a'.repeat(64);
  const narrationLock = {projectId, normalizedSha256: narrationSha256, frozenPath: 'input/narration.txt'};
  const alignment = {
    schemaVersion: 'autovideo-alignment-locked/v1',
    narrationSha256,
    durationSeconds: cueCount * cueSeconds,
    lastEndSeconds: cueCount * cueSeconds,
    cues,
  };
  const templateLock = {
    projectId,
    narrationSha256,
    styleId: contract.styleId,
    styleVersion: contract.styleVersion,
    paletteId: 'light-apricot',
    ratio: contract.format.ratio,
    resolution: `${contract.format.width}x${contract.format.height}`,
    fps: contract.format.fps,
  };
  return {projectId, narrationLock, alignment, templateLock};
};

const buildFromInputs = ({projectId, narrationLock, alignment, templateLock}) => {
  const receipts = {
    formalProjectPath: `hyperframes-workflow-kit/projects/${projectId}`,
    narrationLock: {sha256: 'b'.repeat(64)},
    alignment: {sha256: 'c'.repeat(64)},
    templateLock: {sha256: 'd'.repeat(64)},
    templateContract: {sha256: 'e'.repeat(64)},
    motionRecipeLibrary: {
      path: 'style-library/motion-library/knowledge-explainer-v1.json',
      sha256: '1'.repeat(64),
    },
  };
  return buildDeterministicPlanningDocuments({
    projectId,
    narrationLock,
    alignment,
    templateLock,
    templateContract: contract,
    motionLibrary,
    poseIds: contract.poseIds,
    inputReceipts: receipts,
    audioSha256: 'f'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  });
};

const build = (cueCount, options) => buildFromInputs(makeInputs(cueCount, options));

for (const cueCount of [1, 7, 46, 80]) {
  test(`deterministic planning covers ${cueCount} cues without fixed scene counts`, () => {
    const first = build(cueCount);
    const second = build(cueCount);
    assert.deepEqual(first.storyboard, second.storyboard);
    assert.deepEqual(first.shotManifest, second.shotManifest);
    assert.deepEqual(first.graphIr, second.graphIr);
    assert.equal(first.shotManifest.shots.length, cueCount);
    const expectedCueIds = Array.from({length: cueCount}, (_, index) => `cue-${String(index + 1).padStart(3, '0')}`);
    assert.deepEqual(first.storyboard.scenes.flatMap((scene) => scene.cueIds), expectedCueIds);
    assert.deepEqual(first.shotManifest.shots.map((shot) => shot.cueId), expectedCueIds);
    assert.equal(first.storyboard.provenance.mode, 'deterministic-baseline');
    assert.equal(first.shotManifest.provenance.mode, 'deterministic-baseline');
    assert.equal(first.graphIr.provenance.mode, 'deterministic-baseline');
    assert.ok(first.storyboard.scenes.every((scene) => scene.cueIds.length <= 5));
    assert.ok(first.storyboard.scenes.every((scene) => scene.layout.hostZone === 'host.left'));
    assert.ok(first.storyboard.scenes.every((scene) => scene.layout.contentZone === 'content.right'));
    validatePlanningDocuments({
      ...makeInputs(cueCount),
      templateContract: contract,
      motionLibrary,
      storyboard: first.storyboard,
      shotManifest: first.shotManifest,
      graphIr: first.graphIr,
    });
    for (const shot of first.shotManifest.shots) {
      assert.ok(shot.screenText.text.includes(shot.narration.slice(0, Math.min(shot.screenText.text.length, shot.narration.length))));
      assert.ok(contract.poseIds.includes(shot.hostPose));
      assert.ok(shot.zones.includes('caption'));
      assert.ok(shot.visualType);
      assert.equal(shot.motionRecipeRefs.length, 1);
      assert.ok(shot.provenanceRefs.includes('motion-library:knowledge-explainer@1.0.0'));
    }
  });
}

test('deterministic planning groups ordinary cues into approximately 30-second stable boards', () => {
  const documents = build(12, {cueSeconds: 6});
  assert.deepEqual(documents.storyboard.scenes.map((scene) => scene.cueIds.length), [5, 5, 2]);
  assert.deepEqual(documents.storyboard.scenes.map((scene) => scene.timing.duration), [30, 30, 12]);
  assert.deepEqual(
    documents.storyboard.scenes.flatMap((scene) => scene.cueIds),
    documents.shotManifest.shots.map((shot) => shot.cueId),
  );
  assert.equal(documents.storyboard.provenance.policies.maxCuesPerScene, 5);
  assert.equal(documents.storyboard.provenance.policies.targetSceneSeconds, 30);
});

test('five-cue process graphs keep at most three active nodes and compact older steps', () => {
  const inputs = makeInputs(11, {cueSeconds: 6});
  const processText = [
    '\u9996\u5148\u5bfc\u5165\u539f\u59cb\u6587\u6863\u3002',
    '\u7136\u540e\u8fdb\u884c\u6587\u672c\u5207\u5206\u3002',
    '\u63a5\u7740\u751f\u6210\u5411\u91cf\u8868\u793a\u3002',
    '\u5176\u6b21\u5199\u5165\u68c0\u7d22\u7d22\u5f15\u3002',
    '\u6700\u540e\u6267\u884c\u68c0\u7d22\u548c\u91cd\u6392\u3002',
  ];
  inputs.alignment.cues = inputs.alignment.cues.map((cue, index) => (
    index >= 5 && index < 10 ? {...cue, text: processText[index - 5]} : cue
  ));
  const documents = buildFromInputs(inputs);
  assert.equal(documents.graphIr.graphs.length, 1);
  const graph = documents.graphIr.graphs[0];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  assert.deepEqual(graph.states.map((state) => state.activeNodeIds.length), [1, 2, 3, 3, 3]);
  assert.deepEqual(graph.states.map((state) => state.compactedNodeIds.length), [0, 0, 0, 1, 2]);
  for (const state of graph.states) {
    assert.ok(state.activeNodeIds.length <= documents.graphIr.globalPolicy.maxActiveNodesPerState);
    assert.ok(state.activeNodeIds.every((nodeId) => nodeIds.has(nodeId)));
    assert.ok(state.compactedNodeIds.every((nodeId) => nodeIds.has(nodeId) && !state.activeNodeIds.includes(nodeId)));
    for (const edgeId of state.activeEdgeIds) {
      const edge = edgeById.get(edgeId);
      assert.ok(edge);
      assert.ok(state.activeNodeIds.includes(edge.from));
      assert.ok(state.activeNodeIds.includes(edge.to));
    }
  }
});

test('deterministic planning rejects a changed template contract', () => {
  const inputs = makeInputs(1);
  assert.throws(() => buildDeterministicPlanningDocuments({
    ...inputs,
    templateContract: {...contract, scenePolicy: {...contract.scenePolicy, maxCuesPerScene: 4}},
    motionLibrary,
    poseIds: contract.poseIds,
    inputReceipts: {
      formalProjectPath: 'hyperframes-workflow-kit/projects/baseline-1',
      narrationLock: {sha256: 'b'.repeat(64)},
      alignment: {sha256: 'c'.repeat(64)},
      templateLock: {sha256: 'd'.repeat(64)},
      templateContract: {sha256: 'e'.repeat(64)},
      motionRecipeLibrary: {
        path: 'style-library/motion-library/knowledge-explainer-v1.json',
        sha256: '1'.repeat(64),
      },
    },
    audioSha256: 'f'.repeat(64),
  }), /algorithm settings do not match/);
});

test('deterministic planning preserves legal breath gaps across shots and scenes', () => {
  const inputs = makeInputs(6);
  inputs.alignment.cues = [
    {...inputs.alignment.cues[0], start: 0, end: 4},
    {...inputs.alignment.cues[1], start: 4.4, end: 8},
    {...inputs.alignment.cues[2], start: 8.5, end: 12},
    {...inputs.alignment.cues[3], start: 12.8, end: 16},
    {...inputs.alignment.cues[4], start: 16.4, end: 20},
    {...inputs.alignment.cues[5], start: 20.8, end: 24},
  ];
  inputs.alignment.durationSeconds = 24;
  inputs.alignment.lastEndSeconds = 24;
  const documents = buildDeterministicPlanningDocuments({
    ...inputs,
    templateContract: contract,
    motionLibrary,
    poseIds: contract.poseIds,
    inputReceipts: {
      formalProjectPath: 'hyperframes-workflow-kit/projects/baseline-6',
      narrationLock: {sha256: 'b'.repeat(64)},
      alignment: {sha256: 'c'.repeat(64)},
      templateLock: {sha256: 'd'.repeat(64)},
      templateContract: {sha256: 'e'.repeat(64)},
      motionRecipeLibrary: {
        path: 'style-library/motion-library/knowledge-explainer-v1.json',
        sha256: '1'.repeat(64),
      },
    },
    audioSha256: 'f'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(documents.shotManifest.shots[0].end, 4);
  assert.equal(documents.shotManifest.shots[1].start, 4.4);
  assert.equal(documents.storyboard.scenes[0].timing.end, 20);
  assert.equal(documents.storyboard.scenes[1].timing.start, 20.8);
  assert.doesNotThrow(() => validatePlanningDocuments({
    ...inputs,
    templateContract: contract,
    motionLibrary,
    storyboard: documents.storyboard,
    shotManifest: documents.shotManifest,
    graphIr: documents.graphIr,
  }));
});

test('planning validation still rejects overlapping aligned cues', () => {
  const inputs = makeInputs(2);
  const documents = build(2);
  inputs.alignment.cues[1].start = 3.5;
  documents.shotManifest.shots[1].start = 3.5;
  documents.shotManifest.shots[1].duration = 4.5;
  documents.storyboard.scenes[0].timing.duration = 8;

  assert.throws(() => validatePlanningDocuments({
    ...inputs,
    templateContract: contract,
    motionLibrary,
    storyboard: documents.storyboard,
    shotManifest: documents.shotManifest,
    graphIr: documents.graphIr,
  }), /overlaps the previous cue/);
});

test('semantic creative planning uses bounded illustrative carriers and limits repeated recipes', () => {
  const scene = {id: 'scene-01', role: 'concept', cueIds: ['cue-001', 'cue-002', 'cue-003', 'cue-004', 'cue-005']};
  const shots = [
    {cueId: 'cue-001', sceneId: scene.id, narration: 'Inspect API config and logs.', screenText: {text: 'API config'}},
    {cueId: 'cue-002', sceneId: scene.id, narration: 'Open the workflow UI from input to output.', screenText: {text: 'Workflow states'}},
    {cueId: 'cue-003', sceneId: scene.id, narration: '\u63d0\u793a\u8bcd\u914d\u7f6e\u8981\u7ecf\u8fc7\u6821\u9a8c\u3001\u56de\u5f52\u548c\u53d1\u5e03\u3002', screenText: {text: '\u63d0\u793a\u8bcd\u914d\u7f6e'}},
    {cueId: 'cue-004', sceneId: scene.id, narration: '\u76d1\u63a7\u5e73\u53f0\u5c55\u793a\u8f93\u5165\u3001\u5904\u7406\u548c\u8f93\u51fa\u72b6\u6001\u3002', screenText: {text: '\u76d1\u63a7\u72b6\u6001'}},
    {cueId: 'cue-005', sceneId: scene.id, narration: 'One short conclusion.', screenText: {text: 'Conclusion'}},
  ];
  const planned = createSemanticCreativeSequence({shots, scenes: [scene], library: motionLibrary});
  assert.deepEqual(planned.map((shot) => shot.visualType), [
    'code-surface', 'device-surface', 'code-surface', 'device-surface', 'keyword',
  ]);
  assert.equal(planned[0].carrierPayload.evidence.status, 'illustrative-mock');
  assert.equal(planned[1].carrierPayload.evidence.status, 'illustrative-mock');
  assert.ok(planned.every((shot) => validateShotCreativeFields({shot, library: motionLibrary})));
});
