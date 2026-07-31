import fs from 'node:fs/promises';
import path from 'node:path';

import {sha256File} from './maturity-audit.mjs';

export const SCALE_METRICS_DRAFT_SCHEMA_VERSION = 'autovideo-scale-metrics-draft/v1';
export const SCALE_METRICS_SIMULATION_SCHEMA_VERSION = 'autovideo-scale-metrics-simulation/v1';
export const INTERNAL_SCALE_SIMULATION_PATH = 'receipts/scale/internal-simulation.json';
export const scaleMetricKeys = [
  'elapsedSeconds', 'humanMinutes', 'cpuSeconds', 'gpuSeconds', 'modelCalls',
  'retryCount', 'overrideCount', 'assetReuseCount', 'assetCandidateCount',
  'recipeReuseCount', 'recipeOpportunityCount', 'reworkCount',
];

const readJson = async (target) => JSON.parse(await fs.readFile(target, 'utf8'));
const readOptionalJson = async (target) => {
  try { return await readJson(target); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};
const readOptionalJsonLines = async (target) => {
  try {
    return (await fs.readFile(target, 'utf8')).split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};
const finiteDate = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};
const derived = (value, source, method, extra = {}) => ({
  state: 'derived',
  value,
  source,
  method,
  ...extra,
});
const unavailable = (reason) => ({state: 'unavailable', value: null, reason});
const resolveInside = (root, relative) => {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Scale metrics path leaves its root: ${relative}`);
  return target;
};
const uniqueBy = (items, keyFor) => [...new Map(items.map((item) => [keyFor(item), item])).values()];

const loadProjectContext = async ({workspaceRoot, projectId, workbenchDataRoot = null}) => {
  const root = path.resolve(workspaceRoot);
  const dataRoot = path.resolve(workbenchDataRoot || path.join(root, 'workflow-console', 'data'));
  const dbPath = path.join(dataRoot, 'db.json');
  const db = await readJson(dbPath);
  const project = db.projects?.[projectId];
  if (!project) throw new Error(`Unknown workbench project: ${projectId}`);
  const formalRoot = path.resolve(root, project.formalProjectPath || `hyperframes-workflow-kit/projects/${projectId}`);
  return {root, dataRoot, dbPath, db, project, formalRoot};
};

const jobMetrics = ({db, project}) => {
  const jobs = Object.values(db.jobs || {}).filter((job) => job.projectId === project.id);
  const timedJobs = jobs.map((job) => ({
    ...job,
    startedMs: finiteDate(job.startedAt),
    finishedMs: finiteDate(job.finishedAt),
  })).filter((job) => job.startedMs != null && job.finishedMs != null && job.finishedMs >= job.startedMs);
  const activeSeconds = timedJobs.reduce((total, job) => total + (job.finishedMs - job.startedMs), 0) / 1000;
  const recoveredFailures = jobs.filter((job) => {
    if (job.status !== 'failed') return false;
    const failedAt = finiteDate(job.finishedAt) ?? finiteDate(job.createdAt) ?? 0;
    return jobs.some((candidate) => candidate.stageId === job.stageId
      && candidate.status === 'complete'
      && (finiteDate(candidate.finishedAt) ?? finiteDate(candidate.createdAt) ?? 0) > failedAt);
  }).length;
  const explicitModelCalls = jobs.map((job) => job.metrics?.modelCalls ?? job.result?.metrics?.modelCalls)
    .filter((value) => Number.isFinite(Number(value))).map(Number);
  return {
    jobs,
    timedJobs,
    activeSeconds,
    failedJobs: jobs.filter((job) => job.status === 'failed').length,
    explicitRetries: jobs.filter((job) => job.retryOf || Number(job.attempt) > 1).length,
    recoveredFailures,
    explicitModelCalls,
  };
};

const countOverrides = async ({project, formalRoot}) => {
  const workbench = Object.values(project.stages || {}).flatMap((stage) => stage.overrides || []);
  const formal = (await readOptionalJson(path.join(formalRoot, 'overrides', 'overrides.json')))?.overrides || [];
  return uniqueBy([...workbench, ...formal], (item) => item.id || JSON.stringify(item)).length;
};

const assetMetrics = async (formalRoot) => {
  const assetManifest = await readOptionalJson(path.join(formalRoot, 'AssetManifest.json'));
  const mediaManifest = await readOptionalJsonLines(path.join(formalRoot, '.media', 'manifest.jsonl'));
  const frozenAssets = assetManifest?.assets || [];
  const candidates = uniqueBy([
    ...frozenAssets.map((item) => ({...item, ledger: 'AssetManifest.json'})),
    ...mediaManifest.map((item) => ({...item, ledger: '.media/manifest.jsonl'})),
  ], (item) => item.sha256 || `${item.ledger}:${item.path || item.id}`);
  const reused = candidates.filter((item) => {
    const source = `${item.source || ''} ${item.provider || ''} ${item.provenance?.provider || ''} ${item.provenance?.libraryId || ''}`;
    return /local-asset-library|bundled|registry|shared-library/iu.test(source);
  });
  return {candidateCount: candidates.length, reuseCount: reused.length, manifestPresent: Boolean(assetManifest)};
};

const recipeMetrics = async (formalRoot) => {
  const planning = await readOptionalJson(path.join(formalRoot, 'plan', 'planning-bundle.json'));
  const shots = planning?.shotManifest?.shots || [];
  const opportunities = shots.filter((shot) => shot.cueId).length;
  const reuseCount = shots.reduce((total, shot) => total + (shot.motionRecipeRefs || []).filter((reference) => reference.recipeId).length, 0);
  return {opportunityCount: opportunities, reuseCount, planningPresent: Boolean(planning)};
};

const standardRunMetrics = async (formalRoot) => {
  const run = await readOptionalJson(path.join(formalRoot, 'STANDARD_RUN_RECEIPT.json'));
  const startedMs = finiteDate(run?.startedAt);
  const updatedMs = finiteDate(run?.updatedAt);
  const elapsedSeconds = startedMs != null && updatedMs != null && updatedMs >= startedMs
    ? (updatedMs - startedMs) / 1000
    : null;
  const issues = [];
  if (!run) issues.push('STANDARD_RUN_RECEIPT.json is missing.');
  else {
    if (!run.resumesRunId || run.resumesRunId === run.runId) issues.push('The current standard run is not a distinct resumed run.');
    if (!['waiting-for-human', 'complete'].includes(run.status)) issues.push('The current standard run did not reach a human gate or completion.');
  }
  return {run, elapsedSeconds, recoveryEligible: issues.length === 0, issues};
};

export const buildScaleMetricsDraft = async ({workspaceRoot, projectId, workbenchDataRoot = null, generatedAt = new Date().toISOString()}) => {
  const context = await loadProjectContext({workspaceRoot, projectId, workbenchDataRoot});
  const jobs = jobMetrics(context);
  const [overrideCount, assets, recipes, standardRun, state] = await Promise.all([
    countOverrides(context),
    assetMetrics(context.formalRoot),
    recipeMetrics(context.formalRoot),
    standardRunMetrics(context.formalRoot),
    readOptionalJson(path.join(context.formalRoot, 'project-state.json')),
  ]);
  const reopenedCount = (context.project.events || []).filter((event) => event.type === 'stage-reopened').length;
  const invalidationCount = (state?.invalidations || []).length;
  const elapsedMetric = standardRun.elapsedSeconds == null
    ? unavailable('No valid standard-run start/update timestamp pair is available.')
    : derived(Number(standardRun.elapsedSeconds.toFixed(3)), 'STANDARD_RUN_RECEIPT.json', 'updatedAt - startedAt');
  const modelCalls = jobs.explicitModelCalls.length
    ? derived(jobs.explicitModelCalls.reduce((total, value) => total + value, 0), 'workflow-console/data/db.json', 'sum of explicit job metrics.modelCalls values')
    : unavailable('No provider usage receipt or explicit modelCalls counter is stored for this project.');
  const retryCount = jobs.recoveredFailures || jobs.explicitRetries;
  const reworkCount = reopenedCount || invalidationCount;
  const metrics = {
    elapsedSeconds: elapsedMetric,
    humanMinutes: unavailable('Human active time is not captured by a trustworthy timer.'),
    cpuSeconds: unavailable('Per-process CPU time is not captured by the current runner.'),
    gpuSeconds: unavailable('GPU utilization time is not captured by the current runner.'),
    modelCalls,
    retryCount: derived(retryCount, 'workflow-console/data/db.json', jobs.recoveredFailures
      ? 'failed jobs that have a later successful job for the same stage'
      : 'jobs with retryOf or attempt > 1'),
    overrideCount: derived(overrideCount, 'workbench stages + overrides/overrides.json', 'deduplicated override records'),
    assetReuseCount: assets.manifestPresent
      ? derived(assets.reuseCount, 'AssetManifest.json + .media/manifest.jsonl', 'frozen assets whose provenance is a shared local, bundled, or registry library')
      : unavailable('AssetManifest.json is missing.'),
    assetCandidateCount: assets.manifestPresent
      ? derived(assets.candidateCount, 'AssetManifest.json + .media/manifest.jsonl', 'unique frozen asset hashes or paths observed in both ledgers')
      : unavailable('AssetManifest.json is missing.'),
    recipeReuseCount: recipes.planningPresent
      ? derived(recipes.reuseCount, 'plan/planning-bundle.json', 'motion recipe references attached to final shots')
      : unavailable('The final planning bundle is missing.'),
    recipeOpportunityCount: recipes.planningPresent
      ? derived(recipes.opportunityCount, 'plan/planning-bundle.json', 'final shots with a cue identity')
      : unavailable('The final planning bundle is missing.'),
    reworkCount: derived(reworkCount, reopenedCount ? 'workflow-console project events' : 'project-state.json', reopenedCount
      ? 'stage-reopened events'
      : 'explicit project invalidation records'),
  };
  return {
    schemaVersion: SCALE_METRICS_DRAFT_SCHEMA_VERSION,
    projectId,
    generatedAt,
    status: 'draft-only',
    countsForMaturity: false,
    recoveryEligible: standardRun.recoveryEligible,
    recoveryIssues: standardRun.issues,
    metrics,
    observations: {
      jobCount: jobs.jobs.length,
      failedJobCount: jobs.failedJobs,
      timedJobCount: jobs.timedJobs.length,
      activeJobWallSeconds: Number(jobs.activeSeconds.toFixed(3)),
      projectInvalidationCount: invalidationCount,
      stageReopenedCount: reopenedCount,
    },
    policy: {
      unknownIsNeverZero: true,
      simulationCountsAsHuman: false,
      microphoneUsed: false,
      mediaPlaybackInvoked: false,
    },
  };
};

const writeAtomic = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rm(target, {force: true});
  await fs.rename(temporary, target);
};

export const writeInternalScaleSimulation = async ({workspaceRoot, projectId, workbenchDataRoot = null, generatedAt = new Date().toISOString()}) => {
  const context = await loadProjectContext({workspaceRoot, projectId, workbenchDataRoot});
  const draft = await buildScaleMetricsDraft({workspaceRoot, projectId, workbenchDataRoot, generatedAt});
  const standardRunPath = path.join(context.formalRoot, 'STANDARD_RUN_RECEIPT.json');
  const standardRunPresent = await fs.access(standardRunPath).then(() => true, () => false);
  const receipt = {
    schemaVersion: SCALE_METRICS_SIMULATION_SCHEMA_VERSION,
    projectId,
    generatedAt,
    status: 'internal-simulation-only',
    countsForMaturity: false,
    generatedBy: 'codex-creator-delegated-internal-simulation',
    metrics: draft.metrics,
    observations: draft.observations,
    recoveryEligible: draft.recoveryEligible,
    recoveryIssues: draft.recoveryIssues,
    bindings: {
      projectState: await fs.access(path.join(context.formalRoot, 'project-state.json')).then(async () => ({
        path: 'project-state.json',
        sha256: await sha256File(path.join(context.formalRoot, 'project-state.json')),
      }), () => null),
      standardRun: standardRunPresent ? {path: 'STANDARD_RUN_RECEIPT.json', sha256: await sha256File(standardRunPath)} : null,
    },
    policy: draft.policy,
    notes: 'Mechanical fields were derived from frozen local receipts. Missing human, CPU, GPU, and provider-usage telemetry remains unknown and was not silently replaced with zero.',
  };
  const target = resolveInside(context.formalRoot, INTERNAL_SCALE_SIMULATION_PATH);
  await writeAtomic(target, receipt);
  return {path: INTERNAL_SCALE_SIMULATION_PATH, sha256: await sha256File(target), receipt};
};

export const readInternalScaleSimulation = async ({workspaceRoot, projectId, workbenchDataRoot = null}) => {
  const context = await loadProjectContext({workspaceRoot, projectId, workbenchDataRoot});
  return readOptionalJson(resolveInside(context.formalRoot, INTERNAL_SCALE_SIMULATION_PATH));
};

export const mergeRecoveryMetrics = ({draft, provided = {}}) => {
  const metrics = {};
  const missing = [];
  const sources = {};
  for (const key of scaleMetricKeys) {
    const explicit = provided[key];
    if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
      const value = Number(explicit);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Recovery metric ${key} must be a non-negative number.`);
      metrics[key] = value;
      sources[key] = 'human-confirmed-input';
      continue;
    }
    const item = draft?.metrics?.[key];
    if (item?.state === 'derived' && Number.isFinite(Number(item.value))) {
      metrics[key] = Number(item.value);
      sources[key] = `derived:${item.source}`;
    } else missing.push(key);
  }
  return {metrics, missing, sources};
};
