import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {buildCanonicalProbeEvidence} from '../canonicalize-probe.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');

for (const fixture of [
  {probePath: 'experiments/E17-data-proof-probe', recipeId: 'data-proof'},
  {probePath: 'experiments/E18-code-proof-probe', recipeId: 'code-proof'},
]) {
  test(`${fixture.recipeId} legacy probe can be revalidated into canonical evidence without human approval`, async () => {
    const result = await buildCanonicalProbeEvidence({workspaceRoot, probePath: fixture.probePath});
    assert.equal(result.evidence.schemaVersion, 'autovideo-motion-recipe-lifecycle-evidence/v1');
    assert.equal(result.evidence.recipeId, fixture.recipeId);
    assert.equal(result.evidence.probe.invariantAudit.passed, true);
    assert.equal(result.evidence.probe.hyperframesCheck.ok, true);
    assert.equal(result.evidence.probe.visualReview, null);
    assert.equal(result.receipt.humanReviewInvented, false);
    assert.equal(result.receipt.lifecycleMutationApplied, false);
    assert.ok(result.evidence.probe.officialReuseObserved.length > 0);
  });
}
