import {mediaLicenseReceiptFor, mediaProviderFor} from './media-ledger.mjs';

const ROLE_PREFERENCES = Object.freeze({
  'focus-hit': ['click', 'tick', 'pop'],
  'connector-draw': ['draw', 'whoosh', 'line'],
  'state-change': ['click', 'commit', 'switch'],
  error: ['error', 'failure', 'wrong'],
  'chapter-resolve': ['chime', 'resolve', 'confirm'],
});

const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase();
const round3 = (value) => Math.round(value * 1000) / 1000;

const recipeIdsForRole = (plan, role) => new Set((plan.cues ?? [])
  .filter((cue) => cue.bindingRole === role)
  .map((cue) => cue.motionRecipeId)
  .filter(Boolean));

const scoreAsset = ({asset, role, recipeIds}) => {
  if (asset?.type !== 'sfx' || asset.status === 'retired') return null;
  if (asset.sourceReady === false || asset.sourceShaMatches === false) return null;
  if (!(asset.semanticRoles ?? []).includes(role)) return null;
  const supportedRecipes = new Set(asset.recipeIds ?? []);
  const recipeMatches = [...recipeIds].filter((recipeId) => supportedRecipes.has(recipeId));
  const searchable = normalize(`${asset.id} ${asset.description} ${(asset.aliases ?? []).join(' ')}`);
  const intentMatches = (ROLE_PREFERENCES[role] ?? []).filter((token) => searchable.includes(token));
  const duration = Number(asset.durationSeconds);
  const shortSoundBonus = Number.isFinite(duration)
    ? role === 'chapter-resolve'
      ? Math.max(0, 0.5 - Math.abs(duration - 1.5) * 0.1)
      : Math.max(0, 0.7 - duration * 0.2)
    : 0;
  return {
    asset,
    score: round3(4 + recipeMatches.length * 2 + intentMatches.length * 0.5 + shortSoundBonus),
    recipeMatches,
    intentMatches,
  };
};

export function recommendSemanticSfxAssets({plan, assets}) {
  const roles = [...new Set((plan.bindings ?? [])
    .filter((binding) => binding.resolutionStatus !== 'resolved')
    .map((binding) => binding.role))];
  return roles.map((role) => {
    const recipeIds = recipeIdsForRole(plan, role);
    const ranked = (assets ?? [])
      .map((asset) => scoreAsset({asset, role, recipeIds}))
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || String(left.asset.id).localeCompare(String(right.asset.id)));
    const winner = ranked[0] ?? null;
    return {
      role,
      status: winner ? 'recommended' : 'unresolved',
      assetId: winner?.asset.id ?? null,
      score: winner?.score ?? null,
      recipeIds: [...recipeIds].sort(),
      recipeMatches: winner?.recipeMatches ?? [],
      rationale: winner
        ? `Matched ${role} to ${winner.asset.id} using its semantic role and ${winner.recipeMatches.length} recipe compatibility receipt(s).`
        : `No frozen local SFX asset supports ${role} for the current recipe set.`,
    };
  });
}

export function resolvedSemanticSfxBinding({binding, record}) {
  if (!binding?.role || record?.type !== 'sfx') throw new Error('A semantic SFX binding requires a registered SFX record.');
  const provider = mediaProviderFor(record);
  const licenseReceipt = mediaLicenseReceiptFor(record);
  if (!provider || !licenseReceipt) throw new Error(`SFX ${record.id} is missing provider or license provenance.`);
  return {
    ...binding,
    resolutionStatus: 'resolved',
    manifestPath: '.media/manifest.jsonl',
    mediaType: 'sfx',
    assetId: record.id,
    path: record.path,
    sha256: record.sha256,
    provider,
    licenseReceipt,
  };
}
