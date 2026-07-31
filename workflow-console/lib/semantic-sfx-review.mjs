import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {validateSemanticSfxPlan} from '../../style-library/schema/semantic-sfx-plan.validator.mjs';
import {
  assertCreatorDelegation,
  assertNotCreatorDelegatedHumanReview,
  CREATOR_DELEGATED_REVIEWER,
  INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
} from './creator-delegation.mjs';
import {readProjectMediaInventory, serializeMediaAsset} from './media-assets.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, '..', '..');
const motionLibraryPath = path.join(workspaceRoot, 'style-library', 'motion-library', 'knowledge-explainer-v1.json');

const decisionSchema = z.object({
  cueId: z.string().regex(/^sfx-cue-[0-9]+$/),
  decision: z.enum(['pending', 'approved', 'rejected']),
  note: z.string().trim().max(500).optional().default(''),
}).strict();

export const semanticSfxReviewInputSchema = z.object({
  sourcePlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
  decisions: z.array(decisionSchema).max(200),
  notes: z.string().trim().max(2000).optional().default(''),
}).strict();

export const semanticSfxReopenInputSchema = z.object({
  sourcePlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(2).max(500),
}).strict();

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Buffer = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (target) => sha256Buffer(await fs.readFile(target));

const readJson = async (target, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};

const writeAtomic = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, stableJson(value), 'utf8');
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, {force: true}).catch(() => undefined);
    throw error;
  }
};

const pathsFor = (projectRoot) => ({
  plan: path.join(projectRoot, 'plan', 'semantic-sfx-plan.json'),
  candidate: path.join(projectRoot, 'plan', 'semantic-sfx-plan.candidate.json'),
  review: path.join(projectRoot, 'plan', 'semantic-sfx-plan.review.json'),
});

export const findCreatorDelegationReceipt = async ({projectRoot, projectId}) => {
  const directory = path.join(projectRoot, 'receipts', 'creator-delegation');
  let entries;
  try { entries = await fs.readdir(directory, {withFileTypes: true}); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error('No creator delegation receipt is available for internal semantic SFX simulation.');
    throw error;
  }
  const candidates = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join('receipts/creator-delegation', entry.name);
    const document = await readJson(path.join(directory, entry.name));
    if (document?.schemaVersion === 'autovideo-creator-delegation/v1'
      && document.projectId === projectId
      && document.delegate === 'codex'
      && document.constraints?.publicReleaseAllowed === false
      && Array.isArray(document.scope)
      && document.scope.includes('internal-only-workflow-simulation')) candidates.push(relative);
  }
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? 'No matching creator delegation receipt is available for internal semantic SFX simulation.'
      : 'Multiple creator delegation receipts are available; pass --delegation or delegationReceipt explicitly.');
  }
  return candidates[0];
};

const normalizeDecisions = (plan, storedReview) => {
  const byId = new Map((storedReview?.decisions ?? []).map((item) => [item.cueId, item]));
  return (plan.cues ?? []).map((cue) => ({
    cueId: cue.id,
    decision: ['approved', 'rejected'].includes(byId.get(cue.id)?.decision)
      ? byId.get(cue.id).decision
      : 'pending',
    note: String(byId.get(cue.id)?.note ?? ''),
  }));
};

const assertUniqueKnownDecisions = (plan, decisions) => {
  const known = new Set((plan.cues ?? []).map((cue) => cue.id));
  const seen = new Set();
  for (const decision of decisions) {
    if (!known.has(decision.cueId)) throw new Error(`Unknown semantic SFX cue: ${decision.cueId}`);
    if (seen.has(decision.cueId)) throw new Error(`Duplicate semantic SFX decision: ${decision.cueId}`);
    seen.add(decision.cueId);
  }
};

const loadSourcePlan = async (projectRoot) => {
  const paths = pathsFor(projectRoot);
  const current = await readJson(paths.plan);
  if (!current) return {paths, current: null, source: null, sourcePath: null, sourceSha256: null};
  const receipt = await readJson(paths.review);
  if (current.status === 'approved' && receipt?.status === 'approved') {
    const currentSha256 = await sha256File(paths.plan);
    if (receipt.approvedPlan?.sha256 === currentSha256) {
      const candidate = await readJson(paths.candidate);
      if (candidate) {
        const candidateSha256 = await sha256File(paths.candidate);
        if (receipt.sourcePlan?.sha256 === candidateSha256) {
          return {
            paths,
            current,
            source: candidate,
            sourcePath: paths.candidate,
            sourceSha256: candidateSha256,
            currentSha256,
            receipt,
          };
        }
      }
    }
  }
  return {
    paths,
    current,
    source: current,
    sourcePath: paths.plan,
    sourceSha256: await sha256File(paths.plan),
    currentSha256: await sha256File(paths.plan),
    receipt,
  };
};

const publicBindingFor = (binding, inventory) => {
  const asset = binding?.assetId ? inventory.byId.get(binding.assetId) : null;
  return {
    role: binding?.role ?? null,
    intent: binding?.intent ?? null,
    assetId: binding?.assetId ?? null,
    resolutionStatus: binding?.resolutionStatus ?? 'unresolved',
    sha256: binding?.sha256 ?? null,
    provider: binding?.provider ?? null,
    licenseReceipt: binding?.licenseReceipt ?? null,
    asset: asset ? serializeMediaAsset(asset) : null,
  };
};

export async function buildSemanticSfxReview({projectRoot, projectId}) {
  const loaded = await loadSourcePlan(projectRoot);
  if (!loaded.current || !loaded.source) {
    return {
      available: false,
      status: 'missing',
      message: 'No semantic SFX plan has been generated for this project.',
      cues: [],
      decisions: [],
      policy: null,
    };
  }
  if (loaded.source.schemaVersion !== 'autovideo-semantic-sfx-plan/v1') {
    throw new Error('Unsupported semantic SFX plan schema version.');
  }
  if (loaded.source.planId !== `${projectId}-sparse-sfx`) {
    throw new Error('Semantic SFX plan belongs to another project.');
  }

  const inventory = await readProjectMediaInventory({projectRoot, projectId});
  const receiptMatches = loaded.receipt?.sourcePlan?.sha256 === loaded.sourceSha256;
  const decisions = normalizeDecisions(loaded.source, receiptMatches ? loaded.receipt : null);
  const decisionById = new Map(decisions.map((item) => [item.cueId, item]));
  const bindingByRole = new Map((loaded.source.bindings ?? []).map((binding) => [binding.role, binding]));
  const currentApproved = loaded.current.status === 'approved'
    && loaded.receipt?.status === 'approved'
    && loaded.receipt?.approvedPlan?.sha256 === loaded.currentSha256
    && receiptMatches;
  const publicCues = (loaded.source.cues ?? []).map((cue) => ({
    ...cue,
    decision: decisionById.get(cue.id)?.decision ?? 'pending',
    note: decisionById.get(cue.id)?.note ?? '',
    binding: publicBindingFor(bindingByRole.get(cue.bindingRole), inventory),
  }));
  const approvalBlockers = publicCues.flatMap((cue) => (
    cue.decision === 'approved' && (!cue.binding?.asset?.selectionReady || cue.binding.resolutionStatus !== 'resolved')
      ? [{cueId: cue.id, role: cue.role, reason: 'resolved-local-sfx-binding-required'}]
      : []
  ));

  return {
    available: true,
    status: currentApproved ? 'approved' : receiptMatches ? loaded.receipt?.status ?? 'candidate' : 'candidate',
    planId: loaded.source.planId,
    version: loaded.source.version,
    sourcePlan: {
      path: path.relative(projectRoot, loaded.sourcePath).replaceAll('\\', '/'),
      sha256: loaded.sourceSha256,
      currentStatus: loaded.current.status,
    },
    approvedPlan: currentApproved ? loaded.receipt.approvedPlan : null,
    approvalReceiptPath: path.relative(projectRoot, loaded.paths.review).replaceAll('\\', '/'),
    defaultSilent: !currentApproved,
    policy: {
      maxPerMinute: loaded.source.policy?.maxPerMinute,
      minGapSeconds: loaded.source.policy?.minGapSeconds,
      narrationGainChangeDb: loaded.source.policy?.mix?.narrationGainChangeDb,
    },
    counts: {
      total: decisions.length,
      approved: decisions.filter((item) => item.decision === 'approved').length,
      rejected: decisions.filter((item) => item.decision === 'rejected').length,
      pending: decisions.filter((item) => item.decision === 'pending').length,
    },
    canApprove: !currentApproved
      && loaded.current.status === 'candidate'
      && decisions.every((item) => item.decision !== 'pending')
      && approvalBlockers.length === 0,
    approvalBlockers,
    notes: receiptMatches ? String(loaded.receipt?.notes ?? '') : '',
    reviewedBy: receiptMatches ? loaded.receipt?.reviewedBy ?? null : null,
    reviewedAt: receiptMatches ? loaded.receipt?.reviewedAt ?? null : null,
    approvalScope: currentApproved ? loaded.receipt?.approvalScope ?? null : null,
    humanReviewPerformed: currentApproved ? loaded.receipt?.humanReviewPerformed ?? null : null,
    publicReleaseBlocked: currentApproved ? loaded.receipt?.publicReleaseBlocked ?? null : null,
    delegatedSimulation: currentApproved ? loaded.receipt?.delegatedSimulation ?? null : null,
    decisions,
    cues: publicCues,
  };
}

export async function saveSemanticSfxReview({projectRoot, projectId, input, reviewer}) {
  const parsed = semanticSfxReviewInputSchema.parse(input);
  const loaded = await loadSourcePlan(projectRoot);
  if (!loaded.current || loaded.current.status !== 'candidate') {
    throw new Error('Only a current candidate semantic SFX plan can be reviewed. Reopen an approved plan first.');
  }
  if (parsed.sourcePlanSha256 !== loaded.sourceSha256) {
    throw new Error('Semantic SFX plan changed after this page loaded. Reload before saving decisions.');
  }
  assertUniqueKnownDecisions(loaded.source, parsed.decisions);
  const byId = new Map(parsed.decisions.map((item) => [item.cueId, item]));
  const decisions = (loaded.source.cues ?? []).map((cue) => ({
    cueId: cue.id,
    decision: byId.get(cue.id)?.decision ?? 'pending',
    note: byId.get(cue.id)?.note ?? '',
  }));
  const now = new Date().toISOString();
  const receipt = {
    schemaVersion: 'autovideo-semantic-sfx-review/v1',
    projectId,
    planId: loaded.source.planId,
    status: decisions.some((item) => item.decision !== 'pending') ? 'in-progress' : 'candidate',
    sourcePlan: {path: 'plan/semantic-sfx-plan.json', sha256: loaded.sourceSha256},
    approvedPlan: null,
    decisions,
    notes: parsed.notes,
    reviewedBy: reviewer,
    reviewedAt: now,
    approvalScope: 'human-review',
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    policy: {
      atomicPlanApproval: true,
      rejectedCuesRemainSilent: true,
      pendingCuesBlockApproval: true,
      narrationGainChangeDb: 0,
    },
  };
  await writeAtomic(loaded.paths.review, receipt);
  return buildSemanticSfxReview({projectRoot, projectId});
}

const commitSemanticSfxApproval = async ({
  projectRoot,
  projectId,
  parsed,
  reviewer,
  approvalScope,
  humanReviewPerformed,
  publicReleaseBlocked,
  delegation = null,
  simulationReason = null,
}) => {
  const loaded = await loadSourcePlan(projectRoot);
  const review = await readJson(loaded.paths.review);
  if (loaded.current?.status !== 'candidate' || parsed.sourcePlanSha256 !== loaded.sourceSha256) {
    throw new Error('Semantic SFX plan changed before approval. Reload and review it again.');
  }
  if (review.decisions.some((item) => item.decision === 'pending')) {
    throw new Error('Approve or reject every candidate cue before approving the plan.');
  }
  const inventory = await readProjectMediaInventory({projectRoot, projectId});
  const bindingByRole = new Map((loaded.source.bindings ?? []).map((binding) => [binding.role, binding]));
  const unresolvedApproved = (loaded.source.cues ?? []).filter((cue) => {
    const decision = review.decisions.find((item) => item.cueId === cue.id);
    if (decision?.decision !== 'approved') return false;
    const binding = bindingByRole.get(cue.bindingRole);
    return binding?.resolutionStatus !== 'resolved' || !inventory.byId.get(binding.assetId)?.selectionReady;
  });
  if (unresolvedApproved.length) {
    throw new Error(`Approved semantic SFX cues require resolved local assets: ${unresolvedApproved.map((cue) => cue.id).join(', ')}`);
  }

  const approvedCueIds = new Set(review.decisions
    .filter((item) => item.decision === 'approved')
    .map((item) => item.cueId));
  const approvedCues = (loaded.source.cues ?? []).filter((cue) => approvedCueIds.has(cue.id));
  const approvedRoles = new Set(approvedCues.map((cue) => cue.bindingRole));
  const approvedPlan = {
    ...structuredClone(loaded.source),
    status: 'approved',
    bindings: (loaded.source.bindings ?? []).filter((binding) => approvedRoles.has(binding.role)),
    cues: approvedCues,
  };
  const motionLibrary = JSON.parse(await fs.readFile(motionLibraryPath, 'utf8'));
  const validationErrors = validateSemanticSfxPlan(approvedPlan, motionLibrary);
  if (validationErrors.length) {
    throw new Error(`Approved semantic SFX plan is invalid: ${validationErrors.map((item) => item.code).join(', ')}`);
  }

  await writeAtomic(loaded.paths.candidate, loaded.source);
  const candidateSha256 = await sha256File(loaded.paths.candidate);
  if (candidateSha256 !== loaded.sourceSha256) throw new Error('Candidate SFX snapshot hash mismatch.');
  await writeAtomic(loaded.paths.plan, approvedPlan);
  const approvedPlanSha256 = await sha256File(loaded.paths.plan);
  const approvedAt = new Date().toISOString();
  const receipt = {
    ...review,
    status: 'approved',
    sourcePlan: {path: 'plan/semantic-sfx-plan.candidate.json', sha256: candidateSha256},
    approvedPlan: {path: 'plan/semantic-sfx-plan.json', sha256: approvedPlanSha256},
    reviewedBy: reviewer,
    reviewedAt: approvedAt,
    approvedBy: reviewer,
    approvedAt,
    approvalScope,
    humanReviewPerformed,
    publicReleaseBlocked,
    ...(delegation ? {
      delegatedSimulation: {
        mode: 'creator-delegated-internal-only',
        reason: simulationReason,
        receiptPath: delegation.path,
        receiptSha256: delegation.sha256,
      },
      delegation,
    } : {}),
    counts: {
      total: review.decisions.length,
      approved: review.decisions.filter((item) => item.decision === 'approved').length,
      rejected: review.decisions.filter((item) => item.decision === 'rejected').length,
    },
  };
  await writeAtomic(loaded.paths.review, receipt);
  return buildSemanticSfxReview({projectRoot, projectId});
};

export async function approveSemanticSfxReview({projectRoot, projectId, input, reviewer}) {
  assertNotCreatorDelegatedHumanReview(reviewer);
  const parsed = semanticSfxReviewInputSchema.parse(input);
  await saveSemanticSfxReview({projectRoot, projectId, input: parsed, reviewer});
  return commitSemanticSfxApproval({
    projectRoot,
    projectId,
    parsed,
    reviewer,
    approvalScope: 'human-review',
    humanReviewPerformed: true,
    publicReleaseBlocked: false,
  });
}

export async function simulateSemanticSfxReview({
  projectRoot,
  projectId,
  delegationReceipt,
  reason = 'Creator delegated a sparse internal-only semantic SFX simulation.',
}) {
  const loaded = await loadSourcePlan(projectRoot);
  if (!loaded.current || loaded.current.status !== 'candidate') {
    throw new Error('Only a current candidate semantic SFX plan can be simulated.');
  }
  const simulationReason = String(reason || '').trim();
  if (simulationReason.length < 2 || simulationReason.length > 1000) {
    throw new Error('Semantic SFX simulation reason must contain 2-1000 characters.');
  }
  const [delegation, inventory] = await Promise.all([
    assertCreatorDelegation({
      formalRoot: projectRoot,
      projectId,
      delegationReceipt,
      requiredScopes: ['internal-only-workflow-simulation'],
    }),
    readProjectMediaInventory({projectRoot, projectId}),
  ]);
  const bindingByRole = new Map((loaded.source.bindings ?? []).map((binding) => [binding.role, binding]));
  const decisions = (loaded.source.cues ?? []).map((cue) => {
    const binding = bindingByRole.get(cue.bindingRole);
    const selectionReady = binding?.resolutionStatus === 'resolved'
      && Boolean(inventory.byId.get(binding.assetId)?.selectionReady);
    return {
      cueId: cue.id,
      decision: selectionReady ? 'approved' : 'rejected',
      note: selectionReady
        ? 'Accepted only for creator-delegated internal sparse-mix simulation.'
        : 'Kept silent because no current verified local SFX binding is available.',
    };
  });
  const parsed = semanticSfxReviewInputSchema.parse({
    sourcePlanSha256: loaded.sourceSha256,
    decisions,
    notes: simulationReason,
  });
  await saveSemanticSfxReview({projectRoot, projectId, input: parsed, reviewer: CREATOR_DELEGATED_REVIEWER});
  return commitSemanticSfxApproval({
    projectRoot,
    projectId,
    parsed,
    reviewer: CREATOR_DELEGATED_REVIEWER,
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    delegation: delegation.binding,
    simulationReason,
  });
}

export async function reopenSemanticSfxReview({projectRoot, projectId, input, reviewer}) {
  const parsed = semanticSfxReopenInputSchema.parse(input);
  const loaded = await loadSourcePlan(projectRoot);
  if (loaded.current?.status !== 'approved' || loaded.receipt?.status !== 'approved') {
    throw new Error('Only an approved semantic SFX plan can be reopened.');
  }
  if (parsed.sourcePlanSha256 !== loaded.sourceSha256) {
    throw new Error('Semantic SFX candidate snapshot changed. Reload before reopening.');
  }
  await writeAtomic(loaded.paths.plan, loaded.source);
  const restoredSha256 = await sha256File(loaded.paths.plan);
  if (restoredSha256 !== loaded.sourceSha256) throw new Error('Restored SFX candidate hash mismatch.');
  const reopenedAt = new Date().toISOString();
  await writeAtomic(loaded.paths.review, {
    ...loaded.receipt,
    status: 'in-progress',
    sourcePlan: {path: 'plan/semantic-sfx-plan.json', sha256: restoredSha256},
    approvedPlan: null,
    reopenedBy: reviewer,
    reopenedAt,
    reopenReason: parsed.reason,
    reviewedBy: reviewer,
    reviewedAt: reopenedAt,
  });
  return buildSemanticSfxReview({projectRoot, projectId});
}
