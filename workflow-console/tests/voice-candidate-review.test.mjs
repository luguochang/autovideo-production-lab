import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';

import {
  buildVoiceCandidateReview,
  promoteVoiceCandidate,
  recoverInterruptedVoicePromotion,
  reopenVoiceCandidateReview,
  registerGeneratedVoiceCandidate,
  saveVoiceCandidateReview,
  snapshotExistingFinalAsBaseline,
  voiceCandidateChecklistKeys,
} from '../lib/voice-candidate-review.mjs';

const root = path.resolve(import.meta.dirname, '..', 'data', `voice-candidate-${process.pid}`);
const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const rootRelative = (target) => path.relative(root, target).replaceAll('\\', '/');
const writeJson = async (relative, value) => {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};
const pcmWav = (frequency = 440) => {
  const rate = 48_000;
  const samples = rate;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / rate) * 1800), 44 + index * 2);
  }
  return wav;
};

const prepare = async () => {
  await fs.rm(root, {recursive: true, force: true});
  const projectId = 'voice-candidate-contract';
  const narration = '测试候选配音。';
  const narrationSha256 = sha256(narration);
  await fs.mkdir(path.join(root, 'input'), {recursive: true});
  await fs.writeFile(path.join(root, 'input', 'narration.txt'), narration, 'utf8');
  await writeJson('NarrationLock.json', {
    projectId, frozenPath: 'input/narration.txt', sourceSha256: narrationSha256, normalizedSha256: narrationSha256,
  });
  await writeJson('input/pronunciation.effective.json', {
    schemaVersion: 'autovideo-pronunciation/v2', projectId, narrationSha256, entries: [],
  });
  await writeJson('qa/pronunciation-approval.json', {
    schemaVersion: 'autovideo-pronunciation-approval/v1', projectId, approvalScope: 'machine-no-subjective-terms',
  });
  const oldAudio = pcmWav(220);
  await fs.mkdir(path.join(root, 'audio'), {recursive: true});
  await fs.writeFile(path.join(root, 'audio', 'narration.final.wav'), oldAudio);
  await writeJson('audio/voice.recipe.json', {
    schemaVersion: 'autovideo-voice-receipt/v2', route: 'original', narrationSha256,
    outputSha256: sha256(oldAudio), generatedAt: '2026-01-01T00:00:00.000Z',
  });
  await writeJson('audio/listening-review.json', {schemaVersion: 'legacy-review', old: true});
  await writeJson('audio/approval.json', {schemaVersion: 'autovideo-audio-approval/v3', old: true});
  await writeJson('audio-handoff.json', {
    schemaVersion: 'autovideo-audio-handoff/v2', projectId, status: 'approved', approvalScope: 'technical-only',
    rightsStatus: 'needs-review', audio: {path: 'audio/narration.final.wav', sha256: sha256(oldAudio)},
    alignment: {path: 'audio/alignment.json', sha256: 'a'.repeat(64)},
  });
  await writeJson('project-state.json', {
    schemaVersion: 'autovideo-project-state/v1', projectId, stage: 'storyboard-ready',
    gates: {finalPreview: {status: 'approved'}},
    handoffs: {audio: {status: 'approved', approvalScope: 'technical-only'}},
    release: {phase: 'internal-review-package', technicalVideoGenerationReady: true, internalReviewReady: true, receipt: 'qa/old.json', video: {path: 'renders/old.mp4'}, cover: {path: 'renders/old.png'}},
  });
  const original = Object.fromEntries(await Promise.all([
    'audio/narration.final.wav', 'audio/voice.recipe.json', 'audio/listening-review.json', 'audio/approval.json',
    'audio-handoff.json', 'project-state.json',
  ].map(async (relative) => [relative, await fs.readFile(path.join(root, relative))])));
  await snapshotExistingFinalAsBaseline({formalRoot: root, projectId});

  for (const [index, frequency] of [440, 660].entries()) {
    const candidateId = `candidate-${String(index + 1).padStart(3, '0')}`;
    const candidateRoot = path.join(root, 'audio', 'voice-candidates', candidateId);
    const audioPath = path.join(candidateRoot, 'narration.candidate.wav');
    const recipePath = path.join(candidateRoot, 'voice.candidate.recipe.json');
    const bytes = pcmWav(frequency);
    await fs.mkdir(candidateRoot, {recursive: true});
    await fs.writeFile(audioPath, bytes);
    await fs.writeFile(recipePath, serialize({
      schemaVersion: 'autovideo-voice-receipt/v2', route: 'original', narrationSha256,
      narrationLockSha256: narrationSha256,
      source: path.relative(workspaceRoot, audioPath).replaceAll('\\', '/'), sourceSha256: sha256(bytes),
      outputSha256: sha256(bytes), generatedAt: `2026-01-0${index + 2}T00:00:00.000Z`,
    }), 'utf8');
    await registerGeneratedVoiceCandidate({formalRoot: root, projectId, candidateId, audioPath, recipePath});
  }
  return {projectId, narrationSha256, original, stage: {status: 'needs-review'}};
};

const acceptedInput = (view, selectedCandidateId = 'candidate-002') => ({
  decision: 'accepted', selectedCandidateId,
  playedCandidateIds: view.candidates.map((candidate) => candidate.candidateId),
  checklist: Object.fromEntries(voiceCandidateChecklistKeys.map((key) => [key, true])),
  notes: 'Imported-file review complete.',
});

before(async () => fs.mkdir(root, {recursive: true}));
after(async () => fs.rm(root, {recursive: true, force: true}));

test('candidate generation preserves the existing final WAV and exposes one baseline plus two generated files', async () => {
  const fixture = await prepare();
  for (const [relative, bytes] of Object.entries(fixture.original)) {
    assert.deepEqual(await fs.readFile(path.join(root, relative)), bytes, `${relative} changed during candidate generation`);
  }
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  assert.equal(view.candidates.length, 3);
  assert.equal(view.candidates[0].role, 'baseline');
  assert.equal(view.candidates[0].selectable, false);
  assert.deepEqual(view.candidates.slice(1).map((item) => item.candidateId), ['candidate-001', 'candidate-002']);
});

test('CosyVoice part receipts accept canonical SHA values regardless of hexadecimal case', async () => {
  const fixture = await prepare();
  const candidateId = 'candidate-003';
  const candidateRoot = path.join(root, 'audio', 'voice-candidates', candidateId);
  const sourceTextPath = path.join(candidateRoot, 'narration-parts', 'part-001.source.txt');
  const ttsTextPath = path.join(candidateRoot, 'parts', 'part-001.tts.txt');
  const partAudioPath = path.join(candidateRoot, 'parts', 'part-001.wav');
  const partReceiptPath = path.join(candidateRoot, 'parts', 'part-001.recipe.json');
  const audioPath = path.join(candidateRoot, 'narration.candidate.wav');
  const recipePath = path.join(candidateRoot, 'voice.candidate.recipe.json');
  const text = '测试候选配音。';
  const audio = pcmWav(880);
  const textSha256 = sha256(text);
  const audioSha256 = sha256(audio);
  await Promise.all([
    fs.mkdir(path.dirname(sourceTextPath), {recursive: true}),
    fs.mkdir(path.dirname(ttsTextPath), {recursive: true}),
  ]);
  await Promise.all([
    fs.writeFile(sourceTextPath, text, 'utf8'),
    fs.writeFile(ttsTextPath, text, 'utf8'),
    fs.writeFile(partAudioPath, audio),
    fs.writeFile(audioPath, audio),
    writeJson(path.relative(root, partReceiptPath), {
      text_sha256: textSha256.toUpperCase(), output_chunks: 1,
      frontend_preflight: {policy: 'exactly-one-internal-utterance-required', utterance_count: 1},
      output: {sha256: audioSha256.toUpperCase()},
    }),
  ]);
  const pronunciationPath = path.join(root, 'input', 'pronunciation.effective.json');
  const pronunciationApprovalPath = path.join(root, 'qa', 'pronunciation-approval.json');
  await writeJson(path.relative(root, recipePath), {
    schemaVersion: 'autovideo-voice-receipt/v2', route: 'cosyvoice-preset-14',
    model: 'CosyVoice-300M-SFT', speaker: '中文女', precision: 'FP32', stream: false, speed: 1.03, seed: 7,
    narrationLockSha256: fixture.narrationSha256, narrationSha256: fixture.narrationSha256,
    pronunciation: {
      path: rootRelative(pronunciationPath), sha256: sha256(await fs.readFile(pronunciationPath)),
      approval: {path: rootRelative(pronunciationApprovalPath), sha256: sha256(await fs.readFile(pronunciationApprovalPath))},
    },
    parts: [{
      id: 'part-001', sourceTextPath: rootRelative(sourceTextPath), ttsTextPath: rootRelative(ttsTextPath),
      sourceTextSha256: textSha256.toUpperCase(), ttsTextSha256: textSha256.toUpperCase(),
      audioPath: rootRelative(partAudioPath), receiptPath: rootRelative(partReceiptPath),
      outputSha256: audioSha256.toUpperCase(),
    }],
    outputSha256: audioSha256.toUpperCase(),
  });
  const registered = await registerGeneratedVoiceCandidate({formalRoot: root, projectId: fixture.projectId, candidateId, audioPath, recipePath});
  assert.equal(registered.manifest.candidateId, candidateId);
  assert.equal(registered.manifest.technicalQa.status, 'passed');
});

test('voice review requires every active file to finish and cannot select the comparison-only baseline', async () => {
  const fixture = await prepare();
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  await assert.rejects(() => saveVoiceCandidateReview({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener',
    rawInput: acceptedInput(view, view.candidates[0].candidateId),
  }), /comparison-only candidate/i);
  const partial = acceptedInput(view);
  partial.playedCandidateIds = partial.playedCandidateIds.slice(1);
  const review = await saveVoiceCandidateReview({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener', rawInput: partial,
  });
  assert.equal(review.status, 'in-progress');
});

test('creator-delegated simulation promotes a technical-only candidate without claiming playback', async () => {
  const fixture = await prepare();
  const delegationPath = await writeJson('receipts/creator-delegation/internal-simulation.json', {
    schemaVersion: 'autovideo-creator-delegation/v1', projectId: fixture.projectId, delegate: 'codex',
    scope: ['internal-only-workflow-simulation'],
    constraints: {audioPlaybackAllowed: false, microphoneAllowed: false, publicReleaseAllowed: false},
  });
  let stateBinding = null;
  const promoted = await promoteVoiceCandidate({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'codex-simulation',
    simulation: {
      mode: 'creator-delegated-internal-only', selectedCandidateId: 'candidate-001',
      delegationReceipt: rootRelative(delegationPath), reason: 'Creator delegated an internal silent simulation.',
    },
    commitState: async (binding) => { stateBinding = binding; return {ok: true}; },
  });
  assert.equal(promoted.approval.approvalScope, 'technical-only');
  assert.equal(promoted.approval.humanListening.status, 'not-performed');
  assert.equal(promoted.approval.publicReleaseApproved, false);
  assert.equal(stateBinding.approvalScope, 'technical-only');
  const listening = JSON.parse(await fs.readFile(path.join(root, 'audio', 'listening-review.json'), 'utf8'));
  assert.equal(listening.status, 'not-performed');
  assert.equal(listening.playbackSeconds, 0);
  assert.equal(listening.checklist.fullPlayback, false);
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  assert.equal(view.review.status, 'approved');
  assert.equal(view.approval.approvalScope, 'technical-only');
});

test('promotion failure restores the prior final truth and successful promotion binds all selected bytes', async () => {
  const fixture = await prepare();
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  await saveVoiceCandidateReview({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener', rawInput: acceptedInput(view),
  });
  await assert.rejects(() => promoteVoiceCandidate({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener', injectFailureAt: 'recipe',
  }), /Injected voice promotion failure/);
  for (const [relative, bytes] of Object.entries(fixture.original)) {
    assert.deepEqual(await fs.readFile(path.join(root, relative)), bytes, `${relative} was not rolled back`);
  }
  let stateBinding = null;
  const promoted = await promoteVoiceCandidate({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener',
    commitState: async (binding) => { stateBinding = binding; return {ok: true}; },
  });
  assert.equal(promoted.stateResult.ok, true);
  assert.equal(stateBinding.selectedCandidateId, 'candidate-002');
  const selected = view.candidates.find((candidate) => candidate.candidateId === 'candidate-002');
  assert.equal(await sha256(await fs.readFile(path.join(root, 'audio', 'narration.final.wav'))), selected.audioSha256);
  const approval = JSON.parse(await fs.readFile(path.join(root, 'audio', 'approval.json'), 'utf8'));
  assert.equal(approval.schemaVersion, 'autovideo-audio-approval/v4');
  assert.equal(approval.approvalScope, 'human-listening');
  assert.equal(approval.selectedCandidateId, 'candidate-002');
  const finalReview = JSON.parse(await fs.readFile(path.join(root, 'audio', 'listening-review.json'), 'utf8'));
  assert.equal(finalReview.schemaVersion, 'autovideo-listening-review/v2');
  assert.equal(finalReview.narrationSha256, fixture.narrationSha256);
  assert.equal(finalReview.status, 'ready-for-approval');
  assert.equal(finalReview.playbackSeconds, finalReview.audio.durationSeconds);
  assert.deepEqual(finalReview.checklist, {
    fullPlayback: true,
    terminology: true,
    pauses: true,
    clipping: true,
    segmentJoins: true,
  });
  assert.deepEqual(finalReview.candidateChecklist, Object.fromEntries(voiceCandidateChecklistKeys.map((key) => [key, true])));
  const handoff = JSON.parse(await fs.readFile(path.join(root, 'audio-handoff.json'), 'utf8'));
  assert.equal(handoff.status, 'pending-alignment');
  assert.equal(handoff.audio.sha256, selected.audioSha256);
  assert.equal(handoff.alignment.status, 'stale');
  const projectState = JSON.parse(await fs.readFile(path.join(root, 'project-state.json'), 'utf8'));
  assert.equal(projectState.stage, 'audio-approved-alignment-required');
  assert.equal(projectState.release.phase, 'production');
  assert.equal(projectState.release.internalReviewReady, false);
  assert.equal(projectState.release.previousVideo.path, 'renders/old.mp4');
});

test('a failed database commit rolls back promoted files and candidate mutation closes the review', async () => {
  const fixture = await prepare();
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  await saveVoiceCandidateReview({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener', rawInput: acceptedInput(view),
  });
  await assert.rejects(() => promoteVoiceCandidate({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener',
    commitState: async () => { throw new Error('database unavailable'); },
  }), /database unavailable/);
  for (const [relative, bytes] of Object.entries(fixture.original)) {
    assert.deepEqual(await fs.readFile(path.join(root, relative)), bytes, `${relative} was not rolled back after DB failure`);
  }
  await fs.appendFile(path.join(root, 'audio', 'voice-candidates', 'candidate-002', 'narration.candidate.wav'), 'changed');
  await assert.rejects(
    () => buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId}),
    /candidate bytes changed/i,
  );
});

test('startup recovery rolls back a prepared promotion when workbench approval was not committed', async () => {
  const fixture = await prepare();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-recovery-test-'));
  const targets = [];
  for (const [name, relative] of [
    ['audio', 'audio/narration.final.wav'],
    ['recipe', 'audio/voice.recipe.json'],
  ]) {
    const target = path.join(root, relative);
    const backup = path.join(tempRoot, `${name}.backup`);
    await fs.copyFile(target, backup);
    targets.push({name, path: relative, existed: true, backup});
  }
  await fs.writeFile(path.join(root, 'audio', 'narration.final.wav'), pcmWav(880));
  await writeJson('audio/voice.recipe.json', {schemaVersion: 'interrupted-write'});
  await writeJson('audio/voice-promotion.json', {
    schemaVersion: 'autovideo-voice-promotion/v1', projectId: fixture.projectId,
    transactionId: 'rollback-recovery', status: 'prepared', selectedCandidateId: 'candidate-002',
    reviewSha256: 'a'.repeat(64), startedAt: '2026-01-03T00:00:00.000Z', tempRoot, targets,
  });

  const result = await recoverInterruptedVoicePromotion({formalRoot: root, stage: {status: 'needs-review'}});
  assert.deepEqual(result, {recovered: true, action: 'rolled-back', transactionId: 'rollback-recovery'});
  assert.deepEqual(await fs.readFile(path.join(root, 'audio', 'narration.final.wav')), fixture.original['audio/narration.final.wav']);
  assert.deepEqual(await fs.readFile(path.join(root, 'audio', 'voice.recipe.json')), fixture.original['audio/voice.recipe.json']);
  await assert.rejects(() => fs.access(path.join(root, 'audio', 'voice-promotion.json')));
  await assert.rejects(() => fs.access(tempRoot));
});

test('startup recovery finalizes a prepared receipt when workbench approval already committed', async () => {
  const fixture = await prepare();
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  await saveVoiceCandidateReview({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener', rawInput: acceptedInput(view),
  });
  const promoted = await promoteVoiceCandidate({formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener'});
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-recovery-test-'));
  await writeJson('audio/voice-promotion.json', {
    schemaVersion: 'autovideo-voice-promotion/v1', projectId: fixture.projectId,
    transactionId: 'commit-recovery', status: 'prepared', selectedCandidateId: 'candidate-002',
    reviewSha256: promoted.promotion.reviewSha256, startedAt: promoted.promotion.startedAt, tempRoot, targets: [],
  });

  const result = await recoverInterruptedVoicePromotion({
    formalRoot: root,
    stage: {status: 'approved', approvalScope: 'human-listening', approvedAt: '2026-01-03T00:00:00.000Z'},
  });
  assert.deepEqual(result, {recovered: true, action: 'commit-finalized', transactionId: 'commit-recovery'});
  const receipt = JSON.parse(await fs.readFile(path.join(root, 'audio', 'voice-promotion.json'), 'utf8'));
  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.recoveredCommit, true);
  assert.equal(receipt.audioSha256, promoted.approval.audioSha256);
  assert.equal(receipt.recipeSha256, promoted.approval.recipeSha256);
  await assert.rejects(() => fs.access(tempRoot));
});

test('startup recovery fails closed when a required promotion backup is missing', async () => {
  const fixture = await prepare();
  const originalAudio = await fs.readFile(path.join(root, 'audio', 'narration.final.wav'));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-recovery-test-'));
  const missingBackup = path.join(tempRoot, 'audio.backup');
  await writeJson('audio/voice-promotion.json', {
    schemaVersion: 'autovideo-voice-promotion/v1', projectId: fixture.projectId,
    transactionId: 'missing-backup', status: 'prepared', selectedCandidateId: 'candidate-002',
    reviewSha256: 'b'.repeat(64), startedAt: '2026-01-03T00:00:00.000Z', tempRoot,
    targets: [{name: 'audio', path: 'audio/narration.final.wav', existed: true, backup: missingBackup}],
  });

  await assert.rejects(
    () => recoverInterruptedVoicePromotion({formalRoot: root, stage: {status: 'needs-review'}}),
    /backup is missing/i,
  );
  assert.deepEqual(await fs.readFile(path.join(root, 'audio', 'narration.final.wav')), originalAudio);
  const journal = JSON.parse(await fs.readFile(path.join(root, 'audio', 'voice-promotion.json'), 'utf8'));
  assert.equal(journal.status, 'prepared');
});

test('reopening archives approval and review while preserving the promoted WAV as the next comparison baseline', async () => {
  const fixture = await prepare();
  const view = await buildVoiceCandidateReview({formalRoot: root, projectId: fixture.projectId});
  await saveVoiceCandidateReview({
    formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener', rawInput: acceptedInput(view),
  });
  await promoteVoiceCandidate({formalRoot: root, projectId: fixture.projectId, stage: fixture.stage, reviewer: 'listener'});
  const finalBefore = await fs.readFile(path.join(root, 'audio', 'narration.final.wav'));
  await reopenVoiceCandidateReview({formalRoot: root});
  assert.deepEqual(await fs.readFile(path.join(root, 'audio', 'narration.final.wav')), finalBefore);
  await assert.rejects(() => fs.access(path.join(root, 'audio', 'approval.json')));
  await assert.rejects(() => fs.access(path.join(root, 'audio', 'voice-candidates', 'review.json')));
  const handoff = JSON.parse(await fs.readFile(path.join(root, 'audio-handoff.json'), 'utf8'));
  const state = JSON.parse(await fs.readFile(path.join(root, 'project-state.json'), 'utf8'));
  assert.equal(handoff.status, 'voice-selection-pending');
  assert.equal(handoff.approvalScope, null);
  assert.equal(state.stage, 'voice-selection-pending');
  assert.equal(state.release.internalReviewReady, false);
  const history = await fs.readdir(path.join(root, 'audio', 'voice-candidates', 'history'));
  assert.equal(history.some((name) => name.startsWith('approval-')), true);
  assert.equal(history.some((name) => name.startsWith('review-')), true);
});
