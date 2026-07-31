import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = `voice-generator-${process.pid}`;
const dataRoot = path.join(consoleRoot, 'data', projectId);
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const sourcePath = path.join(consoleRoot, 'data', `${projectId}-source.wav`);
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');
const {generateStage} = await import('../lib/generators.mjs');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const pcmWav = () => {
  const rate = 48_000;
  const samples = rate;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0, 'ascii'); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii'); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii'); wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 330 * index / rate) * 1800), 44 + index * 2);
  return wav;
};
const writeJson = async (relative, value) => {
  const target = path.join(formalRoot, relative);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};

before(async () => {
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  await fs.mkdir(path.dirname(sourcePath), {recursive: true});
  await fs.writeFile(sourcePath, pcmWav());
});
after(async () => {
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  await fs.rm(sourcePath, {force: true});
});

test('voice-final generator writes a versioned imported-audio candidate and never creates the final WAV', async () => {
  const narration = '导入音频候选测试。';
  const narrationSha256 = sha256(narration);
  await store.createProject({
    id: projectId, title: 'Imported audio candidate generator', route: 'audio',
    sourcePath: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
    platform: 'local-test', targetDuration: '1s', voiceRoute: 'original', audience: 'test',
    targetOutcome: 'candidate-only generation', automation: 'critical-gates', publicationRights: 'internal-only', rightsNotes: 'test-only',
  });
  await fs.mkdir(path.join(formalRoot, 'input'), {recursive: true});
  await fs.writeFile(path.join(formalRoot, 'input', 'narration.txt'), narration, 'utf8');
  await writeJson('NarrationLock.json', {
    projectId, frozenPath: 'input/narration.txt', sourceSha256: narrationSha256, normalizedSha256: narrationSha256,
  });
  const result = await generateStage(projectId, 'voice-final');
  assert.equal(result.preserveFinalAudio, true);
  assert.match(result.summary, /existing final WAV was not changed/i);
  assert.equal(await fs.access(path.join(formalRoot, 'audio', 'narration.final.wav')).then(() => true).catch(() => false), false);
  const candidateRoot = path.join(formalRoot, 'audio', 'voice-candidates', 'candidate-001');
  const [manifest, recipe] = await Promise.all([
    fs.readFile(path.join(candidateRoot, 'candidate.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(candidateRoot, 'voice.candidate.recipe.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(manifest.role, 'generated');
  assert.equal(manifest.selectable, true);
  assert.equal(manifest.technicalQa.status, 'passed');
  assert.equal(recipe.route, 'original');
  assert.equal(recipe.outputSha256, manifest.audio.sha256);
  const index = JSON.parse(await fs.readFile(path.join(formalRoot, 'audio', 'voice-candidates', 'index.json'), 'utf8'));
  assert.deepEqual(index.activeCandidateIds, ['candidate-001']);
});
