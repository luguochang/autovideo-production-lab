import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertGenericApprovalAllowed} from '../lib/approval-policy.mjs';

test('generic approval cannot bypass the final-preview checklist', () => {
  assert.throws(
    () => assertGenericApprovalAllowed('final-preview'),
    /five-item final-review endpoint/,
  );
});

test('generic approval cannot bypass pronunciation candidate listening', () => {
  assert.throws(
    () => assertGenericApprovalAllowed('pronunciation-review'),
    /dedicated in-context candidate listening endpoint/,
  );
});

test('generic approval cannot bypass voice A/B candidate promotion', () => {
  assert.throws(
    () => assertGenericApprovalAllowed('voice-final'),
    /dedicated A\/B candidate file listening/i,
  );
});

test('ordinary review stages remain eligible for generic approval', () => {
  assert.doesNotThrow(() => assertGenericApprovalAllowed('style-probe'));
});
