import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  evaluatePrimaryCarrierPayload,
  primaryCarrierEvidenceSha256,
  verifyPrimaryCarrierProjectEvidence,
} from '../../planning-contract/primary-carrier-adapters.mjs';
import {evaluateVisualAssetContract} from '../lib/visual-asset-contract.mjs';

const base = (adapterId, visualType, data, evidence = {status: 'verified', label: '本地核验', receipt: {kind: 'claim', id: 'claim-fixture', sha256: 'a'.repeat(64)}}) => ({
  adapterId,
  adapterVersion: '1.0.0',
  zone: 'content.right',
  sourceReceipt: adapterId === 'data-chart-bounded'
    ? 'hf-registry:data-chart@02ccb24bfa21850d'
    : adapterId === 'code-surface-bounded'
      ? 'hf-registry:code-diff+code-highlight@5356890f+2e28ffdb'
      : 'hf-registry:app-showcase@c7e1b4d8ec2a2c1f',
  sourceCueIds: ['cue-001'],
  evidence,
  data,
});

test('verified evidence binds an eligible project entity and detects SHA drift', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carrier-evidence-'));
  const claim = {id: 'claim-fixture', evidenceStatus: 'verified', text: 'Measured result'};
  const payload = base('data-chart-bounded', 'data-proof', {
    title: 'Result', series: [{label: 'Before', value: 30}, {label: 'After', value: 70}],
  }, {status: 'verified', label: 'Verified claim', receipt: {kind: 'claim', id: claim.id, sha256: primaryCarrierEvidenceSha256(claim)}});
  await fs.mkdir(path.join(projectDir, 'input'), {recursive: true});
  await fs.writeFile(path.join(projectDir, 'input', 'claim-ledger.json'), JSON.stringify({claims: [claim]}));
  await assert.doesNotReject(verifyPrimaryCarrierProjectEvidence({projectDir, shots: [{cueId: 'cue-001', visualType: 'data-proof', carrierPayload: payload}], mediaLedger: {records: []}}));
  payload.evidence.receipt.sha256 = 'b'.repeat(64);
  await assert.rejects(verifyPrimaryCarrierProjectEvidence({projectDir, shots: [{cueId: 'cue-001', visualType: 'data-proof', carrierPayload: payload}], mediaLedger: {records: []}}), /SHA-256 drifted/);
  await fs.rm(projectDir, {recursive: true, force: true});
});

test('bounded data adapter accepts local structured data and rejects remote URLs', () => {
  const payload = base('data-chart-bounded', 'data-proof', {
    title: '处理耗时', unit: '%', highlightIndex: 1,
    series: [{label: '模型', value: 30}, {label: '接口', value: 70}],
  });
  assert.equal(evaluatePrimaryCarrierPayload({visualType: 'data-proof', carrierPayload: payload}).valid, true);
  const remote = structuredClone(payload);
  remote.data.title = 'https://example.com';
  assert.equal(evaluatePrimaryCarrierPayload({visualType: 'data-proof', carrierPayload: remote}).valid, false);
});

test('code and device adapters require bounded payload shapes', () => {
  const code = base('code-surface-bounded', 'code-surface', {
    title: '权限检查', language: 'TypeScript', mode: 'diff',
    lines: [{kind: 'context', text: 'const result = await run()'}, {kind: 'focus', text: 'if (!result.ok) return rollback()'}],
  });
  const device = base('device-surface-bounded', 'device-surface', {
    title: '状态面板', productLabel: '项目工作台', activeState: 0,
    states: [{label: '输入', rows: ['素材登记']}, {label: '输出', rows: ['成片检查']}],
  }, {status: 'illustrative-mock', label: '示意工作台'});
  assert.equal(evaluatePrimaryCarrierPayload({visualType: 'code-surface', carrierPayload: code}).valid, true);
  const deviceResult = evaluatePrimaryCarrierPayload({visualType: 'device-surface', carrierPayload: device});
  assert.equal(deviceResult.valid, true);
  assert.equal(deviceResult.verified, false);
  const visual = evaluateVisualAssetContract({shot: {cueId: 'cue-001', visualType: 'device-surface', carrierPayload: device, assetRefs: []}, mediaById: new Map()});
  assert.equal(visual.carrierSatisfied, true);
  assert.equal(visual.illustrativeAdapterSatisfied, true);

  const unverifiedData = base('data-chart-bounded', 'data-proof', {
    title: 'Unverified result',
    series: [{label: 'Before', value: 30}, {label: 'After', value: 70}],
  }, {status: 'illustrative-mock', label: 'Unverified data'});
  const unverifiedDataVisual = evaluateVisualAssetContract({
    shot: {cueId: 'cue-001', visualType: 'data-proof', carrierPayload: unverifiedData, assetRefs: []},
    mediaById: new Map(),
  });
  assert.equal(unverifiedDataVisual.carrierSatisfied, false);
  assert.equal(unverifiedDataVisual.illustrativeAdapterSatisfied, false);
});

