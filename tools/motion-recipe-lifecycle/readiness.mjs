import fs from 'node:fs/promises';
import path from 'node:path';

import {listMotionProbes, motionProbeVisualCheckKeys} from '../../workflow-console/lib/motion-probe-review.mjs';
import {recipeDefinitionSha256} from './lifecycle.mjs';

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const resolveInside = (root, relativePath) => {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Motion readiness output paths must be workspace-relative.');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(root, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Motion readiness output path leaves the workspace.');
  return target;
};

const nextActionFor = ({entry, technical, reviewed, contractValid}) => {
  if (!contractValid) return 'repair-lifecycle-contract';
  if (entry.state === 'retired') return 'retired-no-new-use';
  if (entry.state === 'promoted-template') return 'monitor-cross-project-regression';
  if (entry.state === 'candidate') {
    if (!technical) return 'create-3-8s-canonical-probe';
    if (!reviewed) return 'complete-human-probe-review';
    return 'accept-reviewed-probe-into-lifecycle';
  }
  if (entry.state === 'probe-passed') return 'approve-in-a-real-project';
  if (entry.state === 'approved-project' && entry.projectApprovals.length < 2) return 'approve-in-second-real-project';
  if (entry.state === 'approved-project') return 'run-cross-project-regression-and-template-review';
  return 'inspect-lifecycle-state';
};

export const buildMotionLifecycleReadiness = async ({
  workspaceRoot,
  library,
  ledger,
  probes: suppliedProbes = null,
  validationIssues = [],
}) => {
  const probes = suppliedProbes ?? await listMotionProbes({workspaceRoot});
  const libraryRecipes = Array.isArray(library?.recipes) ? library.recipes : [];
  const ledgerEntries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const entryCounts = new Map();
  for (const entry of ledgerEntries) entryCounts.set(entry?.recipeId, (entryCounts.get(entry?.recipeId) ?? 0) + 1);
  const entriesByRecipeId = new Map(ledgerEntries.map((entry) => [entry?.recipeId, entry]));
  const issues = validationIssues.map((item) => ({
    code: String(item?.code || 'lifecycle.validation'),
    message: String(item?.message || item?.detail || item || 'Motion lifecycle validation failed.'),
  }));
  for (const [recipeId, count] of entryCounts.entries()) {
    if (recipeId && count > 1 && !issues.some((item) => item.code === 'entry.identity' && item.message.includes(recipeId))) {
      issues.push({code: 'entry.identity', message: `Lifecycle ledger repeats ${recipeId}.`});
    }
  }
  for (const entry of ledgerEntries) {
    if (entry?.recipeId && !libraryRecipes.some((recipe) => recipe.id === entry.recipeId)) {
      issues.push({code: 'entry.unknown', message: `Lifecycle ledger references unknown recipe ${entry.recipeId}.`});
    }
  }

  const recipes = libraryRecipes.map((recipeDefinition) => {
    const entry = entriesByRecipeId.get(recipeDefinition.id) ?? null;
    const expectedDefinitionSha256 = recipeDefinitionSha256(recipeDefinition);
    const entryContractValid = Boolean(
      entry
      && entryCounts.get(recipeDefinition.id) === 1
      && entry.recipeVersion === recipeDefinition.version
      && entry.definitionSha256 === expectedDefinitionSha256,
    );
    if (!entry) issues.push({code: 'entry.missing', message: `Lifecycle ledger is missing ${recipeDefinition.id}.`});
    else if (!entryContractValid) issues.push({code: 'entry.definition', message: `${recipeDefinition.id} lifecycle binding is stale.`});
    const recipeProbes = probes.filter((probe) => probe.recipeId === recipeDefinition.id && probe.recipeVersion === recipeDefinition.version);
    const technicalProbes = entryContractValid
      ? recipeProbes.filter((probe) => probe.canonicalEvidence && probe.technicalReady)
      : [];
    const reviewedProbes = technicalProbes.filter((probe) => probe.review?.decision === 'passed' && !probe.reviewStale);
    const missing = [];
    if (!entry) missing.push('lifecycle-entry');
    else if (!entryContractValid) missing.push('current-recipe-definition-binding');
    if (!technicalProbes.length) missing.push('canonical-3-8s-probe');
    if (!reviewedProbes.length) missing.push('current-human-nine-check-review');
    if (!entry || entry.state === 'candidate') missing.push('probe-lifecycle-acceptance');
    const projectApprovals = entry?.projectApprovals ?? [];
    if (!projectApprovals.length) missing.push('first-real-project-approval');
    if (projectApprovals.length < ledger.policy.minimumProjectApprovalsForTemplate) missing.push('second-real-project-approval');
    if (entry?.state !== 'promoted-template') missing.push('template-promotion-review');
    return {
      recipeId: recipeDefinition.id,
      recipeVersion: recipeDefinition.version,
      definitionSha256: entry?.definitionSha256 ?? null,
      expectedDefinitionSha256,
      contractValid: entryContractValid,
      state: entry?.state ?? 'missing',
      revision: entry?.revision ?? null,
      probeIds: recipeProbes.map((probe) => probe.id),
      technicalProbeIds: technicalProbes.map((probe) => probe.id),
      currentHumanPassedProbeIds: reviewedProbes.map((probe) => probe.id),
      projectApprovals: projectApprovals.map((approval) => ({
        projectId: approval.projectId,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      })),
      receiptRefs: entry?.receiptRefs ?? [],
      missing,
      nextAction: nextActionFor({entry, technical: technicalProbes.length > 0, reviewed: reviewedProbes.length > 0, contractValid: entryContractValid}),
      productionEligible: entryContractValid
        && ['approved-project', 'promoted-template'].includes(entry.state)
        && projectApprovals.length > 0,
    };
  });
  const uniqueIssues = [...new Map(issues.map((item) => [`${item.code}:${item.message}`, item])).values()];
  const contractValid = uniqueIssues.length === 0 && recipes.length === ledgerEntries.length && recipes.every((recipe) => recipe.contractValid);
  const failClosedRecipes = recipes.map((recipe) => ({
    ...recipe,
    productionEligible: contractValid && recipe.productionEligible,
  }));
  return {
    schemaVersion: 'autovideo-motion-lifecycle-readiness/v1',
    library: ledger.library,
    policy: ledger.policy,
    contract: {
      valid: contractValid,
      issueCount: uniqueIssues.length,
      issues: uniqueIssues,
      libraryRecipeCount: libraryRecipes.length,
      ledgerEntryCount: ledgerEntries.length,
    },
    summary: {
      recipeCount: failClosedRecipes.length,
      candidateCount: failClosedRecipes.filter((recipe) => recipe.state === 'candidate').length,
      canonicalProbeReadyCount: failClosedRecipes.filter((recipe) => recipe.technicalProbeIds.length > 0).length,
      currentHumanReviewedCount: failClosedRecipes.filter((recipe) => recipe.currentHumanPassedProbeIds.length > 0).length,
      projectApprovedCount: failClosedRecipes.filter((recipe) => recipe.projectApprovals.length > 0).length,
      templatePromotedCount: failClosedRecipes.filter((recipe) => recipe.state === 'promoted-template').length,
      productionEligibleCount: failClosedRecipes.filter((recipe) => recipe.productionEligible).length,
      humanEvidenceInvented: false,
    },
    recipes: failClosedRecipes,
  };
};

export const motionHumanReviewTemplate = ({entry, library}) => ({
  schemaVersion: 'autovideo-motion-human-review-template/v1',
  recipeId: entry.recipeId,
  recipeVersion: entry.recipeVersion,
  recipeDefinitionSha256: entry.definitionSha256,
  library: {id: library.id, version: library.version},
  probeId: null,
  decision: null,
  checks: Object.fromEntries(motionProbeVisualCheckKeys.map((key) => [key, null])),
  notes: '',
  reviewer: null,
  reviewedAt: null,
  confirmedHuman: false,
  authorizesLifecycleTransition: false,
  instruction: 'Use this only as a review worksheet. Complete the actual current probe review in the workbench; lifecycle acceptance remains a separate explicit action.',
});

const writeAtomic = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, stableJson(value), 'utf8');
  await fs.rm(target, {force: true});
  await fs.rename(temporary, target);
};

export const writeMotionLifecycleReadiness = async ({workspaceRoot, report, outputPath, templatesDir, ledger}) => {
  const written = {report: null, templates: []};
  if (outputPath) {
    const target = resolveInside(workspaceRoot, outputPath);
    await writeAtomic(target, report);
    written.report = path.relative(workspaceRoot, target).replaceAll('\\', '/');
  }
  if (templatesDir) {
    const root = resolveInside(workspaceRoot, templatesDir);
    for (const entry of ledger.entries) {
      const target = path.join(root, `${entry.recipeId}.human-review.template.json`);
      await writeAtomic(target, motionHumanReviewTemplate({entry, library: ledger.library}));
      written.templates.push(path.relative(workspaceRoot, target).replaceAll('\\', '/'));
    }
  }
  return written;
};
