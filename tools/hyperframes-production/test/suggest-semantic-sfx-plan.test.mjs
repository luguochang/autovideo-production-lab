import assert from 'node:assert/strict';
import test from 'node:test';
import motionLibrary from '../../../style-library/motion-library/knowledge-explainer-v1.json' with {type: 'json'};
import {validateSemanticSfxPlan} from '../../../style-library/schema/semantic-sfx-plan.validator.mjs';
import {suggestSemanticSfxPlan, suggestedSemanticSfxCount} from '../lib/suggest-semantic-sfx-plan.mjs';

const recipeIds = ['keyword-handoff', 'diagram-build', 'comparison-split', 'evidence-pivot', 'data-proof', 'code-proof'];
const shots = Array.from({length: 12}, (_, index) => {
  const recipeId = recipeIds[index % recipeIds.length];
  return {
    cueId: `cue-${String(index + 1).padStart(3, '0')}`,
    start: index * 10,
    end: index * 10 + 10,
    motionRecipeRefs: [{recipeId}],
  };
});

test('long-form suggestions stay sparse, varied, sorted, and schema-valid', () => {
  const plan = suggestSemanticSfxPlan({
    projectId: 'batch-fixture',
    durationSeconds: 120,
    shots,
    motionLibrary,
  });
  assert.equal(plan.status, 'candidate');
  assert.equal(plan.cues.length, suggestedSemanticSfxCount(120));
  assert.ok(plan.cues.length >= 4 && plan.cues.length <= 6);
  assert.ok(new Set(plan.cues.map((cue) => cue.motionRecipeId)).size >= 3);
  assert.deepEqual([...plan.cues].sort((left, right) => left.timeSeconds - right.timeSeconds), plan.cues);
  assert.equal(plan.policy.mix.narrationGainChangeDb, 0);
  assert.equal(validateSemanticSfxPlan(plan, motionLibrary).length, 0);
});

test('existing resolved bindings are preserved instead of inventing a new asset', () => {
  const existing = {
    role: 'state-change',
    intent: 'approved click',
    resolutionStatus: 'resolved',
    manifestPath: '.media/manifest.jsonl',
    mediaType: 'sfx',
    assetId: 'sfx_001',
    path: '.media/audio/sfx/sfx_001.mp3',
    sha256: 'a'.repeat(64),
    provider: 'fixture',
    licenseReceipt: 'fixture license',
  };
  const plan = suggestSemanticSfxPlan({
    projectId: 'binding-fixture',
    durationSeconds: 70,
    shots: shots.filter((shot) => shot.motionRecipeRefs[0].recipeId === 'comparison-split'),
    motionLibrary,
    existingBindings: [existing],
  });
  assert.deepEqual(plan.bindings.find((binding) => binding.role === 'state-change'), existing);
});

test('short videos receive one to three suggestions without forcing noise', () => {
  assert.equal(suggestedSemanticSfxCount(8), 1);
  assert.equal(suggestedSemanticSfxCount(35), 2);
  assert.equal(suggestedSemanticSfxCount(59), 3);
});
