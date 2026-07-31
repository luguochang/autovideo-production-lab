import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pronunciationGateAction, standardJobAction, standardStageAction} from '../../scripts/standard-run-policy.mjs';

test('standard delivery continues through an automatically approved acronym-only pronunciation gate', () => {
  assert.equal(pronunciationGateAction({status: 'approved', approvalScope: 'machine-no-subjective-terms'}), 'continue');
});

test('standard delivery pauses normally at a subjective pronunciation review gate', () => {
  assert.equal(pronunciationGateAction({status: 'needs-review'}), 'wait-for-human');
  assert.equal(pronunciationGateAction({status: 'not-started'}), 'generate-or-resume');
});

test('standard stage policy never synthesizes a human approval', () => {
  assert.deepEqual(standardStageAction({stage: {status: 'needs-review'}, definition: {humanGate: true}}), {
    action: 'wait-for-human',
    reason: 'generated artifact requires explicit human review',
  });
  assert.equal(standardStageAction({stage: {status: 'needs-review'}, definition: {humanGate: false}}).action, 'blocked');
});

test('standard stage policy resumes persistent jobs and fails closed on missing job ids', () => {
  assert.deepEqual(standardStageAction({stage: {status: 'running', jobId: 'job-001'}, definition: {humanGate: false}}), {
    action: 'resume-job',
    reason: 'persistent job is still active',
    jobId: 'job-001',
  });
  assert.equal(standardStageAction({stage: {status: 'running', jobId: null}, definition: {humanGate: false}}).action, 'blocked');
  for (const status of ['not-started', 'stale', 'failed', 'canceled']) {
    assert.equal(standardStageAction({stage: {status}, definition: {humanGate: false}}).action, 'generate');
  }
});

test('standard job policy separates resumable, operator, terminal, and unknown states', () => {
  for (const status of ['queued', 'running', 'cancel-requested']) {
    assert.equal(standardJobAction({status}).action, 'wait');
  }
  assert.equal(standardJobAction({status: 'paused'}).action, 'wait-for-operator');
  assert.equal(standardJobAction({status: 'complete'}).action, 'complete');
  assert.equal(standardJobAction({status: 'failed', error: 'fixture failure'}).reason, 'fixture failure');
  assert.equal(standardJobAction({status: 'canceled'}).action, 'failed');
  assert.equal(standardJobAction({status: 'unknown'}).action, 'blocked');
});
