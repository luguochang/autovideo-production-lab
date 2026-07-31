import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import PQueue from 'p-queue';
import {z} from 'zod';
import {validateOverrides} from '../../scripts/sync-project-sop-status.mjs';
import {
  VISUAL_TYPES,
  loadMotionRecipeLibrary,
  motionLibraryReceiptId,
  normalizeShotCreativeFields,
} from '../../tools/planning-contract/creative-contract.mjs';
import {recipeDefinitionSha256} from '../../tools/motion-recipe-lifecycle/lifecycle.mjs';
import {recommendMotionRecipes} from '../../tools/planning-contract/motion-recipe-matcher.mjs';
import {
  PRIMARY_CARRIER_ADAPTERS,
  assertPrimaryCarrierPayload,
  verifyPrimaryCarrierProjectEvidence,
} from '../../tools/planning-contract/primary-carrier-adapters.mjs';
import {readProjectMediaInventory, serializeMediaAsset} from './media-assets.mjs';
import {readLatestMotionFeedbackSummary} from './motion-feedback.mjs';

const writeQueue = new PQueue({concurrency: 1});
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, '..', '..');
const motionLifecyclePath = path.join(workspaceRoot, 'style-library', 'motion-library', 'knowledge-explainer.lifecycle.json');
const visualVariants = ['focus', 'signal', 'stack', 'route', 'contrast', 'close'];
const lifecycleStates = new Set(['candidate', 'probe-passed', 'approved-project', 'promoted-template', 'retired']);

const targetSchema = z.discriminatedUnion('level', [
  z.object({level: z.literal('scene'), sceneId: z.string().min(1).max(120)}),
  z.object({
    level: z.literal('cue'),
    sceneId: z.string().min(1).max(120),
    cueId: z.string().min(1).max(120),
  }),
  z.object({
    level: z.literal('object'),
    sceneId: z.string().min(1).max(120),
    cueId: z.string().min(1).max(120),
    objectId: z.string().min(1).max(180),
  }),
]);

const overrideInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  target: targetSchema,
  text: z.string().max(500).optional(),
  hostPose: z.string().max(120).optional(),
  layoutPreset: z.enum(['host-left', 'host-right']).optional(),
  visualVariant: z.enum(visualVariants).optional(),
  motionRecipeId: z.string().trim().min(1).max(120).optional(),
  assetId: z.string().trim().min(1).max(120).optional(),
  clearAssets: z.boolean().optional(),
  carrierPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  sfxAssetId: z.string().trim().min(1).max(120).optional(),
  sfxRole: z.enum(['focus-hit', 'connector-draw', 'state-change', 'error', 'chapter-resolve']).optional(),
  clearSfx: z.boolean().optional(),
  reason: z.string().trim().min(2).max(500),
}).superRefine((value, context) => {
  const hasText = typeof value.text === 'string' && value.text.trim().length > 0;
  if (!hasText && !value.hostPose && !value.layoutPreset && !value.visualVariant && !value.motionRecipeId
      && !value.assetId && !value.clearAssets && value.carrierPayload === undefined && !value.sfxAssetId && !value.clearSfx) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Provide visual keywords, a host pose, a layout preset, a motion recipe, a media asset, a primary carrier, or a semantic SFX change.'});
  }
  if (value.target.level === 'object' && (value.hostPose || value.layoutPreset)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Object overrides cannot move the fixed host or scene layout.'});
  }
  if (value.target.level === 'cue' && value.layoutPreset) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Layout presets apply to scenes only.'});
  }
  if (value.target.level === 'scene' && value.visualVariant) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Visual variants apply to cue or object targets only.'});
  }
  if (value.target.level === 'scene' && (value.motionRecipeId || value.assetId || value.clearAssets || value.carrierPayload !== undefined || value.sfxAssetId || value.clearSfx)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Motion recipes, media assets, primary carriers, and SFX apply to cue or object targets.'});
  }
  if (value.assetId && value.clearAssets) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Choose an asset or clear assets, not both.'});
  }
  if (value.sfxAssetId && value.clearSfx) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'Choose an SFX asset or clear SFX, not both.'});
  }
  if (value.sfxAssetId && !value.sfxRole) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'A semantic SFX role is required with an SFX asset.'});
  }
});

const revertInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  reason: z.string().trim().min(2).max(500),
});

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const loadMotionRecipeLifecycle = async (motionLibraryBundle, injectedLifecycle = null) => {
  const lifecycle = injectedLifecycle ?? await readJson(motionLifecyclePath);
  if (lifecycle?.schemaVersion !== 'autovideo-motion-recipe-lifecycle/v1') {
    throw new Error('Unsupported motion recipe lifecycle schema version.');
  }
  if (lifecycle.library?.id !== motionLibraryBundle.library.libraryId
      || lifecycle.library?.version !== motionLibraryBundle.library.version
      || lifecycle.library?.sha256 !== motionLibraryBundle.sha256) {
    throw new Error('Motion recipe lifecycle ledger does not match the current motion library.');
  }
  const entries = Array.isArray(lifecycle.entries) ? lifecycle.entries : [];
  const byId = new Map();
  for (const entry of entries) {
    if (!entry?.recipeId || byId.has(entry.recipeId)) throw new Error('Motion recipe lifecycle ledger has duplicate or missing recipe IDs.');
    byId.set(entry.recipeId, entry);
  }
  return {document: lifecycle, byId};
};

const recipeProjectAccess = ({recipe, lifecycle, projectId}) => {
  const definitionSha256 = recipeDefinitionSha256(recipe);
  const entry = lifecycle.byId.get(recipe.id);
  if (!entry) {
    return {lifecycleState: 'missing', definitionSha256, allowedForProject: false, blockedReason: 'lifecycle-entry-missing'};
  }
  if (entry.recipeVersion !== recipe.version || entry.definitionSha256 !== definitionSha256) {
    return {lifecycleState: entry.state ?? 'invalid', definitionSha256, allowedForProject: false, blockedReason: 'lifecycle-definition-mismatch'};
  }
  if (!lifecycleStates.has(entry.state)) {
    return {lifecycleState: entry.state ?? 'invalid', definitionSha256, allowedForProject: false, blockedReason: 'lifecycle-state-unsupported'};
  }
  if (entry.state === 'promoted-template') {
    return {lifecycleState: entry.state, definitionSha256, allowedForProject: true, blockedReason: null};
  }
  if (entry.state === 'approved-project') {
    const approved = (entry.projectApprovals ?? []).some((approval) => approval?.projectId === projectId);
    return {
      lifecycleState: entry.state,
      definitionSha256,
      allowedForProject: approved,
      blockedReason: approved ? null : 'project-approval-missing',
    };
  }
  return {
    lifecycleState: entry.state,
    definitionSha256,
    allowedForProject: false,
    blockedReason: entry.state === 'retired' ? 'recipe-retired' : `${entry.state}-not-production-approved`,
  };
};

const pathsFor = (projectRoot) => ({
  overrides: path.join(projectRoot, 'overrides', 'overrides.json'),
  productionManifest: path.join(projectRoot, 'plan', 'production-manifest.json'),
  shotManifest: path.join(projectRoot, 'plan', 'shot-manifest.json'),
  graphIr: path.join(projectRoot, 'plan', 'graph-ir.json'),
  sourceMap: path.join(projectRoot, 'production', 'hyperframes', 'data', 'source-map.json'),
  buildReceipt: path.join(projectRoot, 'production', 'hyperframes', 'data', 'composition-build.json'),
  compiledOverrides: path.join(projectRoot, 'production', 'hyperframes', 'data', 'overrides.json'),
  hostAssets: path.join(projectRoot, 'production-assets', 'host-assets.manifest.json'),
});

const writeAtomicBytes = async (target, bytes) => {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, bytes);
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, {force: true}).catch(() => undefined);
    throw error;
  }
};

const writeAtomic = async (target, value) => writeAtomicBytes(target, Buffer.from(stableJson(value), 'utf8'));

const snapshotFile = async (target) => {
  try {
    return {existed: true, bytes: await fs.readFile(target)};
  } catch (error) {
    if (error?.code === 'ENOENT') return {existed: false, bytes: null};
    throw error;
  }
};

const restoreFileSnapshot = async (target, snapshot) => {
  if (snapshot.existed) {
    await writeAtomicBytes(target, snapshot.bytes);
    return;
  }
  await fs.rm(target, {force: true});
};

const commitOverrideMutation = async ({target, value, change, commitProjectChange}) => {
  const previous = await snapshotFile(target);
  await writeAtomic(target, value);
  if (!commitProjectChange) return null;
  try {
    return await commitProjectChange(change);
  } catch (error) {
    try {
      await restoreFileSnapshot(target, previous);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Production override transaction failed and ${target} could not be restored.`,
      );
    }
    throw error;
  }
};

const assertBaseCurrent = async (projectRoot, document) => {
  for (const [name, binding] of Object.entries(document.base ?? {})) {
    const target = path.resolve(projectRoot, binding.path);
    const root = path.resolve(projectRoot);
    if (target !== root && !target.toLowerCase().startsWith(`${root.toLowerCase()}${path.sep}`)) {
      throw new Error(`Override base ${name} leaves the formal project.`);
    }
    const actual = await sha256(target);
    if (actual !== binding.sha256) {
      throw new Error(`Override base ${name} is stale. Reconcile the upstream plan before editing video objects.`);
    }
  }
};

const targetKey = (target) => [target.level, target.sceneId, target.cueId ?? '', target.objectId ?? ''].join(':');
const touchedFields = (locks) => Object.keys(locks ?? {}).sort();

const layoutFor = (preset) => preset === 'host-left'
  ? {hostZone: 'host.left', contentZone: 'content.right'}
  : {hostZone: 'host.right', contentZone: 'content.left'};

const SFX_EVENT_BY_ROLE = {
  'focus-hit': 'enter',
  'connector-draw': 'draw',
  'state-change': 'click',
  error: 'error',
  'chapter-resolve': 'resolve',
};

const defaultMotionParams = (recipe, sourceValue) => ({
  entrance: recipe.id === 'diagram-build' ? 'wipe' : recipe.id === 'comparison-split' ? 'split' : 'lift',
  handoff: recipe.id === 'comparison-split' ? 'fade' : 'compact-up',
  variant: sourceValue.visualVariant && sourceValue.visualVariant !== 'auto' ? sourceValue.visualVariant : undefined,
  enterSeconds: recipe.id === 'diagram-build' ? 0.7 : 0.58,
  handoffSeconds: 0.5,
  staggerSeconds: recipe.id === 'diagram-build' ? 0.09 : 0.07,
});

const hostPolicyFor = (templateLock) => {
  const fixed = templateLock?.styleId === 'modern-ip-host-explainer'
    && templateLock?.paletteId === 'light-apricot';
  return fixed
    ? {
        fixed: true,
        hostZone: 'host.left',
        contentZone: 'content.right',
        cameraScope: 'content-world-only',
        layoutPresets: ['host-left'],
      }
    : {
        fixed: false,
        hostZone: null,
        contentZone: null,
        cameraScope: null,
        layoutPresets: ['host-left', 'host-right'],
      };
};

const buildTargets = ({productionManifest, shotManifest, sourceMap, overrides, motionLibraryBundle}, {overrideIds = null} = {}) => {
  const sceneById = new Map(productionManifest.scenes.map((scene) => [scene.id, scene]));
  const effectiveShots = shotManifest.shots.map((shot) => {
    const scene = sceneById.get(shot.sceneId);
    return normalizeShotCreativeFields({
      shot,
      scene,
      graph: scene?.graphRefs?.length ? {} : null,
      library: motionLibraryBundle.library,
    });
  });
  const shotByCue = new Map(effectiveShots.map((shot) => [shot.cueId, shot]));
  const scenes = productionManifest.scenes.map((scene) => ({
    level: 'scene',
    id: scene.id,
    sceneId: scene.id,
    label: `${scene.id} | ${scene.title}`,
    title: scene.title,
    hostPose: scene.layout.hostPose,
    hostZone: scene.layout.hostZone,
    contentZone: scene.layout.contentZone,
  }));
  const cues = effectiveShots.map((shot) => ({
    level: 'cue',
    id: shot.cueId,
    sceneId: shot.sceneId,
    cueId: shot.cueId,
    label: `${shot.cueId} | ${shot.screenText.text}`,
    narration: shot.narration ?? '',
    text: shot.screenText.text,
    hostPose: shot.hostPose,
    visualVariant: shot.visualVariant ?? 'auto',
    visualType: shot.visualType ?? 'keyword',
    motionRecipeRefs: shot.motionRecipeRefs ?? [],
    assetRefs: shot.assetRefs ?? [],
    carrierPayload: shot.carrierPayload ?? null,
    sfxRefs: shot.sfxRefs ?? [],
    provenanceRefs: shot.provenanceRefs ?? [],
    start: shot.start,
    end: shot.end,
  }));
  const objects = [];
  for (const [sceneId, entry] of Object.entries(sourceMap?.scenes ?? {})) {
    for (const [index, objectId] of (entry.editableTargets ?? []).entries()) {
      const cueId = entry.cueIds?.[index];
      const shot = shotByCue.get(cueId);
      if (!shot) continue;
      objects.push({
        level: 'object',
        id: objectId,
        objectId,
        sceneId,
        cueId,
        label: `${objectId} | ${shot.screenText.text}`,
        text: shot.screenText.text,
        visualVariant: shot.visualVariant ?? 'auto',
        visualType: shot.visualType ?? 'keyword',
        motionRecipeRefs: shot.motionRecipeRefs ?? [],
        assetRefs: shot.assetRefs ?? [],
        carrierPayload: shot.carrierPayload ?? null,
        sfxRefs: shot.sfxRefs ?? [],
        provenanceRefs: shot.provenanceRefs ?? [],
      });
    }
  }
  const collections = {scenes, cues, objects};
  const selectedOverrideIds = overrideIds ? new Set(overrideIds) : null;
  for (const override of [...(overrides?.overrides ?? [])]
    .filter((item) => selectedOverrideIds ? selectedOverrideIds.has(item.id) : item.status === 'active')
    .sort((left, right) => left.revision - right.revision)) {
    const collection = override.target.level === 'scene' ? scenes : override.target.level === 'cue' ? cues : objects;
    const target = collection.find((item) => (
      item.sceneId === override.target.sceneId
      && (override.target.cueId === undefined || item.cueId === override.target.cueId)
      && (override.target.objectId === undefined || item.objectId === override.target.objectId)
    ));
    if (!target) continue;
    const locks = override.locks ?? {};
    if (locks.text?.value !== undefined) {
      if (target.level === 'scene') target.title = locks.text.value;
      else target.text = locks.text.value;
    }
    if (locks.hostPose?.value !== undefined) target.hostPose = locks.hostPose.value;
    if (locks.layout?.value !== undefined) Object.assign(target, locks.layout.value);
    if (locks.visualVariant?.value !== undefined) target.visualVariant = locks.visualVariant.value;
    if (locks.visualType?.value !== undefined) target.visualType = locks.visualType.value;
    if (locks.motionRecipeRefs?.value !== undefined) target.motionRecipeRefs = locks.motionRecipeRefs.value;
    if (locks.assetRefs?.value !== undefined) target.assetRefs = locks.assetRefs.value;
    if (locks.carrierPayload?.value !== undefined) target.carrierPayload = locks.carrierPayload.value;
    if (locks.sfxRefs?.value !== undefined) target.sfxRefs = locks.sfxRefs.value;
    if (locks.provenanceRefs?.value !== undefined) target.provenanceRefs = locks.provenanceRefs.value;
  }
  return collections;
};

const compiledDirectiveFields = ['visualType', 'motionRecipeRefs', 'assetRefs', 'carrierPayload', 'sfxRefs', 'provenanceRefs'];
const stateFields = [
  'title',
  'text',
  'hostPose',
  'hostZone',
  'contentZone',
  'visualVariant',
  'visualType',
  'motionRecipeRefs',
  'assetRefs',
  'carrierPayload',
  'sfxRefs',
  'provenanceRefs',
];

const applyCompiledSourceMap = (targets, sourceMap) => {
  for (const [sceneId, sceneEntry] of Object.entries(sourceMap?.scenes ?? {})) {
    const sceneTarget = targets.scenes.find((item) => item.sceneId === sceneId);
    if (sceneTarget && sceneEntry.hostPose) sceneTarget.hostPose = sceneEntry.hostPose;
    for (const cueId of sceneEntry.cueIds ?? []) {
      const directive = sceneEntry.creativeDirectives?.[cueId] ?? null;
      const cueTargets = [
        targets.cues.find((item) => item.cueId === cueId),
        ...targets.objects.filter((item) => item.cueId === cueId),
      ].filter(Boolean);
      for (const target of cueTargets) {
        if (sceneEntry.visualVariants?.[cueId] !== undefined) target.visualVariant = sceneEntry.visualVariants[cueId];
        if (sceneEntry.visualTypes?.[cueId] !== undefined) target.visualType = sceneEntry.visualTypes[cueId];
        for (const field of compiledDirectiveFields) {
          if (directive && Object.hasOwn(directive, field)) target[field] = structuredClone(directive[field]);
        }
      }
    }
  }
  return targets;
};

const stateSnapshot = (target) => {
  if (!target) return null;
  return Object.fromEntries(stateFields
    .filter((field) => Object.hasOwn(target, field))
    .map((field) => [field, structuredClone(target[field])]));
};

const changedStateFields = (left, right) => stateFields.filter((field) => (
  JSON.stringify(left?.[field] ?? null) !== JSON.stringify(right?.[field] ?? null)
));

const stateValuesForLock = (target, lockField, value) => {
  if (lockField === 'text') return {[target.level === 'scene' ? 'title' : 'text']: value};
  if (lockField === 'layout') return {hostZone: value?.hostZone ?? null, contentZone: value?.contentZone ?? null};
  if (stateFields.includes(lockField)) return {[lockField]: value};
  return {};
};

const overrideStateForTarget = (target, overrides) => {
  const values = {};
  const sources = {};
  for (const item of [...(overrides ?? [])]
    .filter((override) => override.status === 'active' && targetKey(override.target) === targetKey(target))
    .sort((left, right) => left.revision - right.revision)) {
    for (const [lockField, lock] of Object.entries(item.locks ?? {})) {
      for (const [field, value] of Object.entries(stateValuesForLock(target, lockField, lock.value))) {
        values[field] = structuredClone(value);
        sources[field] = {
          source: 'override',
          lockField,
          overrideId: item.id,
          groupId: item.groupId ?? null,
          revision: item.revision,
          authoredBy: item.authoredBy,
          authoredAt: item.authoredAt,
          reason: item.reason,
        };
      }
    }
  }
  return {values: Object.keys(values).length ? values : null, sources};
};

const decorateTargetStates = ({generated, effective, compiled, overrides}) => Object.fromEntries(
  Object.keys(effective).map((collectionName) => {
    const generatedById = new Map(generated[collectionName].map((item) => [item.id, item]));
    const compiledById = new Map((compiled?.[collectionName] ?? []).map((item) => [item.id, item]));
    return [collectionName, effective[collectionName].map((item) => {
      const generatedState = stateSnapshot(generatedById.get(item.id));
      const effectiveState = stateSnapshot(item);
      const compiledState = stateSnapshot(compiledById.get(item.id));
      const overrideState = overrideStateForTarget(item, overrides);
      const fieldSources = Object.fromEntries(stateFields
        .filter((field) => Object.hasOwn(effectiveState, field))
        .map((field) => [field, overrideState.sources[field] ?? {source: 'generated'}]));
      return {
        ...item,
        states: {
          generated: generatedState,
          override: overrideState.values,
          effective: effectiveState,
          compiled: compiledState,
        },
        fieldSources,
        changedFields: {
          generatedToEffective: changedStateFields(generatedState, effectiveState),
          compiledToEffective: compiledState ? changedStateFields(compiledState, effectiveState) : [],
        },
      };
    })];
  }),
);

const sameIdSet = (left, right) => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id));
};

const loadDocuments = async (projectRoot, projectId, {motionRecipeLifecycle = null} = {}) => {
  const paths = pathsFor(projectRoot);
  const [overrides, productionManifest, shotManifest, graphIr, sourceMap, hostAssets, buildReceipt, compiledOverrides] = await Promise.all([
    readJson(paths.overrides),
    readJson(paths.productionManifest),
    readJson(paths.shotManifest),
    readJson(paths.graphIr),
    readJson(paths.sourceMap),
    readJson(paths.hostAssets),
    readJson(paths.buildReceipt).catch(() => null),
    readJson(paths.compiledOverrides).catch(() => null),
  ]);
  const templateLockPath = path.join(projectRoot, productionManifest.bindings?.templateLock?.path ?? 'template-lock.json');
  const templateLock = await readJson(templateLockPath);
  const [motionLibraryBundle, mediaInventory] = await Promise.all([
    loadMotionRecipeLibrary({
      workspaceRoot,
      expected: {
        styleId: templateLock.styleId,
        styleVersion: templateLock.styleVersion,
        paletteId: templateLock.paletteId,
      },
    }),
    readProjectMediaInventory({projectRoot, projectId}),
  ]);
  const motionLifecycle = await loadMotionRecipeLifecycle(motionLibraryBundle, motionRecipeLifecycle);
  validateOverrides(overrides, projectId);
  if (productionManifest.projectId !== projectId || shotManifest.projectId !== projectId
      || graphIr.projectId !== projectId || sourceMap.projectId !== projectId) {
    throw new Error('Production override inputs do not belong to the selected project.');
  }
  await assertBaseCurrent(projectRoot, overrides);
  return {
    paths,
    overrides,
    productionManifest,
    shotManifest,
    graphIr,
    sourceMap,
    buildReceipt,
    compiledOverrides,
    hostAssets,
    templateLock,
    motionLibraryBundle,
    motionLifecycle,
    mediaLedger: mediaInventory.ledger,
    mediaInventory,
    hostPolicy: hostPolicyFor(templateLock),
  };
};

const summarizeOverride = (item) => ({
  id: item.id,
  revision: item.revision,
  status: item.status,
  operation: item.operation,
  target: item.target,
  locks: item.locks,
  sourceValue: item.sourceValue ?? null,
  authoredBy: item.authoredBy,
  authoredAt: item.authoredAt,
  reason: item.reason,
  supersededBy: item.supersededBy ?? null,
  revertedAt: item.revertedAt ?? null,
  revertReason: item.revertReason ?? null,
});

export const readProductionOverrideEditor = async ({projectRoot, projectId, motionRecipeLifecycle = null}) => {
  const documents = await loadDocuments(projectRoot, projectId, {motionRecipeLifecycle});
  const generatedTargets = buildTargets(documents, {overrideIds: []});
  const effectiveTargets = buildTargets(documents);
  const rawAppliedOverrideIds = documents.buildReceipt?.appliedOverrideIds;
  const appliedOverrideIds = Array.isArray(rawAppliedOverrideIds)
    ? [...new Set(rawAppliedOverrideIds.filter((id) => typeof id === 'string'))]
    : [];
  const compiledOverrideDocument = documents.compiledOverrides ?? documents.overrides;
  const compiledOverrideIds = new Set((compiledOverrideDocument?.overrides ?? []).map((item) => item.id));
  const buildReceiptValid = Boolean(
    documents.buildReceipt
    && documents.buildReceipt.projectId === projectId
    && Array.isArray(rawAppliedOverrideIds),
  );
  const compiledTargets = buildReceiptValid && appliedOverrideIds.every((id) => compiledOverrideIds.has(id))
    ? applyCompiledSourceMap(buildTargets(
        {...documents, overrides: compiledOverrideDocument},
        {overrideIds: appliedOverrideIds},
      ), documents.sourceMap)
    : null;
  const targets = decorateTargetStates({
    generated: generatedTargets,
    effective: effectiveTargets,
    compiled: compiledTargets,
    overrides: documents.overrides.overrides,
  });
  const recipeDefinitions = documents.motionLibraryBundle.library.recipes.map((recipe) => {
    const access = recipeProjectAccess({recipe, lifecycle: documents.motionLifecycle, projectId});
    return {...recipe, ...access};
  });
  const recipes = recipeDefinitions.map((recipe) => {
    return {
      id: recipe.id,
      version: recipe.version,
      visualType: recipe.visualType,
      status: recipe.status,
      purpose: recipe.purpose,
      allowedSfxRoles: recipe.allowedSfxRoles,
      requiresProbe: ['candidate', 'probe-passed'].includes(recipe.lifecycleState),
      lifecycleState: recipe.lifecycleState,
      definitionSha256: recipe.definitionSha256,
      allowedForProject: recipe.allowedForProject,
      blockedReason: recipe.blockedReason,
    };
  });
  const feedbackSummary = await readLatestMotionFeedbackSummary({workspaceRoot});
  const motionRecommendations = recommendMotionRecipes({
    projectId,
    shots: targets.cues,
    scenes: documents.productionManifest.scenes,
    graphs: documents.graphIr.graphs ?? [],
    recipes: recipeDefinitions,
    feedback: feedbackSummary.feedback,
  });
  const mediaAssets = documents.mediaInventory.assets
    .filter((asset) => ['image', 'icon', 'logo', 'brand'].includes(asset.type))
    .map(serializeMediaAsset);
  const sfxAssets = documents.mediaInventory.assets
    .filter((asset) => asset.type === 'sfx')
    .map(serializeMediaAsset);
  const activeOverrideIds = documents.overrides.overrides.filter((item) => item.status === 'active').map((item) => item.id);
  const compileState = !documents.buildReceipt
    ? 'missing-build'
    : !buildReceiptValid || !compiledTargets
      ? 'unverified-build'
      : sameIdSet(activeOverrideIds, appliedOverrideIds)
        ? 'compiled'
        : 'pending-recompile';
  return {
    schemaVersion: 'autovideo-production-override-editor/v1',
    projectId,
    revision: documents.overrides.revision,
    compileState,
    appliedOverrideIds,
    activeOverrideIds,
    compiledAt: buildReceiptValid ? documents.buildReceipt.generatedAt ?? null : null,
    policy: {
      narrationLocked: true,
      timingLocked: true,
      directProductionEditsAllowed: false,
      motionRecommendationsAdvisoryOnly: true,
      supportedFields: ['visual-keywords', 'visual-variant', 'motion-recipe', 'primary-carrier', 'media-asset', 'semantic-sfx', 'host-pose', 'scene-layout'],
      fixedHostZone: documents.hostPolicy.fixed ? documents.hostPolicy.hostZone : null,
      fixedContentZone: documents.hostPolicy.fixed ? documents.hostPolicy.contentZone : null,
      cameraScope: documents.hostPolicy.cameraScope,
      layoutPresets: documents.hostPolicy.layoutPresets,
    },
    visualVariants,
    visualTypes: VISUAL_TYPES,
    carrierAdapters: Object.values(PRIMARY_CARRIER_ADAPTERS).map((adapter) => ({
      adapterId: adapter.adapterId,
      adapterVersion: adapter.adapterVersion,
      visualType: adapter.visualType,
      sourceReceipt: adapter.sourceReceipt,
      localOnly: true,
    })),
    motionLibrary: {
      id: documents.motionLibraryBundle.library.libraryId,
      version: documents.motionLibraryBundle.library.version,
      path: documents.motionLibraryBundle.relativePath,
      sha256: documents.motionLibraryBundle.sha256,
      status: documents.motionLibraryBundle.library.status,
      sfxPolicy: documents.motionLibraryBundle.library.sfxPolicy,
    },
    recipes,
    motionRecommendations: {
      ...motionRecommendations,
      feedbackSummary: {
        available: feedbackSummary.available,
        path: feedbackSummary.path,
        recordCount: feedbackSummary.recordCount,
        latestUsageCount: feedbackSummary.latestUsageCount,
        policy: feedbackSummary.policy,
      },
    },
    mediaAssets,
    sfxAssets,
    poses: (documents.hostAssets.poses ?? []).map((pose) => ({id: pose.id, use: pose.use ?? ''})),
    targets,
    overrides: documents.overrides.overrides.map(summarizeOverride),
  };
};

const sourceValueFor = ({target, targets}) => {
  const collection = target.level === 'scene' ? targets.scenes : target.level === 'cue' ? targets.cues : targets.objects;
  const match = collection.find((item) => (
    item.sceneId === target.sceneId
    && (target.cueId === undefined || item.cueId === target.cueId)
    && (target.objectId === undefined || item.objectId === target.objectId)
  ));
  if (!match) throw new Error(`Unknown stable ${target.level} target.`);
  return match;
};

export const saveProductionOverride = async ({
  projectRoot,
  projectId,
  input,
  authoredBy = 'user',
  motionRecipeLifecycle = null,
  commitProjectChange = null,
}) => writeQueue.add(async () => {
  const parsed = overrideInputSchema.parse(input);
  const documents = await loadDocuments(projectRoot, projectId, {motionRecipeLifecycle});
  if (parsed.expectedRevision !== undefined && parsed.expectedRevision !== documents.overrides.revision) {
    throw new Error(`Production override editor revision is stale: expected r${parsed.expectedRevision}, current r${documents.overrides.revision}. Reload before saving.`);
  }
  const targets = buildTargets(documents);
  const sourceValue = sourceValueFor({target: parsed.target, targets});
  const poseIds = new Set((documents.hostAssets.poses ?? []).map((pose) => pose.id));
  if (parsed.hostPose && !poseIds.has(parsed.hostPose)) throw new Error(`Unknown host pose: ${parsed.hostPose}`);
  if (documents.hostPolicy.fixed && parsed.layoutPreset && parsed.layoutPreset !== 'host-left') {
    throw new Error('This template locks the supplied host to host.left; only content-world may change.');
  }

  const nextRevision = documents.overrides.revision + 1;
  const groupId = `override-${String(nextRevision).padStart(3, '0')}-${crypto.randomUUID().slice(0, 8)}`;
  const locks = {};
  if (typeof parsed.text === 'string' && parsed.text.trim()) locks.text = {value: parsed.text.trim()};
  if (parsed.hostPose) locks.hostPose = {value: parsed.hostPose};
  if (parsed.layoutPreset) locks.layout = {value: layoutFor(parsed.layoutPreset)};
  if (parsed.visualVariant) locks.visualVariant = {value: parsed.visualVariant};

  const recipeById = new Map(documents.motionLibraryBundle.library.recipes.map((recipe) => [recipe.id, recipe]));
  let selectedRecipe = parsed.motionRecipeId ? recipeById.get(parsed.motionRecipeId) : null;
  if (parsed.motionRecipeId && !selectedRecipe) throw new Error(`Unknown motion recipe: ${parsed.motionRecipeId}`);
  if (selectedRecipe && parsed.motionRecipeId) {
    const access = recipeProjectAccess({recipe: selectedRecipe, lifecycle: documents.motionLifecycle, projectId});
    if (!access.allowedForProject) {
      throw new Error(`Motion recipe ${selectedRecipe.id} is not allowed for project ${projectId}: ${access.blockedReason}.`);
    }
  }
  const cueId = parsed.target.cueId;
  if (selectedRecipe) {
    if (!cueId) throw new Error('Motion recipe overrides require a stable cue target.');
    const existingRef = (sourceValue.motionRecipeRefs ?? []).find((ref) => ref.recipeId === selectedRecipe.id);
    locks.visualType = {value: selectedRecipe.visualType};
    locks.motionRecipeRefs = {value: [{
      libraryId: documents.motionLibraryBundle.library.libraryId,
      libraryVersion: documents.motionLibraryBundle.library.version,
      recipeId: selectedRecipe.id,
      version: selectedRecipe.version,
      params: existingRef?.params ?? defaultMotionParams(selectedRecipe, sourceValue),
      sourceCueIds: [cueId],
    }]};
    const activeAdapter = PRIMARY_CARRIER_ADAPTERS[sourceValue.carrierPayload?.adapterId];
    if (activeAdapter && activeAdapter.visualType !== selectedRecipe.visualType && parsed.carrierPayload === undefined) {
      locks.carrierPayload = {value: null};
    }
  }

  if (parsed.carrierPayload !== undefined) {
    if (!cueId) throw new Error('Primary carrier overrides require a stable cue target.');
    if (parsed.carrierPayload === null) {
      locks.carrierPayload = {value: null};
    } else {
      const visualType = selectedRecipe?.visualType ?? sourceValue.visualType;
      const payload = structuredClone(parsed.carrierPayload);
      const adapter = PRIMARY_CARRIER_ADAPTERS[payload.adapterId];
      if (!adapter) throw new Error(`Unknown primary carrier adapter: ${payload.adapterId ?? '(missing)'}`);
      payload.adapterVersion = adapter.adapterVersion;
      payload.zone = 'content.right';
      payload.sourceReceipt = adapter.sourceReceipt;
      payload.sourceCueIds = [cueId];
      assertPrimaryCarrierPayload({shot: {cueId, visualType, carrierPayload: payload}});
      await verifyPrimaryCarrierProjectEvidence({
        projectDir: projectRoot,
        shots: [{cueId, visualType, carrierPayload: payload}],
        mediaLedger: documents.mediaLedger,
      });
      locks.carrierPayload = {value: payload};
      locks.assetRefs = {value: (sourceValue.assetRefs ?? []).filter((ref) => ref.role === 'icon')};
    }
  }

  if (parsed.assetId || parsed.clearAssets) {
    if (!cueId) throw new Error('Media asset overrides require a stable cue target.');
    if (parsed.clearAssets) {
      locks.assetRefs = {value: []};
    } else {
      const selectedAsset = documents.mediaInventory.byId.get(parsed.assetId);
      const record = selectedAsset?.record;
      if (!record || !['image', 'icon', 'logo', 'brand'].includes(record.type)) {
        throw new Error(`Asset ${parsed.assetId} is not a registered visual asset in .media/manifest.jsonl.`);
      }
      if (!selectedAsset.selectionReady) throw new Error(`Asset ${parsed.assetId} failed media rights or integrity validation.`);
      const effectiveRecipe = selectedRecipe ?? recipeById.get(sourceValue.motionRecipeRefs?.[0]?.recipeId);
      const role = effectiveRecipe?.visualType === 'device-surface' ? 'interface'
        : effectiveRecipe?.visualType === 'code-surface' ? 'code'
          : effectiveRecipe?.visualType === 'object-metaphor' ? 'metaphor'
            : record.type === 'icon' ? 'icon' : 'evidence';
      locks.assetRefs = {value: [{assetId: record.id, role, zone: 'content.right', required: true, sourceCueIds: [cueId]}]};
      if (role !== 'icon') locks.carrierPayload = {value: null};
    }
  }

  if (parsed.sfxAssetId || parsed.clearSfx) {
    if (!cueId) throw new Error('Semantic SFX overrides require a stable cue target.');
    if (parsed.clearSfx) {
      locks.sfxRefs = {value: []};
    } else {
      const selectedAsset = documents.mediaInventory.byId.get(parsed.sfxAssetId);
      const record = selectedAsset?.record;
      if (!record || record.type !== 'sfx') throw new Error(`SFX ${parsed.sfxAssetId} is not registered in .media/manifest.jsonl.`);
      if (!selectedAsset.selectionReady) throw new Error(`SFX ${parsed.sfxAssetId} failed media rights or integrity validation.`);
      const effectiveRecipe = selectedRecipe ?? recipeById.get(sourceValue.motionRecipeRefs?.[0]?.recipeId);
      if (!effectiveRecipe?.allowedSfxRoles?.includes(parsed.sfxRole)) {
        throw new Error(`SFX role ${parsed.sfxRole} is not allowed by the selected motion recipe.`);
      }
      locks.sfxRefs = {value: [{
        assetId: record.id,
        role: parsed.sfxRole,
        event: SFX_EVENT_BY_ROLE[parsed.sfxRole],
        cueId,
        offsetMs: 120,
        gainDb: -18,
        duckingDb: 0,
      }]};
    }
  }

  if (selectedRecipe || parsed.assetId || parsed.clearAssets || parsed.carrierPayload !== undefined || parsed.sfxAssetId || parsed.clearSfx) {
    locks.provenanceRefs = {value: [
      ...new Set([
        ...(sourceValue.provenanceRefs ?? []),
        motionLibraryReceiptId(documents.motionLibraryBundle.library),
        `override:${groupId}`,
      ]),
    ]};
  }

  const nextFields = new Set(touchedFields(locks));
  const carriedLocks = [];
  for (const item of documents.overrides.overrides) {
    if (item.status !== 'active' || targetKey(item.target) !== targetKey(parsed.target)) continue;
    const previousFields = touchedFields(item.locks);
    if (!previousFields.some((field) => nextFields.has(field))) continue;
    item.status = 'superseded';
    item.supersededAt = new Date().toISOString();
    item.supersededBy = groupId;
    for (const field of previousFields.filter((candidate) => !nextFields.has(candidate))) {
      carriedLocks.push({field, value: item.locks[field], source: item});
    }
  }
  const authoredAt = new Date().toISOString();
  const changesMedia = Boolean(parsed.assetId || parsed.clearAssets || parsed.sfxAssetId || parsed.clearSfx);
  const changesRecipe = Boolean(selectedRecipe);
  const changesCarrier = parsed.carrierPayload !== undefined;
  const carrierIdentityChanged = changesCarrier && parsed.carrierPayload !== null
    && (sourceValue.carrierPayload?.adapterId !== parsed.carrierPayload.adapterId || sourceValue.carrierPayload?.adapterVersion !== parsed.carrierPayload.adapterVersion);
  const carrierEvidenceChanged = changesCarrier && parsed.carrierPayload !== null
    && JSON.stringify(sourceValue.carrierPayload?.evidence ?? null) !== JSON.stringify(parsed.carrierPayload.evidence ?? null);
  const invalidateFromStage = changesMedia || carrierEvidenceChanged ? 'rights-clearance' : changesRecipe || carrierIdentityChanged ? 'style-probe' : 'full-production';
  const invalidateTargets = changesMedia || carrierEvidenceChanged
    ? ['rights-clearance', 'visual-plan', 'diagram-assets', 'style-probe', 'full-production', 'qa-review', 'final-preview', 'render-deliver', 'delivery-qa', 'retrospective', 'package-export']
    : changesRecipe || carrierIdentityChanged
      ? ['style-probe', 'full-production', 'qa-review', 'final-preview', 'render-deliver', 'delivery-qa', 'retrospective', 'package-export']
      : ['full-production', 'qa-review', 'final-preview', 'render-deliver', 'delivery-qa', 'retrospective', 'package-export'];
  const entries = [
    ...carriedLocks.map(({field, value, source}, index) => ({
      id: `${groupId}-carry-${field}-${index + 1}`,
      revision: nextRevision,
      status: 'active',
      operation: 'set',
      target: parsed.target,
      sourceValue: source.sourceValue ?? sourceValue,
      locks: {[field]: value},
      authoredBy,
      authoredAt,
      reason: `Carry forward ${field} from ${source.id} while superseding another field.`,
      invalidateTargets,
      carriedFrom: source.id,
    })),
    ...Object.entries(locks).map(([field, value]) => ({
      id: `${groupId}-${field}`,
      revision: nextRevision,
      status: 'active',
      operation: 'set',
      target: parsed.target,
      sourceValue,
      locks: {[field]: value},
      authoredBy,
      authoredAt,
      reason: parsed.reason,
      invalidateTargets,
      groupId,
    })),
  ];
  documents.overrides.overrides.push(...entries);
  documents.overrides.revision = nextRevision;
  documents.overrides.approvalStatus = 'manual-overrides-active';
  documents.overrides.updatedAt = authoredAt;
  documents.overrides.updatedBy = authoredBy;
  validateOverrides(documents.overrides, projectId);
  const project = await commitOverrideMutation({
    target: documents.paths.overrides,
    value: documents.overrides,
    change: {
      overrideId: groupId,
      action: 'saved',
      reason: parsed.reason,
      invalidateFromStage,
    },
    commitProjectChange,
  });
  return {
    overrideId: groupId,
    overrideIds: entries.map((item) => item.id),
    revision: nextRevision,
    invalidateFromStage,
    project,
    editor: await readProductionOverrideEditor({projectRoot, projectId, motionRecipeLifecycle}),
  };
});

export const revertProductionOverride = async ({
  projectRoot,
  projectId,
  overrideId,
  input,
  revertedBy = 'user',
  motionRecipeLifecycle = null,
  commitProjectChange = null,
}) => writeQueue.add(async () => {
  const parsed = revertInputSchema.parse(input);
  const documents = await loadDocuments(projectRoot, projectId, {motionRecipeLifecycle});
  if (parsed.expectedRevision !== undefined && parsed.expectedRevision !== documents.overrides.revision) {
    throw new Error(`Production override editor revision is stale: expected r${parsed.expectedRevision}, current r${documents.overrides.revision}. Reload before reverting.`);
  }
  const item = documents.overrides.overrides.find((candidate) => candidate.id === overrideId);
  if (!item) throw new Error(`Unknown production override: ${overrideId}`);
  if (item.status !== 'active') throw new Error(`Only active production overrides can be reverted; ${overrideId} is ${item.status}.`);
  const revertedAt = new Date().toISOString();
  item.status = 'reverted';
  item.revertedAt = revertedAt;
  item.revertedBy = revertedBy;
  item.revertReason = parsed.reason;
  documents.overrides.revision += 1;
  documents.overrides.approvalStatus = documents.overrides.overrides.some((candidate) => candidate.status === 'active')
    ? 'manual-overrides-active'
    : 'manual-overrides-reverted';
  documents.overrides.updatedAt = revertedAt;
  documents.overrides.updatedBy = revertedBy;
  validateOverrides(documents.overrides, projectId);
  const lockFields = new Set(Object.keys(item.locks ?? {}));
  const invalidateFromStage = lockFields.has('assetRefs') || lockFields.has('sfxRefs')
    ? 'rights-clearance'
    : lockFields.has('motionRecipeRefs') || lockFields.has('visualType') || lockFields.has('carrierPayload')
      ? 'style-probe'
      : 'full-production';
  const project = await commitOverrideMutation({
    target: documents.paths.overrides,
    value: documents.overrides,
    change: {
      overrideId,
      action: 'reverted',
      reason: parsed.reason,
      invalidateFromStage,
    },
    commitProjectChange,
  });
  return {
    overrideId,
    revision: documents.overrides.revision,
    invalidateFromStage,
    project,
    editor: await readProductionOverrideEditor({projectRoot, projectId, motionRecipeLifecycle}),
  };
});

export const schemas = {overrideInputSchema, revertInputSchema};
