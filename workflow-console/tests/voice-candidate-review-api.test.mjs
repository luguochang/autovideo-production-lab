import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = `voice-candidate-api-${process.pid}`;
const dataRoot = path.join(consoleRoot, 'data', projectId);
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const serverReceiptPath = path.join(dataRoot, 'server.json');
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');
const {
  registerGeneratedVoiceCandidate,
  snapshotExistingFinalAsBaseline,
  voiceCandidateChecklistKeys,
} = await import('../lib/voice-candidate-review.mjs');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = async (relative, value) => {
  const target = path.join(formalRoot, relative);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};
const pcmWav = (frequency) => {
  const rate = 48_000;
  const samples = rate;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0, 'ascii'); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii'); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii'); wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / rate) * 1800), 44 + index * 2);
  return wav;
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
    if (child.exitCode != null) throw new Error(`Workbench server exited with ${child.exitCode}.`);
    try { const response = await fetch(`${baseUrl}/api/health`); if (response.ok) return response.json(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for voice candidate API server.');
};
const request = async (baseUrl, pathname, {method = 'GET', body} = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method, headers: body === undefined ? undefined : {'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {response, payload: await response.json().catch(() => null)};
};
const stopChild = async (child) => {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode == null) child.kill('SIGKILL');
};

test('voice candidate API uses imported WAV files and atomically promotes only after complete A/B review', async () => {
  let child = null;
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await store.createProject({
      id: projectId, title: 'Voice candidate API', route: 'script', sourcePath: 'demo/demoText.txt',
      platform: 'local-test', targetDuration: '30s', voiceRoute: 'preset14', audience: 'test',
      targetOutcome: 'verify A/B file promotion', automation: 'critical-gates', publicationRights: 'internal-only', rightsNotes: 'test',
    });
    const narration = '测试配音候选。';
    const narrationSha256 = sha256(narration);
    await fs.mkdir(path.join(formalRoot, 'input'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'input', 'narration.txt'), narration, 'utf8');
    await writeJson('NarrationLock.json', {projectId, frozenPath: 'input/narration.txt', sourceSha256: narrationSha256, normalizedSha256: narrationSha256});
    await writeJson('input/pronunciation.effective.json', {schemaVersion: 'autovideo-pronunciation/v2', projectId, narrationSha256, entries: []});
    await writeJson('qa/pronunciation-approval.json', {schemaVersion: 'autovideo-pronunciation-approval/v1', projectId, approvalScope: 'machine-no-subjective-terms'});
    const oldAudio = pcmWav(220);
    await fs.mkdir(path.join(formalRoot, 'audio'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'audio', 'narration.final.wav'), oldAudio);
    await writeJson('audio/voice.recipe.json', {schemaVersion: 'autovideo-voice-receipt/v2', route: 'original', narrationSha256, outputSha256: sha256(oldAudio)});
    await writeJson('audio/listening-review.json', {old: true});
    await writeJson('audio/approval.json', {schemaVersion: 'autovideo-audio-approval/v3', old: true});
    await writeJson('audio-handoff.json', {schemaVersion: 'autovideo-audio-handoff/v2', projectId, status: 'approved', rightsStatus: 'needs-review', audio: {sha256: sha256(oldAudio)}, alignment: {sha256: 'a'.repeat(64)}});
    await writeJson('project-state.json', {schemaVersion: 'autovideo-project-state/v1', projectId, stage: 'storyboard-ready', gates: {finalPreview: {status: 'approved'}}, handoffs: {audio: {status: 'approved'}}, release: {phase: 'internal-review-package', technicalVideoGenerationReady: true, internalReviewReady: true, receipt: 'qa/old.json', video: {path: 'renders/old.mp4'}}});
    await snapshotExistingFinalAsBaseline({formalRoot, projectId});
    const candidateBytes = pcmWav(440);
    const candidateRoot = path.join(formalRoot, 'audio', 'voice-candidates', 'candidate-001');
    const candidateAudio = path.join(candidateRoot, 'narration.candidate.wav');
    const candidateRecipe = path.join(candidateRoot, 'voice.candidate.recipe.json');
    await fs.mkdir(candidateRoot, {recursive: true});
    await fs.writeFile(candidateAudio, candidateBytes);
    await fs.writeFile(candidateRecipe, serialize({
      schemaVersion: 'autovideo-voice-receipt/v2', route: 'original', narrationSha256,
      narrationLockSha256: narrationSha256,
      source: path.relative(workspaceRoot, candidateAudio).replaceAll('\\', '/'), sourceSha256: sha256(candidateBytes),
      outputSha256: sha256(candidateBytes),
    }));
    const candidate = await registerGeneratedVoiceCandidate({formalRoot, projectId, candidateId: 'candidate-001', audioPath: candidateAudio, recipePath: candidateRecipe});
    const artifactPath = await store.saveArtifact(projectId, 'voice-final', 'voice-candidate.json', candidate.manifest, 'json');
    await store.markStageGenerated(projectId, 'voice-final', {artifactPath, artifactKind: 'json', preserveFinalAudio: true});

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {cwd: consoleRoot, env: {...process.env, AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot, AUTOVIDEO_CONSOLE_PORT: String(port), AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath}, stdio: 'ignore', windowsHide: true});
    const health = await waitForHealth(baseUrl, child);
    assert.equal(health.capabilities.includes('voice-candidate-review-v1'), true);
    const initial = await request(baseUrl, `/api/projects/${projectId}/audio-review`);
    assert.equal(initial.response.status, 200, initial.payload?.error);
    assert.equal(initial.payload.audioReview.candidates.length, 2);
    const downloaded = Buffer.from(await (await fetch(`${baseUrl}${initial.payload.audioReview.candidates[1].audioUrl}`)).arrayBuffer());
    assert.equal(sha256(downloaded), sha256(candidateBytes));
    const generic = await request(baseUrl, `/api/projects/${projectId}/stages/voice-final/approve`, {method: 'POST', body: {reviewer: 'test', approvalScope: 'technical-only'}});
    assert.equal(generic.response.status, 500);
    assert.match(generic.payload.error, /dedicated A\/B candidate file listening/i);
    const base = {
      decision: 'accepted', selectedCandidateId: 'candidate-001', playedCandidateIds: ['candidate-001'],
      checklist: Object.fromEntries(voiceCandidateChecklistKeys.map((key) => [key, true])),
      notes: 'File-only API review.', reviewer: 'test-listener',
    };
    const partial = await request(baseUrl, `/api/projects/${projectId}/audio-review`, {method: 'PUT', body: base});
    assert.equal(partial.response.status, 200);
    assert.equal(partial.payload.review.status, 'in-progress');
    const rejected = await request(baseUrl, `/api/projects/${projectId}/audio-review/approve`, {method: 'POST', body: base});
    assert.equal(rejected.response.status, 500);
    assert.equal(sha256(await fs.readFile(path.join(formalRoot, 'audio', 'narration.final.wav'))), sha256(oldAudio));
    const complete = {...base, playedCandidateIds: initial.payload.audioReview.candidates.map((item) => item.candidateId)};
    const approved = await request(baseUrl, `/api/projects/${projectId}/audio-review/approve`, {method: 'POST', body: complete});
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.project.stages['voice-final'].approvalScope, 'human-listening');
    assert.equal(sha256(await fs.readFile(path.join(formalRoot, 'audio', 'narration.final.wav'))), sha256(candidateBytes));
    const handoff = JSON.parse(await fs.readFile(path.join(formalRoot, 'audio-handoff.json'), 'utf8'));
    const state = JSON.parse(await fs.readFile(path.join(formalRoot, 'project-state.json'), 'utf8'));
    assert.equal(handoff.status, 'pending-alignment');
    assert.equal(state.release.phase, 'production');
    assert.equal(state.release.internalReviewReady, false);
  } finally {
    await stopChild(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});
