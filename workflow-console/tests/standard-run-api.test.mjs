import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';

const run = promisify(execFile);
const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');

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

test('standard runner generates to the next human artifact and never auto-approves it', async () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `standard-run-human-gate-${suffix}`;
  const dataRoot = path.join(consoleRoot, 'data', `standard-run-api-${suffix}`);
  const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
  const intakeRoot = path.join(workspaceRoot, 'content', 'workbench-intakes', projectId);
  const serverReceiptPath = path.join(dataRoot, 'server.json');
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
        id: projectId,
        title: 'Standard runner human gate contract',
        route: 'script',
        sourcePath: 'pending',
        platform: 'local-test',
        targetDuration: '30s',
        voiceRoute: 'preset14',
        audience: 'test audience',
        targetOutcome: 'verify human gate stop',
        automation: 'critical-gates',
        publicationRights: 'internal-only',
        rightsNotes: 'test-only fixture',
        intake: {
          type: 'pasted-text',
          textReadiness: 'approved-script',
          label: 'runner-human-gate',
          text: '先冻结输入，再生成阶段产物。遇到人工审核门后必须暂停，确认完成才允许继续。',
        },
      },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));

    const {stdout} = await run(process.execPath, [
      'scripts/run-standard-delivery.mjs',
      '--project', projectId,
      '--base-url', baseUrl,
      '--poll-ms', '250',
      '--timeout-ms', '60000',
    ], {cwd: workspaceRoot, timeout: 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024});
    const result = JSON.parse(stdout);
    assert.equal(result.status, 'waiting-for-human');
    assert.equal(result.pausedAt, 'evidence-ledger');

    const projectResult = await request(baseUrl, `/api/projects/${projectId}`);
    assert.equal(projectResult.payload.project.stages['source-register'].status, 'approved');
    assert.equal(projectResult.payload.project.stages['material-suitability'].status, 'approved');
    assert.equal(projectResult.payload.project.stages['evidence-ledger'].status, 'needs-review');
    assert.equal(projectResult.payload.project.stages['content-outline'].status, 'not-started');

    const log = await fs.readFile(path.join(formalRoot, 'RUN_EXECUTION_LOG.md'), 'utf8');
    assert.match(log, /run-waiting-for-human/);
    assert.doesNotMatch(log, /\| stage-approved \|/);
    const receipt = JSON.parse(await fs.readFile(path.join(formalRoot, 'STANDARD_RUN_RECEIPT.json'), 'utf8'));
    assert.equal(receipt.status, 'waiting-for-human');
    assert.equal(receipt.currentStageId, 'evidence-ledger');
    assert.equal(receipt.policy.autoApproveHumanGates, false);
    assert.equal(receipt.policy.microphoneUsed, false);
    assert.match(receipt.projectStateSha256, /^[a-f0-9]{64}$/);
    await fs.access(path.join(formalRoot, 'receipts', 'standard-runs', `${receipt.runId}.json`));
  } finally {
    await stop(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
    await fs.rm(intakeRoot, {recursive: true, force: true});
  }
});

test('standard runner records a failed run and resumes it with a new attempt and linked receipt', async () => {
  const suffix = `${process.pid}-${Date.now()}-resume`;
  const projectId = `standard-run-resume-${suffix}`;
  const dataRoot = path.join(consoleRoot, 'data', `standard-run-api-${suffix}`);
  const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
  const intakeRoot = path.join(workspaceRoot, 'content', 'workbench-intakes', projectId);
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
        AUTOVIDEO_TEST_GENERATOR_FAILURE_STAGE: 'source-register',
        AUTOVIDEO_TEST_GENERATOR_FAILURE_COUNT: '1',
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: path.join(dataRoot, 'server.json'),
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);
    const created = await request(baseUrl, '/api/projects', {
      method: 'POST',
      body: {
        id: projectId,
        title: 'Standard runner recovery contract',
        route: 'script',
        sourcePath: 'pending',
        platform: 'local-test',
        targetDuration: '30s',
        voiceRoute: 'preset14',
        audience: 'test audience',
        targetOutcome: 'verify failed run recovery',
        automation: 'critical-gates',
        publicationRights: 'internal-only',
        rightsNotes: 'test-only fixture',
        intake: {
          type: 'pasted-text',
          textReadiness: 'approved-script',
          label: 'runner-recovery',
          text: '任务失败必须留下回执。再次运行时复用相同输入合同、增加 attempt，并在人工门前暂停。',
        },
      },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    const runnerArgs = [
      'scripts/run-standard-delivery.mjs',
      '--project', projectId,
      '--base-url', baseUrl,
      '--poll-ms', '250',
      '--timeout-ms', '60000',
    ];
    await assert.rejects(
      run(process.execPath, runnerArgs, {cwd: workspaceRoot, timeout: 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024}),
      /Injected deterministic test failure/,
    );
    const failedReceipt = JSON.parse(await fs.readFile(path.join(formalRoot, 'STANDARD_RUN_RECEIPT.json'), 'utf8'));
    assert.equal(failedReceipt.status, 'failed');
    assert.equal(failedReceipt.currentStageId, 'source-register');
    assert.equal(failedReceipt.finishedAt !== null, true);

    const {stdout} = await run(process.execPath, runnerArgs, {cwd: workspaceRoot, timeout: 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024});
    const resumedResult = JSON.parse(stdout);
    assert.equal(resumedResult.status, 'waiting-for-human');
    assert.equal(resumedResult.pausedAt, 'evidence-ledger');
    const resumedReceipt = JSON.parse(await fs.readFile(path.join(formalRoot, 'STANDARD_RUN_RECEIPT.json'), 'utf8'));
    assert.equal(resumedReceipt.status, 'waiting-for-human');
    assert.equal(resumedReceipt.resumesRunId, failedReceipt.runId);
    assert.notEqual(resumedReceipt.runId, failedReceipt.runId);
    const archivedFailure = JSON.parse(await fs.readFile(path.join(formalRoot, 'receipts', 'standard-runs', `${failedReceipt.runId}.json`), 'utf8'));
    assert.equal(archivedFailure.status, 'failed');

    const jobsResult = await request(baseUrl, `/api/jobs?projectId=${encodeURIComponent(projectId)}&limit=20`);
    const sourceJobs = jobsResult.payload.jobs.filter((job) => job.stageId === 'source-register').sort((left, right) => left.attempt - right.attempt);
    assert.equal(sourceJobs.length, 2);
    assert.deepEqual(sourceJobs.map((job) => [job.attempt, job.status]), [[1, 'failed'], [2, 'complete']]);
    assert.equal(sourceJobs[0].idempotencyKey, sourceJobs[1].idempotencyKey);
  } finally {
    await stop(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
    await fs.rm(intakeRoot, {recursive: true, force: true});
  }
});
