import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recommendSemanticSfxAssets,
  resolvedSemanticSfxBinding,
} from '../lib/resolve-semantic-sfx-bindings.mjs';

const plan = {
  bindings: [
    {role: 'focus-hit', intent: 'quiet focus tick', resolutionStatus: 'unresolved'},
    {role: 'connector-draw', intent: 'quiet connector accent', resolutionStatus: 'unresolved'},
  ],
  cues: [
    {bindingRole: 'focus-hit', motionRecipeId: 'keyword-handoff'},
    {bindingRole: 'connector-draw', motionRecipeId: 'diagram-build'},
  ],
};

const assets = [
  {
    id: 'sfx-pop', type: 'sfx', status: 'available', durationSeconds: 0.72,
    description: 'Small pop', semanticRoles: ['focus-hit'], recipeIds: ['keyword-handoff'],
    sourceReady: true, sourceShaMatches: true,
  },
  {
    id: 'sfx-click-soft', type: 'sfx', status: 'available', durationSeconds: 0.37,
    description: 'Quiet click tick', semanticRoles: ['focus-hit', 'state-change'], recipeIds: ['keyword-handoff'],
    sourceReady: true, sourceShaMatches: true,
  },
  {
    id: 'sfx-whoosh-short', type: 'sfx', status: 'available', durationSeconds: 0.57,
    description: 'Short line draw whoosh', semanticRoles: ['connector-draw'], recipeIds: ['diagram-build'],
    sourceReady: true, sourceShaMatches: true,
  },
];

test('semantic roles resolve deterministically to compatible frozen library SFX', () => {
  const recommendations = recommendSemanticSfxAssets({plan, assets});
  assert.deepEqual(recommendations.map((item) => [item.role, item.assetId]), [
    ['focus-hit', 'sfx-click-soft'],
    ['connector-draw', 'sfx-whoosh-short'],
  ]);
  assert.ok(recommendations.every((item) => item.recipeMatches.length === 1));
});

test('resolved bindings preserve descriptive canonical media-ledger IDs', () => {
  const binding = resolvedSemanticSfxBinding({
    binding: plan.bindings[0],
    record: {
      id: 'sfx-click-soft',
      type: 'sfx',
      path: '.media/audio/sfx/sfx-click-soft.mp3',
      sha256: 'a'.repeat(64),
      provider: 'bundled-sfx',
      licenseReceipt: 'license.txt',
    },
  });
  assert.equal(binding.assetId, 'sfx-click-soft');
  assert.equal(binding.resolutionStatus, 'resolved');
  assert.equal(binding.provider, 'bundled-sfx');
});

test('missing or unverified central assets stay unresolved', () => {
  const recommendations = recommendSemanticSfxAssets({
    plan,
    assets: [{...assets[0], sourceShaMatches: false}],
  });
  assert.ok(recommendations.every((item) => item.status === 'unresolved'));
});
