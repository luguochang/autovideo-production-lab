import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GENERATOR_RUNTIME_SHA256,
  buildStageInputSnapshot,
  hashStageInput,
  jobIdempotencyKey,
  jobLogicalKey,
  latestJobsByLogicalKey,
  stableJson,
} from '../lib/job-contract.mjs';

const project = (overrides = {}) => ({
  id: 'job-contract-project',
  title: 'Contract project',
  route: 'script',
  sourcePath: 'content/source.txt',
  platform: 'local',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'AI practitioners',
  targetOutcome: 'explain one reusable workflow',
  automation: 'critical-gates',
  ratio: '16:9',
  resolution: '1920x1080',
  fps: 30,
  publicationRights: 'internal-only',
  rightsNotes: 'Internal fixture only.',
  formalProjectPath: null,
  contentIntake: {
    id: 'intake-001',
    inputType: 'pasted-text',
    payload: {sha256: 'd'.repeat(64), bytes: 128, fileCount: 1},
    pipelineIntakePath: 'content/intakes/job-contract-project-intake',
  },
  stageOrder: ['source-register', 'full-production'],
  stages: {
    'source-register': {status: 'approved', revision: 2, artifactSha256: 'a'.repeat(64), approvedArtifactSha256: 'a'.repeat(64), enabled: true},
    'full-production': {status: 'not-started', revision: 0, enabled: true, mode: 'automation', toolId: 'compiler', promptOverride: '', overrides: []},
  },
  ...overrides,
});

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const formalFixtureRelative = `workflow-console/data/test-job-contract-${process.pid}`;
const formalFixtureRoot = path.join(workspaceRoot, formalFixtureRelative);
after(() => fs.rmSync(formalFixtureRoot, {recursive: true, force: true}));

test('source-register input is bound to immutable content bytes, not only its path', () => {
  const first = buildStageInputSnapshot(project(), 'source-register');
  const changed = buildStageInputSnapshot(project({
    contentIntake: {
      ...project().contentIntake,
      id: 'intake-002',
      payload: {...project().contentIntake.payload, sha256: 'e'.repeat(64)},
    },
  }), 'source-register');
  assert.equal(first.project.sourceIdentity.mode, 'immutable-content-intake');
  assert.equal(first.project.sourceIdentity.payloadSha256, 'd'.repeat(64));
  assert.notEqual(hashStageInput(first), hashStageInput(changed));

  const legacy = buildStageInputSnapshot(project({contentIntake: null}), 'source-register');
  assert.equal(legacy.project.sourceIdentity.mode, 'legacy-unfrozen-path');
  assert.equal(legacy.project.sourceIdentity.payloadSha256, null);
});

test('stage input snapshots are canonical and hash-bound', () => {
  const first = buildStageInputSnapshot(project(), 'full-production');
  assert.equal(first.schemaVersion, 'autovideo-job-input/v3');
  assert.equal(first.generatorRuntime.sha256, GENERATOR_RUNTIME_SHA256);
  assert.match(first.generatorRuntime.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(first.generatorRuntime.fileCount > 0);
  const reordered = buildStageInputSnapshot({...project(), stages: {...project().stages}}, 'full-production');
  assert.equal(stableJson(first), stableJson(reordered));
  assert.equal(hashStageInput(first), hashStageInput(reordered));
  const changed = buildStageInputSnapshot(project({stages: {
    ...project().stages,
    'source-register': {...project().stages['source-register'], artifactSha256: 'b'.repeat(64), approvedArtifactSha256: 'b'.repeat(64)},
  }}), 'full-production');
  assert.notEqual(hashStageInput(first), hashStageInput(changed));

  const changedRuntime = buildStageInputSnapshot(project(), 'full-production', {generatorRuntimeSha256: 'f'.repeat(64)});
  assert.notEqual(hashStageInput(first), hashStageInput(changedRuntime));
});

test('visual-plan idempotency binds formal planning file bytes', () => {
  fs.mkdirSync(path.join(formalFixtureRoot, 'plan'), {recursive: true});
  fs.mkdirSync(path.join(formalFixtureRoot, 'audio'), {recursive: true});
  for (const relativePath of [
    'NarrationLock.json', 'audio/alignment.json', 'template-lock.json',
    'plan/storyboard.json', 'plan/graph-ir.json', 'plan/shot-manifest.json', 'plan/production-manifest.json',
  ]) {
    const target = path.join(formalFixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, JSON.stringify({relativePath, revision: 1}));
  }
  const visualProject = project({
    formalProjectPath: formalFixtureRelative,
    stageOrder: ['visual-plan'],
    stages: {
      'visual-plan': {status: 'stale', revision: 2, enabled: true, mode: 'companion', toolId: 'codex-cli', promptOverride: '', overrides: []},
    },
  });
  const first = buildStageInputSnapshot(visualProject, 'visual-plan');
  fs.writeFileSync(path.join(formalFixtureRoot, 'plan', 'shot-manifest.json'), JSON.stringify({revision: 2}));
  const changed = buildStageInputSnapshot(visualProject, 'visual-plan');

  assert.equal(first.formalInputs.find((item) => item.path === 'plan/shot-manifest.json').status, 'current');
  assert.notEqual(hashStageInput(first), hashStageInput(changed));
});

test('package-export idempotency binds packaged project evidence and workspace sources', () => {
  fs.mkdirSync(path.join(formalFixtureRoot, 'delivery'), {recursive: true});
  fs.mkdirSync(path.join(formalFixtureRoot, 'qa'), {recursive: true});
  for (const relativePath of [
    'SOP_STATUS.json', 'RETROSPECTIVE.md',
    'delivery/delivery-manifest.json', 'qa/delivery-report.json', 'qa/internal-review-delivery.json',
    'renders/job-contract-project-internal-review.mp4', 'renders/job-contract-project-cover.png',
  ]) {
    const target = path.join(formalFixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, JSON.stringify({relativePath, revision: 1}));
  }
  const packageProject = project({
    formalProjectPath: formalFixtureRelative,
    stageOrder: ['package-export'],
    stages: {
      'package-export': {status: 'stale', revision: 1, enabled: true, mode: 'automation', toolId: 'standard-delivery-package', promptOverride: '', overrides: []},
    },
  });
  const first = buildStageInputSnapshot(packageProject, 'package-export');
  assert.equal(first.formalInputs.find((item) => item.path === 'delivery/delivery-manifest.json').status, 'current');
  assert.equal(first.formalInputs.find((item) => item.path.endsWith('-internal-review.mp4')).status, 'current');
  assert.equal(first.workspaceInputs.find((item) => item.path === 'docs').status, 'current');
  assert.equal(first.workspaceInputs.find((item) => item.path === 'workflow-console/src').status, 'current');
  fs.writeFileSync(path.join(formalFixtureRoot, 'SOP_STATUS.json'), JSON.stringify({revision: 2}));
  const changed = buildStageInputSnapshot(packageProject, 'package-export');
  assert.notEqual(hashStageInput(first), hashStageInput(changed));
});

test('idempotency keys are deterministic and logical retries share one key', () => {
  const inputSha256 = hashStageInput(buildStageInputSnapshot(project(), 'full-production'));
  const key = jobIdempotencyKey({projectId: project().id, stageId: 'full-production', inputSha256});
  assert.equal(key, jobIdempotencyKey({projectId: project().id, stageId: 'full-production', inputSha256}));
  assert.equal(jobLogicalKey({projectId: project().id, stageId: 'full-production', inputSha256, idempotencyKey: key}), key);
});

test('latest job view counts the newest attempt once', () => {
  const base = {projectId: 'p', stageId: 's', inputSha256: 'c'.repeat(64), idempotencyKey: 'stage:p:s:' + 'c'.repeat(64)};
  const latest = latestJobsByLogicalKey([
    {...base, id: 'old', attempt: 1, status: 'failed', createdAt: '2026-01-01T00:00:00.000Z'},
    {...base, id: 'new', attempt: 2, status: 'complete', createdAt: '2026-01-01T00:01:00.000Z'},
  ]);
  assert.deepEqual(latest.map((job) => job.id), ['new']);
});
