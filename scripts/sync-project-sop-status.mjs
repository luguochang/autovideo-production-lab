import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileProductionManifest} from '../tools/planning-contract/compile-production-manifest.mjs';
import {buildScreenTextReview, buildSubtitleReview} from '../workflow-console/lib/text-review.mjs';
import {validatePublicationRightsRecord} from '../workflow-console/lib/rights-clearance.mjs';


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
};

const projectPath = (projectId) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) throw new Error(`Invalid project id: ${projectId}`);
  const target = path.resolve(projectsRoot, projectId);
  if (!target.startsWith(`${projectsRoot}${path.sep}`)) throw new Error('Project path escaped projects root.');
  return target;
};

const readJson = async (filePath, required = true) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${filePath}: ${error.message}`);
  }
};

const fileReceipt = async (projectDir, relativePath) => {
  const target = path.join(projectDir, relativePath);
  try {
    const stats = await fs.stat(target);
    if (!stats.isFile()) return {path: relativePath, exists: false, sha256: null};
    return {path: relativePath, exists: true, sha256: await sha256File(target)};
  } catch (error) {
    if (error?.code === 'ENOENT') return {path: relativePath, exists: false, sha256: null};
    throw error;
  }
};

// Keep the status digest aligned with the production compiler and workbench
// receipts. Runtime caches, Studio metadata, and build receipts are excluded
// because they are not render-frame inputs and contain nondeterministic data.
const compositionExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.woff', '.woff2', '.ttf', '.otf', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.webm',
]);
const compositionIgnoredDirectories = new Set([
  'node_modules', '.git', 'dist', 'renders', 'qa', '.thumbnails', '.waveform-cache',
]);
const compositionIgnoredFiles = new Set(['meta.json', 'data/composition-build.json']);

const hashCompositionManifest = async (rootDir) => {
  const files = [];
  const walk = async (directory) => {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!compositionIgnoredDirectories.has(entry.name)) await walk(target);
      } else if (entry.isFile() && compositionExtensions.has(path.extname(entry.name).toLowerCase())) {
        const relativePath = path.relative(rootDir, target).replaceAll('\\', '/');
        if (compositionIgnoredFiles.has(relativePath)) continue;
        const stats = await fs.stat(target);
        files.push({path: relativePath, bytes: stats.size, sha256: await sha256File(target)});
      }
    }
  };
  await walk(rootDir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {digest: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'), files};
};

const normalizedRelativePath = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

const safeProjectFile = (projectDir, relativePath) => {
  const target = path.resolve(projectDir, relativePath);
  if (target !== projectDir && !target.startsWith(`${projectDir}${path.sep}`)) return null;
  return target;
};

const validateManifestFiles = async (projectDir, manifest) => {
  if (!manifest || !Array.isArray(manifest.files)) return {ok: false, checked: 0, failures: ['manifest files are missing']};
  const failures = [];
  for (const item of manifest.files) {
    const target = safeProjectFile(projectDir, normalizedRelativePath(item.path));
    if (!target || typeof item.sha256 !== 'string') {
      failures.push(item.path ?? '<missing path>');
      continue;
    }
    let actual = null;
    try { actual = await sha256File(target); } catch { /* recorded below */ }
    if (actual !== item.sha256.toLowerCase()) failures.push(item.path);
  }
  return {ok: failures.length === 0, checked: manifest.files.length, failures};
};

const bindingPaths = {
  narrationLock: 'NarrationLock.json',
  templateLock: 'template-lock.json',
  alignment: 'audio/alignment.json',
  storyboard: 'plan/storyboard.json',
  shotManifest: 'plan/shot-manifest.json',
  graphIr: 'plan/graph-ir.json',
};

const currentOverrideBase = async (projectDir) => Object.fromEntries(
  await Promise.all(Object.entries(bindingPaths).map(async ([key, relativePath]) => {
    const receipt = await fileReceipt(projectDir, relativePath);
    if (!receipt.exists) throw new Error(`Cannot create overrides contract without ${relativePath}.`);
    return [key, {path: relativePath, sha256: receipt.sha256}];
  })),
);

export const validateOverrides = (value, projectId) => {
  const isRecord = (candidate) => candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
  const hasOnlyKeys = (candidate, keys) => Object.keys(candidate).every((key) => keys.includes(key));
  const requireValueLock = (lock, name) => {
    if (!isRecord(lock) || !hasOnlyKeys(lock, ['value']) || typeof lock.value !== 'string') {
      throw new Error(`Override ${name} lock must contain only a string value.`);
    }
  };
  const requireStructuredValueLock = (lock, name, predicate) => {
    if (!isRecord(lock) || !hasOnlyKeys(lock, ['value']) || !predicate(lock.value)) {
      throw new Error(`Override ${name} lock contains an invalid structured value.`);
    }
  };
  const validateTarget = (target) => {
    if (!isRecord(target)) throw new Error('Every override requires a target locator.');
    if (target.level !== undefined) {
      if (!['scene', 'cue', 'object'].includes(target.level)
        || !hasOnlyKeys(target, ['level', 'sceneId', 'cueId', 'objectId', 'sourcePath'])
        || typeof target.sceneId !== 'string' || !target.sceneId) {
        throw new Error('Canonical override targets require a scene, cue, or object level and a stable sceneId.');
      }
      if (target.level === 'scene' && (target.cueId !== undefined || target.objectId !== undefined)) {
        throw new Error('Scene override targets cannot contain cueId or objectId.');
      }
      if (target.level === 'cue'
        && (typeof target.cueId !== 'string' || !target.cueId || target.objectId !== undefined)) {
        throw new Error('Cue override targets require cueId and cannot contain objectId.');
      }
      if (target.level === 'object' && (typeof target.objectId !== 'string' || !target.objectId)) {
        throw new Error('Object override targets require objectId.');
      }
      return;
    }
    const legacyKinds = ['scene', 'cue', 'object', 'shot', 'graph', 'node', 'edge', 'caption', 'asset', 'composition-element'];
    if (!legacyKinds.includes(target.kind) || typeof target.id !== 'string' || !target.id
      || !hasOnlyKeys(target, ['kind', 'id', 'sourcePath'])) {
      throw new Error('Legacy override targets require a supported kind and stable id.');
    }
  };
  const validateLocks = (locks) => {
    if (!isRecord(locks) || !Object.keys(locks).length
      || !hasOnlyKeys(locks, ['text', 'hostPose', 'layout', 'visualVariant', 'visualType', 'motionRecipeRefs', 'assetRefs', 'carrierPayload', 'sfxRefs', 'provenanceRefs', 'timing'])) {
      throw new Error('Override locks must contain at least one supported lock.');
    }
    if (locks.text !== undefined) requireValueLock(locks.text, 'text');
    if (locks.hostPose !== undefined) requireValueLock(locks.hostPose, 'hostPose');
    if (locks.visualVariant !== undefined) {
      requireValueLock(locks.visualVariant, 'visualVariant');
      if (!['focus', 'signal', 'stack', 'route', 'contrast', 'close'].includes(locks.visualVariant.value)) {
        throw new Error('Override visualVariant lock is not supported by the continuous template.');
      }
    }
    if (locks.visualType !== undefined) {
      requireValueLock(locks.visualType, 'visualType');
      if (!['keyword', 'evidence-image', 'device-surface', 'diagram', 'data-proof', 'comparison', 'code-surface', 'object-metaphor'].includes(locks.visualType.value)) {
        throw new Error('Override visualType lock is not supported by the motion recipe library.');
      }
    }
    if (locks.motionRecipeRefs !== undefined) {
      requireStructuredValueLock(locks.motionRecipeRefs, 'motionRecipeRefs', (value) => Array.isArray(value)
        && value.length > 0
        && value.every((item) => isRecord(item) && typeof item.recipeId === 'string' && typeof item.version === 'string'));
    }
    if (locks.assetRefs !== undefined) {
      requireStructuredValueLock(locks.assetRefs, 'assetRefs', (value) => Array.isArray(value)
        && value.every((item) => isRecord(item) && typeof item.assetId === 'string' && item.zone === 'content.right'));
    }
    if (locks.carrierPayload !== undefined) {
      requireStructuredValueLock(locks.carrierPayload, 'carrierPayload', (value) => value === null || isRecord(value));
    }
    if (locks.sfxRefs !== undefined) {
      requireStructuredValueLock(locks.sfxRefs, 'sfxRefs', (value) => Array.isArray(value)
        && value.every((item) => isRecord(item) && typeof item.assetId === 'string' && typeof item.role === 'string'));
    }
    if (locks.provenanceRefs !== undefined) {
      requireStructuredValueLock(locks.provenanceRefs, 'provenanceRefs', (value) => Array.isArray(value)
        && value.length > 0
        && value.every((item) => typeof item === 'string' && item.length > 0));
    }
    if (locks.layout !== undefined) {
      if (!isRecord(locks.layout) || !hasOnlyKeys(locks.layout, ['value'])
        || !isRecord(locks.layout.value) || !Object.keys(locks.layout.value).length) {
        throw new Error('Override layout lock requires a non-empty object value.');
      }
    }
    if (locks.timing !== undefined) {
      const timing = locks.timing;
      const timingValue = timing?.value;
      if (!isRecord(timing) || !hasOnlyKeys(timing, ['value']) || !isRecord(timingValue)
        || !Object.keys(timingValue).length || !hasOnlyKeys(timingValue, ['start', 'end', 'duration'])) {
        throw new Error('Override timing lock requires start, end, or duration values.');
      }
      for (const [key, timingNumber] of Object.entries(timingValue)) {
        if (typeof timingNumber !== 'number' || !Number.isFinite(timingNumber)
          || timingNumber < 0 || (key === 'duration' && timingNumber === 0)) {
          throw new Error(`Override timing ${key} must be a valid non-negative number.`);
        }
      }
    }
  };

  if (value?.schemaVersion !== 'autovideo-overrides/v1') throw new Error('Invalid overrides schemaVersion.');
  if (value.projectId !== projectId) throw new Error('Overrides projectId mismatch.');
  if (!Number.isInteger(value.revision) || value.revision < 0) throw new Error('Overrides revision must be non-negative.');
  if (!Array.isArray(value.overrides)) throw new Error('Overrides must be an array.');
  if (!value.base || typeof value.base !== 'object' || !value.policy) throw new Error('Overrides base and policy are required.');
  for (const [key, binding] of Object.entries(value.base)) {
    if (!binding?.path || !/^[a-f0-9]{64}$/.test(binding.sha256 ?? '')) {
      throw new Error(`Override base binding ${key} is invalid.`);
    }
  }
  if (value.policy.directProductionEditsAllowed !== false
    || value.policy.stableTargetIdsRequired !== true
    || value.policy.invalidationReceiptRequired !== true) {
    throw new Error('Overrides policy must require stable IDs and invalidation receipts and forbid direct production edits.');
  }
  if (!value.overrides.length && (value.revision !== 0 || value.approvalStatus !== 'not-applicable-empty')) {
    throw new Error('Empty overrides must use revision 0 and not-applicable-empty approval status.');
  }
  for (const item of value.overrides) {
    if (!item.id || !Number.isInteger(item.revision) || item.revision < 1
      || !['active', 'superseded', 'reverted'].includes(item.status)
      || !['set', 'replace', 'add', 'remove', 'move', 'retime'].includes(item.operation)
      || !item.authoredBy || !item.authoredAt || !item.reason) {
      throw new Error('Every override requires revision metadata, a real author identity, timestamp, and reason.');
    }
    validateTarget(item.target);
    const hasPatch = isRecord(item.patch) && Object.keys(item.patch).length > 0;
    const hasLocks = item.locks !== undefined;
    if (!hasPatch && !hasLocks) throw new Error('Every override requires a non-empty patch or explicit locks.');
    if (item.patch !== undefined && !hasPatch) throw new Error('Override patch must be a non-empty object.');
    if (hasLocks) validateLocks(item.locks);
    const usesCurrentInvalidationField = item.invalidateTargets !== undefined;
    const usesLegacyInvalidationField = item.invalidates !== undefined;
    if (usesCurrentInvalidationField === usesLegacyInvalidationField) {
      throw new Error('Every override requires exactly one of invalidateTargets or legacy invalidates.');
    }
    const invalidateTargets = item.invalidateTargets ?? item.invalidates;
    if (!Array.isArray(invalidateTargets) || !invalidateTargets.length
      || invalidateTargets.some((target) => typeof target !== 'string' || !target)
      || new Set(invalidateTargets).size !== invalidateTargets.length) {
      throw new Error('Override invalidation targets must be a non-empty list of unique strings.');
    }
  }
  return value;
};

const ensureOverrides = async (projectDir, projectId, checkOnly) => {
  const overridePath = path.join(projectDir, 'overrides', 'overrides.json');
  const base = await currentOverrideBase(projectDir);
  let value = await readJson(overridePath, false);
  if (!value) {
    if (checkOnly) throw new Error('Missing overrides/overrides.json. Run without --check to initialize it.');
    value = {
      schemaVersion: 'autovideo-overrides/v1',
      projectId,
      revision: 0,
      createdAt: new Date().toISOString(),
      createdBy: 'automation:sop-status-sync',
      approvalStatus: 'not-applicable-empty',
      base,
      policy: {
        emptyMeans: 'No manual overrides have been recorded.',
        stableTargetIdsRequired: true,
        invalidationReceiptRequired: true,
        directProductionEditsAllowed: false,
      },
      overrides: [],
    };
    await fs.mkdir(path.dirname(overridePath), {recursive: true});
    await fs.writeFile(overridePath, stableJson(value), 'utf8');
  }
  validateOverrides(value, projectId);
  let baseCurrent = Object.entries(base).every(([key, receipt]) => (
    value.base?.[key]?.path === receipt.path && value.base?.[key]?.sha256 === receipt.sha256
  ));
  const isEmptyContract = value.revision === 0
    && value.approvalStatus === 'not-applicable-empty'
    && value.overrides.length === 0;
  if (!baseCurrent && isEmptyContract && !checkOnly) {
    value.base = base;
    value.updatedAt = new Date().toISOString();
    value.updatedBy = 'automation:sop-status-sync';
    value.baseRebaseReason = 'Upstream production inputs changed before any manual override was recorded.';
    await fs.writeFile(overridePath, stableJson(value), 'utf8');
    baseCurrent = true;
  }
  if (!baseCurrent) throw new Error('Overrides base is stale. Reconcile or supersede overrides before syncing status.');
  return value;
};

const evidenceMap = async (projectDir, projectId) => {
  const paths = {
    narrationLock: 'NarrationLock.json',
    templateLock: 'template-lock.json',
    contentApproval: 'input/content-approval.json',
    claimLedger: 'input/claim-ledger.json',
    pronunciation: 'input/pronunciation.json',
    voiceRecipe: 'audio/voice.recipe.json',
    finalAudio: 'audio/narration.final.wav',
    audioQa: 'audio/qa-report.json',
    audioApproval: 'audio/approval.json',
    listeningReview: 'audio/listening-review.json',
    alignment: 'audio/alignment.json',
    alignmentValidation: 'captions/alignment-validation.json',
    subtitles: 'captions/narration.zh-CN.srt',
    subtitleQa: 'qa/subtitle-qa.json',
    subtitleHumanReview: 'qa/subtitle-human-review.json',
    subtitleHumanApproval: 'qa/subtitle-human-approval.json',
    visualVarietyQa: 'qa/visual-variety-qa.json',
    audioHandoff: 'audio-handoff.json',
    publicationRights: 'receipts/rights/publication-rights.json',
    videoTask: 'VIDEO_TASK.md',
    styleReview: 'STYLE_REVIEW.md',
    styleSelection: 'style-selection.json',
    storyboard: 'plan/storyboard.json',
    shotManifest: 'plan/shot-manifest.json',
    graphIr: 'plan/graph-ir.json',
    graphLayout: 'plan/graph-layout.json',
    productionManifest: 'plan/production-manifest.json',
    assetManifest: 'AssetManifest.json',
    probeReview: 'review/probe-review.json',
    probeStill: 'review/stills/style-probe-hidden-complexity.png',
    probeMotion: 'review/probes/style-probe-hidden-complexity.mp4',
    overrides: 'overrides/overrides.json',
    fullComposition: 'production/hyperframes/index.html',
    compositionBuild: 'production/hyperframes/data/composition-build.json',
    hyperframesCheck: 'qa/hyperframes-check.json',
    screenTextFrameSet: 'qa/screen-text-frame-set.json',
    ocrReport: 'qa/ocr-report.json',
    screenTextHumanReview: 'qa/screen-text-human-review.json',
    screenTextHumanApproval: 'qa/screen-text-human-approval.json',
     finalQa: 'qa/report.json',
     finalPreview: 'qa/final-preview.json',
     humanFinalReview: 'qa/human-final-review.json',
     visualReview: 'qa/visual-review.json',
    deliveryQa: 'qa/delivery-report.json',
    deliveryManifest: 'delivery/delivery-manifest.json',
    internalReviewDelivery: 'qa/internal-review-delivery.json',
    internalRenderReceipt: `renders/${projectId}-internal-review.receipt.json`,
    cover: `renders/${projectId}-cover.png`,
    internalReviewVideo: `renders/${projectId}-internal-review.mp4`,
    masterVideo: 'renders/master.mp4',
  };
  return Object.fromEntries(await Promise.all(
    Object.entries(paths).map(async ([key, relativePath]) => [key, await fileReceipt(projectDir, relativePath)]),
  ));
};

const approvalRecord = (status, approvedBy, approvedAt, scope = null) => ({
  status,
  approvedBy: approvedBy ?? null,
  approvedAt: approvedAt ?? null,
  scope,
});

export const isGenuineHumanReviewApproval = (approval) => Boolean(
  approval
    && approval.approvalScope === 'human-review'
    && approval.humanReviewPerformed !== false,
);

export const nextActionForSopStatus = (status, currentNextAction = null) =>
  status?.readiness?.technicalVideoGenerationReady === true
    ? 'Watch the internal-review MP4, record human listening and visual feedback, then rerun only affected downstream stages.'
    : currentNextAction;

export const evaluateFormalCompositionReadiness = ({
  locksReady,
  gatesApproved,
  audioBindingsValid,
  humanListeningApproved,
  publicRightsApproved,
  planningContractsReady,
  motionLifecycleAuthorized,
}) => [
  locksReady,
  gatesApproved,
  audioBindingsValid,
  humanListeningApproved,
  publicRightsApproved,
  planningContractsReady,
  motionLifecycleAuthorized,
].every((value) => value === true);

export const buildSopStatus = async (projectDir, projectId) => {
  const state = await readJson(path.join(projectDir, 'project-state.json'));
  const narrationLock = await readJson(path.join(projectDir, 'NarrationLock.json'));
  const content = await readJson(path.join(projectDir, 'input', 'content-approval.json'));
  const pronunciation = await readJson(path.join(projectDir, 'input', 'pronunciation.json'));
  const audioHandoff = await readJson(path.join(projectDir, 'audio-handoff.json'));
  const publicationRights = await readJson(path.join(projectDir, 'receipts', 'rights', 'publication-rights.json'), false);
  const audioApproval = await readJson(path.join(projectDir, 'audio', 'approval.json'), false);
  const listeningReview = await readJson(path.join(projectDir, 'audio', 'listening-review.json'), false);
  const humanFinalReview = await readJson(path.join(projectDir, 'qa', 'human-final-review.json'), false);
  const finalPreviewReceipt = await readJson(path.join(projectDir, 'qa', 'final-preview.json'), false);
  const hyperframesCheckReceipt = await readJson(path.join(projectDir, 'qa', 'hyperframes-check.json'), false);
  const visualReviewReceipt = await readJson(path.join(projectDir, 'qa', 'visual-review.json'), false);
  const subtitleQaReceipt = await readJson(path.join(projectDir, 'qa', 'subtitle-qa.json'), false);
  const visualVarietyQaReceipt = await readJson(path.join(projectDir, 'qa', 'visual-variety-qa.json'), false);
  const compositionBuildReceipt = await readJson(path.join(projectDir, 'production', 'hyperframes', 'data', 'composition-build.json'), false);
  const productionManifestReceipt = await readJson(path.join(projectDir, 'plan', 'production-manifest.json'), false);
  const deliveryQaReceipt = await readJson(path.join(projectDir, 'qa', 'delivery-report.json'), false);
  const deliveryManifestReceipt = await readJson(path.join(projectDir, 'delivery', 'delivery-manifest.json'), false);
  const internalReviewDeliveryReceipt = await readJson(path.join(projectDir, 'qa', 'internal-review-delivery.json'), false);
  const overrides = await readJson(path.join(projectDir, 'overrides', 'overrides.json'));
  validateOverrides(overrides, projectId);
  const evidence = await evidenceMap(projectDir, projectId);
  evidence.motionLifecycleLedger = {
    ...await fileReceipt(root, 'style-library/motion-library/knowledge-explainer.lifecycle.json'),
    scope: 'workspace',
  };
  let planningContract = {passed: false, summary: null, error: null};
  let currentCompiledProductionManifest = null;
  if (['storyboard', 'shotManifest', 'graphIr', 'productionManifest'].every((key) => evidence[key].exists)) {
    try {
      const manifest = await compileProductionManifest({
        projectRoot: projectDir,
        internalFallbackRequest: productionManifestReceipt?.motionLifecycleAccess?.internalFallback?.request ?? null,
      });
      currentCompiledProductionManifest = manifest;
      planningContract = {
        passed: true,
        summary: {
          sceneCount: manifest.sceneCount,
          cueCount: manifest.cueCount,
          graphCount: manifest.scenes.filter((scene) => scene.graphRefs?.length).length,
          graphLayoutBound: Boolean(productionManifestReceipt?.bindings?.graphLayout),
          motionLifecycleAuthorized: manifest.motionLifecycleAccess.authorized,
          motionLifecycleDecisionSha256: manifest.motionLifecycleAccess.decisionSha256,
          deniedMotionRecipes: manifest.motionLifecycleAccess.access
            .filter((entry) => !entry.allowed)
            .map((entry) => ({recipeId: entry.recipeId, version: entry.version, state: entry.lifecycleState, reason: entry.reason})),
        },
        error: null,
      };
    } catch (error) {
      planningContract.error = String(error?.message || error);
    }
  }
  evidence.planningContract = planningContract;
  const listeningReviewBindings = {
    projectIdMatches: listeningReview?.projectId === projectId,
    narrationSha256Matches: listeningReview?.narrationSha256 === narrationLock.normalizedSha256,
    audioPathMatches: listeningReview?.audio?.path === evidence.finalAudio.path,
    audioSha256Matches: listeningReview?.audio?.sha256?.toLowerCase() === evidence.finalAudio.sha256,
  };
  const listeningReviewBindingsValid = evidence.listeningReview.exists
    && Object.values(listeningReviewBindings).every(Boolean);
  const acceptedTerms = listeningReviewBindingsValid
    ? new Set((listeningReview.terms ?? [])
      .filter((term) => term.decision === 'accepted')
      .map((term) => term.token))
    : new Set();
  const unresolvedTerms = pronunciation.entries
    .filter((entry) => entry.status !== 'approved-default' && !acceptedTerms.has(entry.token))
    .map((entry) => entry.token);
  const audioApprovalBindings = {
    projectIdMatches: audioApproval?.projectId === projectId,
    narrationSha256Matches: audioApproval?.narrationSha256 === narrationLock.normalizedSha256,
    audioSha256Matches: audioApproval?.audioSha256?.toLowerCase() === evidence.finalAudio.sha256,
    recipeSha256Matches: audioApproval?.schemaVersion !== 'autovideo-audio-approval/v4'
      || audioApproval?.recipeSha256?.toLowerCase() === evidence.voiceRecipe.sha256,
    listeningReviewSha256Matches: audioApproval?.schemaVersion !== 'autovideo-audio-approval/v4'
      || audioApproval?.listeningReviewSha256?.toLowerCase() === evidence.listeningReview.sha256,
  };
  const audioApprovalBindingsValid = evidence.audioApproval.exists
    && Object.values(audioApprovalBindings).every(Boolean);
  const humanListeningReceipt = audioApproval?.humanListening ?? {};
  const listeningReviewReceiptValid = listeningReviewBindingsValid
    && humanListeningReceipt.reviewPath === evidence.listeningReview.path
    && humanListeningReceipt.reviewSha256?.toLowerCase() === evidence.listeningReview.sha256;
  evidence.listeningReview = {
    ...evidence.listeningReview,
    status: listeningReview?.status ?? 'not-started',
    bindingStatus: !evidence.listeningReview.exists ? 'missing' : listeningReviewBindingsValid ? 'valid' : 'invalid',
    ...listeningReviewBindings,
    acceptedTerms: [...acceptedTerms],
  };
  evidence.audioApproval = {
    ...evidence.audioApproval,
    approvalScope: audioApproval?.approvalScope ?? null,
    humanListeningStatus: humanListeningReceipt.status ?? 'not-performed',
    bindingStatus: !evidence.audioApproval.exists ? 'missing' : audioApprovalBindingsValid ? 'valid' : 'invalid',
    ...audioApprovalBindings,
    listeningReviewReceiptValid,
  };
  const taskGate = state.gates?.task ?? {};
  const styleGate = state.gates?.style ?? {};
  const previewGate = state.gates?.finalPreview ?? {};
  const audioFilesValid = evidence.finalAudio.exists && evidence.alignment.exists && evidence.voiceRecipe.exists;
  const audioBindingsValid = audioFilesValid
    && audioHandoff.audio?.path === evidence.finalAudio.path
    && audioHandoff.audio?.sha256?.toLowerCase() === evidence.finalAudio.sha256
    && audioHandoff.alignment?.path === evidence.alignment.path
    && audioHandoff.alignment?.sha256?.toLowerCase() === evidence.alignment.sha256
    && audioHandoff.recipe?.path === evidence.voiceRecipe.path
    && audioHandoff.recipe?.sha256?.toLowerCase() === evidence.voiceRecipe.sha256
    && audioHandoff.narrationSha256 === narrationLock.normalizedSha256;
  const subtitleMachineQaValid = Boolean(
    evidence.subtitleQa.exists
      && subtitleQaReceipt?.projectId === projectId
      && subtitleQaReceipt?.machine?.status === 'passed'
      && subtitleQaReceipt.machine.alignmentSha256?.toLowerCase() === evidence.alignment.sha256
      && subtitleQaReceipt.machine.validationSha256?.toLowerCase() === evidence.alignmentValidation.sha256
      && subtitleQaReceipt.machine.srtSha256?.toLowerCase() === evidence.subtitles.sha256,
  );
  const visualVarietyQaValid = Boolean(
    evidence.visualVarietyQa.exists
      && visualVarietyQaReceipt?.projectId === projectId
      && visualVarietyQaReceipt?.machine?.status === 'passed'
      && visualVarietyQaReceipt.bindings?.shotManifest?.sha256?.toLowerCase() === evidence.shotManifest.sha256
      && visualVarietyQaReceipt.bindings?.storyboard?.sha256?.toLowerCase() === evidence.storyboard.sha256
      && visualVarietyQaReceipt.bindings?.graphIr?.sha256?.toLowerCase() === evidence.graphIr.sha256,
  );
  let subtitleHumanReviewView = null;
  try {
    subtitleHumanReviewView = await buildSubtitleReview({formalRoot: projectDir, projectId});
  } catch {
    subtitleHumanReviewView = null;
  }
  const subtitleReviewApproved = Boolean(
    subtitleHumanReviewView?.approval
      && subtitleHumanReviewView.review?.status === 'approved',
  );
  const subtitleHumanReviewApproved = Boolean(
    subtitleReviewApproved
      && isGenuineHumanReviewApproval(subtitleHumanReviewView.approval),
  );
  const motionLifecycleAuthorized = planningContract.passed
    && planningContract.summary?.motionLifecycleAuthorized === true;
  const planningContractsReady = planningContract.passed;
  const probeReady = ['probeReview', 'probeStill', 'probeMotion'].every((key) => evidence[key].exists);
  const locksReady = evidence.narrationLock.exists && evidence.templateLock.exists;
  const gatesApproved = taskGate.status === 'approved' && styleGate.status === 'approved';
  const humanListeningApproved = audioApprovalBindingsValid
    && audioApproval.approvalScope === 'human-listening'
    && humanListeningReceipt.status === 'approved'
    && listeningReview?.status === 'ready-for-approval'
    && listeningReviewReceiptValid;
  const rightsValidation = publicationRights
    ? await validatePublicationRightsRecord({
      formalRoot: projectDir,
      workspaceRoot: root,
      projectId,
      declaration: publicationRights.declaration,
      record: publicationRights,
    })
    : {valid: false, publicEligible: false, legacy: false, issues: ['Publication rights receipt is missing.']};
  const publicRightsApproved = audioHandoff.rightsStatus === 'approved' && rightsValidation.publicEligible;
  const formalReadyForComposition = subtitleMachineQaValid
    && subtitleHumanReviewApproved
    && visualVarietyQaValid
    && evaluateFormalCompositionReadiness({
    locksReady,
    gatesApproved,
    audioBindingsValid,
    humanListeningApproved,
    publicRightsApproved,
    planningContractsReady,
    motionLifecycleAuthorized,
  });
  const finalPreviewApproved = ['approved', 'approved-internal-only'].includes(previewGate.status);
  const finalReviewCompositionMatches = Boolean(
    humanFinalReview?.composition?.digest
      && humanFinalReview.composition.digest === finalPreviewReceipt?.compositionDigest
      && Number(humanFinalReview.composition.fileCount) === Number(finalPreviewReceipt?.fileCount),
  );
  const finalReviewPreviewMatches = Boolean(
    humanFinalReview?.previewReceipt?.sha256
      && humanFinalReview.previewReceipt.path === evidence.finalPreview.path
      && humanFinalReview.previewReceipt.sha256.toLowerCase() === finalPreviewReceipt?.humanReview?.previewReceiptSha256?.toLowerCase(),
  );
  const finalReviewReferenceMatches = Boolean(
    finalPreviewReceipt?.humanReview?.sha256
      && finalPreviewReceipt.humanReview.sha256.toLowerCase() === evidence.humanFinalReview.sha256,
  );
  const humanFinalReviewBindings = {
    projectIdMatches: humanFinalReview?.projectId === projectId,
    compositionMatches: finalReviewCompositionMatches,
    previewReceiptMatches: finalReviewPreviewMatches,
    approvalReferenceMatches: finalReviewReferenceMatches,
  };
  const humanFinalReviewReceiptValid = evidence.humanFinalReview.exists
    && Object.values(humanFinalReviewBindings).every(Boolean);
  const humanFinalReviewApproved = previewGate.approvalScope === 'human-review'
    && finalPreviewReceipt?.approvalScope === 'human-review'
    && humanFinalReviewReceiptValid;
  evidence.humanFinalReview = {
    ...evidence.humanFinalReview,
    status: humanFinalReview?.status ?? 'not-started',
    bindingStatus: !evidence.humanFinalReview.exists ? 'missing' : humanFinalReviewReceiptValid ? 'valid' : 'invalid',
    ...humanFinalReviewBindings,
  };
  const compositionRoot = path.join(projectDir, 'production', 'hyperframes');
  let compositionManifest = null;
  try {
    const stats = await fs.stat(compositionRoot);
    if (stats.isDirectory()) compositionManifest = await hashCompositionManifest(compositionRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const compositionVerification = {
    directoryExists: Boolean(compositionManifest),
    indexExists: evidence.fullComposition.exists,
    buildReceiptExists: evidence.compositionBuild.exists,
    strictCheckExists: evidence.hyperframesCheck.exists,
    strictCheckPassed: hyperframesCheckReceipt?.ok === true && hyperframesCheckReceipt?.strict === true,
    digestMatchesCheck: Boolean(compositionManifest?.digest
      && hyperframesCheckReceipt?.autoVideo?.compositionDigest === compositionManifest.digest),
    fileCountMatchesCheck: Boolean(compositionManifest
      && Number(hyperframesCheckReceipt?.autoVideo?.compositionFileCount) === compositionManifest.files.length),
    buildReceiptHashMatchesCheck: Boolean(evidence.compositionBuild.sha256
      && hyperframesCheckReceipt?.autoVideo?.buildReceiptSha256 === evidence.compositionBuild.sha256),
    sourceAudioContractPassed: hyperframesCheckReceipt?.autoVideo?.sourceAudioContract?.passed === true,
    inputManifestHashMatchesBuild: Boolean(evidence.productionManifest.sha256
      && compositionBuildReceipt?.inputManifest?.sha256 === evidence.productionManifest.sha256),
    graphLayoutBindingValid: evidence.graphLayout.exists
      ? Boolean(productionManifestReceipt?.bindings?.graphLayout?.path === evidence.graphLayout.path
        && productionManifestReceipt?.bindings?.graphLayout?.sha256 === evidence.graphLayout.sha256
        && compositionBuildReceipt?.continuity?.graphLayout?.sha256 === evidence.graphLayout.sha256)
      : !productionManifestReceipt?.bindings?.graphLayout
        && !compositionBuildReceipt?.continuity?.graphLayout?.sha256,
    motionLifecycleManifestReceiptCurrent: Boolean(
      currentCompiledProductionManifest?.motionLifecycleAccess?.decisionSha256
      && productionManifestReceipt?.motionLifecycleAccess?.decisionSha256
        === currentCompiledProductionManifest.motionLifecycleAccess.decisionSha256
      && productionManifestReceipt.motionLifecycleAccess.lifecycleLedger.sha256
        === evidence.motionLifecycleLedger.sha256
    ),
    motionLifecycleBuildAuthorized: Boolean(
      compositionBuildReceipt?.motionLifecycleAccess?.authorized === true
      && compositionBuildReceipt.motionLifecycleAccess.projectId === projectId
      && compositionBuildReceipt.motionLifecycleAccess.access?.length > 0
      && compositionBuildReceipt.motionLifecycleAccess.access.every((entry) => entry.allowed === true)
    ),
    motionLifecycleLedgerHashMatchesBuild: Boolean(
      evidence.motionLifecycleLedger.sha256
      && compositionBuildReceipt?.motionLifecycleAccess?.lifecycleLedger?.sha256
        === evidence.motionLifecycleLedger.sha256
    ),
    motionLifecyclePlanDecisionMatchesBuild: Boolean(
      productionManifestReceipt?.motionLifecycleAccess?.decisionSha256
      && compositionBuildReceipt?.motionLifecycleAccess?.plannedDecisionSha256
        === productionManifestReceipt.motionLifecycleAccess.decisionSha256
    ),
  };
  const fullCompositionVerified = Object.values(compositionVerification).every(Boolean);
  const internalReviewFrameVerification = {checked: 0, failures: []};
  if (Array.isArray(internalReviewDeliveryReceipt?.sampledFrames)) {
    for (const frame of internalReviewDeliveryReceipt.sampledFrames) {
      const target = safeProjectFile(projectDir, normalizedRelativePath(frame.path));
      let actual = null;
      try { actual = target ? await sha256File(target) : null; } catch { /* recorded below */ }
      internalReviewFrameVerification.checked += 1;
      if (!target || actual !== frame.sha256?.toLowerCase()) internalReviewFrameVerification.failures.push(frame.path ?? '<missing path>');
    }
  }
  const internalReviewDeliveryValid = Boolean(
    internalReviewDeliveryReceipt?.schemaVersion === 'autovideo-internal-review-delivery/v1'
      && internalReviewDeliveryReceipt.projectId === projectId
      && internalReviewDeliveryReceipt.releaseScope === 'internal-only'
      && internalReviewDeliveryReceipt.publicReleaseBlocked === true
      && internalReviewDeliveryReceipt.machine?.status === 'passed'
      && internalReviewDeliveryReceipt.composition?.digest === compositionManifest?.digest
      && Number(internalReviewDeliveryReceipt.composition?.fileCount) === Number(compositionManifest?.files.length)
      && internalReviewDeliveryReceipt.composition?.buildReceipt?.sha256 === evidence.compositionBuild.sha256
      && internalReviewDeliveryReceipt.composition?.hyperframesCheck?.sha256 === evidence.hyperframesCheck.sha256
      && internalReviewDeliveryReceipt.renderReceipt?.sha256 === evidence.internalRenderReceipt.sha256
      && internalReviewDeliveryReceipt.video?.path === evidence.internalReviewVideo.path
      && internalReviewDeliveryReceipt.video?.sha256 === evidence.internalReviewVideo.sha256
      && internalReviewDeliveryReceipt.cover?.path === evidence.cover.path
      && internalReviewDeliveryReceipt.cover?.sha256 === evidence.cover.sha256
      && internalReviewDeliveryReceipt.fullDecode?.status === 'passed'
      && Array.isArray(internalReviewDeliveryReceipt.sampledFrames)
      && internalReviewDeliveryReceipt.sampledFrames.length >= 3
      && internalReviewFrameVerification.failures.length === 0
  );
  let screenTextReviewView = null;
  if (compositionManifest) {
    try {
      screenTextReviewView = await buildScreenTextReview({
        formalRoot: projectDir,
        projectId,
        composition: {
          path: 'production/hyperframes',
          digest: compositionManifest.digest,
          fileCount: compositionManifest.files.length,
        },
      });
    } catch {
      screenTextReviewView = null;
    }
  }
  const screenTextReviewApproved = Boolean(
    screenTextReviewView?.approval
      && screenTextReviewView.review?.status === 'approved',
  );
  const screenTextHumanReviewApproved = Boolean(
    screenTextReviewApproved
      && isGenuineHumanReviewApproval(screenTextReviewView.approval),
  );
  const screenOcrStatus = screenTextReviewView?.ocr?.status
    ?? (evidence.ocrReport.exists ? 'stale' : 'unavailable');

  const finalPreviewMatchesComposition = Boolean(
    compositionManifest
      && finalPreviewReceipt?.projectId === projectId
      && finalPreviewReceipt.compositionDigest === compositionManifest.digest
      && Number(finalPreviewReceipt.fileCount) === compositionManifest.files.length,
  );
  const visualReviewReceiptShapeValid = Boolean(
    compositionManifest
      && visualReviewReceipt?.projectId === projectId
      && visualReviewReceipt.compositionDigest === compositionManifest.digest
      && visualReviewReceipt.status === 'passed-internal-sample-review'
      && Array.isArray(visualReviewReceipt.frames)
      && Number(compositionBuildReceipt?.sceneCount) > 0
      && visualReviewReceipt.frames.length === Number(compositionBuildReceipt.sceneCount)
      && Number(compositionBuildReceipt?.cueCount) > 0
      && Number(visualReviewReceipt.checks?.studioTimelineLoaded?.scenes) === Number(compositionBuildReceipt.sceneCount)
      && Number(visualReviewReceipt.checks?.studioTimelineLoaded?.captions) === Number(compositionBuildReceipt.cueCount),
  );
  const visualFrameHashesValid = visualReviewReceiptShapeValid && (await (async () => {
    for (const frame of visualReviewReceipt.frames) {
      const target = safeProjectFile(projectDir, normalizedRelativePath(frame.path));
      if (!target || typeof frame.sha256 !== 'string') return false;
      try {
        if (await sha256File(target) !== frame.sha256.toLowerCase()) return false;
      } catch {
        return false;
      }
    }
    return true;
  })());
  const visualReviewMatchesComposition = visualFrameHashesValid;

  const internalVideoShaMatchesQa = Boolean(
    deliveryQaReceipt?.projectId === projectId
      && deliveryQaReceipt.outputSha256
      && evidence.internalReviewVideo.exists
      && deliveryQaReceipt.outputSha256.toLowerCase() === evidence.internalReviewVideo.sha256,
  );
  const deliveryManifestFileVerification = await validateManifestFiles(projectDir, deliveryManifestReceipt);
  const deliveryVideoEntryMatchesQa = Boolean(
    deliveryManifestReceipt && deliveryQaReceipt?.outputSha256
      && deliveryManifestReceipt.files?.some((item) => item.sha256?.toLowerCase() === deliveryQaReceipt.outputSha256.toLowerCase()),
  );
  const deliveryManifestIntegrityValid = Boolean(
    deliveryManifestReceipt?.projectId === projectId
      && deliveryManifestReceipt?.integrity?.status === 'verified'
      && Number(deliveryManifestReceipt.integrity.fileCount) === Number(deliveryManifestReceipt.files?.length)
      && Number(deliveryManifestReceipt.integrity.optionalPresent)
        === Number((deliveryManifestReceipt.optionalArtifacts ?? []).filter((item) => item.status === 'present').length)
      && Number(deliveryManifestReceipt.integrity.optionalMissing)
        === Number((deliveryManifestReceipt.optionalArtifacts ?? []).filter((item) => item.status === 'missing').length)
      && deliveryManifestReceipt.integrity.deliveryVideoSha256?.toLowerCase() === deliveryQaReceipt?.outputSha256?.toLowerCase()
      && deliveryManifestFileVerification.ok
      && deliveryVideoEntryMatchesQa,
  );
  const deliveryVerification = {
    internalVideoShaMatchesQa,
    deliveryManifestExists: evidence.deliveryManifest.exists,
    deliveryManifestIntegrityValid,
    deliveryManifestFilesChecked: deliveryManifestFileVerification.checked,
    deliveryManifestFileFailures: deliveryManifestFileVerification.failures,
    deliveryVideoEntryMatchesQa,
  };
  const technicalVideoGenerationReady = fullCompositionVerified
    && subtitleMachineQaValid
    && visualVarietyQaValid
    && evidence.internalReviewVideo.exists
    && evidence.cover.exists
    && internalReviewDeliveryValid;
  const internalDeliveryReady = fullCompositionVerified
    && subtitleMachineQaValid
    && subtitleReviewApproved
    && screenTextReviewApproved
    && visualVarietyQaValid
    && finalPreviewApproved
    && finalPreviewMatchesComposition
    && visualReviewMatchesComposition
    && evidence.internalReviewVideo.exists
    && evidence.cover.exists
    && evidence.finalQa.exists
    && evidence.visualReview.exists
    && evidence.deliveryQa.exists
    && evidence.deliveryManifest.exists
    && internalVideoShaMatchesQa
    && deliveryManifestIntegrityValid;

  const contentV2Approved = content.schemaVersion === 'autovideo-content-approval/v2'
    && content.status === 'approved'
    && content.approvalScope === 'human-review'
    && content.wordingPolicy === 'immutable-after-approval'
    && content.approvedNarration?.sha256 === narrationLock.normalizedSha256;
  const contentApprovedForInternalProduction = contentV2Approved || content.approvedForInternalProduction === true;
  const contentApprovedForPublicRelease = !contentV2Approved && content.approvedForPublicRelease === true;
  const blockers = [...(content.publicReleaseBlockers ?? [])];
  if (contentV2Approved) blockers.push('Content approval locks wording for production; source publication rights still require a separate rights receipt.');
  if (!humanListeningApproved) blockers.push('Final narration has not received human-listening approval.');
  if (evidence.listeningReview.exists && !listeningReviewBindingsValid) {
    blockers.push('Listening review does not match the current final audio and NarrationLock hashes.');
  }
  if (audioApproval?.approvalScope === 'human-listening' && !audioApprovalBindingsValid) {
    blockers.push('Human-listening approval does not match the current final audio and NarrationLock hashes.');
  }
  if (!publicRightsApproved) blockers.push(`Publication rights are not public-release eligible: audio=${audioHandoff.rightsStatus}; ${rightsValidation.issues.join(' ') || 'unresolved rights items remain'}.`);
  if (!audioBindingsValid) blockers.push('Audio handoff hashes or NarrationLock binding are invalid.');
  if (!subtitleMachineQaValid) blockers.push('Subtitle machine QA is missing, stale, or failed for the current alignment and SRT.');
  if (!subtitleHumanReviewApproved) blockers.push('Subtitle cue-by-cue human semantic review is missing, stale, or incomplete.');
  if (!visualVarietyQaValid) blockers.push('Visual variety QA is missing, stale, or failed for the current storyboard, shot manifest, and Graph IR.');
  if (unresolvedTerms.length) blockers.push(`Pronunciation listening review remains for: ${unresolvedTerms.join(', ')}.`);
  if (planningContract.passed && !planningContract.summary.motionLifecycleAuthorized) {
    const denied = planningContract.summary.deniedMotionRecipes
      .map((entry) => `${entry.recipeId}@${entry.version} (${entry.state})`)
      .join(', ');
    blockers.push(`Motion recipes are not authorized for full production: ${denied}. Complete bounded probes and explicit project approvals.`);
  }
  if (!fullCompositionVerified) blockers.push('Full HyperFrames composition has not passed the bound build/check contract.');
  if (!screenTextHumanReviewApproved) blockers.push('Screen-text key-frame human review is missing, stale, or incomplete.');
  if (evidence.fullComposition.exists && compositionManifest && !compositionVerification.digestMatchesCheck) {
    blockers.push('Current composition digest does not match the HyperFrames check receipt.');
  }
  if (evidence.hyperframesCheck.exists && !compositionVerification.buildReceiptHashMatchesCheck) {
    blockers.push('HyperFrames check is not bound to the current composition build receipt.');
  }
  if (!finalPreviewApproved) blockers.push('Final Studio preview is not approved.');
  if (evidence.finalPreview.exists && !finalPreviewMatchesComposition) {
    blockers.push('Final preview receipt does not match the current composition digest or file count.');
  }
  if (evidence.visualReview.exists && !visualReviewMatchesComposition) {
    blockers.push('Visual review frames or composition digest are stale.');
  }
  if (evidence.deliveryQa.exists && !internalVideoShaMatchesQa) {
    blockers.push('Internal review MP4 does not match the delivery QA SHA-256.');
  }
  if (evidence.deliveryManifest.exists && !deliveryManifestIntegrityValid) {
    blockers.push('Delivery manifest integrity or delivery video hash is invalid.');
  }
  if (finalPreviewApproved && !humanFinalReviewApproved) {
    blockers.push('HyperFrames Studio full-timeline human review has not been approved.');
  }

  return {
    schemaVersion: 'autovideo-sop-status/v1',
    projectId,
    generatedBy: 'scripts/sync-project-sop-status.mjs',
    evidence,
    verification: {
      subtitleMachineQaValid,
      subtitleReviewApproved,
      subtitleHumanReviewApproved,
      screenTextReviewApproved,
      screenTextHumanReviewApproved,
      screenOcrStatus,
      screenOcrAvailable: screenTextReviewView?.ocr?.available === true,
      publicationRightsValid: rightsValidation.valid,
      publicationRightsPublicEligible: rightsValidation.publicEligible,
      publicationRightsLegacy: rightsValidation.legacy,
      visualVarietyQaValid,
      composition: compositionVerification,
      finalPreviewMatchesComposition,
      visualReviewMatchesComposition,
      delivery: deliveryVerification,
      internalReviewDelivery: {
        valid: internalReviewDeliveryValid,
        sampledFramesChecked: internalReviewFrameVerification.checked,
        sampledFrameFailures: internalReviewFrameVerification.failures,
      },
    },
    approvals: {
      content: approvalRecord(
        contentApprovedForInternalProduction ? 'approved-internal-only' : 'pending',
        content.approvedBy,
        content.approvedAt,
        contentApprovedForPublicRelease ? 'public-release' : 'internal-only',
      ),
      task: approvalRecord(taskGate.status, taskGate.approvedBy, taskGate.approvedAt, 'project-task'),
      style: approvalRecord(styleGate.status, styleGate.approvedBy, styleGate.approvedAt, styleGate.reviewMode ?? null),
      audio: approvalRecord(
        !audioApproval ? audioHandoff.status : audioApprovalBindingsValid ? 'approved' : 'invalid-binding',
        audioApproval?.approvedBy ?? audioHandoff.approvedBy,
        audioApproval?.approvedAt ?? audioHandoff.attachedAt,
        audioApproval?.approvalScope ?? audioHandoff.approvalScope,
      ),
      subtitleHumanReview: approvalRecord(
        subtitleHumanReviewApproved ? 'approved' : subtitleReviewApproved ? 'approved-internal-only' : 'pending',
        subtitleHumanReviewView?.approval?.approvedBy ?? null,
        subtitleHumanReviewView?.approval?.approvedAt ?? null,
        subtitleHumanReviewView?.approval?.approvalScope ?? null,
      ),
      screenTextHumanReview: approvalRecord(
        screenTextHumanReviewApproved ? 'approved' : screenTextReviewApproved ? 'approved-internal-only' : 'pending',
        screenTextReviewView?.approval?.approvedBy ?? null,
        screenTextReviewView?.approval?.approvedAt ?? null,
        screenTextReviewView?.approval?.approvalScope ?? null,
      ),
       finalPreview: approvalRecord(previewGate.status, previewGate.approvedBy, previewGate.approvedAt, previewGate.approvalScope ?? 'studio-full-timeline'),
    },
    milestones: {
      contentLock: locksReady && evidence.contentApproval.exists ? 'passed' : 'pending',
      audioTechnical: audioBindingsValid && evidence.audioQa.exists && evidence.audioHandoff.exists ? 'passed' : 'blocked',
      subtitleMachineQa: subtitleMachineQaValid ? 'passed' : 'blocked',
      subtitleHumanReview: subtitleHumanReviewApproved ? 'passed' : 'blocked',
      subtitleInternalReview: subtitleReviewApproved ? 'passed-internal-only' : 'blocked',
      visualVarietyQa: visualVarietyQaValid ? 'passed' : 'blocked',
      humanListening: humanListeningApproved ? 'passed' : 'blocked',
      publicationRights: publicRightsApproved ? 'passed' : rightsValidation.valid ? 'internal-only' : 'blocked',
      planningContracts: planningContractsReady ? 'passed' : 'pending',
      projectProbe: probeReady && gatesApproved ? 'passed-internal-review' : 'pending',
      overridesContract: overrides.overrides.length ? 'active' : 'passed-empty',
      fullComposition: fullCompositionVerified ? 'verified' : evidence.fullComposition.exists ? 'present-unverified' : 'pending',
      screenTextMachineOcr: screenTextReviewView?.ocr?.available
        ? 'passed'
        : evidence.screenTextFrameSet.exists
          ? screenOcrStatus
          : 'pending',
      screenTextHumanReview: screenTextHumanReviewApproved ? 'passed' : fullCompositionVerified ? 'blocked' : 'pending',
      screenTextInternalReview: screenTextReviewApproved ? 'passed-internal-only' : fullCompositionVerified ? 'blocked' : 'pending',
       finalPreview: finalPreviewApproved ? previewGate.status : 'pending',
       humanFinalReview: humanFinalReviewApproved
         ? 'passed'
         : finalPreviewApproved
           ? (evidence.humanFinalReview.exists ? 'pending-approval' : 'pending')
           : 'blocked',
      deliveryQa: evidence.deliveryQa.exists ? 'passed-internal-only' : 'pending',
      internalReviewMediaQa: internalReviewDeliveryValid ? 'passed' : 'pending',
      internalDelivery: internalDeliveryReady ? 'ready' : 'pending',
    },
    readiness: {
      internalPlanningAndProbeReady: locksReady && audioBindingsValid && subtitleMachineQaValid && subtitleReviewApproved && visualVarietyQaValid && planningContractsReady && probeReady && gatesApproved,
      internalCompositionReady: fullCompositionVerified,
      technicalVideoGenerationReady,
      internalDeliveryReady,
      formalReadyForComposition,
       readyForFinalRender: formalReadyForComposition && screenTextHumanReviewApproved && finalPreviewApproved && humanFinalReviewApproved,
    },
    release: {
      phase: technicalVideoGenerationReady ? 'internal-review-package' : 'production',
      scope: formalReadyForComposition ? 'public-release' : 'internal-only',
       publicReleaseBlocked: !formalReadyForComposition || !screenTextHumanReviewApproved || !finalPreviewApproved || !humanFinalReviewApproved,
      blockers: [...new Set(blockers)],
    },
  };
};

export const syncProjectSopStatus = async (projectId, {checkOnly = false} = {}) => {
  const projectDir = projectPath(projectId);
  const state = await readJson(path.join(projectDir, 'project-state.json'));
  if (state.projectId !== projectId) throw new Error('project-state.json projectId mismatch.');
  await ensureOverrides(projectDir, projectId, checkOnly);
  const expected = stableJson(await buildSopStatus(projectDir, projectId));
  const status = JSON.parse(expected);
  const statusPath = path.join(projectDir, 'SOP_STATUS.json');
  const internalReviewReady = status.readiness.technicalVideoGenerationReady === true;
  const releaseProjection = {
    phase: status.release.phase,
    technicalVideoGenerationReady: internalReviewReady,
    internalReviewReady,
    publicMasterReady: false,
    publicReleaseBlocked: status.release.publicReleaseBlocked,
    receipt: internalReviewReady ? status.evidence.internalReviewDelivery.path : null,
    video: internalReviewReady
      ? {path: status.evidence.internalReviewVideo.path, sha256: status.evidence.internalReviewVideo.sha256}
      : null,
    cover: internalReviewReady
      ? {path: status.evidence.cover.path, sha256: status.evidence.cover.sha256}
      : null,
  };
  const nextActionProjection = nextActionForSopStatus(status, state.nextAction ?? null);
  if (checkOnly) {
    const actual = await fs.readFile(statusPath, 'utf8');
    if (actual !== expected) throw new Error('SOP_STATUS.json is stale. Run video:sop-status without --check.');
    if (JSON.stringify(state.release ?? null) !== JSON.stringify(releaseProjection)) {
      throw new Error('project-state.json release projection is stale. Run video:sop-status without --check.');
    }
    if (state.nextAction !== nextActionProjection) {
      throw new Error('project-state.json next action is stale. Run video:sop-status without --check.');
    }
  } else {
    await fs.writeFile(statusPath, expected, 'utf8');
    if (JSON.stringify(state.release ?? null) !== JSON.stringify(releaseProjection)
        || state.nextAction !== nextActionProjection) {
      state.release = releaseProjection;
      state.nextAction = nextActionProjection;
      state.updatedAt = new Date().toISOString();
      await fs.writeFile(path.join(projectDir, 'project-state.json'), stableJson(state), 'utf8');
    }
  }
  return status;
};

const parseArgs = (argv) => {
  const args = {checkOnly: false};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') args.projectId = argv[++index];
    else if (argv[index] === '--check') args.checkOnly = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.projectId) throw new Error('Usage: node scripts/sync-project-sop-status.mjs --project <id> [--check]');
  return args;
};

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const status = await syncProjectSopStatus(args.projectId, args);
    console.log(JSON.stringify({
      ok: true,
      projectId: status.projectId,
      checkOnly: args.checkOnly,
      milestones: status.milestones,
      readiness: status.readiness,
      publicReleaseBlocked: status.release.publicReleaseBlocked,
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
