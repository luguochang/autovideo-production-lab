import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const LIFECYCLE_SCHEMA_VERSION = 'autovideo-motion-recipe-lifecycle/v1';
export const RECEIPT_SCHEMA_VERSION = 'autovideo-motion-recipe-lifecycle-receipt/v1';
export const EVIDENCE_SCHEMA_VERSION = 'autovideo-motion-recipe-lifecycle-evidence/v1';

export const LIFECYCLE_STATES = [
  'candidate',
  'probe-passed',
  'approved-project',
  'promoted-template',
  'retired',
];

export const RETIREMENT_REASONS = [
  'visual-regression',
  'semantic-regression',
  'determinism-regression',
  'accessibility-regression',
  'rights-or-license-blocked',
  'official-source-removed',
  'superseded-by-new-version',
  'template-incompatibility',
];

const EXPECTED_INVARIANTS = {
  baseStyleId: 'modern-ip-host-explainer',
  baseStyleVersion: '1.0.0',
  paletteId: 'light-apricot',
  background: '#F2DFC7',
  hostZone: 'host.left',
  contentZone: 'content.right',
  captionZone: 'caption',
  cameraScope: 'content-world-only',
  hostReplacementAllowed: false,
  paletteReplacementAllowed: false,
};

const TRANSITIONS = {
  candidate: new Set(['probe-passed', 'retired']),
  'probe-passed': new Set(['approved-project', 'retired']),
  'approved-project': new Set(['approved-project', 'promoted-template', 'retired']),
  'promoted-template': new Set(['retired']),
  retired: new Set(),
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const sha256Text = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const canonicalSha256 = (value) => sha256Text(JSON.stringify(canonicalize(value)));
export const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
export const recipeDefinitionSha256 = (recipe) => canonicalSha256(recipe);

const toPosix = (value) => value.replaceAll('\\', '/');

export const resolveInside = (workspaceRoot, relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error('Lifecycle paths must be non-empty workspace-relative paths.');
  }
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Lifecycle path leaves the workspace: ${relativePath}`);
  }
  return target;
};

export const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const issue = (issues, code, message, details = undefined) => issues.push({code, message, details});

const libraryInvariantSnapshot = (library) => ({
  baseStyleId: library.baseStyleId,
  baseStyleVersion: library.baseStyleVersion,
  paletteId: library.paletteId,
  background: library.requiredBackground,
  hostZone: library.hostPolicy?.defaultZone,
  contentZone: 'content.right',
  captionZone: library.hostPolicy?.captionPersistent ? 'caption' : null,
  cameraScope: library.hostPolicy?.cameraScope,
  hostReplacementAllowed: library.hostAssetPolicy?.allowHostReplacement,
  paletteReplacementAllowed: library.hostAssetPolicy?.allowPaletteReplacement,
});

export const assertLibraryInvariants = (library) => {
  const actual = libraryInvariantSnapshot(library);
  const mismatches = Object.entries(EXPECTED_INVARIANTS)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, expected]) => ({key, expected, actual: actual[key]}));
  if (mismatches.length) {
    throw new Error(`Motion recipe library changes the approved host shell: ${JSON.stringify(mismatches)}`);
  }
  return actual;
};

const catalogIds = (catalogs) => ({
  'official-registry': new Set((catalogs.officialRegistry ?? []).map((item) => item.name)),
  'official-blueprint': new Set((catalogs.officialBlueprints ?? []).map((item) => item.id)),
  'official-motion-rule': new Set((catalogs.officialMotionRules ?? []).map((item) => item.id)),
});

const requiredReuseTier = (recipe) => {
  if (recipe.reuse?.registryItems?.length) return {kind: 'official-registry', ids: recipe.reuse.registryItems};
  if (recipe.reuse?.blueprints?.length) return {kind: 'official-blueprint', ids: recipe.reuse.blueprints};
  if (recipe.reuse?.motionRules?.length) return {kind: 'official-motion-rule', ids: recipe.reuse.motionRules};
  return null;
};

const verifyFileBinding = async ({workspaceRoot, binding, label}) => {
  if (!isRecord(binding) || typeof binding.path !== 'string' || !isSha256(binding.sha256)) {
    return {ok: false, details: `${label} requires path and SHA-256.`};
  }
  try {
    const filePath = resolveInside(workspaceRoot, binding.path);
    const actual = await sha256File(filePath);
    return actual === binding.sha256
      ? {ok: true, details: {path: binding.path, sha256: actual}}
      : {ok: false, details: `${label} SHA-256 mismatch.`};
  } catch (error) {
    return {ok: false, details: `${label}: ${error.message}`};
  }
};

const verifyBindings = async ({workspaceRoot, bindings, label}) => {
  if (!Array.isArray(bindings) || bindings.length === 0) return {ok: false, details: `${label} is empty.`};
  const results = await Promise.all(bindings.map((binding, index) => verifyFileBinding({
    workspaceRoot,
    binding,
    label: `${label}[${index}]`,
  })));
  return {
    ok: results.every((result) => result.ok),
    details: results.map((result) => result.details),
  };
};

const currentLibraryBinding = async ({workspaceRoot, ledger}) => ({
  path: ledger.library.path,
  sha256: await sha256File(resolveInside(workspaceRoot, ledger.library.path)),
});

export const createInitialLedger = async ({workspaceRoot, libraryPath, catalogs}) => {
  const normalizedLibraryPath = toPosix(libraryPath);
  const libraryFile = resolveInside(workspaceRoot, normalizedLibraryPath);
  const library = await readJson(libraryFile);
  const invariants = assertLibraryInvariants(library);
  const catalogBindings = {};
  for (const [key, value] of Object.entries(catalogs)) {
    catalogBindings[key] = {path: toPosix(value.path), sha256: await sha256File(resolveInside(workspaceRoot, value.path))};
  }
  return {
    schemaVersion: LIFECYCLE_SCHEMA_VERSION,
    library: {
      id: library.libraryId,
      version: library.version,
      path: normalizedLibraryPath,
      sha256: await sha256File(libraryFile),
    },
    invariants,
    catalogBindings,
    policy: {
      states: LIFECYCLE_STATES,
      probeDurationSeconds: {minimum: 3, maximum: 8},
      minimumProjectApprovalsForTemplate: 2,
      humanApprovalRequiredFor: ['approved-project', 'promoted-template', 'retired'],
      retirementIsTerminal: true,
      officialReuseOrder: ['official-registry', 'official-blueprint', 'official-motion-rule', 'project-local'],
      existingLockedProjectsMayReplayRetiredVersions: true,
    },
    entries: library.recipes.map((recipe) => ({
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      definitionSha256: recipeDefinitionSha256(recipe),
      state: 'candidate',
      revision: 0,
      receiptRefs: [],
      projectApprovals: [],
      retirement: null,
    })),
  };
};

export const validateLifecycleLedger = async ({workspaceRoot, ledger, library, catalogs}) => {
  const issues = [];
  if (ledger?.schemaVersion !== LIFECYCLE_SCHEMA_VERSION) {
    issue(issues, 'schema.version', `Expected ${LIFECYCLE_SCHEMA_VERSION}.`);
    return issues;
  }
  let actualInvariants = null;
  try {
    actualInvariants = assertLibraryInvariants(library);
  } catch (error) {
    issue(issues, 'invariants.library', error.message);
  }
  if (actualInvariants && canonicalSha256(actualInvariants) !== canonicalSha256(ledger.invariants)) {
    issue(issues, 'invariants.ledger', 'Lifecycle ledger invariant snapshot is stale.');
  }
  if (ledger.library?.id !== library.libraryId || ledger.library?.version !== library.version) {
    issue(issues, 'library.identity', 'Lifecycle ledger does not match the motion recipe library ID/version.');
  }
  try {
    const actual = await currentLibraryBinding({workspaceRoot, ledger});
    if (actual.sha256 !== ledger.library.sha256) issue(issues, 'library.hash', 'Motion recipe library hash drifted.');
  } catch (error) {
    issue(issues, 'library.path', error.message);
  }

  for (const [key, binding] of Object.entries(ledger.catalogBindings ?? {})) {
    const result = await verifyFileBinding({workspaceRoot, binding, label: `catalogBindings.${key}`});
    if (!result.ok) issue(issues, `catalog.${key}`, String(result.details));
  }

  const idsByKind = catalogIds(catalogs);
  const expectedEntries = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));
  const seen = new Set();
  for (const [index, entry] of (ledger.entries ?? []).entries()) {
    if (!entry?.recipeId || seen.has(entry.recipeId)) {
      issue(issues, 'entry.identity', `Duplicate or missing recipe ID at entries[${index}].`);
      continue;
    }
    seen.add(entry.recipeId);
    const recipe = expectedEntries.get(entry.recipeId);
    if (!recipe) {
      issue(issues, 'entry.unknown', `Lifecycle entry references unknown recipe ${entry.recipeId}.`);
      continue;
    }
    if (recipe.status !== 'candidate' || recipe.approval?.probeReceipt !== null
        || recipe.approval?.approvedBy !== null || recipe.approval?.approvedAt !== null) {
      issue(issues, 'definition.self-promoted', `${recipe.id} embeds approval in its definition; lifecycle receipts must own promotion.`);
    }
    if (entry.recipeVersion !== recipe.version || entry.definitionSha256 !== recipeDefinitionSha256(recipe)) {
      issue(issues, 'entry.definition', `${recipe.id} lifecycle binding is stale.`);
    }
    if (!LIFECYCLE_STATES.includes(entry.state)) issue(issues, 'entry.state', `${recipe.id} has unsupported state ${entry.state}.`);
    if (!Number.isInteger(entry.revision) || entry.revision < 0) issue(issues, 'entry.revision', `${recipe.id} revision is invalid.`);
    const projectIds = (entry.projectApprovals ?? []).map((approval) => approval.projectId);
    if (new Set(projectIds).size !== projectIds.length) issue(issues, 'entry.project-duplicates', `${recipe.id} repeats a project approval.`);
    if (entry.state === 'approved-project' && projectIds.length < 1) issue(issues, 'entry.project-required', `${recipe.id} has no project approval.`);
    if (entry.state === 'promoted-template'
        && projectIds.length < Number(ledger.policy?.minimumProjectApprovalsForTemplate ?? 2)) {
      issue(issues, 'entry.template-evidence', `${recipe.id} lacks cross-project approvals for template promotion.`);
    }
    if (entry.state === 'retired' && !entry.retirement) issue(issues, 'entry.retirement', `${recipe.id} is retired without a retirement receipt summary.`);

    for (const [kind, refs] of [
      ['official-registry', recipe.reuse?.registryItems ?? []],
      ['official-blueprint', recipe.reuse?.blueprints ?? []],
      ['official-motion-rule', recipe.reuse?.motionRules ?? []],
    ]) {
      for (const id of refs) {
        if (!idsByKind[kind].has(id)) issue(issues, 'entry.official-reference', `${recipe.id} references missing ${kind} ${id}.`);
      }
    }
  }
  for (const recipeId of expectedEntries.keys()) {
    if (!seen.has(recipeId)) issue(issues, 'entry.missing', `Lifecycle ledger is missing ${recipeId}.`);
  }
  return issues;
};

const gate = (gateResults, id, passed, details) => gateResults.push({id, passed: Boolean(passed), details});

const validHumanApproval = (approval, scope) => isRecord(approval)
  && approval.source === 'human'
  && approval.decision === 'approved'
  && approval.scope === scope
  && typeof approval.reviewer === 'string'
  && approval.reviewer.trim().length > 0
  && isIsoDate(approval.approvedAt);

const evaluateProbeEvidence = async ({workspaceRoot, ledger, recipe, evidence, catalogs, gateResults}) => {
  const probe = evidence.probe;
  gate(gateResults, 'probe.kind', probe?.kind === 'motion-probe', probe?.kind ?? null);
  const duration = Number(probe?.durationSeconds);
  const minimum = Number(ledger.policy.probeDurationSeconds.minimum);
  const maximum = Number(ledger.policy.probeDurationSeconds.maximum);
  gate(gateResults, 'probe.duration', Number.isFinite(duration) && duration >= minimum && duration <= maximum, {duration, minimum, maximum});
  gate(gateResults, 'probe.same-narration-window', probe?.sameNarrationWindow === true
    && isSha256(probe?.narrationSha256) && isSha256(probe?.audioSha256), probe?.sameNarrationWindow ?? false);
  gate(gateResults, 'probe.invariants', canonicalSha256(probe?.invariants ?? {}) === canonicalSha256(ledger.invariants), probe?.invariants ?? null);
  const invariantAuditBinding = await verifyFileBinding({workspaceRoot, binding: probe?.invariantAudit?.binding, label: 'probe.invariantAudit'});
  const invariantChecks = probe?.invariantAudit?.checks ?? {};
  const requiredInvariantChecks = ['landscape16x9', 'lightApricotBackground', 'qVersionHostAssets', 'hostLeft', 'contentRight', 'captionPersistent', 'contentWorldOnlyCamera'];
  gate(gateResults, 'probe.invariant-audit', invariantAuditBinding.ok
    && probe?.invariantAudit?.passed === true
    && requiredInvariantChecks.every((key) => invariantChecks[key] === true), {
    binding: invariantAuditBinding.details,
    passed: probe?.invariantAudit?.passed ?? false,
    checks: invariantChecks,
  });
  const hostAssetManifest = await verifyFileBinding({workspaceRoot, binding: probe?.hostAssetManifest, label: 'probe.hostAssetManifest'});
  gate(gateResults, 'probe.host-assets', hostAssetManifest.ok, hostAssetManifest.details);

  const stills = await verifyBindings({workspaceRoot, bindings: probe?.stills, label: 'probe.stills'});
  gate(gateResults, 'probe.stills', stills.ok, stills.details);
  const motionProbe = await verifyFileBinding({workspaceRoot, binding: probe?.motionProbe, label: 'probe.motionProbe'});
  gate(gateResults, 'probe.motion', motionProbe.ok, motionProbe.details);
  const checkBinding = await verifyFileBinding({workspaceRoot, binding: probe?.hyperframesCheck?.binding, label: 'probe.hyperframesCheck'});
  gate(gateResults, 'probe.check-binding', checkBinding.ok, checkBinding.details);
  gate(gateResults, 'probe.hyperframes-check', probe?.hyperframesCheck?.ok === true
    && probe?.hyperframesCheck?.strict === true
    && probe?.hyperframesCheck?.snapshotsEnabled === true
    && Number(probe?.hyperframesCheck?.findingCount) === 0, probe?.hyperframesCheck ?? null);

  const checks = probe?.visualReview?.checks ?? {};
  const visualChecks = [
    'layout',
    'textFit',
    'seekBehavior',
    'hostStable',
    'captionStable',
    'terminalFrameReadable',
    'officialReuseVisible',
    'exactBackground',
    'cameraScopedToContentWorld',
  ];
  gate(gateResults, 'probe.visual-review', probe?.visualReview?.status === 'passed'
    && typeof probe?.visualReview?.reviewer === 'string'
    && isIsoDate(probe?.visualReview?.reviewedAt)
    && visualChecks.every((key) => checks[key] === true), probe?.visualReview ?? null);

  const idsByKind = catalogIds(catalogs);
  const observed = Array.isArray(probe?.officialReuseObserved) ? probe.officialReuseObserved : [];
  let observedValid = true;
  for (const ref of observed) {
    if (!idsByKind[ref.kind]?.has(ref.id)) observedValid = false;
    const implementation = await verifyFileBinding({workspaceRoot, binding: ref.implementation, label: `official reuse ${ref.kind}:${ref.id}`});
    if (!implementation.ok) observedValid = false;
  }
  const requiredTier = requiredReuseTier(recipe);
  const usedPrioritySource = !requiredTier || observed.some((ref) => ref.kind === requiredTier.kind && requiredTier.ids.includes(ref.id));
  gate(gateResults, 'probe.official-reuse', observedValid && usedPrioritySource, {requiredTier, observed});
};

const evaluateProjectApproval = async ({workspaceRoot, ledger, entry, evidence, recipe, gateResults}) => {
  const approval = evidence.projectApproval;
  gate(gateResults, 'project.human-approval', validHumanApproval(approval?.humanApproval, 'project'), approval?.humanApproval ?? null);
  gate(gateResults, 'project.identity', typeof approval?.projectId === 'string' && approval.projectId.length > 0, approval?.projectId ?? null);
  const styleSelection = await verifyFileBinding({workspaceRoot, binding: approval?.styleSelection, label: 'project.styleSelection'});
  gate(gateResults, 'project.style-selection-binding', styleSelection.ok, styleSelection.details);
  if (styleSelection.ok) {
    const document = await readJson(resolveInside(workspaceRoot, approval.styleSelection.path));
    const selectionShapeIsValid = document.schemaVersion === 'autovideo-style-selection/v1'
      && Array.isArray(document.addons) && document.addons.length <= 2
      && Array.isArray(document.registryItems)
      && Array.isArray(document.blueprints)
      && Array.isArray(document.motionRules) && document.motionRules.length > 0
      && Array.isArray(document.receipts) && document.receipts.length > 0
      && document.receipts.every((receipt) => typeof receipt?.source === 'string'
        && typeof receipt?.kind === 'string' && typeof receipt?.license === 'string');
    gate(gateResults, 'project.style-selection-approved', selectionShapeIsValid
      && document.status === 'approved'
      && document.projectId === approval.projectId
      && document.baseStyleId === EXPECTED_INVARIANTS.baseStyleId
      && typeof document.approvedBy === 'string' && document.approvedBy.trim().length > 0, {
      schemaVersion: document.schemaVersion,
      status: document.status,
      projectId: document.projectId,
      baseStyleId: document.baseStyleId,
      approvedBy: document.approvedBy,
    });
  } else {
    gate(gateResults, 'project.style-selection-approved', false, 'Style selection binding is invalid.');
  }
  const probeReceipt = await verifyFileBinding({workspaceRoot, binding: approval?.probeReceipt, label: 'project.probeReceipt'});
  gate(gateResults, 'project.probe-receipt-binding', probeReceipt.ok, probeReceipt.details);
  if (probeReceipt.ok) {
    const receipt = await readJson(resolveInside(workspaceRoot, approval.probeReceipt.path));
    gate(gateResults, 'project.probe-receipt-applied', receipt.schemaVersion === RECEIPT_SCHEMA_VERSION
      && receipt.action === 'transition'
      && receipt.outcome === 'applied'
      && receipt.fromState === 'candidate'
      && receipt.requestedState === 'probe-passed'
      && receipt.recipe?.id === recipe.id
      && receipt.recipe?.version === recipe.version
      && receipt.recipe?.definitionSha256 === entry.definitionSha256
      && canonicalSha256(receipt.library ?? {}) === canonicalSha256(ledger.library)
      && canonicalSha256(receipt.invariantSnapshot ?? {}) === canonicalSha256(ledger.invariants)
      && receipt.effectiveState === 'probe-passed'
      && Array.isArray(receipt.gateResults) && receipt.gateResults.length > 0
      && receipt.gateResults.every((result) => result?.passed === true)
      && Array.isArray(receipt.blockedReasons) && receipt.blockedReasons.length === 0, {
      schemaVersion: receipt.schemaVersion,
      action: receipt.action,
      outcome: receipt.outcome,
      fromState: receipt.fromState,
      requestedState: receipt.requestedState,
      recipe: receipt.recipe,
      effectiveState: receipt.effectiveState,
    });
  } else {
    gate(gateResults, 'project.probe-receipt-applied', false, 'Probe receipt binding is invalid.');
  }
};

const evaluateTemplateApproval = async ({workspaceRoot, ledger, entry, evidence, gateResults}) => {
  const approval = evidence.templateApproval;
  const distinctProjects = new Set((entry.projectApprovals ?? []).map((item) => item.projectId));
  gate(gateResults, 'template.project-count', distinctProjects.size >= ledger.policy.minimumProjectApprovalsForTemplate, {
    actual: distinctProjects.size,
    required: ledger.policy.minimumProjectApprovalsForTemplate,
  });
  gate(gateResults, 'template.human-approval', validHumanApproval(approval?.humanApproval, 'template'), approval?.humanApproval ?? null);
  gate(gateResults, 'template.regression', approval?.crossProjectRegressionPassed === true
    && approval?.backwardCompatibilityPassed === true, approval ?? null);
  const report = await verifyFileBinding({workspaceRoot, binding: approval?.report, label: 'template.report'});
  gate(gateResults, 'template.report-binding', report.ok, report.details);
};

const evaluateRetirement = async ({library, entry, evidence, gateResults}) => {
  const retirement = evidence.retirement;
  gate(gateResults, 'retirement.human-approval', validHumanApproval(retirement?.humanApproval, 'retirement'), retirement?.humanApproval ?? null);
  gate(gateResults, 'retirement.reason', RETIREMENT_REASONS.includes(retirement?.reason), retirement?.reason ?? null);
  const replacement = retirement?.replacementRecipeId;
  const replacementValid = replacement == null || (replacement !== entry.recipeId && library.recipes.some((recipe) => recipe.id === replacement));
  gate(gateResults, 'retirement.replacement', replacementValid
    && (entry.state !== 'promoted-template' || typeof replacement === 'string'), replacement ?? null);
  gate(gateResults, 'retirement.replay-policy', retirement?.existingProjectReplayAllowed === true
    && retirement?.futureSelectionBlocked === true, retirement ?? null);
};

const blockedReasonFor = (gateId) => ({
  'transition.allowed': 'invalid-transition',
  'probe.kind': 'not-a-motion-probe',
  'probe.duration': 'probe-duration-out-of-range',
  'probe.same-narration-window': 'missing-same-narration-binding',
  'probe.invariants': 'style-invariant-mismatch',
  'probe.invariant-audit': 'missing-or-failed-invariant-audit',
  'probe.host-assets': 'missing-host-asset-binding',
  'probe.stills': 'missing-still-evidence',
  'probe.motion': 'missing-motion-probe',
  'probe.check-binding': 'stale-check-evidence',
  'probe.hyperframes-check': 'hyperframes-check-incomplete',
  'probe.visual-review': 'missing-visual-review',
  'probe.official-reuse': 'official-reuse-not-observed',
  'project.human-approval': 'missing-project-human-approval',
  'project.identity': 'missing-project-id',
  'project.style-selection-binding': 'stale-style-selection',
  'project.style-selection-approved': 'style-selection-not-approved',
  'project.probe-receipt-binding': 'stale-probe-receipt',
  'project.probe-receipt-applied': 'probe-not-passed',
  'template.project-count': 'insufficient-project-approvals',
  'template.human-approval': 'missing-template-human-approval',
  'template.regression': 'cross-project-regression-not-passed',
  'template.report-binding': 'stale-template-report',
  'retirement.human-approval': 'missing-retirement-human-approval',
  'retirement.reason': 'invalid-retirement-reason',
  'retirement.replacement': 'invalid-retirement-replacement',
  'retirement.replay-policy': 'invalid-retirement-replay-policy',
}[gateId] ?? `gate-failed:${gateId}`);

export const evaluateLifecycleTransition = async ({
  workspaceRoot,
  ledger,
  library,
  catalogs,
  recipeId,
  targetState,
  evidence,
  actor = 'autovideo-lifecycle-cli',
  now = new Date().toISOString(),
}) => {
  const ledgerIssues = await validateLifecycleLedger({workspaceRoot, ledger, library, catalogs});
  if (ledgerIssues.length) throw new Error(`Lifecycle ledger is invalid: ${JSON.stringify(ledgerIssues)}`);
  if (evidence?.schemaVersion !== EVIDENCE_SCHEMA_VERSION) throw new Error(`Evidence must use ${EVIDENCE_SCHEMA_VERSION}.`);
  const recipe = library.recipes.find((item) => item.id === recipeId);
  const entry = ledger.entries.find((item) => item.recipeId === recipeId);
  if (!recipe || !entry) throw new Error(`Unknown lifecycle recipe: ${recipeId}`);
  if (!LIFECYCLE_STATES.includes(targetState)) throw new Error(`Unsupported target lifecycle state: ${targetState}`);
  if (evidence.recipeId !== recipe.id || evidence.recipeVersion !== recipe.version || evidence.requestedState !== targetState) {
    throw new Error('Evidence recipe/version/requestedState does not match the requested transition.');
  }

  const gateResults = [];
  gate(gateResults, 'transition.allowed', TRANSITIONS[entry.state].has(targetState), {from: entry.state, to: targetState});
  if (targetState === 'probe-passed') {
    await evaluateProbeEvidence({workspaceRoot, ledger, recipe, evidence, catalogs, gateResults});
  } else if (targetState === 'approved-project') {
    await evaluateProjectApproval({workspaceRoot, ledger, entry, evidence, recipe, gateResults});
  } else if (targetState === 'promoted-template') {
    await evaluateTemplateApproval({workspaceRoot, ledger, entry, evidence, gateResults});
  } else if (targetState === 'retired') {
    await evaluateRetirement({library, entry, evidence, gateResults});
  }

  const blockedReasons = gateResults.filter((item) => !item.passed).map((item) => blockedReasonFor(item.id));
  const allowed = blockedReasons.length === 0;
  const timestamp = now.replace(/[^0-9]/g, '').slice(0, 14);
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    receiptId: `motion-lifecycle-${recipe.id}-${targetState}-${timestamp}`,
    action: targetState === 'retired' ? 'retire' : 'transition',
    outcome: allowed ? 'applied' : 'blocked',
    createdAt: now,
    actor,
    library: structuredClone(ledger.library),
    recipe: {id: recipe.id, version: recipe.version, definitionSha256: entry.definitionSha256},
    fromState: entry.state,
    requestedState: targetState,
    effectiveState: allowed ? targetState : entry.state,
    invariantSnapshot: structuredClone(ledger.invariants),
    evidence: structuredClone(evidence),
    gateResults,
    blockedReasons,
  };
  return {allowed, entry: structuredClone(entry), receipt};
};

export const commitLifecycleTransition = ({ledger, evaluation, receiptRef}) => {
  if (!evaluation.allowed) throw new Error('Blocked lifecycle evaluations cannot mutate the ledger.');
  if (!isRecord(receiptRef) || typeof receiptRef.path !== 'string' || !isSha256(receiptRef.sha256)) {
    throw new Error('Applied lifecycle transitions require a hash-bound receipt reference.');
  }
  const next = structuredClone(ledger);
  const entry = next.entries.find((item) => item.recipeId === evaluation.receipt.recipe.id);
  const target = evaluation.receipt.requestedState;
  if (target === 'approved-project') {
    const approval = evaluation.receipt.evidence.projectApproval;
    if (!entry.projectApprovals.some((item) => item.projectId === approval.projectId)) {
      entry.projectApprovals.push({
        projectId: approval.projectId,
        approvedBy: approval.humanApproval.reviewer,
        approvedAt: approval.humanApproval.approvedAt,
        styleSelection: structuredClone(approval.styleSelection),
        probeReceipt: structuredClone(approval.probeReceipt),
      });
    }
  }
  if (target === 'retired') {
    entry.retirement = {
      reason: evaluation.receipt.evidence.retirement.reason,
      replacementRecipeId: evaluation.receipt.evidence.retirement.replacementRecipeId ?? null,
      retiredBy: evaluation.receipt.evidence.retirement.humanApproval.reviewer,
      retiredAt: evaluation.receipt.evidence.retirement.humanApproval.approvedAt,
      existingProjectReplayAllowed: true,
      futureSelectionBlocked: true,
    };
  }
  entry.state = target;
  entry.revision += 1;
  entry.receiptRefs.push(receiptRef);
  return next;
};

export const authorizeRecipeUse = ({ledger, recipeId, scope, projectId = null, lockedDefinitionSha256 = null}) => {
  const entry = ledger.entries.find((item) => item.recipeId === recipeId);
  if (!entry) return {allowed: false, reason: 'unknown-recipe'};
  if (scope === 'probe') {
    return entry.state === 'retired'
      ? {allowed: false, reason: 'retired-for-new-use'}
      : {allowed: true, reason: 'probe-scope'};
  }
  if (scope === 'project') {
    if (entry.state === 'promoted-template') return {allowed: true, reason: 'template-promoted'};
    const approved = entry.state === 'approved-project'
      && entry.projectApprovals.some((item) => item.projectId === projectId);
    return approved ? {allowed: true, reason: 'project-approved'} : {allowed: false, reason: 'project-not-approved'};
  }
  if (scope === 'template') {
    return entry.state === 'promoted-template'
      ? {allowed: true, reason: 'template-promoted'}
      : {allowed: false, reason: 'not-promoted-template'};
  }
  if (scope === 'replay') {
    const exact = lockedDefinitionSha256 === entry.definitionSha256;
    if (!exact) return {allowed: false, reason: 'locked-definition-mismatch'};
    return {allowed: true, reason: entry.state === 'retired' ? 'retired-existing-lock-replay' : 'exact-version-replay'};
  }
  return {allowed: false, reason: 'unsupported-scope'};
};

export const loadLifecycleContext = async ({workspaceRoot, libraryPath, ledgerPath, catalogPaths}) => {
  const [library, ledger, officialRegistry, officialBlueprints, officialMotionRules] = await Promise.all([
    readJson(resolveInside(workspaceRoot, libraryPath)),
    readJson(resolveInside(workspaceRoot, ledgerPath)),
    readJson(resolveInside(workspaceRoot, catalogPaths.officialRegistry)),
    readJson(resolveInside(workspaceRoot, catalogPaths.officialBlueprints)),
    readJson(resolveInside(workspaceRoot, catalogPaths.officialMotionRules)),
  ]);
  return {
    library,
    ledger,
    catalogs: {officialRegistry, officialBlueprints, officialMotionRules},
  };
};
