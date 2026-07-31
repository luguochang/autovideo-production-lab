import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {assertSemanticSfxApproval} from '../lib/semantic-sfx-approval.mjs';

const writeJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const sha256File = async (target) => {
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
};

const fixture = async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-sfx-approval-'));
  t.after(() => fs.rm(projectDir, {recursive: true, force: true}));
  const projectId = 'sfx-approval-project';
  const candidate = {
    schemaVersion: 'autovideo-semantic-sfx-plan/v1',
    planId: `${projectId}-sparse-sfx`,
    status: 'candidate',
    bindings: [
      {role: 'focus-hit', resolutionStatus: 'resolved', assetId: 'sfx-click-soft'},
      {role: 'connector-draw', resolutionStatus: 'resolved', assetId: 'sfx-whoosh-short'},
    ],
    cues: [
      {id: 'sfx-cue-001', bindingRole: 'focus-hit'},
      {id: 'sfx-cue-002', bindingRole: 'connector-draw'},
    ],
  };
  const decisions = [
    {cueId: 'sfx-cue-001', decision: 'approved', note: 'Keep one click.'},
    {cueId: 'sfx-cue-002', decision: 'rejected', note: 'The line is clear without sound.'},
  ];
  const approved = {
    ...structuredClone(candidate),
    status: 'approved',
    bindings: [candidate.bindings[0]],
    cues: [candidate.cues[0]],
  };
  const candidatePath = path.join(projectDir, 'plan', 'semantic-sfx-plan.candidate.json');
  const planPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.json');
  const reviewPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.review.json');
  await writeJson(candidatePath, candidate);
  await writeJson(planPath, approved);
  await writeJson(reviewPath, {
    schemaVersion: 'autovideo-semantic-sfx-review/v1',
    projectId,
    planId: candidate.planId,
    status: 'approved',
    sourcePlan: {path: 'plan/semantic-sfx-plan.candidate.json', sha256: await sha256File(candidatePath)},
    approvedPlan: {path: 'plan/semantic-sfx-plan.json', sha256: await sha256File(planPath)},
    decisions,
    approvedBy: 'human-reviewer',
    approvedAt: '2026-07-21T12:00:00.000Z',
    approvalScope: 'human-review',
    humanReviewPerformed: true,
    publicReleaseBlocked: false,
  });
  return {projectDir, projectId, candidate, approved, planPath, reviewPath};
};

test('approved semantic SFX is bound to the exact reviewed subset', async (t) => {
  const input = await fixture(t);
  const approval = await assertSemanticSfxApproval({
    projectDir: input.projectDir,
    projectId: input.projectId,
    plan: input.approved,
    planPath: input.planPath,
  });
  assert.equal(approval.approvedBy, 'human-reviewer');
  assert.match(approval.sha256, /^[a-f0-9]{64}$/);
});

test('creator-delegated semantic SFX approval is accepted only as internal-only evidence', async (t) => {
  const input = await fixture(t);
  const delegationPath = path.join(input.projectDir, 'receipts', 'creator-delegation', 'internal-simulation.json');
  await writeJson(delegationPath, {
    schemaVersion: 'autovideo-creator-delegation/v1',
    projectId: input.projectId,
    delegate: 'codex',
    scope: ['internal-only-workflow-simulation'],
    constraints: {
      microphoneAllowed: false,
      audioPlaybackAllowed: false,
      soundOutputAllowed: false,
      publicReleaseAllowed: false,
    },
  });
  const delegationSha256 = await sha256File(delegationPath);
  const review = JSON.parse(await fs.readFile(input.reviewPath, 'utf8'));
  review.approvedBy = 'codex-creator-delegated';
  review.approvalScope = 'internal-autonomous-review';
  review.humanReviewPerformed = false;
  review.publicReleaseBlocked = true;
  review.delegatedSimulation = {
    mode: 'creator-delegated-internal-only',
    receiptPath: 'receipts/creator-delegation/internal-simulation.json',
    receiptSha256: delegationSha256,
  };
  review.delegation = {path: 'receipts/creator-delegation/internal-simulation.json', sha256: delegationSha256};
  await writeJson(input.reviewPath, review);
  const approval = await assertSemanticSfxApproval({
    projectDir: input.projectDir,
    projectId: input.projectId,
    plan: input.approved,
    planPath: input.planPath,
  });
  assert.equal(approval.approvalScope, 'internal-autonomous-review');
  assert.equal(approval.humanReviewPerformed, false);
  assert.equal(approval.publicReleaseBlocked, true);
  assert.equal(approval.delegation.sha256, delegationSha256);
});

test('approved semantic SFX fails closed when plan, project, or receipt drifts', async (t) => {
  await t.test('plan subset drift', async (st) => {
    const input = await fixture(st);
    const changed = {...structuredClone(input.approved), cues: []};
    await writeJson(input.planPath, changed);
    await assert.rejects(() => assertSemanticSfxApproval({
      projectDir: input.projectDir,
      projectId: input.projectId,
      plan: changed,
      planPath: input.planPath,
    }), /stale|differs/i);
  });

  await t.test('project identity drift', async (st) => {
    const input = await fixture(st);
    await assert.rejects(() => assertSemanticSfxApproval({
      projectDir: input.projectDir,
      projectId: 'another-project',
      plan: input.approved,
      planPath: input.planPath,
    }), /project-bound/i);
  });

  await t.test('receipt decision drift', async (st) => {
    const input = await fixture(st);
    const review = JSON.parse(await fs.readFile(input.reviewPath, 'utf8'));
    review.decisions[1].decision = 'approved';
    await writeJson(input.reviewPath, review);
    await assert.rejects(() => assertSemanticSfxApproval({
      projectDir: input.projectDir,
      projectId: input.projectId,
      plan: input.approved,
      planPath: input.planPath,
    }), /differs/i);
  });
});

test('candidate plans remain silent and require no synthetic approval receipt', async () => {
  assert.equal(await assertSemanticSfxApproval({plan: {status: 'candidate'}}), null);
});

test('an approved plan without a review receipt fails closed', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-sfx-missing-review-'));
  t.after(() => fs.rm(projectDir, {recursive: true, force: true}));
  const planPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.json');
  const plan = {status: 'approved', planId: 'missing-review-sparse-sfx'};
  await writeJson(planPath, plan);
  await assert.rejects(() => assertSemanticSfxApproval({
    projectDir,
    projectId: 'missing-review',
    plan,
    planPath,
  }), /requires its review receipt/i);
});
