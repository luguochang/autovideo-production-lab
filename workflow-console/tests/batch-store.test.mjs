import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const testDataRoot = path.join(consoleRoot, 'data', `batch-store-test-${process.pid}`);
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = testDataRoot;

const {
  createProject,
  deleteProject,
  recordVisualAssetCandidateDecision,
} = await import('../lib/project-store.mjs');
const {
  batchMetrics,
  createBatch,
  deleteBatch,
  getBatch,
  recordBatchRun,
  setBatchStatus,
  summarizeActiveOverrides,
  summarizeProjectReadiness,
  planNextHumanGate,
  updateBatch,
  updateBatchRun,
} = await import('../lib/batch-store.mjs');
const {createJobRecord, updateJobRecord} = await import('../lib/project-store.mjs');
const {stageAppliesToProject, workflowStages} = await import('../workflow-catalog.mjs');

const projectInput = (id) => ({
  id,
  title: `Batch metrics ${id}`,
  route: 'script',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'verify batch metrics',
  automation: 'critical-gates',
  publicationRights: 'needs-review',
  rightsNotes: '',
});

after(async () => {
  const resolved = path.resolve(testDataRoot);
  assert.ok(resolved.startsWith(path.join(consoleRoot, 'data') + path.sep));
  await fs.rm(resolved, {recursive: true, force: true});
});

test('batch records persist project scope, priority, status, and empty candidate metrics', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `batch-project-${suffix}`;
  const batchId = `batch-test-${suffix}`;
  t.after(() => deleteBatch(batchId).catch(() => undefined));
  t.after(() => deleteProject(projectId).catch(() => undefined));

  await createProject(projectInput(projectId));
  const created = await createBatch({
    id: batchId,
    title: 'Batch store test',
    projectIds: [projectId],
    stageId: 'full-production',
    priority: 80,
  });
  assert.equal(created.status, 'draft');
  assert.equal(created.priority, 80);
  assert.deepEqual(created.projectIds, [projectId]);

  const paused = await setBatchStatus(batchId, 'paused');
  assert.equal(paused.status, 'paused');
  const metrics = await batchMetrics(batchId);
  assert.equal(metrics.batchId, batchId);
  assert.equal(metrics.totalProjects, 1);
  assert.equal(metrics.totalJobs, 0);
  assert.equal(metrics.visualCandidateDecisionCount, 0);
  assert.equal(metrics.visualCandidateAdoptionCount, 0);
  assert.equal(metrics.visualCandidateRejectionCount, 0);
  assert.equal((await getBatch(batchId)).status, 'paused');
});

test('batch metrics aggregate visual candidate adoption and rejection events across projects', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectIds = [`batch-candidate-a-${suffix}`, `batch-candidate-b-${suffix}`];
  const batchId = `batch-candidate-metrics-${suffix}`;
  t.after(() => deleteBatch(batchId).catch(() => undefined));
  for (const projectId of projectIds) {
    t.after(() => deleteProject(projectId).catch(() => undefined));
    await createProject(projectInput(projectId));
  }
  await createBatch({
    id: batchId,
    title: 'Visual candidate metrics test',
    projectIds,
    stageId: 'full-production',
    priority: 50,
  });

  await recordVisualAssetCandidateDecision(projectIds[0], {
    candidateId: 'visual-cue-001',
    assetId: 'icon-system-layers',
    decision: 'adopted',
    candidateDigestSha256: 'a'.repeat(64),
    revision: 1,
  });
  await recordVisualAssetCandidateDecision(projectIds[1], {
    candidateId: 'visual-cue-002',
    assetId: 'icon-click-pointer',
    decision: 'rejected',
    candidateDigestSha256: 'b'.repeat(64),
    revision: 1,
  });

  const metrics = await batchMetrics(batchId);
  assert.equal(metrics.visualCandidateDecisionCount, 2);
  assert.equal(metrics.visualCandidateAdoptionCount, 1);
  assert.equal(metrics.visualCandidateRejectionCount, 1);
});

test('batch run receipts persist a resumable plan and latest-run errors', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `batch-run-project-${suffix}`;
  const batchId = `batch-run-${suffix}`;
  t.after(() => deleteBatch(batchId).catch(() => undefined));
  t.after(() => deleteProject(projectId).catch(() => undefined));
  await createProject(projectInput(projectId));
  await createBatch({id: batchId, title: 'Run receipt', projectIds: [projectId], stageId: 'full-production', priority: 50});
  const run = await recordBatchRun(batchId, {
    runId: 'run-001',
    stageId: 'full-production',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'failed',
    plan: [{projectId, action: 'blocked', reason: 'needs review'}],
    errors: [{projectId, stageId: 'full-production', error: 'needs review'}],
  });
  assert.equal(run.runCount, 1);
  assert.equal(run.lastRun.runId, 'run-001');
  assert.equal(run.lastRun.plan[0].action, 'blocked');
  assert.equal(run.lastRunErrors.length, 1);
  const metrics = await batchMetrics(batchId);
  assert.equal(metrics.runCount, 1);
  assert.equal(metrics.lastRun.status, 'failed');
});

test('batch run receipt records a finish time only after reaching a terminal state', async (t) => {
  const suffix = `${process.pid}-${Date.now()}-timestamps`;
  const projectId = `batch-run-timestamps-project-${suffix}`;
  const batchId = `batch-run-timestamps-${suffix}`;
  t.after(() => deleteBatch(batchId).catch(() => undefined));
  t.after(() => deleteProject(projectId).catch(() => undefined));
  await createProject(projectInput(projectId));
  await createBatch({id: batchId, title: 'Run timestamps', projectIds: [projectId], stageId: 'next-human-gate', priority: 50});
  const running = await recordBatchRun(batchId, {
    runId: 'run-timestamps',
    stageId: 'next-human-gate',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    plan: [],
    errors: [],
  });
  assert.equal(running.lastRun.finishedAt, null);
  const stillRunning = await updateBatchRun(batchId, 'run-timestamps', {status: 'running', plan: [{projectId, action: 'queue'}]});
  assert.equal(stillRunning.lastRun.finishedAt, null);
  const waiting = await updateBatchRun(batchId, 'run-timestamps', {status: 'waiting-human'});
  assert.match(waiting.lastRun.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('batch metrics count the latest logical retry once and include legacy job ids', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `batch-retry-project-${suffix}`;
  const batchId = `batch-retry-${suffix}`;
  t.after(() => deleteBatch(batchId).catch(() => undefined));
  t.after(() => deleteProject(projectId).catch(() => undefined));
  await createProject(projectInput(projectId));
  const batch = await createBatch({id: batchId, title: 'Retry metrics', projectIds: [projectId], stageId: 'full-production', priority: 50});
  const logical = 'stage:legacy:full-production:' + 'd'.repeat(64);
  await createJobRecord({id: 'legacy-old', projectId, stageId: 'full-production', status: 'failed', attempt: 1, createdAt: '2026-01-01T00:00:00.000Z', idempotencyKey: logical, inputSha256: 'd'.repeat(64), batchId: null});
  await createJobRecord({id: 'legacy-new', projectId, stageId: 'full-production', status: 'complete', attempt: 2, createdAt: '2026-01-01T00:01:00.000Z', idempotencyKey: logical, inputSha256: 'd'.repeat(64), batchId: null});
  await updateBatch(batch.id, {jobIds: ['legacy-old', 'legacy-new']});
  const metrics = await batchMetrics(batchId);
  assert.equal(metrics.latestJobCount, 1);
  assert.equal(metrics.completedJobs, 1);
  assert.equal(metrics.failedJobs, 0);
  assert.equal(metrics.retryCount, 1);
});

test('batch metrics count only the latest decision for one candidate revision chain', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `batch-candidate-revision-${suffix}`;
  const batchId = `batch-candidate-revision-metrics-${suffix}`;
  t.after(() => deleteBatch(batchId).catch(() => undefined));
  t.after(() => deleteProject(projectId).catch(() => undefined));
  await createProject(projectInput(projectId));
  await createBatch({id: batchId, title: 'Latest candidate decision', projectIds: [projectId], stageId: 'full-production', priority: 50});
  const identity = {
    candidateId: 'visual-cue-001',
    assetId: 'icon-system-layers',
    candidateDigestSha256: 'c'.repeat(64),
  };
  await recordVisualAssetCandidateDecision(projectId, {...identity, decision: 'adopted', revision: 1});
  await recordVisualAssetCandidateDecision(projectId, {...identity, decision: 'rejected', revision: 2});

  const metrics = await batchMetrics(batchId);
  assert.equal(metrics.visualCandidateDecisionCount, 1);
  assert.equal(metrics.visualCandidateAdoptionCount, 0);
  assert.equal(metrics.visualCandidateRejectionCount, 1);
});

test('active override metrics distinguish recipes, media, and text from history', () => {
  const metrics = summarizeActiveOverrides({overrides: [
    {id: 'recipe-visual', groupId: 'recipe', status: 'active', locks: {visualType: {value: 'diagram'}}},
    {id: 'recipe-ref', groupId: 'recipe', status: 'active', locks: {motionRecipeRefs: {value: []}}},
    {id: 'media', status: 'active', locks: {assetRefs: {value: []}}},
    {id: 'text', status: 'active', locks: {text: {value: 'keyword'}}},
    {id: 'old', status: 'reverted', locks: {motionRecipeRefs: {value: []}}},
  ]});
  assert.deepEqual(metrics, {activeGroupCount: 3, recipeGroupCount: 1, mediaGroupCount: 1, textGroupCount: 1});
});

test('project readiness summary exposes the next actionable gate without approving it', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `batch-readiness-${suffix}`;
  t.after(() => deleteProject(projectId).catch(() => undefined));
  const project = await createProject(projectInput(projectId));
  const initial = summarizeProjectReadiness(project);
  assert.equal(initial.projectId, projectId);
  assert.equal(initial.nextStageId, 'source-register');
  assert.equal(initial.nextStageStatus, 'not-started');
  assert.equal(initial.nextAction, '生成该步骤');
  assert.equal(initial.readyForComposition, false);
  assert.equal(initial.readyForDelivery, false);

  const ready = structuredClone(project);
  for (const stageId of ready.stageOrder.slice(0, ready.stageOrder.indexOf('composition-readiness') + 1)) {
    const definition = ready.customStages?.[stageId];
    const state = ready.stages[stageId];
    if (state && (!definition || definition.routes?.includes(ready.route) || stageId === 'source-register')) state.status = 'approved';
  }
  const compositionReady = summarizeProjectReadiness(ready);
  assert.equal(compositionReady.readyForComposition, true);
  assert.equal(compositionReady.readyForDelivery, false);
  assert.equal(compositionReady.deliveryBlockerId, 'full-production');
  assert.equal(compositionReady.publicReleaseBlocked, true);
});

test('original audio skips TTS pronunciation probes while preset14 activates them', () => {
  const pronunciation = workflowStages.find((stage) => stage.id === 'pronunciation-review');
  assert.equal(stageAppliesToProject(pronunciation, {route: 'audio', voiceRoute: 'original'}), false);
  assert.equal(stageAppliesToProject(pronunciation, {route: 'audio', voiceRoute: 'authorized-vc'}), false);
  assert.equal(stageAppliesToProject(pronunciation, {route: 'script', voiceRoute: 'preset14'}), true);
});

test('next-human-gate planner queues one stage and stops at review-ready evidence', async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `next-human-gate-${suffix}`;
  t.after(() => deleteProject(projectId).catch(() => undefined));
  const project = await createProject(projectInput(projectId));
  assert.deepEqual(planNextHumanGate(project), {
    projectId,
    action: 'queue',
    stageId: 'source-register',
    reason: 'not-started',
  });
  const waiting = structuredClone(project);
  waiting.stages['source-register'].status = 'needs-review';
  assert.deepEqual(planNextHumanGate(waiting), {
    projectId,
    action: 'wait-human',
    stageId: 'source-register',
    reason: 'current artifact requires explicit human review',
  });
});
