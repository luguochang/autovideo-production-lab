import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {
  evaluateMotionRecipeAccess,
  INTERNAL_FALLBACK_SCHEMA_VERSION,
  loadMotionRecipeAccessContext,
} from '../motion-lifecycle-gate.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const context = await loadMotionRecipeAccessContext({workspaceRoot});
const recipeRef = {
  libraryId: context.library.libraryId,
  libraryVersion: context.library.version,
  recipeId: 'keyword-handoff',
  version: '1.0.0',
};

const evaluate = ({ledger = context.ledger, projectId = 'project-a', internalFallbackRequest = null, ...extra} = {}) => (
  evaluateMotionRecipeAccess({
    ledger,
    library: context.library,
    ledgerBinding: context.ledgerBinding,
    libraryBinding: context.libraryBinding,
    projectId,
    recipeRefs: [recipeRef],
    internalFallbackRequest,
    ...extra,
  })
);

test('candidate recipes are rejected for full production', () => {
  const receipt = evaluate();
  assert.equal(receipt.authorized, false);
  assert.equal(receipt.access[0].lifecycleState, 'candidate');
  assert.equal(receipt.access[0].authorization, 'denied');
});

test('promoted-template recipes are authorized for any project', () => {
  const ledger = structuredClone(context.ledger);
  ledger.entries.find((entry) => entry.recipeId === recipeRef.recipeId).state = 'promoted-template';
  const receipt = evaluate({ledger, projectId: 'unrelated-project'});
  assert.equal(receipt.authorized, true);
  assert.equal(receipt.access[0].authorization, 'promoted-template');
});

test('approved-project authorization is limited to the recorded project', () => {
  const ledger = structuredClone(context.ledger);
  const entry = ledger.entries.find((item) => item.recipeId === recipeRef.recipeId);
  entry.state = 'approved-project';
  entry.projectApprovals = [{
    projectId: 'project-a',
    approvedBy: 'reviewer-a',
    approvedAt: '2026-07-21T00:00:00.000Z',
    styleSelection: {path: 'projects/project-a/style-selection.json', sha256: 'a'.repeat(64)},
    probeReceipt: {path: 'projects/project-a/probe.json', sha256: 'b'.repeat(64)},
  }];
  assert.equal(evaluate({ledger, projectId: 'project-a'}).authorized, true);
  assert.equal(evaluate({ledger, projectId: 'project-b'}).authorized, false);
});

test('feedback cannot promote or authorize a candidate recipe', () => {
  const receipt = evaluate({
    feedback: [{recipeId: recipeRef.recipeId, decision: 'reuse', reviewer: 'human-reviewer'}],
  });
  assert.equal(receipt.authorized, false);
  assert.equal(receipt.access[0].lifecycleState, 'candidate');
});

test('explicit internal fallback stays project-bound and publication-blocked', () => {
  const request = {
    schemaVersion: INTERNAL_FALLBACK_SCHEMA_VERSION,
    projectId: 'project-a',
    scope: 'internal-full-production',
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    requestedBy: 'internal-operator',
    requestedAt: '2026-07-21T00:10:00.000Z',
    reason: 'Produce an internal review render while the bounded recipe probe is pending.',
    recipeIds: [recipeRef.recipeId],
  };
  const receipt = evaluate({internalFallbackRequest: request});
  assert.equal(receipt.authorized, true);
  assert.equal(receipt.releasePolicy.internalFallbackUsed, true);
  assert.equal(receipt.releasePolicy.publicReleaseBlocked, true);
  assert.equal(receipt.access[0].authorization, 'internal-fallback');
  assert.throws(() => evaluate({projectId: 'project-b', internalFallbackRequest: request}), /project-bound/);
  assert.throws(
    () => evaluate({internalFallbackRequest: {...request, recipeIds: [recipeRef.recipeId, 'unused-recipe']}}),
    /exactly match/,
  );
  const retiredLedger = structuredClone(context.ledger);
  retiredLedger.entries.find((entry) => entry.recipeId === recipeRef.recipeId).state = 'retired';
  const retired = evaluate({ledger: retiredLedger, internalFallbackRequest: request});
  assert.equal(retired.authorized, false);
  assert.equal(retired.access[0].authorization, 'denied');
});
