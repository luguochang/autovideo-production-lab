import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PQueue from 'p-queue';
import {
  EVIDENCE_SCHEMA_VERSION,
  RECEIPT_SCHEMA_VERSION,
  commitLifecycleTransition,
  evaluateLifecycleTransition,
  loadLifecycleContext,
  readJson,
  resolveInside,
  sha256File,
  stableJson,
  validateLifecycleLedger,
} from '../../tools/motion-recipe-lifecycle/lifecycle.mjs';
import {listMotionProbes} from './motion-probe-review.mjs';

const writeQueue = new PQueue({concurrency: 1});
const lifecyclePaths = {
  libraryPath: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledgerPath: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  catalogPaths: {
    officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
    officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
    officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
  },
};

const normalizeRelative = (value) => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isNonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const allPassed = (receipt) => Array.isArray(receipt?.gateResults)
  && receipt.gateResults.length > 0
  && receipt.gateResults.every((gate) => gate?.passed === true);

const workspaceRelative = (workspaceRoot, absolutePath) => {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(absolutePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Lifecycle action path must stay inside the AutoVideo workspace.');
  }
  return normalizeRelative(relative);
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

const actionTimestamp = (now) => now.replace(/[^0-9]/g, '').slice(0, 14);

const loadContext = async (workspaceRoot) => {
  const context = await loadLifecycleContext({workspaceRoot, ...lifecyclePaths});
  const issues = await validateLifecycleLedger({workspaceRoot, ...context});
  if (issues.length) {
    throw new Error(`Motion lifecycle ledger is invalid: ${issues.map((item) => item.code).join(', ')}.`);
  }
  return context;
};

const currentPassedReview = (probe) => {
  if (!probe?.canonicalEvidence) throw new Error('Only canonical lifecycle evidence can be accepted into the motion recipe ledger.');
  if (probe.reviewStale) throw new Error('The human probe review is stale. Review the current render again before lifecycle acceptance.');
  if (probe.review?.decision !== 'passed') {
    throw new Error('A current human visual review with decision "passed" is required before lifecycle acceptance.');
  }
  if (!isNonBlank(probe.review.reviewer) || !isNonBlank(probe.review.reviewedAt)) {
    throw new Error('The current human probe review is missing reviewer provenance.');
  }
  return probe.review;
};

const sameChecks = (left, right) => JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});

const assertEvidenceMatchesCurrentReview = ({evidence, probe, review}) => {
  const visualReview = evidence?.probe?.visualReview;
  if (evidence?.schemaVersion !== EVIDENCE_SCHEMA_VERSION
      || evidence.recipeId !== probe.recipeId
      || evidence.recipeVersion !== probe.recipeVersion
      || evidence.requestedState !== 'probe-passed') {
    throw new Error('The probe lifecycle evidence does not match the selected recipe and transition.');
  }
  if (visualReview?.status !== 'passed'
      || visualReview.reviewer !== review.reviewer
      || visualReview.reviewedAt !== review.reviewedAt
      || !sameChecks(visualReview.checks, review.checks)) {
    throw new Error('The canonical lifecycle evidence no longer matches the current human passed review. Save and review the probe again.');
  }
};

const receiptIsPassedProbe = ({receipt, recipeId, recipeVersion, definitionSha256}) => (
  receipt?.schemaVersion === RECEIPT_SCHEMA_VERSION
  && receipt.action === 'transition'
  && receipt.outcome === 'applied'
  && receipt.fromState === 'candidate'
  && receipt.requestedState === 'probe-passed'
  && receipt.effectiveState === 'probe-passed'
  && receipt.recipe?.id === recipeId
  && receipt.recipe?.version === recipeVersion
  && receipt.recipe?.definitionSha256 === definitionSha256
  && allPassed(receipt)
  && Array.isArray(receipt.blockedReasons)
  && receipt.blockedReasons.length === 0
);

const verifiedProbeReceiptRef = async ({workspaceRoot, entry, recipeId, probeReceiptPath = null}) => {
  const candidates = (entry.receiptRefs ?? []).filter((ref) => !probeReceiptPath || normalizeRelative(ref.path) === normalizeRelative(probeReceiptPath));
  for (const ref of [...candidates].reverse()) {
    if (!isSha256(ref?.sha256) || !isNonBlank(ref?.path)) continue;
    const target = resolveInside(workspaceRoot, ref.path);
    let actual;
    try {
      actual = await sha256File(target);
    } catch {
      continue;
    }
    if (actual !== ref.sha256) continue;
    let receipt;
    try {
      receipt = await readJson(target);
    } catch {
      continue;
    }
    if (receiptIsPassedProbe({
      receipt,
      recipeId,
      recipeVersion: entry.recipeVersion,
      definitionSha256: entry.definitionSha256,
    })) {
      return {path: normalizeRelative(ref.path), sha256: ref.sha256};
    }
  }
  if (probeReceiptPath) {
    throw new Error('The selected probe receipt is not a current passed receipt recorded in the lifecycle ledger.');
  }
  throw new Error('A current passed motion probe receipt is required before formal project approval.');
};

const commitReceiptAndLedger = async ({workspaceRoot, context, evaluation, receiptPath}) => {
  if (!evaluation.allowed) {
    throw new Error(`Lifecycle transition is blocked: ${evaluation.receipt.blockedReasons.join(', ')}.`);
  }
  const normalizedReceiptPath = normalizeRelative(receiptPath);
  const receiptTarget = resolveInside(workspaceRoot, normalizedReceiptPath);
  await writeAtomic(receiptTarget, evaluation.receipt);
  const receiptRef = {path: normalizedReceiptPath, sha256: await sha256File(receiptTarget)};
  const nextLedger = commitLifecycleTransition({ledger: context.ledger, evaluation, receiptRef});
  const ledgerTarget = resolveInside(workspaceRoot, lifecyclePaths.ledgerPath);
  try {
    await writeAtomic(ledgerTarget, nextLedger);
  } catch (error) {
    await fs.rm(receiptTarget, {force: true}).catch(() => undefined);
    throw error;
  }
  return {receipt: evaluation.receipt, receiptRef, ledger: nextLedger};
};

export const acceptMotionProbeLifecycle = async ({
  workspaceRoot,
  probeId,
  actor,
  now = new Date().toISOString(),
}) => writeQueue.add(async () => {
  if (!isNonBlank(probeId) || !isNonBlank(actor)) throw new Error('Probe lifecycle acceptance requires a probe ID and actor.');
  const probes = await listMotionProbes({workspaceRoot});
  const probe = probes.find((item) => item.id === probeId);
  if (!probe) throw new Error(`Unknown motion probe: ${probeId}`);
  const review = currentPassedReview(probe);
  const context = await loadContext(workspaceRoot);
  const entry = context.ledger.entries.find((item) => item.recipeId === probe.recipeId);
  if (!entry || entry.recipeVersion !== probe.recipeVersion) throw new Error('The selected probe recipe no longer matches the current lifecycle ledger.');
  if (entry.state !== 'candidate') {
    throw new Error(`The selected probe recipe is already in lifecycle state ${entry.state}; a probe cannot be accepted twice.`);
  }
  const evidence = await readJson(resolveInside(workspaceRoot, probe.evidencePath));
  assertEvidenceMatchesCurrentReview({evidence, probe, review});
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot,
    ...context,
    recipeId: probe.recipeId,
    targetState: 'probe-passed',
    evidence,
    actor: actor.trim(),
    now,
  });
  const receiptPath = `${probe.directory}/lifecycle-receipts/${probe.recipeId}-probe-passed-${actionTimestamp(now)}.json`;
  const committed = await commitReceiptAndLedger({workspaceRoot, context, evaluation, receiptPath});
  return {
    probeId: probe.id,
    recipeId: probe.recipeId,
    reviewer: review.reviewer,
    ...committed,
  };
});

export const approveMotionRecipeForProject = async ({
  workspaceRoot,
  projectId,
  projectRoot,
  recipeId,
  reviewer,
  actor,
  probeReceiptPath = null,
  now = new Date().toISOString(),
}) => writeQueue.add(async () => {
  if (!isNonBlank(projectId) || !isNonBlank(recipeId) || !isNonBlank(reviewer) || !isNonBlank(actor)) {
    throw new Error('Formal project approval requires project ID, recipe ID, reviewer, and actor.');
  }
  const resolvedProjectRoot = path.resolve(projectRoot);
  const projectRootRelative = workspaceRelative(workspaceRoot, resolvedProjectRoot);
  const context = await loadContext(workspaceRoot);
  const entry = context.ledger.entries.find((item) => item.recipeId === recipeId);
  if (!entry) throw new Error(`Unknown lifecycle recipe: ${recipeId}`);
  if (!['probe-passed', 'approved-project'].includes(entry.state)) {
    throw new Error(`Recipe ${recipeId} must be probe-passed before project approval; current state is ${entry.state}.`);
  }
  if ((entry.projectApprovals ?? []).some((approval) => approval.projectId === projectId)) {
    throw new Error(`Recipe ${recipeId} is already approved for formal project ${projectId}.`);
  }
  const styleSelectionPath = `${projectRootRelative}/style-selection.json`;
  const styleSelectionTarget = resolveInside(workspaceRoot, styleSelectionPath);
  const styleSelection = {path: styleSelectionPath, sha256: await sha256File(styleSelectionTarget)};
  const probeReceipt = await verifiedProbeReceiptRef({workspaceRoot, entry, recipeId, probeReceiptPath});
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    recipeId,
    recipeVersion: entry.recipeVersion,
    requestedState: 'approved-project',
    projectApproval: {
      projectId,
      styleSelection,
      probeReceipt,
      humanApproval: {
        source: 'human',
        decision: 'approved',
        scope: 'project',
        reviewer: reviewer.trim(),
        approvedAt: now,
      },
    },
  };
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot,
    ...context,
    recipeId,
    targetState: 'approved-project',
    evidence,
    actor: actor.trim(),
    now,
  });
  const receiptPath = `${projectRootRelative}/review/motion-lifecycle/${recipeId}-approved-project-${actionTimestamp(now)}.json`;
  const committed = await commitReceiptAndLedger({workspaceRoot, context, evaluation, receiptPath});
  return {projectId, recipeId, reviewer: reviewer.trim(), ...committed};
});

