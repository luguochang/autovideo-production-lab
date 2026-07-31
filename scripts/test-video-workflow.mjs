import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');
const projectId = `workflow-smoke-${process.pid}`;
const projectDir = path.join(projectsRoot, projectId);
const fixtureDir = path.join(projectsRoot, `${projectId}-fixtures`);
const workflow = path.join(root, 'scripts', 'video-workflow.mjs');

const execute = (...args) => spawnSync(process.execPath, [workflow, ...args], {cwd: root, encoding: 'utf8'});

const run = (...args) => {
  const result = execute(...args);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const runFails = (pattern, ...args) => {
  const result = execute(...args);
  assert.notEqual(result.status, 0, `Expected command to fail: ${args.join(' ')}`);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern);
};

const makeSilentWav = (durationSeconds = 2) => {
  const sampleRate = 48000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const dataBytes = sampleRate * blockAlign * durationSeconds;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * blockAlign, 28);
  bytes.writeUInt16LE(blockAlign, 32);
  bytes.writeUInt16LE(bitsPerSample, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataBytes, 40);
  return bytes;
};

try {
  await fs.mkdir(fixtureDir, {recursive: true});
  const narrationPath = path.join(fixtureDir, 'narration.txt');
  const audioPath = path.join(fixtureDir, 'narration.final.wav');
  const alignmentPath = path.join(fixtureDir, 'alignment.json');
  const narration = '这是标准工作流的冒烟测试。';
  const narrationHash = crypto.createHash('sha256').update(narration).digest('hex');
  await fs.writeFile(narrationPath, narration, 'utf8');
  await fs.writeFile(audioPath, makeSilentWav());
  await fs.writeFile(alignmentPath, `${JSON.stringify({
    narrationSha256: narrationHash,
    words: [
      {word: '这是', start: 0, end: 0.8},
      {word: '测试', start: 0.8, end: 2},
    ],
  }, null, 2)}\n`, 'utf8');

  const created = run('new', '--id', projectId, '--narration', narrationPath, '--duration', '2s', '--platform', 'test');
  assert.equal(created.stage, 'planning');
  const initialState = JSON.parse(await fs.readFile(path.join(projectDir, 'project-state.json'), 'utf8'));
  assert.equal(initialState.inputs.ratio, '16:9');

  const applied = run('apply-template', '--project', projectId, '--style', 'modern-ip-host-explainer');
  assert.equal(applied.paletteId, 'light-apricot');

  await fs.writeFile(path.join(projectDir, 'review', 'stills', 'smoke.png'), 'smoke');
  await fs.writeFile(path.join(projectDir, 'review', 'probes', 'smoke.mp4'), 'smoke');
  run('approve-task', '--project', projectId, '--reviewer', 'workflow-test');
  run('approve-style', '--project', projectId, '--reviewer', 'workflow-test', '--base', 'modern-ip-host-explainer', '--motion-rules', 'svg-path-draw');

  await fs.mkdir(path.join(projectDir, 'qa'), {recursive: true});
  const checkEvidence = path.join(projectDir, 'qa', 'hyperframes-check.log');
  await fs.writeFile(checkEvidence, 'smoke test check evidence\n', 'utf8');

  run('attach-audio', '--project', projectId, '--audio', audioPath, '--alignment', alignmentPath, '--approved-by', 'technical-review', '--approval-scope', 'technical-only', '--rights-status', 'needs-review');
  const internalAudioReport = run('template-status', '--project', projectId);
  assert.equal(internalAudioReport.contracts.audioHandoff.valid, true);
  assert.equal(internalAudioReport.contracts.audioHandoff.publicReleaseReady, false);
  assert.equal(internalAudioReport.readiness.readyForComposition, false);
  runFails(/human-listening/i, 'attach-audio', '--project', projectId, '--audio', audioPath, '--alignment', alignmentPath, '--approved-by', 'technical-review', '--approval-scope', 'technical-only', '--rights-status', 'approved');
  runFails(/human-listening/i, 'approve-preview', '--project', projectId, '--reviewer', 'workflow-test', '--check-evidence', checkEvidence);

  run('attach-audio', '--project', projectId, '--audio', audioPath, '--alignment', alignmentPath, '--approved-by', 'workflow-test', '--approval-scope', 'human-listening', '--rights-status', 'approved');
  run('approve-preview', '--project', projectId, '--reviewer', 'workflow-test', '--check-evidence', checkEvidence);

  const report = run('template-status', '--project', projectId);
  assert.deepEqual(report.readiness, {
    readyForProjectProbe: true,
    readyForComposition: true,
    readyForFinalRender: true,
  });
  assert.ok(report.checks.every((check) => check.passed), JSON.stringify(report.checks, null, 2));
  assert.equal(report.contracts.audioHandoff.humanListeningApproved, true);
  assert.equal(report.contracts.audioHandoff.publicReleaseReady, true);

  const handoffPath = path.join(projectDir, 'audio-handoff.json');
  const approvedHandoff = JSON.parse(await fs.readFile(handoffPath, 'utf8'));
  await fs.writeFile(handoffPath, `${JSON.stringify({
    ...approvedHandoff,
    approvalScope: 'technical-only',
    humanListeningStatus: 'not-performed',
    publicReleaseBlocked: false,
  }, null, 2)}\n`, 'utf8');
  const legacyScopeReport = run('template-status', '--project', projectId);
  assert.equal(legacyScopeReport.contracts.audioHandoff.humanListeningApproved, false);
  assert.equal(legacyScopeReport.readiness.readyForFinalRender, false);
  runFails(/human-listening/i, 'approve-preview', '--project', projectId, '--reviewer', 'workflow-test', '--check-evidence', checkEvidence);

  run('attach-audio', '--project', projectId, '--audio', audioPath, '--alignment', alignmentPath, '--approved-by', 'workflow-test', '--approval-scope', 'human-listening', '--rights-status', 'approved');
  const restoredScopeReport = run('template-status', '--project', projectId);
  assert.equal(restoredScopeReport.readiness.readyForFinalRender, true);

  const formalAlignmentPath = path.join(projectDir, 'audio', 'alignment.json');
  const lockedAlignment = await fs.readFile(formalAlignmentPath);
  await fs.appendFile(formalAlignmentPath, '\n');
  const tamperedAudioReport = run('template-status', '--project', projectId);
  assert.equal(tamperedAudioReport.contracts.audioHandoff.filesValid, false);
  assert.equal(tamperedAudioReport.contracts.audioHandoff.valid, false);
  assert.equal(tamperedAudioReport.readiness.readyForFinalRender, false);
  await fs.writeFile(formalAlignmentPath, lockedAlignment);
  const restoredAudioReport = run('template-status', '--project', projectId);
  assert.equal(restoredAudioReport.readiness.readyForFinalRender, true);

  run('attach-audio', '--project', projectId, '--audio', audioPath, '--alignment', alignmentPath, '--approved-by', 'workflow-test', '--approval-scope', 'human-listening', '--rights-status', 'approved');
  const unchangedAudioReport = run('template-status', '--project', projectId);
  assert.equal(unchangedAudioReport.readiness.readyForFinalRender, true, 'Reattaching identical audio must preserve preview approval.');

  await fs.writeFile(alignmentPath, `${JSON.stringify({
    narrationSha256: narrationHash,
    words: [
      {word: '这是', start: 0, end: 0.9},
      {word: '测试', start: 0.9, end: 2},
    ],
  }, null, 2)}\n`, 'utf8');
  run('attach-audio', '--project', projectId, '--audio', audioPath, '--alignment', alignmentPath, '--approved-by', 'workflow-test', '--approval-scope', 'human-listening', '--rights-status', 'approved', '--replace');
  const replacedAudioReport = run('template-status', '--project', projectId);
  assert.equal(replacedAudioReport.readiness.readyForComposition, true);
  assert.equal(replacedAudioReport.readiness.readyForFinalRender, false, 'Changed timing must invalidate preview approval.');

  console.log(JSON.stringify({passed: true, projectId, checks: report.checks.length, audioInvalidation: 'passed'}, null, 2));
} finally {
  const relativeProject = path.relative(projectsRoot, projectDir);
  const relativeFixture = path.relative(projectsRoot, fixtureDir);
  if (!relativeProject.startsWith('..') && !path.isAbsolute(relativeProject)) await fs.rm(projectDir, {recursive: true, force: true});
  if (!relativeFixture.startsWith('..') && !path.isAbsolute(relativeFixture)) await fs.rm(fixtureDir, {recursive: true, force: true});
}
