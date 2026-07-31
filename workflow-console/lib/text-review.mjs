import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {
  assertCreatorDelegation,
  assertNotCreatorDelegatedHumanReview,
  CREATOR_DELEGATED_REVIEWER,
  INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
} from './creator-delegation.mjs';

export const subtitleReviewChecklistKeys = [
  'meaning',
  'terminology',
  'segmentation',
  'punctuation',
  'timingReadability',
];

export const screenTextReviewChecklistKeys = [
  'allReviewFramesChecked',
  'subtitleSafeArea',
  'noOcclusion',
  'screenTextAccuracy',
  'contrastAndLegibility',
  'lineBreakAndOverflow',
  'duplicateTextRestraint',
];

const decisionSchema = z.enum(['pending', 'accepted', 'revise']);
const reviewItemSchema = z.object({
  id: z.string().min(1).max(200),
  decision: decisionSchema,
  note: z.string().max(1000).default(''),
}).superRefine((item, context) => {
  if (item.decision === 'revise' && !item.note.trim()) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['note'], message: 'A revision decision requires a note.'});
  }
});

export const subtitleReviewInputSchema = z.object({
  checklist: z.object(Object.fromEntries(subtitleReviewChecklistKeys.map((key) => [key, z.boolean()]))),
  cues: z.array(reviewItemSchema).max(2000),
  notes: z.string().max(8000).default(''),
});

export const screenTextReviewInputSchema = z.object({
  checklist: z.object(Object.fromEntries(screenTextReviewChecklistKeys.map((key) => [key, z.boolean()]))),
  frames: z.array(reviewItemSchema).max(500),
  reviewMode: z.enum(['manual', 'ocr-assisted']),
  notes: z.string().max(8000).default(''),
});

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);
const readOptionalJson = async (filePath) => {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};
const optionalSha256 = async (filePath) => {
  try {
    return await sha256File(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const relativePath = (root, target) => path.relative(root, target).replaceAll('\\', '/');
const checklistReady = (keys, checklist) => keys.every((key) => checklist?.[key] === true);
const itemsReady = (items) => items.length > 0 && items.every((item) => item.decision === 'accepted');
const bindingsEqual = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value ?? ''));

const internalApprovalCurrent = async ({formalRoot, approval, review, schemaVersion, projectId, reviewPath, reviewSha256, bindings}) => Boolean(
  approval
    && approval.schemaVersion === schemaVersion
    && approval.projectId === projectId
    && approval.status === 'approved'
    && approval.approvalScope === INTERNAL_AUTONOMOUS_REVIEW_SCOPE
    && approval.approvedBy === CREATOR_DELEGATED_REVIEWER
    && approval.humanReviewPerformed === false
    && approval.publicReleaseBlocked === true
    && approval.review?.path === reviewPath
    && approval.review?.sha256 === reviewSha256
    && isSha256(approval.delegation?.sha256)
    && review?.approvalScope === INTERNAL_AUTONOMOUS_REVIEW_SCOPE
    && review?.reviewedBy === CREATOR_DELEGATED_REVIEWER
    && review?.humanReviewPerformed === false
    && review?.publicReleaseBlocked === true
    && bindingsEqual(review?.delegation, approval.delegation)
    && bindingsEqual(approval.bindings, bindings)
    && approval.delegation.sha256 === await optionalSha256(resolveBoundPath(formalRoot, approval.delegation.path)),
);

const resolveBoundPath = (formalRoot, relativeTarget) => {
  if (!relativeTarget || path.isAbsolute(relativeTarget)) throw new Error('Evidence paths must be project-relative.');
  const resolvedRoot = path.resolve(formalRoot);
  const resolvedTarget = path.resolve(formalRoot, relativeTarget);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Evidence path leaves the formal project root.');
  }
  return resolvedTarget;
};

const assertExactItems = (inputItems, expectedIds, label) => {
  const received = inputItems.map((item) => item.id);
  if (new Set(received).size !== received.length) throw new Error(`${label} contains duplicate IDs.`);
  if (received.length !== expectedIds.length || expectedIds.some((id) => !received.includes(id))) {
    throw new Error(`${label} must cover every current item exactly once.`);
  }
};

const archiveCurrent = async (target) => {
  try {
    await fs.access(target);
  } catch {
    return;
  }
  const historyDir = path.join(path.dirname(target), 'history');
  await fs.mkdir(historyDir, {recursive: true});
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  await fs.copyFile(target, path.join(historyDir, `${timestamp}-${path.basename(target)}`));
};

const subtitlePaths = (formalRoot) => ({
  alignment: path.join(formalRoot, 'audio', 'alignment.json'),
  alignmentValidation: path.join(formalRoot, 'captions', 'alignment-validation.json'),
  narrationLock: path.join(formalRoot, 'NarrationLock.json'),
  srt: path.join(formalRoot, 'captions', 'narration.zh-CN.srt'),
  machineQa: path.join(formalRoot, 'qa', 'subtitle-qa.json'),
  review: path.join(formalRoot, 'qa', 'subtitle-human-review.json'),
  approval: path.join(formalRoot, 'qa', 'subtitle-human-approval.json'),
});

const subtitleEvidence = async ({formalRoot, projectId}) => {
  const paths = subtitlePaths(formalRoot);
  const [alignment, machineQa, alignmentSha256, validationSha256, narrationLockSha256, srtSha256, machineQaSha256] = await Promise.all([
    readJson(paths.alignment),
    readJson(paths.machineQa),
    sha256File(paths.alignment),
    sha256File(paths.alignmentValidation),
    sha256File(paths.narrationLock),
    sha256File(paths.srt),
    sha256File(paths.machineQa),
  ]);
  if (machineQa.schemaVersion !== 'autovideo-subtitle-qa/v1'
    || machineQa.projectId !== projectId
    || machineQa.machine?.status !== 'passed') {
    throw new Error('Subtitle machine QA must pass before human subtitle review.');
  }
  if (machineQa.machine.alignmentSha256 !== alignmentSha256
    || machineQa.machine.validationSha256 !== validationSha256
    || machineQa.machine.srtSha256 !== srtSha256) {
    throw new Error('Subtitle machine QA is stale for the current alignment, validation, or SRT.');
  }
  const cues = Array.isArray(alignment.cues) ? alignment.cues : [];
  if (!cues.length) throw new Error('Alignment contains no subtitle cues to review.');
  if (cues.some((cue) => typeof cue.id !== 'string' || !cue.id.trim())) {
    throw new Error('Every subtitle cue requires a stable ID before human review.');
  }
  if (new Set(cues.map((cue) => cue.id)).size !== cues.length) {
    throw new Error('Subtitle cue IDs must be unique before human review.');
  }
  return {
    projectId,
    paths,
    bindings: {
      subtitleQa: {path: relativePath(formalRoot, paths.machineQa), sha256: machineQaSha256},
      alignment: {path: relativePath(formalRoot, paths.alignment), sha256: alignmentSha256},
      alignmentValidation: {path: relativePath(formalRoot, paths.alignmentValidation), sha256: validationSha256},
      narrationLock: {path: relativePath(formalRoot, paths.narrationLock), sha256: narrationLockSha256},
      srt: {path: relativePath(formalRoot, paths.srt), sha256: srtSha256},
    },
    cues: cues.map((cue) => ({
      id: cue.id,
      text: String(cue.text ?? ''),
      start: Number(cue.start),
      end: Number(cue.end),
    })),
  };
};

const subtitleBindingsCurrent = (review, evidence) => review
  && review.projectId === evidence.projectId
  && bindingsEqual(review.bindings, evidence.bindings);

const formalRootForEvidence = (evidence) => path.dirname(path.dirname(evidence.paths.review));

const subtitleApprovalCurrent = async (approval, review, evidence) => Boolean(
  subtitleBindingsCurrent(review, evidence)
    && ((approval
      && approval.schemaVersion === 'autovideo-subtitle-human-approval/v1'
      && approval.projectId === evidence.projectId
      && approval.status === 'approved'
      && approval.approvalScope === 'human-review'
      && approval.review?.path === relativePath(formalRootForEvidence(evidence), evidence.paths.review)
      && approval.review?.sha256 === await optionalSha256(evidence.paths.review)
      && bindingsEqual(approval.bindings, evidence.bindings))
      || await internalApprovalCurrent({
        formalRoot: formalRootForEvidence(evidence),
        approval,
        review,
        schemaVersion: 'autovideo-subtitle-internal-approval/v1',
        projectId: evidence.projectId,
        reviewPath: relativePath(formalRootForEvidence(evidence), evidence.paths.review),
        reviewSha256: await optionalSha256(evidence.paths.review),
        bindings: evidence.bindings,
      })),
);

export const subtitleReviewReady = (review) => checklistReady(subtitleReviewChecklistKeys, review.checklist)
  && itemsReady(review.cues ?? []);

export const buildSubtitleReview = async ({formalRoot, projectId}) => {
  const evidence = await subtitleEvidence({formalRoot, projectId});
  const [review, approval] = await Promise.all([
    readOptionalJson(evidence.paths.review),
    readOptionalJson(evidence.paths.approval),
  ]);
  const bindingsCurrent = subtitleBindingsCurrent(review, evidence);
  const approvalCurrent = bindingsCurrent && await subtitleApprovalCurrent(approval, review, evidence);
  const decisions = new Map((review?.cues ?? []).map((item) => [item.id, item]));
  const cues = evidence.cues.map((cue) => ({
    ...cue,
    decision: decisions.get(cue.id)?.decision ?? 'pending',
    note: decisions.get(cue.id)?.note ?? '',
  }));
  const checklist = Object.fromEntries(subtitleReviewChecklistKeys.map((key) => [key, review?.checklist?.[key] === true]));
  const status = approvalCurrent ? 'approved' : review && !bindingsCurrent ? 'stale' : (review?.status ?? 'not-started');
  return {
    schemaVersion: 'autovideo-subtitle-review-view/v1',
    projectId,
    bindings: evidence.bindings,
    review: {
      status,
      checklist,
      cues,
      notes: review?.notes ?? '',
      reviewedBy: review?.reviewedBy ?? null,
      updatedAt: review?.updatedAt ?? null,
      readyForApproval: status === 'ready-for-approval' && subtitleReviewReady({...review, checklist, cues}) && bindingsCurrent,
    },
    approval: approvalCurrent ? approval : null,
  };
};

export const saveSubtitleReview = async ({formalRoot, projectId, stage, rawInput, reviewer = 'user'}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Subtitle review must be review-ready before saving decisions.');
  const input = subtitleReviewInputSchema.parse(rawInput);
  const evidence = await subtitleEvidence({formalRoot, projectId});
  assertExactItems(input.cues, evidence.cues.map((cue) => cue.id), 'Subtitle review');
  const [existingReview, existingApproval] = await Promise.all([
    readOptionalJson(evidence.paths.review),
    readOptionalJson(evidence.paths.approval),
  ]);
  if (existingApproval?.status === 'approved') {
    if (await subtitleApprovalCurrent(existingApproval, existingReview, evidence)) {
      throw new Error('Approved subtitle review is frozen. Reopen the stage before changing it.');
    }
    await archiveCurrent(evidence.paths.approval);
    await fs.rm(evidence.paths.approval, {force: true});
  }
  const review = {
    schemaVersion: 'autovideo-subtitle-human-review/v1',
    projectId,
    status: subtitleReviewReady(input) ? 'ready-for-approval' : 'in-progress',
    bindings: evidence.bindings,
    checklist: input.checklist,
    cues: input.cues,
    notes: input.notes,
    reviewedBy: reviewer,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return review;
};

export const initializeSubtitleReview = async ({formalRoot, projectId}) => {
  const evidence = await subtitleEvidence({formalRoot, projectId});
  await archiveCurrent(evidence.paths.review);
  await archiveCurrent(evidence.paths.approval);
  await fs.rm(evidence.paths.approval, {force: true});
  const review = {
    schemaVersion: 'autovideo-subtitle-human-review/v1',
    projectId,
    status: 'in-progress',
    bindings: evidence.bindings,
    checklist: Object.fromEntries(subtitleReviewChecklistKeys.map((key) => [key, false])),
    cues: evidence.cues.map((cue) => ({id: cue.id, decision: 'pending', note: ''})),
    notes: '',
    reviewedBy: null,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return {review, path: evidence.paths.review, sha256: await sha256File(evidence.paths.review)};
};

export const approveSubtitleReview = async ({formalRoot, projectId, stage, reviewer = 'user'}) => {
  assertNotCreatorDelegatedHumanReview(reviewer);
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready subtitle stage can be approved.');
  const evidence = await subtitleEvidence({formalRoot, projectId});
  const review = await readJson(evidence.paths.review);
  if (!subtitleBindingsCurrent(review, evidence) || review.status !== 'ready-for-approval' || !subtitleReviewReady(review)) {
    throw new Error('Complete every subtitle checklist item and accept every current cue before approval.');
  }
  const reviewSha256 = await sha256File(evidence.paths.review);
  const approval = {
    schemaVersion: 'autovideo-subtitle-human-approval/v1',
    projectId,
    status: 'approved',
    approvalScope: 'human-review',
    approvedBy: reviewer,
    approvedAt: new Date().toISOString(),
    review: {path: relativePath(formalRoot, evidence.paths.review), sha256: reviewSha256},
    bindings: evidence.bindings,
  };
  await fs.writeFile(evidence.paths.approval, serialize(approval), 'utf8');
  return {approval, path: evidence.paths.approval, sha256: await sha256File(evidence.paths.approval)};
};

export const simulateSubtitleReview = async ({formalRoot, projectId, stage, delegationReceipt, reason}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready subtitle stage can be simulated.');
  const evidence = await subtitleEvidence({formalRoot, projectId});
  const delegation = await assertCreatorDelegation({
    formalRoot,
    projectId,
    delegationReceipt,
    requiredScopes: ['text-review', 'internal-only-workflow-simulation'],
  });
  const updatedAt = new Date().toISOString();
  const simulationReason = String(reason ?? '').trim();
  if (!simulationReason) throw new Error('Creator-delegated subtitle simulation requires a reason.');
  const review = {
    schemaVersion: 'autovideo-subtitle-internal-review/v1',
    projectId,
    status: 'accepted-for-internal-only',
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    bindings: evidence.bindings,
    checklist: Object.fromEntries(subtitleReviewChecklistKeys.map((key) => [key, false])),
    cues: evidence.cues.map((cue) => ({id: cue.id, decision: 'accepted', note: 'Accepted only for creator-delegated internal workflow simulation.'})),
    notes: simulationReason,
    reviewedBy: CREATOR_DELEGATED_REVIEWER,
    updatedAt,
    delegation: delegation.binding,
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await archiveCurrent(evidence.paths.review);
  await archiveCurrent(evidence.paths.approval);
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  const approval = {
    schemaVersion: 'autovideo-subtitle-internal-approval/v1',
    projectId,
    status: 'approved',
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    approvedBy: CREATOR_DELEGATED_REVIEWER,
    approvedAt: updatedAt,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    review: {path: relativePath(formalRoot, evidence.paths.review), sha256: await sha256File(evidence.paths.review)},
    bindings: evidence.bindings,
    delegation: delegation.binding,
  };
  await fs.writeFile(evidence.paths.approval, serialize(approval), 'utf8');
  return {approval, review, path: evidence.paths.approval, sha256: await sha256File(evidence.paths.approval)};
};

const screenPaths = (formalRoot) => ({
  check: path.join(formalRoot, 'qa', 'hyperframes-check.json'),
  build: path.join(formalRoot, 'production', 'hyperframes', 'data', 'composition-build.json'),
  alignment: path.join(formalRoot, 'audio', 'alignment.json'),
  shotManifest: path.join(formalRoot, 'plan', 'shot-manifest.json'),
  subtitleReview: path.join(formalRoot, 'qa', 'subtitle-human-review.json'),
  subtitleApproval: path.join(formalRoot, 'qa', 'subtitle-human-approval.json'),
  frameSet: path.join(formalRoot, 'qa', 'screen-text-frame-set.json'),
  ocr: path.join(formalRoot, 'qa', 'ocr-report.json'),
  review: path.join(formalRoot, 'qa', 'screen-text-human-review.json'),
  approval: path.join(formalRoot, 'qa', 'screen-text-human-approval.json'),
});

const snapshotNameAllowed = (name) => /\.(png|jpe?g|webp)$/i.test(name)
  && !/^contact-sheet\./i.test(name)
  && !/^finding-/i.test(name);

const listSnapshotFiles = async (directories) => {
  for (const directory of directories) {
    try {
      const entries = await fs.readdir(directory, {withFileTypes: true});
      const files = entries
        .filter((entry) => entry.isFile() && snapshotNameAllowed(entry.name))
        .map((entry) => path.join(directory, entry.name))
        .sort((left, right) => left.localeCompare(right));
      if (files.length) return files;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return [];
};

const parseSnapshotTime = (filePath) => {
  const match = path.basename(filePath).match(/(?:at-|@)(\d+(?:\.\d+)?)s/i);
  return match ? Number(match[1]) : null;
};

const frameSetDigestFor = (frameSet) => sha256(JSON.stringify({
  projectId: frameSet.projectId,
  composition: frameSet.composition,
  hyperframesCheck: frameSet.hyperframesCheck,
  samplingPolicyVersion: frameSet.samplingPolicyVersion,
  frames: frameSet.frames,
}));

const createFrameSet = async ({formalRoot, projectId, composition, paths, checkBinding}) => {
  const compositionRoot = resolveBoundPath(formalRoot, composition.path);
  const snapshotFiles = await listSnapshotFiles([
    path.join(compositionRoot, 'snapshots'),
    path.join(formalRoot, 'qa', 'composition-snapshots'),
    path.join(formalRoot, 'production', 'hyperframes-continuous', 'snapshots'),
  ]);
  if (!snapshotFiles.length) throw new Error('Screen-text review requires deterministic HyperFrames snapshots. Generate cue-bound snapshots first.');
  const [alignment, shotManifest] = await Promise.all([
    readJson(paths.alignment),
    readOptionalJson(paths.shotManifest),
  ]);
  const cues = Array.isArray(alignment.cues) ? alignment.cues : [];
  const shots = Array.isArray(shotManifest?.shots) ? shotManifest.shots : [];
  const frames = await Promise.all(snapshotFiles.map(async (filePath) => {
    const relativeFramePath = relativePath(formalRoot, filePath);
    const frameSha256 = await sha256File(filePath);
    const timeSeconds = parseSnapshotTime(filePath);
    const matchingCues = Number.isFinite(timeSeconds)
      ? cues.filter((cue) => Number(cue.start) <= timeSeconds && timeSeconds <= Number(cue.end)).map((cue) => cue.id)
      : [];
    const sceneIds = [...new Set(shots.filter((shot) => matchingCues.includes(shot.cueId)).map((shot) => shot.sceneId).filter(Boolean))];
    return {
      id: `frame-${sha256(`${relativeFramePath}\n${frameSha256}`).slice(0, 12)}`,
      timeSeconds,
      reason: Number.isFinite(timeSeconds) ? 'deterministic-timeline-sample' : 'named-review-snapshot',
      cueIds: matchingCues,
      sceneId: sceneIds.length === 1 ? sceneIds[0] : null,
      path: relativeFramePath,
      sha256: frameSha256,
    };
  }));
  if (new Set(frames.map((frame) => frame.id)).size !== frames.length) throw new Error('Screen-text frame IDs must be unique.');
  const uncoveredCueIds = cues
    .map((cue) => cue.id)
    .filter((cueId) => !frames.some((frame) => frame.cueIds.includes(cueId)));
  if (uncoveredCueIds.length) {
    throw new Error(`Screen-text snapshots do not cover every cue: ${uncoveredCueIds.join(', ')}`);
  }
  const frameSet = {
    schemaVersion: 'autovideo-screen-text-frame-set/v1',
    projectId,
    generatedAt: new Date().toISOString(),
    samplingPolicyVersion: 'cue-and-transition-snapshots/v1',
    composition,
    hyperframesCheck: checkBinding,
    frames,
  };
  frameSet.frameSetDigest = frameSetDigestFor(frameSet);
  await fs.mkdir(path.dirname(paths.frameSet), {recursive: true});
  await archiveCurrent(paths.frameSet);
  await fs.writeFile(paths.frameSet, serialize(frameSet), 'utf8');
  return frameSet;
};

const validateFrameSet = async ({formalRoot, projectId, composition, frameSet, checkBinding}) => {
  if (frameSet?.schemaVersion !== 'autovideo-screen-text-frame-set/v1'
    || frameSet.projectId !== projectId
    || !bindingsEqual(frameSet.composition, composition)
    || !bindingsEqual(frameSet.hyperframesCheck, checkBinding)
    || frameSet.frameSetDigest !== frameSetDigestFor(frameSet)
    || !Array.isArray(frameSet.frames)
    || !frameSet.frames.length) {
    throw new Error('Screen-text frame-set manifest is missing, stale, or malformed.');
  }
  if (new Set(frameSet.frames.map((frame) => frame.id)).size !== frameSet.frames.length) {
    throw new Error('Screen-text frame-set contains duplicate frame IDs.');
  }
  for (const frame of frameSet.frames) {
    if (!frame.id || !isSha256(frame.sha256)) throw new Error('Screen-text frame-set contains an invalid frame record.');
    const target = resolveBoundPath(formalRoot, frame.path);
    if (await sha256File(target) !== frame.sha256) throw new Error(`Screen-text frame changed after sampling: ${frame.id}`);
  }
  return frameSet.frames;
};

const ocrEvidence = async ({formalRoot, projectId, composition, frameSet, paths}) => {
  const ocr = await readOptionalJson(paths.ocr);
  if (!ocr) return {available: false, status: 'unavailable', engine: null, binding: null};
  const ocrSha256 = await sha256File(paths.ocr);
  const engine = ocr.engine ?? (ocr.tool ? {name: ocr.tool, version: ocr.version ?? null} : null);
  const ocrFrames = Array.isArray(ocr.frames) ? ocr.frames : [];
  const frameIdsUnique = new Set(ocrFrames.map((frame) => frame.id)).size === ocrFrames.length;
  const frameBindingsCurrent = frameIdsUnique
    && ocrFrames.length === frameSet.frames.length
    && frameSet.frames.every((frame) => ocrFrames.some((item) => item.id === frame.id
      && item.path === frame.path
      && item.sha256 === frame.sha256
      && item.status === 'passed'
      && Number(item.detectionCount ?? 0) === (Array.isArray(item.detections) ? item.detections.length : -1)));
  const frameSetSha256 = await sha256File(paths.frameSet);
  const receiptBindingsCurrent = bindingsEqual(ocr.bindings?.composition, composition)
    && ocr.bindings?.frameSet?.path === relativePath(formalRoot, paths.frameSet)
    && ocr.bindings?.frameSet?.sha256 === frameSetSha256
    && ocr.bindings?.frameSet?.digest === frameSet.frameSetDigest
    && bindingsEqual(ocr.bindings?.hyperframesCheck, frameSet.hyperframesCheck);
  const baseCurrent = Boolean(
    ocr.schemaVersion === 'autovideo-ocr-report/v1'
      && ocr.projectId === projectId
      && engine?.name
      && ocr.compositionDigest === composition.digest
      && ocr.frameSetDigest === frameSet.frameSetDigest
      && ocr.hyperframesCheckSha256 === frameSet.hyperframesCheck.sha256
      && receiptBindingsCurrent,
  );
  const available = Boolean(
    baseCurrent
      && ocr.status === 'passed'
      && engine?.version
      && Number(ocr.unresolvedCount ?? 0) === 0
      && frameBindingsCurrent,
  );
  const status = available
    ? 'passed'
    : baseCurrent && ['unavailable', 'unresolved'].includes(ocr.status)
      ? ocr.status
      : 'stale';
  return {
    available,
    status,
    engine,
    unresolvedCount: Number(ocr.unresolvedCount ?? ocrFrames.length),
    issueCount: Array.isArray(ocr.issues) ? ocr.issues.length : 0,
    binding: available ? {path: relativePath(formalRoot, paths.ocr), sha256: ocrSha256, engine} : null,
  };
};

const screenEvidence = async ({formalRoot, projectId, composition, createFrameSetIfMissing = false}) => {
  if (!composition?.path || !isSha256(composition.digest) || !Number.isInteger(composition.fileCount)) {
    throw new Error('A current HyperFrames composition digest is required for screen-text review.');
  }
  const paths = screenPaths(formalRoot);
  const [check, subtitleReview, subtitleApproval, checkSha256, subtitleApprovalSha256, buildSha256, currentSubtitleEvidence] = await Promise.all([
    readJson(paths.check),
    readOptionalJson(paths.subtitleReview),
    readOptionalJson(paths.subtitleApproval),
    sha256File(paths.check),
    optionalSha256(paths.subtitleApproval),
    sha256File(paths.build),
    subtitleEvidence({formalRoot, projectId}),
  ]);
  const explicitCheckProjectId = check.projectId ?? check.autoVideo?.projectId;
  if (explicitCheckProjectId && explicitCheckProjectId !== projectId) throw new Error('HyperFrames check receipt belongs to another project.');
  if (check.ok !== true || check.strict !== true
    || check.autoVideo?.compositionDigest !== composition.digest
    || Number(check.autoVideo?.compositionFileCount) !== composition.fileCount
    || check.autoVideo?.buildReceiptSha256 !== buildSha256) {
    throw new Error('HyperFrames check is failed or stale for the current composition and build receipt.');
  }
  if (!await subtitleApprovalCurrent(subtitleApproval, subtitleReview, currentSubtitleEvidence)) {
    throw new Error('Human subtitle review must be approved, or a current creator-delegated internal subtitle approval must exist, before screen-text review.');
  }
  const checkBinding = {path: relativePath(formalRoot, paths.check), sha256: checkSha256};
  let frameSet = await readOptionalJson(paths.frameSet);
  if (createFrameSetIfMissing) {
    let frameSetCurrent = false;
    if (frameSet) {
      try {
        await validateFrameSet({formalRoot, projectId, composition, frameSet, checkBinding});
        frameSetCurrent = true;
      } catch {
        // Explicit stage regeneration replaces a stale frame set with current snapshots.
      }
    }
    if (!frameSetCurrent) {
      frameSet = await createFrameSet({formalRoot, projectId, composition, paths, checkBinding});
    }
  }
  const frames = await validateFrameSet({formalRoot, projectId, composition, frameSet, checkBinding});
  const ocr = await ocrEvidence({formalRoot, projectId, composition, frameSet, paths});
  return {
    projectId,
    paths,
    composition,
    frameSet,
    frames,
    ocr,
    baseBindings: {
      hyperframesCheck: checkBinding,
      subtitleApproval: {path: relativePath(formalRoot, paths.subtitleApproval), sha256: subtitleApprovalSha256},
      composition,
      frameSet: {path: relativePath(formalRoot, paths.frameSet), sha256: await sha256File(paths.frameSet), digest: frameSet.frameSetDigest},
      frames,
    },
  };
};

const bindingsForMode = (evidence, reviewMode) => ({
  ...evidence.baseBindings,
  ocr: reviewMode === 'ocr-assisted' ? evidence.ocr.binding : null,
});

const screenBindingsCurrent = (review, evidence) => Boolean(
  review
    && review.projectId === evidence.projectId
    && bindingsEqual(review.bindings, bindingsForMode(evidence, review.reviewMode)),
);

const screenApprovalCurrent = async (approval, review, evidence) => Boolean(
  screenBindingsCurrent(review, evidence)
    && (((approval?.schemaVersion === 'autovideo-screen-text-human-approval/v1'
      && approval.projectId === evidence.projectId
      && approval.status === 'approved'
      && approval.approvalScope === 'human-review'
      && approval.reviewMode === review.reviewMode
      && approval.review?.path === relativePath(formalRootForEvidence(evidence), evidence.paths.review)
      && approval.review?.sha256 === await optionalSha256(evidence.paths.review)
      && bindingsEqual(approval.bindings, bindingsForMode(evidence, review.reviewMode))))
      || await internalApprovalCurrent({
        formalRoot: formalRootForEvidence(evidence),
        approval,
        review,
        schemaVersion: 'autovideo-screen-text-internal-approval/v1',
        projectId: evidence.projectId,
        reviewPath: relativePath(formalRootForEvidence(evidence), evidence.paths.review),
        reviewSha256: await optionalSha256(evidence.paths.review),
        bindings: bindingsForMode(evidence, review.reviewMode),
      })),
);

export const screenTextReviewReady = (review, ocrAvailable) => checklistReady(screenTextReviewChecklistKeys, review.checklist)
  && itemsReady(review.frames ?? [])
  && (review.reviewMode === 'manual' || (review.reviewMode === 'ocr-assisted' && ocrAvailable));

export const buildScreenTextReview = async ({formalRoot, projectId, composition}) => {
  const evidence = await screenEvidence({formalRoot, projectId, composition});
  const [review, approval] = await Promise.all([
    readOptionalJson(evidence.paths.review),
    readOptionalJson(evidence.paths.approval),
  ]);
  const bindingsCurrent = screenBindingsCurrent(review, evidence);
  const approvalCurrent = bindingsCurrent && await screenApprovalCurrent(approval, review, evidence);
  const decisions = new Map((review?.frames ?? []).map((item) => [item.id, item]));
  const frames = evidence.frames.map((frame) => ({
    ...frame,
    decision: decisions.get(frame.id)?.decision ?? 'pending',
    note: decisions.get(frame.id)?.note ?? '',
    imageUrl: `/api/projects/${encodeURIComponent(projectId)}/screen-text-review/frames/${frame.id}`,
  }));
  const checklist = Object.fromEntries(screenTextReviewChecklistKeys.map((key) => [key, review?.checklist?.[key] === true]));
  const status = approvalCurrent ? 'approved' : review && !bindingsCurrent ? 'stale' : (review?.status ?? 'not-started');
  return {
    schemaVersion: 'autovideo-screen-text-review-view/v1',
    projectId,
    composition,
    frameSet: {path: evidence.baseBindings.frameSet.path, digest: evidence.frameSet.frameSetDigest},
    ocr: {
      available: evidence.ocr.available,
      status: evidence.ocr.status,
      engine: evidence.ocr.engine,
      unresolvedCount: evidence.ocr.unresolvedCount ?? null,
      issueCount: evidence.ocr.issueCount ?? null,
    },
    review: {
      status,
      checklist,
      frames,
      reviewMode: review?.reviewMode ?? 'manual',
      notes: review?.notes ?? '',
      reviewedBy: review?.reviewedBy ?? null,
      updatedAt: review?.updatedAt ?? null,
      readyForApproval: status === 'ready-for-approval'
        && screenTextReviewReady({...review, checklist, frames}, evidence.ocr.available)
        && bindingsCurrent,
    },
    approval: approvalCurrent ? approval : null,
  };
};

export const initializeScreenTextReview = async ({formalRoot, projectId, composition}) => {
  const evidence = await screenEvidence({formalRoot, projectId, composition, createFrameSetIfMissing: true});
  await archiveCurrent(evidence.paths.review);
  await archiveCurrent(evidence.paths.approval);
  await fs.rm(evidence.paths.approval, {force: true});
  const reviewMode = 'manual';
  const review = {
    schemaVersion: 'autovideo-screen-text-human-review/v1',
    projectId,
    status: 'in-progress',
    bindings: bindingsForMode(evidence, reviewMode),
    checklist: Object.fromEntries(screenTextReviewChecklistKeys.map((key) => [key, false])),
    frames: evidence.frames.map((frame) => ({id: frame.id, decision: 'pending', note: ''})),
    reviewMode,
    notes: '',
    reviewedBy: null,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return {
    review: {
      ...review,
      frames: evidence.frames.map((frame) => ({...frame, decision: 'pending', note: ''})),
    },
    path: evidence.paths.review,
    sha256: await sha256File(evidence.paths.review),
  };
};

export const saveScreenTextReview = async ({formalRoot, projectId, composition, stage, rawInput, reviewer = 'user'}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Screen-text review must be review-ready before saving decisions.');
  const input = screenTextReviewInputSchema.parse(rawInput);
  const evidence = await screenEvidence({formalRoot, projectId, composition});
  assertExactItems(input.frames, evidence.frames.map((frame) => frame.id), 'Screen-text review');
  if (input.reviewMode === 'ocr-assisted' && !evidence.ocr.available) {
    throw new Error('OCR is unavailable or stale; select the explicit manual-review fallback.');
  }
  const [existingReview, existingApproval] = await Promise.all([
    readOptionalJson(evidence.paths.review),
    readOptionalJson(evidence.paths.approval),
  ]);
  if (existingApproval?.status === 'approved') {
    if (await screenApprovalCurrent(existingApproval, existingReview, evidence)) {
      throw new Error('Approved screen-text review is frozen. Reopen the stage before changing it.');
    }
    await archiveCurrent(evidence.paths.approval);
    await fs.rm(evidence.paths.approval, {force: true});
  }
  const review = {
    schemaVersion: 'autovideo-screen-text-human-review/v1',
    projectId,
    status: screenTextReviewReady(input, evidence.ocr.available) ? 'ready-for-approval' : 'in-progress',
    bindings: bindingsForMode(evidence, input.reviewMode),
    checklist: input.checklist,
    frames: input.frames,
    reviewMode: input.reviewMode,
    notes: input.notes,
    reviewedBy: reviewer,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  return review;
};

export const approveScreenTextReview = async ({formalRoot, projectId, composition, stage, reviewer = 'user'}) => {
  assertNotCreatorDelegatedHumanReview(reviewer);
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready screen-text stage can be approved.');
  const evidence = await screenEvidence({formalRoot, projectId, composition});
  const review = await readJson(evidence.paths.review);
  if (!screenBindingsCurrent(review, evidence)
    || review.status !== 'ready-for-approval'
    || !screenTextReviewReady(review, evidence.ocr.available)) {
    throw new Error('Complete every screen-text check and accept every current review frame before approval.');
  }
  const reviewSha256 = await sha256File(evidence.paths.review);
  const approval = {
    schemaVersion: 'autovideo-screen-text-human-approval/v1',
    projectId,
    status: 'approved',
    approvalScope: 'human-review',
    approvedBy: reviewer,
    approvedAt: new Date().toISOString(),
    reviewMode: review.reviewMode,
    review: {path: relativePath(formalRoot, evidence.paths.review), sha256: reviewSha256},
    bindings: bindingsForMode(evidence, review.reviewMode),
  };
  await fs.writeFile(evidence.paths.approval, serialize(approval), 'utf8');
  return {approval, path: evidence.paths.approval, sha256: await sha256File(evidence.paths.approval)};
};

export const simulateScreenTextReview = async ({formalRoot, projectId, composition, stage, delegationReceipt, reason}) => {
  if (!stage || stage.status !== 'needs-review') throw new Error('Only a review-ready screen-text stage can be simulated.');
  const [evidence, delegation] = await Promise.all([
    screenEvidence({formalRoot, projectId, composition}),
    assertCreatorDelegation({
      formalRoot,
      projectId,
      delegationReceipt,
      requiredScopes: ['text-review', 'internal-visual-review', 'internal-only-workflow-simulation'],
    }),
  ]);
  const simulationReason = String(reason ?? '').trim();
  if (!simulationReason) throw new Error('Creator-delegated screen-text simulation requires a reason.');
  const updatedAt = new Date().toISOString();
  const reviewMode = 'technical-only';
  const review = {
    schemaVersion: 'autovideo-screen-text-internal-review/v1',
    projectId,
    status: 'accepted-for-internal-only',
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    bindings: bindingsForMode(evidence, reviewMode),
    checklist: Object.fromEntries(screenTextReviewChecklistKeys.map((key) => [key, false])),
    frames: evidence.frames.map((frame) => ({id: frame.id, decision: 'accepted', note: 'Accepted only for creator-delegated internal workflow simulation.'})),
    reviewMode,
    machineAssistance: {
      ocrStatus: evidence.ocr.status,
      ocrAvailable: evidence.ocr.available,
      unresolvedCount: evidence.ocr.unresolvedCount ?? null,
    },
    notes: simulationReason,
    reviewedBy: CREATOR_DELEGATED_REVIEWER,
    updatedAt,
    delegation: delegation.binding,
  };
  await archiveCurrent(evidence.paths.review);
  await archiveCurrent(evidence.paths.approval);
  await fs.writeFile(evidence.paths.review, serialize(review), 'utf8');
  const approval = {
    schemaVersion: 'autovideo-screen-text-internal-approval/v1',
    projectId,
    status: 'approved',
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    approvedBy: CREATOR_DELEGATED_REVIEWER,
    approvedAt: updatedAt,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    reviewMode,
    review: {path: relativePath(formalRoot, evidence.paths.review), sha256: await sha256File(evidence.paths.review)},
    bindings: bindingsForMode(evidence, reviewMode),
    delegation: delegation.binding,
  };
  await fs.writeFile(evidence.paths.approval, serialize(approval), 'utf8');
  return {approval, review, path: evidence.paths.approval, sha256: await sha256File(evidence.paths.approval)};
};

export const resolveScreenTextReviewFrame = async ({formalRoot, projectId, composition, frameId}) => {
  const evidence = await screenEvidence({formalRoot, projectId, composition});
  const frame = evidence.frames.find((item) => item.id === frameId);
  if (!frame) throw new Error('Unknown screen-text review frame.');
  return resolveBoundPath(formalRoot, frame.path);
};

export const reopenTextReview = async ({formalRoot, stageId}) => {
  const paths = stageId === 'subtitle-review' ? subtitlePaths(formalRoot) : stageId === 'screen-text-review' ? screenPaths(formalRoot) : null;
  if (!paths) return;
  await archiveCurrent(paths.approval);
  await fs.rm(paths.approval, {force: true});
};
