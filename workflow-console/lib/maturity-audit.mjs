import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {validatePublicationRightsRecord} from './rights-clearance.mjs';
import {listMotionProbes} from './motion-probe-review.mjs';
import {
  loadLifecycleContext,
  validateLifecycleLedger,
} from '../../tools/motion-recipe-lifecycle/lifecycle.mjs';
import {buildMotionLifecycleReadiness} from '../../tools/motion-recipe-lifecycle/readiness.mjs';

export const MATURITY_SCHEMA_VERSION = 'autovideo-maturity-audit/v1';
export const DEFAULT_MATURITY_THRESHOLDS = Object.freeze({
  publicReleaseCandidates: 1,
  routeGoldProjectsPerRoute: 1,
  motionRecipesWithHumanLifecycle: 8,
  recoverableRealProjects: 20,
  humanReviewedContentGoldCases: 20,
});

const routes = ['script', 'materials', 'audio'];
const durationClasses = ['30s', '60s', '90s'];
const carrierClasses = ['process', 'data', 'ui', 'code', 'opinion'];
const sha256Pattern = /^[a-f0-9]{64}$/iu;
const machineIdentityPattern = /(agent|automation|autonomous|bot|ci|codex|fixture|internal|machine|model|openai|simulation|synthetic|system|test)/iu;
const placeholderIdentityPattern = /^(anonymous|creator|human|n\/?a|reviewer|unknown|user)$/iu;
const scalePaths = Object.freeze({
  real: 'receipts/scale/real-project.json',
  gold: 'receipts/scale/gold-project.json',
  recovery: 'receipts/scale/recovery.json',
  publicCandidate: 'receipts/scale/public-release-candidate.json',
});
const motionDefaults = Object.freeze({
  library: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledger: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
  officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
  officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
});

const sha256Buffer = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const sha256File = async (target) => sha256Buffer(await fs.readFile(target));
const relativePath = (root, target) => path.relative(root, target).replaceAll('\\', '/');
const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finiteNonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
const readJson = async (target) => JSON.parse(await fs.readFile(target, 'utf8'));
const readOptionalJson = async (target) => {
  try { return await readJson(target); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};
const pathExists = (target) => fs.access(target).then(() => true, () => false);

const resolveInside = (root, relative) => {
  if (!relative || path.isAbsolute(relative)) throw new Error('Evidence paths must be relative.');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Evidence path leaves its root: ${relative}`);
  }
  return target;
};

export const isGenuineHumanIdentity = (value) => {
  const reviewer = String(value ?? '').trim();
  return reviewer.length >= 2
    && !machineIdentityPattern.test(reviewer)
    && !placeholderIdentityPattern.test(reviewer);
};

const isNonMachineReviewer = (value) => {
  const reviewer = String(value ?? '').trim();
  return reviewer.length > 0 && !machineIdentityPattern.test(reviewer);
};

const validHumanAttestation = (value) => Boolean(
  value?.confirmedHuman === true
  && value?.reviewerType === 'human'
  && isGenuineHumanIdentity(value?.reviewer)
  && isIsoDate(value?.reviewedAt),
);

const verifyBinding = async ({root, binding, label, expectedPath = null}) => {
  const issues = [];
  if (!isObject(binding) || !binding.path || !sha256Pattern.test(String(binding.sha256 ?? ''))) {
    return {valid: false, issues: [`${label} binding is missing a relative path or SHA-256.`], path: null, sha256: null};
  }
  if (expectedPath && binding.path.replaceAll('\\', '/') !== expectedPath) {
    issues.push(`${label} must bind ${expectedPath}.`);
  }
  let target = null;
  try {
    target = resolveInside(root, binding.path);
    const actual = await sha256File(target);
    if (actual !== String(binding.sha256).toLowerCase()) issues.push(`${label} SHA-256 is stale.`);
  } catch (error) {
    issues.push(`${label} is unavailable: ${error.message}`);
  }
  return {
    valid: issues.length === 0,
    issues,
    path: target,
    relativePath: binding.path.replaceAll('\\', '/'),
    sha256: String(binding.sha256).toLowerCase(),
  };
};

const readBoundJson = async (options) => {
  const verified = await verifyBinding(options);
  if (!verified.valid) return {...verified, document: null};
  try { return {...verified, document: await readJson(verified.path)}; }
  catch (error) { return {...verified, valid: false, issues: [...verified.issues, `${options.label} is not valid JSON: ${error.message}`], document: null}; }
};

const receiptState = (valid, receipt, issues) => ({
  present: Boolean(receipt),
  valid: Boolean(valid),
  issues,
});

const loadReceipt = async (formalRoot, relative) => {
  const target = resolveInside(formalRoot, relative);
  return {target, receipt: await readOptionalJson(target)};
};

const validateRealProjectReceipt = async ({project, formalRoot, receipt}) => {
  const issues = [];
  if (!receipt) return receiptState(false, receipt, ['Real-project attestation is missing.']);
  if (receipt.schemaVersion !== 'autovideo-real-project-attestation/v1') issues.push('Real-project attestation schema is unsupported.');
  if (receipt.projectId !== project?.id) issues.push('Real-project attestation projectId does not match the workbench project.');
  if (receipt.status !== 'confirmed-real-production') issues.push('Real-project attestation status is not confirmed-real-production.');
  if (!routes.includes(receipt.route) || receipt.route !== project?.route) issues.push('Real-project route does not match the workbench route.');
  if (!validHumanAttestation(receipt.attestation)) issues.push('Real-project attestation requires a named genuine human reviewer.');
  if (!durationClasses.includes(receipt.profile?.durationClass)) issues.push('Real-project profile must use 30s, 60s, or 90s.');
  if (!Array.isArray(receipt.profile?.carriers) || !receipt.profile.carriers.length
    || receipt.profile.carriers.some((item) => !carrierClasses.includes(item))) {
    issues.push('Real-project profile must declare at least one supported content carrier.');
  }
  const [input, projectState] = await Promise.all([
    verifyBinding({root: formalRoot, binding: receipt.bindings?.input, label: 'Real-project input'}),
    verifyBinding({root: formalRoot, binding: receipt.bindings?.projectState, label: 'Real-project state', expectedPath: 'project-state.json'}),
  ]);
  issues.push(...input.issues, ...projectState.issues);
  return receiptState(issues.length === 0, receipt, issues);
};

const validateGoldReceipt = async ({project, formalRoot, receipt, realReceiptSha256}) => {
  const issues = [];
  if (!receipt) return receiptState(false, receipt, ['Route-gold approval is missing.']);
  if (receipt.schemaVersion !== 'autovideo-route-gold-approval/v1') issues.push('Route-gold approval schema is unsupported.');
  if (receipt.projectId !== project?.id || receipt.route !== project?.route) issues.push('Route-gold approval identity or route does not match.');
  if (receipt.status !== 'human-approved') issues.push('Route-gold approval status is not human-approved.');
  if (!validHumanAttestation(receipt.review)) issues.push('Route-gold approval requires a named genuine human reviewer.');
  for (const key of ['inputAuthentic', 'outputQualityApproved', 'routeWorkflowValidated']) {
    if (receipt.criteria?.[key] !== true) issues.push(`Route-gold criterion ${key} is not approved.`);
  }
  const [realBinding, qualityBinding] = await Promise.all([
    verifyBinding({root: formalRoot, binding: receipt.bindings?.realProject, label: 'Route-gold real-project receipt', expectedPath: scalePaths.real}),
    verifyBinding({root: formalRoot, binding: receipt.bindings?.qualityReview, label: 'Route-gold quality review'}),
  ]);
  issues.push(...realBinding.issues, ...qualityBinding.issues);
  if (realBinding.sha256 && realReceiptSha256 && realBinding.sha256 !== realReceiptSha256) {
    issues.push('Route-gold approval does not bind the current real-project attestation.');
  }
  if ([scalePaths.gold, scalePaths.real].includes(qualityBinding.relativePath)) {
    issues.push('Route-gold quality review must be an independent bound receipt.');
  }
  return receiptState(issues.length === 0, receipt, issues);
};

const metricKeys = [
  'elapsedSeconds', 'humanMinutes', 'cpuSeconds', 'gpuSeconds', 'modelCalls',
  'retryCount', 'overrideCount', 'assetReuseCount', 'assetCandidateCount',
  'recipeReuseCount', 'recipeOpportunityCount', 'reworkCount',
];

const validateRecoveryReceipt = async ({project, formalRoot, receipt, realReceiptSha256}) => {
  const issues = [];
  let standardRun = null;
  if (!receipt) return {...receiptState(false, receipt, ['Recovery attestation is missing.']), standardRun, metrics: null};
  if (receipt.schemaVersion !== 'autovideo-recovery-attestation/v1') issues.push('Recovery attestation schema is unsupported.');
  if (receipt.projectId !== project?.id) issues.push('Recovery attestation projectId does not match.');
  if (receipt.status !== 'verified-to-human-gate') issues.push('Recovery status is not verified-to-human-gate.');
  if (!validHumanAttestation(receipt.attestation)) issues.push('Recovery attestation requires a named genuine human reviewer.');
  const [realBinding, runBinding] = await Promise.all([
    verifyBinding({root: formalRoot, binding: receipt.bindings?.realProject, label: 'Recovery real-project receipt', expectedPath: scalePaths.real}),
    readBoundJson({root: formalRoot, binding: receipt.bindings?.standardRun, label: 'Recovery standard run', expectedPath: 'STANDARD_RUN_RECEIPT.json'}),
  ]);
  issues.push(...realBinding.issues, ...runBinding.issues);
  if (realBinding.sha256 && realReceiptSha256 && realBinding.sha256 !== realReceiptSha256) issues.push('Recovery does not bind the current real-project attestation.');
  standardRun = runBinding.document;
  if (standardRun) {
    if (standardRun.projectId !== project.id) issues.push('Recovery standard-run projectId does not match.');
    if (!['waiting-for-human', 'complete'].includes(standardRun.status)) issues.push('Recovery standard run did not reach a human gate or completion.');
    if (!standardRun.resumesRunId || standardRun.resumesRunId === standardRun.runId) issues.push('Recovery standard run does not prove a distinct resumed run.');
    if (receipt.resumedFromRunId !== standardRun.resumesRunId) issues.push('Recovery resumedFromRunId does not match the standard-run receipt.');
    if (standardRun.status === 'waiting-for-human' && receipt.reached?.stageId !== standardRun.currentStageId) issues.push('Recovery reached stage does not match the standard-run human gate.');
    if (standardRun.status === 'complete' && receipt.reached?.stageId != null) issues.push('A completed recovery must record reached.stageId as null.');
    if (standardRun.policy?.autoApproveHumanGates !== false
      || standardRun.policy?.publicReleaseApprovalSynthesized !== false
      || standardRun.policy?.microphoneUsed !== false
      || standardRun.policy?.mediaPlaybackInvoked !== false) {
      issues.push('Recovery standard-run policy does not preserve human and silent-audio gates.');
    }
  }
  for (const key of metricKeys) {
    if (!finiteNonNegative(receipt.metrics?.[key])) issues.push(`Recovery metric ${key} is missing or invalid.`);
  }
  if (finiteNonNegative(receipt.metrics?.assetReuseCount) && finiteNonNegative(receipt.metrics?.assetCandidateCount)
    && Number(receipt.metrics.assetReuseCount) > Number(receipt.metrics.assetCandidateCount)) {
    issues.push('assetReuseCount cannot exceed assetCandidateCount.');
  }
  if (finiteNonNegative(receipt.metrics?.recipeReuseCount) && finiteNonNegative(receipt.metrics?.recipeOpportunityCount)
    && Number(receipt.metrics.recipeReuseCount) > Number(receipt.metrics.recipeOpportunityCount)) {
    issues.push('recipeReuseCount cannot exceed recipeOpportunityCount.');
  }
  return {...receiptState(issues.length === 0, receipt, issues), standardRun, metrics: receipt.metrics ?? null};
};

const validateHumanApproval = ({document, kind, projectId}) => {
  const issues = [];
  if (!document || document.projectId !== projectId) return {valid: false, issues: [`${kind} approval is missing or belongs to another project.`]};
  if (!isNonMachineReviewer(document.approvedBy)) issues.push(`${kind} approval reviewer is machine-like or missing.`);
  if (kind === 'audio') {
    if (document.schemaVersion !== 'autovideo-audio-approval/v4'
      || document.approvalScope !== 'human-listening'
      || document.humanListening?.status !== 'approved'
      || document.delegatedSimulation) issues.push('Audio approval is not a genuine human-listening approval.');
  } else if (kind === 'subtitle') {
    if (document.schemaVersion !== 'autovideo-subtitle-human-approval/v1' || document.approvalScope !== 'human-review') issues.push('Subtitle approval is not a human approval.');
  } else if (kind === 'screenText') {
    if (document.schemaVersion !== 'autovideo-screen-text-human-approval/v1' || document.approvalScope !== 'human-review') issues.push('Screen-text approval is not a human approval.');
  } else if (kind === 'finalPreview') {
    if (document.status !== 'approved' || document.approvalScope !== 'human-review'
      || document.publicReleaseBlocked !== false || !document.humanReview?.path || !sha256Pattern.test(String(document.humanReview?.sha256 ?? ''))) {
      issues.push('Final-preview approval is not a current unblocked human approval.');
    }
  }
  return {valid: issues.length === 0, issues};
};

const validatePublicCandidateReceipt = async ({workspaceRoot, project, formalRoot, receipt, realReceiptSha256}) => {
  const issues = [];
  if (!receipt) return receiptState(false, receipt, ['Public-release candidate receipt is missing.']);
  if (receipt.schemaVersion !== 'autovideo-public-release-candidate/v1') issues.push('Public-release candidate schema is unsupported.');
  if (receipt.projectId !== project?.id) issues.push('Public-release candidate projectId does not match.');
  if (receipt.status !== 'ready-for-publication') issues.push('Public-release candidate is not ready-for-publication.');
  if (!validHumanAttestation(receipt.attestation)) issues.push('Public-release candidate requires a named genuine human attestation.');
  if (project?.publicationRights !== 'cleared') issues.push('Workbench publicationRights is not cleared.');
  const bindingJobs = [
    ['realProject', 'Public candidate real-project receipt', scalePaths.real, true],
    ['master', 'Public candidate master', null, false],
    ['deliveryQa', 'Public candidate delivery QA', null, true],
    ['rights', 'Public candidate rights', 'rights-clearance/publication-rights.json', true],
    ['audio', 'Public candidate audio approval', 'audio/approval.json', true],
    ['subtitle', 'Public candidate subtitle approval', 'qa/subtitle-human-approval.json', true],
    ['screenText', 'Public candidate screen-text approval', 'qa/screen-text-human-approval.json', true],
    ['finalPreview', 'Public candidate final-preview approval', 'qa/final-preview.json', true],
  ];
  const verified = {};
  await Promise.all(bindingJobs.map(async ([key, label, expectedPath, json]) => {
    const binding = key === 'realProject' || key === 'master' || key === 'deliveryQa' || key === 'rights'
      ? receipt.bindings?.[key]
      : receipt.bindings?.approvals?.[key];
    verified[key] = json
      ? await readBoundJson({root: formalRoot, binding, label, expectedPath})
      : await verifyBinding({root: formalRoot, binding, label, expectedPath});
  }));
  for (const item of Object.values(verified)) issues.push(...item.issues);
  if (verified.realProject?.sha256 && realReceiptSha256 && verified.realProject.sha256 !== realReceiptSha256) issues.push('Public candidate does not bind the current real-project attestation.');
  const masterSha256 = verified.master?.sha256 ?? null;
  const delivery = verified.deliveryQa?.document;
  if (delivery && (delivery.schemaVersion !== 'autovideo-delivery-qa/v2'
    || delivery.outputSha256 !== masterSha256
    || delivery.releaseScope !== 'public-release'
    || delivery.okForPublicRelease !== true
    || delivery.publicReleaseBlocked !== false)) {
    issues.push('Public candidate delivery QA is not an unblocked public-release result bound to the master.');
  }
  const rights = verified.rights?.document;
  if (rights) {
    const result = await validatePublicationRightsRecord({
      formalRoot, workspaceRoot, projectId: project.id, declaration: 'cleared', record: rights,
    });
    if (!result.valid || !result.publicEligible || rights.schemaVersion !== 'autovideo-publication-rights/v2') {
      issues.push(...(result.issues.length ? result.issues : ['Publication rights are not publicly eligible.']));
    }
    const inventory = new Set((rights.inventoryBindings ?? []).map((item) => item.path));
    for (const required of ['AssetManifest.json', 'audio/narration.final.wav', 'audio/voice.recipe.json']) {
      if (!inventory.has(required)) issues.push(`Publication rights inventory does not bind ${required}.`);
    }
  }
  for (const kind of ['audio', 'subtitle', 'screenText', 'finalPreview']) {
    const result = validateHumanApproval({document: verified[kind]?.document, kind, projectId: project.id});
    issues.push(...result.issues);
  }
  const finalPreview = verified.finalPreview?.document;
  if (finalPreview?.humanReview) {
    const humanReview = await verifyBinding({root: formalRoot, binding: finalPreview.humanReview, label: 'Final-preview human review'});
    issues.push(...humanReview.issues);
  }
  return {...receiptState(issues.length === 0, receipt, issues), masterSha256};
};

const inspectProject = async ({workspaceRoot, project, formalRoot}) => {
  const receipts = {};
  for (const [key, value] of Object.entries(scalePaths)) receipts[key] = await loadReceipt(formalRoot, value);
  const real = await validateRealProjectReceipt({project, formalRoot, receipt: receipts.real.receipt});
  const realSha256 = receipts.real.receipt ? await sha256File(receipts.real.target) : null;
  const [gold, recovery, publicCandidate] = await Promise.all([
    validateGoldReceipt({project, formalRoot, receipt: receipts.gold.receipt, realReceiptSha256: realSha256}),
    validateRecoveryReceipt({project, formalRoot, receipt: receipts.recovery.receipt, realReceiptSha256: realSha256}),
    validatePublicCandidateReceipt({workspaceRoot, project, formalRoot, receipt: receipts.publicCandidate.receipt, realReceiptSha256: realSha256}),
  ]);
  let rights = {present: false, valid: false, publicEligible: false, issues: ['Rights receipt is not evaluated until a real project is attested.']};
  if (real.valid) {
    const rightsPath = path.join(formalRoot, 'rights-clearance', 'publication-rights.json');
    const record = await readOptionalJson(rightsPath);
    if (!record) rights = {present: false, valid: false, publicEligible: false, issues: ['Publication-rights v2 receipt is missing.']};
    else {
      const result = await validatePublicationRightsRecord({
        formalRoot, workspaceRoot, projectId: project.id, declaration: project.publicationRights, record,
      });
      rights = {present: true, ...result, valid: result.valid && record.schemaVersion === 'autovideo-publication-rights/v2'};
      if (record.schemaVersion !== 'autovideo-publication-rights/v2') rights.issues = [...rights.issues, 'Real projects require publication-rights v2.'];
    }
  }
  return {
    projectId: project.id,
    route: project.route,
    formalProjectPath: relativePath(workspaceRoot, formalRoot),
    publicationRights: project.publicationRights,
    profile: real.receipt?.profile ?? null,
    real,
    gold,
    recovery,
    publicCandidate,
    rights,
  };
};

const loadProjects = async (workspaceRoot, workbenchDataRoot = null) => {
  const dbPath = path.join(workbenchDataRoot ? path.resolve(workbenchDataRoot) : path.join(workspaceRoot, 'workflow-console', 'data'), 'db.json');
  const db = await readOptionalJson(dbPath) ?? {projects: {}};
  const projects = Object.values(db.projects ?? {});
  return {
    dbPath,
    projects: projects.filter((item) => item?.id && routes.includes(item.route)).map((project) => ({
      project,
      formalRoot: path.resolve(workspaceRoot, project.formalProjectPath || `hyperframes-workflow-kit/projects/${project.id}`),
    })),
  };
};

const loadContentGold = async (workspaceRoot) => {
  const goldRoot = path.join(workspaceRoot, 'tools', 'content-pipeline', 'gold');
  const corpusPath = path.join(goldRoot, 'corpus.json');
  const corpus = await readOptionalJson(corpusPath);
  if (!corpus) return {present: false, valid: true, acceptedCases: 0, issues: [], cases: []};
  const issues = [];
  const cases = [];
  for (const entry of corpus.cases ?? []) {
    const caseIssues = [];
    const bindings = await Promise.all([
      verifyBinding({root: goldRoot, binding: {path: entry.casePath, sha256: entry.caseSha256}, label: `Content gold ${entry.caseId} case`}),
      verifyBinding({root: goldRoot, binding: {path: entry.candidatePath, sha256: entry.candidateSha256}, label: `Content gold ${entry.caseId} candidate`}),
      readBoundJson({root: goldRoot, binding: {path: entry.humanEvaluationPath, sha256: entry.humanEvaluationSha256}, label: `Content gold ${entry.caseId} evaluation`}),
    ]);
    bindings.forEach((item) => caseIssues.push(...item.issues));
    const evaluation = bindings[2].document;
    if (!evaluation || evaluation.schemaVersion !== 'autovideo-content-human-evaluation/v1'
      || evaluation.reviewerType !== 'human' || !isGenuineHumanIdentity(evaluation.reviewer)
      || evaluation.decision !== 'accepted' || evaluation.authorizesNarrationLock !== false) {
      caseIssues.push(`Content gold ${entry.caseId} lacks a valid independent human evaluation.`);
    }
    cases.push({caseId: entry.caseId, valid: caseIssues.length === 0, issues: caseIssues});
    issues.push(...caseIssues);
  }
  return {
    present: true,
    valid: issues.length === 0,
    acceptedCases: cases.filter((item) => item.valid).length,
    declaredAcceptedCases: Number(corpus.humanReviewedGoldCases || 0),
    issues,
    cases,
  };
};

const loadStateSeparation = async (workspaceRoot) => {
  const contractPath = path.join(workspaceRoot, 'workflow-console', 'contracts', 'maturity-state-separation.json');
  const contract = await readOptionalJson(contractPath);
  const issues = [];
  if (!contract || contract.schemaVersion !== 'autovideo-workbench-state-separation/v1') {
    return {present: Boolean(contract), valid: false, issues: ['Workbench state-separation contract is missing or unsupported.'], checks: []};
  }
  for (const state of ['generated', 'override', 'effective']) if (!contract.states?.production?.includes(state)) issues.push(`Production state ${state} is not declared.`);
  for (const state of ['internal-review-package', 'public-master-candidate', 'published']) if (!contract.states?.release?.includes(state)) issues.push(`Release state ${state} is not declared.`);
  const checks = [];
  for (const check of contract.sourceChecks ?? []) {
    const checkIssues = [];
    let source = '';
    try { source = await fs.readFile(resolveInside(workspaceRoot, check.path), 'utf8'); }
    catch (error) { checkIssues.push(`State-separation source is unavailable: ${check.path} (${error.message})`); }
    for (const token of check.requiredTokens ?? []) if (!source.includes(token)) checkIssues.push(`${check.path} is missing contract token: ${token}`);
    checks.push({path: check.path, valid: checkIssues.length === 0, issues: checkIssues});
    issues.push(...checkIssues);
  }
  if (!checks.length) issues.push('State-separation contract has no source checks.');
  return {present: true, valid: issues.length === 0, issues, checks};
};

const loadMotionEvidence = async (workspaceRoot, realProjectIds) => {
  try {
    const loaded = await loadLifecycleContext({
      workspaceRoot,
      libraryPath: motionDefaults.library,
      ledgerPath: motionDefaults.ledger,
      catalogPaths: {
        officialRegistry: motionDefaults.officialRegistry,
        officialBlueprints: motionDefaults.officialBlueprints,
        officialMotionRules: motionDefaults.officialMotionRules,
      },
    });
    const validationIssues = await validateLifecycleLedger({workspaceRoot, ...loaded});
    const probes = await listMotionProbes({workspaceRoot});
    const readiness = await buildMotionLifecycleReadiness({workspaceRoot, library: loaded.library, ledger: loaded.ledger, probes, validationIssues});
    const probeById = new Map(probes.map((item) => [item.id, item]));
    const recipes = readiness.recipes.map((recipe) => {
      const humanReviews = recipe.currentHumanPassedProbeIds.map((id) => probeById.get(id)?.review).filter(Boolean);
      const validHumanReviews = humanReviews.filter((review) => review.decision === 'passed' && isGenuineHumanIdentity(review.reviewer));
      const validProjectApprovals = recipe.projectApprovals.filter((approval) => realProjectIds.has(approval.projectId) && isGenuineHumanIdentity(approval.approvedBy));
      const humanLifecycleValid = recipe.contractValid
        && ['approved-project', 'promoted-template'].includes(recipe.state)
        && validHumanReviews.length > 0
        && validProjectApprovals.length > 0;
      return {
        recipeId: recipe.recipeId,
        state: recipe.state,
        contractValid: recipe.contractValid,
        technicalProbeCount: recipe.technicalProbeIds.length,
        currentHumanReviewCount: validHumanReviews.length,
        realProjectApprovalCount: validProjectApprovals.length,
        templatePromoted: recipe.state === 'promoted-template',
        humanLifecycleValid,
        nextAction: recipe.nextAction,
      };
    });
    return {
      valid: readiness.contract.valid,
      issues: readiness.contract.issues,
      recipeCount: recipes.length,
      humanLifecycleCount: recipes.filter((item) => item.humanLifecycleValid).length,
      templatePromotedCount: recipes.filter((item) => item.templatePromoted).length,
      recipes,
    };
  } catch (error) {
    return {valid: false, issues: [error.message], recipeCount: 0, humanLifecycleCount: 0, templatePromotedCount: 0, recipes: []};
  }
};

const percentile = (values, quantile) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
};

const aggregateScaleMetrics = (projects) => {
  const metrics = projects.filter((item) => item.recovery.valid).map((item) => item.recovery.metrics);
  const sum = (key) => metrics.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  const elapsed = metrics.map((item) => Number(item.elapsedSeconds));
  const ratio = (numerator, denominator) => denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
  return {
    measuredProjectCount: metrics.length,
    elapsedSecondsP50: percentile(elapsed, 0.5),
    elapsedSecondsP95: percentile(elapsed, 0.95),
    totalHumanMinutes: sum('humanMinutes'),
    totalCpuSeconds: sum('cpuSeconds'),
    totalGpuSeconds: sum('gpuSeconds'),
    totalModelCalls: sum('modelCalls'),
    retryRate: ratio(sum('retryCount'), metrics.length),
    overrideRate: ratio(sum('overrideCount'), metrics.length),
    assetReuseRate: ratio(sum('assetReuseCount'), sum('assetCandidateCount')),
    recipeReuseRate: ratio(sum('recipeReuseCount'), sum('recipeOpportunityCount')),
    reworkRate: ratio(sum('reworkCount'), metrics.length),
  };
};

const gate = (id, passed, actual, required, blockers, evidence = null) => ({
  id,
  status: passed ? 'passed' : 'blocked',
  passed,
  actual,
  required,
  blockers: passed ? [] : blockers,
  evidence,
});

export const evaluateMaturityGates = ({projects, motion, contentGold, stateSeparation, thresholds = DEFAULT_MATURITY_THRESHOLDS}) => {
  const realProjects = projects.filter((item) => item.real.valid);
  const publicCandidates = realProjects.filter((item) => item.publicCandidate.valid);
  const recoverable = realProjects.filter((item) => item.recovery.valid);
  const routeGoldCounts = Object.fromEntries(routes.map((route) => [route, realProjects.filter((item) => item.route === route && item.gold.valid).length]));
  const rightsCurrent = realProjects.filter((item) => item.rights.valid).length;
  const durationCoverage = new Set(recoverable.map((item) => item.profile?.durationClass));
  const carrierCoverage = new Set(recoverable.flatMap((item) => item.profile?.carriers ?? []));
  const scaleMetrics = aggregateScaleMetrics(projects);
  const gates = [
    gate(
      'public-release-candidate',
      publicCandidates.length >= thresholds.publicReleaseCandidates,
      publicCandidates.length,
      thresholds.publicReleaseCandidates,
      ['No hash-current public master has cleared rights and genuine human audio, subtitle, screen-text, and final-preview approvals.'],
      publicCandidates.map((item) => item.projectId),
    ),
    gate(
      'three-route-real-gold',
      routes.every((route) => routeGoldCounts[route] >= thresholds.routeGoldProjectsPerRoute),
      routeGoldCounts,
      Object.fromEntries(routes.map((route) => [route, thresholds.routeGoldProjectsPerRoute])),
      routes.filter((route) => routeGoldCounts[route] < thresholds.routeGoldProjectsPerRoute).map((route) => `Route ${route} has no genuine human-approved real gold project.`),
    ),
    gate(
      'content-regression-human-gold',
      contentGold.valid && contentGold.acceptedCases >= thresholds.humanReviewedContentGoldCases,
      contentGold.acceptedCases,
      thresholds.humanReviewedContentGoldCases,
      contentGold.valid ? [`Only ${contentGold.acceptedCases} genuine human-reviewed content gold cases are current.`] : contentGold.issues,
    ),
    gate(
      'motion-human-lifecycle',
      motion.valid && motion.humanLifecycleCount >= thresholds.motionRecipesWithHumanLifecycle,
      {contractValid: motion.valid, recipes: motion.recipeCount, humanLifecycle: motion.humanLifecycleCount, templatePromoted: motion.templatePromotedCount},
      {humanLifecycle: thresholds.motionRecipesWithHumanLifecycle},
      motion.recipes.filter((item) => !item.humanLifecycleValid).map((item) => `${item.recipeId}: ${item.nextAction || 'human lifecycle evidence missing'}`),
    ),
    gate(
      'twenty-real-project-recoveries',
      recoverable.length >= thresholds.recoverableRealProjects
        && durationClasses.every((item) => durationCoverage.has(item))
        && carrierClasses.every((item) => carrierCoverage.has(item))
        && scaleMetrics.measuredProjectCount === recoverable.length,
      {projects: recoverable.length, durations: [...durationCoverage].sort(), carriers: [...carrierCoverage].sort(), metrics: scaleMetrics},
      {projects: thresholds.recoverableRealProjects, durations: durationClasses, carriers: carrierClasses},
      [
        ...(recoverable.length < thresholds.recoverableRealProjects ? [`Only ${recoverable.length} genuine real projects have a current resume-to-human-gate receipt.`] : []),
        ...durationClasses.filter((item) => !durationCoverage.has(item)).map((item) => `Duration class ${item} is missing.`),
        ...carrierClasses.filter((item) => !carrierCoverage.has(item)).map((item) => `Carrier class ${item} is missing.`),
      ],
    ),
    gate(
      'rights-and-sha-current',
      realProjects.length >= thresholds.recoverableRealProjects
        && rightsCurrent === realProjects.length
        && publicCandidates.length >= thresholds.publicReleaseCandidates,
      {realProjects: realProjects.length, rightsCurrent, publicCandidates: publicCandidates.length},
      {rightsCurrentForEveryRealProject: true, publicCandidateRightsCleared: true},
      [
        ...(rightsCurrent !== realProjects.length ? [`${realProjects.length - rightsCurrent} attested real project(s) lack a current rights v2 inventory.`] : []),
        ...(publicCandidates.length < thresholds.publicReleaseCandidates ? ['No public candidate has a cleared, hash-current rights inventory.'] : []),
      ],
    ),
    gate(
      'workbench-state-separation',
      stateSeparation.valid,
      {contractPresent: stateSeparation.present, checks: stateSeparation.checks?.filter((item) => item.valid).length ?? 0},
      {production: ['generated', 'override', 'effective'], release: ['internal-review-package', 'public-master-candidate', 'published']},
      stateSeparation.issues,
    ),
    gate(
      'human-approval-integrity',
      recoverable.length >= thresholds.recoverableRealProjects
        && publicCandidates.length >= thresholds.publicReleaseCandidates
        && projects.every((item) => !item.real.present || item.real.valid),
      {recoverableHumanAttestations: recoverable.length, publicCandidatesWithHumanGates: publicCandidates.length},
      {machineApprovalCountedAsHuman: 0},
      ['Human approvals, real-project status, and public readiness must come only from current named human attestations; internal simulations remain non-human.'],
    ),
  ];
  return {
    mature: gates.every((item) => item.passed),
    gates,
    summary: {
      workbenchProjects: projects.length,
      realProjects: realProjects.length,
      recoverableRealProjects: recoverable.length,
      publicReleaseCandidates: publicCandidates.length,
      routeGoldCounts,
      humanReviewedContentGoldCases: contentGold.acceptedCases,
      motionRecipes: motion.recipeCount,
      motionHumanLifecycle: motion.humanLifecycleCount,
      motionTemplatesPromoted: motion.templatePromotedCount,
      rightsCurrentProjects: rightsCurrent,
      scaleMetrics,
    },
  };
};

export const auditAutoVideoMaturity = async ({
  workspaceRoot,
  workbenchDataRoot = null,
  generatedAt = new Date().toISOString(),
  thresholds = DEFAULT_MATURITY_THRESHOLDS,
} = {}) => {
  if (!workspaceRoot) throw new Error('auditAutoVideoMaturity requires workspaceRoot.');
  const root = path.resolve(workspaceRoot);
  const loaded = await loadProjects(root, workbenchDataRoot);
  const projects = [];
  for (const item of loaded.projects) {
    projects.push(await inspectProject({workspaceRoot: root, ...item}));
  }
  const realProjectIds = new Set(projects.filter((item) => item.real.valid).map((item) => item.projectId));
  const [motion, contentGold, stateSeparation] = await Promise.all([
    loadMotionEvidence(root, realProjectIds),
    loadContentGold(root),
    loadStateSeparation(root),
  ]);
  const evaluated = evaluateMaturityGates({projects, motion, contentGold, stateSeparation, thresholds});
  const inputBindings = [];
  if (await pathExists(loaded.dbPath)) inputBindings.push({path: relativePath(root, loaded.dbPath), sha256: await sha256File(loaded.dbPath)});
  for (const relative of [
    motionDefaults.library,
    motionDefaults.ledger,
    'workflow-console/contracts/maturity-state-separation.json',
    'tools/content-pipeline/gold/corpus.json',
  ]) {
    const target = path.join(root, relative);
    if (await pathExists(target)) inputBindings.push({path: relative, sha256: await sha256File(target)});
  }
  return {
    schemaVersion: MATURITY_SCHEMA_VERSION,
    generatedAt,
    status: evaluated.mature ? 'mature-batch-delivery' : 'not-mature',
    mature: evaluated.mature,
    policy: {
      failClosed: true,
      internalSimulationCountsAsHuman: false,
      fixtureOrMachineProjectsCountAsReal: false,
      missingEvidenceCountsAsPassed: false,
      thresholds,
    },
    inputBindings,
    summary: evaluated.summary,
    gates: evaluated.gates,
    projects,
    motion,
    contentGold,
    stateSeparation,
    blockers: evaluated.gates.filter((item) => !item.passed).flatMap((item) => item.blockers.map((message) => ({gateId: item.id, message}))),
    nextActions: evaluated.gates.filter((item) => !item.passed).map((item) => item.id),
  };
};

export const writeMaturityReport = async ({workspaceRoot, outputPath = 'reports/AUTOVIDEO_MATURITY.json', ...options}) => {
  const root = path.resolve(workspaceRoot);
  const report = await auditAutoVideoMaturity({workspaceRoot: root, ...options});
  const target = resolveInside(root, outputPath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.rm(target, {force: true});
  await fs.rename(temporary, target);
  return {
    report,
    path: relativePath(root, target),
    sha256: await sha256File(target),
  };
};

export {carrierClasses, durationClasses, routes, scalePaths};
