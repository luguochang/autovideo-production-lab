import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {standardJobAction, standardStageAction} from './standard-run-policy.mjs';
import {
  createStandardRunReceipt,
  readLatestStandardRunReceipt,
  updateStandardRunReceipt,
  writeStandardRunReceipt,
} from './standard-run-receipt.mjs';
import {stageAppliesToProject} from '../workflow-console/workflow-catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const run = promisify(execFile);

const parseArgs = (values) => {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const projectId = args.project;
const baseUrl = String(args['base-url'] || 'http://127.0.0.1:3339').replace(/\/$/, '');
const pollMs = Number(args['poll-ms'] || 2000);
const timeoutMs = Number(args['timeout-ms'] || 4 * 60 * 60 * 1000);
const fallbackReference = args['fallback-reference'] || null;
const internalMotionFallback = args['internal-motion-fallback'] || null;

if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/run-standard-delivery.mjs --project <id> [--base-url <url>]');
}
if (!Number.isFinite(pollMs) || pollMs < 250 || !Number.isFinite(timeoutMs) || timeoutMs < 60_000) {
  throw new Error('Invalid poll or timeout value.');
}

const projectDir = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
const logPath = path.join(projectDir, 'RUN_EXECUTION_LOG.md');
const pipelineSummaryPath = path.join(projectDir, 'PIPELINE_RUN_LOG.md');

const applyInternalMotionFallback = async () => {
  if (!internalMotionFallback) return null;
  const currentProject = await getProject();
  if (currentProject.stages?.['full-production']?.status === 'approved') {
    await appendLog('internal-motion-fallback-preserved', {
      reason: 'Full production is already approved; do not rewrite its hash-bound production manifest during resume.',
    });
    return path.join(projectDir, 'plan', 'production-manifest.json');
  }
  const requestPath = path.resolve(root, internalMotionFallback);
  const outputPath = path.join(projectDir, 'plan', 'production-manifest.json');
  const {stdout, stderr} = await run(process.execPath, [
    'scripts/compile-production-manifest.mjs',
    '--project', projectDir,
    '--output', outputPath,
    '--internal-motion-fallback', requestPath,
    '--force',
  ], {cwd: root, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024, windowsHide: true});
  await appendLog('internal-motion-fallback-bound', {
    requestPath: path.relative(root, requestPath).replaceAll('\\', '/'),
    outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
    stdout: stdout.trim(),
    diagnostics: stderr.trim() || null,
  });
  return outputPath;
};

const request = async (urlPath, options = {}) => {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    ...options,
    headers: {'content-type': 'application/json', ...(options.headers || {})},
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = {raw: text}; }
  if (!response.ok) throw new Error(payload?.error || payload?.raw || `${response.status} ${response.statusText}`);
  return payload;
};

const appendLog = async (event, detail = {}) => {
  await fs.mkdir(projectDir, {recursive: true});
  const line = `- ${new Date().toISOString()} | ${event} | ${JSON.stringify(detail)}\n`;
  await fs.appendFile(logPath, line, 'utf8');
};

const getProject = async () => (await request(`/api/projects/${encodeURIComponent(projectId)}`)).project;
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

class StageJobError extends Error {
  constructor(stageId, job, reason) {
    super(`${stageId} ${job?.status || 'job'}: ${reason}`);
    this.jobStatus = job?.status ?? 'missing';
    this.jobId = job?.id ?? null;
  }
}

const waitForJob = async (jobId, stageId) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = (await request(`/api/jobs/${encodeURIComponent(jobId)}`)).job;
    const decision = standardJobAction(job);
    if (decision.action === 'complete') return {status: 'complete', job};
    if (decision.action === 'wait-for-operator') return {status: 'waiting-for-operator', job, reason: decision.reason};
    if (decision.action === 'failed' || decision.action === 'blocked') {
      throw new StageJobError(stageId, job, decision.reason);
    }
    await wait(pollMs);
  }
  throw new Error(`${stageId} timed out after ${timeoutMs}ms.`);
};

const fallbackScripts = {
  'visual-plan': 'scripts/generate-deterministic-planning.mjs',
  'style-probe': 'scripts/prepare-style-probe.mjs',
};
const fallbackArtifacts = {
  'visual-plan': ['plan/storyboard.json', 'plan/shot-manifest.json', 'plan/graph-ir.json', 'plan/production-manifest.json', 'plan/planning-fallback-receipt.json'],
  'style-probe': ['STYLE_REVIEW.md', 'style-selection.json', 'review/probe-review.json', 'review/stills/style-probe-hidden-complexity.png', 'review/probes/style-probe-hidden-complexity.mp4'],
};

const tryPlanningTimingRebase = async (reason) => {
  try {
    const response = await request(`/api/projects/${encodeURIComponent(projectId)}/stages/visual-plan/artifact`);
    const source = response?.artifact?.path;
    if (!source) return false;
    const {stdout, stderr} = await run(process.execPath, [
      'scripts/rebase-planning-timings.mjs', '--project', projectId, '--source', source,
    ], {cwd: root, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024, windowsHide: true});
    await appendLog('stage-timing-rebase-complete', {
      stageId: 'visual-plan', source, reason,
      stdout: stdout.trim(), diagnostics: stderr.trim() || null,
    });
    return true;
  } catch (error) {
    await appendLog('stage-timing-rebase-rejected', {
      stageId: 'visual-plan', reason, error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const prepareFallback = async (stageId, reason) => {
  const script = fallbackScripts[stageId];
  if (!script || (stageId === 'style-probe' && !fallbackReference)) return false;
  const alreadyPrepared = (await Promise.all((fallbackArtifacts[stageId] || []).map((relativePath) => (
    fs.access(path.join(projectDir, relativePath)).then(() => true).catch(() => false)
  )))).every(Boolean);
  if (alreadyPrepared && stageId !== 'visual-plan') {
    await appendLog('stage-fallback-already-prepared', {stageId, referenceProjectId: fallbackReference, reason});
    return true;
  }
  if (stageId === 'visual-plan' && await tryPlanningTimingRebase(reason)) return true;
  await appendLog('stage-fallback-start', {stageId, referenceProjectId: fallbackReference, reason});
  const scriptArgs = [script, '--project', projectId];
  if (stageId === 'visual-plan') scriptArgs.push('--replace', '--reason', reason.slice(0, 500));
  else scriptArgs.push('--reference', fallbackReference);
  const {stdout, stderr} = await run(process.execPath, scriptArgs, {
    cwd: root, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024, windowsHide: true,
  });
  await appendLog('stage-fallback-complete', {
    stageId,
    referenceProjectId: fallbackReference,
    stdout: stdout.trim(),
    diagnostics: stderr.trim() || null,
  });
  return true;
};

const generateStage = async (stageId, previousStatus) => {
  // A deterministic same-narration probe is the preferred baseline when a
  // reference project is supplied. It keeps the standard run reproducible and
  // leaves the Codex adapter as an optional enrichment path instead of a
  // long-running prerequisite for a machine-checkable gate.
  if (stageId === 'style-probe' && fallbackReference && previousStatus !== 'approved') {
    await prepareFallback(
      stageId,
      'Preparing the current-project deterministic style probe before the optional Codex enrichment adapter.',
    );
  }
  if (previousStatus === 'failed' && fallbackScripts[stageId]) {
    await prepareFallback(
      stageId,
      stageId === 'visual-plan'
        ? 'Previous workbench job failed; preparing the current-project deterministic planning baseline before retry.'
        : 'Previous workbench job failed; preparing a strict same-narration style fallback before retry.',
    );
  }
  await appendLog('stage-generate-start', {stageId, previousStatus});
  let {job} = await request(`/api/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/generate`, {
    method: 'POST', body: '{}',
  });
  await appendLog('stage-job-created', {stageId, jobId: job.id});
  try {
    const outcome = await waitForJob(job.id, stageId);
    if (outcome.status === 'waiting-for-operator') return outcome;
    await appendLog('stage-generate-complete', {stageId, jobId: job.id, result: outcome.job.result});
    return outcome;
  } catch (error) {
    if (error.jobStatus !== 'failed' || !await prepareFallback(stageId, error.message)) throw error;
    ({job} = await request(`/api/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/generate`, {
      method: 'POST', body: '{}',
    }));
    await appendLog('stage-fallback-job-created', {stageId, jobId: job.id});
    const outcome = await waitForJob(job.id, stageId);
    if (outcome.status === 'waiting-for-operator') return outcome;
    await appendLog('stage-generate-complete-after-fallback', {stageId, jobId: job.id, result: outcome.job.result});
    return outcome;
  }
};

const ensureStageApproved = async (stageId) => {
  let project = await getProject();
  let stage = project.stages[stageId];
  const definition = definitions.get(stageId);
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);

  const decision = standardStageAction({stage, definition});
  if (decision.action === 'continue') {
    await appendLog('stage-skip-approved', {stageId, revision: stage.revision, approvalScope: stage.approvalScope});
    return;
  }

  if (decision.action === 'blocked') throw new Error(`${stageId} is blocked: ${decision.reason}.`);
  if (decision.action === 'wait-for-human') {
    await appendLog('stage-waiting-for-human', {stageId, reason: decision.reason});
    return {status: 'waiting-for-human', stageId};
  }
  if (decision.action === 'resume-job') {
    await appendLog('stage-resume-running', {stageId, jobId: decision.jobId});
    const outcome = await waitForJob(decision.jobId, stageId);
    if (outcome.status === 'waiting-for-operator') {
      await appendLog('stage-waiting-for-operator', {stageId, jobId: decision.jobId, reason: outcome.reason});
      return {status: 'waiting-for-operator', stageId, jobId: decision.jobId};
    }
  } else if (decision.action === 'generate') {
    const outcome = await generateStage(stageId, stage.status);
    if (outcome?.status === 'waiting-for-operator') {
      await appendLog('stage-waiting-for-operator', {stageId, jobId: outcome.job.id, reason: outcome.reason});
      return {status: 'waiting-for-operator', stageId, jobId: outcome.job.id};
    }
  }

  project = await getProject();
  stage = project.stages[stageId];
  if (stage.status === 'needs-review' && definition?.humanGate === true) {
    const reason = stageId === 'pronunciation-review'
      ? 'Subjective Latin terms require explicit in-context candidate listening and selection.'
      : stageId === 'voice-final'
        ? 'Generated voice candidates require dedicated complete-file A/B listening and atomic promotion.'
        : 'Generated artifact requires explicit human review in the workbench.';
    await appendLog('stage-waiting-for-human', {
      stageId,
      reason,
    });
    return {status: 'waiting-for-human', stageId};
  }

  if (stage.status !== 'approved') throw new Error(`${stageId} ended in ${stage.status}, expected approved.`);
  return {status: 'approved', stageId};
};

const health = await request('/api/health');
const catalog = await request('/api/catalog');
const initialProject = await getProject();
const definitions = new Map([
  ...catalog.stages.map((stage) => [stage.id, stage]),
  ...Object.entries(initialProject.customStages || {}),
]);
const activeStageIds = initialProject.stageOrder.filter((stageId) => {
  const definition = definitions.get(stageId);
  return definition
    && initialProject.stages[stageId]?.enabled
    && stageAppliesToProject(definition, initialProject);
});
const previousRunReceipt = await readLatestStandardRunReceipt(projectDir);
const resumablePreviousStatuses = new Set(['running', 'failed', 'waiting-for-human', 'waiting-for-operator']);
let runReceipt = createStandardRunReceipt({
  project: initialProject,
  activeStageIds,
  resumesRunId: resumablePreviousStatuses.has(previousRunReceipt?.status) ? previousRunReceipt.runId : null,
});
const runReceiptPaths = await writeStandardRunReceipt({projectDir, receipt: runReceipt});
const persistRunReceipt = async ({status = runReceipt.status, currentStageId = runReceipt.currentStageId, message = runReceipt.message} = {}) => {
  const currentProject = await getProject();
  runReceipt = updateStandardRunReceipt(runReceipt, {project: currentProject, status, currentStageId, message});
  await writeStandardRunReceipt({projectDir, receipt: runReceipt});
  return runReceipt;
};

const writePipelineSummary = async (runStatus, runMessage = '') => {
  const project = await getProject();
  const rows = activeStageIds.map((stageId, index) => {
    const stage = project.stages[stageId];
    const detail = String(stage.lastResult || stage.lastError || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
    return `| ${index + 1} | ${stageId} | ${stage.status} | ${stage.revision} | ${stage.approvalScope || '-'} | ${detail} |`;
  });
  const content = [
    `# Standard Pipeline Status - ${projectId}`,
    '',
    `- Updated: ${new Date().toISOString()}`,
    `- Run status: \`${runStatus}\``,
    `- Route: \`${project.route}\``,
    `- Formal project: \`${project.formalProjectPath}\``,
    `- Detailed append-only log: \`RUN_EXECUTION_LOG.md\``,
    `- Policy: automated approvals remain internal-only; human listening, human final review and public rights are never synthesized.`,
    ...(runMessage ? [`- Latest run message: ${runMessage.replace(/\s+/g, ' ')}`] : []),
    '',
    '| Seq | Stage | Status | Revision | Approval scope | Latest result |',
    '|---:|---|---|---:|---|---|',
    ...rows,
    '',
  ].join('\n');
  await fs.writeFile(pipelineSummaryPath, content, 'utf8');
};

const runHeader = [
  `## Run ${new Date().toISOString()}`,
  '',
  `- Workbench: ${baseUrl}`,
  `- Workbench version: ${health.version}`,
  `- Run id: ${runReceipt.runId}`,
  `- Resumes run id: ${runReceipt.resumesRunId || 'none'}`,
  `- Route: ${initialProject.route}`,
  `- Active stages: ${activeStageIds.join(', ')}`,
  `- Deterministic visual-planning fallback: built from the current NarrationLock, alignment and template lock`,
  `- Same-narration style fallback reference: ${fallbackReference || 'none'}`,
  `- Internal-only motion fallback receipt: ${internalMotionFallback || 'none'}`,
  `- Policy: machine and autonomous approvals remain internal-only; no human listening or human final review is synthesized.`,
  '',
  '### Events',
  '',
].join('\n');
try {
  await fs.access(logPath);
  await fs.appendFile(logPath, `\n${runHeader}`, 'utf8');
} catch {
  await fs.writeFile(logPath, `# Standard delivery execution log: ${projectId}\n\n${runHeader}`, 'utf8');
}

try {
  let pause = null;
  let currentStageId = null;
  for (const stageId of activeStageIds) {
    currentStageId = stageId;
    await persistRunReceipt({status: 'running', currentStageId: stageId, message: null});
    if (stageId === 'full-production') await applyInternalMotionFallback();
    const result = await ensureStageApproved(stageId);
    if (result?.status === 'waiting-for-human' || result?.status === 'waiting-for-operator') {
      pause = result;
      break;
    }
  }
  if (pause) {
    const pausedProject = await getProject();
    const message = pause.status === 'waiting-for-human'
      ? `${pause.stageId} is waiting for dedicated human review; downstream generation was not started.`
      : `${pause.stageId} has a paused job; resume or cancel it in the workbench before continuing.`;
    await appendLog(`run-${pause.status}`, {stageId: pause.stageId, jobId: pause.jobId ?? null, message});
    await writePipelineSummary(pause.status, message);
    await persistRunReceipt({status: pause.status, currentStageId: pause.stageId, message});
    console.log(JSON.stringify({
      ok: true,
      status: pause.status,
      projectId,
      pausedAt: pause.stageId,
      jobId: pause.jobId ?? null,
      formalProjectPath: pausedProject.formalProjectPath,
      logPath,
      runReceiptPath: runReceiptPaths.latestPath,
    }, null, 2));
  } else {
  const finalProject = await getProject();
  await appendLog('run-complete', {
    projectId,
    formalProjectPath: finalProject.formalProjectPath,
    stages: Object.fromEntries(activeStageIds.map((id) => [id, {
      status: finalProject.stages[id].status,
      revision: finalProject.stages[id].revision,
      approvalScope: finalProject.stages[id].approvalScope,
    }])),
  });
  await writePipelineSummary('complete');
  await persistRunReceipt({status: 'complete', currentStageId: null, message: 'All active stages are approved.'});
  if (activeStageIds.includes('package-export') && finalProject.stages['package-export']?.status === 'approved') {
    await run(process.execPath, [
      'scripts/assemble-standard-delivery-package.mjs',
      '--project', projectId,
      '--refresh-metadata',
    ], {cwd: root, timeout: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, windowsHide: true});
  }
  console.log(JSON.stringify({ok: true, projectId, activeStageIds, formalProjectPath: finalProject.formalProjectPath, logPath, runReceiptPath: runReceiptPaths.latestPath}, null, 2));
  }
} catch (error) {
  await appendLog('run-failed', {message: error.message});
  await writePipelineSummary('failed', error.message).catch(() => {});
  await persistRunReceipt({status: 'failed', message: error.message}).catch(() => {});
  throw error;
}
