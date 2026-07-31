import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {validateSemanticSfxPlan} from '../schema/semantic-sfx-plan.validator.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const readJson = async (relativePath) => JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
const motionLibrary = await readJson('style-library/motion-library/knowledge-explainer-v1.json');
const sample = await readJson('style-library/examples/knowledge-explainer-sfx-plan.example.json');
const cloneSample = () => structuredClone(sample);
const codes = (errors) => new Set(errors.map((error) => error.code));

test('valid sparse semantic SFX sample passes', () => {
  assert.deepEqual(validateSemanticSfxPlan(cloneSample(), motionLibrary), []);
});

test('wrong camera scope is rejected', () => {
  const plan = cloneSample();
  plan.styleLock.cameraScope = 'full-frame';

  assert.ok(codes(validateSemanticSfxPlan(plan, motionLibrary)).has('style.lock'));
});

test('cue role not allowed by its motion recipe is rejected', () => {
  const plan = cloneSample();
  plan.cues[0].role = 'state-change';
  plan.cues[0].bindingRole = 'state-change';
  plan.cues[0].anchor = 'state-commit';

  assert.ok(codes(validateSemanticSfxPlan(plan, motionLibrary)).has('cue.recipeRole'));
});

test('excessive rolling density and short cue gaps are rejected', () => {
  const plan = cloneSample();
  plan.cues = Array.from({length: 7}, (_, index) => ({
    ...structuredClone(sample.cues[0]),
    id: `sfx-cue-${String(index + 1).padStart(3, '0')}`,
    timeSeconds: 6.2 + index * 0.4,
    sourceCueIds: [`cue-density-${index + 1}`],
  }));

  const errorCodes = codes(validateSemanticSfxPlan(plan, motionLibrary));
  assert.ok(errorCodes.has('cue.minGap'));
  assert.ok(errorCodes.has('cue.density'));
});

test('approved plans cannot retain unresolved bindings', () => {
  const plan = cloneSample();
  plan.status = 'approved';

  assert.ok(codes(validateSemanticSfxPlan(plan, motionLibrary)).has('plan.approvedResolved'));
});

test('resolved bindings accept descriptive canonical media-ledger IDs', () => {
  const plan = cloneSample();
  plan.bindings[0] = {
    ...plan.bindings[0],
    resolutionStatus: 'resolved',
    assetId: 'sfx-click-soft',
    path: '.media/audio/sfx/sfx-click-soft.mp3',
    sha256: 'a'.repeat(64),
    provider: 'local-library',
    licenseReceipt: 'style-library/assets/licenses/sfx.txt',
  };
  assert.ok(!codes(validateSemanticSfxPlan(plan, motionLibrary)).has('binding.assetId'));
});
