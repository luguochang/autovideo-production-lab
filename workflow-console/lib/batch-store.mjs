import fs from 'node:fs/promises';
import path from 'node:path';
import {JSONFilePreset} from 'lowdb/node';
import PQueue from 'p-queue';
import {z} from 'zod';
import {stageAppliesToProject, workflowStages} from '../workflow-catalog.mjs';
import {dataRoot, formalProjectRoot, getJobRecord, getProject, listJobRecords} from './project-store.mjs';
import {latestJobsByLogicalKey} from './job-contract.mjs';

const batchPath = path.join(dataRoot, 'batches.json');
const db = await JSONFilePreset(batchPath, {batches: {}});
const queue = new PQueue({concurrency: 1});
const now = () => new Date().toISOString();

const batchInputSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(80),
  title: z.string().trim().min(1).max(120),
  projectIds: z.array(z.string().min(1)).min(1).max(100),
  stageId: z.union([z.literal('next-human-gate'), z.string().trim().min(1).max(120)]),
  priority: z.number().int().min(0).max(100).default(50),
  retryLimit: z.number().int().min(1).max(5).default(2),
});

const read = async (fn) => queue.add(async () => {
  await db.read();
  return structuredClone(await fn(db.data));
});
const write = async (fn) => queue.add(async () => {
  await db.read();
  const value = await fn(db.data);
  await db.write();
  return structuredClone(value);
});

const ensureBatch = (batch) => {
  if (!batch) return null;
  batch.jobIds ??= [];
  batch.status ??= 'draft';
  batch.priority ??= 50;
  batch.retryLimit ??= 2;
  batch.updatedAt ??= batch.createdAt ?? now();
  batch.runCount ??= 0;
  batch.runHistory ??= [];
  batch.lastRunErrors ??= [];
  return batch;
};

const readinessStages = {
  composition: 'composition-readiness',
  delivery: 'package-export',
};

const actionForStatus = (status) => ({
  'not-started': '生成该步骤',
  queued: '等待任务开始',
  running: '等待当前任务完成',
  'needs-review': '完成人工审核',
  stale: '重新生成该步骤',
  failed: '修复问题后重试',
  canceled: '重新排队该步骤',
  'cancel-requested': '等待任务收尾',
  approved: '继续下一步骤',
  complete: '完成人工确认后继续',
}[status] || '检查该步骤');

const activeStageDefinitions = (project) => {
  const definitions = new Map([
    ...workflowStages,
    ...Object.values(project.customStages || {}),
  ].map((stage) => [stage.id, stage]));
  return (project.stageOrder || []).map((id) => ({id, definition: definitions.get(id), state: project.stages?.[id]}))
    .filter(({definition, state}) => state?.enabled !== false && stageAppliesToProject(definition, project));
};

const firstUnapproved = (stages) => stages.find(({state}) => state?.status !== 'approved') || null;

export const planNextHumanGate = (project) => {
  const next = firstUnapproved(activeStageDefinitions(project));
  if (!next) return {projectId: project.id, action: 'complete', stageId: null, reason: 'all active stages are approved'};
  const status = next.state?.status ?? 'not-started';
  if (['running', 'queued', 'cancel-requested'].includes(status)) {
    return {projectId: project.id, action: 'reuse', stageId: next.id, reason: `stage is ${status}`, jobId: next.state?.jobId ?? null};
  }
  if (status === 'needs-review') {
    return {projectId: project.id, action: 'wait-human', stageId: next.id, reason: 'current artifact requires explicit human review'};
  }
  if (['not-started', 'stale', 'failed', 'canceled'].includes(status)) {
    return {projectId: project.id, action: 'queue', stageId: next.id, reason: status};
  }
  return {projectId: project.id, action: 'blocked', stageId: next.id, reason: `unknown stage status: ${status}`};
};

export const summarizeProjectReadiness = (project) => {
  const active = activeStageDefinitions(project);
  const next = firstUnapproved(active);
  const status = next?.state?.status || 'approved';
  const through = (targetId) => {
    const targetIndex = active.findIndex(({id}) => id === targetId);
    if (targetIndex < 0) return {ready: false, blocker: null};
    const scope = active.slice(0, targetIndex + 1);
    return {ready: scope.every(({state}) => state?.status === 'approved'), blocker: firstUnapproved(scope)};
  };
  const composition = through(readinessStages.composition);
  const delivery = through(readinessStages.delivery);
  const compositionReady = composition.ready;
  const deliveryReady = delivery.ready;
  const compositionBlocker = composition.blocker;
  const deliveryBlocker = delivery.blocker;
  const blocker = next || compositionBlocker || deliveryBlocker;
  return {
    projectId: project.id,
    title: project.title,
    route: project.route,
    nextStageId: blocker?.id || null,
    nextStageTitle: blocker?.definition?.title || workflowStages.find((stage) => stage.id === blocker?.id)?.title || blocker?.id || null,
    nextStageStatus: blocker?.state?.status || null,
    nextAction: blocker ? actionForStatus(blocker.state?.status) : '项目步骤已全部批准',
    nextStageError: blocker?.state?.lastError || null,
    readyForComposition: compositionReady,
    readyForDelivery: deliveryReady,
    publicReleaseBlocked: project.publicationRights !== 'cleared',
    compositionBlockerId: compositionBlocker?.id || null,
    compositionBlockerStatus: compositionBlocker?.state?.status || null,
    deliveryBlockerId: deliveryBlocker?.id || null,
    deliveryBlockerStatus: deliveryBlocker?.state?.status || null,
    activeStageCount: active.length,
    approvedStageCount: active.filter(({state}) => state?.status === 'approved').length,
  };
};

export const createBatch = async (input) => {
  const parsed = batchInputSchema.parse(input);
  const uniqueProjectIds = [...new Set(parsed.projectIds)];
  if (uniqueProjectIds.length !== parsed.projectIds.length) throw new Error('Batch projectIds must be unique.');
  await Promise.all(uniqueProjectIds.map((projectId) => getProject(projectId)));
  return write((data) => {
    if (data.batches[parsed.id]) throw new Error(`Batch already exists: ${parsed.id}`);
    const createdAt = now();
    const batch = {
      schemaVersion: 'autovideo-batch/v1',
      ...parsed,
      projectIds: uniqueProjectIds,
      jobIds: [],
      status: 'draft',
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      pausedAt: null,
      finishedAt: null,
      lastError: null,
      runCount: 0,
      runHistory: [],
      lastRunErrors: [],
    };
    data.batches[parsed.id] = batch;
    return batch;
  });
};

export const getBatch = (batchId) => read((data) => {
  const batch = ensureBatch(data.batches[batchId]);
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  return batch;
});

export const listBatches = () => read((data) => Object.values(data.batches).map(ensureBatch).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));

export const updateBatch = (batchId, patch) => write((data) => {
  const batch = ensureBatch(data.batches[batchId]);
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  Object.assign(batch, patch, {updatedAt: now()});
  return batch;
});

export const addBatchJob = (batchId, jobId) => write((data) => {
  const batch = ensureBatch(data.batches[batchId]);
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  if (!batch.jobIds.includes(jobId)) batch.jobIds.push(jobId);
  batch.updatedAt = now();
  return batch;
});

export const deleteBatch = (batchId) => write((data) => {
  if (!data.batches[batchId]) throw new Error(`Unknown batch: ${batchId}`);
  delete data.batches[batchId];
  return {id: batchId};
});

export const setBatchStatus = (batchId, status, extra = {}) => updateBatch(batchId, {
  status,
  ...extra,
  ...(status === 'running' ? {startedAt: extra.startedAt ?? now(), pausedAt: null, lastError: null} : {}),
  ...(status === 'paused' ? {pausedAt: extra.pausedAt ?? now()} : {}),
  ...(status === 'completed' || status === 'failed' || status === 'canceled' ? {finishedAt: extra.finishedAt ?? now()} : {}),
});

export const recordBatchRun = (batchId, run) => write((data) => {
  const batch = ensureBatch(data.batches[batchId]);
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  batch.runCount = Number(batch.runCount || 0) + 1;
  const terminal = ['completed', 'failed', 'canceled', 'waiting-human'].includes(run.status);
  const normalized = {
    schemaVersion: 'autovideo-batch-run/v1',
    runId: run.runId,
    stageId: run.stageId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? (terminal ? now() : null),
    status: run.status,
    plan: Array.isArray(run.plan) ? run.plan : [],
    errors: Array.isArray(run.errors) ? run.errors : [],
  };
  batch.lastRun = normalized;
  batch.lastRunErrors = normalized.errors;
  batch.runHistory = [...batch.runHistory, normalized].slice(-20);
  batch.updatedAt = now();
  return batch;
});

export const updateBatchRun = (batchId, runId, patch) => write((data) => {
  const batch = ensureBatch(data.batches[batchId]);
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  if (!batch.lastRun || batch.lastRun.runId !== runId) return batch;
  Object.assign(batch.lastRun, patch);
  const terminal = ['completed', 'failed', 'canceled', 'waiting-human'].includes(batch.lastRun.status);
  if (Object.hasOwn(patch, 'finishedAt')) {
    batch.lastRun.finishedAt = patch.finishedAt;
  } else {
    batch.lastRun.finishedAt = terminal ? batch.lastRun.finishedAt ?? now() : null;
  }
  batch.lastRunErrors = Array.isArray(batch.lastRun.errors) ? batch.lastRun.errors : [];
  batch.runHistory = batch.runHistory.map((item) => item.runId === runId ? {...batch.lastRun} : item);
  batch.updatedAt = now();
  return batch;
});

export const listBatchJobs = async (batch) => {
  const direct = await listJobRecords({batchId: batch.id, limit: 500});
  const directIds = new Set(direct.map((job) => job.id));
  const legacy = await Promise.all((batch.jobIds ?? [])
    .filter((jobId) => !directIds.has(jobId))
    .map((jobId) => getJobRecord(jobId)));
  return [...direct, ...legacy.filter(Boolean)].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

const latestVisualDecisionEvents = (project) => {
  const latest = new Map();
  for (const entry of project?.events ?? []) {
    if (entry.type !== 'visual-asset-candidate-decided') continue;
    const key = `${entry.candidateDigestSha256}:${entry.candidateId}`;
    const previous = latest.get(key);
    if (!previous || Number(entry.revision ?? 0) > Number(previous.revision ?? 0)) latest.set(key, entry);
  }
  return [...latest.values()];
};

const currentVisualDecisions = async (project) => {
  try {
    const receipt = JSON.parse(await fs.readFile(path.join(formalProjectRoot(project), 'review', 'visual-asset-feedback.json'), 'utf8'));
    if (receipt?.projectId !== project.id || !Array.isArray(receipt.decisions)) throw new Error('Visual feedback receipt is not project-bound.');
    return receipt.decisions;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return latestVisualDecisionEvents(project);
  }
};

export const summarizeActiveOverrides = (document = {}) => {
  const groups = new Map();
  for (const entry of document.overrides ?? []) {
    if (!['active', 'approved', 'applied'].includes(entry.status)) continue;
    const key = entry.groupId ?? entry.id;
    const group = groups.get(key) ?? {id: key, fields: new Set()};
    Object.keys(entry.locks ?? {}).forEach((field) => group.fields.add(field));
    groups.set(key, group);
  }
  const values = [...groups.values()];
  const hasAny = (group, fields) => fields.some((field) => group.fields.has(field));
  return {
    activeGroupCount: values.length,
    recipeGroupCount: values.filter((group) => hasAny(group, ['visualType', 'motionRecipeRefs'])).length,
    mediaGroupCount: values.filter((group) => hasAny(group, ['assetRefs', 'sfxRefs'])).length,
    textGroupCount: values.filter((group) => hasAny(group, ['text'])).length,
  };
};

const currentOverrideMetrics = async (project) => {
  try {
    const document = JSON.parse(await fs.readFile(path.join(formalProjectRoot(project), 'overrides', 'overrides.json'), 'utf8'));
    return summarizeActiveOverrides(document);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return summarizeActiveOverrides();
  }
};

export const batchMetrics = async (batchId) => {
  const batch = await getBatch(batchId);
  const jobs = await listBatchJobs(batch);
  const latestJobs = latestJobsByLogicalKey(jobs);
  const projects = await Promise.all(batch.projectIds.map(async (projectId) => {
    try { return await getProject(projectId); } catch { return null; }
  }));
  const completed = latestJobs.filter((job) => job.status === 'complete');
  const failed = latestJobs.filter((job) => ['failed', 'canceled'].includes(job.status));
  const active = latestJobs.filter((job) => ['queued', 'running', 'cancel-requested'].includes(job.status));
  const paused = latestJobs.filter((job) => job.status === 'paused');
  const projectReadiness = projects.filter(Boolean).map(summarizeProjectReadiness);
  const [visualDecisionGroups, overrideMetrics] = await Promise.all([
    Promise.all(projects.filter(Boolean).map(currentVisualDecisions)),
    Promise.all(projects.filter(Boolean).map(currentOverrideMetrics)),
  ]);
  const visualDecisions = visualDecisionGroups.flat();
  const durations = completed
    .map((job) => Date.parse(job.finishedAt) - Date.parse(job.startedAt))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const eventCount = (type, predicate = () => true) => projects.reduce(
    (sum, project) => sum + (project?.events ?? []).filter((entry) => entry.type === type && predicate(entry)).length,
    0,
  );
  return {
    batchId,
    status: batch.status,
    priority: batch.priority,
    totalProjects: batch.projectIds.length,
    totalJobs: jobs.length,
    latestJobCount: latestJobs.length,
    completedJobs: completed.length,
    failedJobs: failed.length,
    activeJobs: active.length,
    pausedJobs: paused.length,
    retryCount: jobs.reduce((sum, job) => sum + Math.max(0, Number(job.attempt || 1) - 1), 0),
    runCount: batch.runCount || 0,
    lastRun: batch.lastRun ?? null,
    averageDurationSeconds: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length / 1000).toFixed(2)) : null,
    manualOverrideCount: overrideMetrics.reduce((sum, item) => sum + item.activeGroupCount, 0),
    mediaAssetImportCount: eventCount('media-asset-imported'),
    visualCandidateDecisionCount: visualDecisions.length,
    visualCandidateAdoptionCount: visualDecisions.filter((entry) => entry.decision === 'adopted').length,
    visualCandidateRejectionCount: visualDecisions.filter((entry) => entry.decision === 'rejected').length,
    recipeOverrideCount: overrideMetrics.reduce((sum, item) => sum + item.recipeGroupCount, 0),
    mediaOverrideCount: overrideMetrics.reduce((sum, item) => sum + item.mediaGroupCount, 0),
    textOverrideCount: overrideMetrics.reduce((sum, item) => sum + item.textGroupCount, 0),
    stageCoverage: [...new Set(jobs.map((job) => job.stageId))],
    projectReadiness,
    readyForCompositionCount: projectReadiness.filter((item) => item.readyForComposition).length,
    readyForDeliveryCount: projectReadiness.filter((item) => item.readyForDelivery).length,
    blockedProjectCount: projectReadiness.filter((item) => !item.readyForDelivery).length,
  };
};

export {batchInputSchema, batchPath};
