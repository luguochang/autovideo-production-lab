import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const exactIds = (values) => Array.isArray(values)
  && values.every((value) => typeof value === 'string' && value)
  && new Set(values).size === values.length;
const CREATOR_DELEGATED_REVIEWER = 'codex-creator-delegated';
const INTERNAL_AUTONOMOUS_REVIEW_SCOPE = 'internal-autonomous-review';

const resolveInside = (root, relative) => {
  if (!relative || path.isAbsolute(relative)) throw new Error('Semantic SFX delegation path must be project-relative.');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Semantic SFX delegation path leaves the project root.');
  }
  return target;
};

const canonicalApprovedPlan = (candidate, decisions) => {
  const approvedIds = new Set(decisions.filter((item) => item.decision === 'approved').map((item) => item.cueId));
  const cues = (candidate.cues ?? []).filter((cue) => approvedIds.has(cue.id));
  const roles = new Set(cues.map((cue) => cue.bindingRole));
  return {
    ...structuredClone(candidate),
    status: 'approved',
    bindings: (candidate.bindings ?? []).filter((binding) => roles.has(binding.role)),
    cues,
  };
};

export async function assertSemanticSfxApproval({projectDir, projectId, plan, planPath, planSha256 = null}) {
  if (plan?.status !== 'approved') return null;
  const reviewPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.review.json');
  const candidatePath = path.join(projectDir, 'plan', 'semantic-sfx-plan.candidate.json');
  let evidence;
  try {
    evidence = await Promise.all([
      readJson(reviewPath),
      readJson(candidatePath),
      planSha256 ?? sha256File(planPath),
      sha256File(reviewPath),
      sha256File(candidatePath),
    ]);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('Approved semantic SFX requires its review receipt and candidate snapshot.');
    }
    throw error;
  }
  const [review, candidate, currentPlanSha256, reviewSha256, candidateSha256] = evidence;
  const humanApproval = review?.approvalScope === 'human-review'
    && review.humanReviewPerformed === true
    && review.publicReleaseBlocked === false
    && review.approvedBy !== CREATOR_DELEGATED_REVIEWER;
  const internalApproval = review?.approvalScope === INTERNAL_AUTONOMOUS_REVIEW_SCOPE
    && review.humanReviewPerformed === false
    && review.publicReleaseBlocked === true
    && review.approvedBy === CREATOR_DELEGATED_REVIEWER
    && review.delegatedSimulation?.mode === 'creator-delegated-internal-only';
  if (review?.schemaVersion !== 'autovideo-semantic-sfx-review/v1'
      || review.projectId !== projectId
      || review.planId !== plan.planId
      || review.status !== 'approved'
      || !review.approvedBy
      || !review.approvedAt
      || (!humanApproval && !internalApproval)) {
    throw new Error('Approved semantic SFX requires a current project-bound human or internal-only review receipt.');
  }
  if (review.approvedPlan?.path !== 'plan/semantic-sfx-plan.json'
      || review.approvedPlan?.sha256 !== currentPlanSha256) {
    throw new Error('Semantic SFX review is stale for the current approved plan.');
  }
  if (review.sourcePlan?.path !== 'plan/semantic-sfx-plan.candidate.json'
      || review.sourcePlan?.sha256 !== candidateSha256
      || candidate?.planId !== plan.planId
      || candidate.status !== 'candidate') {
    throw new Error('Semantic SFX review has no current candidate source snapshot.');
  }
  const decisionIds = (review.decisions ?? []).map((item) => item.cueId);
  const candidateIds = (candidate.cues ?? []).map((cue) => cue.id);
  if (!exactIds(decisionIds)
      || !exactIds(candidateIds)
      || decisionIds.length !== candidateIds.length
      || candidateIds.some((cueId) => !decisionIds.includes(cueId))
      || review.decisions.some((item) => !['approved', 'rejected'].includes(item.decision))) {
    throw new Error('Semantic SFX review decisions do not cover the candidate plan exactly once.');
  }
  const expectedPlan = canonicalApprovedPlan(candidate, review.decisions);
  if (JSON.stringify(expectedPlan) !== JSON.stringify(plan)) {
    throw new Error('Approved semantic SFX plan differs from the reviewed candidate subset.');
  }
  let delegation = null;
  if (internalApproval) {
    const binding = review.delegation;
    if (!binding?.path || !/^[a-f0-9]{64}$/iu.test(String(binding.sha256 ?? ''))
      || binding.path !== review.delegatedSimulation?.receiptPath
      || binding.sha256 !== review.delegatedSimulation?.receiptSha256) {
      throw new Error('Internal semantic SFX review is missing its creator delegation binding.');
    }
    const delegationPath = resolveInside(projectDir, binding.path);
    const [receipt, actualSha256] = await Promise.all([readJson(delegationPath), sha256File(delegationPath)]);
    const scopes = Array.isArray(receipt.scope) ? receipt.scope : [];
    if (actualSha256 !== binding.sha256
      || receipt.schemaVersion !== 'autovideo-creator-delegation/v1'
      || receipt.projectId !== projectId
      || receipt.delegate !== 'codex'
      || !scopes.includes('internal-only-workflow-simulation')
      || receipt.constraints?.publicReleaseAllowed !== false
      || receipt.constraints?.audioPlaybackAllowed !== false
      || receipt.constraints?.soundOutputAllowed !== false) {
      throw new Error('Internal semantic SFX review has an invalid or stale creator delegation receipt.');
    }
    delegation = binding;
  }
  return {
    path: 'plan/semantic-sfx-plan.review.json',
    sha256: reviewSha256,
    approvedBy: review.approvedBy,
    approvedAt: review.approvedAt,
    approvalScope: review.approvalScope,
    humanReviewPerformed: review.humanReviewPerformed,
    publicReleaseBlocked: review.publicReleaseBlocked,
    delegation,
    sourcePlan: review.sourcePlan,
    approvedPlan: review.approvedPlan,
  };
}
