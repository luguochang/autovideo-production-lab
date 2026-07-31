import assert from 'node:assert/strict';
import test from 'node:test';

import {compileSemanticSfxPlan} from '../lib/compile-semantic-sfx-plan.mjs';

const binding = (role, assetId) => ({
  role,
  intent: `restrained ${role} semantic sound`,
  resolutionStatus: 'resolved',
  manifestPath: '.media/manifest.jsonl',
  mediaType: 'sfx',
  assetId,
  path: `.media/audio/sfx/${assetId}.mp3`,
  sha256: 'a'.repeat(64),
  provider: 'fixture.sfx',
  licenseReceipt: 'fixture-license',
});

const cue = ({
  id,
  timeSeconds,
  role,
  sourceCueIds,
  offsetSeconds = 0,
  gainDb = -18,
}) => ({
  id,
  timeSeconds,
  role,
  bindingRole: role,
  motionRecipeId: role === 'connector-draw' ? 'diagram-build' : 'comparison-split',
  sourceCueIds,
  semanticEvent: `Approved semantic event for ${id}`,
  anchor: {
    'focus-hit': 'motion-land',
    'connector-draw': 'connector-complete',
    'state-change': 'state-commit',
    error: 'error-state',
    'chapter-resolve': 'chapter-terminal',
  }[role],
  offsetSeconds,
  gainDb,
  targetLayer: 'content-world',
});

const plan = ({status = 'approved', cues = [], bindings = []} = {}) => ({
  schemaVersion: 'autovideo-semantic-sfx-plan/v1',
  planId: 'semantic-sfx-fixture',
  version: '1.0.0',
  status,
  styleLock: {},
  motionLibraryRef: {},
  timelineDurationSeconds: 120,
  policy: {
    mode: 'semantic-only',
    maxPerMinute: 6,
    minGapSeconds: 2.4,
    maxSimultaneous: 1,
    narrationPriority: true,
    allowAmbientLoops: false,
    allowDecorativeHits: false,
    assetPolicy: {},
    mix: {
      defaultCueGainDb: -18,
      narrationGainChangeDb: 0,
      peakDbfsMax: -6,
      fadeInMs: 8,
      fadeOutMs: 80,
    },
  },
  bindings,
  cues,
});

const shots = [
  {cueId: 'cue-001', sceneId: 'scene-01', start: 0, end: 10, duration: 10, sfxRefs: []},
  {cueId: 'cue-002', sceneId: 'scene-02', start: 10, end: 20, duration: 10, sfxRefs: []},
];

test('approved plan cues compile transactionally into unique shots', () => {
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001'), binding('connector-draw', 'sfx_002')],
    cues: [
      cue({id: 'sfx-cue-001', timeSeconds: 5, offsetSeconds: -0.2, role: 'state-change', sourceCueIds: ['cue-001']}),
      cue({id: 'sfx-cue-002', timeSeconds: 12.4, offsetSeconds: 0.1, role: 'connector-draw', sourceCueIds: ['cue-002'], gainDb: -15}),
    ],
  });
  const originalPlan = structuredClone(inputPlan);
  const originalShots = structuredClone(shots);

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots,
    registeredSfxAssetIds: new Set(['sfx_001', 'sfx_002']),
  });

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.committed, true);
  assert.deepEqual(result.diagnostics.summary, {
    requestedCueCount: 2,
    appliedCueCount: 2,
    rejectedCueCount: 0,
    unchangedShotCount: 0,
  });
  assert.deepEqual(result.shots[0].sfxRefs, [{
    assetId: 'sfx_001',
    role: 'state-change',
    event: 'click',
    cueId: 'cue-001',
    offsetMs: 4800,
    gainDb: -18,
    duckingDb: 0,
  }]);
  assert.deepEqual(result.shots[1].sfxRefs, [{
    assetId: 'sfx_002',
    role: 'connector-draw',
    event: 'draw',
    cueId: 'cue-002',
    offsetMs: 2500,
    gainDb: -15,
    duckingDb: 0,
  }]);
  assert.deepEqual(result.diagnostics.entries.map((entry) => entry.eventTimeSeconds), [4.8, 12.5]);
  assert.deepEqual(inputPlan, originalPlan);
  assert.deepEqual(shots, originalShots);
});

test('candidate plans preserve silence and diagnose every rejected cue', () => {
  const inputPlan = plan({
    status: 'candidate',
    bindings: [binding('state-change', 'sfx_001')],
    cues: [cue({id: 'sfx-cue-001', timeSeconds: 5, role: 'state-change', sourceCueIds: ['cue-001']})],
  });

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.shots, shots);
  assert.equal(result.diagnostics.summary.appliedCueCount, 0);
  assert.equal(result.diagnostics.summary.rejectedCueCount, 1);
  assert.equal(result.diagnostics.entries[0].status, 'rejected');
  assert.deepEqual(result.diagnostics.entries[0].reasonCodes, ['plan.not-approved']);
  assert.ok(result.diagnostics.errors.some((error) => error.code === 'plan.not-approved'));
});

test('a resolved binding must reference an existing registered SFX asset id', () => {
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001')],
    cues: [cue({id: 'sfx-cue-001', timeSeconds: 5, role: 'state-change', sourceCueIds: ['cue-001']})],
  });

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots,
    registeredSfxAssetIds: ['sfx_999'],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.shots, shots);
  assert.ok(result.diagnostics.errors.some((error) => error.code === 'cue.asset-not-registered'));
  assert.deepEqual(result.diagnostics.entries[0].reasonCodes, ['cue.asset-not-registered']);
});

test('final event time must resolve to exactly one source-linked shot', () => {
  const overlappingShots = [
    {cueId: 'cue-001', start: 0, end: 10, sfxRefs: []},
    {cueId: 'cue-002', start: 4, end: 12, sfxRefs: []},
  ];
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001')],
    cues: [cue({
      id: 'sfx-cue-001',
      timeSeconds: 5,
      offsetSeconds: 0.5,
      role: 'state-change',
      sourceCueIds: ['cue-001', 'cue-002'],
    })],
  });

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots: overlappingShots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.errors.some((error) => error.code === 'cue.shot-not-unique'));
  assert.equal(result.diagnostics.entries[0].eventTimeSeconds, 5.5);
});

test('minimum-gap enforcement uses timeSeconds plus offsetSeconds', () => {
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001')],
    cues: [
      cue({id: 'sfx-cue-001', timeSeconds: 5, offsetSeconds: 1, role: 'state-change', sourceCueIds: ['cue-001']}),
      cue({id: 'sfx-cue-002', timeSeconds: 8.5, offsetSeconds: -1, role: 'state-change', sourceCueIds: ['cue-001']}),
    ],
  });

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(result.ok, false);
  const gapError = result.diagnostics.errors.find((error) => error.code === 'policy.minimum-gap-violated');
  assert.equal(gapError.details.actualGapSeconds, 1.5);
  assert.deepEqual(result.shots, shots);
});

test('offsetSeconds outside the schema range is diagnosed without throwing or applying', () => {
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001')],
    cues: [cue({
      id: 'sfx-cue-001',
      timeSeconds: 5,
      offsetSeconds: 1.1,
      role: 'state-change',
      sourceCueIds: ['cue-001'],
    })],
  });

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.shots, shots);
  assert.ok(result.diagnostics.errors.some((error) => error.code === 'cue.offset-seconds-invalid'));
});

test('rolling 60-second density is capped at six final events', () => {
  const densityShots = Array.from({length: 7}, (_, index) => ({
    cueId: `cue-${String(index + 1).padStart(3, '0')}`,
    start: index * 4,
    end: index * 4 + 4,
    sfxRefs: [],
  }));
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001')],
    cues: densityShots.map((shot, index) => cue({
      id: `sfx-cue-${String(index + 1).padStart(3, '0')}`,
      timeSeconds: shot.start + 1,
      role: 'state-change',
      sourceCueIds: [shot.cueId],
    })),
  });

  const result = compileSemanticSfxPlan({
    plan: inputPlan,
    shots: densityShots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.errors.some((error) => error.code === 'policy.rolling-density-violated'));
  assert.equal(result.diagnostics.summary.rejectedCueCount, 7);
  assert.deepEqual(result.shots, densityShots);
});

test('an approved empty plan is valid and adds no sound by default', () => {
  const result = compileSemanticSfxPlan({plan: plan(), shots, registeredSfxAssetIds: []});

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.committed, true);
  assert.equal(result.diagnostics.summary.appliedCueCount, 0);
  assert.equal(result.diagnostics.summary.unchangedShotCount, shots.length);
  assert.deepEqual(result.shots, shots);
});

test('recompiling identical refs is idempotent while different existing refs fail atomically', () => {
  const inputPlan = plan({
    bindings: [binding('state-change', 'sfx_001')],
    cues: [cue({id: 'sfx-cue-001', timeSeconds: 5, role: 'state-change', sourceCueIds: ['cue-001']})],
  });
  const first = compileSemanticSfxPlan({
    plan: inputPlan,
    shots,
    registeredSfxAssetIds: ['sfx_001'],
  });
  const second = compileSemanticSfxPlan({
    plan: inputPlan,
    shots: first.shots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(second.shots, first.shots);

  const conflictingShots = structuredClone(shots);
  conflictingShots[0].sfxRefs = [{
    assetId: 'sfx_999',
    role: 'state-change',
    event: 'click',
    cueId: 'cue-001',
    offsetMs: 100,
    gainDb: -18,
    duckingDb: 0,
  }];
  const conflict = compileSemanticSfxPlan({
    plan: inputPlan,
    shots: conflictingShots,
    registeredSfxAssetIds: ['sfx_001'],
  });

  assert.equal(conflict.ok, false);
  assert.deepEqual(conflict.shots, conflictingShots);
  assert.ok(conflict.diagnostics.errors.some((error) => error.code === 'shot.existing-sfx-conflict'));
});
