import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, test} from 'node:test';

import {
  auditAutoVideoMaturity,
  evaluateMaturityGates,
  isGenuineHumanIdentity,
} from '../lib/maturity-audit.mjs';
import {attestRealProject} from '../lib/scale-evidence.mjs';

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, {recursive: true, force: true})));
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value, 'utf8');
  return sha256(value);
};
const writeJson = (target, value) => write(target, `${JSON.stringify(value, null, 2)}\n`);

const makeProjectAssessment = (index) => {
  const route = ['script', 'materials', 'audio'][index % 3];
  const durationClass = ['30s', '60s', '90s'][index % 3];
  const carriers = [
    ['process', 'data'], ['ui'], ['code'], ['opinion'], ['data'],
  ][index % 5];
  return {
    projectId: `real-${String(index + 1).padStart(2, '0')}`,
    route,
    profile: {durationClass, carriers},
    real: {present: true, valid: true},
    gold: {present: index < 3, valid: index < 3},
    recovery: {
      present: true,
      valid: true,
      metrics: {
        elapsedSeconds: 100 + index,
        humanMinutes: 2,
        cpuSeconds: 50,
        gpuSeconds: 0,
        modelCalls: 1,
        retryCount: index === 0 ? 1 : 0,
        overrideCount: 1,
        assetReuseCount: 2,
        assetCandidateCount: 3,
        recipeReuseCount: 1,
        recipeOpportunityCount: 2,
        reworkCount: 0,
      },
    },
    publicCandidate: {present: index === 0, valid: index === 0},
    rights: {present: true, valid: true},
  };
};

test('maturity gates pass only when every section 8 evidence class is present', () => {
  const projects = Array.from({length: 20}, (_, index) => makeProjectAssessment(index));
  const motion = {
    valid: true,
    recipeCount: 8,
    humanLifecycleCount: 8,
    templatePromotedCount: 3,
    recipes: Array.from({length: 8}, (_, index) => ({recipeId: `recipe-${index}`, humanLifecycleValid: true, templatePromoted: index < 3})),
  };
  const result = evaluateMaturityGates({
    projects,
    motion,
    contentGold: {valid: true, acceptedCases: 20, issues: []},
    stateSeparation: {present: true, valid: true, issues: [], checks: [{valid: true}]},
  });
  assert.equal(result.mature, true);
  assert.equal(result.gates.length, 8);
  assert.ok(result.gates.every((item) => item.passed));
  assert.equal(result.summary.recoverableRealProjects, 20);
  assert.equal(result.summary.routeGoldCounts.script, 1);
  assert.equal(result.summary.routeGoldCounts.materials, 1);
  assert.equal(result.summary.routeGoldCounts.audio, 1);
  assert.equal(result.summary.scaleMetrics.elapsedSecondsP95, 118);
});

test('machine and placeholder identities cannot be genuine human evidence', () => {
  for (const reviewer of ['codex-agent', 'automation', 'test reviewer', 'fixture-human', 'user', 'creator', 'anonymous']) {
    assert.equal(isGenuineHumanIdentity(reviewer), false, reviewer);
  }
  assert.equal(isGenuineHumanIdentity('Lin Qiao'), true);
  assert.equal(isGenuineHumanIdentity('王小明'), true);
});

test('filesystem audit refuses a machine-authored real-project attestation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-maturity-'));
  temporaryRoots.push(root);
  const projectId = 'machine-attested-project';
  const formalRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
  const inputSha256 = await write(path.join(formalRoot, 'input', 'narration.txt'), 'A real-looking input must still have a human attestation.\n');
  const stateSha256 = await writeJson(path.join(formalRoot, 'project-state.json'), {schemaVersion: 'autovideo-project-state/v1', projectId});
  await writeJson(path.join(root, 'workflow-console', 'data', 'db.json'), {projects: {
    [projectId]: {
      id: projectId,
      route: 'script',
      publicationRights: 'internal-only',
      formalProjectPath: `hyperframes-workflow-kit/projects/${projectId}`,
    },
  }});
  await writeJson(path.join(formalRoot, 'receipts', 'scale', 'real-project.json'), {
    schemaVersion: 'autovideo-real-project-attestation/v1',
    projectId,
    route: 'script',
    status: 'confirmed-real-production',
    profile: {durationClass: '30s', carriers: ['opinion']},
    attestation: {confirmedHuman: true, reviewerType: 'human', reviewer: 'codex-agent', reviewedAt: '2026-07-22T00:00:00.000Z'},
    bindings: {
      input: {path: 'input/narration.txt', sha256: inputSha256},
      projectState: {path: 'project-state.json', sha256: stateSha256},
    },
  });
  const report = await auditAutoVideoMaturity({workspaceRoot: root, generatedAt: '2026-07-22T00:00:00.000Z'});
  assert.equal(report.mature, false);
  assert.equal(report.summary.realProjects, 0);
  assert.match(report.projects[0].real.issues.join(' '), /genuine human reviewer/i);
  assert.equal(report.policy.internalSimulationCountsAsHuman, false);
});

test('filesystem audit rejects stale project bindings even with a named reviewer', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-maturity-stale-'));
  temporaryRoots.push(root);
  const projectId = 'stale-attestation-project';
  const formalRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
  await write(path.join(formalRoot, 'input', 'narration.txt'), 'Current bytes.\n');
  const stateSha256 = await writeJson(path.join(formalRoot, 'project-state.json'), {schemaVersion: 'autovideo-project-state/v1', projectId});
  await writeJson(path.join(root, 'workflow-console', 'data', 'db.json'), {projects: {
    [projectId]: {id: projectId, route: 'script', publicationRights: 'internal-only'},
  }});
  await writeJson(path.join(formalRoot, 'receipts', 'scale', 'real-project.json'), {
    schemaVersion: 'autovideo-real-project-attestation/v1',
    projectId,
    route: 'script',
    status: 'confirmed-real-production',
    profile: {durationClass: '30s', carriers: ['opinion']},
    attestation: {confirmedHuman: true, reviewerType: 'human', reviewer: 'Lin Qiao', reviewedAt: '2026-07-22T00:00:00.000Z'},
    bindings: {
      input: {path: 'input/narration.txt', sha256: '0'.repeat(64)},
      projectState: {path: 'project-state.json', sha256: stateSha256},
    },
  });
  const report = await auditAutoVideoMaturity({workspaceRoot: root});
  assert.equal(report.summary.realProjects, 0);
  assert.match(report.projects[0].real.issues.join(' '), /stale/i);
});

test('scale evidence writer derives SHA bindings but still requires explicit human confirmation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-scale-writer-'));
  temporaryRoots.push(root);
  const projectId = 'scale-writer-project';
  const formalRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
  await write(path.join(formalRoot, 'input', 'narration.txt'), 'Creator supplied production input.\n');
  await writeJson(path.join(formalRoot, 'project-state.json'), {
    schemaVersion: 'autovideo-project-state/v1',
    projectId,
    inputs: {narration: 'input/narration.txt'},
  });
  await writeJson(path.join(root, 'workflow-console', 'data', 'db.json'), {projects: {
    [projectId]: {
      id: projectId,
      route: 'script',
      publicationRights: 'internal-only',
      formalProjectPath: `hyperframes-workflow-kit/projects/${projectId}`,
    },
  }});
  await assert.rejects(
    attestRealProject({workspaceRoot: root, projectId, reviewer: 'Lin Qiao', confirmedHuman: false, durationClass: '30s', carriers: ['opinion']}),
    /confirm-human/i,
  );
  const result = await attestRealProject({
    workspaceRoot: root,
    projectId,
    reviewer: 'Lin Qiao',
    confirmedHuman: true,
    durationClass: '30s',
    carriers: ['opinion'],
    reviewedAt: '2026-07-22T00:00:00.000Z',
  });
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  const receipt = JSON.parse(await fs.readFile(path.join(formalRoot, 'receipts', 'scale', 'real-project.json'), 'utf8'));
  assert.equal(receipt.attestation.confirmedHuman, true);
  assert.equal(receipt.bindings.input.sha256, sha256('Creator supplied production input.\n'));
});
