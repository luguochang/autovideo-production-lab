import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PQueue from 'p-queue';
import {z} from 'zod';
import {buildVisualAssetCandidates} from './visual-asset-candidates.mjs';

const writeQueue = new PQueue({concurrency: 1});
const feedbackLogRelativePath = 'style-library/assets/feedback-log.jsonl';
const projectReceiptRelativePath = 'review/visual-asset-feedback.json';

export const visualAssetDecisionInputSchema = z.object({
  candidateDigestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  candidateId: z.string().regex(/^visual-cue-[0-9]+$/),
  decision: z.enum(['adopted', 'rejected']),
  note: z.string().trim().max(500).default(''),
}).strict().superRefine((value, context) => {
  if (value.decision === 'rejected' && value.note.length < 2) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['note'], message: 'Rejected candidates require an actionable note.'});
  }
});

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (filePath, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};
const readJsonl = async (filePath) => {
  try {
    return (await fs.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
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

const latestDecisionRecords = (records) => {
  const latest = new Map();
  for (const record of records) {
    const key = `${record.projectId}:${record.candidateDigestSha256}:${record.candidateId}`;
    const previous = latest.get(key);
    if (!previous || Number(record.revision) > Number(previous.revision)) latest.set(key, record);
  }
  return [...latest.values()];
};

export async function buildVisualAssetLibraryMetrics({workspaceRoot}) {
  const records = latestDecisionRecords(await readJsonl(path.join(workspaceRoot, feedbackLogRelativePath)));
  const adopted = records.filter((item) => item.decision === 'adopted');
  const rejected = records.filter((item) => item.decision === 'rejected');
  const byAsset = new Map();
  for (const record of records) {
    const current = byAsset.get(record.assetId) ?? {assetId: record.assetId, adopted: 0, rejected: 0, projects: new Set()};
    current[record.decision] += 1;
    current.projects.add(record.projectId);
    byAsset.set(record.assetId, current);
  }
  return {
    schemaVersion: 'autovideo-visual-asset-metrics/v1',
    decisionCount: records.length,
    adoptedCount: adopted.length,
    rejectedCount: rejected.length,
    adoptionRate: records.length ? Number((adopted.length / records.length).toFixed(3)) : null,
    rejectionRate: records.length ? Number((rejected.length / records.length).toFixed(3)) : null,
    projectCount: new Set(records.map((item) => item.projectId)).size,
    assets: [...byAsset.values()].map((item) => ({...item, projects: item.projects.size}))
      .sort((left, right) => right.adopted - left.adopted || left.assetId.localeCompare(right.assetId)),
  };
}

export async function buildVisualAssetFeedback({workspaceRoot, formalRoot, projectId}) {
  const candidates = await buildVisualAssetCandidates({projectRoot: formalRoot, projectId});
  const metrics = await buildVisualAssetLibraryMetrics({workspaceRoot});
  if (!candidates.available) return {...candidates, metrics, decisions: [], counts: {pending: 0, adopted: 0, rejected: 0}};
  const receipt = await readJson(path.join(formalRoot, projectReceiptRelativePath));
  const currentDigest = candidates.plan.candidateDigestSha256;
  const decisions = receipt?.candidateDigestSha256 === currentDigest ? receipt.decisions ?? [] : [];
  const decisionById = new Map(decisions.map((item) => [item.candidateId, item]));
  const enrichedCandidates = candidates.plan.candidates.map((candidate) => ({
    ...candidate,
    decision: decisionById.get(candidate.id) ?? null,
  }));
  return {
    ...candidates,
    plan: {...candidates.plan, candidates: enrichedCandidates},
    decisions,
    counts: {
      pending: enrichedCandidates.filter((item) => !item.decision).length,
      adopted: decisions.filter((item) => item.decision === 'adopted').length,
      rejected: decisions.filter((item) => item.decision === 'rejected').length,
    },
    metrics,
    policy: {decisionsDoNotAutoAttach: true, rejectedCandidatesRequireNotes: true},
  };
}

export const saveVisualAssetFeedback = ({workspaceRoot, formalRoot, projectId, input, reviewer = 'user'}) => writeQueue.add(async () => {
  const parsed = visualAssetDecisionInputSchema.parse(input);
  const editor = await buildVisualAssetFeedback({workspaceRoot, formalRoot, projectId});
  if (!editor.available || parsed.candidateDigestSha256 !== editor.plan.candidateDigestSha256) {
    throw new Error('Visual asset candidates changed after this page loaded. Reload before saving a decision.');
  }
  const candidate = editor.plan.candidates.find((item) => item.id === parsed.candidateId);
  if (!candidate) throw new Error(`Unknown visual asset candidate: ${parsed.candidateId}`);
  const previous = editor.decisions.find((item) => item.candidateId === parsed.candidateId) ?? null;
  const revision = Number(previous?.revision || 0) + 1;
  const decidedAt = new Date().toISOString();
  const record = {
    schemaVersion: 'autovideo-visual-asset-feedback/v1',
    id: crypto.randomUUID(),
    projectId,
    candidateDigestSha256: parsed.candidateDigestSha256,
    candidateId: candidate.id,
    assetId: candidate.assetId,
    sourceCueIds: candidate.sourceCueIds,
    visualType: candidate.visualType,
    matchedAliases: candidate.matchedAliases,
    decision: parsed.decision,
    note: parsed.note,
    revision,
    supersedes: previous?.id ?? null,
    reviewer: String(reviewer || 'user').slice(0, 100),
    decidedAt,
    autoAttached: false,
  };
  const feedbackLogPath = path.join(workspaceRoot, feedbackLogRelativePath);
  await fs.mkdir(path.dirname(feedbackLogPath), {recursive: true});
  await fs.appendFile(feedbackLogPath, `${JSON.stringify(record)}\n`, 'utf8');
  const nextDecisions = editor.decisions.filter((item) => item.candidateId !== candidate.id).concat(record)
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  await writeAtomic(path.join(formalRoot, projectReceiptRelativePath), {
    schemaVersion: 'autovideo-visual-asset-feedback-receipt/v1',
    projectId,
    candidateDigestSha256: parsed.candidateDigestSha256,
    sourceShotManifest: editor.plan.sourceShotManifest,
    sourceAssetRegistry: editor.plan.sourceAssetRegistry,
    feedbackLogPath: feedbackLogRelativePath,
    decisions: nextDecisions,
    updatedAt: decidedAt,
  });
  return buildVisualAssetFeedback({workspaceRoot, formalRoot, projectId});
});

export {feedbackLogRelativePath, projectReceiptRelativePath};
