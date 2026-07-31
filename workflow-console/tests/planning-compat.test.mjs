import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';


const consoleRoot = path.resolve(import.meta.dirname, '..');
const testDataRoot = path.join(consoleRoot, 'data', `test-planning-${process.pid}`);
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = testDataRoot;

const planning = await import('../lib/planning-compat.mjs');
const store = await import('../lib/project-store.mjs');

const projectInput = (id) => ({
  id,
  title: `Planning ${id}`,
  route: 'materials',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '60s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'test planning compatibility',
  automation: 'critical-gates',
  publicationRights: 'needs-review',
  rightsNotes: '',
});

const legacyStoryboard = () => ({
  schemaVersion: 'autovideo-storyboard-beats/v1',
  beats: [{
    id: 'scene-01',
    exactExcerpt: '平台隐藏复杂性。',
    screenText: '按钮背后是系统',
    screenTextKind: 'generated_summary',
    claimIds: ['claim-01'],
    visualType: 'process_flow',
    startAnchor: 'cue-001',
    endAnchor: 'cue-002',
    nodes: [
      {id: 'node-a', label: '按钮', kind: 'surface'},
      {id: 'node-b', label: '系统', kind: 'system'},
    ],
    edges: [{id: 'edge-ab', from: 'node-a', to: 'node-b', label: 'hides'}],
  }],
});

const writeJson = (filePath, value) => fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const createFormalFixture = async (root, projectId = 'formal-plan') => {
  await fs.mkdir(path.join(root, 'plan'), {recursive: true});
  await fs.mkdir(path.join(root, 'audio'), {recursive: true});
  const storyboard = {
    schemaVersion: 'autovideo-storyboard/v1',
    projectId,
    status: 'outline',
    scenes: [{id: 'scene-01', order: 1, cueIds: ['cue-001'], screenText: []}],
  };
  const graphIr = {
    schemaVersion: 'autovideo-graph-ir/v1',
    projectId,
    purpose: 'fixture',
    globalPolicy: {},
    graphs: [{
      id: 'graph-01',
      sceneId: 'scene-01',
      nodes: [{id: 'node-a', label: 'A'}, {id: 'node-b', label: 'B'}],
      edges: [{id: 'edge-ab', from: 'node-a', to: 'node-b', relation: 'next'}],
      states: [],
      terminalStateId: null,
      motionRules: [],
    }],
  };
  const shotManifest = {
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId,
    cueCount: 1,
    shots: [{cueId: 'cue-001', sceneId: 'scene-01', narration: '测试。', start: 0, end: 1, duration: 1}],
  };
  await writeJson(path.join(root, 'plan', 'storyboard.json'), storyboard);
  await writeJson(path.join(root, 'plan', 'graph-ir.json'), graphIr);
  await writeJson(path.join(root, 'plan', 'shot-manifest.json'), shotManifest);
  await writeJson(path.join(root, 'NarrationLock.json'), {
    schemaVersion: 'autovideo-narration-lock/v1',
    projectId,
    normalizedSha256: 'a'.repeat(64),
  });
  await writeJson(path.join(root, 'audio', 'alignment.json'), {
    schemaVersion: 'autovideo-alignment-locked/v1',
    narrationSha256: 'a'.repeat(64),
    cues: [{id: 'cue-001', text: '测试。', start: 0, end: 1}],
  });
  return {storyboard, graphIr, shotManifest};
};

before(async () => {
  await fs.mkdir(testDataRoot, {recursive: true});
});

after(async () => {
  const resolved = path.resolve(testDataRoot);
  assert.ok(resolved.startsWith(path.join(consoleRoot, 'data') + path.sep));
  await fs.rm(resolved, {recursive: true, force: true});
});

test('formal scenes, Graph IR, and shot manifest import as one deterministic planning bundle', async () => {
  const projectId = 'formal-plan';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  await createFormalFixture(formalRoot, projectId);

  const options = {
    formalRoot,
    workspaceRoot: consoleRoot,
    projectId,
    workbenchRevision: 3,
  };
  const first = await planning.importFormalPlanningBundle(options);
  const second = await planning.importFormalPlanningBundle(options);

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'autovideo-planning-bundle/v1');
  assert.equal(first.workbenchRevision, 3);
  assert.equal(first.provenance.mode, 'formal-project-import');
  assert.match(first.provenance.inputs.storyboard.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.storyboard.scenes.length, 1);
  assert.equal(first.graphIr.graphs.length, 1);
  assert.equal(first.shotManifest.shots.length, 1);
  assert.equal(planning.diagramGraphsFromPlanningBundle(first)[0].source, 'graph-ir');
  await assert.doesNotReject(() => planning.assertPlanningProvenanceCurrent(first, consoleRoot));
});

test('formal input changes make imported planning provenance stale', async () => {
  const projectId = 'stale-formal-plan';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  const fixture = await createFormalFixture(formalRoot, projectId);
  const bundle = await planning.importFormalPlanningBundle({
    formalRoot,
    workspaceRoot: consoleRoot,
    projectId,
    workbenchRevision: 1,
  });
  fixture.graphIr.purpose = 'changed after import';
  await writeJson(path.join(formalRoot, 'plan', 'graph-ir.json'), fixture.graphIr);

  await assert.rejects(
    () => planning.assertPlanningProvenanceCurrent(bundle, consoleRoot),
    /provenance is stale/i,
  );
});

test('formal planning import rejects shot timings from an older final WAV alignment', async () => {
  const projectId = 'stale-shot-timing';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  await createFormalFixture(formalRoot, projectId);
  await writeJson(path.join(formalRoot, 'audio', 'alignment.json'), {
    schemaVersion: 'autovideo-alignment-locked/v1',
    narrationSha256: 'a'.repeat(64),
    cues: [{id: 'cue-001', text: '测试。', start: 0, end: 1.4}],
  });

  await assert.rejects(
    () => planning.importFormalPlanningBundle({
      formalRoot,
      workspaceRoot: consoleRoot,
      projectId,
      workbenchRevision: 1,
    }),
    /timing is stale/i,
  );
});

test('formal planning import rejects incomplete current cue coverage', async () => {
  const projectId = 'missing-current-cue';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  await createFormalFixture(formalRoot, projectId);
  await writeJson(path.join(formalRoot, 'audio', 'alignment.json'), {
    schemaVersion: 'autovideo-alignment-locked/v1',
    narrationSha256: 'a'.repeat(64),
    cues: [
      {id: 'cue-001', text: '测试。', start: 0, end: 1},
      {id: 'cue-002', text: '新增。', start: 1, end: 2},
    ],
  });

  await assert.rejects(
    () => planning.importFormalPlanningBundle({
      formalRoot,
      workspaceRoot: consoleRoot,
      projectId,
      workbenchRevision: 1,
    }),
    /cover every current alignment cue/i,
  );
});

test('timing rebase preserves approved semantic carriers while binding the current alignment', async () => {
  const projectId = 'semantic-timing-rebase';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  await createFormalFixture(formalRoot, projectId);
  const source = await planning.importFormalPlanningBundle({
    formalRoot,
    workspaceRoot: consoleRoot,
    projectId,
    workbenchRevision: 2,
  });
  source.shotManifest.shots[0].visualType = 'diagram';
  source.shotManifest.shots[0].screenText = {text: '保留摘要', type: 'generated-summary', sourceCueIds: ['cue-001']};
  source.planningDigestSha256 = planning.planningDigestSha256(source);
  const alignment = {
    schemaVersion: 'autovideo-alignment-locked/v1',
    durationSeconds: 1.4,
    lastEndSeconds: 1.4,
    cues: [{id: 'cue-001', text: '测试。', start: 0, end: 1.4}],
  };

  const rebased = planning.rebasePlanningBundleToAlignment({bundle: source, alignment, workbenchRevision: 3});

  assert.equal(rebased.workbenchRevision, 3);
  assert.equal(rebased.shotManifest.shots[0].end, 1.4);
  assert.equal(rebased.shotManifest.shots[0].duration, 1.4);
  assert.equal(rebased.shotManifest.shots[0].visualType, 'diagram');
  assert.equal(rebased.shotManifest.shots[0].screenText.text, '保留摘要');
  assert.equal(rebased.storyboard.scenes[0].timing.end, 1.4);
  assert.equal(rebased.provenance.mode, 'alignment-timing-rebase');
  assert.equal(source.shotManifest.shots[0].end, 1);
});

test('timing rebase rejects narration changes even when cue IDs are reused', async () => {
  const projectId = 'semantic-text-drift';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  await createFormalFixture(formalRoot, projectId);
  const source = await planning.importFormalPlanningBundle({
    formalRoot,
    workspaceRoot: consoleRoot,
    projectId,
    workbenchRevision: 1,
  });
  assert.throws(
    () => planning.rebasePlanningBundleToAlignment({
      bundle: source,
      alignment: {
        schemaVersion: 'autovideo-alignment-locked/v1',
        durationSeconds: 1,
        lastEndSeconds: 1,
        cues: [{id: 'cue-001', text: '已经改字。', start: 0, end: 1}],
      },
    }),
    /refuses changed narration/i,
  );
});

test('legacy beat drafts convert deterministically into formal scenes and Graph IR', () => {
  const options = {
    projectId: 'legacy-plan',
    workbenchRevision: 1,
    legacyStoryboard: legacyStoryboard(),
    provenance: {mode: 'workbench-generated', inputs: {}},
  };
  const first = planning.planningBundleFromLegacyBeats(options);
  const second = planning.planningBundleFromLegacyBeats(options);

  assert.deepEqual(first, second);
  assert.equal(first.storyboard.schemaVersion, 'autovideo-storyboard/v1');
  assert.equal(first.storyboard.scenes[0].id, 'scene-01');
  assert.deepEqual(first.storyboard.scenes[0].cueIds, ['cue-001', 'cue-002']);
  assert.equal(first.graphIr.graphs[0].edges[0].relation, 'hides');
  assert.equal(planning.diagramGraphsFromPlanningBundle(first).length, 1);
});

test('formal import rejects graph and shot references outside canonical storyboard scenes', async () => {
  const projectId = 'bad-formal-plan';
  const formalRoot = path.join(testDataRoot, 'formal', projectId);
  const fixture = await createFormalFixture(formalRoot, projectId);
  fixture.graphIr.graphs[0].sceneId = 'scene-missing';
  await writeJson(path.join(formalRoot, 'plan', 'graph-ir.json'), fixture.graphIr);

  await assert.rejects(
    () => planning.importFormalPlanningBundle({
      formalRoot,
      workspaceRoot: consoleRoot,
      projectId,
      workbenchRevision: 1,
    }),
    /unknown scene/i,
  );
});

test('manual planning edits advance bundle revision and refresh its digest', async () => {
  const projectId = 'planning-revision';
  await store.createProject(projectInput(projectId));
  const bundle = planning.planningBundleFromLegacyBeats({
    projectId,
    workbenchRevision: 1,
    legacyStoryboard: legacyStoryboard(),
    provenance: {mode: 'workbench-generated', inputs: {}},
  });
  const artifactPath = await store.saveArtifact(projectId, 'visual-plan', 'planning-bundle.json', bundle, 'json');
  await store.markStageGenerated(projectId, 'visual-plan', {artifactPath, artifactKind: 'json'});

  const edited = structuredClone(bundle);
  edited.storyboard.scenes[0].title = '人工调整后的标题';
  const project = await store.saveManualArtifact(projectId, 'visual-plan', JSON.stringify(edited), 'adjust title');
  const saved = JSON.parse((await store.readArtifact(projectId, 'visual-plan')).content);

  assert.equal(project.stages['visual-plan'].revision, 2);
  assert.equal(project.stages['visual-plan'].overrides.length, 1);
  assert.equal(saved.workbenchRevision, 2);
  assert.notEqual(saved.planningDigestSha256, bundle.planningDigestSha256);
  assert.doesNotThrow(() => planning.assertPlanningBundle(saved, projectId));
  assert.throws(
    () => planning.coercePlanningBundle({
      value: saved,
      projectId,
      workbenchRevision: 1,
      provenance: saved.provenance,
    }),
    /revision/i,
  );
});

test('schema names separate formal scenes from temporary workbench beats', async () => {
  const formalSchema = JSON.parse(await fs.readFile(path.join(consoleRoot, 'schemas', 'storyboard.schema.json'), 'utf8'));
  const beatSchema = JSON.parse(await fs.readFile(path.join(consoleRoot, 'schemas', 'storyboard-beats.schema.json'), 'utf8'));
  const bundleSchema = JSON.parse(await fs.readFile(path.join(consoleRoot, 'schemas', 'planning-bundle.schema.json'), 'utf8'));

  assert.equal(formalSchema.properties.schemaVersion.const, 'autovideo-storyboard/v1');
  assert.ok(formalSchema.required.includes('scenes'));
  assert.equal(beatSchema.properties.schemaVersion.const, 'autovideo-storyboard-beats/v1');
  assert.ok(beatSchema.required.includes('beats'));
  assert.equal(bundleSchema.properties.schemaVersion.const, 'autovideo-planning-bundle/v1');
});
