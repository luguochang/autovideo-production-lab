import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
  authorizeRecipeUse,
  commitLifecycleTransition,
  createInitialLedger,
  EVIDENCE_SCHEMA_VERSION,
  evaluateLifecycleTransition,
  loadLifecycleContext,
  readJson,
  sha256File,
  validateLifecycleLedger,
} from '../lifecycle.mjs';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const defaults = {
  libraryPath: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledgerPath: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  catalogPaths: {
    officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
    officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
    officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
  },
};

const write = async (root, relativePath, value) => {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
  return {path: relativePath.replaceAll('\\', '/'), sha256: await sha256File(target)};
};

const copyFixture = async (root, relativePath) => {
  const source = path.join(workspaceRoot, relativePath);
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.copyFile(source, target);
};

const makeContext = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-lifecycle-'));
  const fixturePaths = [
    defaults.libraryPath,
    ...Object.values(defaults.catalogPaths),
  ];
  await Promise.all(fixturePaths.map((relativePath) => copyFixture(root, relativePath)));
  const catalogs = {
    officialRegistry: {path: defaults.catalogPaths.officialRegistry},
    officialBlueprints: {path: defaults.catalogPaths.officialBlueprints},
    officialMotionRules: {path: defaults.catalogPaths.officialMotionRules},
  };
  const ledger = await createInitialLedger({workspaceRoot: root, libraryPath: defaults.libraryPath, catalogs});
  const library = await readJson(path.join(root, defaults.libraryPath));
  const loadedCatalogs = {
    officialRegistry: await readJson(path.join(root, defaults.catalogPaths.officialRegistry)),
    officialBlueprints: await readJson(path.join(root, defaults.catalogPaths.officialBlueprints)),
    officialMotionRules: await readJson(path.join(root, defaults.catalogPaths.officialMotionRules)),
  };
  return {root, ledger, library, catalogs: loadedCatalogs};
};

const validProbeEvidence = async (context) => {
  const still = await write(context.root, 'probe/still.png', Buffer.from('still'));
  const motionProbe = await write(context.root, 'probe/probe.mp4', Buffer.from('motion'));
  const check = await write(context.root, 'probe/check.json', Buffer.from('{"ok":true}'));
  const invariantAudit = await write(context.root, 'probe/invariant-audit.json', Buffer.from('{"passed":true}'));
  const hostAssetManifest = await write(context.root, 'probe/host-assets.manifest.json', Buffer.from('{"approved":true}'));
  const implementation = await write(context.root, 'probe/compositions/morph-text.html', Buffer.from('<div>morph</div>'));
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    recipeId: 'keyword-handoff',
    recipeVersion: '1.0.0',
    requestedState: 'probe-passed',
    probe: {
      kind: 'motion-probe',
      projectId: 'probe-project',
      path: 'probe',
      durationSeconds: 5.2,
      sameNarrationWindow: true,
      narrationSha256: crypto.createHash('sha256').update('narration').digest('hex'),
      audioSha256: crypto.createHash('sha256').update('audio').digest('hex'),
      invariants: structuredClone(context.ledger.invariants),
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
      visualReview: {
        status: 'passed',
        reviewer: 'visual-reviewer',
        reviewedAt: '2026-07-20T12:20:00.000Z',
        checks: {
          layout: true,
          textFit: true,
          seekBehavior: true,
          hostStable: true,
          captionStable: true,
          terminalFrameReadable: true,
          officialReuseVisible: true,
          exactBackground: true,
          cameraScopedToContentWorld: true,
        },
      },
      officialReuseObserved: [{kind: 'official-registry', id: 'morph-text', implementation}],
    },
  };
};

const commit = (ledger, evaluation, suffix) => commitLifecycleTransition({
  ledger,
  evaluation,
  receiptRef: {
    path: `receipts/${suffix}.json`,
    sha256: crypto.createHash('sha256').update(suffix).digest('hex'),
  },
});

test('checked-in ledger is current and keeps every recipe candidate', async () => {
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const issues = await validateLifecycleLedger({workspaceRoot, ...context});
  assert.deepEqual(issues, []);
  assert.equal(context.ledger.entries.length, context.library.recipes.length);
  assert.ok(context.ledger.entries.every((entry) => entry.state === 'candidate' && entry.revision === 0));
});

test('E05 is recorded as supporting evidence but cannot pass the short probe gate', async () => {
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const evidence = await readJson(path.join(workspaceRoot, 'style-library/examples/knowledge-explainer-e05-lifecycle-evidence.example.json'));
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'probe-passed',
    evidence,
    actor: 'autovideo-e05-audit',
    now: '2026-07-20T12:15:00.000Z',
  });
  assert.equal(evaluation.allowed, false);
  assert.equal(evaluation.receipt.effectiveState, 'candidate');
  assert.deepEqual(evaluation.receipt.blockedReasons, [
    'not-a-motion-probe',
    'probe-duration-out-of-range',
    'missing-or-failed-invariant-audit',
    'missing-host-asset-binding',
    'missing-still-evidence',
    'missing-motion-probe',
    'hyperframes-check-incomplete',
    'missing-visual-review',
    'official-reuse-not-observed',
  ]);
  const checkedIn = await readJson(path.join(workspaceRoot, 'style-library/examples/knowledge-explainer-e05-assessment.receipt.json'));
  assert.deepEqual(evaluation.receipt, checkedIn);
});

test('candidate reaches probe-passed only with bounded, checked, reviewed, official-reuse evidence', async (t) => {
  const context = await makeContext();
  t.after(() => fs.rm(context.root, {recursive: true, force: true}));
  const evidence = await validProbeEvidence(context);
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot: context.root,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'probe-passed',
    evidence,
    now: '2026-07-20T12:20:00.000Z',
  });
  assert.equal(evaluation.allowed, true);
  assert.deepEqual(evaluation.receipt.blockedReasons, []);
  const next = commit(context.ledger, evaluation, 'probe-passed');
  assert.equal(next.entries[0].state, 'probe-passed');
  assert.equal(next.entries[0].revision, 1);
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'probe'}).allowed, true);
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'project', projectId: 'project-a'}).allowed, false);
});

test('project approval cannot be synthesized without a hash-bound human approval', async (t) => {
  const context = await makeContext();
  t.after(() => fs.rm(context.root, {recursive: true, force: true}));
  const probeEvaluation = await evaluateLifecycleTransition({
    workspaceRoot: context.root,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'probe-passed',
    evidence: await validProbeEvidence(context),
    now: '2026-07-20T12:20:00.000Z',
  });
  context.ledger = commit(context.ledger, probeEvaluation, 'probe-passed');
  const probeReceipt = await write(context.root, 'receipts/probe.json', JSON.stringify(probeEvaluation.receipt));
  const styleSelection = await write(context.root, 'projects/project-a/style-selection.json', JSON.stringify({
    schemaVersion: 'autovideo-style-selection/v1',
    projectId: 'project-a',
    baseStyleId: 'modern-ip-host-explainer',
    addons: [],
    registryItems: ['morph-text'],
    blueprints: [],
    motionRules: ['scale-swap-transition'],
    status: 'approved',
    approvedBy: 'reviewer-a',
    receipts: [{source: 'official', kind: 'official', license: 'Apache-2.0'}],
  }));
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    recipeId: 'keyword-handoff',
    recipeVersion: '1.0.0',
    requestedState: 'approved-project',
    projectApproval: {projectId: 'project-a', styleSelection, probeReceipt, humanApproval: null},
  };
  const blocked = await evaluateLifecycleTransition({
    workspaceRoot: context.root,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'approved-project',
    evidence,
    now: '2026-07-20T12:30:00.000Z',
  });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.receipt.blockedReasons.includes('missing-project-human-approval'));

  evidence.projectApproval.humanApproval = {
    source: 'human', decision: 'approved', scope: 'project', reviewer: 'reviewer-a', approvedAt: '2026-07-20T12:31:00.000Z',
  };
  const approved = await evaluateLifecycleTransition({
    workspaceRoot: context.root,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'approved-project',
    evidence,
    now: '2026-07-20T12:31:00.000Z',
  });
  assert.equal(approved.allowed, true);
  const next = commit(context.ledger, approved, 'project-a');
  assert.equal(next.entries[0].state, 'approved-project');
  assert.equal(next.entries[0].projectApprovals[0].projectId, 'project-a');
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'project', projectId: 'project-a'}).allowed, true);
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'project', projectId: 'project-b'}).allowed, false);
});

test('template promotion needs two project approvals, regression evidence, and a template human decision', async (t) => {
  const context = await makeContext();
  t.after(() => fs.rm(context.root, {recursive: true, force: true}));
  const entry = context.ledger.entries[0];
  entry.state = 'approved-project';
  entry.revision = 3;
  entry.projectApprovals = ['a', 'b'].map((suffix) => ({
    projectId: `project-${suffix}`,
    approvedBy: `reviewer-${suffix}`,
    approvedAt: '2026-07-20T12:31:00.000Z',
    styleSelection: {path: `projects/${suffix}/style-selection.json`, sha256: crypto.createHash('sha256').update(`style-${suffix}`).digest('hex')},
    probeReceipt: {path: `projects/${suffix}/probe.json`, sha256: crypto.createHash('sha256').update(`probe-${suffix}`).digest('hex')},
  }));
  const report = await write(context.root, 'reports/cross-project.json', Buffer.from('{"passed":true}'));
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    recipeId: 'keyword-handoff',
    recipeVersion: '1.0.0',
    requestedState: 'promoted-template',
    templateApproval: {
      report,
      crossProjectRegressionPassed: true,
      backwardCompatibilityPassed: true,
      humanApproval: {source: 'human', decision: 'approved', scope: 'template', reviewer: 'template-owner', approvedAt: '2026-07-20T12:40:00.000Z'},
    },
  };
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot: context.root,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'promoted-template',
    evidence,
    now: '2026-07-20T12:40:00.000Z',
  });
  assert.equal(evaluation.allowed, true);
  const next = commit(context.ledger, evaluation, 'template-promotion');
  assert.equal(next.entries[0].state, 'promoted-template');
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'template'}).allowed, true);
});

test('retirement is terminal for new selection but exact old locks remain replayable', async (t) => {
  const context = await makeContext();
  t.after(() => fs.rm(context.root, {recursive: true, force: true}));
  const entry = context.ledger.entries[0];
  entry.state = 'promoted-template';
  entry.revision = 4;
  entry.projectApprovals = ['a', 'b'].map((suffix) => ({
    projectId: `project-${suffix}`,
    approvedBy: `reviewer-${suffix}`,
    approvedAt: '2026-07-20T12:31:00.000Z',
    styleSelection: {path: `projects/${suffix}/style-selection.json`, sha256: crypto.createHash('sha256').update(`style-${suffix}`).digest('hex')},
    probeReceipt: {path: `projects/${suffix}/probe.json`, sha256: crypto.createHash('sha256').update(`probe-${suffix}`).digest('hex')},
  }));
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    recipeId: 'keyword-handoff',
    recipeVersion: '1.0.0',
    requestedState: 'retired',
    retirement: {
      reason: 'superseded-by-new-version',
      replacementRecipeId: 'evidence-pivot',
      existingProjectReplayAllowed: true,
      futureSelectionBlocked: true,
      humanApproval: {source: 'human', decision: 'approved', scope: 'retirement', reviewer: 'template-owner', approvedAt: '2026-07-20T12:50:00.000Z'},
    },
  };
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot: context.root,
    ...context,
    recipeId: 'keyword-handoff',
    targetState: 'retired',
    evidence,
    now: '2026-07-20T12:50:00.000Z',
  });
  assert.equal(evaluation.allowed, true);
  const next = commit(context.ledger, evaluation, 'retirement');
  assert.equal(next.entries[0].state, 'retired');
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'probe'}).allowed, false);
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'template'}).allowed, false);
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'replay', lockedDefinitionSha256: entry.definitionSha256}).allowed, true);
  assert.equal(authorizeRecipeUse({ledger: next, recipeId: 'keyword-handoff', scope: 'replay', lockedDefinitionSha256: '0'.repeat(64)}).allowed, false);
});

test('definition drift invalidates lifecycle bindings instead of inheriting approval', async (t) => {
  const context = await makeContext();
  t.after(() => fs.rm(context.root, {recursive: true, force: true}));
  context.library.recipes[0].purpose = 'Changed behavior without a version bump.';
  const issues = await validateLifecycleLedger({workspaceRoot: context.root, ...context});
  assert.ok(issues.some((item) => item.code === 'entry.definition'));
});

test('CLI exposes status without mutating the checked-in ledger', async () => {
  const before = await sha256File(path.join(workspaceRoot, defaults.ledgerPath));
  const {stdout} = await execFileAsync(process.execPath, ['scripts/motion-recipe-lifecycle.mjs', 'status', '--recipe', 'keyword-handoff', '--json'], {cwd: workspaceRoot});
  const result = JSON.parse(stdout);
  assert.equal(result.entries[0].state, 'candidate');
  assert.equal(await sha256File(path.join(workspaceRoot, defaults.ledgerPath)), before);
});
