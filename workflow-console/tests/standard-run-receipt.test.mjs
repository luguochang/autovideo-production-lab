import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {
  createStandardRunReceipt,
  readLatestStandardRunReceipt,
  updateStandardRunReceipt,
  writeStandardRunReceipt,
} from '../../scripts/standard-run-receipt.mjs';

const project = (overrides = {}) => ({
  id: 'standard-run-receipt',
  route: 'script',
  formalProjectPath: null,
  contentIntake: {payload: {sha256: 'a'.repeat(64)}},
  stages: {
    'visual-plan': {status: 'running', revision: 1, artifactSha256: null, approvedArtifactSha256: null, approvalScope: null, jobId: 'job-plan'},
    'full-production': {status: 'not-started', revision: 0, artifactSha256: null, approvedArtifactSha256: null, approvalScope: null, jobId: null},
    'render-deliver': {status: 'not-started', revision: 0, artifactSha256: null, approvedArtifactSha256: null, approvalScope: null, jobId: null},
  },
  ...overrides,
});

test('standard run receipt binds stage state and only finishes at a terminal run state', () => {
  const activeStageIds = ['visual-plan', 'full-production', 'render-deliver'];
  const receipt = createStandardRunReceipt({project: project(), activeStageIds, runId: 'run-001', startedAt: '2026-01-01T00:00:00.000Z'});
  assert.equal(receipt.finishedAt, null);
  assert.equal(receipt.policy.autoApproveHumanGates, false);
  assert.equal(receipt.policy.microphoneUsed, false);

  const running = updateStandardRunReceipt(receipt, {
    project: project(),
    currentStageId: 'visual-plan',
    updatedAt: '2026-01-01T00:00:01.000Z',
  });
  assert.equal(running.finishedAt, null);
  const changedProject = project({stages: {
    ...project().stages,
    'visual-plan': {status: 'approved', revision: 2, artifactSha256: 'b'.repeat(64), approvedArtifactSha256: 'b'.repeat(64), approvalScope: 'machine', jobId: null},
  }});
  const waiting = updateStandardRunReceipt(running, {
    project: changedProject,
    status: 'waiting-for-human',
    currentStageId: 'full-production',
    updatedAt: '2026-01-01T00:00:02.000Z',
  });
  assert.equal(waiting.finishedAt, '2026-01-01T00:00:02.000Z');
  assert.notEqual(waiting.projectStateSha256, receipt.projectStateSha256);
});

test('standard run receipts are atomically persisted as latest and run history', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-standard-run-'));
  t.after(() => fs.rm(projectDir, {recursive: true, force: true}));
  const receipt = createStandardRunReceipt({project: project(), activeStageIds: ['visual-plan'], runId: 'run-history'});
  const paths = await writeStandardRunReceipt({projectDir, receipt});
  assert.deepEqual(await readLatestStandardRunReceipt(projectDir), receipt);
  assert.deepEqual(JSON.parse(await fs.readFile(paths.historyPath, 'utf8')), receipt);
  assert.equal(path.basename(paths.latestPath), 'STANDARD_RUN_RECEIPT.json');
});

test('a restarted run references an unfinished prior receipt without rewriting it complete', async () => {
  const previous = createStandardRunReceipt({project: project(), activeStageIds: ['visual-plan'], runId: 'run-interrupted'});
  const resumed = createStandardRunReceipt({project: project(), activeStageIds: ['visual-plan'], runId: 'run-resumed', resumesRunId: previous.runId});
  assert.equal(previous.status, 'running');
  assert.equal(previous.finishedAt, null);
  assert.equal(resumed.resumesRunId, 'run-interrupted');
});
