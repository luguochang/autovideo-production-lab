import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  approveSemanticSfxReview,
  buildSemanticSfxReview,
  reopenSemanticSfxReview,
  saveSemanticSfxReview,
  simulateSemanticSfxReview,
} from '../lib/semantic-sfx-review.mjs';

const projectId = 'semantic-sfx-fixture';
const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const makeWav = (sample) => {
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(38, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(2, 40);
  wav.writeInt16LE(sample, 44);
  return wav;
};

const candidatePlan = () => ({
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
    libraryId: 'knowledge-explainer',
    version: '1.0.0',
    path: 'style-library/motion-library/knowledge-explainer-v1.json',
  },
  timelineDurationSeconds: 30,
  policy: {
    mode: 'semantic-only',
    maxPerMinute: 6,
    minGapSeconds: 2.4,
    maxSimultaneous: 1,
    narrationPriority: true,
    allowAmbientLoops: false,
    allowDecorativeHits: false,
    assetPolicy: {
      resolver: 'media-use',
      manifestPath: '.media/manifest.jsonl',
      pathPrefix: '.media/audio/sfx/',
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
  bindings: [],
  cues: [
    {
      id: 'sfx-cue-001',
      timeSeconds: 5,
      role: 'focus-hit',
      bindingRole: 'focus-hit',
      motionRecipeId: 'keyword-handoff',
      sourceCueIds: ['cue-001'],
      semanticEvent: 'The first keyword reaches its visible motion landing.',
      anchor: 'motion-land',
      offsetSeconds: 0,
      gainDb: -20,
      targetLayer: 'content-world',
    },
    {
      id: 'sfx-cue-002',
      timeSeconds: 18,
      role: 'connector-draw',
      bindingRole: 'connector-draw',
      motionRecipeId: 'diagram-build',
      sourceCueIds: ['cue-002'],
      semanticEvent: 'The process connector reaches its complete visible state.',
      anchor: 'connector-complete',
      offsetSeconds: 0,
      gainDb: -21,
      targetLayer: 'content-world',
    },
  ],
});

async function makeFixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-sfx-review-'));
  t.after(() => fs.rm(projectRoot, {recursive: true, force: true}));
  const mediaDir = path.join(projectRoot, '.media', 'audio', 'sfx');
  await fs.mkdir(mediaDir, {recursive: true});
  const focusWav = makeWav(0);
  const drawWav = makeWav(1);
  await fs.writeFile(path.join(mediaDir, 'sfx_001.wav'), focusWav);
  await fs.writeFile(path.join(mediaDir, 'sfx_002.wav'), drawWav);
  const plan = candidatePlan();
  plan.bindings = [
    {
      role: 'focus-hit',
      intent: 'short restrained focus click',
      resolutionStatus: 'resolved',
      manifestPath: '.media/manifest.jsonl',
      mediaType: 'sfx',
      assetId: 'sfx_001',
      path: '.media/audio/sfx/sfx_001.wav',
      sha256: hashBuffer(focusWav),
      provider: 'bundled.sfx',
      licenseReceipt: 'test fixture license',
    },
    {
      role: 'connector-draw',
      intent: 'short restrained connector accent',
      resolutionStatus: 'resolved',
      manifestPath: '.media/manifest.jsonl',
      mediaType: 'sfx',
      assetId: 'sfx_002',
      path: '.media/audio/sfx/sfx_002.wav',
      sha256: hashBuffer(drawWav),
      provider: 'bundled.sfx',
      licenseReceipt: 'test fixture license',
    },
  ];
  await fs.writeFile(path.join(projectRoot, '.media', 'manifest.jsonl'), [
    JSON.stringify({id: 'sfx_001', type: 'sfx', path: '.media/audio/sfx/sfx_001.wav', description: 'Soft focus click', sha256: hashBuffer(focusWav), licenseReceipt: 'test fixture license', provenance: {provider: 'bundled.sfx'}}),
    JSON.stringify({id: 'sfx_002', type: 'sfx', path: '.media/audio/sfx/sfx_002.wav', description: 'Connector accent', sha256: hashBuffer(drawWav), licenseReceipt: 'test fixture license', provenance: {provider: 'bundled.sfx'}}),
    '',
  ].join('\n'), 'utf8');
  await fs.mkdir(path.join(projectRoot, 'plan'), {recursive: true});
  await fs.writeFile(path.join(projectRoot, 'plan', 'semantic-sfx-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return projectRoot;
}

test('candidate review is silent and exposes verified local SFX previews', async (t) => {
  const projectRoot = await makeFixture(t);
  const review = await buildSemanticSfxReview({projectRoot, projectId});
  assert.equal(review.status, 'candidate');
  assert.equal(review.defaultSilent, true);
  assert.deepEqual(review.counts, {total: 2, approved: 0, rejected: 0, pending: 2});
  assert.equal(review.cues[0].binding.asset.selectionReady, true);
  assert.match(review.cues[0].binding.asset.fileUrl, /\/media-assets\/sfx_001\/file$/);
});

test('hash-bound decisions compile into an atomic approved subset and can be reopened', async (t) => {
  const projectRoot = await makeFixture(t);
  const initial = await buildSemanticSfxReview({projectRoot, projectId});
  const input = {
    sourcePlanSha256: initial.sourcePlan.sha256,
    decisions: [
      {cueId: 'sfx-cue-001', decision: 'approved', note: 'One useful focus punctuation.'},
      {cueId: 'sfx-cue-002', decision: 'rejected', note: 'The connector is already visually clear.'},
    ],
    notes: 'Keep the narration dry except for the selected focus click.',
  };
  const saved = await saveSemanticSfxReview({projectRoot, projectId, input, reviewer: 'test-user'});
  assert.equal(saved.status, 'in-progress');
  assert.equal(saved.canApprove, true);

  const approved = await approveSemanticSfxReview({projectRoot, projectId, input, reviewer: 'test-user'});
  assert.equal(approved.status, 'approved');
  assert.equal(approved.defaultSilent, false);
  assert.deepEqual(approved.counts, {total: 2, approved: 1, rejected: 1, pending: 0});
  const approvedPlan = JSON.parse(await fs.readFile(path.join(projectRoot, 'plan', 'semantic-sfx-plan.json'), 'utf8'));
  assert.equal(approvedPlan.status, 'approved');
  assert.deepEqual(approvedPlan.cues.map((cue) => cue.id), ['sfx-cue-001']);
  assert.deepEqual(approvedPlan.bindings.map((binding) => binding.role), ['focus-hit']);
  assert.match(approved.approvedPlan.sha256, /^[a-f0-9]{64}$/);

  const reopened = await reopenSemanticSfxReview({
    projectRoot,
    projectId,
    input: {sourcePlanSha256: approved.sourcePlan.sha256, reason: 'Adjust the sparse mix after listening.'},
    reviewer: 'test-user',
  });
  assert.equal(reopened.status, 'in-progress');
  assert.equal(reopened.defaultSilent, true);
  const restoredPlan = JSON.parse(await fs.readFile(path.join(projectRoot, 'plan', 'semantic-sfx-plan.json'), 'utf8'));
  assert.equal(restoredPlan.status, 'candidate');
  assert.equal(restoredPlan.cues.length, 2);
});

test('stale hashes and pending cues cannot approve a plan', async (t) => {
  const projectRoot = await makeFixture(t);
  const initial = await buildSemanticSfxReview({projectRoot, projectId});
  await assert.rejects(() => saveSemanticSfxReview({
    projectRoot,
    projectId,
    reviewer: 'test-user',
    input: {sourcePlanSha256: '0'.repeat(64), decisions: [], notes: ''},
  }), /changed after this page loaded/);
  await assert.rejects(() => approveSemanticSfxReview({
    projectRoot,
    projectId,
    reviewer: 'test-user',
    input: {
      sourcePlanSha256: initial.sourcePlan.sha256,
      decisions: [
        {cueId: 'sfx-cue-001', decision: 'approved', note: ''},
        {cueId: 'sfx-cue-002', decision: 'pending', note: ''},
      ],
      notes: '',
    },
  }), /Approve or reject every candidate cue/);
  const plan = JSON.parse(await fs.readFile(path.join(projectRoot, 'plan', 'semantic-sfx-plan.json'), 'utf8'));
  assert.equal(plan.status, 'candidate');
});

test('creator-delegated SFX simulation approves resolved cues without claiming human listening', async (t) => {
  const projectRoot = await makeFixture(t);
  const delegationPath = path.join(projectRoot, 'receipts', 'creator-delegation', 'internal-simulation.json');
  await fs.mkdir(path.dirname(delegationPath), {recursive: true});
  await fs.writeFile(delegationPath, `${JSON.stringify({
    schemaVersion: 'autovideo-creator-delegation/v1',
    projectId,
    delegate: 'codex',
    scope: ['internal-only-workflow-simulation'],
    constraints: {
      microphoneAllowed: false,
      audioPlaybackAllowed: false,
      soundOutputAllowed: false,
      publicReleaseAllowed: false,
    },
  }, null, 2)}\n`, 'utf8');
  const simulated = await simulateSemanticSfxReview({
    projectRoot,
    projectId,
    delegationReceipt: 'receipts/creator-delegation/internal-simulation.json',
    reason: 'Creator delegated the sparse internal-only SFX decision.',
  });
  assert.equal(simulated.status, 'approved');
  assert.equal(simulated.approvalScope, 'internal-autonomous-review');
  assert.equal(simulated.humanReviewPerformed, false);
  assert.equal(simulated.publicReleaseBlocked, true);
  assert.equal(simulated.counts.approved, 2);
  assert.equal(simulated.defaultSilent, false);
  assert.equal(simulated.delegatedSimulation.mode, 'creator-delegated-internal-only');
});

test('creator-delegated identity cannot use the human SFX approval endpoint', async (t) => {
  const projectRoot = await makeFixture(t);
  const review = await buildSemanticSfxReview({projectRoot, projectId});
  await assert.rejects(() => approveSemanticSfxReview({
    projectRoot,
    projectId,
    reviewer: 'codex-creator-delegated',
    input: {
      sourcePlanSha256: review.sourcePlan.sha256,
      decisions: review.decisions.map((item) => ({...item, decision: 'rejected'})),
      notes: 'Simulation must use the dedicated endpoint.',
    },
  }), /dedicated internal-only simulation endpoint/i);
});
