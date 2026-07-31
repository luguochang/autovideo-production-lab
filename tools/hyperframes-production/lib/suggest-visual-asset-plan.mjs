const VISUAL_TYPES = new Set(['image', 'icon', 'logo', 'brand']);
const PREFERRED_ASSETS = Object.freeze({
  keyword: ['icon-system-layers', 'icon-model-cpu'],
  'evidence-image': [],
  'device-surface': ['icon-click-pointer', 'icon-permission-check', 'icon-code-braces'],
  diagram: ['icon-workflow', 'icon-system-layers', 'icon-data-store', 'icon-debug-bug'],
  'data-proof': ['icon-data-store'],
  comparison: ['icon-click-pointer', 'icon-debug-bug', 'icon-system-layers'],
  'code-surface': ['icon-code-braces', 'icon-debug-bug', 'icon-permission-check'],
  'object-metaphor': ['icon-model-cpu', 'icon-system-layers'],
});

const normalize = (value) => String(value ?? '').toLocaleLowerCase();
const round3 = (value) => Math.round(value * 1000) / 1000;

const targetSuggestionCount = (shots) => {
  const count = Array.isArray(shots) ? shots.length : 0;
  if (count <= 2) return count;
  if (count <= 6) return 3;
  return Math.min(8, Math.ceil(count * 0.55));
};

const scoreAssetForShot = ({shot, asset, usedAssetIds}) => {
  if (usedAssetIds.has(asset.id)) return null;
  const visualType = shot.visualType ?? 'keyword';
  const source = normalize(`${shot.screenText?.text ?? ''} ${shot.narration ?? ''}`);
  const aliases = (asset.aliases ?? []).map(normalize).filter(Boolean);
  const matchedAliases = aliases.filter((alias) => source.includes(alias));
  if (!matchedAliases.length) return null;

  const preferred = PREFERRED_ASSETS[visualType] ?? [];
  const visualTypeScore = preferred.includes(asset.id) ? 1.4 : 0;
  const recipeScore = (shot.motionRecipeRefs ?? []).some((ref) => (asset.recipeIds ?? []).includes(ref.recipeId)) ? 0.5 : 0;
  return {
    asset,
    matchedAliases,
    score: round3(matchedAliases.length * 2 + visualTypeScore + recipeScore),
  };
};

export function suggestVisualAssetPlan({projectId, shots, assetLibrary}) {
  const sourceShots = Array.isArray(shots) ? shots : [];
  const assets = (assetLibrary?.assets ?? [])
    .filter((asset) => VISUAL_TYPES.has(asset?.type) && asset?.status !== 'retired')
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const targetCount = targetSuggestionCount(sourceShots);
  const usedAssetIds = new Set();
  const candidates = [];
  const deferred = [];

  for (const shot of sourceShots) {
    if (!shot?.cueId || !Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.end <= shot.start) continue;
    const ranked = assets
      .map((asset) => scoreAssetForShot({shot, asset, usedAssetIds}))
      .filter(Boolean)
      .filter((candidate) => candidate.score >= 3)
      .sort((left, right) => right.score - left.score || left.asset.id.localeCompare(right.asset.id));
    const winner = ranked[0];
    if (!winner) {
      deferred.push({cueId: shot.cueId, reason: 'no-semantic-local-asset-match'});
      continue;
    }
    if (candidates.length >= targetCount) {
      deferred.push({cueId: shot.cueId, reason: 'visual-density-cap'});
      continue;
    }
    usedAssetIds.add(winner.asset.id);
    candidates.push({
      id: `visual-cue-${String(candidates.length + 1).padStart(3, '0')}`,
      sourceCueIds: [shot.cueId],
      visualType: shot.visualType ?? 'keyword',
      assetId: winner.asset.id,
      assetType: winner.asset.type,
      role: winner.asset.type === 'icon' ? 'icon' : 'evidence',
      score: winner.score,
      matchedAliases: winner.matchedAliases,
      rationale: `Matched ${winner.matchedAliases.join(' / ')} against ${shot.visualType ?? 'keyword'}; this is a supporting object, not a replacement for the primary visual carrier.`,
    });
  }

  return {
    schemaVersion: 'autovideo-visual-asset-plan/v1',
    projectId,
    status: 'candidate',
    policy: {
      autoAttach: false,
      requiresExplicitImport: true,
      maxSuggestions: targetCount,
      maxAssetsPerCue: 1,
      duplicateAssetAvoidance: true,
      contentZone: 'content.right',
      hostAndCaptionImmutable: true,
    },
    candidates,
    deferred,
  };
}
