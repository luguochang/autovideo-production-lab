import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const normalize = (value) => {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
};

export const stableJson = (value) => `${JSON.stringify(normalize(value), null, 2)}\n`;
export const sha256Json = (value) => crypto.createHash('sha256').update(stableJson(value)).digest('hex');

export const standardProjectStateSnapshot = (project, activeStageIds) => ({
  projectId: project.id,
  route: project.route,
  contentIntakeSha256: project.contentIntake?.payload?.sha256 ?? null,
  formalProjectPath: project.formalProjectPath ?? null,
  stages: Object.fromEntries(activeStageIds.map((stageId) => {
    const stage = project.stages?.[stageId] ?? {};
    return [stageId, {
      status: stage.status ?? null,
      revision: Number(stage.revision ?? 0),
      artifactSha256: stage.artifactSha256 ?? null,
      approvedArtifactSha256: stage.approvedArtifactSha256 ?? null,
      approvalScope: stage.approvalScope ?? null,
      jobId: stage.jobId ?? null,
    }];
  })),
});

export const createStandardRunReceipt = ({
  project,
  activeStageIds,
  runId = crypto.randomUUID(),
  startedAt = new Date().toISOString(),
  resumesRunId = null,
}) => {
  const projectState = standardProjectStateSnapshot(project, activeStageIds);
  return {
    schemaVersion: 'autovideo-standard-run-receipt/v1',
    projectId: project.id,
    runId,
    resumesRunId,
    startedAt,
    updatedAt: startedAt,
    finishedAt: null,
    status: 'running',
    currentStageId: null,
    message: null,
    activeStageIds: [...activeStageIds],
    projectState,
    projectStateSha256: sha256Json(projectState),
    policy: {
      autoApproveHumanGates: false,
      publicReleaseApprovalSynthesized: false,
      microphoneUsed: false,
      mediaPlaybackInvoked: false,
    },
  };
};

export const updateStandardRunReceipt = (receipt, {
  project,
  status = receipt.status,
  currentStageId = receipt.currentStageId,
  message = receipt.message,
  updatedAt = new Date().toISOString(),
}) => {
  const projectState = standardProjectStateSnapshot(project, receipt.activeStageIds);
  const terminal = ['complete', 'failed', 'waiting-for-human', 'waiting-for-operator'].includes(status);
  return {
    ...receipt,
    status,
    currentStageId,
    message,
    updatedAt,
    finishedAt: terminal ? receipt.finishedAt ?? updatedAt : null,
    projectState,
    projectStateSha256: sha256Json(projectState),
  };
};

const writeAtomic = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, stableJson(value), 'utf8');
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, {force: true}).catch(() => undefined);
  }
};

export const writeStandardRunReceipt = async ({projectDir, receipt}) => {
  const receiptRoot = path.join(projectDir, 'receipts', 'standard-runs');
  const historyPath = path.join(receiptRoot, `${receipt.runId}.json`);
  const latestPath = path.join(projectDir, 'STANDARD_RUN_RECEIPT.json');
  await writeAtomic(historyPath, receipt);
  await writeAtomic(latestPath, receipt);
  return {historyPath, latestPath};
};

export const readLatestStandardRunReceipt = async (projectDir) => {
  try {
    return JSON.parse(await fs.readFile(path.join(projectDir, 'STANDARD_RUN_RECEIPT.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};
