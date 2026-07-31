import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertPrimaryCarrierPayload} from './primary-carrier-adapters.mjs';

export const MOTION_LIBRARY_RELATIVE_PATH = 'style-library/motion-library/knowledge-explainer-v1.json';

export const VISUAL_TYPES = [
  'keyword',
  'evidence-image',
  'device-surface',
  'diagram',
  'data-proof',
  'comparison',
  'code-surface',
  'object-metaphor',
];

const DEFAULT_RECIPE_BY_VISUAL_TYPE = {
  keyword: 'keyword-handoff',
  'evidence-image': 'evidence-pivot',
  'device-surface': 'device-surface-tour',
  diagram: 'diagram-build',
  'data-proof': 'data-proof',
  comparison: 'comparison-split',
  'code-surface': 'code-proof',
  'object-metaphor': 'object-metaphor',
};

const DEFAULT_VARIANT_BY_RECIPE = {
  'keyword-handoff': 'focus',
  'evidence-pivot': 'signal',
  'device-surface-tour': 'signal',
  'diagram-build': 'route',
  'data-proof': 'signal',
  'comparison-split': 'contrast',
  'code-proof': 'stack',
  'object-metaphor': 'focus',
};

const CODE_SURFACE_PATTERN = /(?:\b(?:api|json|sql|rrf|hnsw|bm25|jieba|langgraph|langchain|llamaindex|pgvector|p99|sla|ndcg|mrr|ragas|token)\b|\u4ee3\u7801|\u65e5\u5fd7|\u914d\u7f6e|\u516c\u5f0f|\u8ba1\u7b97\u65b9\u5f0f|\u63d0\u793a\u8bcd|\u6b63\u5219|\u5b57\u6bb5|\u53c2\u6570|\u6307\u7eb9|\u7248\u672c\u7ba1\u7406|\u7f13\u5b58|\u8bcd\u5143)/iu;
const DEVICE_SURFACE_PATTERN = /(?:\b(?:ui|workflow|pipeline|service|framework|system|monitor|index|model|input|output)\b|\u5de5\u5177|\u6846\u67b6|\u670d\u52a1|\u5e73\u53f0|\u7cfb\u7edf|\u5de5\u4f5c\u53f0|\u76d1\u63a7|\u544a\u8b66|\u72b6\u6001\u673a|\u8c03\u7528\u94fe|\u89e3\u6790\u5668|\u68c0\u7d22\u5668|\u91cd\u6392|\u8bc4\u6d4b|\u4e0a\u7ebf|\u5de5\u7a0b|\u8f93\u5165|\u8f93\u51fa|\u6d41\u7a0b|\u62bd\u68c0|\u8bc4\u4f30|\u8def\u7531|\u53d1\u5e03|\u7d22\u5f15|\u6a21\u578b|\u53ec\u56de|\u751f\u6210|\u68c0\u7d22)/iu;
const CONTRAST_PATTERN = /(?:\b(?:versus|vs\.?|before|after)\b|\u4e0d\u662f|\u800c\u662f|\u76f8\u6bd4|\u5bf9\u6bd4|\u533a\u522b|\u4e0d\u7b49\u4e8e|\u2260)/iu;
const SEGMENT_BOUNDARY = /[\u3002\uff01\uff1f\uff1b\uff1a\uff0c,.;:!?]+/u;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const truncateCodePoints = (value, max) => [...clean(value)].slice(0, max).join('');

const splitLongSegment = (value, max) => {
  const points = [...clean(value)];
  if (points.length <= max) return [points.join('')];
  const output = [];
  for (let index = 0; index < points.length && output.length < 3; index += max) {
    output.push(points.slice(index, index + max).join(''));
  }
  return output;
};

const semanticSegments = (shot, max = 22) => {
  const narration = clean(shot?.narration);
  const parts = narration.split(SEGMENT_BOUNDARY).map((item) => clean(item)).filter(Boolean)
    .flatMap((item) => splitLongSegment(item, max));
  if (parts.length >= 2) return parts.slice(0, 3);
  const fallback = clean(shot?.screenText?.text) || narration;
  return splitLongSegment(fallback, max).slice(0, 3);
};

const illustrativeCarrierPayload = ({shot, visualType}) => {
  const sourceCueIds = [shot.cueId];
  const segments = semanticSegments(shot);
  const title = truncateCodePoints(shot.screenText?.text || shot.narration, visualType === 'code-surface' ? 42 : 36);
  const evidence = {
    status: 'illustrative-mock',
    label: '\u53e3\u64ad\u903b\u8f91\u793a\u610f',
  };
  if (visualType === 'code-surface') {
    const lines = [
      {kind: 'context', text: `SOURCE: ${shot.cueId}`},
      ...segments.map((segment, index) => ({kind: index === 0 ? 'focus' : 'context', text: `STEP_${index + 1}: ${segment}`})),
    ].slice(0, 10);
    return {
      adapterId: 'code-surface-bounded',
      adapterVersion: '1.0.0',
      zone: 'content.right',
      sourceReceipt: 'hf-registry:code-diff+code-highlight@5356890f+2e28ffdb',
      sourceCueIds,
      evidence,
      data: {title, language: 'pseudocode', mode: 'highlight', lines},
    };
  }
  if (visualType === 'device-surface') {
    const labels = segments.length >= 3 ? ['INPUT', 'PROCESS', 'OUTPUT'] : ['INPUT', 'OUTPUT'];
    const states = labels.map((label, index) => ({
      label,
      rows: [segments[Math.min(index, segments.length - 1)] || title],
    }));
    return {
      adapterId: 'device-surface-bounded',
      adapterVersion: '1.0.0',
      zone: 'content.right',
      sourceReceipt: 'hf-registry:app-showcase@c7e1b4d8ec2a2c1f',
      sourceCueIds,
      evidence,
      data: {
        title,
        productLabel: 'RAG \u5de5\u7a0b\u72b6\u6001',
        activeState: Math.min(1, states.length - 1),
        states,
      },
    };
  }
  return null;
};

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const motionLibraryReceiptId = (library) => `motion-library:${library.libraryId}@${library.version}`;

export const assertMotionRecipeLibrary = (library, expected = {}) => {
  if (library?.schemaVersion !== 'autovideo-motion-recipe-library/v1') {
    throw new Error('Unsupported motion recipe library schema.');
  }
  if (!library.libraryId || !library.version || !Array.isArray(library.recipes) || library.recipes.length === 0) {
    throw new Error('Motion recipe library is incomplete.');
  }
  if (expected.styleId && library.baseStyleId !== expected.styleId) {
    throw new Error(`Motion recipe library targets ${library.baseStyleId}, expected ${expected.styleId}.`);
  }
  if (expected.styleVersion && library.baseStyleVersion !== expected.styleVersion) {
    throw new Error(`Motion recipe library targets style ${library.baseStyleVersion}, expected ${expected.styleVersion}.`);
  }
  if (expected.paletteId && library.paletteId !== expected.paletteId) {
    throw new Error(`Motion recipe library targets ${library.paletteId}, expected ${expected.paletteId}.`);
  }
  if (library.requiredBackground !== '#F2DFC7'
      || library.hostPolicy?.defaultZone !== 'host.left'
      || library.hostPolicy?.cameraScope !== 'content-world-only'
      || library.hostPolicy?.captionPersistent !== true) {
    throw new Error('Motion recipe library violates the fixed AutoVideo brand shell.');
  }
  const ids = new Set();
  for (const recipe of library.recipes) {
    if (!recipe.id || !recipe.version || !VISUAL_TYPES.includes(recipe.visualType)) {
      throw new Error('Motion recipe entry is missing an ID, version, or supported visual type.');
    }
    if (ids.has(recipe.id)) throw new Error(`Duplicate motion recipe ID: ${recipe.id}.`);
    ids.add(recipe.id);
  }
  for (const [visualType, recipeId] of Object.entries(DEFAULT_RECIPE_BY_VISUAL_TYPE)) {
    const recipe = library.recipes.find((item) => item.id === recipeId);
    if (!recipe || recipe.visualType !== visualType) {
      throw new Error(`Motion recipe library is missing the default ${visualType} recipe ${recipeId}.`);
    }
  }
  return library;
};

export const loadMotionRecipeLibrary = async ({workspaceRoot, expected = {}}) => {
  const filePath = path.resolve(workspaceRoot, MOTION_LIBRARY_RELATIVE_PATH);
  const relative = path.relative(path.resolve(workspaceRoot), filePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Motion recipe library must stay inside the AutoVideo workspace.');
  }
  const raw = await fs.readFile(filePath, 'utf8');
  const library = assertMotionRecipeLibrary(JSON.parse(raw), expected);
  return {
    library,
    filePath,
    relativePath: MOTION_LIBRARY_RELATIVE_PATH,
    sha256: sha256(raw),
  };
};

export const visualTypeForScene = ({scene, graph = null}) => {
  if (scene?.role === 'compare') return 'comparison';
  if (scene?.role === 'process' && graph) return 'diagram';
  return 'keyword';
};

const semanticVisualCandidates = ({shot, scene, graph = null}) => {
  const text = `${clean(shot?.narration)} ${clean(shot?.screenText?.text)}`;
  const candidates = [];
  const graphCueIndex = graph?.sourceCueIds?.indexOf(shot.cueId) ?? -1;
  const sceneCueIndex = scene?.cueIds?.indexOf(shot.cueId) ?? -1;
  if (graphCueIndex >= 0 && graphCueIndex < 2) candidates.push('diagram');
  if ((scene?.role === 'compare' || CONTRAST_PATTERN.test(text)) && sceneCueIndex < 2) candidates.push('comparison');
  if (CODE_SURFACE_PATTERN.test(text)) candidates.push('code-surface');
  if (DEVICE_SURFACE_PATTERN.test(text) || semanticSegments(shot).length >= 3) candidates.push('device-surface');
  candidates.push('keyword');
  return [...new Set(candidates)];
};

export const defaultRecipeFor = ({library, visualType}) => {
  const recipeId = DEFAULT_RECIPE_BY_VISUAL_TYPE[visualType] ?? DEFAULT_RECIPE_BY_VISUAL_TYPE.keyword;
  const recipe = library.recipes.find((item) => item.id === recipeId);
  if (!recipe) throw new Error(`Motion recipe ${recipeId} is not present in ${library.libraryId}@${library.version}.`);
  return recipe;
};

const defaultParamsFor = ({recipe, scene}) => ({
  entrance: ['diagram-build', 'code-proof'].includes(recipe.id)
    ? 'wipe'
    : ['comparison-split', 'device-surface-tour'].includes(recipe.id)
      ? 'split'
      : 'lift',
  handoff: ['comparison-split', 'device-surface-tour'].includes(recipe.id)
    ? 'fade'
    : recipe.id === 'code-proof'
      ? 'slide-left'
      : 'compact-up',
  variant: scene?.role === 'close' ? 'close' : DEFAULT_VARIANT_BY_RECIPE[recipe.id] ?? 'focus',
  enterSeconds: recipe.id === 'diagram-build' ? 0.7 : recipe.id === 'code-proof' ? 0.64 : 0.58,
  handoffSeconds: 0.5,
  staggerSeconds: recipe.id === 'diagram-build' ? 0.09 : recipe.id === 'code-proof' ? 0.06 : 0.07,
});

const createCreativeFieldsForVisualType = ({shot, scene, visualType, library}) => {
  const recipe = defaultRecipeFor({library, visualType});
  const carrierPayload = illustrativeCarrierPayload({shot, visualType});
  return {
    visualType,
    motionRecipeRefs: [{
      libraryId: library.libraryId,
      libraryVersion: library.version,
      recipeId: recipe.id,
      version: recipe.version,
      params: defaultParamsFor({recipe, scene}),
      sourceCueIds: [shot.cueId],
    }],
    assetRefs: [],
    carrierPayload,
    sfxRefs: [],
    provenanceRefs: [
      motionLibraryReceiptId(library),
      ...(carrierPayload ? ['carrier:illustrative-mock/v1'] : []),
    ],
  };
};

export const createDefaultCreativeFields = ({shot, scene, graph = null, library}) => {
  const visualType = visualTypeForScene({scene, graph});
  return createCreativeFieldsForVisualType({shot, scene, visualType, library});
};

export const createSemanticCreativeSequence = ({shots, scenes, graphs = [], library}) => {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const graphBySceneId = new Map(graphs.map((graph) => [graph.sceneId, graph]));
  let previousVisualType = null;
  let currentRun = 0;
  return shots.map((shot) => {
    const scene = sceneById.get(shot.sceneId);
    const graph = graphBySceneId.get(shot.sceneId) ?? null;
    const candidates = semanticVisualCandidates({shot, scene, graph});
    let visualType = candidates[0];
    if (visualType === previousVisualType && currentRun >= 2) {
      visualType = candidates.find((candidate) => candidate !== previousVisualType)
        ?? ([...clean(shot.narration)].length >= 18 && previousVisualType !== 'device-surface' ? 'device-surface' : visualType);
    }
    if (visualType === previousVisualType) currentRun += 1;
    else {
      previousVisualType = visualType;
      currentRun = 1;
    }
    return {
      ...shot,
      ...createCreativeFieldsForVisualType({shot, scene, visualType, library}),
    };
  });
};

export const normalizeShotCreativeFields = ({shot, scene, graph = null, library}) => {
  const defaults = createDefaultCreativeFields({shot, scene, graph, library});
  const visualType = VISUAL_TYPES.includes(shot.visualType) ? shot.visualType : defaults.visualType;
  const recipeRefs = Array.isArray(shot.motionRecipeRefs) && shot.motionRecipeRefs.length
    ? shot.motionRecipeRefs
    : visualType === defaults.visualType
      ? defaults.motionRecipeRefs
      : [{
          ...defaults.motionRecipeRefs[0],
          recipeId: defaultRecipeFor({library, visualType}).id,
          version: defaultRecipeFor({library, visualType}).version,
        }];
  return {
    ...shot,
    visualType,
    motionRecipeRefs: recipeRefs,
    assetRefs: Array.isArray(shot.assetRefs) ? shot.assetRefs : [],
    carrierPayload: shot.carrierPayload ?? null,
    sfxRefs: Array.isArray(shot.sfxRefs) ? shot.sfxRefs : [],
    provenanceRefs: Array.isArray(shot.provenanceRefs) && shot.provenanceRefs.length
      ? shot.provenanceRefs
      : defaults.provenanceRefs,
  };
};

export const validateShotCreativeFields = ({shot, library}) => {
  if (!VISUAL_TYPES.includes(shot.visualType)) throw new Error(`${shot.cueId} has an unsupported visualType.`);
  if (!Array.isArray(shot.motionRecipeRefs) || shot.motionRecipeRefs.length === 0) {
    throw new Error(`${shot.cueId} has no motionRecipeRefs.`);
  }
  for (const ref of shot.motionRecipeRefs) {
    const recipe = library.recipes.find((item) => item.id === ref.recipeId && item.version === ref.version);
    if (!recipe) throw new Error(`${shot.cueId} references unknown recipe ${ref.recipeId}@${ref.version}.`);
    if (recipe.visualType !== shot.visualType) {
      throw new Error(`${shot.cueId} recipe ${ref.recipeId} does not support ${shot.visualType}.`);
    }
    if (ref.libraryId !== library.libraryId || ref.libraryVersion !== library.version) {
      throw new Error(`${shot.cueId} recipe reference is bound to a stale motion library.`);
    }
    if (!Array.isArray(ref.sourceCueIds) || !ref.sourceCueIds.includes(shot.cueId)) {
      throw new Error(`${shot.cueId} recipe reference does not preserve cue provenance.`);
    }
  }
  if (shot.assetRefs.some((ref) => ref.zone !== 'content.right')) {
    throw new Error(`${shot.cueId} assets may only enter content.right.`);
  }
  assertPrimaryCarrierPayload({shot});
  const allowedSfx = new Set(shot.motionRecipeRefs.flatMap((ref) => (
    library.recipes.find((item) => item.id === ref.recipeId)?.allowedSfxRoles ?? []
  )));
  for (const ref of shot.sfxRefs) {
    if (!allowedSfx.has(ref.role)) throw new Error(`${shot.cueId} SFX role ${ref.role} is not allowed by its motion recipe.`);
    if (ref.cueId !== shot.cueId) throw new Error(`${shot.cueId} SFX reference points at another cue.`);
  }
  return shot;
};

export const creativeContractDigest = (library) => sha256(serialize(assertMotionRecipeLibrary(library)));
