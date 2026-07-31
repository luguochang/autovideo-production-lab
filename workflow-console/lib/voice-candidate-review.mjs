import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';

import {sha256File, workspaceRoot} from './project-store.mjs';

const run = promisify(execFile);
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);
const readOptionalJson = async (filePath) => {
  try { return await readJson(filePath); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
};
const portable = (value) => value.replaceAll('\\', '/');
const relativePath = (root, target) => portable(path.relative(root, target));
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value ?? ''));
const normalizeSha256 = (value) => String(value ?? '').toLowerCase();
const candidateIdPattern = /^(?:candidate-\d{3}|baseline-[a-f0-9]{12})$/;
const reviewChecklistKeys = ['naturalness', 'breathing', 'pronunciation', 'segmentJoins', 'noArtifacts'];

const pathsFor = (formalRoot) => ({
  root: path.join(formalRoot, 'audio', 'voice-candidates'),
  index: path.join(formalRoot, 'audio', 'voice-candidates', 'index.json'),
  review: path.join(formalRoot, 'audio', 'voice-candidates', 'review.json'),
  finalAudio: path.join(formalRoot, 'audio', 'narration.final.wav'),
  finalRecipe: path.join(formalRoot, 'audio', 'voice.recipe.json'),
  finalReview: path.join(formalRoot, 'audio', 'listening-review.json'),
  approval: path.join(formalRoot, 'audio', 'approval.json'),
  promotion: path.join(formalRoot, 'audio', 'voice-promotion.json'),
  handoff: path.join(formalRoot, 'audio-handoff.json'),
  projectState: path.join(formalRoot, 'project-state.json'),
  lock: path.join(formalRoot, 'NarrationLock.json'),
  pronunciation: path.join(formalRoot, 'input', 'pronunciation.effective.json'),
  pronunciationApproval: path.join(formalRoot, 'qa', 'pronunciation-approval.json'),
});

const resolveInside = (root, relative, label) => {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error(`${label} must be a project-relative path.`);
  const target = path.resolve(root, relative);
  const relation = path.relative(root, target);
  if (relation.startsWith('..') || path.isAbsolute(relation)) throw new Error(`${label} leaves the formal project.`);
  return target;
};

const parseNumber = (text, pattern) => {
  const matches = [...text.matchAll(pattern)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
};

const inspectPcmWav = async (audioPath) => {
  const {stdout} = await run('ffprobe.exe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', audioPath], {
    windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(stdout);
  const stream = report.streams?.find((item) => item.codec_type === 'audio');
  if (!stream || stream.codec_name !== 'pcm_s16le' || Number(stream.sample_rate) !== 48_000 || Number(stream.channels) !== 1) {
    throw new Error('Voice candidate must be 48 kHz mono PCM s16le WAV.');
  }
  const durationSeconds = Number(report.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Voice candidate duration is invalid.');
  await run('ffmpeg.exe', ['-v', 'error', '-i', audioPath, '-f', 'null', 'NUL'], {
    windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
  });
  const [{stderr: loudnessLog}, {stderr: volumeLog}] = await Promise.all([
    run('ffmpeg.exe', ['-hide_banner', '-i', audioPath, '-filter_complex', 'ebur128=peak=true', '-f', 'null', 'NUL'], {
      windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    }),
    run('ffmpeg.exe', ['-hide_banner', '-i', audioPath, '-af', 'volumedetect', '-f', 'null', 'NUL'], {
      windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    }),
  ]);
  const integratedLufs = parseNumber(loudnessLog, /I:\s*(-?[\d.]+)\s*LUFS/g);
  const truePeakDbfs = parseNumber(loudnessLog, /Peak:\s*(-?[\d.]+)\s*dBFS/g);
  const maxVolumeDb = parseNumber(volumeLog, /max_volume:\s*(-?[\d.]+)\s*dB/g);
  if (![integratedLufs, truePeakDbfs, maxVolumeDb].every(Number.isFinite)) throw new Error('Voice candidate signal metrics could not be measured.');
  if (maxVolumeDb === -Infinity || maxVolumeDb < -60) throw new Error('Voice candidate appears silent.');
  return {
    status: 'passed',
    durationSeconds,
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    fullDecodePassed: true,
    integratedLufs,
    truePeakDbfs,
    maxVolumeDb,
  };
};

const validateRecipeEvidence = async ({formalRoot, recipe, audioSha256, lock, pronunciation, pronunciationApproval}) => {
  if (recipe.schemaVersion !== 'autovideo-voice-receipt/v2'
    || recipe.narrationSha256 !== lock.normalizedSha256
    || String(recipe.outputSha256 ?? '').toLowerCase() !== audioSha256) {
    throw new Error('Voice candidate recipe identity, narration, or output hash is stale.');
  }
  if (recipe.route === 'cosyvoice-preset-14') {
    if (recipe.speaker !== '中文女' || recipe.precision !== 'FP32' || recipe.stream !== false
      || Number(recipe.speed) !== 1.03 || Number(recipe.seed) !== 7) {
      throw new Error('Voice candidate does not use the locked CosyVoice preset 14 parameters.');
    }
    if (recipe.pronunciation?.sha256 !== await sha256File(path.join(formalRoot, recipe.pronunciation.path))
      || recipe.pronunciation?.approval?.sha256 !== await sha256File(path.join(formalRoot, recipe.pronunciation.approval.path))
      || recipe.pronunciation.sha256 !== await sha256File(pronunciation)
      || recipe.pronunciation.approval.sha256 !== await sha256File(pronunciationApproval)) {
      throw new Error('Voice candidate pronunciation bindings are stale.');
    }
  } else if (recipe.route === 'original') {
    const sourcePath = resolveInside(workspaceRoot, recipe.source, 'original voice source');
    if (recipe.sourceSha256 !== await sha256File(sourcePath)
      || recipe.narrationLockSha256 !== lock.sourceSha256) {
      throw new Error('Original voice candidate source or NarrationLock provenance is stale.');
    }
  } else {
    throw new Error(`Unsupported voice candidate route: ${recipe.route}`);
  }
  for (const part of recipe.parts ?? []) {
    const [sourceSha, ttsSha, audioSha, receipt, receiptSha] = await Promise.all([
      sha256File(resolveInside(formalRoot, part.sourceTextPath, 'part source text')),
      sha256File(resolveInside(formalRoot, part.ttsTextPath, 'part TTS text')),
      sha256File(resolveInside(formalRoot, part.audioPath, 'part audio')),
      readJson(resolveInside(formalRoot, part.receiptPath, 'part recipe')),
      sha256File(resolveInside(formalRoot, part.receiptPath, 'part recipe')),
    ]);
    if (sourceSha !== normalizeSha256(part.sourceTextSha256)
      || ttsSha !== normalizeSha256(part.ttsTextSha256)
      || audioSha !== normalizeSha256(part.outputSha256)
      || normalizeSha256(receipt.text_sha256) !== normalizeSha256(part.ttsTextSha256)
      || normalizeSha256(receipt.output?.sha256) !== normalizeSha256(part.outputSha256)
      || receipt.frontend_preflight?.policy !== 'exactly-one-internal-utterance-required'
      || Number(receipt.frontend_preflight?.utterance_count) !== 1 || Number(receipt.output_chunks) !== 1
      || !isSha256(receiptSha)) {
      throw new Error(`Voice candidate part evidence is stale for ${part.id}.`);
    }
  }
  if ((recipe.parts?.length ?? 0) > 1) {
    const [manifestSha, receiptSha, receipt] = await Promise.all([
      sha256File(resolveInside(formalRoot, recipe.merge?.manifestPath, 'merge manifest')),
      sha256File(resolveInside(formalRoot, recipe.merge?.receiptPath, 'merge receipt')),
      readJson(resolveInside(formalRoot, recipe.merge?.receiptPath, 'merge receipt')),
    ]);
    if (recipe.merge?.schemaVersion !== 'autovideo-breath-merge/v1'
      || manifestSha !== recipe.merge.manifestSha256 || receiptSha !== recipe.merge.receiptSha256
      || String(receipt.output?.sha256 ?? '').toLowerCase() !== audioSha256
      || (receipt.gaps ?? []).length !== recipe.parts.length - 1
      || !(receipt.gaps ?? []).every((gap) => Number(gap.actualActiveVoiceGapSeconds) >= 0.42
        && Number(gap.actualActiveVoiceGapSeconds) <= 0.65)) {
      throw new Error('Voice candidate breath-merge evidence is stale or outside the approved gap range.');
    }
  }
};

export const nextVoiceCandidateId = async (formalRoot) => {
  const root = pathsFor(formalRoot).root;
  const names = await fs.readdir(root).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error));
  const sequence = names.map((name) => /^candidate-(\d{3})$/.exec(name)).filter(Boolean).map((match) => Number(match[1]));
  const latest = sequence.length ? Math.max(...sequence) : 0;
  if (latest) {
    const latestId = `candidate-${String(latest).padStart(3, '0')}`;
    const completed = await fs.access(path.join(root, latestId, 'candidate.json')).then(() => true, () => false);
    if (!completed) return latestId;
  }
  return `candidate-${String(latest + 1).padStart(3, '0')}`;
};

const validateCandidateManifest = async ({formalRoot, projectId, manifestPath, lock, currentPronunciationSha, currentPronunciationApprovalSha}) => {
  const manifest = await readJson(manifestPath);
  if (manifest.schemaVersion !== 'autovideo-voice-candidate/v1' || manifest.projectId !== projectId
    || !candidateIdPattern.test(manifest.candidateId) || manifest.narrationSha256 !== lock.normalizedSha256) {
    throw new Error('Voice candidate manifest identity is invalid.');
  }
  const audioPath = resolveInside(formalRoot, manifest.audio.path, 'candidate audio');
  const recipePath = resolveInside(formalRoot, manifest.recipe.path, 'candidate recipe');
  const [audioSha256, recipeSha256, recipe] = await Promise.all([
    sha256File(audioPath), sha256File(recipePath), readJson(recipePath),
  ]);
  if (audioSha256 !== manifest.audio.sha256 || recipeSha256 !== manifest.recipe.sha256) {
    throw new Error(`Voice candidate bytes changed for ${manifest.candidateId}.`);
  }
  if (manifest.role === 'generated') {
    if (recipe.route === 'cosyvoice-preset-14') {
      if (manifest.pronunciation?.sha256 !== currentPronunciationSha
        || manifest.pronunciationApproval?.sha256 !== currentPronunciationApprovalSha) {
        throw new Error(`Voice candidate pronunciation binding is stale for ${manifest.candidateId}.`);
      }
      await validateRecipeEvidence({
        formalRoot, recipe, audioSha256, lock,
        pronunciation: resolveInside(formalRoot, manifest.pronunciation.path, 'candidate pronunciation'),
        pronunciationApproval: resolveInside(formalRoot, manifest.pronunciationApproval.path, 'candidate pronunciation approval'),
      });
    } else {
      await validateRecipeEvidence({formalRoot, recipe, audioSha256, lock, pronunciation: null, pronunciationApproval: null});
    }
  }
  if (manifest.technicalQa?.status !== 'passed' || manifest.technicalQa?.audioSha256 !== audioSha256) {
    throw new Error(`Voice candidate technical QA is missing or stale for ${manifest.candidateId}.`);
  }
  return {...manifest, manifestPath, manifestSha256: await sha256File(manifestPath), audioPath, recipePath, recipe};
};

const updateCandidateIndex = async ({formalRoot, projectId, candidateId, baselineId = null}) => {
  const paths = pathsFor(formalRoot);
  const current = await readOptionalJson(paths.index);
  const generated = [...new Set([...(current?.generatedCandidateIds ?? []), candidateId])].filter((id) => /^candidate-\d{3}$/.test(id));
  const activeGenerated = generated.slice(-2);
  const activeCandidateIds = [...(baselineId ? [baselineId] : (current?.baselineCandidateId ? [current.baselineCandidateId] : [])), ...activeGenerated];
  const index = {
    schemaVersion: 'autovideo-voice-candidate-index/v1',
    projectId,
    baselineCandidateId: baselineId ?? current?.baselineCandidateId ?? null,
    generatedCandidateIds: generated,
    activeCandidateIds,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(paths.root, {recursive: true});
  await fs.writeFile(paths.index, serialize(index), 'utf8');
  return index;
};

export const snapshotExistingFinalAsBaseline = async ({formalRoot, projectId}) => {
  const paths = pathsFor(formalRoot);
  const [audioExists, recipeExists] = await Promise.all([
    fs.access(paths.finalAudio).then(() => true).catch(() => false),
    fs.access(paths.finalRecipe).then(() => true).catch(() => false),
  ]);
  if (!audioExists || !recipeExists) return null;
  const [audioSha256, recipeSha256, recipe, lock] = await Promise.all([
    sha256File(paths.finalAudio), sha256File(paths.finalRecipe), readJson(paths.finalRecipe), readJson(paths.lock),
  ]);
  if (String(recipe.outputSha256 ?? recipe.output?.sha256 ?? '').toLowerCase() !== audioSha256) return null;
  const candidateId = `baseline-${audioSha256.slice(0, 12)}`;
  const root = path.join(paths.root, candidateId);
  const audioPath = path.join(root, 'narration.baseline.wav');
  const recipePath = path.join(root, 'voice.baseline.recipe.json');
  const manifestPath = path.join(root, 'candidate.json');
  if (!await fs.access(manifestPath).then(() => true).catch(() => false)) {
    await fs.mkdir(root, {recursive: true});
    await Promise.all([fs.copyFile(paths.finalAudio, audioPath), fs.copyFile(paths.finalRecipe, recipePath)]);
    const technical = await inspectPcmWav(audioPath);
    await fs.writeFile(manifestPath, serialize({
      schemaVersion: 'autovideo-voice-candidate/v1', projectId, candidateId, role: 'baseline', selectable: false,
      generatedAt: new Date().toISOString(), narrationSha256: lock.normalizedSha256,
      audio: {path: relativePath(formalRoot, audioPath), sha256: audioSha256},
      recipe: {path: relativePath(formalRoot, recipePath), sha256: recipeSha256},
      pronunciation: null, pronunciationApproval: null,
      technicalQa: {...technical, audioSha256},
      selectionBlocker: 'Baseline is comparison-only because it predates the current pronunciation/effective candidate contract.',
    }), 'utf8');
  }
  await updateCandidateIndex({formalRoot, projectId, candidateId: null, baselineId: candidateId});
  return candidateId;
};

export const registerGeneratedVoiceCandidate = async ({formalRoot, projectId, candidateId, audioPath, recipePath}) => {
  if (!/^candidate-\d{3}$/.test(candidateId)) throw new Error('Generated voice candidate id is invalid.');
  const paths = pathsFor(formalRoot);
  const [lock, recipe, audioSha256, recipeSha256] = await Promise.all([
    readJson(paths.lock), readJson(recipePath), sha256File(audioPath), sha256File(recipePath),
  ]);
  const requiresPronunciation = recipe.route === 'cosyvoice-preset-14';
  const [pronunciationSha256, pronunciationApprovalSha256] = requiresPronunciation
    ? await Promise.all([sha256File(paths.pronunciation), sha256File(paths.pronunciationApproval)])
    : [null, null];
  await validateRecipeEvidence({
    formalRoot, recipe, audioSha256, lock, pronunciation: paths.pronunciation, pronunciationApproval: paths.pronunciationApproval,
  });
  const technical = await inspectPcmWav(audioPath);
  const manifestPath = path.join(paths.root, candidateId, 'candidate.json');
  const manifest = {
    schemaVersion: 'autovideo-voice-candidate/v1', projectId, candidateId, role: 'generated', selectable: true,
    generatedAt: new Date().toISOString(), narrationSha256: lock.normalizedSha256,
    audio: {path: relativePath(formalRoot, audioPath), sha256: audioSha256},
    recipe: {path: relativePath(formalRoot, recipePath), sha256: recipeSha256},
    pronunciation: requiresPronunciation ? {path: relativePath(formalRoot, paths.pronunciation), sha256: pronunciationSha256} : null,
    pronunciationApproval: requiresPronunciation ? {path: relativePath(formalRoot, paths.pronunciationApproval), sha256: pronunciationApprovalSha256} : null,
    technicalQa: {...technical, audioSha256}, selectionBlocker: null,
  };
  await fs.writeFile(manifestPath, serialize(manifest), 'utf8');
  await updateCandidateIndex({formalRoot, projectId, candidateId});
  return {manifest, manifestPath, manifestSha256: await sha256File(manifestPath)};
};

const reviewSchema = z.object({
  decision: z.enum(['pending', 'accepted', 'retake']),
  selectedCandidateId: z.string().nullable().default(null),
  playedCandidateIds: z.array(z.string()).max(3).default([]),
  checklist: z.object(Object.fromEntries(reviewChecklistKeys.map((key) => [key, z.boolean()]))),
  notes: z.string().max(4000).default(''),
});
export const voiceCandidateReviewInputSchema = reviewSchema;

const delegatedSimulationSchema = z.object({
  mode: z.literal('creator-delegated-internal-only'),
  selectedCandidateId: z.string().regex(/^candidate-\d{3}$/),
  delegationReceipt: z.string().min(1),
  reason: z.string().min(2).max(1000),
});
export const voiceCandidateSimulationInputSchema = delegatedSimulationSchema;

const evidenceFor = async ({formalRoot, projectId}) => {
  const paths = pathsFor(formalRoot);
  const [index, lock] = await Promise.all([readJson(paths.index), readJson(paths.lock)]);
  const pronunciationSha256 = await sha256File(paths.pronunciation).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  const pronunciationApprovalSha256 = await sha256File(paths.pronunciationApproval).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (index.schemaVersion !== 'autovideo-voice-candidate-index/v1' || index.projectId !== projectId
    || !Array.isArray(index.activeCandidateIds) || !index.activeCandidateIds.length
    || new Set(index.activeCandidateIds).size !== index.activeCandidateIds.length) {
    throw new Error('Voice candidate index is invalid or empty.');
  }
  const candidates = [];
  for (const candidateId of index.activeCandidateIds) {
    if (!candidateIdPattern.test(candidateId)) throw new Error('Voice candidate index contains an invalid id.');
    candidates.push(await validateCandidateManifest({
      formalRoot, projectId, manifestPath: path.join(paths.root, candidateId, 'candidate.json'), lock,
      currentPronunciationSha: pronunciationSha256, currentPronunciationApprovalSha: pronunciationApprovalSha256,
    }));
  }
  if (!candidates.some((candidate) => candidate.selectable)) throw new Error('Voice candidate set contains no selectable generated candidate.');
  const bindings = {
    narrationLock: {path: relativePath(formalRoot, paths.lock), sha256: await sha256File(paths.lock)},
    pronunciation: pronunciationSha256 ? {path: relativePath(formalRoot, paths.pronunciation), sha256: pronunciationSha256} : null,
    pronunciationApproval: pronunciationApprovalSha256 ? {path: relativePath(formalRoot, paths.pronunciationApproval), sha256: pronunciationApprovalSha256} : null,
    index: {path: relativePath(formalRoot, paths.index), sha256: await sha256File(paths.index)},
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId, manifestSha256: candidate.manifestSha256,
      audioSha256: candidate.audio.sha256, recipeSha256: candidate.recipe.sha256,
    })),
  };
  return {formalRoot, paths, index, lock, candidates, bindings};
};

const reviewReady = (review, candidates) => review.decision === 'accepted'
  && candidates.some((candidate) => candidate.candidateId === review.selectedCandidateId && candidate.selectable)
  && candidates.every((candidate) => review.playedCandidateIds.includes(candidate.candidateId))
  && reviewChecklistKeys.every((key) => review.checklist?.[key] === true);

const approvalCurrent = async (approval, evidence) => {
  const approvalScope = approval?.approvalScope;
  if (approval?.schemaVersion !== 'autovideo-audio-approval/v4' || approval.projectId !== evidence.lock.projectId
    || !['human-listening', 'technical-only'].includes(approvalScope)
    || JSON.stringify(approval.candidateBindings) !== JSON.stringify(evidence.bindings)
    || !isSha256(approval.audioSha256) || !isSha256(approval.recipeSha256)) return false;
  if (approvalScope === 'human-listening' && approval.humanListening?.status !== 'approved') return false;
  if (approvalScope === 'technical-only'
    && (approval.humanListening?.status !== 'not-performed'
      || approval.delegatedSimulation?.mode !== 'creator-delegated-internal-only'
      || !isSha256(approval.delegatedSimulation?.receiptSha256))) return false;
  if (approvalScope === 'technical-only') {
    const delegationPath = resolveInside(evidence.formalRoot, approval.delegatedSimulation.receiptPath, 'creator delegation receipt');
    if (await sha256File(delegationPath).catch(() => null) !== approval.delegatedSimulation.receiptSha256) return false;
  }
  return await sha256File(evidence.paths.finalAudio).catch(() => null) === approval.audioSha256
    && await sha256File(evidence.paths.finalRecipe).catch(() => null) === approval.recipeSha256;
};

export const buildVoiceCandidateReview = async ({formalRoot, projectId}) => {
  const evidence = await evidenceFor({formalRoot, projectId});
  const [review, approval] = await Promise.all([readOptionalJson(evidence.paths.review), readOptionalJson(evidence.paths.approval)]);
  const bindingsCurrent = JSON.stringify(review?.bindings) === JSON.stringify(evidence.bindings);
  const currentApproval = await approvalCurrent(approval, evidence);
  return {
    schemaVersion: 'autovideo-voice-candidate-review-view/v1', projectId,
    candidates: evidence.candidates.map((candidate) => ({
      candidateId: candidate.candidateId, role: candidate.role, selectable: candidate.selectable,
      selectionBlocker: candidate.selectionBlocker, generatedAt: candidate.generatedAt,
      durationSeconds: candidate.technicalQa.durationSeconds,
      integratedLufs: candidate.technicalQa.integratedLufs,
      truePeakDbfs: candidate.technicalQa.truePeakDbfs,
      audioSha256: candidate.audio.sha256,
      audioUrl: `/api/projects/${encodeURIComponent(projectId)}/voice-candidate-review/media/${encodeURIComponent(candidate.candidateId)}`,
    })),
    review: {
      status: currentApproval ? 'approved' : review && !bindingsCurrent ? 'stale' : (review?.status ?? 'not-started'),
      decision: review?.decision ?? 'pending', selectedCandidateId: review?.selectedCandidateId ?? null,
      playedCandidateIds: review?.playedCandidateIds ?? [],
      checklist: Object.fromEntries(reviewChecklistKeys.map((key) => [key, review?.checklist?.[key] === true])),
      notes: review?.notes ?? '', reviewedBy: review?.reviewedBy ?? null, updatedAt: review?.updatedAt ?? null,
      readyForApproval: bindingsCurrent && reviewReady(review, evidence.candidates),
    },
    approval: currentApproval ? approval : null,
  };
};

export const saveVoiceCandidateReview = async ({formalRoot, projectId, stage, rawInput, reviewer = 'user'}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Voice candidate review requires a review-ready voice-final stage.');
  const input = reviewSchema.parse(rawInput);
  const evidence = await evidenceFor({formalRoot, projectId});
  const candidateIds = evidence.candidates.map((candidate) => candidate.candidateId);
  if (input.playedCandidateIds.some((id) => !candidateIds.includes(id))) throw new Error('Voice review contains an unknown played candidate.');
  if (input.selectedCandidateId && !evidence.candidates.some((candidate) => candidate.candidateId === input.selectedCandidateId && candidate.selectable)) {
    throw new Error('Voice review selected an unavailable or comparison-only candidate.');
  }
  if (input.decision === 'retake' && input.notes.trim().length < 2) throw new Error('Retake notes must explain the audible problem.');
  const review = {
    schemaVersion: 'autovideo-voice-candidate-human-review/v1', projectId,
    status: reviewReady(input, evidence.candidates) ? 'ready-for-approval' : 'in-progress',
    bindings: evidence.bindings, ...input, reviewedBy: reviewer, updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return review;
};

const replaceFromStaging = async ({staged, target}) => {
  await fs.copyFile(staged, `${target}.promoting`);
  await fs.rm(target, {force: true});
  await fs.rename(`${target}.promoting`, target);
};

export const recoverInterruptedVoicePromotion = async ({formalRoot, stage = null}) => {
  const paths = pathsFor(formalRoot);
  const journal = await readOptionalJson(paths.promotion);
  if (!journal || journal.status !== 'prepared') return {recovered: false};
  if (journal.schemaVersion !== 'autovideo-voice-promotion/v1' || !Array.isArray(journal.targets)) {
    throw new Error('Interrupted voice promotion journal is invalid; refusing automatic recovery.');
  }
  const approval = await readOptionalJson(paths.approval);
  const committedInState = stage?.status === 'approved'
    && ['human-listening', 'technical-only'].includes(stage?.approvalScope)
    && approval?.schemaVersion === 'autovideo-audio-approval/v4'
    && approval?.approvalScope === stage.approvalScope
    && approval?.selectedCandidateId === journal.selectedCandidateId;
  if (committedInState) {
    const [audioSha256, recipeSha256] = await Promise.all([
      sha256File(paths.finalAudio), sha256File(paths.finalRecipe),
    ]);
    if (audioSha256 !== approval.audioSha256 || recipeSha256 !== approval.recipeSha256) {
      throw new Error('Voice promotion reached workbench approval but final file hashes are inconsistent; refusing automatic rollback.');
    }
    const committed = {
      schemaVersion: journal.schemaVersion,
      projectId: journal.projectId,
      transactionId: journal.transactionId,
      status: 'committed',
      selectedCandidateId: journal.selectedCandidateId,
      reviewSha256: journal.reviewSha256,
      startedAt: journal.startedAt,
      committedAt: stage.approvedAt ?? new Date().toISOString(),
      audioSha256,
      recipeSha256,
      approvalSha256: await sha256File(paths.approval),
      recoveredCommit: true,
    };
    await fs.writeFile(paths.promotion, serialize(committed), 'utf8');
    if (journal.tempRoot) await fs.rm(journal.tempRoot, {recursive: true, force: true});
    return {recovered: true, action: 'commit-finalized', transactionId: journal.transactionId};
  }
  for (const targetState of [...journal.targets].reverse()) {
    const target = resolveInside(formalRoot, targetState.path, 'promotion recovery target');
    await fs.rm(`${target}.promoting`, {force: true});
    if (targetState.existed) {
      if (!targetState.backup || !await fs.access(targetState.backup).then(() => true).catch(() => false)) {
        throw new Error(`Interrupted voice promotion cannot recover ${targetState.path}; its backup is missing.`);
      }
      await fs.copyFile(targetState.backup, target);
    } else {
      await fs.rm(target, {force: true});
    }
  }
  await fs.rm(paths.promotion, {force: true});
  if (journal.tempRoot) await fs.rm(journal.tempRoot, {recursive: true, force: true});
  return {recovered: true, action: 'rolled-back', transactionId: journal.transactionId};
};

export const promoteVoiceCandidate = async ({
  formalRoot, projectId, stage, reviewer = 'user', injectFailureAt = null, commitState = null, simulation = null,
}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready voice candidate can be promoted.');
  const evidence = await evidenceFor({formalRoot, projectId});
  const delegatedSimulation = simulation ? delegatedSimulationSchema.parse(simulation) : null;
  let review;
  let delegation = null;
  let delegationReceiptPath = null;
  let delegationReceiptSha256 = null;
  if (delegatedSimulation) {
    delegationReceiptPath = resolveInside(formalRoot, delegatedSimulation.delegationReceipt, 'creator delegation receipt');
    [delegation, delegationReceiptSha256] = await Promise.all([
      readJson(delegationReceiptPath),
      sha256File(delegationReceiptPath),
    ]);
    if (delegation.schemaVersion !== 'autovideo-creator-delegation/v1'
      || delegation.projectId !== projectId
      || delegation.delegate !== 'codex'
      || !delegation.scope?.includes('internal-only-workflow-simulation')
      || delegation.constraints?.audioPlaybackAllowed !== false
      || delegation.constraints?.publicReleaseAllowed !== false) {
      throw new Error('Creator delegation receipt does not authorize silent internal-only voice simulation.');
    }
    const now = new Date().toISOString();
    review = {
      schemaVersion: 'autovideo-voice-candidate-simulation/v1', projectId,
      status: 'skipped-by-creator-delegation', decision: 'accepted-for-internal-simulation',
      selectedCandidateId: delegatedSimulation.selectedCandidateId,
      playedCandidateIds: [],
      checklist: Object.fromEntries(reviewChecklistKeys.map((key) => [key, false])),
      bindings: evidence.bindings,
      reason: delegatedSimulation.reason,
      reviewedBy: reviewer,
      updatedAt: now,
      constraints: {audioPlaybackInvoked: false, microphoneUsed: false, publicReleaseApproved: false},
      delegation: {
        path: relativePath(formalRoot, delegationReceiptPath),
        sha256: delegationReceiptSha256,
      },
    };
    await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  } else {
    review = await readJson(evidence.paths.review);
    if (JSON.stringify(review.bindings) !== JSON.stringify(evidence.bindings) || !reviewReady(review, evidence.candidates)) {
      throw new Error('Complete the current A/B file listening review before promotion.');
    }
  }
  const selected = evidence.candidates.find((candidate) => candidate.candidateId === review.selectedCandidateId && candidate.selectable);
  if (!selected) throw new Error('Selected voice candidate is unavailable.');
  const approvalScope = delegatedSimulation ? 'technical-only' : 'human-listening';
  const reviewSha256 = await sha256File(evidence.paths.review);
  const promotedAt = new Date().toISOString();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-voice-promotion-'));
  const finalRecipe = {
    ...selected.recipe,
    output: relativePath(path.dirname(evidence.paths.finalRecipe), evidence.paths.finalAudio),
    outputSha256: selected.audio.sha256,
    promotion: {
      schemaVersion: 'autovideo-voice-promotion/v1', candidateId: selected.candidateId,
      candidateManifest: {path: relativePath(formalRoot, selected.manifestPath), sha256: selected.manifestSha256},
      review: {path: relativePath(formalRoot, evidence.paths.review), sha256: reviewSha256},
      promotedBy: reviewer, promotedAt,
    },
  };
  const stagedAudio = path.join(tempRoot, 'narration.final.wav');
  const stagedRecipe = path.join(tempRoot, 'voice.recipe.json');
  const stagedReview = path.join(tempRoot, 'listening-review.json');
  const stagedApproval = path.join(tempRoot, 'approval.json');
  const stagedHandoff = path.join(tempRoot, 'audio-handoff.json');
  const stagedProjectState = path.join(tempRoot, 'project-state.json');
  await fs.copyFile(selected.audioPath, stagedAudio);
  await fs.writeFile(stagedRecipe, serialize(finalRecipe), 'utf8');
  const effectivePronunciation = await readOptionalJson(evidence.paths.pronunciation);
  const finalReview = {
    schemaVersion: 'autovideo-listening-review/v2',
    projectId,
    narrationSha256: evidence.lock.normalizedSha256,
    status: delegatedSimulation ? 'not-performed' : 'ready-for-approval',
    decision: review.decision,
    selectedCandidateId: selected.candidateId,
    playedCandidateIds: review.playedCandidateIds,
    candidateChecklist: review.checklist,
    checklist: {
      fullPlayback: !delegatedSimulation,
      terminology: !delegatedSimulation && review.checklist.pronunciation,
      pauses: !delegatedSimulation && review.checklist.breathing,
      clipping: !delegatedSimulation && review.checklist.noArtifacts,
      segmentJoins: !delegatedSimulation && review.checklist.segmentJoins,
    },
    terms: (effectivePronunciation?.entries ?? []).map((entry) => ({
      token: entry.token,
      kind: entry.kind ?? null,
      spokenAs: entry.spokenAs ?? entry.token,
      decision: delegatedSimulation ? 'not-listened' : 'accepted',
      note: delegatedSimulation
        ? 'Not listened to; retained only for internal technical simulation.'
        : 'Accepted while reviewing the selected full-length voice candidate.',
    })),
    audio: {
      path: 'audio/narration.final.wav',
      sha256: selected.audio.sha256,
      durationSeconds: selected.technicalQa.durationSeconds,
    },
    playbackSeconds: delegatedSimulation ? 0 : selected.technicalQa.durationSeconds,
    bindings: review.bindings,
    notes: delegatedSimulation ? delegatedSimulation.reason : review.notes,
    reviewedBy: review.reviewedBy,
    updatedAt: promotedAt,
    promotedAt,
    delegatedSimulation: delegatedSimulation ? {
      mode: delegatedSimulation.mode,
      receiptPath: relativePath(formalRoot, delegationReceiptPath),
      receiptSha256: delegationReceiptSha256,
      audioPlaybackInvoked: false,
      humanListeningStatus: 'not-performed',
      publicReleaseApproved: false,
    } : null,
  };
  await fs.writeFile(stagedReview, serialize(finalReview), 'utf8');
  const approval = {
    schemaVersion: 'autovideo-audio-approval/v4', projectId, approvalScope,
    approvedBy: reviewer, approvedAt: promotedAt, narrationSha256: evidence.lock.normalizedSha256,
    selectedCandidateId: selected.candidateId, audioSha256: selected.audio.sha256,
    recipeSha256: await sha256File(stagedRecipe), listeningReviewSha256: await sha256File(stagedReview),
    candidateBindings: evidence.bindings,
    technicalApproval: {status: 'passed', candidateManifestSha256: selected.manifestSha256},
    humanListening: delegatedSimulation
      ? {status: 'not-performed', reviewer: null, approvedAt: null, reviewPath: 'audio/listening-review.json', reviewSha256: await sha256File(stagedReview)}
      : {status: 'approved', reviewer, approvedAt: promotedAt, reviewPath: 'audio/listening-review.json', reviewSha256: await sha256File(stagedReview)},
    delegatedSimulation: delegatedSimulation ? {
      mode: delegatedSimulation.mode,
      receiptPath: relativePath(formalRoot, delegationReceiptPath),
      receiptSha256: delegationReceiptSha256,
      reason: delegatedSimulation.reason,
    } : null,
    publicReleaseApproved: false,
  };
  await fs.writeFile(stagedApproval, serialize(approval), 'utf8');
  const existingHandoff = await readOptionalJson(evidence.paths.handoff);
  const handoff = {
    ...(existingHandoff ?? {}),
    schemaVersion: existingHandoff?.schemaVersion ?? 'autovideo-audio-handoff/v2',
    projectId,
    narrationSha256: evidence.lock.normalizedSha256,
    status: 'pending-alignment',
    approvalScope,
    humanListeningStatus: delegatedSimulation ? 'not-performed' : 'approved',
    approvedBy: reviewer,
    approvedAt: promotedAt,
    publicReleaseBlocked: true,
    immutable: false,
    invalidatedBy: 'voice-candidate-promotion',
    invalidatedAt: promotedAt,
    nextAction: 'Regenerate alignment, subtitles, audio QA and every timing-dependent HyperFrames artifact.',
    audio: {
      path: 'audio/narration.final.wav',
      source: relativePath(formalRoot, evidence.paths.finalAudio),
      sha256: selected.audio.sha256,
      codec: 'pcm_s16le',
      sampleRate: 48_000,
      channels: 1,
      durationSeconds: selected.technicalQa.durationSeconds,
    },
    recipe: {
      path: 'audio/voice.recipe.json',
      source: relativePath(formalRoot, evidence.paths.finalRecipe),
      sha256: await sha256File(stagedRecipe),
    },
    alignment: existingHandoff?.alignment
      ? {...existingHandoff.alignment, status: 'stale', sourceAudioSha256: existingHandoff.audio?.sha256 ?? null}
      : {status: 'missing'},
  };
  await fs.writeFile(stagedHandoff, serialize(handoff), 'utf8');
  const existingState = await readOptionalJson(evidence.paths.projectState);
  const projectState = existingState ? {
    ...existingState,
    stage: 'audio-approved-alignment-required',
    updatedAt: promotedAt,
    nextAction: 'Regenerate alignment, subtitles, planning, HyperFrames composition, QA and review renders from the promoted final WAV.',
    gates: {
      ...(existingState.gates ?? {}),
      finalPreview: {status: 'pending', approvedBy: null, approvedAt: null, invalidatedBy: 'voice-candidate-promotion'},
    },
    handoffs: {
      ...(existingState.handoffs ?? {}),
      audio: {
        status: 'pending-alignment', rightsStatus: existingHandoff?.rightsStatus ?? 'needs-review',
        approvalScope, humanListeningStatus: delegatedSimulation ? 'not-performed' : 'approved', publicReleaseBlocked: true,
        lock: 'audio-handoff.json', durationSeconds: selected.technicalQa.durationSeconds,
      },
    },
    release: {
      phase: 'production', technicalVideoGenerationReady: false, internalReviewReady: false,
      publicMasterReady: false, publicReleaseBlocked: true, invalidatedBy: 'voice-candidate-promotion',
      previousReceipt: existingState.release?.receipt ?? null,
      previousVideo: existingState.release?.video ?? null,
      previousCover: existingState.release?.cover ?? null,
      receipt: null, video: null, cover: null,
    },
  } : null;
  if (projectState) await fs.writeFile(stagedProjectState, serialize(projectState), 'utf8');
  const targets = [
    {name: 'audio', staged: stagedAudio, target: evidence.paths.finalAudio},
    {name: 'recipe', staged: stagedRecipe, target: evidence.paths.finalRecipe},
    {name: 'review', staged: stagedReview, target: evidence.paths.finalReview},
    {name: 'approval', staged: stagedApproval, target: evidence.paths.approval},
    {name: 'handoff', staged: stagedHandoff, target: evidence.paths.handoff},
    ...(projectState ? [{name: 'project-state', staged: stagedProjectState, target: evidence.paths.projectState}] : []),
  ];
  const journal = {
    schemaVersion: 'autovideo-voice-promotion/v1', projectId, transactionId: crypto.randomUUID(),
    status: 'prepared', selectedCandidateId: selected.candidateId, reviewSha256, startedAt: promotedAt, tempRoot,
    targets: [],
  };
  let stateCommitted = false;
  let recoveryRequired = false;
  try {
    for (const item of targets) {
      const existed = await fs.access(item.target).then(() => true).catch(() => false);
      const backup = path.join(tempRoot, `${item.name}.backup`);
      journal.targets.push({name: item.name, path: relativePath(formalRoot, item.target), existed, backup});
      if (existed) await fs.copyFile(item.target, backup);
    }
    await fs.writeFile(evidence.paths.promotion, serialize(journal), 'utf8');
    for (const [index, item] of targets.entries()) {
      await replaceFromStaging(item);
      if (injectFailureAt === item.name) throw new Error(`Injected voice promotion failure after ${item.name}.`);
    }
    const stateResult = commitState ? await commitState({
      artifactPath: evidence.paths.approval,
      artifactSha256: await sha256File(evidence.paths.approval),
      selectedCandidateId: selected.candidateId,
      approvedAt: promotedAt,
      approvalScope,
      delegatedSimulation: delegatedSimulation ? approval.delegatedSimulation : null,
    }) : null;
    stateCommitted = Boolean(commitState);
    journal.status = 'committed';
    journal.committedAt = new Date().toISOString();
    journal.audioSha256 = await sha256File(evidence.paths.finalAudio);
    journal.recipeSha256 = await sha256File(evidence.paths.finalRecipe);
    journal.approvalSha256 = await sha256File(evidence.paths.approval);
    delete journal.targets;
    delete journal.tempRoot;
    await fs.writeFile(evidence.paths.promotion, serialize(journal), 'utf8');
    return {approval, promotion: journal, stateResult, path: evidence.paths.promotion, sha256: await sha256File(evidence.paths.promotion)};
  } catch (error) {
    if (stateCommitted) {
      recoveryRequired = true;
      throw new Error(`Voice promotion files and workbench state committed, but the transaction receipt needs recovery: ${error.message}`);
    }
    for (const targetState of [...journal.targets].reverse()) {
      const target = resolveInside(formalRoot, targetState.path, 'promotion rollback target');
      await fs.rm(`${target}.promoting`, {force: true});
      if (targetState.existed) await fs.copyFile(targetState.backup, target);
      else await fs.rm(target, {force: true});
    }
    await fs.rm(evidence.paths.promotion, {force: true});
    throw error;
  } finally {
    if (!recoveryRequired) await fs.rm(tempRoot, {recursive: true, force: true});
  }
};

export const resolveVoiceCandidateMedia = async ({formalRoot, projectId, candidateId}) => {
  const evidence = await evidenceFor({formalRoot, projectId});
  const candidate = evidence.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error('Unknown active voice candidate.');
  return candidate.audioPath;
};

export const reopenVoiceCandidateReview = async ({formalRoot}) => {
  const paths = pathsFor(formalRoot);
  const archive = path.join(paths.root, 'history');
  await fs.mkdir(archive, {recursive: true});
  const reopenedAt = new Date().toISOString();
  for (const filePath of [paths.review, paths.promotion, paths.approval]) {
    if (await fs.access(filePath).then(() => true).catch(() => false)) {
      const parsed = path.parse(filePath);
      await fs.copyFile(filePath, path.join(archive, `${parsed.name}-${Date.now()}${parsed.ext}`));
      await fs.rm(filePath, {force: true});
    }
  }
  const handoff = await readOptionalJson(paths.handoff);
  if (handoff) {
    await fs.writeFile(paths.handoff, serialize({
      ...handoff,
      status: 'voice-selection-pending',
      approvalScope: null,
      humanListeningStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      publicReleaseBlocked: true,
      invalidatedBy: 'voice-final-reopened',
      invalidatedAt: reopenedAt,
      nextAction: 'Generate or review versioned voice candidates, then promote exactly one candidate.',
    }), 'utf8');
  }
  const state = await readOptionalJson(paths.projectState);
  if (state) {
    await fs.writeFile(paths.projectState, serialize({
      ...state,
      stage: 'voice-selection-pending',
      updatedAt: reopenedAt,
      nextAction: 'Generate or review versioned voice candidates and promote one through the dedicated A/B gate.',
      gates: {...(state.gates ?? {}), finalPreview: {status: 'pending', approvedBy: null, approvedAt: null, invalidatedBy: 'voice-final-reopened'}},
      handoffs: {...(state.handoffs ?? {}), audio: {...(state.handoffs?.audio ?? {}), status: 'voice-selection-pending', approvalScope: null, humanListeningStatus: 'pending', publicReleaseBlocked: true}},
      release: {...(state.release ?? {}), phase: 'production', technicalVideoGenerationReady: false, internalReviewReady: false, publicMasterReady: false, publicReleaseBlocked: true, invalidatedBy: 'voice-final-reopened'},
    }), 'utf8');
  }
};

export {reviewChecklistKeys as voiceCandidateChecklistKeys};
