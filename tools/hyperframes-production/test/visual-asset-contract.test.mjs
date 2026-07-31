import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateVisualAssetContract} from '../lib/visual-asset-contract.mjs';

const mediaById = new Map([
  ['icon-workflow', {id: 'icon-workflow', type: 'icon'}],
  ['screen-a', {id: 'screen-a', type: 'image'}],
  ['screen-b', {id: 'screen-b', type: 'image'}],
]);
const ref = (assetId, role) => ({assetId, role, zone: 'content.right', required: true, sourceCueIds: ['cue-001']});

test('supporting icons never satisfy a primary visual carrier', () => {
  const result = evaluateVisualAssetContract({
    shot: {cueId: 'cue-001', visualType: 'evidence-image', assetRefs: [ref('icon-workflow', 'icon')]},
    mediaById,
  });
  assert.equal(result.supporting.length, 1);
  assert.equal(result.primary.length, 0);
  assert.equal(result.carrierSatisfied, false);
  assert.ok(result.issues.some((issue) => /supporting icons do not satisfy/i.test(issue)));
});

test('diagram keeps icons supporting while device screenshots use an interface primary', () => {
  const diagram = evaluateVisualAssetContract({
    shot: {cueId: 'cue-001', visualType: 'diagram', assetRefs: [ref('icon-workflow', 'icon')]},
    mediaById,
  });
  assert.deepEqual(diagram.issues, []);
  assert.equal(diagram.primary.length, 0);
  assert.equal(diagram.supporting.length, 1);

  const device = evaluateVisualAssetContract({
    shot: {cueId: 'cue-001', visualType: 'device-surface', assetRefs: [ref('screen-a', 'interface')]},
    mediaById,
  });
  assert.deepEqual(device.issues, []);
  assert.equal(device.primary.length, 1);
});

test('media comparison requires either zero or exactly two primary images', () => {
  const one = evaluateVisualAssetContract({
    shot: {cueId: 'cue-001', visualType: 'comparison', assetRefs: [ref('screen-a', 'evidence')]},
    mediaById,
  });
  assert.equal(one.carrierSatisfied, false);
  assert.ok(one.issues.some((issue) => /exactly two/i.test(issue)));

  const two = evaluateVisualAssetContract({
    shot: {cueId: 'cue-001', visualType: 'comparison', assetRefs: [ref('screen-a', 'evidence'), ref('screen-b', 'evidence')]},
    mediaById,
  });
  assert.deepEqual(two.issues, []);
  assert.equal(two.primary.length, 2);
});
