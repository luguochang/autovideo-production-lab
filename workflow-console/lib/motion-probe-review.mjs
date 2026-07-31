import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PQueue from 'p-queue';
import {z} from 'zod';

const writeQueue = new PQueue({concurrency: 1});
const probesRootRelativePath = 'experiments';
const reviewLogRelativePath = 'style-library/motion-library/probe-review-log.jsonl';
const lifecycleRelativePath = 'style-library/motion-library/knowledge-explainer.lifecycle.json';
export const motionProbeVisualCheckKeys = [
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
const visualCheckKeys = motionProbeVisualCheckKeys;

const reviewInputSchema = z.object({
  probeId: z.string().trim().min(1).max(120),
  decision: z.enum(['pending', 'passed', 'failed']),
  checks: z.record(z.boolean()),
  notes: z.string().trim().max(4000).default(''),
}).superRefine((value, context) => {
  for (const key of visualCheckKeys) {
    if (typeof value.checks[key] !== 'boolean') {
      context.addIssue({code: z.ZodIssueCode.custom, path: ['checks', key], message: `Missing visual check: ${key}`});
    }
  }
  if (value.decision === 'passed' && visualCheckKeys.some((key) => value.checks[key] !== true)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['decision'], message: 'A passed probe requires all visual checks to be true.'});
  }
  if (value.decision === 'failed' && value.notes.length < 2) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['notes'], message: 'A failed probe requires an actionable review note.'});
  }
});

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const normalizeRelative = (value) => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
const readJsonl = async (filePath) => {
  try {
    return (await fs.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
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

const workspacePath = (workspaceRoot, relativePath) => {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, normalizeRelative(relativePath));
  const prefix = `${root.toLowerCase()}${path.sep}`;
  if (target !== root && !target.toLowerCase().startsWith(prefix)) throw new Error('Probe path leaves the workspace.');
  return target;
};

const findFirstFile = async (directory, predicate) => {
  try {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && predicate(entry.name)) return candidate;
      if (entry.isDirectory()) {
        const nested = await findFirstFile(candidate, predicate);
        if (nested) return nested;
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
};

const recipeIds = async (workspaceRoot) => {
  const library = await readJson(workspacePath(workspaceRoot, 'style-library/motion-library/knowledge-explainer-v1.json'));
  const lifecycle = await readJson(workspacePath(workspaceRoot, lifecycleRelativePath));
  const lifecycleById = new Map((lifecycle.entries ?? []).map((entry) => [entry.recipeId, entry]));
  return new Map((library.recipes ?? []).map((recipe) => [recipe.id, {
    ...recipe,
    lifecycle: lifecycleById.get(recipe.id) ?? null,
  }]));
};

const canonicalEvidence = (draft) => draft?.schemaVersion === 'autovideo-motion-recipe-lifecycle-evidence/v1'
  && typeof draft?.recipeId === 'string'
  && draft?.probe?.kind === 'motion-probe';

const splitRecipeReference = (reference, fallbackVersion) => {
  const raw = String(reference || '').trim();
  const match = raw.match(/^(.+?)@([^@]+)$/);
  return match
    ? {recipeId: match[1], recipeVersion: match[2]}
    : {recipeId: raw, recipeVersion: fallbackVersion || null};
};

const probeRelativePath = (directoryName, declaredPath) => {
  const normalized = normalizeRelative(declaredPath);
  if (!normalized) return null;
  if (normalized === probesRootRelativePath || normalized.startsWith(`${probesRootRelativePath}/`)) return normalized;
  return normalizeRelative(`${probesRootRelativePath}/${directoryName}/${normalized}`);
};

const relativeFromWorkspace = (workspaceRoot, absolutePath) => normalizeRelative(path.relative(path.resolve(workspaceRoot), absolutePath));

const fileBinding = async (workspaceRoot, relativePath) => {
  if (!relativePath) return {path: null, ready: false, sha256: null};
  const target = workspacePath(workspaceRoot, relativePath);
  try {
    await fs.access(target);
    return {path: relativePath, ready: true, sha256: await sha256File(target)};
  } catch (error) {
    if (error?.code === 'ENOENT') return {path: relativePath, ready: false, sha256: null};
    throw error;
  }
};

const reviewMatchesBindings = (review, bindings) => Boolean(
  review?.bindings
  && review.bindings.recipeDefinitionSha256 === bindings.recipeDefinitionSha256
  && review.bindings.video?.path === bindings.video.path
  && review.bindings.video?.sha256 === bindings.video.sha256
  && review.bindings.contactSheet?.path === bindings.contactSheet.path
  && review.bindings.contactSheet?.sha256 === bindings.contactSheet.sha256
);

const buildProbe = async ({workspaceRoot, directoryName, knownRecipes, reviews}) => {
  const directory = workspacePath(workspaceRoot, `${probesRootRelativePath}/${directoryName}`);
  const draftPath = path.join(directory, 'lifecycle-evidence.draft.json');
  let draft = null;
  try { draft = await readJson(draftPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const auditPath = path.join(directory, 'INVARIANT_AUDIT.json');
  let audit = null;
  try { audit = await readJson(auditPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const sourcePath = path.join(directory, 'SOURCE_RECEIPT.json');
  let source = null;
  try { source = await readJson(sourcePath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const renderQaPath = path.join(directory, 'RENDER_QA.json');
  let renderQa = null;
  try { renderQa = await readJson(renderQaPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const rawRecipeReference = draft?.recipeId
    ?? draft?.probe?.recipeId
    ?? source?.recipe?.id
    ?? audit?.graph?.recipe
    ?? audit?.dataProof?.recipe;
  const parsedRecipe = splitRecipeReference(rawRecipeReference, draft?.recipeVersion ?? draft?.probe?.recipeVersion ?? source?.recipe?.version);
  const {recipeId} = parsedRecipe;
  const recipe = knownRecipes.get(recipeId);
  if (!recipeId || !recipe) return null;
  const recipeVersion = parsedRecipe.recipeVersion ?? recipe.version;
  const probe = draft?.probe ?? null;
  const declaredRenderPath = probe?.motionProbe?.path
    ?? draft?.render
    ?? audit?.automatedEvidence?.render?.path
    ?? renderQa?.artifact?.path;
  let renderPath = probeRelativePath(directoryName, declaredRenderPath);
  let renderBinding = await fileBinding(workspaceRoot, renderPath);
  if (!renderBinding.ready) {
    const discovered = await findFirstFile(directory, (name) => path.extname(name).toLowerCase() === '.mp4');
    if (discovered) {
      renderPath = relativeFromWorkspace(workspaceRoot, discovered);
      renderBinding = await fileBinding(workspaceRoot, renderPath);
    }
  }
  const declaredContactPath = probe?.stills?.find((item) => item.path?.endsWith('contact-sheet.jpg'))?.path
    ?? draft?.stillContactSheet
    ?? audit?.automatedEvidence?.contactSheet
    ?? renderQa?.contactSheet?.path;
  let contactPath = probeRelativePath(directoryName, declaredContactPath);
  let contactBinding = await fileBinding(workspaceRoot, contactPath);
  if (!contactBinding.ready) {
    const discovered = await findFirstFile(directory, (name) => name.toLowerCase() === 'contact-sheet.jpg');
    if (discovered) {
      contactPath = relativeFromWorkspace(workspaceRoot, discovered);
      contactBinding = await fileBinding(workspaceRoot, contactPath);
    }
  }
  const latestReview = reviews.filter((item) => item.probeId === directoryName).sort((left, right) => Number(left.revision || 0) - Number(right.revision || 0)).at(-1) ?? null;
  const existingVisualReview = probe?.visualReview ?? null;
  const bindings = {
    recipeDefinitionSha256: recipe.lifecycle?.definitionSha256 ?? null,
    video: {path: renderBinding.path, sha256: renderBinding.sha256},
    contactSheet: {path: contactBinding.path, sha256: contactBinding.sha256},
  };
  const currentReview = latestReview && reviewMatchesBindings(latestReview, bindings) ? latestReview : null;
  const currentEvidenceReview = !latestReview && reviewMatchesBindings(existingVisualReview, bindings) ? existingVisualReview : null;
  const invariantAudit = probe?.invariantAudit ?? (audit ? {
    passed: audit.passed === true
      || (audit.status === 'candidate' && audit.brandShell?.background === '#F2DFC7' && audit.camera?.scope === 'content-world-only'),
    checks: {
      ...(audit.checks ?? {}),
      landscape16x9: audit.checks?.landscape16x9 ?? (audit.composition?.width === 1920 && audit.composition?.height === 1080),
      lightApricotBackground: audit.checks?.lightApricotBackground ?? (audit.brandShell?.background === '#F2DFC7'),
      qVersionHostAssets: audit.checks?.qVersionHostAssets ?? audit.checks?.singleQVersionHostAsset ?? Boolean(audit.brandShell?.hostAssetPath),
      hostLeft: audit.checks?.hostLeft ?? (audit.brandShell?.hostZone === 'host.left'),
      contentRight: audit.checks?.contentRight ?? (audit.checks?.contentRight ?? audit.camera?.contentZone === 'content.right'),
      captionPersistent: audit.checks?.captionPersistent ?? (audit.brandShell?.captionZone === 'caption'),
      contentWorldOnlyCamera: audit.checks?.contentWorldOnlyCamera ?? (audit.camera?.scope === 'content-world-only'),
    },
  } : null);
  const strictCheck = probe?.hyperframesCheck
    ?? audit?.automatedEvidence?.strictCheck
    ?? (renderQa?.checks?.strictHyperframesCheckPassed === true ? {
      ok: true,
      strict: true,
      findingCount: 0,
      source: 'RENDER_QA.json',
    } : null);
  const officialReuse = probe?.officialReuseObserved
    ?? probe?.officialReuse?.sources
    ?? source?.officialSources
    ?? source?.sources
    ?? [];
  const durationSeconds = probe?.durationSeconds
    ?? audit?.composition?.rootDurationSeconds
    ?? audit?.automatedEvidence?.render?.durationSeconds
    ?? renderQa?.artifact?.durationSeconds
    ?? null;
  const technicalReady = Boolean(
    renderBinding.ready
    && contactBinding.ready
    && Number(durationSeconds) >= 3
    && Number(durationSeconds) <= 8
    && strictCheck?.ok === true
    && invariantAudit?.passed === true
    && officialReuse.length > 0
  );
  return {
    id: directoryName,
    directory: normalizeRelative(`${probesRootRelativePath}/${directoryName}`),
    recipeId,
    recipeVersion,
    title: recipe.purpose || recipeId,
    status: recipe.lifecycle?.state ?? recipe.status ?? 'candidate',
    canonicalEvidence: canonicalEvidence(draft),
    evidenceFormat: canonicalEvidence(draft) ? 'canonical' : 'legacy',
    evidencePath: normalizeRelative(`${probesRootRelativePath}/${directoryName}/lifecycle-evidence.draft.json`),
    videoPath: renderBinding.path,
    contactSheetPath: contactBinding.path,
    videoReady: renderBinding.ready,
    contactSheetReady: contactBinding.ready,
    durationSeconds,
    strictCheck,
    invariantAudit,
    officialReuse,
    technicalReady,
    bindings,
    review: currentReview ?? currentEvidenceReview,
    latestReview,
    reviewStale: Boolean(latestReview && !currentReview),
    reviewRevision: latestReview?.revision ?? 0,
    visualCheckKeys,
  };
};

export const listMotionProbes = async ({workspaceRoot}) => {
  const root = workspacePath(workspaceRoot, probesRootRelativePath);
  const knownRecipes = await recipeIds(workspaceRoot);
  const reviews = await readJsonl(workspacePath(workspaceRoot, reviewLogRelativePath));
  let entries;
  try {
    entries = await fs.readdir(root, {withFileTypes: true});
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const probes = [];
  for (const entry of entries.filter((item) => item.isDirectory() && /^E\d+-.+probe$/i.test(item.name))) {
    const probe = await buildProbe({workspaceRoot, directoryName: entry.name, knownRecipes, reviews});
    if (probe) probes.push(probe);
  }
  return probes.sort((left, right) => left.id.localeCompare(right.id, undefined, {numeric: true}));
};

const updateCanonicalEvidence = async ({workspaceRoot, probe, review}) => {
  if (!probe.canonicalEvidence) return {updated: false, reason: 'legacy-evidence-format'};
  const evidencePath = workspacePath(workspaceRoot, probe.evidencePath);
  const evidence = await readJson(evidencePath);
  if (!evidence.probe) throw new Error('Canonical probe evidence has no probe object.');
  evidence.probe.visualReview = {
    status: review.decision,
    reviewer: review.reviewer,
    reviewedAt: review.reviewedAt,
    checks: review.checks,
    bindings: review.bindings,
  };
  evidence.gateResults = (evidence.gateResults ?? []).map((gate) => gate.id === 'probe.visual-review'
    ? {...gate, passed: review.decision === 'passed', details: review.checks}
    : gate);
  if (!evidence.gateResults.some((gate) => gate.id === 'probe.visual-review')) {
    evidence.gateResults.push({id: 'probe.visual-review', passed: review.decision === 'passed', details: review.checks});
  }
  const blocked = new Set(evidence.blockedReasons ?? []);
  blocked.delete('missing-visual-review');
  blocked.delete('visual-review-failed');
  if (review.decision === 'pending') blocked.add('missing-visual-review');
  if (review.decision === 'failed') blocked.add('visual-review-failed');
  evidence.blockedReasons = [...blocked];
  await writeAtomic(evidencePath, evidence);
  return {updated: true, evidencePath: probe.evidencePath};
};

export const saveMotionProbeReview = async ({workspaceRoot, input, reviewer = 'user'}) => writeQueue.add(async () => {
  const parsed = reviewInputSchema.parse(input);
  const probes = await listMotionProbes({workspaceRoot});
  const probe = probes.find((item) => item.id === parsed.probeId);
  if (!probe) throw new Error(`Unknown motion probe: ${parsed.probeId}`);
  if (!probe.videoReady) throw new Error('The selected probe video is missing from the workspace.');
  if (parsed.decision === 'passed' && !probe.technicalReady) {
    throw new Error('The selected probe cannot pass human review until video, contact sheet, strict check, invariants, duration, and official reuse are all ready.');
  }
  const logPath = workspacePath(workspaceRoot, reviewLogRelativePath);
  const history = (await readJsonl(logPath)).filter((item) => item.probeId === parsed.probeId);
  const review = {
    schemaVersion: 'autovideo-motion-probe-review/v1',
    id: crypto.randomUUID(),
    probeId: parsed.probeId,
    recipeId: probe.recipeId,
    recipeVersion: probe.recipeVersion,
    revision: Number(history.at(-1)?.revision || 0) + 1,
    decision: parsed.decision,
    checks: Object.fromEntries(visualCheckKeys.map((key) => [key, parsed.checks[key]])),
    notes: parsed.notes,
    bindings: probe.bindings,
    reviewer: String(reviewer || 'user').slice(0, 100),
    reviewedAt: new Date().toISOString(),
    lifecycleMutationApplied: false,
  };
  await fs.mkdir(path.dirname(logPath), {recursive: true});
  await fs.appendFile(logPath, `${JSON.stringify(review)}\n`, 'utf8');
  const evidenceUpdate = await updateCanonicalEvidence({workspaceRoot, probe, review});
  const receiptPath = workspacePath(workspaceRoot, `${probe.directory}/review/probe-human-review.json`);
  await writeAtomic(receiptPath, {
    schemaVersion: 'autovideo-motion-probe-review-receipt/v1',
    probeId: parsed.probeId,
    recipeId: probe.recipeId,
    recipeVersion: probe.recipeVersion,
    review,
    evidenceUpdate,
    lifecycleMutationApplied: false,
  });
  return {review, evidenceUpdate, probes: await listMotionProbes({workspaceRoot})};
});

export const resolveMotionProbeFile = async ({workspaceRoot, probeId, relativePath}) => {
  const probes = await listMotionProbes({workspaceRoot});
  const probe = probes.find((item) => item.id === probeId);
  if (!probe) throw new Error(`Unknown motion probe: ${probeId}`);
  const allowed = new Set([probe.videoPath, probe.contactSheetPath, probe.evidencePath].filter(Boolean));
  const normalized = normalizeRelative(relativePath);
  if (!allowed.has(normalized)) throw new Error('This probe file is not exposed by the workbench.');
  const target = workspacePath(workspaceRoot, normalized);
  await fs.access(target);
  return {probe, target, relativePath: normalized};
};

export {reviewLogRelativePath, reviewInputSchema, visualCheckKeys};
