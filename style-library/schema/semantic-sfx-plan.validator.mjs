const STYLE_LOCK = Object.freeze({
  baseStyleId: 'modern-ip-host-explainer',
  paletteId: 'light-apricot',
  requiredBackground: '#F2DFC7',
  hostZone: 'host.left',
  contentZone: 'content.right',
  captionZone: 'caption',
  cameraScope: 'content-world-only',
});

const ASSET_FIELDS = ['assetId', 'path', 'sha256', 'provider', 'licenseReceipt'];
const ROLE_ANCHORS = Object.freeze({
  'focus-hit': 'motion-land',
  'connector-draw': 'connector-complete',
  'state-change': 'state-commit',
  error: 'error-state',
  'chapter-resolve': 'chapter-terminal',
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isSemver = (value) => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
const resolvedSfxPathPattern = /^\.media\/audio\/sfx\/[^/]+\.(?:wav|mp3|m4a|aac|ogg|flac)$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const assetIdPattern = /^[a-z][a-z0-9_-]*$/;

export function validateSemanticSfxPlan(plan, motionLibrary) {
  const errors = [];
  const fail = (code, path, message, details = undefined) => {
    errors.push({code, path, message, ...(details === undefined ? {} : {details})});
  };

  if (!isObject(plan)) {
    fail('plan.type', '$', 'Plan must be an object.');
    return errors;
  }
  if (!isObject(motionLibrary)) {
    fail('library.type', '$motionLibrary', 'Motion library must be an object.');
    return errors;
  }

  if (plan.schemaVersion !== 'autovideo-semantic-sfx-plan/v1') {
    fail('plan.schemaVersion', '$.schemaVersion', 'Unsupported semantic SFX plan schema version.');
  }
  if (!isSemver(plan.version)) {
    fail('plan.version', '$.version', 'Plan version must be semantic versioning.');
  }
  if (!['example', 'candidate', 'approved', 'retired'].includes(plan.status)) {
    fail('plan.status', '$.status', 'Plan status is not supported.');
  }

  for (const [key, expected] of Object.entries(STYLE_LOCK)) {
    if (plan.styleLock?.[key] !== expected) {
      fail('style.lock', `$.styleLock.${key}`, `Expected ${key} to remain locked.`, {
        expected,
        actual: plan.styleLock?.[key],
      });
    }
  }

  const expectedLibraryPath = 'style-library/motion-library/knowledge-explainer-v1.json';
  if (plan.motionLibraryRef?.libraryId !== motionLibrary.libraryId) {
    fail('library.id', '$.motionLibraryRef.libraryId', 'Plan must reference the loaded motion library id.');
  }
  if (plan.motionLibraryRef?.version !== motionLibrary.version) {
    fail('library.version', '$.motionLibraryRef.version', 'Plan must pin the loaded motion library version.');
  }
  if (plan.motionLibraryRef?.path !== expectedLibraryPath) {
    fail('library.path', '$.motionLibraryRef.path', 'Plan must reference the canonical motion library path.');
  }
  if (!(Number.isFinite(plan.timelineDurationSeconds) && plan.timelineDurationSeconds > 0)) {
    fail('timeline.duration', '$.timelineDurationSeconds', 'Timeline duration must be a positive number.');
  }

  const policy = plan.policy ?? {};
  const libraryPolicy = motionLibrary.sfxPolicy ?? {};
  if (policy.mode !== 'semantic-only' || policy.mode !== libraryPolicy.mode) {
    fail('policy.mode', '$.policy.mode', 'Only semantic-only SFX plans are allowed.');
  }
  if (!(Number.isInteger(policy.maxPerMinute)
    && policy.maxPerMinute >= 0
    && policy.maxPerMinute <= libraryPolicy.maxPerMinute)) {
    fail('policy.maxPerMinute', '$.policy.maxPerMinute', 'Cue density cannot exceed the motion library ceiling.');
  }
  if (!(Number.isFinite(policy.minGapSeconds)
    && policy.minGapSeconds >= libraryPolicy.minGapSeconds)) {
    fail('policy.minGapSeconds', '$.policy.minGapSeconds', 'Cue gap cannot be shorter than the motion library minimum.');
  }
  if (policy.maxSimultaneous !== 1) {
    fail('policy.maxSimultaneous', '$.policy.maxSimultaneous', 'Only one semantic SFX may play at a time.');
  }
  if (policy.narrationPriority !== true) {
    fail('policy.narrationPriority', '$.policy.narrationPriority', 'Narration must remain the priority mix element.');
  }
  if (policy.allowAmbientLoops !== false || policy.allowDecorativeHits !== false) {
    fail('policy.semanticOnly', '$.policy', 'Ambient loops and decorative hits are prohibited.');
  }
  if (policy.mix?.narrationGainChangeDb !== 0) {
    fail('mix.narrationGain', '$.policy.mix.narrationGainChangeDb', 'SFX must not duck narration.');
  }

  const assetPolicy = policy.assetPolicy ?? {};
  const expectedAssetPolicy = {
    resolver: libraryPolicy.resolver,
    manifestPath: libraryPolicy.manifestPath,
    pathPrefix: libraryPolicy.pathPrefix,
    mediaType: 'sfx',
    allowRemoteAtRender: libraryPolicy.allowRemoteAtRender,
    allowUnregisteredAssets: libraryPolicy.allowUnregisteredAssets,
    requireSha256: libraryPolicy.requireSha256,
  };
  for (const [key, expected] of Object.entries(expectedAssetPolicy)) {
    if (assetPolicy[key] !== expected) {
      fail('asset.policy', `$.policy.assetPolicy.${key}`, 'Asset policy must match the motion library media-use contract.', {
        expected,
        actual: assetPolicy[key],
      });
    }
  }

  const allowedRoles = new Set(libraryPolicy.roles ?? []);
  const bindings = Array.isArray(plan.bindings) ? plan.bindings : [];
  if (!Array.isArray(plan.bindings)) {
    fail('bindings.type', '$.bindings', 'Bindings must be an array.');
  }
  const bindingRoles = new Set();
  for (const [index, binding] of bindings.entries()) {
    const bindingPath = `$.bindings[${index}]`;
    if (!isObject(binding)) {
      fail('binding.type', bindingPath, 'Binding must be an object.');
      continue;
    }
    if (!allowedRoles.has(binding.role)) {
      fail('binding.role', `${bindingPath}.role`, 'Binding role is not allowed by the motion library.');
    }
    if (bindingRoles.has(binding.role)) {
      fail('binding.uniqueRole', `${bindingPath}.role`, 'Each semantic role may have only one binding.');
    }
    bindingRoles.add(binding.role);
    if (!isNonEmptyString(binding.intent)) {
      fail('binding.intent', `${bindingPath}.intent`, 'Binding intent must describe the sound.');
    }
    if (binding.manifestPath !== libraryPolicy.manifestPath || binding.mediaType !== 'sfx') {
      fail('binding.ledger', bindingPath, 'Binding must point to the media-use SFX ledger.');
    }

    if (binding.resolutionStatus === 'unresolved') {
      for (const field of ASSET_FIELDS) {
        if (binding[field] !== null) {
          fail('binding.unresolvedNull', `${bindingPath}.${field}`, 'Unresolved bindings must keep asset fields null.');
        }
      }
    } else if (binding.resolutionStatus === 'resolved') {
      if (!assetIdPattern.test(binding.assetId ?? '')) {
        fail('binding.assetId', `${bindingPath}.assetId`, 'Resolved SFX id must be a canonical media-ledger ID.');
      }
      if (!resolvedSfxPathPattern.test(binding.path ?? '')) {
        fail('binding.path', `${bindingPath}.path`, 'Resolved SFX path must be a frozen local .media/audio/sfx file.');
      }
      if (!sha256Pattern.test(binding.sha256 ?? '')) {
        fail('binding.sha256', `${bindingPath}.sha256`, 'Resolved SFX must include a lowercase SHA-256 hash.');
      }
      if (!isNonEmptyString(binding.provider) || !isNonEmptyString(binding.licenseReceipt)) {
        fail('binding.provenance', bindingPath, 'Resolved SFX must include provider and license receipt.');
      }
    } else {
      fail('binding.status', `${bindingPath}.resolutionStatus`, 'Binding status must be unresolved or resolved.');
    }
  }

  if (plan.status === 'approved' && bindings.some((binding) => binding.resolutionStatus !== 'resolved')) {
    fail('plan.approvedResolved', '$.bindings', 'Approved plans cannot contain unresolved SFX bindings.');
  }

  const recipes = new Map((motionLibrary.recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const cues = Array.isArray(plan.cues) ? plan.cues : [];
  if (!Array.isArray(plan.cues)) {
    fail('cues.type', '$.cues', 'Cues must be an array.');
  }
  const cueIds = new Set();
  for (const [index, cue] of cues.entries()) {
    const cuePath = `$.cues[${index}]`;
    if (!isObject(cue)) {
      fail('cue.type', cuePath, 'Cue must be an object.');
      continue;
    }
    if (!isNonEmptyString(cue.id) || cueIds.has(cue.id)) {
      fail('cue.uniqueId', `${cuePath}.id`, 'Cue ids must be non-empty and unique.');
    }
    cueIds.add(cue.id);
    if (!(Number.isFinite(cue.timeSeconds)
      && cue.timeSeconds >= 0
      && cue.timeSeconds <= plan.timelineDurationSeconds)) {
      fail('cue.time', `${cuePath}.timeSeconds`, 'Cue time must fall within the timeline.');
    }
    if (!allowedRoles.has(cue.role)) {
      fail('cue.role', `${cuePath}.role`, 'Cue role is not allowed by the motion library.');
    }
    if (cue.bindingRole !== cue.role || !bindingRoles.has(cue.bindingRole)) {
      fail('cue.binding', `${cuePath}.bindingRole`, 'Cue must bind to an existing binding with the same semantic role.');
    }
    if (cue.targetLayer !== 'content-world') {
      fail('cue.targetLayer', `${cuePath}.targetLayer`, 'Semantic SFX may target content-world only.');
    }
    if (ROLE_ANCHORS[cue.role] !== cue.anchor) {
      fail('cue.anchor', `${cuePath}.anchor`, 'Cue anchor must match its semantic role.');
    }
    const recipe = recipes.get(cue.motionRecipeId);
    if (!recipe) {
      fail('cue.recipe', `${cuePath}.motionRecipeId`, 'Cue references an unknown motion recipe.');
    } else if (!recipe.allowedSfxRoles.includes(cue.role)) {
      fail('cue.recipeRole', `${cuePath}.role`, 'Cue role is not allowed by its motion recipe.');
    }
  }

  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    if (!(Number.isFinite(previous?.timeSeconds) && Number.isFinite(current?.timeSeconds))) continue;
    if (current.timeSeconds < previous.timeSeconds) {
      fail('cue.order', `$.cues[${index}].timeSeconds`, 'Cues must be sorted by time.');
    }
    if (current.timeSeconds - previous.timeSeconds < policy.minGapSeconds) {
      fail('cue.minGap', `$.cues[${index}].timeSeconds`, 'Adjacent cues violate the minimum semantic gap.');
    }
  }

  const sortedTimes = cues
    .map((cue) => cue?.timeSeconds)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (const [index, windowStart] of sortedTimes.entries()) {
    const windowCount = sortedTimes.slice(index).filter((time) => time < windowStart + 60).length;
    if (windowCount > policy.maxPerMinute) {
      fail('cue.density', '$.cues', 'Cue density exceeds the rolling 60-second ceiling.', {
        windowStart,
        windowCount,
        maximum: policy.maxPerMinute,
      });
      break;
    }
  }

  return errors;
}
