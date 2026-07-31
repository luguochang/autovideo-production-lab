import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {after, test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const suffix = `${process.pid}-${Date.now()}`;
const projectId = `batch-api-idempotency-${suffix}`;
const batchId = `batch-api-idempotency-${suffix}`;
const dataRoot = path.join(consoleRoot, 'data', `batch-api-idempotency-${suffix}`);
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const serverReceiptPath = path.join(dataRoot, 'server.json');

process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');
const batches = await import('../lib/batch-store.mjs');
const jobContract = await import('../lib/job-contract.mjs');

after(async () => {
  await fs.rm(dataRoot, {recursive: true, force: true});
});

const input = {
  id: projectId,
  title: 'Batch idempotency API contract',
  route: 'script',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'verify batch idempotency',
  automation: 'critical-gates',
  publicationRights: 'internal-only',
  rightsNotes: 'test-only fixture',
};

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close((error) => error ? reject(error) : resolve(port));
  });
});

const waitForHealth = async (baseUrl, child) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for server.');
};

const request = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: options.body === undefined ? undefined : {'content-type': 'application/json'},
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {response, payload: await response.json()};
};

const stop = async (child) => {
  if (!child || child.exitCode != null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
};

const waitForJobStatus = async (baseUrl, jobId, expected = ['complete', 'failed', 'canceled']) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await request(baseUrl, `/api/jobs/${jobId}`);
    if (expected.includes(result.payload.job?.status)) return result.payload.job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for job ${jobId}.`);
};

const waitForBatchStatus = async (baseUrl, localBatchId, expected) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await request(baseUrl, `/api/batches/${localBatchId}`);
    if (expected.includes(result.payload.batch?.status)) return result.payload;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for batch ${localBatchId}.`);
};

test('batch API reuses an approved stage with an unchanged artifact', async () => {
  let child = null;
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await store.createProject(input);
    await store.recordContentIntake(projectId, {
      schemaVersion: 'autovideo-content-intake-submission/v1',
      id: `frozen-${suffix}`,
      projectId,
      inputType: 'pasted-text',
      route: 'script',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: {path: 'demo/demoText.txt', sha256: 'a'.repeat(64), bytes: 12, fileCount: 1},
      registration: {
        workbenchInput: {route: 'script', sourcePath: 'demo/demoText.txt'},
        pipelineIntakePath: `content/intakes/${projectId}`,
      },
    });
    const artifactPath = await store.saveArtifact(projectId, 'source-register', 'source.txt', 'locked input\n', 'text');
    await store.markStageGenerated(projectId, 'source-register', {artifactPath, artifactKind: 'text', summary: 'fixture'});
    const batch = await batches.createBatch({id: batchId, title: 'Idempotency API', projectIds: [projectId], stageId: 'source-register', priority: 50});
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {...process.env, AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot, AUTOVIDEO_CONSOLE_PORT: String(port), AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath},
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);
    const result = await request(baseUrl, `/api/batches/${batch.id}/run`, {method: 'POST', body: {}});
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.jobs.length, 0);
    assert.equal(result.payload.errors.length, 0);
    assert.equal(result.payload.batch.status, 'completed');
    assert.equal(result.payload.batch.lastRun.status, 'completed');
    assert.equal(result.payload.batch.lastRun.plan[0].action, 'skip');
    assert.equal(result.payload.metrics.latestJobCount, 0);
  } finally {
    await stop(child);
    await batches.deleteBatch(batchId).catch(() => undefined);
    await store.deleteProject(projectId).catch(() => undefined);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});

test('next-human-gate batch stops without creating a job when review is pending', async () => {
  const localSuffix = `${process.pid}-${Date.now()}-human`;
  const localProjectId = `batch-next-human-${localSuffix}`;
  const localBatchId = `batch-next-human-${localSuffix}`;
  let child = null;
  try {
    const project = await store.createProject({...input, id: localProjectId, title: 'Next human gate'});
    const sourcePath = await store.saveArtifact(localProjectId, 'source-register', 'source.txt', 'registered\n', 'text');
    await store.markStageGenerated(localProjectId, 'source-register', {artifactPath: sourcePath, artifactKind: 'text', summary: 'fixture'});
    const suitabilityPath = await store.saveArtifact(localProjectId, 'material-suitability', 'material-suitability.json', '{}\n', 'json');
    await store.markStageGenerated(localProjectId, 'material-suitability', {artifactPath: suitabilityPath, artifactKind: 'json', summary: 'fixture'});
    const artifactPath = await store.saveArtifact(localProjectId, 'evidence-ledger', 'evidence.json', '{}\n', 'json');
    await store.markStageGenerated(localProjectId, 'evidence-ledger', {artifactPath, artifactKind: 'json', summary: 'fixture'});
    assert.equal((await store.getProject(localProjectId)).stages['evidence-ledger'].status, 'needs-review');
    const batch = await batches.createBatch({id: localBatchId, title: 'Wait human', projectIds: [localProjectId], stageId: 'next-human-gate', priority: 50});
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {...process.env, AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot, AUTOVIDEO_CONSOLE_PORT: String(port), AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath},
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);
    const result = await request(baseUrl, `/api/batches/${batch.id}/run`, {method: 'POST', body: {}});
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.jobs.length, 0);
    assert.equal(result.payload.batch.status, 'waiting-human');
    assert.equal(result.payload.batch.lastRun.plan[0].action, 'wait-human');
    assert.equal(result.payload.batch.lastRun.plan[0].stageId, 'evidence-ledger');
  } finally {
    await stop(child);
    await batches.deleteBatch(localBatchId).catch(() => undefined);
    await store.deleteProject(localProjectId).catch(() => undefined);
  }
});

test('next-human-gate batch fails closed when the current input reaches retryLimit', async () => {
  const localSuffix = `${process.pid}-${Date.now()}-retry`;
  const localProjectId = `batch-next-retry-${localSuffix}`;
  const localBatchId = `batch-next-retry-${localSuffix}`;
  let child = null;
  try {
    await store.createProject({...input, id: localProjectId, title: 'Retry limit'});
    const project = await store.getProject(localProjectId);
    const inputSnapshot = jobContract.buildStageInputSnapshot(project, 'source-register');
    const inputSha256 = jobContract.hashStageInput(inputSnapshot);
    const idempotencyKey = jobContract.jobIdempotencyKey({projectId: localProjectId, stageId: 'source-register', inputSha256});
    await store.createJobRecord({
      id: `failed-${localSuffix}`,
      projectId: localProjectId,
      stageId: 'source-register',
      attempt: 1,
      batchId: localBatchId,
      inputSnapshot,
      inputSha256,
      idempotencyKey,
      status: 'failed',
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:01.000Z',
      finishedAt: '2026-01-01T00:00:02.000Z',
      error: 'fixture failure',
    });
    await store.markStageFailed(localProjectId, 'source-register', 'fixture failure');
    const batch = await batches.createBatch({id: localBatchId, title: 'Retry limit', projectIds: [localProjectId], stageId: 'next-human-gate', priority: 50, retryLimit: 1});
    await batches.updateBatch(localBatchId, {jobIds: [`failed-${localSuffix}`]});
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {...process.env, AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot, AUTOVIDEO_CONSOLE_PORT: String(port), AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath},
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);
    const result = await request(baseUrl, `/api/batches/${batch.id}/run`, {method: 'POST', body: {}});
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.jobs.length, 0);
    assert.equal(result.payload.batch.status, 'failed');
    assert.match(result.payload.batch.lastError, /retry limit 1/i);
    assert.equal(result.payload.batch.lastRun.plan.at(-1).action, 'blocked');
  } finally {
    await stop(child);
    await batches.deleteBatch(localBatchId).catch(() => undefined);
    await store.deleteProject(localProjectId).catch(() => undefined);
  }
});

test('concurrent generation requests reserve one logical job and persist the actual artifact hash', async () => {
  const localSuffix = `${process.pid}-${Date.now()}-reservation`;
  const localProjectId = `job-reservation-${localSuffix}`;
  let child = null;
  try {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AUTOVIDEO_TEST_GENERATOR_FIXTURE: 'deterministic-stage-artifact',
        AUTOVIDEO_TEST_GENERATOR_DELAY_MS: '200',
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);
    const created = await request(baseUrl, '/api/projects', {
      method: 'POST',
      body: {...input, id: localProjectId, title: 'Atomic job reservation'},
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    const [first, second] = await Promise.all([
      request(baseUrl, `/api/projects/${localProjectId}/stages/source-register/generate`, {method: 'POST', body: {}}),
      request(baseUrl, `/api/projects/${localProjectId}/stages/source-register/generate`, {method: 'POST', body: {}}),
    ]);
    assert.equal(first.response.status, 202, JSON.stringify(first.payload));
    assert.equal(second.response.status, 202, JSON.stringify(second.payload));
    assert.equal(first.payload.job.id, second.payload.job.id);
    assert.equal([first, second].filter((item) => item.payload.job.deduplicated === true).length, 1);

    const completed = await waitForJobStatus(baseUrl, first.payload.job.id);
    assert.equal(completed.status, 'complete');
    assert.match(completed.outputSha256, /^[a-f0-9]{64}$/);
    const projectResult = await request(baseUrl, `/api/projects/${localProjectId}`);
    assert.equal(projectResult.payload.project.stages['source-register'].artifactSha256, completed.outputSha256);
    const jobsResult = await request(baseUrl, `/api/jobs?projectId=${encodeURIComponent(localProjectId)}&limit=20`);
    assert.equal(jobsResult.payload.jobs.length, 1);
  } finally {
    await stop(child);
    await store.deleteProject(localProjectId).catch(() => undefined);
  }
});

test('next-human-gate automatically crosses machine stages and stops after generating the human review artifact', async () => {
  const localSuffix = `${process.pid}-${Date.now()}-chain`;
  const localProjectId = `batch-machine-chain-${localSuffix}`;
  const localBatchId = `batch-machine-chain-${localSuffix}`;
  const intakeRoot = path.join(workspaceRoot, 'content', 'workbench-intakes', localProjectId);
  let child = null;
  try {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AUTOVIDEO_TEST_GENERATOR_FIXTURE: 'deterministic-stage-artifact',
        AUTOVIDEO_TEST_GENERATOR_DELAY_MS: '10',
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);
    const created = await request(baseUrl, '/api/projects', {
      method: 'POST',
      body: {
        ...input,
        id: localProjectId,
        title: 'Safe machine chain',
        intake: {
          type: 'pasted-text',
          textReadiness: 'approved-script',
          label: 'safe-chain-fixture',
          text: '今天我们解释一个稳定的视频生产流程。先冻结输入，再生成可追踪的阶段产物，每到人工审核门就暂停，确认后才能继续。',
        },
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.project.route, 'script');
    assert.match(created.payload.project.contentIntake.payload.sha256, /^[a-f0-9]{64}$/);

    const createdBatch = await request(baseUrl, '/api/batches', {
      method: 'POST',
      body: {id: localBatchId, title: 'Safe next human gate chain', projectIds: [localProjectId], stageId: 'next-human-gate', priority: 50},
    });
    assert.equal(createdBatch.response.status, 201);
    const started = await request(baseUrl, `/api/batches/${localBatchId}/run`, {method: 'POST', body: {}});
    assert.equal(started.response.status, 200);
    assert.equal(started.payload.batch.lastRun.finishedAt, null);

    const completed = await waitForBatchStatus(baseUrl, localBatchId, ['waiting-human', 'failed']);
    assert.equal(completed.batch.status, 'waiting-human');
    assert.match(completed.batch.lastRun.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
    const actions = completed.batch.lastRun.plan.map((item) => `${item.stageId}:${item.action}`);
    assert.deepEqual(actions, [
      'source-register:queue',
      'material-suitability:queue',
      'evidence-ledger:queue',
      'evidence-ledger:wait-human',
    ]);

    const jobsResult = await request(baseUrl, `/api/jobs?batchId=${encodeURIComponent(localBatchId)}&limit=20`);
    assert.deepEqual(new Set(jobsResult.payload.jobs.map((job) => job.stageId)), new Set(['source-register', 'material-suitability', 'evidence-ledger']));
    assert.equal(jobsResult.payload.jobs.every((job) => job.status === 'complete' && /^[a-f0-9]{64}$/.test(job.outputSha256)), true);
    const sourceJob = jobsResult.payload.jobs.find((job) => job.stageId === 'source-register');
    assert.equal(sourceJob.inputSnapshot.project.sourceIdentity.mode, 'immutable-content-intake');
    assert.equal(sourceJob.inputSnapshot.project.sourceIdentity.payloadSha256, created.payload.project.contentIntake.payload.sha256);

    const projectResult = await request(baseUrl, `/api/projects/${localProjectId}`);
    assert.equal(projectResult.payload.project.stages['source-register'].status, 'approved');
    assert.equal(projectResult.payload.project.stages['material-suitability'].status, 'approved');
    assert.equal(projectResult.payload.project.stages['evidence-ledger'].status, 'needs-review');
  } finally {
    await stop(child);
    await batches.deleteBatch(localBatchId).catch(() => undefined);
    await store.deleteProject(localProjectId).catch(() => undefined);
    await fs.rm(intakeRoot, {recursive: true, force: true});
  }
});
