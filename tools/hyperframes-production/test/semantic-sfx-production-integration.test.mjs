import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import motionLibrary from '../../../style-library/motion-library/knowledge-explainer-v1.json' with {type: 'json'};
import {importAssetToProject, listAssetLibrary} from '../../../workflow-console/lib/asset-library.mjs';
import {
  approveSemanticSfxReview,
  buildSemanticSfxReview,
} from '../../../workflow-console/lib/semantic-sfx-review.mjs';
import {loadSemanticSfxPlan} from '../compile-production.mjs';
import {loadMediaLedger} from '../lib/media-ledger.mjs';
import {
  recommendSemanticSfxAssets,
  resolvedSemanticSfxBinding,
} from '../lib/resolve-semantic-sfx-bindings.mjs';
import {suggestSemanticSfxPlan} from '../lib/suggest-semantic-sfx-plan.mjs';

const projectId = 'semantic-sfx-production-integration';
const durationSeconds = 35;
const shots = [
  {
    cueId: 'cue-001',
    start: 0,
    end: 15,
    motionRecipeRefs: [{recipeId: 'keyword-handoff'}],
    sfxRefs: [],
  },
  {
    cueId: 'cue-002',
    start: 20,
    end: 35,
    motionRecipeRefs: [{recipeId: 'diagram-build'}],
    sfxRefs: [],
  },
];

const writeJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

async function createApprovedProject(t) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-sfx-production-'));
  t.after(() => fs.rm(projectDir, {recursive: true, force: true}));

  const centralAssets = await listAssetLibrary({type: 'sfx'});
  const candidate = suggestSemanticSfxPlan({
    projectId,
    durationSeconds,
    shots,
    motionLibrary,
  });
  const recommendations = recommendSemanticSfxAssets({plan: candidate, assets: centralAssets});
  assert.equal(candidate.cues.length, 2);
  assert.ok(recommendations.every((item) => item.status === 'recommended'));

  for (const recommendation of recommendations) {
    await importAssetToProject({projectRoot: projectDir, assetId: recommendation.assetId});
  }
  const importedLedger = await loadMediaLedger(projectDir);
  const resolvedBindings = recommendations.map((recommendation) => {
    const binding = candidate.bindings.find((item) => item.role === recommendation.role);
    const record = importedLedger.byId.get(recommendation.assetId);
    return resolvedSemanticSfxBinding({binding, record});
  });
  const boundCandidate = suggestSemanticSfxPlan({
    projectId,
    durationSeconds,
    shots,
    motionLibrary,
    existingBindings: resolvedBindings,
  });
  assert.ok(boundCandidate.bindings.every((binding) => binding.resolutionStatus === 'resolved'));
  assert.ok(boundCandidate.bindings.every((binding) => importedLedger.byId.has(binding.assetId)));

  const planPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.json');
  await writeJson(planPath, boundCandidate);
  const review = await buildSemanticSfxReview({projectRoot: projectDir, projectId});
  const decisions = review.cues.map((cue, index) => ({
    cueId: cue.id,
    decision: index === 0 ? 'approved' : 'rejected',
    note: index === 0 ? 'Keep one restrained semantic accent.' : 'The second motion is readable without sound.',
  }));
  const approved = await approveSemanticSfxReview({
    projectRoot: projectDir,
    projectId,
    reviewer: 'human-integration-reviewer',
    input: {
      sourcePlanSha256: review.sourcePlan.sha256,
      decisions,
      notes: 'Keep narration dominant and use one local semantic accent.',
    },
  });
  assert.equal(approved.status, 'approved');
  assert.deepEqual(approved.counts, {total: 2, approved: 1, rejected: 1, pending: 0});

  return {
    projectDir,
    planPath,
    reviewPath: path.join(projectDir, 'plan', 'semantic-sfx-plan.review.json'),
    plan: JSON.parse(await fs.readFile(planPath, 'utf8')),
    ledger: await loadMediaLedger(projectDir),
  };
}

const compileApprovedProject = ({projectDir, plan, ledger}) => loadSemanticSfxPlan({
  projectDir,
  manifest: {projectId, timeline: {duration: durationSeconds}},
  motionLibrary,
  shots,
  ledger,
});

test('central SFX import, automatic binding, human review, and production compile form one closed chain', async (t) => {
  const fixture = await createApprovedProject(t);
  const result = await compileApprovedProject(fixture);

  assert.equal(result.approval.approvedBy, 'human-integration-reviewer');
  assert.match(result.approval.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.compile.ok, true);
  assert.equal(result.compile.diagnostics.committed, true);
  assert.equal(result.compile.diagnostics.summary.appliedCueCount, 1);
  assert.equal(result.shots.flatMap((shot) => shot.sfxRefs).length, 1);
  assert.ok(fixture.ledger.byId.has(result.shots.flatMap((shot) => shot.sfxRefs)[0].assetId));
});

test('production compiler fails closed when the approved SFX review receipt is missing', async (t) => {
  const fixture = await createApprovedProject(t);
  await fs.rm(fixture.reviewPath);

  await assert.rejects(
    () => compileApprovedProject(fixture),
    /requires its review receipt/i,
  );
});

test('production compiler fails closed when the approved SFX review receipt is tampered', async (t) => {
  const fixture = await createApprovedProject(t);
  const review = JSON.parse(await fs.readFile(fixture.reviewPath, 'utf8'));
  review.decisions[0].decision = 'rejected';
  await writeJson(fixture.reviewPath, review);

  await assert.rejects(
    () => compileApprovedProject(fixture),
    /differs from the reviewed candidate subset/i,
  );
});
