import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {z} from 'zod';
import {sha256File} from './project-store.mjs';
import {validatePronunciationGuide} from '../../tools/voice-lab/pronunciation-contract.mjs';

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);
const readOptionalJson = async (filePath) => {
  try { return await readJson(filePath); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
};
const relativePath = (root, filePath) => path.relative(root, filePath).replaceAll('\\', '/');
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value ?? ''));
const sha256Text = (value) => crypto.createHash('sha256').update(value).digest('hex');

const pathsFor = (formalRoot) => ({
  lock: path.join(formalRoot, 'NarrationLock.json'),
  generated: path.join(formalRoot, 'input', 'pronunciation.json'),
  effective: path.join(formalRoot, 'input', 'pronunciation.effective.json'),
  manifest: path.join(formalRoot, 'audio', 'pronunciation-probes', 'probe-manifest.json'),
  review: path.join(formalRoot, 'qa', 'pronunciation-human-review.json'),
  approval: path.join(formalRoot, 'qa', 'pronunciation-approval.json'),
});

const archiveCurrent = async (filePath) => {
  try {
    await fs.access(filePath);
    const archive = path.join(path.dirname(filePath), 'history');
    await fs.mkdir(archive, {recursive: true});
    const parsed = path.parse(filePath);
    await fs.copyFile(filePath, path.join(archive, `${parsed.name}-${Date.now()}${parsed.ext}`));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
};

const termSchema = z.object({
  token: z.string().min(1).max(100),
  decision: z.enum(['pending', 'accepted', 'retake']),
  selectedCandidateId: z.string().max(150).nullable().default(null),
  playedCandidateIds: z.array(z.string().min(1).max(150)).max(3).default([]),
  note: z.string().max(1000).default(''),
});

export const pronunciationReviewInputSchema = z.object({
  terms: z.array(termSchema).max(200),
  notes: z.string().max(4000).default(''),
});

export const pronunciationSelectionOverrideInputSchema = pronunciationReviewInputSchema.extend({
  skipReason: z.string().trim().min(10).max(2000),
  userDirective: z.string().trim().min(2).max(1000),
});

const evidenceFor = async ({formalRoot, projectId}) => {
  const paths = pathsFor(formalRoot);
  const [lock, guide, manifest] = await Promise.all([
    readJson(paths.lock),
    readJson(paths.generated),
    readJson(paths.manifest),
  ]);
  const narrationPath = path.join(formalRoot, lock.frozenPath);
  const narration = await fs.readFile(narrationPath, 'utf8');
  validatePronunciationGuide({guide, projectId, narrationSha256: lock.normalizedSha256, narration});
  if (manifest.schemaVersion !== 'autovideo-pronunciation-probes/v1'
    || manifest.projectId !== projectId
    || manifest.narrationSha256 !== lock.normalizedSha256
    || manifest.generatedGuideSha256 !== await sha256File(paths.generated)) {
    throw new Error('Pronunciation probe manifest is stale for the current NarrationLock or generated guide.');
  }
  const subjectiveEntries = guide.entries.filter((entry) => entry.kind !== 'letter-acronym');
  const expectedTokens = subjectiveEntries.map((entry) => entry.token);
  const actualTokens = (manifest.probes ?? []).map((probe) => probe.token);
  if (expectedTokens.length !== actualTokens.length || expectedTokens.some((token) => !actualTokens.includes(token))) {
    throw new Error('Pronunciation probes must cover every subjective Latin token exactly once.');
  }
  const probes = [];
  for (const probe of manifest.probes ?? []) {
    if (!Array.isArray(probe.candidates) || probe.candidates.length < 2 || probe.candidates.length > 3) {
      throw new Error(`Pronunciation probe group must contain 2-3 candidates for ${probe.token}.`);
    }
    const candidateIds = new Set();
    const candidates = [];
    for (const candidate of probe.candidates) {
      if (!candidate.id || candidateIds.has(candidate.id)) throw new Error(`Pronunciation candidate ids must be unique for ${probe.token}.`);
      candidateIds.add(candidate.id);
      const audioPath = path.resolve(formalRoot, candidate.audio.path);
      const recipePath = path.resolve(formalRoot, candidate.recipe.path);
      const [audioSha256, recipeSha256, recipe] = await Promise.all([
        sha256File(audioPath),
        sha256File(recipePath),
        readJson(recipePath),
      ]);
      if (audioSha256 !== candidate.audio.sha256 || recipeSha256 !== candidate.recipe.sha256
        || candidate.ttsTextSha256 !== sha256Text(candidate.ttsText)
        || String(recipe.text_sha256 ?? '').toLowerCase() !== candidate.ttsTextSha256
        || String(recipe.output?.sha256 ?? '').toLowerCase() !== audioSha256
        || recipe.frontend_preflight?.utterance_count !== 1
        || Number(recipe.output_chunks) !== 1) {
        throw new Error(`Pronunciation candidate bytes or CosyVoice receipt are stale for ${probe.token}/${candidate.id}.`);
      }
      candidates.push({...candidate, audioSha256, recipeSha256});
    }
    probes.push({...probe, candidates});
  }
  return {
    paths,
    lock,
    guide,
    manifest,
    narration,
    probes,
    bindings: {
      narrationLock: {path: relativePath(formalRoot, paths.lock), sha256: await sha256File(paths.lock)},
      generatedGuide: {path: relativePath(formalRoot, paths.generated), sha256: await sha256File(paths.generated)},
      probeManifest: {path: relativePath(formalRoot, paths.manifest), sha256: await sha256File(paths.manifest)},
      probes: probes.map((probe) => ({
        token: probe.token,
        contextSha256: probe.contextSha256,
        candidates: probe.candidates.map((candidate) => ({
          id: candidate.id,
          spokenAs: candidate.spokenAs,
          ttsTextSha256: candidate.ttsTextSha256,
          audio: candidate.audio,
          recipe: candidate.recipe,
        })),
      })),
    },
  };
};

const exactTermCoverage = (terms, tokens) => {
  const received = terms.map((item) => item.token);
  if (new Set(received.map((item) => item.toLowerCase())).size !== received.length
    || received.length !== tokens.length
    || tokens.some((token) => !received.includes(token))) {
    throw new Error('Pronunciation review must cover every current probe exactly once.');
  }
};

export const pronunciationReviewReady = (review, probes = []) => {
  const probeByToken = new Map(probes.map((probe) => [probe.token, probe]));
  return (review.terms ?? []).every((term) => {
    const probe = probeByToken.get(term.token);
    const candidateIds = probe?.candidates?.map((candidate) => candidate.id) ?? [];
    return term.decision === 'accepted'
      && candidateIds.includes(term.selectedCandidateId)
      && candidateIds.every((id) => term.playedCandidateIds?.includes(id));
  });
};

const reviewBindingsCurrent = (review, evidence) => JSON.stringify(review?.bindings) === JSON.stringify(evidence.bindings);

export const reconcilePronunciationTermDecision = ({priorTerm, priorBinding, probe}) => {
  const priorCandidates = new Map((priorBinding?.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  const unchangedIds = new Set((probe.candidates ?? [])
    .filter((candidate) => {
      const prior = priorCandidates.get(candidate.id);
      return prior
        && prior.ttsTextSha256 === candidate.ttsTextSha256
        && prior.audio?.sha256 === candidate.audio?.sha256;
    })
    .map((candidate) => candidate.id));
  const playedCandidateIds = (priorTerm?.playedCandidateIds ?? []).filter((id) => unchangedIds.has(id));
  const selectedCandidateId = unchangedIds.has(priorTerm?.selectedCandidateId) ? priorTerm.selectedCandidateId : null;
  const allCurrentCandidatesUnchanged = (probe.candidates ?? []).every((candidate) => unchangedIds.has(candidate.id));
  const allCurrentCandidatesPlayed = (probe.candidates ?? []).every((candidate) => playedCandidateIds.includes(candidate.id));
  let decision = priorTerm?.decision ?? 'pending';
  if (decision === 'accepted' && (!selectedCandidateId || !allCurrentCandidatesUnchanged || !allCurrentCandidatesPlayed)) {
    decision = 'pending';
  }
  if (decision === 'retake' && !allCurrentCandidatesUnchanged) decision = 'pending';
  return {
    decision,
    selectedCandidateId,
    playedCandidateIds,
    note: priorTerm?.note ?? '',
  };
};

const approvalCurrent = async (approval, evidence) => {
  if (approval?.schemaVersion !== 'autovideo-pronunciation-approval/v1'
    || approval.projectId !== evidence.lock.projectId
    || JSON.stringify(approval.bindings) !== JSON.stringify(evidence.bindings)
    || !approval.effectiveGuide?.path || !isSha256(approval.effectiveGuide.sha256)) return false;
  const effectivePath = path.resolve(path.dirname(evidence.paths.approval), '..', approval.effectiveGuide.path);
  return await sha256File(effectivePath).catch(() => null) === approval.effectiveGuide.sha256;
};

export const buildPronunciationReview = async ({formalRoot, projectId}) => {
  const evidence = await evidenceFor({formalRoot, projectId});
  const [review, approval] = await Promise.all([
    readOptionalJson(evidence.paths.review),
    readOptionalJson(evidence.paths.approval),
  ]);
  const currentApproval = await approvalCurrent(approval, evidence);
  const decisions = new Map((review?.terms ?? []).map((term) => [term.token, term]));
  const priorBindings = new Map((review?.bindings?.probes ?? []).map((probe) => [probe.token, probe]));
  const selectionOverrideApproved = currentApproval
    && approval.approvalScope === 'user-directed-selection-no-listening';
  const terms = evidence.probes.map((probe) => {
    const decision = reconcilePronunciationTermDecision({
      priorTerm: decisions.get(probe.token),
      priorBinding: priorBindings.get(probe.token),
      probe,
    });
    return {
      token: probe.token,
      kind: probe.kind,
      locale: probe.locale,
      targetIpa: probe.targetIpa,
      targetCmu: probe.targetCmu,
      contextText: probe.contextText,
      candidates: probe.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        spokenAs: candidate.spokenAs,
        ttsText: candidate.ttsText,
        audioUrl: `/api/projects/${encodeURIComponent(projectId)}/pronunciation-review/media/${encodeURIComponent(candidate.id)}`,
        durationSeconds: candidate.durationSeconds,
      })),
      ...decision,
      ...(selectionOverrideApproved ? {decision: 'accepted'} : {}),
    };
  });
  const bindingsCurrent = reviewBindingsCurrent(review, evidence);
  const status = currentApproval ? 'approved' : review && !bindingsCurrent ? 'stale' : (review?.status ?? 'not-started');
  return {
    schemaVersion: 'autovideo-pronunciation-review-view/v1',
    projectId,
    generatedGuide: evidence.bindings.generatedGuide,
    probeManifest: evidence.bindings.probeManifest,
    review: {
      status,
      terms,
      notes: review?.notes ?? '',
      reviewedBy: review?.reviewedBy ?? null,
      updatedAt: review?.updatedAt ?? null,
      readyForApproval: bindingsCurrent && pronunciationReviewReady({terms}, evidence.probes),
    },
    approval: currentApproval ? approval : null,
  };
};

export const savePronunciationReview = async ({formalRoot, projectId, stage, rawInput, reviewer = 'user'}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Pronunciation review must be review-ready before saving decisions.');
  const input = pronunciationReviewInputSchema.parse(rawInput);
  const evidence = await evidenceFor({formalRoot, projectId});
  exactTermCoverage(input.terms, evidence.probes.map((probe) => probe.token));
  for (const term of input.terms) {
    if (term.decision === 'retake' && term.note.trim().length < 2) throw new Error(`Retake notes are required for ${term.token}.`);
    const probe = evidence.probes.find((item) => item.token === term.token);
    const candidateIds = probe.candidates.map((candidate) => candidate.id);
    if (term.selectedCandidateId && !candidateIds.includes(term.selectedCandidateId)) throw new Error(`Unknown pronunciation candidate for ${term.token}.`);
    if (term.playedCandidateIds.some((id) => !candidateIds.includes(id))) throw new Error(`Unknown played candidate for ${term.token}.`);
  }
  const review = {
    schemaVersion: 'autovideo-pronunciation-human-review/v1',
    projectId,
    status: pronunciationReviewReady(input, evidence.probes) ? 'ready-for-approval' : 'in-progress',
    bindings: evidence.bindings,
    terms: input.terms,
    notes: input.notes,
    reviewedBy: reviewer,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return review;
};

const writeApproval = async ({
  formalRoot,
  projectId,
  evidence,
  review,
  reviewer,
  approvalScope,
  requireFullListening = true,
  selectionOverride = null,
}) => {
  const approvedAt = new Date().toISOString();
  const reviewSha256 = review ? await sha256File(evidence.paths.review) : null;
  const decisionByToken = new Map((review?.terms ?? []).map((term) => [term.token, term]));
  const probeByToken = new Map(evidence.probes.map((probe) => [probe.token, probe]));
  const effective = {
    ...evidence.guide,
    schemaVersion: 'autovideo-pronunciation/v2',
    sourceGuide: evidence.bindings.generatedGuide,
    approvalScope,
    approvedBy: reviewer,
    approvedAt,
    entries: evidence.guide.entries.map((entry) => {
      if (entry.kind === 'letter-acronym') return entry;
      const probe = probeByToken.get(entry.token);
      const decision = decisionByToken.get(entry.token);
      const selected = probe?.candidates.find((candidate) => candidate.id === decision?.selectedCandidateId);
      if (!probe || !selected || decision?.decision !== 'accepted'
        || (requireFullListening && !probe.candidates.every((candidate) => decision.playedCandidateIds?.includes(candidate.id)))) {
        throw new Error(`Pronunciation probe is not accepted for ${entry.token}.`);
      }
      const playedCandidateIds = probe.candidates
        .map((candidate) => candidate.id)
        .filter((candidateId) => decision.playedCandidateIds?.includes(candidateId));
      const skippedCandidateIds = probe.candidates
        .map((candidate) => candidate.id)
        .filter((candidateId) => !playedCandidateIds.includes(candidateId));
      return {
        ...entry,
        spokenAs: selected.spokenAs,
        status: 'approved-default',
        contextProbeReceipt: {
          candidateId: selected.id,
          path: selected.audio.path,
          sha256: selected.audio.sha256,
          recipePath: selected.recipe.path,
          recipeSha256: selected.recipe.sha256,
          contextSha256: probe.contextSha256,
          probeManifestSha256: evidence.bindings.probeManifest.sha256,
          reviewSha256,
          approvedBy: reviewer,
          approvedAt,
          listeningCompleted: skippedCandidateIds.length === 0,
          playedCandidateIds,
          skippedCandidateIds,
        },
      };
    }),
  };
  validatePronunciationGuide({
    guide: effective,
    projectId,
    narrationSha256: evidence.lock.normalizedSha256,
    narration: evidence.narration,
    requireProbes: true,
  });
  await fs.mkdir(path.dirname(evidence.paths.effective), {recursive: true});
  await fs.writeFile(evidence.paths.effective, serialize(effective), 'utf8');
  const approval = {
    schemaVersion: 'autovideo-pronunciation-approval/v1',
    projectId,
    status: 'approved',
    approvalScope,
    approvedBy: reviewer,
    approvedAt,
    review: review ? {path: relativePath(formalRoot, evidence.paths.review), sha256: reviewSha256} : null,
    bindings: evidence.bindings,
    effectiveGuide: {path: relativePath(formalRoot, evidence.paths.effective), sha256: await sha256File(evidence.paths.effective)},
    humanListening: selectionOverride
      ? {
          status: 'skipped-by-user-direction',
          completed: false,
          playedCandidateCount: selectionOverride.playedCandidateCount,
          candidateCount: selectionOverride.candidateCount,
          skippedCandidateCount: selectionOverride.skippedCandidateCount,
        }
      : {
          status: approvalScope === 'human-listening' ? 'approved' : 'not-required',
          completed: approvalScope === 'human-listening',
          playedCandidateCount: approvalScope === 'human-listening' ? evidence.probes.reduce((sum, probe) => sum + probe.candidates.length, 0) : 0,
          candidateCount: evidence.probes.reduce((sum, probe) => sum + probe.candidates.length, 0),
          skippedCandidateCount: 0,
        },
    ...(selectionOverride ? {
      selectionOverride,
      humanReviewPerformed: false,
      publicReleaseBlocked: true,
    } : {}),
  };
  await fs.mkdir(path.dirname(evidence.paths.approval), {recursive: true});
  await fs.writeFile(evidence.paths.approval, serialize(approval), 'utf8');
  return {approval, path: evidence.paths.approval, sha256: await sha256File(evidence.paths.approval)};
};

export const approvePronunciationReview = async ({formalRoot, projectId, stage, reviewer = 'user'}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready pronunciation stage can be approved.');
  const evidence = await evidenceFor({formalRoot, projectId});
  const review = await readJson(evidence.paths.review);
  if (!reviewBindingsCurrent(review, evidence) || review.status !== 'ready-for-approval' || !pronunciationReviewReady(review, evidence.probes)) {
    throw new Error('Play and accept every current pronunciation probe before approval.');
  }
  return writeApproval({formalRoot, projectId, evidence, review, reviewer, approvalScope: 'human-listening'});
};

export const approvePronunciationSelectionWithoutFullListening = async ({
  formalRoot,
  projectId,
  stage,
  rawInput,
  reviewer = 'user',
}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready pronunciation stage can accept the current selections.');
  const input = pronunciationSelectionOverrideInputSchema.parse(rawInput);
  const evidence = await evidenceFor({formalRoot, projectId});
  exactTermCoverage(input.terms, evidence.probes.map((probe) => probe.token));
  const normalizedTerms = input.terms.map((term) => {
    const probe = evidence.probes.find((item) => item.token === term.token);
    const candidateIds = probe.candidates.map((candidate) => candidate.id);
    if (!term.selectedCandidateId || !candidateIds.includes(term.selectedCandidateId)) {
      throw new Error(`Select one current pronunciation candidate for ${term.token}.`);
    }
    if (term.decision === 'retake') throw new Error(`Resolve the retake decision for ${term.token} before advancing.`);
    if (term.playedCandidateIds.some((id) => !candidateIds.includes(id))) {
      throw new Error(`Unknown played candidate for ${term.token}.`);
    }
    return {...term, decision: 'accepted'};
  });
  const candidateCount = evidence.probes.reduce((sum, probe) => sum + probe.candidates.length, 0);
  const playedCandidateIds = [...new Set(normalizedTerms.flatMap((term) => term.playedCandidateIds))];
  const allCandidateIds = evidence.probes.flatMap((probe) => probe.candidates.map((candidate) => candidate.id));
  const skippedCandidateIds = allCandidateIds.filter((candidateId) => !playedCandidateIds.includes(candidateId));
  const recordedAt = new Date().toISOString();
  const selectionOverride = {
    scope: 'user-directed-selection-no-listening',
    userDirective: input.userDirective,
    skipReason: input.skipReason,
    selectedTermCount: normalizedTerms.length,
    termCount: evidence.probes.length,
    playedCandidateCount: playedCandidateIds.length,
    candidateCount,
    skippedCandidateCount: skippedCandidateIds.length,
    playedCandidateIds,
    skippedCandidateIds,
    recordedAt,
  };
  const review = {
    schemaVersion: 'autovideo-pronunciation-human-review/v1',
    projectId,
    status: 'approved-with-listening-skipped',
    bindings: evidence.bindings,
    terms: normalizedTerms,
    notes: input.notes,
    reviewedBy: reviewer,
    updatedAt: recordedAt,
    selectionOverride,
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return writeApproval({
    formalRoot,
    projectId,
    evidence,
    review,
    reviewer,
    approvalScope: 'user-directed-selection-no-listening',
    requireFullListening: false,
    selectionOverride,
  });
};

export const approvePronunciationAutomatically = async ({formalRoot, projectId}) => {
  const evidence = await evidenceFor({formalRoot, projectId});
  if (evidence.probes.length) throw new Error('Subjective pronunciation probes cannot be machine-approved.');
  return writeApproval({formalRoot, projectId, evidence, review: null, reviewer: 'automation', approvalScope: 'machine-no-subjective-terms'});
};

export const resolvePronunciationProbeMedia = async ({formalRoot, projectId, candidateId}) => {
  const evidence = await evidenceFor({formalRoot, projectId});
  const candidate = evidence.probes.flatMap((probe) => probe.candidates).find((item) => item.id === candidateId);
  if (!candidate) throw new Error('Unknown pronunciation probe candidate.');
  return path.resolve(formalRoot, candidate.audio.path);
};

export const reopenPronunciationReview = async ({formalRoot}) => {
  const paths = pathsFor(formalRoot);
  await Promise.all([archiveCurrent(paths.approval), archiveCurrent(paths.effective)]);
  await Promise.all([fs.rm(paths.approval, {force: true}), fs.rm(paths.effective, {force: true})]);
};
