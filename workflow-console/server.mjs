import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import express from 'express';
import PQueue from 'p-queue';
import crypto from 'node:crypto';
import {execa} from 'execa';
import {groups, stageAppliesToProject, toolRegistry, workflowStages} from './workflow-catalog.mjs';
import {approveWorkbenchContent, generateStage} from './lib/generators.mjs';
import {
  addCustomStage,
  adoptFormalProject,
  approveBoundTextReviewStage,
  approveFinalPreviewInternalReview,
  approveVoiceCandidatePromotion,
  approveFinalPreviewHumanReview,
  approveStage,
  createJobRecord,
  createProject,
  dataRoot,
  deleteProject,
  findCompositionRoot,
  formalProjectRoot,
  getJobRecord,
  getProject,
  hashDirectoryManifest,
  inspectFormalProjectForWorkbench,
  listJobRecords,
  listProjects,
  markStageFailed,
  markStageGenerated,
  markStageRunning,
  pauseQueuedJob,
  readArtifact,
  recoverInterruptedJobs,
  recordContentIntake,
  recordMediaAssetImport,
  recordMotionFeedbackChange,
  recordProductionOverrideChange,
  recordSemanticSfxReviewChange,
  recordTextReviewProgress,
  recordVisualAssetCandidateDecision,
  recordPreviewStarted,
  refreshFormalProjectEvidence,
  requestJobCancellation,
  removeCustomStage,
  reopenStage,
  resetProject,
  resolveExistingWorkspacePath,
  resolveWorkspacePath,
  saveManualArtifact,
  saveGraphLayoutPositions,
  saveArtifact,
  schemas,
  sha256File,
  updateJobRecord,
  updateProject,
  updateStage,
  upgradeFinalPreviewApproval,
  workspaceRoot,
} from './lib/project-store.mjs';
import {readGraphLayoutEditor} from './lib/graph-layout-editor.mjs';
import {
  readProductionOverrideEditor,
  revertProductionOverride,
  saveProductionOverride,
} from './lib/production-overrides.mjs';
import {
  buildVoiceCandidateReview,
  promoteVoiceCandidate,
  recoverInterruptedVoicePromotion,
  reopenVoiceCandidateReview,
  resolveVoiceCandidateMedia,
  saveVoiceCandidateReview,
  voiceCandidateReviewInputSchema,
} from './lib/voice-candidate-review.mjs';
import {
  approvePronunciationSelectionWithoutFullListening,
  approvePronunciationReview,
  buildPronunciationReview,
  pronunciationReviewInputSchema,
  pronunciationSelectionOverrideInputSchema,
  reopenPronunciationReview,
  resolvePronunciationProbeMedia,
  savePronunciationReview,
} from './lib/pronunciation-review.mjs';
import {
  assertFinalReviewReady,
  buildFinalReview,
  finalReviewInputSchema,
  saveFinalReview,
  simulateFinalReview,
} from './lib/final-review.mjs';
import {assertGenericApprovalAllowed} from './lib/approval-policy.mjs';
import {contentRouteForInput, freezeContentIntake} from './lib/content-intake.mjs';
import {buildReleaseCenter} from './lib/release-center.mjs';
import {resolveProjectMediaFile} from './lib/media-assets.mjs';
import {importAssetToProject, listAssetLibrary} from './lib/asset-library.mjs';
import {
  buildVisualAssetFeedback,
  buildVisualAssetLibraryMetrics,
  saveVisualAssetFeedback,
} from './lib/visual-asset-feedback.mjs';
import {
  addBatchJob,
  batchMetrics,
  createBatch,
  getBatch,
  listBatches,
  listBatchJobs,
  planNextHumanGate,
  setBatchStatus,
  recordBatchRun,
  updateBatchRun,
} from './lib/batch-store.mjs';
import {buildStageInputSnapshot, hashStageInput, hasFrozenSourceIdentity, jobIdempotencyKey, latestJobsByLogicalKey} from './lib/job-contract.mjs';
import {
  approveSemanticSfxReview,
  buildSemanticSfxReview,
  findCreatorDelegationReceipt,
  reopenSemanticSfxReview,
  saveSemanticSfxReview,
  simulateSemanticSfxReview,
} from './lib/semantic-sfx-review.mjs';
import {buildMotionFeedback, saveMotionFeedback} from './lib/motion-feedback.mjs';
import {
  resolveMotionProbeFile,
  saveMotionProbeReview,
} from './lib/motion-probe-review.mjs';
import {readMotionLibrarySnapshot} from './lib/motion-library-readiness.mjs';
import {
  acceptMotionProbeLifecycle,
  approveMotionRecipeForProject,
} from './lib/motion-lifecycle-actions.mjs';
import {
  approveScreenTextReview,
  approveSubtitleReview,
  buildScreenTextReview,
  buildSubtitleReview,
  reopenTextReview,
  resolveScreenTextReviewFrame,
  saveScreenTextReview,
  saveSubtitleReview,
  simulateScreenTextReview,
  simulateSubtitleReview,
} from './lib/text-review.mjs';
import {runScreenOcr} from '../tools/ocr/screen-ocr.mjs';
import {assertPublicationRightsCurrent} from './lib/rights-clearance.mjs';
import {auditAutoVideoMaturity} from './lib/maturity-audit.mjs';
import {
  buildScaleMetricsDraft,
  readInternalScaleSimulation,
  writeInternalScaleSimulation,
} from './lib/scale-metrics-draft.mjs';
import {
  CREATOR_DELEGATED_REVIEWER,
  INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
} from './lib/creator-delegation.mjs';
import {buildOneScreenReview, listOneScreenProjectSummaries, saveOneScreenReview} from './lib/one-screen-review.mjs';

const consoleRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(consoleRoot, 'dist');
const app = express();
const port = Number(process.env.AUTOVIDEO_CONSOLE_PORT || 3338);
const serverReceiptPath = process.env.AUTOVIDEO_CONSOLE_SERVER_RECEIPT
  ? path.resolve(process.env.AUTOVIDEO_CONSOLE_SERVER_RECEIPT)
  : path.join(consoleRoot, 'server.json');
const jobQueue = new PQueue({concurrency: 1});
const jobReservationQueue = new PQueue({concurrency: 1});
const testGeneratorFixture = String(process.env.AUTOVIDEO_TEST_GENERATOR_FIXTURE || '').trim();
const testGeneratorDelayMs = Math.min(5_000, Math.max(0, Number(process.env.AUTOVIDEO_TEST_GENERATOR_DELAY_MS || 0)));
const testGeneratorFailureStage = String(process.env.AUTOVIDEO_TEST_GENERATOR_FAILURE_STAGE || '').trim();
const readOnlyPreview = String(process.env.AUTOVIDEO_READ_ONLY_PREVIEW || '').trim().toLowerCase() === 'true';
let testGeneratorFailuresRemaining = Math.min(10, Math.max(0, Number(process.env.AUTOVIDEO_TEST_GENERATOR_FAILURE_COUNT || 0)));
if (testGeneratorFixture && process.env.NODE_ENV !== 'test') {
  throw new Error('AUTOVIDEO_TEST_GENERATOR_FIXTURE is allowed only when NODE_ENV=test.');
}
if ((testGeneratorFailureStage || testGeneratorFailuresRemaining) && (!testGeneratorFixture || process.env.NODE_ENV !== 'test')) {
  throw new Error('Test generator failure injection requires a NODE_ENV=test generator fixture.');
}
const generateStageForJob = testGeneratorFixture === 'deterministic-stage-artifact'
  ? async (projectId, stageId) => {
    if (testGeneratorDelayMs) await new Promise((resolve) => setTimeout(resolve, testGeneratorDelayMs));
    if (stageId === testGeneratorFailureStage && testGeneratorFailuresRemaining > 0) {
      testGeneratorFailuresRemaining -= 1;
      throw new Error(`Injected deterministic test failure for ${stageId}.`);
    }
    const artifactPath = await saveArtifact(projectId, stageId, `${stageId}.fixture.json`, {
      schemaVersion: 'autovideo-test-stage-fixture/v1',
      projectId,
      stageId,
      fixture: 'deterministic-stage-artifact',
    }, 'json');
    return {artifactPath, artifactKind: 'json', summary: `Generated deterministic test fixture for ${stageId}.`};
  }
  : generateStage;
const previewProcesses = new Map();
const HYPERFRAMES_VERSION = '0.7.77';
const SERVER_CAPABILITIES = [
  'audio-review-v1',
  'voice-candidate-review-v1',
  'pronunciation-review-v1',
  'final-review-v1',
  'production-overrides-v1',
  'production-override-provenance-v1',
  'content-prompt-chain-v1',
  'semantic-sfx-review-v1',
  'creator-delegated-semantic-sfx-review-v1',
  'media-preview-v1',
  'scoped-completion-status-v1',
  'single-writer-lock-v1',
  'persistent-job-queue-v1',
  'immutable-content-intake-v1',
  'release-center-v1',
  'asset-library-v1',
  'motion-feedback-v1',
  'motion-probe-review-v1',
  'motion-lifecycle-actions-v1',
  'motion-library-readiness-v1',
  'formal-project-adoption-v1',
  'formal-project-refresh-v1',
  'visual-asset-library-v1',
  'visual-asset-candidates-v1',
  'visual-asset-feedback-v1',
  'batch-readiness-summary-v1',
  'batch-idempotency-v1',
  'batch-next-human-gate-v1',
  'subtitle-qa-v1',
  'subtitle-human-review-v1',
  'creator-delegated-subtitle-review-v1',
  'screen-text-human-review-v1',
  'creator-delegated-screen-text-review-v1',
  'creator-delegated-final-preview-v1',
  'screen-ocr-v1',
  'visual-variety-qa-v1',
  'graph-layout-editor-v1',
  'maturity-audit-v1',
  'scale-metrics-draft-v1',
];
const documentationAllowlist = new Set([
  'README.md',
  'workflow-console/README.md',
  'docs/10-讲解视频规模化SOP.md',
  'docs/11-CosyVoice14与HyperFrames最终视频教程.md',
  'docs/15-工作台画面微调与Overrides.md',
  'docs/16-工作台快速操作手册.md',
  'tools/voice-lab/tutorials/08-final-voice-14.md',
  'hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md',
  'hyperframes-workflow-kit/VOICE_HANDOFF.md',
  'hyperframes-workflow-kit/prompts/00-继续项目.md',
  ...workflowStages.map((stage) => stage.tutorial).filter(Boolean),
].map((item) => item.replaceAll('\\', '/')));

const serverLockPath = path.join(dataRoot, 'server.lock');
let serverLockHandle = null;

const processIsRunning = (pid) => {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};

const acquireServerLock = async () => {
  await fs.mkdir(dataRoot, {recursive: true});
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      serverLockHandle = await fs.open(serverLockPath, 'wx');
      await serverLockHandle.writeFile(`${JSON.stringify({pid: process.pid, port, startedAt: new Date().toISOString()}, null, 2)}\n`, 'utf8');
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing = null;
      try {
        existing = JSON.parse(await fs.readFile(serverLockPath, 'utf8'));
      } catch {
        existing = null;
      }
      if (existing?.pid && processIsRunning(existing.pid)) {
        throw new Error(`AutoVideo workbench is already running with PID ${existing.pid} on port ${existing.port ?? 'unknown'}.`);
      }
      await fs.rm(serverLockPath, {force: true});
    }
  }
  throw new Error('Unable to acquire the AutoVideo workbench single-writer lock.');
};

const releaseServerLock = async () => {
  if (serverLockHandle) await serverLockHandle.close().catch(() => undefined);
  serverLockHandle = null;
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(serverLockPath, 'utf8'));
  } catch {
    existing = null;
  }
  if (!existing || existing.pid === process.pid) await fs.rm(serverLockPath, {force: true});
};

await acquireServerLock();
const recoveredJobs = await recoverInterruptedJobs();

app.use(express.json({limit: '3mb'}));
app.use((req, res, next) => {
  if (readOnlyPreview && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.status(423).json({ok: false, error: 'This workbench instance is a read-only preview.'});
    return;
  }
  next();
});

const asyncRoute = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

const publicCatalog = () => ({groups, tools: toolRegistry, stages: workflowStages});

const previewPortFor = (projectId) => 3400 + [...projectId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 300;

const waitForHttp = async (url, timeoutMs = 25_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('HyperFrames Studio did not become reachable in time.');
};

const assertDependenciesApproved = (project, stageId) => {
  const definitions = new Map([...workflowStages, ...Object.values(project.customStages)].map((stage) => [stage.id, stage]));
  const activeOrder = project.stageOrder.filter((id) => {
    const definition = definitions.get(id);
    return stageAppliesToProject(definition, project) && project.stages[id]?.enabled;
  });
  const index = activeOrder.indexOf(stageId);
  if (index < 0) throw new Error('This stage is not active for the selected input route.');
  const blocker = activeOrder.slice(0, index).find((id) => project.stages[id]?.status !== 'approved');
  if (blocker) {
    const definition = definitions.get(blocker);
    throw new Error(`Complete ${definition?.title ?? blocker} before running this stage.`);
  }
};

const integrationStatus = async () => {
  const checks = [
    ['cosyvoice14', 'tools/voice-lab/CosyVoice/run_zh_female_seed7.py'],
    ['voiceTutorial', 'docs/11-CosyVoice14与HyperFrames最终视频教程.md'],
    ['voiceHandoff', 'hyperframes-workflow-kit/VOICE_HANDOFF.md'],
    ['autoVideoHandoff', 'hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md'],
    ['hostTemplate', 'style-library/styles/project/modern-ip-host-explainer/USAGE.md'],
    ['hyperframesVendor', 'vendor/hyperframes'],
  ];
  const entries = await Promise.all(checks.map(async ([id, relativePath]) => {
    try {
      await fs.access(path.join(workspaceRoot, relativePath));
      return [id, {ready: true, path: relativePath}];
    } catch {
      return [id, {ready: false, path: relativePath}];
    }
  }));
  let codex = {ready: false, version: null};
  try {
    const {stdout} = await execa('codex.cmd', ['--version'], {cwd: workspaceRoot, timeout: 10_000, windowsHide: true});
    codex = {ready: true, version: stdout.trim()};
  } catch {
    // Report the missing adapter in the health response.
  }
  return {...Object.fromEntries(entries), codex};
};

let continueNextHumanGateBatch = null;

const refreshBatchStatus = async (batchId) => {
  if (!batchId) return;
  const batch = await getBatch(batchId).catch(() => null);
  if (!batch || batch.status === 'paused' || batch.status === 'canceled') return;
  const jobs = await listBatchJobs(batch);
  const latestJobs = latestJobsByLogicalKey(jobs);
  if (!latestJobs.length) return;
  const active = latestJobs.some((item) => ['queued', 'running', 'cancel-requested'].includes(item.status));
  if (batch.stageId === 'next-human-gate') {
    if (active) {
      if (batch.lastRun?.runId) await updateBatchRun(batchId, batch.lastRun.runId, {status: 'running'});
      return;
    }
    if (continueNextHumanGateBatch) {
      await continueNextHumanGateBatch(batchId, batch.lastRun?.runId);
      return;
    }
  }
  const jobErrors = latestJobs.filter((item) => ['failed', 'canceled'].includes(item.status)).map((item) => ({
    projectId: item.projectId,
    stageId: item.stageId,
    jobId: item.id,
    error: item.error || `Job ended as ${item.status}.`,
  }));
  const priorErrors = Array.isArray(batch.lastRun?.errors) ? batch.lastRun.errors : [];
  const errors = [...priorErrors, ...jobErrors].filter((item, index, list) => list.findIndex((candidate) =>
    candidate.projectId === item.projectId && candidate.stageId === item.stageId && candidate.error === item.error) === index);
  if (!active && !errors.length && latestJobs.every((item) => item.status === 'complete')) {
    await setBatchStatus(batchId, 'completed');
    if (batch.lastRun?.runId) await updateBatchRun(batchId, batch.lastRun.runId, {status: 'completed', errors: []});
  } else if (!active && errors.length) {
    await setBatchStatus(batchId, 'failed', {lastError: errors.map((item) => `${item.projectId}: ${item.error}`).join(' | '), lastRunErrors: errors});
    if (batch.lastRun?.runId) await updateBatchRun(batchId, batch.lastRun.runId, {status: 'failed', errors});
  } else if (batch.lastRun?.runId) {
    await updateBatchRun(batchId, batch.lastRun.runId, {status: 'running', errors});
  }
};

const scheduleGenerationJob = (job) => {
  void jobQueue.add(async () => {
    const queued = await getJobRecord(job.id);
    if (!queued || ['canceled', 'paused'].includes(queued.status)) return;
    if (queued.batchId) {
      const batch = await getBatch(queued.batchId).catch(() => null);
      if (batch?.status === 'paused') {
        await updateJobRecord(job.id, {status: 'paused', pausedAt: new Date().toISOString()});
        return;
      }
      if (batch?.status === 'canceled') {
        await updateJobRecord(job.id, {status: 'canceled', finishedAt: new Date().toISOString(), error: null});
        return;
      }
    }
    await updateJobRecord(job.id, {status: 'running', startedAt: new Date().toISOString()});
    try {
      const result = await generateStageForJob(job.projectId, job.stageId);
      const latest = await getJobRecord(job.id);
      if (latest?.status === 'cancel-requested') {
        const message = 'Generation finished after cancellation was requested; its output was not promoted.';
        await markStageFailed(job.projectId, job.stageId, message);
        await updateJobRecord(job.id, {status: 'canceled', finishedAt: new Date().toISOString(), error: null});
        await refreshBatchStatus(job.batchId);
        return;
      }
      const completedProject = await markStageGenerated(job.projectId, job.stageId, result);
      const outputSha256 = completedProject.stages[job.stageId]?.artifactSha256 ?? null;
      await updateJobRecord(job.id, {status: 'complete', finishedAt: new Date().toISOString(), outputSha256, result});
      await refreshBatchStatus(job.batchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = await getJobRecord(job.id);
      if (latest?.status === 'cancel-requested') {
        await markStageFailed(job.projectId, job.stageId, 'Generation canceled by the operator.');
        await updateJobRecord(job.id, {status: 'canceled', finishedAt: new Date().toISOString(), error: null});
        await refreshBatchStatus(job.batchId);
        return;
      }
      await markStageFailed(job.projectId, job.stageId, message);
      await updateJobRecord(job.id, {status: 'failed', finishedAt: new Date().toISOString(), error: message});
      await refreshBatchStatus(job.batchId);
    }
  }, {priority: Number(job.priority) || 0});
};

const startGenerationJob = (projectId, stageId, {retryOf = null, attempt = 1, batchId = null, priority = 0} = {}) => jobReservationQueue.add(async () => {
  const project = await getProject(projectId);
  const inputSnapshot = buildStageInputSnapshot(project, stageId);
  const inputSha256 = hashStageInput(inputSnapshot);
  const idempotencyKey = jobIdempotencyKey({projectId, stageId, inputSha256});
  const priorJobs = await listJobRecords({projectId, limit: 500});
  const sameInput = priorJobs
    .filter((item) => item.idempotencyKey === idempotencyKey)
    .sort((a, b) => Number(b.attempt || 1) - Number(a.attempt || 1));
  const active = sameInput.find((item) => ['queued', 'running', 'cancel-requested'].includes(item.status));
  if (active) return {...active, deduplicated: true};
  if (project.stages[stageId]?.status === 'running') {
    throw new Error('Stage is already running with a different input contract.');
  }
  const previous = sameInput[0];
  const completedReuseAllowed = stageId !== 'source-register' || hasFrozenSourceIdentity(project);
  if (completedReuseAllowed && previous?.status === 'complete' && project.stages[stageId]?.artifactPath && project.stages[stageId]?.artifactSha256) {
    try {
      const artifactPath = await resolveExistingWorkspacePath(project.stages[stageId].artifactPath);
      if (await sha256File(artifactPath) === project.stages[stageId].artifactSha256) {
        return {...previous, deduplicated: true};
      }
    } catch {
      // A missing or changed artifact must be regenerated, never silently reused.
    }
  }
  const nextAttempt = Math.max(Number(attempt || 1), Number(previous?.attempt || 0) + (previous && ['failed', 'canceled'].includes(previous.status) ? 1 : 0));
  const job = {
    id: crypto.randomUUID(),
    projectId,
    stageId,
    retryOf: retryOf || (previous && ['failed', 'canceled'].includes(previous.status) ? previous.id : null),
    attempt: nextAttempt,
    batchId,
    priority,
    inputSha256,
    inputSnapshot,
    idempotencyKey,
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
    outputSha256: null,
    result: null,
  };
  await createJobRecord(job);
  await markStageRunning(projectId, stageId, job.id);
  scheduleGenerationJob(job);
  return job;
});

continueNextHumanGateBatch = async (batchId, runId) => {
  const batch = await getBatch(batchId);
  if (batch.status === 'paused' || batch.status === 'canceled') return {batch, jobs: [], plan: [], errors: []};
  const previousJobs = await listBatchJobs(batch);
  const latestJobs = latestJobsByLogicalKey(previousJobs);
  const jobs = [];
  const plan = [];
  const errors = [];
  for (const projectId of batch.projectIds) {
    try {
      const project = await getProject(projectId);
      const action = planNextHumanGate(project);
      if (action.action === 'reuse') {
        const existing = action.jobId ? await getJobRecord(action.jobId) : null;
        if (!existing || !['queued', 'running', 'cancel-requested'].includes(existing.status)) {
          const error = `Stage ${action.stageId} reports ${project.stages[action.stageId]?.status || 'running'} without an active job receipt.`;
          errors.push({projectId, stageId: action.stageId, jobId: action.jobId ?? null, error});
          plan.push({...action, action: 'blocked', reason: error});
          continue;
        }
        await addBatchJob(batch.id, existing.id);
        jobs.push({...existing, deduplicated: true});
        plan.push({...action, jobId: existing.id});
        continue;
      }
      if (action.action !== 'queue') {
        plan.push(action);
        continue;
      }
      const currentInputSha256 = hashStageInput(buildStageInputSnapshot(project, action.stageId));
      const prior = latestJobs
        .filter((job) => job.projectId === projectId && job.stageId === action.stageId && job.inputSha256 === currentInputSha256)
        .sort((a, b) => Number(b.attempt || 1) - Number(a.attempt || 1))[0];
      if (prior?.status === 'failed' && Number(prior.attempt || 1) >= Number(batch.retryLimit || 2)) {
        const error = `Retry limit ${batch.retryLimit || 2} reached for ${action.stageId}.`;
        errors.push({projectId, stageId: action.stageId, jobId: prior.id, error});
        plan.push({...action, action: 'blocked', reason: error, jobId: prior.id});
        continue;
      }
      assertDependenciesApproved(project, action.stageId);
      const job = await startGenerationJob(projectId, action.stageId, {
        batchId: batch.id,
        priority: batch.priority,
        retryOf: prior?.status === 'failed' ? prior.id : null,
        attempt: prior?.status === 'failed' ? Number(prior.attempt || 1) + 1 : 1,
      });
      await addBatchJob(batch.id, job.id);
      jobs.push(job);
      plan.push({...action, action: job.deduplicated ? 'reuse' : 'queue', jobId: job.id, inputSha256: job.inputSha256 ?? null, idempotencyKey: job.idempotencyKey ?? null});
    } catch (error) {
      const detail = {projectId, stageId: null, error: error instanceof Error ? error.message : String(error)};
      errors.push(detail);
      plan.push({projectId, stageId: null, action: 'blocked', reason: detail.error, jobId: null});
    }
  }
  const current = await getBatch(batch.id);
  const mergedPlan = [...(current.lastRun?.plan ?? [])];
  for (const item of plan) {
    const key = `${item.projectId}:${item.stageId ?? ''}:${item.action}:${item.jobId ?? ''}`;
    if (!mergedPlan.some((entry) => `${entry.projectId}:${entry.stageId ?? ''}:${entry.action}:${entry.jobId ?? ''}` === key)) mergedPlan.push(item);
  }
  if (jobs.length) {
    await setBatchStatus(batch.id, 'running', {startedAt: batch.startedAt, lastRunErrors: errors});
    if (runId) await updateBatchRun(batch.id, runId, {status: 'running', plan: mergedPlan, errors});
  } else if (errors.length) {
    await setBatchStatus(batch.id, 'failed', {lastError: errors.map((item) => `${item.projectId}: ${item.error}`).join(' | '), lastRunErrors: errors});
    if (runId) await updateBatchRun(batch.id, runId, {status: 'failed', plan: mergedPlan, errors});
  } else {
    const waitsForHuman = plan.some((item) => item.action === 'wait-human');
    const status = waitsForHuman ? 'waiting-human' : 'completed';
    await setBatchStatus(batch.id, status, {lastRunErrors: []});
    if (runId) await updateBatchRun(batch.id, runId, {status, plan: mergedPlan, errors: []});
  }
  return {batch: await getBatch(batch.id), jobs, plan, errors};
};

for (const job of recoveredJobs.jobs) scheduleGenerationJob(job);

const syncFormalApproval = async (projectId, stageId, reviewer, approvalScope = null) => {
  const project = await getProject(projectId);
  const formalRoot = formalProjectRoot(project);
  if (stageId === 'content-approval') {
    await approveWorkbenchContent(project, reviewer);
  }
  if (stageId === 'style-probe') {
    const statePath = path.join(formalRoot, 'project-state.json');
    const selectionPath = path.join(formalRoot, 'style-selection.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    const selection = JSON.parse(await fs.readFile(selectionPath, 'utf8'));
    if (state.gates?.task?.status !== 'approved') {
      await execa('node', ['scripts/video-workflow.mjs', 'approve-task', '--project', projectId, '--reviewer', reviewer], {cwd: workspaceRoot, timeout: 60_000, windowsHide: true});
    }
    const args = [
      'scripts/video-workflow.mjs', 'approve-style', '--project', projectId, '--reviewer', reviewer,
      '--base', selection.baseStyleId, '--motion-rules', selection.motionRules.join(','),
    ];
    if (selection.framePreset) args.push('--frame', selection.framePreset);
    if (selection.addons?.length) args.push('--addons', selection.addons.join(','));
    if (selection.registryItems?.length) args.push('--registry-items', selection.registryItems.join(','));
    if (selection.blueprints?.length) args.push('--blueprints', selection.blueprints.join(','));
    await execa('node', args, {cwd: workspaceRoot, timeout: 60_000, windowsHide: true});
  }
  if (stageId === 'final-preview') {
    if (project.publicationRights === 'internal-only') {
      const statePath = path.join(formalRoot, 'project-state.json');
      const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
      const composition = await findCompositionRoot(formalRoot);
      const manifest = await hashDirectoryManifest(composition);
      const qaArtifact = await readArtifact(projectId, 'qa-review');
      const approvedAt = new Date().toISOString();
      state.gates.finalPreview = {
        status: 'approved-internal-only',
        approvedBy: reviewer,
        approvedAt,
        approvalScope: reviewer === 'codex-autonomous-internal-review'
          ? 'internal-autonomous-review'
          : 'human-review',
        publicReleaseBlocked: true,
        compositionDigest: manifest.digest,
        compositionFileCount: manifest.files.length,
        checkEvidence: qaArtifact?.path ?? null,
        notes: 'Internal review only. This does not represent user approval or public-release clearance.',
      };
      state.stage = 'internal-preview-approved';
      state.updatedAt = approvedAt;
      state.nextAction = 'Render an explicitly internal-review MP4, run delivery QA, and keep public release blocked.';
      await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      return;
    }
    if (project.publicationRights !== 'cleared') throw new Error('Final preview approval requires cleared or explicitly internal-only rights scope.');
    const qaArtifact = await readArtifact(projectId, 'qa-review');
    if (!qaArtifact) throw new Error('HyperFrames check evidence is missing.');
    await execa('node', [
      'scripts/video-workflow.mjs', 'approve-preview', '--project', projectId,
      '--reviewer', reviewer, '--check-evidence', resolveWorkspacePath(qaArtifact.path),
      '--notes', 'Approved from the AutoVideo workbench after Studio review.',
    ], {cwd: workspaceRoot, timeout: 60_000, windowsHide: true});
  }
};

const syncFormalFinalReviewApproval = async (project, reviewer, humanReview) => {
  const formalRoot = formalProjectRoot(project);
  const statePath = path.join(formalRoot, 'project-state.json');
  const previewPath = path.join(formalRoot, 'qa', 'final-preview.json');
  const [state, preview] = await Promise.all([
    fs.readFile(statePath, 'utf8').then(JSON.parse),
    fs.readFile(previewPath, 'utf8').then(JSON.parse),
  ]);
  if (preview.projectId !== project.id) throw new Error('Final preview receipt belongs to a different project.');
  const approvedAt = new Date().toISOString();
  const reviewReference = {
    path: path.relative(formalRoot, humanReview.path).replaceAll('\\', '/'),
    sha256: humanReview.sha256,
    previewReceiptSha256: humanReview.review.previewReceipt.sha256,
  };
  const publicReleaseBlocked = Boolean(
    preview.publicReleaseBlocked
      || state.gates?.finalPreview?.publicReleaseBlocked
      || project.publicationRights !== 'cleared',
  );

  preview.approvedBy = reviewer;
  preview.approvedAt = approvedAt;
  preview.status = 'approved';
  preview.approvalScope = 'human-review';
  preview.publicReleaseBlocked = publicReleaseBlocked;
  preview.humanReview = reviewReference;

  state.gates ??= {};
  state.gates.finalPreview = {
    ...(state.gates.finalPreview ?? {}),
    status: project.publicationRights === 'cleared' ? 'approved' : 'approved-internal-only',
    approvedBy: reviewer,
    approvedAt,
    approvalScope: 'human-review',
    publicReleaseBlocked,
    humanReview: reviewReference,
    notes: publicReleaseBlocked
      ? 'Human final review approved. Existing publication-rights restrictions remain in force.'
      : 'Human final review approved against the frozen composition and preview receipt.',
  };
  state.stage = project.publicationRights === 'cleared'
    ? 'preview-approved'
    : 'internal-preview-approved';
  state.updatedAt = approvedAt;

  await Promise.all([
    fs.writeFile(previewPath, `${JSON.stringify(preview, null, 2)}\n`, 'utf8'),
    fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'),
  ]);
  const artifactPath = await saveArtifact(project.id, 'final-preview', 'final-preview.json', preview, 'json');
  return {artifactPath, approvedAt, preview};
};

const syncFormalReopen = async (projectId, stageId, reason) => {
  const project = await getProject(projectId);
  const formalRoot = formalProjectRoot(project);
  await reopenTextReview({formalRoot, stageId});
  if (stageId === 'pronunciation-review') await reopenPronunciationReview({formalRoot});
  if (stageId === 'voice-final') await reopenVoiceCandidateReview({formalRoot});
  const statePath = path.join(formalRoot, 'project-state.json');
  let state;
  try {
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const reopenedAt = new Date().toISOString();
  let styleSelection = null;
  let styleSelectionPath = null;
  if (stageId === 'style-probe') {
    state.gates.style = {status: 'pending', approvedBy: null, approvedAt: null, reviewMode: 'still-and-motion-probe', invalidatedBy: reason};
    state.stage = state.gates?.task?.status === 'approved' ? 'style-review' : 'planning';
    styleSelectionPath = path.join(formalRoot, 'style-selection.json');
    try {
      styleSelection = JSON.parse(await fs.readFile(styleSelectionPath, 'utf8'));
      styleSelection.status = 'draft';
      styleSelection.approvedBy = null;
      styleSelection.notes = `Structure approval is preserved; visual quality requires review of the rendered probe. Reopened because: ${reason}`;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (['pronunciation-review', 'voice-final', 'audio-align', 'subtitle-qa', 'subtitle-review', 'rights-clearance', 'audio-handoff'].includes(stageId) && state.handoffs?.audio) {
    state.handoffs.audio.status = 'pending';
    state.handoffs.audio.rightsStatus = 'needs-review';
  }
  if (['template-lock', 'pronunciation-review', 'style-probe', 'visual-variety-qa', 'voice-final', 'audio-align', 'subtitle-qa', 'subtitle-review', 'rights-clearance', 'audio-handoff', 'composition-readiness', 'full-production', 'qa-review', 'screen-text-review', 'final-preview'].includes(stageId)) {
    state.gates.finalPreview = {status: 'pending', approvedBy: null, approvedAt: null, invalidatedBy: reason};
  }
  state.updatedAt = reopenedAt;
  state.nextAction = stageId === 'style-probe'
    ? 'Review the rendered stills and motion probe; approve visual quality before full production.'
    : `Workbench reopened ${stageId}: ${reason}`;
  await Promise.all([
    fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'),
    styleSelection && styleSelectionPath
      ? fs.writeFile(styleSelectionPath, `${JSON.stringify(styleSelection, null, 2)}\n`, 'utf8')
      : Promise.resolve(),
  ]);
};

const currentCompositionBinding = async (project) => {
  const formalRoot = formalProjectRoot(project);
  const compositionRoot = await findCompositionRoot(formalRoot);
  const manifest = await hashDirectoryManifest(compositionRoot);
  return {
    path: path.relative(formalRoot, compositionRoot).replaceAll('\\', '/'),
    digest: manifest.digest,
    fileCount: manifest.files.length,
  };
};

app.get('/api/health', asyncRoute(async (_req, res) => {
  res.json({ok: true, version: '0.3.4', capabilities: SERVER_CAPABILITIES, workspaceRoot, readOnlyPreview, queue: {size: jobQueue.size, pending: jobQueue.pending}, integrations: await integrationStatus()});
}));

app.get('/api/catalog', (_req, res) => res.json(publicCatalog()));

app.get('/api/maturity', asyncRoute(async (_req, res) => {
  const maturity = await auditAutoVideoMaturity({workspaceRoot, workbenchDataRoot: dataRoot});
  res.json({maturity});
}));

app.get('/api/projects/:projectId/scale-metrics', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const [draft, simulation] = await Promise.all([
    buildScaleMetricsDraft({workspaceRoot, workbenchDataRoot: dataRoot, projectId: project.id}),
    readInternalScaleSimulation({workspaceRoot, workbenchDataRoot: dataRoot, projectId: project.id}),
  ]);
  res.json({draft, simulation});
}));

app.post('/api/projects/:projectId/scale-metrics/simulate', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const result = await writeInternalScaleSimulation({workspaceRoot, workbenchDataRoot: dataRoot, projectId: project.id});
  res.json(result);
}));

app.get('/api/library/assets', asyncRoute(async (req, res) => {
  const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
  res.json({assets: await listAssetLibrary({type})});
}));

app.get('/api/projects/:projectId/visual-asset-candidates', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  res.json({candidates: await buildVisualAssetFeedback({
    workspaceRoot,
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
  })});
}));

app.get('/api/library/visual-asset-metrics', asyncRoute(async (_req, res) => {
  res.json({metrics: await buildVisualAssetLibraryMetrics({workspaceRoot})});
}));

app.post('/api/projects/:projectId/visual-asset-candidates/:candidateId/decision', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const decisionInput = {
    candidateDigestSha256: req.body?.candidateDigestSha256,
    candidateId: req.params.candidateId,
    decision: req.body?.decision,
    note: req.body?.note ?? '',
  };
  const formalRoot = formalProjectRoot(project);
  const preflight = await buildVisualAssetFeedback({workspaceRoot, formalRoot, projectId: project.id});
  if (!preflight.available || decisionInput.candidateDigestSha256 !== preflight.plan.candidateDigestSha256) {
    throw new Error('Visual asset candidates changed after this page loaded. Reload before saving a decision.');
  }
  const candidate = preflight.plan.candidates.find((item) => item.id === req.params.candidateId);
  if (!candidate) throw new Error(`Unknown visual asset candidate: ${req.params.candidateId}`);
  let importResult = null;
  let editor = null;
  let updatedProject = project;
  if (decisionInput.decision === 'adopted') {
    // Import first so a failed media transaction cannot leave a false "adopted" receipt.
    importResult = await importAssetToProject({projectRoot: formalRoot, assetId: candidate.assetId});
  }
  const candidates = await saveVisualAssetFeedback({
    workspaceRoot,
    formalRoot,
    projectId: project.id,
    input: decisionInput,
    reviewer,
  });
  const currentDecision = candidates.decisions.find((item) => item.candidateId === req.params.candidateId);
  if (importResult) {
    updatedProject = await recordMediaAssetImport(project.id, {
      assetId: importResult.projectAssetId,
      reused: importResult.reused,
      origin: 'semantic-candidate',
      candidateId: candidate.id,
      candidateDigestSha256: candidates.plan.candidateDigestSha256,
    });
    editor = await readProductionOverrideEditor({projectRoot: formalRoot, projectId: project.id});
  }
  updatedProject = await recordVisualAssetCandidateDecision(project.id, {
    candidateId: candidate.id,
    assetId: candidate.assetId,
    decision: decisionInput.decision,
    candidateDigestSha256: candidates.plan.candidateDigestSha256,
    revision: currentDecision.revision,
  });
  res.json({
    candidates,
    project: updatedProject,
    editor,
    importResult,
    projectAssetId: importResult?.projectAssetId ?? null,
  });
}));

app.get('/api/projects/:projectId/motion-feedback', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const feedback = await buildMotionFeedback({
    workspaceRoot,
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
  });
  res.json({feedback});
}));

app.put('/api/projects/:projectId/motion-feedback', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages.retrospective?.status === 'running') {
    throw new Error('Wait for retrospective generation to finish before saving motion feedback.');
  }
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const feedback = await saveMotionFeedback({
    workspaceRoot,
    formalRoot: formalProjectRoot(current),
    projectId: current.id,
    input: req.body,
    reviewer,
  });
  const project = await recordMotionFeedbackChange(current.id, {
    usageKey: feedback.sourceUsage.usageKey,
    revision: feedback.review.revision,
    overallVerdict: feedback.review.overallVerdict,
  });
  res.json({project, feedback});
}));

app.get('/api/motion-library/probes', asyncRoute(async (_req, res) => {
  res.json(await readMotionLibrarySnapshot({workspaceRoot}));
}));

app.put('/api/motion-library/probes/:probeId/review', asyncRoute(async (req, res) => {
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const result = await saveMotionProbeReview({
    workspaceRoot,
    input: {...req.body, probeId: req.params.probeId},
    reviewer,
  });
  res.json({...result, ...await readMotionLibrarySnapshot({workspaceRoot})});
}));

app.post('/api/motion-library/probes/:probeId/accept', asyncRoute(async (req, res) => {
  const actor = String(req.body?.actor || req.body?.reviewer || 'user').slice(0, 100);
  const accepted = await acceptMotionProbeLifecycle({
    workspaceRoot,
    probeId: req.params.probeId,
    actor,
  });
  res.json({accepted, ...await readMotionLibrarySnapshot({workspaceRoot})});
}));

app.post('/api/projects/:projectId/motion-recipes/:recipeId/approve', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const actor = String(req.body?.actor || reviewer).slice(0, 100);
  const approval = await approveMotionRecipeForProject({
    workspaceRoot,
    projectId: project.id,
    projectRoot: formalProjectRoot(project),
    recipeId: req.params.recipeId,
    reviewer,
    actor,
    probeReceiptPath: req.body?.probeReceiptPath ? String(req.body.probeReceiptPath) : null,
  });
  res.json({approval, ...await readMotionLibrarySnapshot({workspaceRoot})});
}));

app.get('/api/motion-library/probes/:probeId/file', asyncRoute(async (req, res) => {
  const resolved = await resolveMotionProbeFile({
    workspaceRoot,
    probeId: req.params.probeId,
    relativePath: String(req.query.path || ''),
  });
  res.set('Cache-Control', 'private, no-store');
  res.type(path.extname(resolved.target)).sendFile(resolved.target);
}));

app.get('/api/batches', asyncRoute(async (_req, res) => {
  const batches = await listBatches();
  const enriched = await Promise.all(batches.map(async (batch) => ({...batch, metrics: await batchMetrics(batch.id)})));
  res.json({batches: enriched});
}));

app.post('/api/batches', asyncRoute(async (req, res) => {
  const batch = await createBatch(req.body || {});
  res.status(201).json({batch, metrics: await batchMetrics(batch.id)});
}));

app.get('/api/batches/:batchId', asyncRoute(async (req, res) => {
  const batch = await getBatch(req.params.batchId);
  res.json({batch, metrics: await batchMetrics(batch.id)});
}));

app.post('/api/batches/:batchId/run', asyncRoute(async (req, res) => {
  const batch = await getBatch(req.params.batchId);
  if (['running', 'completed', 'canceled'].includes(batch.status)) throw new Error(`Batch is already ${batch.status}.`);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await setBatchStatus(batch.id, 'running', {lastRunErrors: []});
  if (batch.stageId === 'next-human-gate') {
    await recordBatchRun(batch.id, {runId, stageId: batch.stageId, startedAt, status: 'running', plan: [], errors: []});
    const result = await continueNextHumanGateBatch(batch.id, runId);
    return res.json({batch: result.batch, jobs: result.jobs, errors: result.errors, metrics: await batchMetrics(batch.id)});
  }
  const jobs = [];
  const errors = [];
  const plan = [];
  for (const projectId of batch.projectIds) {
    try {
      const project = await getProject(projectId);
      const autoPlan = batch.stageId === 'next-human-gate' ? planNextHumanGate(project) : null;
      if (autoPlan?.action === 'complete' || autoPlan?.action === 'wait-human' || autoPlan?.action === 'reuse') {
        plan.push(autoPlan);
        continue;
      }
      if (autoPlan?.action === 'blocked') throw new Error(autoPlan.reason);
      const targetStageId = autoPlan?.stageId ?? batch.stageId;
      assertDependenciesApproved(project, targetStageId);
      const stage = project.stages[targetStageId];
      const approvedReuseAllowed = targetStageId !== 'source-register' || hasFrozenSourceIdentity(project);
      if (approvedReuseAllowed && stage?.status === 'approved' && stage.artifactSha256) {
        plan.push({projectId, stageId: targetStageId, action: 'skip', reason: 'current stage already approved', jobId: null});
        continue;
      }
      const job = await startGenerationJob(projectId, targetStageId, {batchId: batch.id, priority: batch.priority});
      await addBatchJob(batch.id, job.id);
      jobs.push(job);
      plan.push({projectId, stageId: targetStageId, action: job.deduplicated ? 'reuse' : 'queue', reason: job.deduplicated ? 'same input idempotency key' : autoPlan?.reason ?? null, jobId: job.id, inputSha256: job.inputSha256 ?? null, idempotencyKey: job.idempotencyKey ?? null});
    } catch (error) {
      const detail = {projectId, stageId: batch.stageId, error: error instanceof Error ? error.message : String(error)};
      errors.push(detail);
      plan.push({projectId, stageId: batch.stageId, action: 'blocked', reason: detail.error, jobId: null});
    }
  }
  const hasNonErrorTerminal = plan.some((item) => ['skip', 'reuse', 'complete', 'wait-human'].includes(item.action));
  await recordBatchRun(batch.id, {runId, stageId: batch.stageId, startedAt, status: jobs.length || hasNonErrorTerminal ? 'running' : 'failed', plan, errors});
  if (!jobs.length) {
    if (!errors.length) {
      const waitsForHuman = plan.some((item) => item.action === 'wait-human');
      const status = waitsForHuman ? 'waiting-human' : 'completed';
      await setBatchStatus(batch.id, status);
      await updateBatchRun(batch.id, runId, {status, errors: []});
    } else {
      await setBatchStatus(batch.id, 'failed', {lastError: errors.map((item) => `${item.projectId}: ${item.error}`).join(' | '), lastRunErrors: errors});
      await updateBatchRun(batch.id, runId, {status: 'failed', errors});
    }
  }
  if (jobs.length) await refreshBatchStatus(batch.id);
  const updated = await getBatch(batch.id);
  res.json({batch: updated, jobs, errors, metrics: await batchMetrics(batch.id)});
}));

app.post('/api/batches/:batchId/pause', asyncRoute(async (req, res) => {
  const batch = await getBatch(req.params.batchId);
  if (['completed', 'failed', 'canceled'].includes(batch.status)) throw new Error(`Batch is already ${batch.status}.`);
  const queued = (await listBatchJobs(batch)).filter((job) => job.status === 'queued');
  for (const job of queued) await pauseQueuedJob(job.id);
  const updated = await setBatchStatus(batch.id, 'paused');
  res.json({batch: updated, metrics: await batchMetrics(batch.id)});
}));

app.post('/api/batches/:batchId/resume', asyncRoute(async (req, res) => {
  const batch = await getBatch(req.params.batchId);
  if (batch.status !== 'paused') throw new Error('Only paused batches can be resumed.');
  await setBatchStatus(batch.id, 'running');
  const paused = (await listBatchJobs(batch)).filter((job) => job.status === 'paused');
  for (const job of paused) {
    await markStageRunning(job.projectId, job.stageId, job.id);
    await updateJobRecord(job.id, {status: 'queued', pausedAt: null, error: null});
    scheduleGenerationJob({...job, status: 'queued'});
  }
  const updated = await getBatch(batch.id);
  res.json({batch: updated, metrics: await batchMetrics(batch.id)});
}));

app.get('/api/projects', asyncRoute(async (_req, res) => res.json({projects: await listProjects()})));

app.get('/api/one-screen/projects', asyncRoute(async (_req, res) => {
  const candidates = await listProjects();
  const projects = await listOneScreenProjectSummaries({candidates, getProject, formalRootFor: formalProjectRoot});
  res.json({projects});
}));

app.get('/api/one-screen/projects/:projectId', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const view = await buildOneScreenReview({project, formalRoot: formalProjectRoot(project)});
  if (!view) return res.status(404).json({error: 'One-screen MVP build not found.'});
  res.json({project: view});
}));

app.post('/api/one-screen/projects/:projectId/review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const review = await saveOneScreenReview({project, formalRoot: formalProjectRoot(project), input: req.body});
  res.json({review});
}));

app.get('/api/formal-projects/inspect', asyncRoute(async (req, res) => {
  const formalProjectPath = String(req.query.path || '').trim();
  if (!formalProjectPath) throw new Error('A formal project path is required.');
  res.json({adoption: await inspectFormalProjectForWorkbench({formalProjectPath})});
}));

app.post('/api/formal-projects/adopt', asyncRoute(async (req, res) => {
  const formalProjectPath = String(req.body?.formalProjectPath || '').trim();
  if (!formalProjectPath) throw new Error('A formal project path is required.');
  const project = await adoptFormalProject({formalProjectPath});
  res.status(201).json({project});
}));

app.post('/api/projects/:projectId/formal-project/refresh', asyncRoute(async (req, res) => {
  const result = await refreshFormalProjectEvidence(req.params.projectId);
  res.json(result);
}));

app.post('/api/projects', asyncRoute(async (req, res) => {
  const intakeInput = req.body?.intake ?? null;
  if (!intakeInput) {
    const project = await createProject(schemas.projectInputSchema.parse(req.body));
    return res.status(201).json({project});
  }
  const route = contentRouteForInput(intakeInput);
  if (!route) throw new Error('Unsupported content intake type.');
  const parsed = schemas.projectInputSchema.parse({
    ...req.body,
    route,
    sourcePath: `pending-content-intake:${intakeInput.type}`,
  });
  await createProject(parsed);
  try {
    const result = await freezeContentIntake({
      workspaceRoot,
      projectRoot: path.join(workspaceRoot, 'content', 'workbench-intakes', parsed.id),
      projectId: parsed.id,
      input: intakeInput,
    });
    const project = await recordContentIntake(parsed.id, result.receipt);
    return res.status(201).json({project, contentIntake: result});
  } catch (error) {
    await deleteProject(parsed.id).catch(() => undefined);
    throw error;
  }
}));

app.get('/api/projects/:projectId', asyncRoute(async (req, res) => res.json({project: await getProject(req.params.projectId)})));

app.get('/api/projects/:projectId/release-center', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const releaseCenter = await buildReleaseCenter({project, formalRoot: formalProjectRoot(project)});
  res.json({releaseCenter});
}));

app.get('/api/projects/:projectId/deliverables/file', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const formalRoot = formalProjectRoot(project);
  const relativePath = String(req.query.path || '');
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('A project-relative deliverable path is required.');
  const target = path.resolve(formalRoot, relativePath);
  const relative = path.relative(formalRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Deliverable path leaves the formal project.');
  const realRoot = await fs.realpath(formalRoot);
  const realTarget = await fs.realpath(target);
  const realRelative = path.relative(realRoot, realTarget);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('Resolved deliverable path leaves the formal project.');
  const allowed = new Set(['.mp4', '.png', '.jpg', '.jpeg', '.webp', '.srt', '.json', '.md', '.zip']);
  if (!allowed.has(path.extname(realTarget).toLowerCase())) throw new Error('This deliverable file type is not exposed by the workbench.');
  if (req.query.download === '1') res.attachment(path.basename(realTarget));
  res.sendFile(realTarget);
}));

app.post('/api/projects/:projectId/content-intakes', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (Object.values(current.stages).some((stage) => stage.status === 'running')) {
    throw new Error('A new content intake cannot be registered while a stage is running.');
  }
  const result = await freezeContentIntake({
    workspaceRoot,
    projectRoot: path.join(workspaceRoot, 'content', 'workbench-intakes', current.id),
    projectId: current.id,
    input: req.body,
  });
  const project = await recordContentIntake(current.id, result.receipt);
  res.status(201).json({project, contentIntake: result});
}));

app.get('/api/projects/:projectId/audio-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  await recoverInterruptedVoicePromotion({formalRoot: formalProjectRoot(project), stage: project.stages['voice-final']});
  res.json({audioReview: await buildVoiceCandidateReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.get('/api/projects/:projectId/pronunciation-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  res.json({pronunciationReview: await buildPronunciationReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.put('/api/projects/:projectId/pronunciation-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const review = await savePronunciationReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['pronunciation-review'],
    rawInput: pronunciationReviewInputSchema.parse(req.body),
    reviewer,
  });
  const reviewPath = path.join(formalProjectRoot(project), 'qa', 'pronunciation-human-review.json');
  const updatedProject = await recordTextReviewProgress(project.id, 'pronunciation-review', {
    artifactPath: reviewPath,
    artifactSha256: await sha256File(reviewPath),
    summary: `Saved pronunciation review progress for ${review.terms.filter((item) => item.decision === 'accepted').length}/${review.terms.length} term(s).`,
  });
  res.json({project: updatedProject, pronunciationReview: await buildPronunciationReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.post('/api/projects/:projectId/pronunciation-review/approve', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  await savePronunciationReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['pronunciation-review'],
    rawInput: pronunciationReviewInputSchema.parse(req.body),
    reviewer,
  });
  const receipt = await approvePronunciationReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['pronunciation-review'],
    reviewer,
  });
  const updatedProject = await approveBoundTextReviewStage(project.id, 'pronunciation-review', reviewer, {
    artifactPath: receipt.path,
    artifactSha256: receipt.sha256,
    approvedAt: receipt.approval.approvedAt,
  });
  res.json({project: updatedProject, pronunciationReview: await buildPronunciationReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.post('/api/projects/:projectId/pronunciation-review/approve-selection', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const receipt = await approvePronunciationSelectionWithoutFullListening({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['pronunciation-review'],
    rawInput: pronunciationSelectionOverrideInputSchema.parse(req.body),
    reviewer,
  });
  const updatedProject = await approveBoundTextReviewStage(project.id, 'pronunciation-review', reviewer, {
    artifactPath: receipt.path,
    artifactSha256: receipt.sha256,
    approvedAt: receipt.approval.approvedAt,
    approvalScope: 'user-directed-selection-no-listening',
  });
  res.json({project: updatedProject, pronunciationReview: await buildPronunciationReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.get('/api/projects/:projectId/pronunciation-review/media/:candidateId', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const target = await resolvePronunciationProbeMedia({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    candidateId: req.params.candidateId,
  });
  await fs.access(target);
  res.type('audio/wav').sendFile(target);
}));

app.put('/api/projects/:projectId/audio-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const review = await saveVoiceCandidateReview({
    formalRoot: formalProjectRoot(project), projectId: project.id,
    stage: project.stages['voice-final'], rawInput: voiceCandidateReviewInputSchema.parse(req.body), reviewer,
  });
  res.json({review, audioReview: await buildVoiceCandidateReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.post('/api/projects/:projectId/audio-review/approve', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  await saveVoiceCandidateReview({
    formalRoot: formalProjectRoot(project), projectId: project.id,
    stage: project.stages['voice-final'], rawInput: voiceCandidateReviewInputSchema.parse(req.body), reviewer,
  });
  const receipt = await promoteVoiceCandidate({
    formalRoot: formalProjectRoot(project), projectId: project.id,
    stage: project.stages['voice-final'], reviewer,
    commitState: (binding) => approveVoiceCandidatePromotion(project.id, reviewer, {
      ...binding,
      artifactPath: path.relative(workspaceRoot, binding.artifactPath).replaceAll('\\', '/'),
    }),
  });
  const updatedProject = receipt.stateResult;
  res.json({project: updatedProject, audioReview: await buildVoiceCandidateReview({formalRoot: formalProjectRoot(updatedProject), projectId: updatedProject.id})});
}));

app.post('/api/projects/:projectId/audio-review/simulate', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (project.publicationRights === 'cleared') {
    throw new Error('Creator-delegated voice simulation is internal-only and cannot run for a public-cleared project.');
  }
  const reviewer = String(req.body?.reviewer || 'codex-internal-simulation').slice(0, 100);
  const receipt = await promoteVoiceCandidate({
    formalRoot: formalProjectRoot(project), projectId: project.id,
    stage: project.stages['voice-final'], reviewer,
    simulation: {
      mode: 'creator-delegated-internal-only',
      selectedCandidateId: req.body?.selectedCandidateId,
      delegationReceipt: req.body?.delegationReceipt,
      reason: req.body?.reason,
    },
    commitState: (binding) => approveVoiceCandidatePromotion(project.id, reviewer, {
      ...binding,
      artifactPath: path.relative(workspaceRoot, binding.artifactPath).replaceAll('\\', '/'),
    }),
  });
  const updatedProject = receipt.stateResult;
  res.json({project: updatedProject, audioReview: await buildVoiceCandidateReview({formalRoot: formalProjectRoot(updatedProject), projectId: updatedProject.id})});
}));

app.get('/api/projects/:projectId/subtitle-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  res.json({subtitleReview: await buildSubtitleReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.put('/api/projects/:projectId/subtitle-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const review = await saveSubtitleReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['subtitle-review'],
    rawInput: req.body,
    reviewer,
  });
  const reviewPath = path.join(formalProjectRoot(project), 'qa', 'subtitle-human-review.json');
  const updatedProject = await recordTextReviewProgress(project.id, 'subtitle-review', {
    artifactPath: reviewPath,
    artifactSha256: await sha256File(reviewPath),
    summary: `Saved subtitle review progress for ${review.cues.filter((item) => item.decision === 'accepted').length}/${review.cues.length} cue(s).`,
  });
  res.json({project: updatedProject, subtitleReview: await buildSubtitleReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.post('/api/projects/:projectId/subtitle-review/approve', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  await saveSubtitleReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['subtitle-review'],
    rawInput: req.body,
    reviewer,
  });
  const receipt = await approveSubtitleReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['subtitle-review'],
    reviewer,
  });
  const updatedProject = await approveBoundTextReviewStage(project.id, 'subtitle-review', reviewer, {
    artifactPath: receipt.path,
    artifactSha256: receipt.sha256,
    approvedAt: receipt.approval.approvedAt,
  });
  res.json({project: updatedProject, subtitleReview: await buildSubtitleReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.post('/api/projects/:projectId/subtitle-review/simulate', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (project.publicationRights !== 'internal-only') {
    throw new Error('Creator-delegated subtitle simulation requires an explicit internal-only project.');
  }
  const receipt = await simulateSubtitleReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    stage: project.stages['subtitle-review'],
    delegationReceipt: req.body?.delegationReceipt,
    reason: req.body?.reason,
  });
  const updatedProject = await approveBoundTextReviewStage(project.id, 'subtitle-review', CREATOR_DELEGATED_REVIEWER, {
    artifactPath: receipt.path,
    artifactSha256: receipt.sha256,
    approvedAt: receipt.approval.approvedAt,
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    delegatedSimulation: {
      mode: 'creator-delegated-internal-only',
      receiptPath: receipt.approval.delegation.path,
      receiptSha256: receipt.approval.delegation.sha256,
    },
  });
  res.json({project: updatedProject, subtitleReview: await buildSubtitleReview({formalRoot: formalProjectRoot(project), projectId: project.id})});
}));

app.get('/api/projects/:projectId/audio-review/media/:mediaId', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const target = await resolveVoiceCandidateMedia({
    formalRoot: formalProjectRoot(project), projectId: project.id, candidateId: req.params.mediaId,
  });
  await fs.access(target);
  res.type('audio/wav').sendFile(target);
}));

app.get('/api/projects/:projectId/voice-candidate-review/media/:candidateId', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const target = await resolveVoiceCandidateMedia({
    formalRoot: formalProjectRoot(project), projectId: project.id, candidateId: req.params.candidateId,
  });
  await fs.access(target);
  res.type('audio/wav').sendFile(target);
}));

app.get('/api/projects/:projectId/media-assets/:assetId/file', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const asset = await resolveProjectMediaFile({
    projectRoot: formalProjectRoot(project),
    projectId: project.id,
    assetId: req.params.assetId,
  });
  res.set('Cache-Control', 'private, no-store');
  res.set('ETag', `"sha256-${asset.sha256}"`);
  if (asset.mime === 'image/svg+xml') {
    res.set('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  }
  res.type(asset.mime).sendFile(asset.absolutePath, {dotfiles: 'allow'});
}));

app.post('/api/projects/:projectId/media-assets/import', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId.trim() : '';
  if (!assetId) throw new Error('assetId is required.');
  const result = await importAssetToProject({projectRoot: formalProjectRoot(project), assetId});
  const updatedProject = await recordMediaAssetImport(project.id, {assetId: result.projectAssetId, reused: result.reused});
  const editor = await readProductionOverrideEditor({projectRoot: formalProjectRoot(project), projectId: project.id});
  res.json({ok: true, ...result, project: updatedProject, editor});
}));

app.get('/api/projects/:projectId/final-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  res.json({finalReview: await buildFinalReview(project)});
}));

app.put('/api/projects/:projectId/final-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  await saveFinalReview(project, finalReviewInputSchema.parse(req.body), reviewer);
  res.json({finalReview: await buildFinalReview(project)});
}));

app.post('/api/projects/:projectId/final-review/approve', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  await saveFinalReview(project, finalReviewInputSchema.parse(req.body), reviewer);
  const humanReview = await assertFinalReviewReady(project);
  const formalApproval = await syncFormalFinalReviewApproval(project, reviewer, humanReview);
  const updatedProject = project.stages['final-preview']?.status === 'needs-review'
    ? await approveFinalPreviewHumanReview(project.id, reviewer, formalApproval)
    : await upgradeFinalPreviewApproval(project.id, reviewer);
  res.json({
    project: updatedProject,
    finalReview: await buildFinalReview(updatedProject),
  });
}));

app.post('/api/projects/:projectId/final-review/simulate', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const receipt = await simulateFinalReview(project, {
    delegationReceipt: req.body?.delegationReceipt,
    reason: req.body?.reason,
  });
  const updatedProject = await approveFinalPreviewInternalReview(project.id, {
    artifactPath: path.relative(workspaceRoot, receipt.path).replaceAll('\\', '/'),
    artifactSha256: receipt.sha256,
    approvedAt: receipt.preview.approvedAt,
    delegatedSimulation: {
      mode: 'creator-delegated-internal-only',
      receiptPath: receipt.preview.delegation.path,
      receiptSha256: receipt.preview.delegation.sha256,
    },
  });
  res.json({
    project: updatedProject,
    finalReview: await buildFinalReview(updatedProject),
  });
}));

app.get('/api/projects/:projectId/screen-text-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const stage = project.stages['screen-text-review'];
  if (!['needs-review', 'approved'].includes(stage?.status)) {
    const blockers = [];
    if (project.stages['subtitle-review']?.status !== 'approved') {
      blockers.push({
        code: 'subtitle-human-review',
        label: '字幕语义人工审校未批准',
        action: '先逐条审校并批准当前 NarrationLock 对应的字幕。',
      });
    }
    if (project.stages['qa-review']?.status !== 'approved') {
      blockers.push({
        code: 'hyperframes-qa',
        label: 'HyperFrames 成片检查未批准',
        action: '完成全片编译并通过独立的结构、动效和画面检查。',
      });
    }
    blockers.push({
      code: 'screen-review-package',
      label: '逐帧复核包尚未生成',
      action: '上游门禁通过后运行本步骤，生成绑定成片哈希的逐帧审查包。',
    });
    return res.json({
      screenTextReview: {
        schemaVersion: 'autovideo-screen-text-review-view/v1',
        projectId: project.id,
        available: false,
        status: 'blocked',
        summary: '这是生产门禁阻塞，不是服务器故障；工作台不会提前声称屏幕文字已经复核。',
        blockers,
      },
    });
  }
  const composition = await currentCompositionBinding(project);
  res.json({screenTextReview: {available: true, ...await buildScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
  })}});
}));

app.put('/api/projects/:projectId/screen-text-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const composition = await currentCompositionBinding(project);
  const review = await saveScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
    stage: project.stages['screen-text-review'],
    rawInput: req.body,
    reviewer,
  });
  const reviewPath = path.join(formalProjectRoot(project), 'qa', 'screen-text-human-review.json');
  const updatedProject = await recordTextReviewProgress(project.id, 'screen-text-review', {
    artifactPath: reviewPath,
    artifactSha256: await sha256File(reviewPath),
    summary: `Saved screen-text review progress for ${review.frames.filter((item) => item.decision === 'accepted').length}/${review.frames.length} frame(s).`,
  });
  res.json({project: updatedProject, screenTextReview: await buildScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
  })});
}));

app.post('/api/projects/:projectId/screen-text-review/ocr', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (project.stages['screen-text-review']?.status !== 'needs-review') {
    throw new Error('Reopen the screen-text review before rerunning OCR so an approved receipt is never changed silently.');
  }
  const composition = await currentCompositionBinding(project);
  const result = await runScreenOcr({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    minConfidence: req.body?.minConfidence === undefined ? 0.55 : Number(req.body.minConfidence),
  });
  res.json({
    ocr: {
      status: result.report.status,
      engine: result.report.engine,
      unresolvedCount: result.report.unresolvedCount,
      reportSha256: result.sha256,
    },
    screenTextReview: await buildScreenTextReview({
      formalRoot: formalProjectRoot(project),
      projectId: project.id,
      composition,
    }),
  });
}));

app.post('/api/projects/:projectId/screen-text-review/approve', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const composition = await currentCompositionBinding(project);
  await saveScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
    stage: project.stages['screen-text-review'],
    rawInput: req.body,
    reviewer,
  });
  const receipt = await approveScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
    stage: project.stages['screen-text-review'],
    reviewer,
  });
  const updatedProject = await approveBoundTextReviewStage(project.id, 'screen-text-review', reviewer, {
    artifactPath: receipt.path,
    artifactSha256: receipt.sha256,
    approvedAt: receipt.approval.approvedAt,
  });
  res.json({project: updatedProject, screenTextReview: await buildScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
  })});
}));

app.post('/api/projects/:projectId/screen-text-review/simulate', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (project.publicationRights !== 'internal-only') {
    throw new Error('Creator-delegated screen-text simulation requires an explicit internal-only project.');
  }
  const composition = await currentCompositionBinding(project);
  const receipt = await simulateScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
    stage: project.stages['screen-text-review'],
    delegationReceipt: req.body?.delegationReceipt,
    reason: req.body?.reason,
  });
  const updatedProject = await approveBoundTextReviewStage(project.id, 'screen-text-review', CREATOR_DELEGATED_REVIEWER, {
    artifactPath: receipt.path,
    artifactSha256: receipt.sha256,
    approvedAt: receipt.approval.approvedAt,
    approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
    delegatedSimulation: {
      mode: 'creator-delegated-internal-only',
      receiptPath: receipt.approval.delegation.path,
      receiptSha256: receipt.approval.delegation.sha256,
    },
  });
  res.json({project: updatedProject, screenTextReview: await buildScreenTextReview({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
  })});
}));

app.get('/api/projects/:projectId/screen-text-review/frames/:frameId', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const composition = await currentCompositionBinding(project);
  const target = await resolveScreenTextReviewFrame({
    formalRoot: formalProjectRoot(project),
    projectId: project.id,
    composition,
    frameId: req.params.frameId,
  });
  res.set('Cache-Control', 'private, no-store');
  res.type(path.extname(target)).sendFile(target);
}));

app.patch('/api/projects/:projectId', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (Object.values(current.stages).some((stage) => stage.status === 'running')) throw new Error('Project settings cannot change while a stage is running.');
  const project = await updateProject(req.params.projectId, schemas.projectPatchSchema.parse(req.body));
  res.json({project});
}));

app.post('/api/projects/:projectId/reset', asyncRoute(async (req, res) => {
  const project = await resetProject(req.params.projectId);
  res.json({project, warning: 'Formal HyperFrames project files and approved narration inputs were preserved.'});
}));

app.delete('/api/projects/:projectId', asyncRoute(async (req, res) => {
  const deleted = await deleteProject(req.params.projectId);
  res.json({deleted});
}));

app.patch('/api/projects/:projectId/stages/:stageId', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages[req.params.stageId]?.status === 'running' && Object.keys(req.body || {}).some((key) => key !== 'position')) {
    throw new Error('Only node position can change while this stage is running.');
  }
  const project = await updateStage(req.params.projectId, req.params.stageId, schemas.stagePatchSchema.parse(req.body));
  res.json({project});
}));

app.post('/api/projects/:projectId/stages', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (Object.values(current.stages).some((stage) => stage.status === 'running')) throw new Error('Custom stages cannot be inserted while a job is running.');
  const project = await addCustomStage(req.params.projectId, schemas.customStageSchema.parse(req.body));
  res.status(201).json({project});
}));

app.delete('/api/projects/:projectId/stages/:stageId', asyncRoute(async (req, res) => {
  const project = await removeCustomStage(req.params.projectId, req.params.stageId);
  res.json({project});
}));

app.post('/api/projects/:projectId/stages/:stageId/generate', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const stage = project.stages[req.params.stageId];
  if (!stage) throw new Error(`Unknown stage: ${req.params.stageId}`);
  assertDependenciesApproved(project, req.params.stageId);
  const job = await startGenerationJob(req.params.projectId, req.params.stageId);
  res.status(202).json({job});
}));

app.post('/api/projects/:projectId/stages/:stageId/approve', asyncRoute(async (req, res) => {
  assertGenericApprovalAllowed(req.params.stageId);
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const approvalScope = req.params.stageId === 'voice-final'
    ? String(req.body?.approvalScope || '').slice(0, 40)
    : null;
  const projectBeforeApproval = await getProject(req.params.projectId);
  assertDependenciesApproved(projectBeforeApproval, req.params.stageId);
  const stage = projectBeforeApproval.stages[req.params.stageId];
  if (stage?.status === 'stale') throw new Error('This stage is stale and must be regenerated before approval.');
  if (stage?.status !== 'needs-review') throw new Error('Only a review-ready stage can be approved.');
  if (req.params.stageId === 'rights-clearance') {
    if (!['cleared', 'internal-only'].includes(projectBeforeApproval.publicationRights)) {
      throw new Error('Mark publication rights as cleared or explicitly internal-only in project settings first.');
    }
    const artifact = await readArtifact(req.params.projectId, req.params.stageId);
    const rights = JSON.parse(artifact?.content || '{}');
    await assertPublicationRightsCurrent({
      formalRoot: formalProjectRoot(projectBeforeApproval),
      workspaceRoot,
      projectId: projectBeforeApproval.id,
      declaration: projectBeforeApproval.publicationRights,
      record: rights,
    });
  }
  await syncFormalApproval(req.params.projectId, req.params.stageId, reviewer, approvalScope);
  const project = await approveStage(req.params.projectId, req.params.stageId, reviewer, {approvalScope});
  res.json({project});
}));

app.post('/api/projects/:projectId/stages/:stageId/reopen', asyncRoute(async (req, res) => {
  const reason = String(req.body?.reason || 'Revision requested').slice(0, 500);
  await syncFormalReopen(req.params.projectId, req.params.stageId, reason);
  const project = await reopenStage(req.params.projectId, req.params.stageId, reason);
  res.json({project});
}));

app.get('/api/projects/:projectId/stages/:stageId/artifact', asyncRoute(async (req, res) => {
  const artifact = await readArtifact(req.params.projectId, req.params.stageId);
  if (!artifact) return res.status(404).json({error: 'No artifact exists for this stage.'});
  return res.json({artifact});
}));

app.put('/api/projects/:projectId/stages/:stageId/artifact', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages[req.params.stageId]?.status === 'running') throw new Error('A running stage artifact cannot be edited. Wait for the job to finish.');
  const content = String(req.body?.content ?? '');
  if (content.length > 2_000_000) throw new Error('Artifact editor limit is 2 MB.');
  const reason = String(req.body?.reason || 'Manual adjustment').slice(0, 500);
  const project = await saveManualArtifact(req.params.projectId, req.params.stageId, content, reason);
  res.json({project});
}));

app.get('/api/projects/:projectId/graph-layout-editor', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const stage = project.stages['diagram-assets'];
  const editor = await readGraphLayoutEditor({
    project,
    artifactPath: stage?.artifactPath ?? null,
    resolveWorkspacePath,
    formalProjectRoot,
  });
  res.json({editor});
}));

app.put('/api/projects/:projectId/graph-layout-editor', asyncRoute(async (req, res) => {
  const project = await saveGraphLayoutPositions(req.params.projectId, req.body);
  const editor = await readGraphLayoutEditor({
    project,
    artifactPath: project.stages['diagram-assets']?.artifactPath ?? null,
    resolveWorkspacePath,
    formalProjectRoot,
  });
  res.json({project, editor});
}));

app.get('/api/projects/:projectId/production-overrides', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const editor = await readProductionOverrideEditor({
    projectRoot: formalProjectRoot(project),
    projectId: project.id,
  });
  res.json({editor});
}));

app.post('/api/projects/:projectId/production-overrides', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages['full-production']?.status === 'running') {
    throw new Error('Wait for full production to finish before saving an object override.');
  }
  if (!Number.isInteger(req.body?.expectedRevision) || req.body.expectedRevision < 0) {
    throw new Error('Production override expectedRevision is required. Reload the editor before saving.');
  }
  const authoredBy = String(req.body?.authoredBy || 'user').slice(0, 100);
  const result = await saveProductionOverride({
    projectRoot: formalProjectRoot(current),
    projectId: current.id,
    input: req.body,
    authoredBy,
    commitProjectChange: (change) => recordProductionOverrideChange(current.id, change),
  });
  res.status(201).json({project: result.project, editor: result.editor, overrideId: result.overrideId});
}));

app.delete('/api/projects/:projectId/production-overrides/:overrideId', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages['full-production']?.status === 'running') {
    throw new Error('Wait for full production to finish before reverting an object override.');
  }
  if (!Number.isInteger(req.body?.expectedRevision) || req.body.expectedRevision < 0) {
    throw new Error('Production override expectedRevision is required. Reload the editor before reverting.');
  }
  const revertedBy = String(req.body?.revertedBy || 'user').slice(0, 100);
  const result = await revertProductionOverride({
    projectRoot: formalProjectRoot(current),
    projectId: current.id,
    overrideId: req.params.overrideId,
    input: req.body,
    revertedBy,
    commitProjectChange: (change) => recordProductionOverrideChange(current.id, change),
  });
  res.json({project: result.project, editor: result.editor, overrideId: result.overrideId});
}));

app.get('/api/projects/:projectId/semantic-sfx-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  const review = await buildSemanticSfxReview({
    projectRoot: formalProjectRoot(project),
    projectId: project.id,
  });
  res.json({review});
}));

app.put('/api/projects/:projectId/semantic-sfx-review', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (project.stages['full-production']?.status === 'running') {
    throw new Error('Wait for full production to finish before reviewing semantic SFX.');
  }
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const review = await saveSemanticSfxReview({
    projectRoot: formalProjectRoot(project),
    projectId: project.id,
    input: {
      sourcePlanSha256: req.body?.sourcePlanSha256,
      decisions: req.body?.decisions,
      notes: req.body?.notes,
    },
    reviewer,
  });
  res.json({review});
}));

app.post('/api/projects/:projectId/semantic-sfx-review/approve', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages['full-production']?.status === 'running') {
    throw new Error('Wait for full production to finish before approving semantic SFX.');
  }
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const review = await approveSemanticSfxReview({
    projectRoot: formalProjectRoot(current),
    projectId: current.id,
    input: {
      sourcePlanSha256: req.body?.sourcePlanSha256,
      decisions: req.body?.decisions,
      notes: req.body?.notes,
    },
    reviewer,
  });
  const project = await recordSemanticSfxReviewChange(current.id, {
    action: 'approved',
    reason: `Approved ${review.counts.approved} semantic SFX cues and rejected ${review.counts.rejected}.`,
  });
  res.json({project, review});
}));

app.post('/api/projects/:projectId/semantic-sfx-review/simulate', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.publicationRights !== 'internal-only') {
    throw new Error('Creator-delegated semantic SFX simulation requires an explicit internal-only project.');
  }
  if (current.stages['full-production']?.status === 'running') {
    throw new Error('Wait for full production to finish before simulating semantic SFX review.');
  }
  const review = await simulateSemanticSfxReview({
    projectRoot: formalProjectRoot(current),
    projectId: current.id,
    delegationReceipt: req.body?.delegationReceipt || await findCreatorDelegationReceipt({formalRoot: formalProjectRoot(current), projectId: current.id}),
    reason: req.body?.reason,
  });
  const project = await recordSemanticSfxReviewChange(current.id, {
    action: 'simulated',
    reason: `Creator-delegated internal simulation kept ${review.counts.approved} sparse semantic SFX cues and silenced ${review.counts.rejected}.`,
  });
  res.json({project, review});
}));

app.post('/api/projects/:projectId/semantic-sfx-review/reopen', asyncRoute(async (req, res) => {
  const current = await getProject(req.params.projectId);
  if (current.stages['full-production']?.status === 'running') {
    throw new Error('Wait for full production to finish before reopening semantic SFX review.');
  }
  const reviewer = String(req.body?.reviewer || 'user').slice(0, 100);
  const review = await reopenSemanticSfxReview({
    projectRoot: formalProjectRoot(current),
    projectId: current.id,
    input: {
      sourcePlanSha256: req.body?.sourcePlanSha256,
      reason: req.body?.reason,
    },
    reviewer,
  });
  const project = await recordSemanticSfxReviewChange(current.id, {
    action: 'reopened',
    reason: String(req.body?.reason || 'Semantic SFX review reopened.').slice(0, 500),
  });
  res.json({project, review});
}));

app.get('/api/jobs/:jobId', asyncRoute(async (req, res) => {
  const job = await getJobRecord(req.params.jobId);
  if (!job) return res.status(404).json({error: 'Unknown job.'});
  return res.json({job});
}));

app.get('/api/jobs', asyncRoute(async (req, res) => {
  const statuses = req.query.active === 'true'
    ? ['queued', 'running', 'cancel-requested']
    : String(req.query.status || '').split(',').map((item) => item.trim()).filter(Boolean);
  const jobs = await listJobRecords({
    projectId: req.query.projectId ? String(req.query.projectId) : null,
    batchId: req.query.batchId ? String(req.query.batchId) : null,
    statuses,
    limit: Number(req.query.limit || 100),
  });
  res.json({jobs});
}));

app.post('/api/jobs/:jobId/cancel', asyncRoute(async (req, res) => {
  const job = await requestJobCancellation(req.params.jobId);
  res.json({job});
}));

app.post('/api/jobs/:jobId/retry', asyncRoute(async (req, res) => {
  const previous = await getJobRecord(req.params.jobId);
  if (!previous) return res.status(404).json({error: 'Unknown job.'});
  if (!['failed', 'canceled'].includes(previous.status)) {
    throw new Error('Only failed or canceled jobs can be retried.');
  }
  const project = await getProject(previous.projectId);
  assertDependenciesApproved(project, previous.stageId);
  const job = await startGenerationJob(previous.projectId, previous.stageId, {
    retryOf: previous.id,
    attempt: Number(previous.attempt || 1) + 1,
    batchId: previous.batchId || null,
    priority: Number(previous.priority || 0),
  });
  if (job.batchId) await addBatchJob(job.batchId, job.id);
  res.status(202).json({job});
}));

app.post('/api/projects/:projectId/preview/start', asyncRoute(async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (project.stages['qa-review']?.status !== 'approved') throw new Error('HyperFrames check must pass before Studio final preview.');
  const composition = await findCompositionRoot(formalProjectRoot(project));
  const port = previewPortFor(project.id);
  const baseUrl = `http://127.0.0.1:${port}/`;
  // Studio discovers compositions reliably from the project root; a cold-load hash route can race discovery.
  const previewUrl = baseUrl;
  const existing = previewProcesses.get(project.id);
  if (!existing || existing.exitCode != null) {
    const child = spawn('npx.cmd', [
      '--yes', `hyperframes@${HYPERFRAMES_VERSION}`, 'preview', composition, '--port', String(port), '--no-open',
    ], {cwd: workspaceRoot, windowsHide: true, stdio: 'ignore', shell: true});
    previewProcesses.set(project.id, child);
    child.once('exit', () => {
      if (previewProcesses.get(project.id) === child) previewProcesses.delete(project.id);
    });
  }
  await waitForHttp(baseUrl);
  const refreshed = await recordPreviewStarted(project.id, previewUrl);
  res.json({project: refreshed, preview: {url: previewUrl, port, status: 'running'}});
}));

app.post('/api/projects/:projectId/preview/stop', asyncRoute(async (req, res) => {
  const child = previewProcesses.get(req.params.projectId);
  if (child && child.exitCode == null) child.kill();
  previewProcesses.delete(req.params.projectId);
  res.json({stopped: true});
}));

app.get('/api/files/raw', asyncRoute(async (req, res) => {
  const requested = String(req.query.path || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!/\.(md|txt|json)$/i.test(requested)) throw new Error('Only text documentation files can be opened here.');
  if (!documentationAllowlist.has(requested)) throw new Error('This file is not an approved documentation entry.');
  const target = await resolveExistingWorkspacePath(requested);
  const stats = await fs.stat(target);
  if (stats.size > 2_000_000) throw new Error('File is too large.');
  res.type(path.extname(target) === '.json' ? 'application/json' : 'text/plain').send(await fs.readFile(target, 'utf8'));
}));

app.get('/api/assets/host-template', asyncRoute(async (_req, res) => {
  const target = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', 'persondesign-modern-host-probe', 'review', 'v2-natural-multipose-master.png');
  await fs.access(target);
  res.type('image/png').sendFile(target);
}));

app.use(express.static(distRoot, {index: 'index.html'}));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(distRoot, 'index.html'));
});

app.use((error, _req, res, _next) => {
  const status = error?.name === 'ZodError' ? 400 : 500;
  const message = error instanceof Error ? error.message : String(error);
  res.status(status).json({error: message, details: error?.issues ?? undefined});
});

const server = app.listen(port, '127.0.0.1', async () => {
  const receipt = {url: `http://127.0.0.1:${port}/`, pid: process.pid, startedAt: new Date().toISOString(), capabilities: SERVER_CAPABILITIES, readOnlyPreview};
  await fs.mkdir(path.dirname(serverReceiptPath), {recursive: true});
  await fs.writeFile(serverReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(`AutoVideo workbench: ${receipt.url}`);
});

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of previewProcesses.values()) {
    if (child.exitCode == null) child.kill();
  }
  server.close(async () => {
    await releaseServerLock();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
