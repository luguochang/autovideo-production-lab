import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  createInitialLedger,
  readJson,
  sha256File,
} from '../../tools/motion-recipe-lifecycle/lifecycle.mjs';
import {
  acceptMotionProbeLifecycle,
  approveMotionRecipeForProject,
} from '../lib/motion-lifecycle-actions.mjs';
import {saveMotionProbeReview, visualCheckKeys} from '../lib/motion-probe-review.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const libraryPath = 'style-library/motion-library/knowledge-explainer-v1.json';
const ledgerPath = 'style-library/motion-library/knowledge-explainer.lifecycle.json';
const catalogPaths = {
  officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
  officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
  officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
};

const writeJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const writeFile = async (root, relativePath, value) => {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
  return {path: relativePath, sha256: await sha256File(target)};
};

const copyFixture = async (root, relativePath) => {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.copyFile(path.join(repositoryRoot, relativePath), target);
};

const allChecks = (value) => Object.fromEntries(visualCheckKeys.map((key) => [key, value]));

const createFixture = async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-actions-'));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  await Promise.all([libraryPath, ...Object.values(catalogPaths)].map((item) => copyFixture(workspaceRoot, item)));
  const ledger = await createInitialLedger({
    workspaceRoot,
    libraryPath,
    catalogs: Object.fromEntries(Object.entries(catalogPaths).map(([key, value]) => [key, {path: value}])),
  });
  await writeJson(path.join(workspaceRoot, ledgerPath), ledger);

  const probeId = 'E01-keyword-handoff-probe';
  const probeDirectory = `experiments/${probeId}`;
  const still = await writeFile(workspaceRoot, `${probeDirectory}/snapshots/contact-sheet.jpg`, Buffer.from('still-v1'));
  const motionProbe = await writeFile(workspaceRoot, `${probeDirectory}/renders/keyword-handoff-probe.mp4`, Buffer.from('motion-v1'));
  const check = await writeFile(workspaceRoot, `${probeDirectory}/qa/hyperframes-check.json`, Buffer.from('{"ok":true}'));
  const invariantAudit = await writeFile(workspaceRoot, `${probeDirectory}/qa/invariant-audit.json`, Buffer.from('{"passed":true}'));
  const hostAssetManifest = await writeFile(workspaceRoot, `${probeDirectory}/assets/host-manifest.json`, Buffer.from('{"host":"approved"}'));
  const implementation = await writeFile(workspaceRoot, `${probeDirectory}/composition/morph-text.html`, Buffer.from('<div>morph</div>'));
  const recipe = ledger.entries.find((entry) => entry.recipeId === 'keyword-handoff');
  await writeJson(path.join(workspaceRoot, probeDirectory, 'lifecycle-evidence.draft.json'), {
    schemaVersion: 'autovideo-motion-recipe-lifecycle-evidence/v1',
    recipeId: 'keyword-handoff',
    recipeVersion: recipe.recipeVersion,
    requestedState: 'probe-passed',
    probe: {
      kind: 'motion-probe',
      projectId: 'formal-project-a',
      path: probeDirectory,
      durationSeconds: 5,
      sameNarrationWindow: true,
      narrationSha256: crypto.createHash('sha256').update('narration').digest('hex'),
      audioSha256: crypto.createHash('sha256').update('audio').digest('hex'),
      invariants: ledger.invariants,
      invariantAudit: {
        binding: invariantAudit,
        passed: true,
        checks: {
          landscape16x9: true,
          lightApricotBackground: true,
          qVersionHostAssets: true,
          hostLeft: true,
          contentRight: true,
          captionPersistent: true,
          contentWorldOnlyCamera: true,
        },
      },
      hostAssetManifest,
      stills: [still],
      motionProbe,
      hyperframesCheck: {binding: check, ok: true, strict: true, snapshotsEnabled: true, findingCount: 0, version: '0.7.64'},
      visualReview: null,
      officialReuseObserved: [{kind: 'official-registry', id: 'morph-text', implementation}],
    },
    gateResults: [],
    blockedReasons: ['missing-visual-review'],
  });
  return {workspaceRoot, probeId, probeDirectory, projectId: 'formal-project-a'};
};

test('a passed human probe review stays candidate until an explicit lifecycle acceptance re-evaluates and commits it', async (t) => {
  const fixture = await createFixture(t);
  const beforeReview = await sha256File(path.join(fixture.workspaceRoot, ledgerPath));
  await saveMotionProbeReview({
    workspaceRoot: fixture.workspaceRoot,
    reviewer: 'visual-reviewer',
    input: {probeId: fixture.probeId, decision: 'passed', checks: allChecks(true), notes: 'Ready for lifecycle acceptance.'},
  });
  assert.equal(await sha256File(path.join(fixture.workspaceRoot, ledgerPath)), beforeReview, 'saving a human review must not promote the recipe');

  const accepted = await acceptMotionProbeLifecycle({
    workspaceRoot: fixture.workspaceRoot,
    probeId: fixture.probeId,
    actor: 'workbench:visual-reviewer',
    now: '2026-07-21T09:00:00.000Z',
  });
  assert.equal(accepted.receipt.outcome, 'applied');
  assert.equal(accepted.receipt.effectiveState, 'probe-passed');
  assert.equal(accepted.reviewer, 'visual-reviewer');
  assert.match(accepted.receiptRef.path, /lifecycle-receipts\/keyword-handoff-probe-passed-/);
  assert.equal(accepted.receiptRef.sha256, await sha256File(path.join(fixture.workspaceRoot, accepted.receiptRef.path)));

  const ledger = await readJson(path.join(fixture.workspaceRoot, ledgerPath));
  const entry = ledger.entries.find((item) => item.recipeId === 'keyword-handoff');
  assert.equal(entry.state, 'probe-passed');
  assert.deepEqual(entry.receiptRefs, [accepted.receiptRef]);
  await assert.rejects(
    acceptMotionProbeLifecycle({workspaceRoot: fixture.workspaceRoot, probeId: fixture.probeId, actor: 'workbench:visual-reviewer'}),
    /cannot be accepted twice/,
  );
});

test('formal project approval consumes an accepted probe receipt and an approved project style selection', async (t) => {
  const fixture = await createFixture(t);
  await saveMotionProbeReview({
    workspaceRoot: fixture.workspaceRoot,
    reviewer: 'visual-reviewer',
    input: {probeId: fixture.probeId, decision: 'passed', checks: allChecks(true), notes: 'Approved visual probe.'},
  });
  const acceptedProbe = await acceptMotionProbeLifecycle({
    workspaceRoot: fixture.workspaceRoot,
    probeId: fixture.probeId,
    actor: 'workbench:visual-reviewer',
    now: '2026-07-21T09:01:00.000Z',
  });
  const projectRoot = path.join(fixture.workspaceRoot, 'hyperframes-workflow-kit', 'projects', fixture.projectId);
  await assert.rejects(
    approveMotionRecipeForProject({
      workspaceRoot: fixture.workspaceRoot,
      projectId: fixture.projectId,
      projectRoot,
      recipeId: 'keyword-handoff',
      reviewer: 'project-reviewer',
      actor: 'workbench:project-reviewer',
    }),
    /ENOENT/,
  );
  await writeJson(path.join(projectRoot, 'style-selection.json'), {
    schemaVersion: 'autovideo-style-selection/v1',
    projectId: fixture.projectId,
    baseStyleId: 'modern-ip-host-explainer',
    addons: [],
    registryItems: ['morph-text'],
    blueprints: [],
    motionRules: ['scale-swap-transition'],
    status: 'approved',
    approvedBy: 'style-reviewer',
    receipts: [{source: 'vendor/hyperframes/registry/registry.json', kind: 'official', license: 'Apache-2.0'}],
  });
  const approval = await approveMotionRecipeForProject({
    workspaceRoot: fixture.workspaceRoot,
    projectId: fixture.projectId,
    projectRoot,
    recipeId: 'keyword-handoff',
    reviewer: 'project-reviewer',
    actor: 'workbench:project-reviewer',
    probeReceiptPath: acceptedProbe.receiptRef.path,
    now: '2026-07-21T09:02:00.000Z',
  });
  assert.equal(approval.receipt.outcome, 'applied');
  assert.equal(approval.receipt.effectiveState, 'approved-project');
  assert.equal(approval.receipt.evidence.projectApproval.humanApproval.reviewer, 'project-reviewer');
  assert.equal(approval.receipt.evidence.projectApproval.probeReceipt.path, acceptedProbe.receiptRef.path);
  assert.match(approval.receiptRef.path, /hyperframes-workflow-kit\/projects\/formal-project-a\/review\/motion-lifecycle\/keyword-handoff-approved-project-/);

  const ledger = await readJson(path.join(fixture.workspaceRoot, ledgerPath));
  const entry = ledger.entries.find((item) => item.recipeId === 'keyword-handoff');
  assert.equal(entry.state, 'approved-project');
  assert.equal(entry.projectApprovals.length, 1);
  assert.equal(entry.projectApprovals[0].projectId, fixture.projectId);
  assert.equal(entry.projectApprovals[0].approvedBy, 'project-reviewer');
  await assert.rejects(
    approveMotionRecipeForProject({
      workspaceRoot: fixture.workspaceRoot,
      projectId: fixture.projectId,
      projectRoot,
      recipeId: 'keyword-handoff',
      reviewer: 'project-reviewer',
      actor: 'workbench:project-reviewer',
    }),
    /already approved/,
  );
});

test('explicit acceptance refuses a probe that only has a pending human review', async (t) => {
  const fixture = await createFixture(t);
  await saveMotionProbeReview({
    workspaceRoot: fixture.workspaceRoot,
    reviewer: 'visual-reviewer',
    input: {probeId: fixture.probeId, decision: 'pending', checks: allChecks(false), notes: ''},
  });
  await assert.rejects(
    acceptMotionProbeLifecycle({workspaceRoot: fixture.workspaceRoot, probeId: fixture.probeId, actor: 'workbench:visual-reviewer'}),
    /decision "passed"/,
  );
  const ledger = await readJson(path.join(fixture.workspaceRoot, ledgerPath));
  assert.equal(ledger.entries.find((item) => item.recipeId === 'keyword-handoff').state, 'candidate');
});
