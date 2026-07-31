import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = `final-review-api-${process.pid}`;
const dataRoot = path.join(consoleRoot, 'data', `final-review-api-${process.pid}`);
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const serverReceiptPath = path.join(dataRoot, 'server.json');

process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');

const projectInput = {
  id: projectId,
  title: 'Final review API contract',
  route: 'script',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '60s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'verify the dedicated human review gate',
  automation: 'critical-gates',
  publicationRights: 'internal-only',
  rightsNotes: 'test-only fixture',
};

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});

const waitForHealth = async (baseUrl, child) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Workbench server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the workbench test server.');
};

const request = async (baseUrl, pathname, {method = 'GET', body} = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : {'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return {response, payload};
};

const fileSha256 = async (filePath) => createHash('sha256')
  .update(await fs.readFile(filePath))
  .digest('hex');

const stopChild = async (child) => {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
};

test('dedicated final-review API approves a needs-review preview only after all five checks', async () => {
  let child = null;
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await fs.mkdir(path.join(formalRoot, 'production', 'hyperframes'), {recursive: true});
    await fs.mkdir(path.join(formalRoot, 'qa'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'production', 'hyperframes', 'hyperframes.json'), '{"project":"test"}\n', 'utf8');
    await fs.writeFile(path.join(formalRoot, 'production', 'hyperframes', 'index.html'), '<main>stable composition</main>\n', 'utf8');
    await fs.writeFile(path.join(formalRoot, 'project-state.json'), `${JSON.stringify({
      projectId,
      stage: 'qa-passed',
      gates: {finalPreview: {status: 'pending'}},
    }, null, 2)}\n`, 'utf8');

    await store.createProject(projectInput);
    const qaArtifact = await store.saveArtifact(projectId, 'qa-review', 'report.json', {ok: true}, 'json');
    await store.markStageGenerated(projectId, 'qa-review', {artifactPath: qaArtifact, artifactKind: 'json'});
    const previewArtifact = await store.saveArtifact(projectId, 'final-preview', 'preview-request.json', {status: 'ready-to-start'}, 'json');
    await store.markStageGenerated(projectId, 'final-preview', {artifactPath: previewArtifact, artifactKind: 'json'});
    await store.recordPreviewStarted(projectId, 'http://127.0.0.1:3456/');

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {
        ...process.env,
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);

    const initial = await request(baseUrl, `/api/projects/${projectId}/final-review`);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload.finalReview.review.status, 'not-started');

    const generic = await request(baseUrl, `/api/projects/${projectId}/stages/final-preview/approve`, {
      method: 'POST',
      body: {reviewer: 'api-reviewer'},
    });
    assert.equal(generic.response.status, 500);
    assert.match(generic.payload.error, /dedicated five-item final-review endpoint/i);

    const fourChecks = {
      fullTimeline: true,
      audioVisualSync: true,
      captions: true,
      visuals: true,
      content: false,
    };
    const incomplete = await request(baseUrl, `/api/projects/${projectId}/final-review/approve`, {
      method: 'POST',
      body: {reviewer: 'api-reviewer', checklist: fourChecks, notes: 'Content review is not complete.'},
    });
    assert.equal(incomplete.response.status, 500);
    assert.match(incomplete.payload.error, /complete all five/i);
    const stillPending = await request(baseUrl, `/api/projects/${projectId}`);
    assert.equal(stillPending.payload.project.stages['final-preview'].status, 'needs-review');

    const allChecks = {...fourChecks, content: true};
    const approved = await request(baseUrl, `/api/projects/${projectId}/final-review/approve`, {
      method: 'POST',
      body: {reviewer: 'api-reviewer', checklist: allChecks, notes: 'Full timeline reviewed in Studio.'},
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.project.stages['final-preview'].status, 'approved');
    assert.equal(approved.payload.project.stages['final-preview'].approvalScope, 'human-review');
    assert.equal(approved.payload.finalReview.review.readyForApproval, true);

    const previewReceiptPath = path.join(formalRoot, 'qa', 'final-preview.json');
    const humanReviewPath = path.join(formalRoot, 'qa', 'human-final-review.json');
    const [previewReceipt, humanReview, formalState, composition] = await Promise.all([
      fs.readFile(previewReceiptPath, 'utf8').then(JSON.parse),
      fs.readFile(humanReviewPath, 'utf8').then(JSON.parse),
      fs.readFile(path.join(formalRoot, 'project-state.json'), 'utf8').then(JSON.parse),
      store.hashDirectoryManifest(path.join(formalRoot, 'production', 'hyperframes')),
    ]);
    assert.equal(previewReceipt.approvalScope, 'human-review');
    assert.equal(previewReceipt.approvedBy, 'api-reviewer');
    assert.equal(previewReceipt.compositionDigest, composition.digest);
    assert.equal(previewReceipt.fileCount, composition.files.length);
    assert.equal(previewReceipt.humanReview.sha256, await fileSha256(humanReviewPath));
    assert.equal(previewReceipt.humanReview.previewReceiptSha256, humanReview.previewReceipt.sha256);
    assert.equal(formalState.gates.finalPreview.status, 'approved-internal-only');
    assert.equal(formalState.gates.finalPreview.approvalScope, 'human-review');
    assert.equal(formalState.gates.finalPreview.humanReview.sha256, previewReceipt.humanReview.sha256);

    const artifact = await request(baseUrl, `/api/projects/${projectId}/stages/final-preview/artifact`);
    assert.equal(artifact.response.status, 200);
    assert.equal(JSON.parse(artifact.payload.artifact.content).humanReview.sha256, previewReceipt.humanReview.sha256);
  } finally {
    await stopChild(child);
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});

test('creator-delegated final-review simulation stays internal-only and records no human review', async () => {
  let child = null;
  await store.deleteProject(projectId).catch(() => undefined);
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await fs.mkdir(path.join(formalRoot, 'production', 'hyperframes'), {recursive: true});
    await fs.mkdir(path.join(formalRoot, 'qa'), {recursive: true});
    await fs.mkdir(path.join(formalRoot, 'receipts', 'creator-delegation'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'production', 'hyperframes', 'hyperframes.json'), '{"project":"test"}\n', 'utf8');
    await fs.writeFile(path.join(formalRoot, 'production', 'hyperframes', 'index.html'), '<main>stable composition</main>\n', 'utf8');
    await fs.writeFile(path.join(formalRoot, 'project-state.json'), `${JSON.stringify({
      projectId,
      stage: 'qa-passed',
      gates: {finalPreview: {status: 'pending'}},
    }, null, 2)}\n`, 'utf8');
    const delegationRelative = 'receipts/creator-delegation/internal-simulation.json';
    const delegationPath = path.join(formalRoot, delegationRelative);
    await fs.writeFile(delegationPath, `${JSON.stringify({
      schemaVersion: 'autovideo-creator-delegation/v1',
      projectId,
      delegate: 'codex',
      scope: ['internal-visual-review', 'internal-only-workflow-simulation'],
      constraints: {publicReleaseAllowed: false},
    }, null, 2)}\n`, 'utf8');

    await store.createProject(projectInput);
    const qaArtifact = await store.saveArtifact(projectId, 'qa-review', 'report.json', {ok: true}, 'json');
    await store.markStageGenerated(projectId, 'qa-review', {artifactPath: qaArtifact, artifactKind: 'json'});
    const previewArtifact = await store.saveArtifact(projectId, 'final-preview', 'preview-request.json', {status: 'ready-to-start'}, 'json');
    await store.markStageGenerated(projectId, 'final-preview', {artifactPath: previewArtifact, artifactKind: 'json'});
    await store.recordPreviewStarted(projectId, 'http://127.0.0.1:3456/');

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {
        ...process.env,
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    await waitForHealth(baseUrl, child);

    const simulated = await request(baseUrl, `/api/projects/${projectId}/final-review/simulate`, {
      method: 'POST',
      body: {delegationReceipt: delegationRelative, reason: 'Creator delegated internal visual workflow decisions.'},
    });
    assert.equal(simulated.response.status, 200);
    assert.equal(simulated.payload.project.stages['final-preview'].status, 'approved');
    assert.equal(simulated.payload.project.stages['final-preview'].approvalScope, 'internal-autonomous-review');
    assert.equal(simulated.payload.project.stages['final-preview'].approvedBy, 'codex-creator-delegated');

    const [preview, internalReview, state, humanReviewExists] = await Promise.all([
      fs.readFile(path.join(formalRoot, 'qa', 'final-preview.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(formalRoot, 'qa', 'internal-final-review.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(formalRoot, 'project-state.json'), 'utf8').then(JSON.parse),
      fs.access(path.join(formalRoot, 'qa', 'human-final-review.json')).then(() => true).catch(() => false),
    ]);
    assert.equal(preview.schemaVersion, 'autovideo-final-preview-internal-approval/v1');
    assert.equal(preview.humanReviewPerformed, false);
    assert.equal(preview.publicReleaseBlocked, true);
    assert.equal(preview.internalReview.sha256, await fileSha256(path.join(formalRoot, 'qa', 'internal-final-review.json')));
    assert.equal(internalReview.humanReviewPerformed, false);
    assert.equal(internalReview.checklist.fullTimeline, false);
    assert.equal(state.gates.finalPreview.approvalScope, 'internal-autonomous-review');
    assert.equal(state.gates.finalPreview.publicReleaseBlocked, true);
    assert.equal(humanReviewExists, false);
  } finally {
    await stopChild(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});
