import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, test} from 'node:test';
import {primaryCarrierEvidenceSha256} from '../../tools/planning-contract/primary-carrier-adapters.mjs';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const root = path.join(consoleRoot, 'data', `visual-variety-qa-test-${process.pid}`);
const {buildVisualVarietyQa} = await import('../lib/generators.mjs');

const makeShot = (index, visualType, recipeId) => ({
  cueId: `cue-${String(index + 1).padStart(3, '0')}`,
  sceneId: index < 3 ? 'scene-01' : 'scene-02',
  narration: '这是一段足够长的测试口播，用来验证屏幕摘要不会照抄整句内容。',
  screenText: {text: `摘要 ${index + 1}`, type: 'generated-summary'},
  visualType,
  motionRecipeRefs: [{recipeId}],
  assetRefs: [],
  sfxRefs: [],
});

const illustrativeAdapter = (shot, adapterId) => {
  const common = {
    adapterId,
    adapterVersion: '1.0.0',
    zone: 'content.right',
    sourceCueIds: [shot.cueId],
    evidence: {status: 'illustrative-mock', label: 'Narration logic mock'},
  };
  if (adapterId === 'code-surface-bounded') return {
    ...common,
    sourceReceipt: 'hf-registry:code-diff+code-highlight@5356890f+2e28ffdb',
    data: {
      title: 'Pseudo flow', language: 'pseudocode', mode: 'highlight',
      lines: [{kind: 'context', text: 'SOURCE: cue'}, {kind: 'focus', text: 'CHECK: evidence'}],
    },
  };
  return {
    ...common,
    sourceReceipt: 'hf-registry:app-showcase@c7e1b4d8ec2a2c1f',
    data: {
      title: 'State flow', productLabel: 'RAG workflow', activeState: 1,
      states: [{label: 'INPUT', rows: ['source']}, {label: 'OUTPUT', rows: ['result']}],
    },
  };
};

const fixture = async (name, shots) => {
  const formalRoot = path.join(root, name);
  await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});
  const storyboard = {
    scenes: [
      {id: 'scene-01', graphRefs: ['graph-scene-01']},
      {id: 'scene-02', graphRefs: ['graph-scene-02']},
    ],
  };
  const graphIr = {graphs: [{id: 'graph-scene-01'}, {id: 'graph-scene-02'}]};
  await Promise.all([
    fs.writeFile(path.join(formalRoot, 'plan', 'shot-manifest.json'), `${JSON.stringify({shots})}\n`, 'utf8'),
    fs.writeFile(path.join(formalRoot, 'plan', 'storyboard.json'), `${JSON.stringify(storyboard)}\n`, 'utf8'),
    fs.writeFile(path.join(formalRoot, 'plan', 'graph-ir.json'), `${JSON.stringify(graphIr)}\n`, 'utf8'),
  ]);
  return formalRoot;
};

after(() => fs.rm(root, {recursive: true, force: true}));

test('visual variety QA accepts a short explainer with three semantic carriers and recipes', async () => {
  const shots = [
    makeShot(0, 'keyword', 'keyword-handoff'),
    makeShot(1, 'diagram', 'diagram-build'),
    makeShot(2, 'keyword', 'keyword-handoff'),
    makeShot(3, 'comparison', 'comparison-split'),
    makeShot(4, 'diagram', 'diagram-build'),
    makeShot(5, 'keyword', 'keyword-handoff'),
  ];
  const formalRoot = await fixture('valid', shots);
  const result = await buildVisualVarietyQa({formalRoot, projectId: 'variety-valid'});
  assert.equal(result.machine.status, 'passed');
  assert.equal(result.machine.uniqueVisualTypes, 3);
  assert.equal(result.machine.uniqueRecipes, 3);
  assert.equal(result.machine.nonKeywordCount, 3);
  assert.ok(result.machine.warnings.some((item) => /supporting asset/i.test(item)));
  assert.equal(result.fixedBrandShell.background, '#F2DFC7');
});

test('visual variety QA blocks keyword-only repeated PPT treatment', async () => {
  const shots = Array.from({length: 6}, (_, index) => makeShot(index, 'keyword', 'keyword-handoff'));
  const formalRoot = await fixture('invalid', shots);
  const result = await buildVisualVarietyQa({formalRoot, projectId: 'variety-invalid'});
  assert.equal(result.machine.status, 'failed');
  assert.ok(result.machine.errors.some((item) => /visual type|non-keyword|dominates|consecutive/i.test(item)));
});

test('visual variety QA accepts an adapter-backed carrier only when its verified claim receipt is current', async () => {
  const claim = {id: 'claim-chart', evidenceStatus: 'verified', text: 'Measured comparison'};
  const shots = [
    makeShot(0, 'keyword', 'keyword-handoff'),
    makeShot(1, 'data-proof', 'data-proof'),
    makeShot(2, 'diagram', 'diagram-build'),
    makeShot(3, 'comparison', 'comparison-split'),
    makeShot(4, 'diagram', 'diagram-build'),
    makeShot(5, 'keyword', 'keyword-handoff'),
  ];
  shots[1].carrierPayload = {
    adapterId: 'data-chart-bounded', adapterVersion: '1.0.0', zone: 'content.right',
    sourceReceipt: 'hf-registry:data-chart@02ccb24bfa21850d', sourceCueIds: [shots[1].cueId],
    evidence: {status: 'verified', label: 'Verified comparison', receipt: {kind: 'claim', id: claim.id, sha256: primaryCarrierEvidenceSha256(claim)}},
    data: {title: 'Comparison', series: [{label: 'Before', value: 30}, {label: 'After', value: 70}]},
  };
  const formalRoot = await fixture('adapter-valid', shots);
  await fs.mkdir(path.join(formalRoot, 'input'), {recursive: true});
  await fs.writeFile(path.join(formalRoot, 'input', 'claim-ledger.json'), `${JSON.stringify({claims: [claim]})}\n`, 'utf8');
  const passed = await buildVisualVarietyQa({formalRoot, projectId: 'adapter-valid'});
  assert.equal(passed.machine.status, 'passed');
  assert.equal(passed.machine.adapterBackedCount, 1);
  assert.equal(passed.machine.verifiedAdapterBackedCount, 1);

  shots[1].carrierPayload.evidence.receipt.sha256 = 'f'.repeat(64);
  await fs.writeFile(path.join(formalRoot, 'plan', 'shot-manifest.json'), `${JSON.stringify({shots})}\n`, 'utf8');
  const drifted = await buildVisualVarietyQa({formalRoot, projectId: 'adapter-valid'});
  assert.equal(drifted.machine.status, 'failed');
  assert.ok(drifted.machine.errors.some((item) => /SHA-256 drifted/i.test(item)));
});

test('visual variety QA accepts labeled illustrative code and device surfaces without treating them as verified evidence', async () => {
  const shots = [
    makeShot(0, 'keyword', 'keyword-handoff'),
    makeShot(1, 'device-surface', 'device-surface-tour'),
    makeShot(2, 'diagram', 'diagram-build'),
    makeShot(3, 'comparison', 'comparison-split'),
    makeShot(4, 'code-surface', 'code-proof'),
    makeShot(5, 'keyword', 'keyword-handoff'),
  ];
  shots[1].carrierPayload = illustrativeAdapter(shots[1], 'device-surface-bounded');
  shots[4].carrierPayload = illustrativeAdapter(shots[4], 'code-surface-bounded');
  const formalRoot = await fixture('illustrative-adapters', shots);
  const result = await buildVisualVarietyQa({formalRoot, projectId: 'illustrative-adapters'});
  assert.equal(result.machine.status, 'passed');
  assert.equal(result.machine.adapterBackedCount, 2);
  assert.equal(result.machine.illustrativeAdapterBackedCount, 2);
  assert.equal(result.machine.verifiedAdapterBackedCount, 0);
  assert.ok(result.machine.warnings.some((item) => /not verified evidence/i.test(item)));
});

test('visual variety QA enforces graph, asset, summary, and recipe bindings per cue', async () => {
  const shots = [
    makeShot(0, 'keyword', 'keyword-handoff'),
    makeShot(1, 'diagram', 'diagram-build'),
    makeShot(2, 'comparison', 'comparison-split'),
    makeShot(3, 'evidence-image', 'evidence-pivot'),
    makeShot(4, 'diagram', 'diagram-build'),
    makeShot(5, 'keyword', 'keyword-handoff'),
  ];
  shots[1].sceneId = 'scene-without-graph';
  shots[2].screenText.text = shots[2].narration;
  shots[5].motionRecipeRefs = [];
  const formalRoot = await fixture('invalid-bindings', shots);
  const result = await buildVisualVarietyQa({formalRoot, projectId: 'variety-invalid-bindings'});
  assert.equal(result.machine.status, 'failed');
  assert.ok(result.machine.errors.some((item) => /diagram without a valid Graph IR reference/i.test(item)));
  assert.ok(result.machine.errors.some((item) => /evidence-image without a frozen asset reference/i.test(item)));
  assert.ok(result.machine.errors.some((item) => /screen text repeats too much of the narration/i.test(item)));
  assert.ok(result.machine.errors.some((item) => /has no motion recipe/i.test(item)));
});
