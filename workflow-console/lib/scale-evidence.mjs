import fs from 'node:fs/promises';
import path from 'node:path';

import {
  auditAutoVideoMaturity,
  isGenuineHumanIdentity,
  scalePaths,
  sha256File,
} from './maturity-audit.mjs';

const supportedRoutes = new Set(['script', 'materials', 'audio']);
const supportedDurations = new Set(['30s', '60s', '90s']);
const supportedCarriers = new Set(['process', 'data', 'ui', 'code', 'opinion']);
const metricKeys = [
  'elapsedSeconds', 'humanMinutes', 'cpuSeconds', 'gpuSeconds', 'modelCalls',
  'retryCount', 'overrideCount', 'assetReuseCount', 'assetCandidateCount',
  'recipeReuseCount', 'recipeOpportunityCount', 'reworkCount',
];

const readJson = async (target) => JSON.parse(await fs.readFile(target, 'utf8'));
const resolveInside = (root, relative) => {
  if (!relative || path.isAbsolute(relative)) throw new Error('Scale evidence paths must be project-relative.');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Scale evidence path leaves the project: ${relative}`);
  return target;
};
const projectRelative = (root, target) => path.relative(root, target).replaceAll('\\', '/');
const binding = async (root, relative) => {
  const target = resolveInside(root, relative);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error(`Scale evidence binding is not a file: ${relative}`);
  return {path: relative.replaceAll('\\', '/'), sha256: await sha256File(target)};
};
const humanAttestation = ({reviewer, confirmedHuman, reviewedAt = new Date().toISOString()}) => {
  if (confirmedHuman !== true) throw new Error('Human scale evidence requires an explicit --confirm-human action.');
  if (!isGenuineHumanIdentity(reviewer)) throw new Error('Provide a named real human reviewer; machine and placeholder identities are rejected.');
  return {confirmedHuman: true, reviewerType: 'human', reviewer: String(reviewer).trim(), reviewedAt};
};

const loadProjectContext = async ({workspaceRoot, projectId}) => {
  const root = path.resolve(workspaceRoot);
  const db = await readJson(path.join(root, 'workflow-console', 'data', 'db.json'));
  const project = db.projects?.[projectId];
  if (!project || !supportedRoutes.has(project.route)) throw new Error(`Unknown workbench project: ${projectId}`);
  const formalRoot = path.resolve(root, project.formalProjectPath || `hyperframes-workflow-kit/projects/${projectId}`);
  const state = await readJson(path.join(formalRoot, 'project-state.json'));
  if (state.projectId !== projectId) throw new Error('Formal project state does not match the selected workbench project.');
  return {workspaceRoot: root, project, formalRoot, state};
};

const writeAtomic = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rm(target, {force: true});
  await fs.rename(temporary, target);
};

const writeValidated = async ({context, key, value}) => {
  const relative = scalePaths[key];
  const target = resolveInside(context.formalRoot, relative);
  let previous = null;
  try { previous = await fs.readFile(target); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await writeAtomic(target, value);
  try {
    const audit = await auditAutoVideoMaturity({workspaceRoot: context.workspaceRoot});
    const project = audit.projects.find((item) => item.projectId === context.project.id);
    if (!project?.[key]?.valid) throw new Error(project?.[key]?.issues?.join(' ') || `Generated ${key} receipt failed maturity validation.`);
    if (previous) {
      const stamp = new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14);
      const history = path.join(path.dirname(target), 'history', `${stamp}-${path.basename(target)}`);
      await fs.mkdir(path.dirname(history), {recursive: true});
      await fs.writeFile(history, previous);
    }
    return {path: relative, sha256: await sha256File(target), audit: project[key]};
  } catch (error) {
    if (previous) await fs.writeFile(target, previous);
    else await fs.rm(target, {force: true});
    throw error;
  }
};

const defaultInputPath = ({project, formalRoot, state, workspaceRoot}) => {
  if (state.inputs?.narration) return state.inputs.narration;
  const source = path.resolve(workspaceRoot, project.sourcePath || '');
  const relative = projectRelative(formalRoot, source);
  if (!relative.startsWith('../')) return relative;
  throw new Error('Specify --input with a project-relative frozen input path.');
};

export const attestRealProject = async ({
  workspaceRoot, projectId, reviewer, confirmedHuman, durationClass, carriers, inputPath = null, reviewedAt,
}) => {
  const context = await loadProjectContext({workspaceRoot, projectId});
  if (!supportedDurations.has(durationClass)) throw new Error('Real-project durationClass must be 30s, 60s, or 90s.');
  const normalizedCarriers = [...new Set((carriers ?? []).map((item) => String(item).trim()).filter(Boolean))];
  if (!normalizedCarriers.length || normalizedCarriers.some((item) => !supportedCarriers.has(item))) throw new Error('Real-project carriers must use process, data, ui, code, or opinion.');
  const input = inputPath || defaultInputPath(context);
  const value = {
    schemaVersion: 'autovideo-real-project-attestation/v1',
    projectId,
    route: context.project.route,
    status: 'confirmed-real-production',
    profile: {durationClass, carriers: normalizedCarriers},
    attestation: humanAttestation({reviewer, confirmedHuman, reviewedAt}),
    bindings: {
      input: await binding(context.formalRoot, input),
      projectState: await binding(context.formalRoot, 'project-state.json'),
    },
  };
  return writeValidated({context, key: 'real', value});
};

export const approveRouteGold = async ({
  workspaceRoot, projectId, reviewer, confirmedHuman, qualityReviewPath, reviewedAt,
}) => {
  const context = await loadProjectContext({workspaceRoot, projectId});
  if ([scalePaths.real, scalePaths.gold].includes(qualityReviewPath)) throw new Error('Gold quality review must be an independent project-relative receipt.');
  const value = {
    schemaVersion: 'autovideo-route-gold-approval/v1',
    projectId,
    route: context.project.route,
    status: 'human-approved',
    review: humanAttestation({reviewer, confirmedHuman, reviewedAt}),
    criteria: {inputAuthentic: true, outputQualityApproved: true, routeWorkflowValidated: true},
    bindings: {
      realProject: await binding(context.formalRoot, scalePaths.real),
      qualityReview: await binding(context.formalRoot, qualityReviewPath),
    },
  };
  return writeValidated({context, key: 'gold', value});
};

export const recordRecoveryEvidence = async ({
  workspaceRoot, projectId, reviewer, confirmedHuman, metrics, metricSources = null, reviewedAt,
}) => {
  const context = await loadProjectContext({workspaceRoot, projectId});
  const normalizedMetrics = {};
  for (const key of metricKeys) {
    const value = Number(metrics?.[key]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Recovery metric ${key} must be a non-negative number.`);
    normalizedMetrics[key] = value;
  }
  const run = await readJson(path.join(context.formalRoot, 'STANDARD_RUN_RECEIPT.json'));
  const value = {
    schemaVersion: 'autovideo-recovery-attestation/v1',
    projectId,
    status: 'verified-to-human-gate',
    resumedFromRunId: run.resumesRunId,
    reached: {status: run.status, stageId: run.status === 'complete' ? null : run.currentStageId},
    attestation: humanAttestation({reviewer, confirmedHuman, reviewedAt}),
    metrics: normalizedMetrics,
    metricSources: metricSources && Object.fromEntries(metricKeys.map((key) => [key, String(metricSources[key] || 'human-confirmed-input')])),
    bindings: {
      realProject: await binding(context.formalRoot, scalePaths.real),
      standardRun: await binding(context.formalRoot, 'STANDARD_RUN_RECEIPT.json'),
    },
  };
  return writeValidated({context, key: 'recovery', value});
};

export const registerPublicReleaseCandidate = async ({
  workspaceRoot, projectId, reviewer, confirmedHuman, masterPath, reviewedAt,
}) => {
  const context = await loadProjectContext({workspaceRoot, projectId});
  const value = {
    schemaVersion: 'autovideo-public-release-candidate/v1',
    projectId,
    status: 'ready-for-publication',
    attestation: humanAttestation({reviewer, confirmedHuman, reviewedAt}),
    bindings: {
      realProject: await binding(context.formalRoot, scalePaths.real),
      master: await binding(context.formalRoot, masterPath),
      deliveryQa: await binding(context.formalRoot, 'qa/delivery-report.json'),
      rights: await binding(context.formalRoot, 'rights-clearance/publication-rights.json'),
      approvals: {
        audio: await binding(context.formalRoot, 'audio/approval.json'),
        subtitle: await binding(context.formalRoot, 'qa/subtitle-human-approval.json'),
        screenText: await binding(context.formalRoot, 'qa/screen-text-human-approval.json'),
        finalPreview: await binding(context.formalRoot, 'qa/final-preview.json'),
      },
    },
  };
  return writeValidated({context, key: 'publicCandidate', value});
};

export const scaleEvidenceStatus = async ({workspaceRoot, projectId = null}) => {
  const audit = await auditAutoVideoMaturity({workspaceRoot});
  return projectId ? audit.projects.find((item) => item.projectId === projectId) ?? null : audit;
};

export {metricKeys, supportedCarriers, supportedDurations};
