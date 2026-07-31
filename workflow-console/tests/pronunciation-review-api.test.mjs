import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {test} from 'node:test';
import {promisify} from 'node:util';

import {buildPronunciationGuide} from '../../tools/voice-lab/pronunciation-contract.mjs';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = `pronunciation-api-${process.pid}`;
const dataRoot = path.join(consoleRoot, 'data', projectId);
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const serverReceiptPath = path.join(dataRoot, 'server.json');
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const run = promisify(execFile);
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const pcmWav = (sampleValue = 0) => {
  const sampleRate = 48_000;
  const sampleCount = 4_800;
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  for (let offset = 44; offset < wav.length; offset += 2) wav.writeInt16LE(sampleValue, offset);
  return wav;
};
const writeJson = async (relativePath, value) => {
  const target = path.join(formalRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
const waitForHealth = async (baseUrl, child) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Workbench server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for workbench pronunciation API test server.');
};
const request = async (baseUrl, pathname, {method = 'GET', body} = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : {'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return {response, payload};
};
const stopChild = async (child) => {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode == null) child.kill('SIGKILL');
};

test('dedicated pronunciation API freezes imported candidate files without recording or generic approval', async () => {
  let child = null;
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await store.createProject({
      id: projectId,
      title: 'Pronunciation API file-input contract',
      route: 'script',
      sourcePath: 'demo/demoText.txt',
      platform: 'local-test',
      targetDuration: '30s',
      voiceRoute: 'preset14',
      audience: 'test audience',
      targetOutcome: 'verify imported pronunciation WAV candidates',
      automation: 'critical-gates',
      publicationRights: 'internal-only',
      rightsNotes: 'test-only fixture',
    });
    const narration = '请运行 demo。';
    const narrationSha256 = sha256(narration);
    await fs.mkdir(path.join(formalRoot, 'input'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'input', 'narration.approved.txt'), narration, 'utf8');
    await writeJson('NarrationLock.json', {
      projectId,
      frozenPath: 'input/narration.approved.txt',
      normalizedSha256: narrationSha256,
    });
    const guide = buildPronunciationGuide({projectId, narrationSha256, narration});
    const guidePath = await writeJson('input/pronunciation.json', guide);
    const entry = guide.entries[0];
    const candidates = [];
    for (const suffix of ['a', 'b']) {
      const id = `term-001-${suffix}`;
      const ttsText = suffix === 'a' ? narration : '请运行 “demo”。';
      const audioBytes = pcmWav(suffix === 'a' ? 0 : 1);
      const audioPath = path.join(formalRoot, 'audio', 'pronunciation-probes', `${id}.wav`);
      await fs.mkdir(path.dirname(audioPath), {recursive: true});
      await fs.writeFile(audioPath, audioBytes);
      const {stdout: probeJson} = await run('ffprobe.exe', [
        '-v', 'error', '-show_streams', '-of', 'json', audioPath,
      ], {windowsHide: true});
      const [stream] = JSON.parse(probeJson).streams;
      assert.equal(stream.codec_name, 'pcm_s16le');
      assert.equal(stream.sample_rate, '48000');
      assert.equal(stream.channels, 1);
      const recipePath = await writeJson(`audio/pronunciation-probes/${id}.recipe.json`, {
        text_sha256: sha256(ttsText),
        frontend_preflight: {policy: 'exactly-one-internal-utterance-required', utterance_count: 1},
        output_chunks: 1,
        output: {sha256: sha256(audioBytes)},
      });
      candidates.push({
        id,
        label: suffix === 'a' ? '原词上下文' : '明确词边界',
        spokenAs: entry.token,
        ttsText,
        ttsTextSha256: sha256(ttsText),
        audio: {path: path.relative(formalRoot, audioPath).replaceAll('\\', '/'), sha256: sha256(audioBytes)},
        recipe: {path: path.relative(formalRoot, recipePath).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(recipePath))},
        durationSeconds: 1,
      });
    }
    const manifestPath = await writeJson('audio/pronunciation-probes/probe-manifest.json', {
      schemaVersion: 'autovideo-pronunciation-probes/v1',
      projectId,
      narrationSha256,
      generatedGuideSha256: sha256(await fs.readFile(guidePath)),
      probes: [{
        id: 'pronunciation-001',
        token: entry.token,
        kind: entry.kind,
        locale: entry.locale,
        targetIpa: entry.targetIpa,
        targetCmu: entry.targetCmu,
        contextText: entry.occurrences[0].contextText,
        contextSha256: entry.occurrences[0].contextSha256,
        candidates,
      }],
    });
    const artifactPath = await store.saveArtifact(projectId, 'pronunciation-review', 'probe-manifest.json', JSON.parse(await fs.readFile(manifestPath, 'utf8')), 'json');
    await store.markStageGenerated(projectId, 'pronunciation-review', {artifactPath, artifactKind: 'json'});

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
      stdio: 'ignore',
      windowsHide: true,
    });
    const health = await waitForHealth(baseUrl, child);
    assert.equal(health.capabilities.includes('pronunciation-review-v1'), true);

    const view = await request(baseUrl, `/api/projects/${projectId}/pronunciation-review`);
    assert.equal(view.response.status, 200);
    assert.equal(view.payload.pronunciationReview.review.terms[0].candidates.length, 2);
    const candidateBytes = Buffer.from(await (await fetch(`${baseUrl}${view.payload.pronunciationReview.review.terms[0].candidates[0].audioUrl}`)).arrayBuffer());
    assert.equal(sha256(candidateBytes), candidates[0].audio.sha256);

    const generic = await request(baseUrl, `/api/projects/${projectId}/stages/pronunciation-review/approve`, {
      method: 'POST', body: {reviewer: 'test'},
    });
    assert.equal(generic.response.status, 500);
    assert.match(generic.payload.error, /dedicated in-context candidate listening endpoint/i);

    const incomplete = {
      terms: [{
        token: 'demo',
        decision: 'accepted',
        selectedCandidateId: candidates[0].id,
        playedCandidateIds: [candidates[0].id],
        note: '',
      }],
      notes: 'Imported-file test; no playback device was used.',
      reviewer: 'test',
    };
    const saved = await request(baseUrl, `/api/projects/${projectId}/pronunciation-review`, {method: 'PUT', body: incomplete});
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.pronunciationReview.review.status, 'in-progress');
    const rejected = await request(baseUrl, `/api/projects/${projectId}/pronunciation-review/approve`, {method: 'POST', body: incomplete});
    assert.equal(rejected.response.status, 500);

    const approved = await request(baseUrl, `/api/projects/${projectId}/pronunciation-review/approve-selection`, {
      method: 'POST',
      body: {
        ...incomplete,
        terms: [{...incomplete.terms[0], decision: 'pending'}],
        skipReason: 'User explicitly directed the workflow to advance without hearing the remaining candidate.',
        userDirective: '按当前选择进入下一步。',
      },
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.project.stages['pronunciation-review'].status, 'approved');
    assert.equal(approved.payload.project.stages['pronunciation-review'].approvalScope, 'user-directed-selection-no-listening');
    assert.equal(approved.payload.pronunciationReview.approval.approvalScope, 'user-directed-selection-no-listening');
    assert.equal(approved.payload.pronunciationReview.approval.humanListening.completed, false);
    assert.equal(approved.payload.pronunciationReview.approval.humanListening.playedCandidateCount, 1);
    assert.equal(approved.payload.pronunciationReview.approval.humanListening.candidateCount, 2);
    assert.equal(approved.payload.pronunciationReview.approval.publicReleaseBlocked, true);
    await fs.access(path.join(formalRoot, 'input', 'pronunciation.effective.json'));
  } finally {
    await stopChild(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});
