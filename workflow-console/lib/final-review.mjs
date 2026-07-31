import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {
  findCompositionRoot,
  formalProjectRoot,
  hashDirectoryManifest,
  sha256File,
} from './project-store.mjs';
import {
  assertCreatorDelegation,
  assertNotCreatorDelegatedHumanReview,
  CREATOR_DELEGATED_REVIEWER,
  INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
} from './creator-delegation.mjs';

export const finalReviewChecklistKeys = [
  'fullTimeline',
  'audioVisualSync',
  'captions',
  'visuals',
  'content',
];

export const finalReviewInputSchema = z.object({
  checklist: z.object(Object.fromEntries(finalReviewChecklistKeys.map((key) => [key, z.boolean()]))),
  notes: z.string().max(8000).default(''),
});

const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);

const readOptionalJson = async (filePath) => {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const optionalSha256File = async (filePath) => {
  try {
    return await sha256File(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

export const finalReviewIsReady = (review) => finalReviewChecklistKeys
  .every((key) => review.checklist?.[key] === true);

const reviewPaths = (formalRoot) => ({
  review: path.join(formalRoot, 'qa', 'human-final-review.json'),
  internalReview: path.join(formalRoot, 'qa', 'internal-final-review.json'),
  preview: path.join(formalRoot, 'qa', 'final-preview.json'),
  projectState: path.join(formalRoot, 'project-state.json'),
});

const currentEvidence = async (project) => {
  const formalRoot = formalProjectRoot(project);
  const compositionRoot = await findCompositionRoot(formalRoot);
  const paths = reviewPaths(formalRoot);
  const [composition, preview, previewSha256] = await Promise.all([
    hashDirectoryManifest(compositionRoot),
    readOptionalJson(paths.preview),
    optionalSha256File(paths.preview),
  ]);
  if (preview && preview.projectId !== project.id) throw new Error('Final preview receipt belongs to a different project.');
  return {formalRoot, compositionRoot, composition, preview, previewSha256, paths};
};

const assertPreviewMatchesComposition = ({composition, preview}) => {
  if (!preview) throw new Error('The final-review session receipt is missing. Save the review again before approval.');
  if (preview.compositionDigest !== composition.digest || Number(preview.fileCount) !== composition.files.length) {
    throw new Error('Final preview receipt is stale because the HyperFrames composition changed.');
  }
};

const assertReviewStageReady = (project) => {
  const stage = project.stages?.['final-preview'];
  const isReviewable = stage?.status === 'needs-review'
    || (stage?.status === 'approved' && stage?.approvalScope === 'internal-autonomous-review');
  if (!isReviewable) {
    throw new Error('Final preview must be review-ready before recording the human final review.');
  }
  if (!stage.previewStartedAt || Number.isNaN(Date.parse(stage.previewStartedAt))) {
    throw new Error('Start HyperFrames Studio before recording the human final review.');
  }
  if (project.stages?.['qa-review']?.status !== 'approved') {
    throw new Error('HyperFrames check must pass before recording the human final review.');
  }
  return stage;
};

const ensureReviewSessionReceipt = async (project, evidence, stage) => {
  const currentSession = evidence.preview?.status === 'human-review-in-progress'
    && evidence.preview.previewStartedAt === stage.previewStartedAt
    && evidence.preview.approvedBy == null;
  if (evidence.preview && (stage.status !== 'needs-review' || currentSession)) return evidence;
  const receipt = {
    schemaVersion: 'autovideo-final-preview-review-session/v1',
    projectId: project.id,
    status: 'human-review-in-progress',
    releaseScope: project.publicationRights === 'cleared' ? 'public-release' : 'internal-only',
    publicReleaseBlocked: project.publicationRights !== 'cleared',
    approvedBy: null,
    approvedAt: null,
    approvalScope: null,
    previewStartedAt: stage.previewStartedAt,
    previewUrl: stage.previewUrl ?? null,
    composition: path.relative(evidence.formalRoot, evidence.compositionRoot).replaceAll('\\', '/'),
    compositionDigest: evidence.composition.digest,
    fileCount: evidence.composition.files.length,
    files: evidence.composition.files,
  };
  await fs.mkdir(path.dirname(evidence.paths.preview), {recursive: true});
  await fs.writeFile(evidence.paths.preview, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return {
    ...evidence,
    preview: receipt,
    previewSha256: await sha256File(evidence.paths.preview),
  };
};

const reviewBindingsAreCurrent = async (project, evidence, review) => {
  if (!review) return false;
  const compositionMatches = review.composition?.digest === evidence.composition.digest
    && Number(review.composition?.fileCount) === evidence.composition.files.length;
  if (!compositionMatches) return false;

  const approvalScope = project.stages?.['final-preview']?.approvalScope ?? null;
  if (approvalScope === 'human-review') {
    const reviewSha256 = await sha256File(evidence.paths.review);
    return evidence.preview?.humanReview?.sha256 === reviewSha256;
  }
  return Boolean(evidence.previewSha256 && review.previewReceipt?.sha256 === evidence.previewSha256);
};

export const buildFinalReview = async (project) => {
  const evidence = await currentEvidence(project);
  const review = await readOptionalJson(evidence.paths.review);
  const bindingsCurrent = await reviewBindingsAreCurrent(project, evidence, review);
  const checklist = Object.fromEntries(finalReviewChecklistKeys
    .map((key) => [key, review?.checklist?.[key] === true]));
  const stage = project.stages?.['final-preview'] ?? {};
  const reviewStatus = review && !bindingsCurrent ? 'stale' : (review?.status ?? 'not-started');
  return {
    schemaVersion: 'autovideo-final-review-view/v1',
    projectId: project.id,
    composition: {
      digest: evidence.composition.digest,
      fileCount: evidence.composition.files.length,
    },
    preview: {
      startedAt: stage.previewStartedAt ?? evidence.preview?.previewStartedAt ?? null,
      url: stage.previewUrl ?? evidence.preview?.previewUrl ?? null,
    },
    approval: {
      scope: stage.approvalScope ?? null,
      approvedBy: stage.approvedBy ?? null,
      approvedAt: stage.approvedAt ?? null,
    },
    review: {
      status: reviewStatus,
      checklist,
      notes: review?.notes ?? '',
      reviewedBy: review?.reviewedBy ?? null,
      updatedAt: review?.updatedAt ?? null,
      readyForApproval: reviewStatus === 'ready-for-approval'
        && finalReviewIsReady({...review, checklist})
        && bindingsCurrent,
    },
  };
};

export const saveFinalReview = async (project, rawInput, reviewer = 'user') => {
  assertNotCreatorDelegatedHumanReview(reviewer);
  const input = finalReviewInputSchema.parse(rawInput);
  const currentStage = project.stages?.['final-preview'];
  if (currentStage?.approvalScope === 'human-review') {
    throw new Error('Human final-review approval is frozen. Reopen final-preview before changing its review.');
  }
  const stage = assertReviewStageReady(project);
  let evidence = await currentEvidence(project);
  evidence = await ensureReviewSessionReceipt(project, evidence, stage);
  assertPreviewMatchesComposition(evidence);
  const review = {
    schemaVersion: 'autovideo-human-final-review/v1',
    projectId: project.id,
    composition: {
      path: path.relative(evidence.formalRoot, evidence.compositionRoot).replaceAll('\\', '/'),
      digest: evidence.composition.digest,
      fileCount: evidence.composition.files.length,
    },
    previewReceipt: {
      path: path.relative(evidence.formalRoot, evidence.paths.preview).replaceAll('\\', '/'),
      sha256: evidence.previewSha256,
    },
    previewStartedAt: stage.previewStartedAt,
    status: finalReviewIsReady(input) ? 'ready-for-approval' : 'in-progress',
    checklist: input.checklist,
    notes: input.notes,
    reviewedBy: reviewer,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(evidence.paths.review), {recursive: true});
  await fs.writeFile(evidence.paths.review, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  return review;
};

export const assertFinalReviewReady = async (project) => {
  const stage = assertReviewStageReady(project);
  const evidence = await currentEvidence(project);
  assertPreviewMatchesComposition(evidence);
  const review = await readJson(evidence.paths.review);
  if (review.status !== 'ready-for-approval' || !finalReviewIsReady(review)) {
    throw new Error('Complete all five final-review checks before human approval.');
  }
  if (review.projectId !== project.id) throw new Error('Human final review belongs to a different project.');
  if (review.composition?.digest !== evidence.composition.digest
    || Number(review.composition?.fileCount) !== evidence.composition.files.length) {
    throw new Error('Human final review is stale because the HyperFrames composition changed.');
  }
  if (review.previewReceipt?.sha256 !== evidence.previewSha256) {
    throw new Error('Human final review is stale because the final preview receipt changed.');
  }
  if (evidence.preview.previewStartedAt !== stage.previewStartedAt) {
    throw new Error('Human final review is stale because the final-preview session receipt changed.');
  }
  if (review.previewStartedAt !== stage.previewStartedAt) {
    throw new Error('Human final review is stale because the Studio review session changed.');
  }
  return {
    review,
    path: evidence.paths.review,
    sha256: await sha256File(evidence.paths.review),
  };
};

export const simulateFinalReview = async (project, {delegationReceipt, reason} = {}) => {
  if (project.publicationRights !== 'internal-only') {
    throw new Error('Creator-delegated final review simulation requires an explicit internal-only project.');
  }
  const stage = project.stages?.['final-preview'];
  if (!stage || stage.status !== 'needs-review') {
    throw new Error('Only a review-ready final preview can be simulated.');
  }
  if (!stage.previewStartedAt || Number.isNaN(Date.parse(stage.previewStartedAt))) {
    throw new Error('Start the HyperFrames Studio preview session before internal simulation.');
  }
  if (project.stages?.['qa-review']?.status !== 'approved') {
    throw new Error('HyperFrames check must pass before internal final-review simulation.');
  }
  const simulationReason = String(reason ?? '').trim();
  if (!simulationReason) throw new Error('Creator-delegated final review simulation requires a reason.');
  const evidence = await currentEvidence(project);
  const delegation = await assertCreatorDelegation({
    formalRoot: evidence.formalRoot,
    projectId: project.id,
    delegationReceipt,
    requiredScopes: ['internal-visual-review', 'internal-only-workflow-simulation'],
  });
  const approvedAt = new Date().toISOString();
  const compositionBinding = {
    path: path.relative(evidence.formalRoot, evidence.compositionRoot).replaceAll('\\', '/'),
    digest: evidence.composition.digest,
    fileCount: evidence.composition.files.length,
  };
  const review = {
    schemaVersion: 'autovideo-internal-final-review/v1',
    projectId: project.id,
    status: 'accepted-for-internal-only',
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    composition: compositionBinding,
    previewStartedAt: stage.previewStartedAt,
    checklist: Object.fromEntries(finalReviewChecklistKeys.map((key) => [key, false])),
    notes: simulationReason,
    reviewedBy: CREATOR_DELEGATED_REVIEWER,
    updatedAt: approvedAt,
    delegation: delegation.binding,
  };
  await fs.mkdir(path.dirname(evidence.paths.internalReview), {recursive: true});
  await fs.writeFile(evidence.paths.internalReview, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  const preview = {
    schemaVersion: 'autovideo-final-preview-internal-approval/v1',
    projectId: project.id,
    status: 'approved-internal-only',
    releaseScope: 'internal-only',
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    approvedBy: CREATOR_DELEGATED_REVIEWER,
    approvedAt,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    previewStartedAt: stage.previewStartedAt,
    previewUrl: stage.previewUrl ?? null,
    composition: compositionBinding.path,
    compositionDigest: compositionBinding.digest,
    fileCount: compositionBinding.fileCount,
    files: evidence.composition.files,
    internalReview: {
      path: path.relative(evidence.formalRoot, evidence.paths.internalReview).replaceAll('\\', '/'),
      sha256: await sha256File(evidence.paths.internalReview),
    },
    delegation: delegation.binding,
  };
  await fs.writeFile(evidence.paths.preview, `${JSON.stringify(preview, null, 2)}\n`, 'utf8');

  const state = await readOptionalJson(evidence.paths.projectState);
  if (state) {
    state.gates ??= {};
    state.gates.finalPreview = {
      status: 'approved-internal-only',
      approvedBy: CREATOR_DELEGATED_REVIEWER,
      approvedAt,
      approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
      humanReviewPerformed: false,
      publicReleaseBlocked: true,
      compositionDigest: compositionBinding.digest,
      compositionFileCount: compositionBinding.fileCount,
      delegation: delegation.binding,
      notes: 'Creator-delegated internal simulation only; no human final review was performed.',
    };
    state.stage = 'internal-preview-approved';
    state.updatedAt = approvedAt;
    state.nextAction = 'Render only an internal-review MP4 and keep public release blocked.';
    await fs.writeFile(evidence.paths.projectState, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
  return {
    review,
    preview,
    path: evidence.paths.preview,
    sha256: await sha256File(evidence.paths.preview),
  };
};
