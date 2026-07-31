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
const testId = `text-review-api-${process.pid}`;
const dataRoot = path.join(consoleRoot, 'data', testId);
const projectId = testId;
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const serverReceiptPath = path.join(dataRoot, 'server.json');
const fakeOcrAdapter = path.join(workspaceRoot, 'tools', 'ocr', 'test', 'fixtures', 'fake-ocr-adapter.mjs');

process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');
const {initializeScreenTextReview} = await import('../lib/text-review.mjs');
const {subtitleReviewChecklistKeys, screenTextReviewChecklistKeys} = await import('../lib/text-review.mjs');

const projectInput = {
  id: projectId,
  title: 'Dedicated text review API contract',
  route: 'script',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'verify dedicated subtitle and screen-text review routes',
  automation: 'critical-gates',
  publicationRights: 'internal-only',
  rightsNotes: 'test-only fixture',
};

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));

const writeJson = async (relativePath, value) => {
  const target = path.join(formalRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};

const writeText = async (relativePath, value) => {
  const target = path.join(formalRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value, 'utf8');
  return target;
};

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close((error) => error ? reject(error) : resolve(address.port));
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

const stopChild = async (child) => {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
};

const checklist = (keys, value = true) => Object.fromEntries(keys.map((key) => [key, value]));

const createBaseFixture = async () => {
  await store.deleteProject(projectId).catch(() => undefined);
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  await store.createProject(projectInput);

  const narrationLockPath = await writeJson('NarrationLock.json', {
    schemaVersion: 'autovideo-narration-lock/v1',
    projectId,
    normalizedSha256: sha256('First cue Second cue'),
  });
  const alignmentPath = await writeJson('audio/alignment.json', {
    schemaVersion: 'autovideo-alignment-locked/v1',
    projectId,
    cues: [
      {id: 'cue-001', start: 0, end: 1, text: 'First cue'},
      {id: 'cue-002', start: 1, end: 2, text: 'Second cue'},
    ],
  });
  const validationPath = await writeJson('captions/alignment-validation.json', {
    schemaVersion: 'autovideo-alignment-validation/v1',
    projectId,
    status: 'passed',
  });
  const srtPath = await writeText(
    'captions/narration.zh-CN.srt',
    '1\n00:00:00,000 --> 00:00:01,000\nFirst cue\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond cue\n',
  );
  const machineQaPath = await writeJson('qa/subtitle-qa.json', {
    schemaVersion: 'autovideo-subtitle-qa/v1',
    projectId,
    machine: {
      status: 'passed',
      alignmentSha256: await sha256File(alignmentPath),
      validationSha256: await sha256File(validationPath),
      srtSha256: await sha256File(srtPath),
    },
  });
  await store.markStageGenerated(projectId, 'subtitle-qa', {
    artifactPath: machineQaPath,
    artifactKind: 'json',
  });
  const subtitleArtifact = await store.saveArtifact(projectId, 'subtitle-review', 'pending.json', {status: 'needs-review'}, 'json');
  await store.markStageGenerated(projectId, 'subtitle-review', {
    artifactPath: subtitleArtifact,
    artifactKind: 'json',
  });
  return {narrationLockPath, alignmentPath, validationPath, srtPath, machineQaPath};
};

const startServer = async () => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: consoleRoot,
    env: {
      ...process.env,
      AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
      AUTOVIDEO_CONSOLE_PORT: String(port),
      AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      AUTOVIDEO_OCR_ADAPTER: fakeOcrAdapter,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await waitForHealth(baseUrl, child);
  return {baseUrl, child};
};

const makeSubtitleApprovalInput = () => ({
  reviewer: 'api-subtitle-reviewer',
  checklist: checklist(subtitleReviewChecklistKeys),
  cues: [
    {id: 'cue-001', decision: 'accepted', note: ''},
    {id: 'cue-002', decision: 'accepted', note: ''},
  ],
  notes: 'Every current cue was reviewed through the dedicated API.',
});

const makeScreenApprovalInput = (frameIds) => ({
  reviewer: 'api-screen-reviewer',
  checklist: checklist(screenTextReviewChecklistKeys),
  frames: frameIds.map((id) => ({id, decision: 'accepted', note: ''})),
  reviewMode: 'manual',
  notes: 'Every deterministic frame was reviewed through the dedicated API.',
});

const createDelegationReceipt = () => writeJson('receipts/creator-delegation/internal-simulation.json', {
  schemaVersion: 'autovideo-creator-delegation/v1',
  projectId,
  authorizedAt: new Date().toISOString(),
  delegate: 'codex',
  scope: ['text-review', 'internal-visual-review', 'internal-only-workflow-simulation'],
  constraints: {
    microphoneAllowed: false,
    audioPlaybackAllowed: false,
    soundOutputAllowed: false,
    publicReleaseAllowed: false,
  },
});

const prepareComposition = async () => {
  await writeText('production/hyperframes/hyperframes.json', '{"project":"text-review-api"}\n');
  await writeText('production/hyperframes/index.html', '<main>stable composition</main>\n');
  const buildPath = await writeJson('production/hyperframes/data/composition-build.json', {
    schemaVersion: 'autovideo-composition-build/v1',
    projectId,
    sceneCount: 2,
    cueCount: 2,
  });
  await writeText('production/hyperframes/snapshots/cue-at-0.5s.png', 'frame-one');
  await writeText('production/hyperframes/snapshots/cue-at-1.5s.png', 'frame-two');
  await writeJson('plan/shot-manifest.json', {
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId,
    shots: [
      {cueId: 'cue-001', sceneId: 'scene-001'},
      {cueId: 'cue-002', sceneId: 'scene-002'},
    ],
  });
  const composition = await store.hashDirectoryManifest(path.join(formalRoot, 'production', 'hyperframes'));
  await writeJson('qa/hyperframes-check.json', {
    schemaVersion: 'autovideo-hyperframes-check/v1',
    projectId,
    ok: true,
    strict: true,
    lint: {ok: true, errorCount: 0},
    runtime: {ok: true, errorCount: 0},
    layout: {ok: true, errorCount: 0},
    motion: {ok: true, errorCount: 0},
    contrast: {ok: true, errorCount: 0},
    autoVideo: {
      compositionDigest: composition.digest,
      compositionFileCount: composition.files.length,
      buildReceiptSha256: await sha256File(buildPath),
    },
  });
  await store.markStageGenerated(projectId, 'qa-review', {
    artifactPath: path.join(dataRoot, 'projects', projectId, 'artifacts', 'qa-review', 'report.json'),
    artifactKind: 'json',
  }).catch(() => undefined);
  const screenArtifact = await store.saveArtifact(projectId, 'screen-text-review', 'pending.json', {status: 'needs-review'}, 'json');
  await store.markStageGenerated(projectId, 'screen-text-review', {
    artifactPath: screenArtifact,
    artifactKind: 'json',
  });
  return {composition};
};

test('dedicated subtitle and screen-text APIs enforce the complete human-review sequence', async () => {
  let child = null;
  await createBaseFixture();
  try {
    const server = await startServer();
    child = server.child;
    const {baseUrl} = server;

    const screenNotReady = await request(baseUrl, `/api/projects/${projectId}/screen-text-review`);
    assert.equal(screenNotReady.response.status, 200);
    assert.equal(screenNotReady.payload.screenTextReview.status, 'blocked');
    assert.equal(screenNotReady.payload.screenTextReview.available, false);
    assert.deepEqual(
      screenNotReady.payload.screenTextReview.blockers.map(({code}) => code),
      ['subtitle-human-review', 'hyperframes-qa', 'screen-review-package'],
    );

    await prepareComposition();
    const screenBlocked = await request(baseUrl, `/api/projects/${projectId}/screen-text-review`);
    assert.equal(screenBlocked.response.status, 500);
    assert.match(screenBlocked.payload.error, /human subtitle review must be approved/i);

    const initial = await request(baseUrl, `/api/projects/${projectId}/subtitle-review`);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload.subtitleReview.review.status, 'not-started');
    assert.equal(initial.payload.subtitleReview.review.cues.length, 2);

    const generic = await request(baseUrl, `/api/projects/${projectId}/stages/subtitle-review/approve`, {
      method: 'POST',
      body: {reviewer: 'bypass-attempt'},
    });
    assert.equal(generic.response.status, 500);
    assert.match(generic.payload.error, /dedicated cue-by-cue subtitle-review endpoint/i);

    const incomplete = await request(baseUrl, `/api/projects/${projectId}/subtitle-review/approve`, {
      method: 'POST',
      body: {
        ...makeSubtitleApprovalInput(),
        checklist: checklist(subtitleReviewChecklistKeys, false),
        notes: 'Checklist intentionally incomplete.',
      },
    });
    assert.equal(incomplete.response.status, 500);
    assert.match(incomplete.payload.error, /complete every subtitle checklist item/i);
    const pending = await request(baseUrl, `/api/projects/${projectId}`);
    assert.equal(pending.payload.project.stages['subtitle-review'].status, 'needs-review');

    const approved = await request(baseUrl, `/api/projects/${projectId}/subtitle-review/approve`, {
      method: 'POST',
      body: makeSubtitleApprovalInput(),
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.project.stages['subtitle-review'].status, 'approved');
    assert.equal(approved.payload.project.stages['subtitle-review'].approvalScope, 'human-review');
    assert.equal(approved.payload.subtitleReview.review.status, 'approved');
    assert.equal(approved.payload.subtitleReview.approval.approvedBy, 'api-subtitle-reviewer');

    const composition = (await store.hashDirectoryManifest(path.join(formalRoot, 'production', 'hyperframes')));
    const initialized = await initializeScreenTextReview({formalRoot, projectId, composition: {
      path: 'production/hyperframes',
      digest: composition.digest,
      fileCount: composition.files.length,
    }});
    const frameIds = initialized.review.frames.map(({id}) => id);
    const initialScreen = await request(baseUrl, `/api/projects/${projectId}/screen-text-review`);
    assert.equal(initialScreen.response.status, 200);
    assert.equal(initialScreen.payload.screenTextReview.review.status, 'in-progress');
    assert.equal(initialScreen.payload.screenTextReview.review.frames.length, 2);

    const ocr = await request(baseUrl, `/api/projects/${projectId}/screen-text-review/ocr`, {
      method: 'POST',
      body: {minConfidence: 0.55},
    });
    assert.equal(ocr.response.status, 200);
    assert.equal(ocr.payload.ocr.status, 'passed');
    assert.equal(ocr.payload.ocr.unresolvedCount, 0);
    assert.equal(ocr.payload.screenTextReview.ocr.available, true);
    assert.equal(ocr.payload.screenTextReview.review.reviewMode, 'manual');

    const genericScreen = await request(baseUrl, `/api/projects/${projectId}/stages/screen-text-review/approve`, {
      method: 'POST',
      body: {reviewer: 'bypass-attempt'},
    });
    assert.equal(genericScreen.response.status, 500);
    assert.match(genericScreen.payload.error, /dedicated frame-by-frame review endpoint/i);

    const incompleteScreen = await request(baseUrl, `/api/projects/${projectId}/screen-text-review/approve`, {
      method: 'POST',
      body: {
        ...makeScreenApprovalInput(frameIds),
        checklist: checklist(screenTextReviewChecklistKeys, false),
        notes: 'Checklist intentionally incomplete.',
      },
    });
    assert.equal(incompleteScreen.response.status, 500);
    assert.match(incompleteScreen.payload.error, /complete every screen-text check/i);
    const pendingScreen = await request(baseUrl, `/api/projects/${projectId}`);
    assert.equal(pendingScreen.payload.project.stages['screen-text-review'].status, 'needs-review');

    const approvedScreen = await request(baseUrl, `/api/projects/${projectId}/screen-text-review/approve`, {
      method: 'POST',
      body: makeScreenApprovalInput(frameIds),
    });
    assert.equal(approvedScreen.response.status, 200);
    assert.equal(approvedScreen.payload.project.stages['screen-text-review'].status, 'approved');
    assert.equal(approvedScreen.payload.project.stages['screen-text-review'].approvalScope, 'human-review');
    assert.equal(approvedScreen.payload.screenTextReview.review.status, 'approved');
    assert.equal(approvedScreen.payload.screenTextReview.approval.reviewMode, 'manual');
  } finally {
    await stopChild(child);
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});

test('creator delegation simulates subtitle and screen-text approval without claiming human review', async () => {
  let child = null;
  await createBaseFixture();
  try {
    const delegationPath = await createDelegationReceipt();
    const delegationReceipt = path.relative(formalRoot, delegationPath).replaceAll('\\', '/');
    const server = await startServer();
    child = server.child;
    const {baseUrl} = server;

    const escaped = await request(baseUrl, `/api/projects/${projectId}/subtitle-review/simulate`, {
      method: 'POST',
      body: {delegationReceipt: '../outside.json', reason: 'must remain inside the formal project'},
    });
    assert.equal(escaped.response.status, 500);
    assert.match(escaped.payload.error, /leaves the formal project root/i);

    const subtitle = await request(baseUrl, `/api/projects/${projectId}/subtitle-review/simulate`, {
      method: 'POST',
      body: {delegationReceipt, reason: 'Creator asked Codex to fill the internal text gate.'},
    });
    assert.equal(subtitle.response.status, 200);
    assert.equal(subtitle.payload.project.stages['subtitle-review'].approvalScope, 'internal-autonomous-review');
    assert.equal(subtitle.payload.project.stages['subtitle-review'].approvedBy, 'codex-creator-delegated');
    assert.equal(subtitle.payload.subtitleReview.approval.schemaVersion, 'autovideo-subtitle-internal-approval/v1');
    assert.equal(subtitle.payload.subtitleReview.approval.humanReviewPerformed, false);
    assert.equal(subtitle.payload.subtitleReview.approval.publicReleaseBlocked, true);
    assert.equal(subtitle.payload.subtitleReview.approval.delegation.path, delegationReceipt);

    await prepareComposition();
    const composition = await store.hashDirectoryManifest(path.join(formalRoot, 'production', 'hyperframes'));
    await initializeScreenTextReview({formalRoot, projectId, composition: {
      path: 'production/hyperframes',
      digest: composition.digest,
      fileCount: composition.files.length,
    }});
    const screen = await request(baseUrl, `/api/projects/${projectId}/screen-text-review/simulate`, {
      method: 'POST',
      body: {delegationReceipt, reason: 'Creator delegated internal frame review simulation.'},
    });
    assert.equal(screen.response.status, 200);
    assert.equal(screen.payload.project.stages['screen-text-review'].approvalScope, 'internal-autonomous-review');
    assert.equal(screen.payload.project.stages['screen-text-review'].approvedBy, 'codex-creator-delegated');
    assert.equal(screen.payload.screenTextReview.approval.schemaVersion, 'autovideo-screen-text-internal-approval/v1');
    assert.equal(screen.payload.screenTextReview.approval.humanReviewPerformed, false);
    assert.equal(screen.payload.screenTextReview.approval.publicReleaseBlocked, true);
    assert.equal(screen.payload.screenTextReview.approval.delegation.sha256, await sha256File(delegationPath));

    await fs.writeFile(delegationPath, `${JSON.stringify({revoked: true})}\n`, 'utf8');
    const staleSubtitle = await request(baseUrl, `/api/projects/${projectId}/subtitle-review`);
    assert.equal(staleSubtitle.response.status, 200);
    assert.equal(staleSubtitle.payload.subtitleReview.approval, null);
    assert.notEqual(staleSubtitle.payload.subtitleReview.review.status, 'approved');
  } finally {
    await stopChild(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});
