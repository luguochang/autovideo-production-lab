const HARD_MAX_PER_MINUTE = 6;
const HARD_MIN_GAP_SECONDS = 2.4;
const EPSILON = 1e-6;

const EVENT_BY_ROLE = Object.freeze({
  'focus-hit': 'enter',
  'connector-draw': 'draw',
  'state-change': 'click',
  error: 'error',
  'chapter-resolve': 'resolve',
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const round3 = (value) => Math.round(value * 1000) / 1000;
const clone = (value) => structuredClone(value);

function assetIdSet(value) {
  const items = value instanceof Set ? [...value] : Array.isArray(value) ? value : [];
  return new Set(items.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item];
    if (isObject(item) && item.type === 'sfx' && typeof item.id === 'string' && item.id.trim()) return [item.id];
    return [];
  }));
}

function sameRefs(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compileSemanticSfxPlan({plan, shots, registeredSfxAssetIds = []}) {
  const sourceShots = Array.isArray(shots) ? shots : [];
  const untouchedShots = clone(sourceShots);
  const cues = Array.isArray(plan?.cues) ? plan.cues : [];
  const registeredAssets = assetIdSet(registeredSfxAssetIds);
  const errors = [];
  const warnings = [];
  const entries = cues.map((cue, index) => ({
    planCueId: typeof cue?.id === 'string' ? cue.id : `cue-index-${index}`,
    planCueIndex: index,
    status: 'pending',
    reasonCodes: [],
    role: typeof cue?.role === 'string' ? cue.role : null,
    bindingRole: typeof cue?.bindingRole === 'string' ? cue.bindingRole : null,
    motionRecipeId: typeof cue?.motionRecipeId === 'string' ? cue.motionRecipeId : null,
    sourceCueIds: Array.isArray(cue?.sourceCueIds) ? [...cue.sourceCueIds] : [],
    semanticEvent: typeof cue?.semanticEvent === 'string' ? cue.semanticEvent : null,
    assetId: null,
    shotCueId: null,
    eventTimeSeconds: null,
    offsetMs: null,
    gainDb: finiteNumber(cue?.gainDb) ? cue.gainDb : null,
    event: EVENT_BY_ROLE[cue?.role] ?? null,
  }));

  const diagnostics = {
    schemaVersion: 'autovideo-semantic-sfx-compile-diagnostics/v1',
    planId: typeof plan?.planId === 'string' ? plan.planId : null,
    planStatus: typeof plan?.status === 'string' ? plan.status : null,
    mode: 'approved-plan-only-silence-default',
    committed: false,
    policy: {
      hardMaxPerMinute: HARD_MAX_PER_MINUTE,
      hardMinGapSeconds: HARD_MIN_GAP_SECONDS,
      effectiveMaxPerMinute: null,
      effectiveMinGapSeconds: null,
    },
    summary: {
      requestedCueCount: cues.length,
      appliedCueCount: 0,
      rejectedCueCount: 0,
      unchangedShotCount: sourceShots.length,
    },
    entries,
    errors,
    warnings,
  };

  const addError = (code, message, details = undefined) => {
    errors.push({code, message, ...(details === undefined ? {} : {details})});
  };
  const reject = (entry, code) => {
    entry.status = 'rejected';
    if (!entry.reasonCodes.includes(code)) entry.reasonCodes.push(code);
  };

  const abort = () => {
    for (const entry of entries) {
      if (entry.status === 'pending' || entry.status === 'ready') {
        entry.status = 'not-applied';
        if (!entry.reasonCodes.includes('compilation.atomic-abort')) {
          entry.reasonCodes.push('compilation.atomic-abort');
        }
      }
    }
    diagnostics.summary.rejectedCueCount = entries.length;
    return {ok: false, shots: untouchedShots, diagnostics};
  };

  if (!isObject(plan)) {
    addError('plan.invalid', 'Semantic SFX plan must be an object.');
    return abort();
  }
  if (!Array.isArray(shots)) {
    addError('shots.invalid', 'Shots must be an array.');
    return abort();
  }
  if (plan.status !== 'approved') {
    addError('plan.not-approved', 'Only an approved semantic SFX plan may emit shot references.', {
      actualStatus: plan.status ?? null,
    });
    for (const entry of entries) reject(entry, 'plan.not-approved');
    return abort();
  }

  if (!finiteNumber(plan.timelineDurationSeconds) || plan.timelineDurationSeconds <= 0) {
    addError('plan.timeline-invalid', 'timelineDurationSeconds must be a positive finite number.');
  }
  if (!Array.isArray(plan.bindings)) addError('plan.bindings-invalid', 'Plan bindings must be an array.');
  if (!Array.isArray(plan.cues)) addError('plan.cues-invalid', 'Plan cues must be an array.');

  const declaredMax = plan.policy?.maxPerMinute;
  const declaredGap = plan.policy?.minGapSeconds;
  const narrationGainChangeDb = plan.policy?.mix?.narrationGainChangeDb;
  if (plan.policy?.mode !== 'semantic-only') {
    addError('policy.mode', 'Only semantic-only SFX plans may be compiled.');
  }
  if (!Number.isInteger(declaredMax) || declaredMax < 0 || declaredMax > HARD_MAX_PER_MINUTE) {
    addError('policy.max-per-minute', `maxPerMinute must be an integer from 0 to ${HARD_MAX_PER_MINUTE}.`, {
      actual: declaredMax ?? null,
    });
  }
  if (!finiteNumber(declaredGap) || declaredGap < HARD_MIN_GAP_SECONDS) {
    addError('policy.min-gap', `minGapSeconds must be at least ${HARD_MIN_GAP_SECONDS}.`, {
      actual: declaredGap ?? null,
    });
  }
  if (plan.policy?.allowAmbientLoops !== false || plan.policy?.allowDecorativeHits !== false) {
    addError('policy.silence-default', 'Ambient loops and decorative hits violate the silence-default policy.');
  }
  if (narrationGainChangeDb !== 0) {
    addError('policy.narration-priority', 'Semantic SFX must not change narration gain.');
  }
  diagnostics.policy.effectiveMaxPerMinute = Number.isInteger(declaredMax)
    ? Math.min(declaredMax, HARD_MAX_PER_MINUTE)
    : HARD_MAX_PER_MINUTE;
  diagnostics.policy.effectiveMinGapSeconds = finiteNumber(declaredGap)
    ? Math.max(declaredGap, HARD_MIN_GAP_SECONDS)
    : HARD_MIN_GAP_SECONDS;

  const shotCueIds = new Map();
  sourceShots.forEach((shot, index) => {
    if (!isObject(shot) || typeof shot.cueId !== 'string' || !finiteNumber(shot.start) || !finiteNumber(shot.end) || shot.end <= shot.start) {
      addError('shot.invalid', 'Every shot requires a cueId and a positive finite time window.', {shotIndex: index});
      return;
    }
    const indexes = shotCueIds.get(shot.cueId) ?? [];
    indexes.push(index);
    shotCueIds.set(shot.cueId, indexes);
  });
  for (const [cueId, indexes] of shotCueIds) {
    if (indexes.length > 1) addError('shot.duplicate-cue-id', `Shot cueId ${cueId} is not unique.`, {indexes});
  }

  const bindingByRole = new Map();
  for (const [index, binding] of (Array.isArray(plan.bindings) ? plan.bindings : []).entries()) {
    if (!isObject(binding) || typeof binding.role !== 'string') {
      addError('binding.invalid', 'Every SFX binding requires a semantic role.', {bindingIndex: index});
      continue;
    }
    if (bindingByRole.has(binding.role)) {
      addError('binding.duplicate-role', `SFX binding role ${binding.role} is not unique.`, {bindingIndex: index});
      continue;
    }
    bindingByRole.set(binding.role, binding);
  }

  const assignments = [];
  const seenCueIds = new Set();
  for (const [index, cue] of cues.entries()) {
    const entry = entries[index];
    const cueError = (code, message, details = undefined) => {
      addError(code, message, {planCueIndex: index, planCueId: entry.planCueId, ...(details ?? {})});
      reject(entry, code);
    };

    if (!isObject(cue) || typeof cue.id !== 'string' || !cue.id.trim()) {
      cueError('cue.invalid', 'Every plan cue requires a non-empty id.');
      continue;
    }
    if (seenCueIds.has(cue.id)) {
      cueError('cue.duplicate-id', `Plan cue id ${cue.id} is not unique.`);
      continue;
    }
    seenCueIds.add(cue.id);
    if (!EVENT_BY_ROLE[cue.role]) {
      cueError('cue.unsupported-role', `Plan cue ${cue.id} has an unsupported semantic role.`, {role: cue.role ?? null});
      continue;
    }
    if (cue.bindingRole !== cue.role) {
      cueError('cue.binding-role-mismatch', `Plan cue ${cue.id} must bind the same semantic role it emits.`);
      continue;
    }
    if (cue.targetLayer !== 'content-world') {
      cueError('cue.target-layer', `Plan cue ${cue.id} may target content-world only.`);
      continue;
    }

    const binding = bindingByRole.get(cue.bindingRole);
    if (!binding || binding.resolutionStatus !== 'resolved' || typeof binding.assetId !== 'string') {
      cueError('cue.binding-unresolved', `Plan cue ${cue.id} has no resolved SFX binding.`);
      continue;
    }
    entry.assetId = binding.assetId;
    if (!registeredAssets.has(binding.assetId)) {
      cueError('cue.asset-not-registered', `Plan cue ${cue.id} references an SFX asset that is not registered.`, {
        assetId: binding.assetId,
      });
      continue;
    }
    if (!finiteNumber(cue.timeSeconds) || !finiteNumber(cue.offsetSeconds)) {
      cueError('cue.time-invalid', `Plan cue ${cue.id} requires finite timeSeconds and offsetSeconds.`);
      continue;
    }
    if (cue.offsetSeconds < -1 || cue.offsetSeconds > 1) {
      cueError('cue.offset-seconds-invalid', `Plan cue ${cue.id} offsetSeconds must stay between -1 and 1.`, {
        offsetSeconds: cue.offsetSeconds,
      });
      continue;
    }
    const eventTimeSeconds = cue.timeSeconds + cue.offsetSeconds;
    entry.eventTimeSeconds = round3(eventTimeSeconds);
    if (!finiteNumber(eventTimeSeconds)
        || eventTimeSeconds < 0
        || (finiteNumber(plan.timelineDurationSeconds) && eventTimeSeconds > plan.timelineDurationSeconds + EPSILON)) {
      cueError('cue.time-outside-plan', `Plan cue ${cue.id} falls outside the semantic SFX timeline.`, {
        eventTimeSeconds,
      });
      continue;
    }
    if (!Array.isArray(cue.sourceCueIds) || cue.sourceCueIds.length === 0) {
      cueError('cue.source-missing', `Plan cue ${cue.id} requires source cue provenance.`);
      continue;
    }

    const candidates = sourceShots
      .map((shot, shotIndex) => ({shot, shotIndex}))
      .filter(({shot}) => cue.sourceCueIds.includes(shot?.cueId)
        && finiteNumber(shot?.start)
        && finiteNumber(shot?.end)
        && eventTimeSeconds + EPSILON >= shot.start
        && eventTimeSeconds < shot.end - EPSILON);
    if (candidates.length !== 1) {
      cueError('cue.shot-not-unique', `Plan cue ${cue.id} must resolve to exactly one source-linked shot.`, {
        candidateShotCueIds: candidates.map(({shot}) => shot.cueId),
      });
      continue;
    }

    const [{shot, shotIndex}] = candidates;
    const offsetMs = Math.round((eventTimeSeconds - shot.start) * 1000);
    if (offsetMs < 0 || offsetMs > 10_000) {
      cueError('cue.offset-out-of-range', `Plan cue ${cue.id} cannot be represented by the shot SFX offset contract.`, {
        shotCueId: shot.cueId,
        offsetMs,
      });
      continue;
    }
    if (!finiteNumber(cue.gainDb) || cue.gainDb > -6 || cue.gainDb < -24) {
      cueError('cue.gain-invalid', `Plan cue ${cue.id} gainDb must stay between -24 and -6 dB.`);
      continue;
    }

    entry.status = 'ready';
    entry.shotCueId = shot.cueId;
    entry.offsetMs = offsetMs;
    assignments.push({
      planCueId: cue.id,
      shotIndex,
      eventTimeSeconds,
      ref: {
        assetId: binding.assetId,
        role: cue.role,
        event: EVENT_BY_ROLE[cue.role],
        cueId: shot.cueId,
        offsetMs,
        gainDb: cue.gainDb,
        duckingDb: narrationGainChangeDb,
      },
    });
  }

  const sortedAssignments = [...assignments].sort((left, right) => (
    left.eventTimeSeconds - right.eventTimeSeconds || left.planCueId.localeCompare(right.planCueId)
  ));
  for (let index = 1; index < sortedAssignments.length; index += 1) {
    const previous = sortedAssignments[index - 1];
    const current = sortedAssignments[index];
    if (current.eventTimeSeconds - previous.eventTimeSeconds + EPSILON < diagnostics.policy.effectiveMinGapSeconds) {
      const code = 'policy.minimum-gap-violated';
      addError(code, 'Semantic SFX events are closer than the effective minimum gap.', {
        cueIds: [previous.planCueId, current.planCueId],
        actualGapSeconds: round3(current.eventTimeSeconds - previous.eventTimeSeconds),
        minimumGapSeconds: diagnostics.policy.effectiveMinGapSeconds,
      });
      reject(entries[cues.findIndex((cue) => cue?.id === previous.planCueId)], code);
      reject(entries[cues.findIndex((cue) => cue?.id === current.planCueId)], code);
    }
  }
  for (const [index, assignment] of sortedAssignments.entries()) {
    const window = sortedAssignments.slice(index).filter((candidate) => (
      candidate.eventTimeSeconds < assignment.eventTimeSeconds + 60 - EPSILON
    ));
    if (window.length > diagnostics.policy.effectiveMaxPerMinute) {
      const code = 'policy.rolling-density-violated';
      const cueIds = window.map((candidate) => candidate.planCueId);
      addError(code, 'Semantic SFX events exceed the rolling 60-second ceiling.', {
        windowStartSeconds: round3(assignment.eventTimeSeconds),
        cueIds,
        actualCount: window.length,
        maximum: diagnostics.policy.effectiveMaxPerMinute,
      });
      for (const cueId of cueIds) reject(entries[cues.findIndex((cue) => cue?.id === cueId)], code);
      break;
    }
  }

  const refsByShot = new Map();
  for (const assignment of assignments) {
    const refs = refsByShot.get(assignment.shotIndex) ?? [];
    refs.push(assignment.ref);
    refsByShot.set(assignment.shotIndex, refs);
  }
  for (const [shotIndex, refs] of refsByShot) {
    refs.sort((left, right) => left.offsetMs - right.offsetMs || left.assetId.localeCompare(right.assetId));
    const currentRefs = Array.isArray(sourceShots[shotIndex]?.sfxRefs) ? sourceShots[shotIndex].sfxRefs : [];
    if (currentRefs.length > 0 && !sameRefs(currentRefs, refs)) {
      const code = 'shot.existing-sfx-conflict';
      addError(code, `Shot ${sourceShots[shotIndex].cueId} already has different semantic SFX references.`, {
        shotCueId: sourceShots[shotIndex].cueId,
      });
      for (const entry of entries.filter((candidate) => candidate.shotCueId === sourceShots[shotIndex].cueId)) reject(entry, code);
    }
  }

  if (errors.length > 0) return abort();

  const compiledShots = clone(sourceShots);
  for (const [shotIndex, refs] of refsByShot) compiledShots[shotIndex].sfxRefs = clone(refs);
  for (const entry of entries) entry.status = 'applied';
  diagnostics.committed = true;
  diagnostics.summary.appliedCueCount = entries.length;
  diagnostics.summary.rejectedCueCount = 0;
  diagnostics.summary.unchangedShotCount = sourceShots.length - refsByShot.size;
  return {ok: true, shots: compiledShots, diagnostics};
}

export const SEMANTIC_SFX_COMPILE_LIMITS = Object.freeze({
  maxPerMinute: HARD_MAX_PER_MINUTE,
  minGapSeconds: HARD_MIN_GAP_SECONDS,
});
