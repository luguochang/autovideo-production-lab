const ROLE_ANCHOR = Object.freeze({
  'focus-hit': 'motion-land',
  'connector-draw': 'connector-complete',
  'state-change': 'state-commit',
  error: 'error-state',
  'chapter-resolve': 'chapter-terminal',
});

const ROLE_GAIN_DB = Object.freeze({
  'focus-hit': -19,
  'connector-draw': -21,
  'state-change': -20,
  error: -18,
  'chapter-resolve': -21,
});

const RECIPE_ROLE_PREFERENCE = Object.freeze({
  'keyword-handoff': ['focus-hit'],
  'evidence-pivot': ['focus-hit', 'chapter-resolve'],
  'device-surface-tour': ['state-change', 'chapter-resolve'],
  'diagram-build': ['connector-draw', 'state-change', 'chapter-resolve'],
  'data-proof': ['focus-hit', 'chapter-resolve'],
  'comparison-split': ['state-change', 'chapter-resolve'],
  'code-proof': ['state-change', 'error', 'chapter-resolve'],
  'object-metaphor': ['focus-hit', 'state-change', 'chapter-resolve'],
});

const ROLE_PROGRESS = Object.freeze({
  'focus-hit': 0.28,
  'connector-draw': 0.58,
  'state-change': 0.58,
  error: 0.52,
  'chapter-resolve': 0.82,
});

const round3 = (value) => Math.round(value * 1000) / 1000;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const suggestedSemanticSfxCount = (durationSeconds) => {
  if (!(Number.isFinite(durationSeconds) && durationSeconds > 0)) return 0;
  if (durationSeconds < 20) return 1;
  if (durationSeconds < 60) return Math.min(3, Math.ceil(durationSeconds / 20));
  return clamp(Math.round(durationSeconds / 45) + 2, 4, 6);
};

const recipeForShot = (shot, recipes) => {
  const recipeId = shot.motionRecipeRefs?.[0]?.recipeId;
  return recipes.get(recipeId) ?? null;
};

const roleForRecipe = ({recipe, roleUsage}) => {
  const allowed = new Set(recipe.allowedSfxRoles ?? []);
  const preference = (RECIPE_ROLE_PREFERENCE[recipe.id] ?? recipe.allowedSfxRoles ?? [])
    .filter((role) => allowed.has(role));
  return preference.sort((left, right) => (roleUsage.get(left) ?? 0) - (roleUsage.get(right) ?? 0))[0] ?? null;
};

const bindingForRole = (role, existingBindings) => {
  const existing = existingBindings.find((binding) => binding?.role === role);
  if (existing) return structuredClone(existing);
  return {
    role,
    intent: {
      'focus-hit': 'short dry soft focus tick with no cinematic tail',
      'connector-draw': 'short restrained line draw accent without a scene whoosh',
      'state-change': 'quiet interface state commit click with a compact decay',
      error: 'short muted error tick without alarm or bass impact',
      'chapter-resolve': 'soft low chapter resolution chime without bass impact',
    }[role],
    resolutionStatus: 'unresolved',
    manifestPath: '.media/manifest.jsonl',
    mediaType: 'sfx',
    assetId: null,
    path: null,
    sha256: null,
    provider: null,
    licenseReceipt: null,
  };
};

export function suggestSemanticSfxPlan({projectId, durationSeconds, shots, motionLibrary, existingBindings = []}) {
  const targetCount = suggestedSemanticSfxCount(durationSeconds);
  const recipes = new Map((motionLibrary?.recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const eligible = (Array.isArray(shots) ? shots : []).flatMap((shot) => {
    const recipe = recipeForShot(shot, recipes);
    if (!recipe || !(Number.isFinite(shot.start) && Number.isFinite(shot.end)) || shot.end <= shot.start) return [];
    return [{shot, recipe, midpoint: (shot.start + shot.end) / 2}];
  });

  const selected = [];
  const usedCueIds = new Set();
  const roleUsage = new Map();
  const recipeUsage = new Map();
  for (let segment = 0; segment < targetCount; segment += 1) {
    const segmentCenter = durationSeconds * ((segment + 0.5) / targetCount);
    const ranked = eligible
      .filter(({shot}) => !usedCueIds.has(shot.cueId))
      .map((candidate) => {
        const role = roleForRecipe({recipe: candidate.recipe, roleUsage});
        const distance = Math.abs(candidate.midpoint - segmentCenter) / Math.max(durationSeconds, 1);
        const recipeNovelty = recipeUsage.has(candidate.recipe.id) ? 0 : 0.18;
        const roleNovelty = role && !roleUsage.has(role) ? 0.12 : 0;
        const semanticWeight = candidate.recipe.id === 'diagram-build' || candidate.recipe.id === 'comparison-split' || candidate.recipe.id === 'evidence-pivot' ? 0.12 : 0;
        return {...candidate, role, score: recipeNovelty + roleNovelty + semanticWeight - distance};
      })
      .filter((candidate) => candidate.role)
      .sort((left, right) => right.score - left.score || left.shot.start - right.shot.start);
    const winner = ranked[0];
    if (!winner) continue;

    const progress = ROLE_PROGRESS[winner.role] ?? 0.5;
    const eventTime = clamp(
      winner.shot.start + (winner.shot.end - winner.shot.start) * progress,
      winner.shot.start + 0.05,
      winner.shot.end - 0.05,
    );
    if (selected.some((item) => Math.abs(item.timeSeconds - eventTime) < 2.4)) continue;
    selected.push({
      shot: winner.shot,
      recipe: winner.recipe,
      role: winner.role,
      timeSeconds: round3(eventTime),
    });
    usedCueIds.add(winner.shot.cueId);
    roleUsage.set(winner.role, (roleUsage.get(winner.role) ?? 0) + 1);
    recipeUsage.set(winner.recipe.id, (recipeUsage.get(winner.recipe.id) ?? 0) + 1);
  }

  selected.sort((left, right) => left.timeSeconds - right.timeSeconds);
  const usedRoles = [...new Set(selected.map((item) => item.role))];
  return {
    schemaVersion: 'autovideo-semantic-sfx-plan/v1',
    planId: `${projectId}-sparse-sfx`,
    version: '1.0.0',
    status: 'candidate',
    styleLock: {
      baseStyleId: 'modern-ip-host-explainer',
      paletteId: 'light-apricot',
      requiredBackground: '#F2DFC7',
      hostZone: 'host.left',
      contentZone: 'content.right',
      captionZone: 'caption',
      cameraScope: 'content-world-only',
    },
    motionLibraryRef: {
      libraryId: motionLibrary.libraryId,
      version: motionLibrary.version,
      path: 'style-library/motion-library/knowledge-explainer-v1.json',
    },
    timelineDurationSeconds: round3(durationSeconds),
    policy: {
      mode: 'semantic-only',
      maxPerMinute: Math.min(6, motionLibrary.sfxPolicy.maxPerMinute),
      minGapSeconds: Math.max(2.4, motionLibrary.sfxPolicy.minGapSeconds),
      maxSimultaneous: 1,
      narrationPriority: true,
      allowAmbientLoops: false,
      allowDecorativeHits: false,
      assetPolicy: {
        resolver: motionLibrary.sfxPolicy.resolver,
        manifestPath: motionLibrary.sfxPolicy.manifestPath,
        pathPrefix: motionLibrary.sfxPolicy.pathPrefix,
        mediaType: 'sfx',
        allowRemoteAtRender: false,
        allowUnregisteredAssets: false,
        requireSha256: true,
      },
      mix: {
        defaultCueGainDb: -20,
        narrationGainChangeDb: 0,
        peakDbfsMax: -6,
        fadeInMs: 8,
        fadeOutMs: 80,
      },
    },
    bindings: usedRoles.map((role) => bindingForRole(role, existingBindings)),
    cues: selected.map((item, index) => ({
      id: `sfx-cue-${String(index + 1).padStart(3, '0')}`,
      timeSeconds: item.timeSeconds,
      role: item.role,
      bindingRole: item.role,
      motionRecipeId: item.recipe.id,
      sourceCueIds: [item.shot.cueId],
      semanticEvent: `${item.recipe.id} reaches its visible ${ROLE_ANCHOR[item.role]} state.`,
      anchor: ROLE_ANCHOR[item.role],
      offsetSeconds: 0,
      gainDb: ROLE_GAIN_DB[item.role],
      targetLayer: 'content-world',
    })),
  };
}
