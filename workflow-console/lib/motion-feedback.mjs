import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PQueue from 'p-queue';
import {z} from 'zod';

const writeQueue = new PQueue({concurrency: 1});
const feedbackLogRelativePath = 'style-library/motion-library/feedback-log.jsonl';

const recipeFeedbackSchema = z.object({
  recipeId: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(40),
  verdict: z.enum(['pending', 'reuse', 'tune', 'hold', 'retire-candidate']),
  suitableTopics: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  issues: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  notes: z.string().trim().max(2000).default(''),
});

const motionFeedbackInputSchema = z.object({
  usageKey: z.string().trim().min(1).max(300),
  overallVerdict: z.enum(['pending', 'reusable', 'needs-tuning', 'reject']),
  recipeFeedback: z.array(recipeFeedbackSchema).min(1).max(40),
  notes: z.string().trim().max(4000).default(''),
});

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const recordSha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const readJsonl = async (filePath) => {
  try {
    return (await fs.readFile(filePath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSONL record at ${filePath}:${index + 1}: ${error.message}`);
        }
      });
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

const loadUsage = async ({workspaceRoot, formalRoot, projectId}) => {
  const receiptPath = path.join(formalRoot, 'review', 'motion-usage.json');
  let receipt;
  try {
    receipt = await readJson(receiptPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!receipt?.usageKey || receipt?.record?.usageKey !== receipt.usageKey) {
    throw new Error('The project motion-usage receipt is incomplete or inconsistent.');
  }
  if (receipt.record.projectId !== projectId) {
    throw new Error('The project motion-usage receipt belongs to a different project.');
  }
  const usageLogPath = path.join(workspaceRoot, receipt.path ?? 'style-library/motion-library/usage-log.jsonl');
  const usageRecords = await readJsonl(usageLogPath);
  const usage = usageRecords.find((entry) => entry.usageKey === receipt.usageKey);
  if (!usage) throw new Error('The central motion usage record referenced by this project is missing.');
  if (usage.projectId !== projectId || usage.compositionDigest !== receipt.record.compositionDigest) {
    throw new Error('The central motion usage record does not match the project receipt.');
  }
  return {receiptPath, receipt, usageLogPath, usage};
};

const recipeKey = (item) => `${item.recipeId}@${item.version}`;

export const readLatestMotionFeedbackSummary = async ({workspaceRoot}) => {
  const feedbackLogPath = path.join(workspaceRoot, feedbackLogRelativePath);
  const records = await readJsonl(feedbackLogPath);
  const latestByUsage = new Map();
  for (const record of records) {
    if (!record?.usageKey || !Array.isArray(record.recipeFeedback)) continue;
    const current = latestByUsage.get(record.usageKey);
    if (!current
        || Number(record.revision ?? 0) > Number(current.revision ?? 0)
        || (Number(record.revision ?? 0) === Number(current.revision ?? 0)
          && String(record.reviewedAt ?? '') > String(current.reviewedAt ?? ''))) {
      latestByUsage.set(record.usageKey, record);
    }
  }
  const aggregate = {};
  for (const record of latestByUsage.values()) {
    for (const item of record.recipeFeedback) {
      if (!item?.recipeId || !item?.version || item.verdict === 'pending') continue;
      const summary = aggregate[item.recipeId] ?? {
        recipeId: item.recipeId,
        versions: [],
        sampleCount: 0,
        reuse: 0,
        tune: 0,
        hold: 0,
        'retire-candidate': 0,
        suitableTopics: [],
        latestReviewedAt: null,
      };
      summary.versions = [...new Set([...summary.versions, item.version])].sort();
      summary.sampleCount += 1;
      summary[item.verdict] += 1;
      summary.suitableTopics = [...new Set([...summary.suitableTopics, ...(item.suitableTopics ?? [])])].sort();
      if (!summary.latestReviewedAt || String(record.reviewedAt ?? '') > summary.latestReviewedAt) {
        summary.latestReviewedAt = record.reviewedAt ?? null;
      }
      aggregate[item.recipeId] = summary;
    }
  }
  return {
    schemaVersion: 'autovideo-motion-feedback-summary/v1',
    available: records.length > 0,
    path: feedbackLogRelativePath,
    recordCount: records.length,
    latestUsageCount: latestByUsage.size,
    feedback: aggregate,
    policy: {
      latestRevisionPerUsageOnly: true,
      advisoryOnly: true,
      lifecycleMutationApplied: false,
    },
  };
};

export const buildMotionFeedback = async ({workspaceRoot, formalRoot, projectId}) => {
  const loaded = await loadUsage({workspaceRoot, formalRoot, projectId});
  if (!loaded) {
    const shotManifestPath = path.join(formalRoot, 'plan', 'shot-manifest.json');
    let shotManifest = null;
    try {
      shotManifest = await readJson(shotManifestPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const versionedRecipeCount = (shotManifest?.shots ?? []).reduce(
      (sum, shot) => sum + (Array.isArray(shot.motionRecipeRefs) ? shot.motionRecipeRefs.length : 0),
      0,
    );
    const reason = !shotManifest
      ? 'shot-manifest-missing'
      : versionedRecipeCount === 0
        ? 'no-versioned-motion-recipes'
        : 'retrospective-not-refreshed';
    const message = reason === 'no-versioned-motion-recipes'
      ? '当前项目仍使用旧式 motionRules，没有版本化动效配方；系统不会伪造配方反馈。'
      : reason === 'retrospective-not-refreshed'
        ? '当前全片已使用版本化动效配方，请重新生成“复盘与模板回写”以创建使用回执。'
        : '全片分镜尚未生成，暂时没有可复盘的动效配方。';
    return {
      schemaVersion: 'autovideo-motion-feedback-editor/v1',
      available: false,
      projectId,
      reason,
      message,
      sourceUsage: null,
      review: null,
      historyCount: 0,
    };
  }
  const feedbackLogPath = path.join(workspaceRoot, feedbackLogRelativePath);
  const history = (await readJsonl(feedbackLogPath))
    .filter((entry) => entry.usageKey === loaded.usage.usageKey)
    .sort((left, right) => Number(left.revision || 0) - Number(right.revision || 0));
  const latest = history.at(-1) ?? null;
  const recipes = (loaded.usage.recipes ?? []).map((recipe) => ({
    libraryId: recipe.libraryId ?? null,
    libraryVersion: recipe.libraryVersion ?? null,
    recipeId: recipe.recipeId,
    version: recipe.version,
    cueIds: recipe.cueIds ?? [],
  }));
  return {
    schemaVersion: 'autovideo-motion-feedback-editor/v1',
    available: true,
    projectId,
    sourceUsage: {
      usageKey: loaded.usage.usageKey,
      compositionDigest: loaded.usage.compositionDigest,
      compositionFileCount: loaded.usage.compositionFileCount,
      recordedAt: loaded.usage.recordedAt,
      sha256: recordSha256(loaded.usage),
      recipes,
    },
    review: latest,
    historyCount: history.length,
    policy: {
      feedbackDoesNotPromoteRecipes: true,
      lifecycleChangeRequiresSeparateHumanApproval: true,
      baseStyleLocked: true,
      fixedHostZone: 'host.left',
      fixedContentZone: 'content.right',
    },
  };
};

export const saveMotionFeedback = async ({workspaceRoot, formalRoot, projectId, input, reviewer = 'user'}) => writeQueue.add(async () => {
  const editor = await buildMotionFeedback({workspaceRoot, formalRoot, projectId});
  if (!editor.available) throw new Error(editor.message);
  const parsed = motionFeedbackInputSchema.parse(input);
  if (parsed.usageKey !== editor.sourceUsage.usageKey) {
    throw new Error('Motion feedback targets a stale composition usage record. Reload the project before saving.');
  }
  const expected = new Set(editor.sourceUsage.recipes.map(recipeKey));
  const supplied = new Set(parsed.recipeFeedback.map(recipeKey));
  if (supplied.size !== parsed.recipeFeedback.length) throw new Error('Motion feedback contains duplicate recipe entries.');
  if (expected.size !== supplied.size || [...expected].some((key) => !supplied.has(key))) {
    throw new Error('Motion feedback must cover every recipe in the current composition exactly once.');
  }
  const allRecipesReviewed = parsed.recipeFeedback.every((item) => item.verdict !== 'pending');
  if (parsed.overallVerdict !== 'pending' && !allRecipesReviewed) {
    throw new Error('Review every recipe before setting a final overall verdict.');
  }
  const reviewComplete = allRecipesReviewed && parsed.overallVerdict !== 'pending';

  const feedbackLogPath = path.join(workspaceRoot, feedbackLogRelativePath);
  const history = (await readJsonl(feedbackLogPath)).filter((entry) => entry.usageKey === parsed.usageKey);
  const previous = history.sort((left, right) => Number(left.revision || 0) - Number(right.revision || 0)).at(-1) ?? null;
  const revision = Number(previous?.revision || 0) + 1;
  const reviewedAt = new Date().toISOString();
  const record = {
    schemaVersion: 'autovideo-motion-feedback/v1',
    id: crypto.randomUUID(),
    usageKey: parsed.usageKey,
    projectId,
    compositionDigest: editor.sourceUsage.compositionDigest,
    usageRecordSha256: editor.sourceUsage.sha256,
    revision,
    supersedes: previous?.id ?? null,
    humanReview: reviewComplete ? 'reviewed' : 'in-progress',
    overallVerdict: parsed.overallVerdict,
    recipeFeedback: parsed.recipeFeedback,
    notes: parsed.notes,
    reviewer: String(reviewer || 'user').slice(0, 100),
    reviewedAt,
    lifecycleMutationApplied: false,
  };
  await fs.mkdir(path.dirname(feedbackLogPath), {recursive: true});
  await fs.appendFile(feedbackLogPath, `${JSON.stringify(record)}\n`, 'utf8');
  await writeAtomic(path.join(formalRoot, 'review', 'motion-feedback.json'), {
    schemaVersion: 'autovideo-motion-feedback-receipt/v1',
    projectId,
    usageKey: parsed.usageKey,
    feedbackLogPath: feedbackLogRelativePath,
    latestFeedbackId: record.id,
    latestRevision: revision,
    record,
  });
  return buildMotionFeedback({workspaceRoot, formalRoot, projectId});
});

export {feedbackLogRelativePath, motionFeedbackInputSchema};
