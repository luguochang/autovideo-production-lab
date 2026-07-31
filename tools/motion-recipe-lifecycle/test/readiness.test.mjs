import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {loadLifecycleContext} from '../lifecycle.mjs';
import {
  buildMotionLifecycleReadiness,
  motionHumanReviewTemplate,
  writeMotionLifecycleReadiness,
} from '../readiness.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const defaults = {
  libraryPath: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledgerPath: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  catalogPaths: {
    officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
    officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
    officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
  },
};

test('readiness covers all eight recipes without inventing human evidence', async () => {
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const report = await buildMotionLifecycleReadiness({workspaceRoot, library: context.library, ledger: context.ledger});
  assert.equal(report.summary.recipeCount, 8);
  assert.equal(report.summary.candidateCount, 8);
  assert.equal(report.summary.productionEligibleCount, 0);
  assert.equal(report.summary.humanEvidenceInvented, false);
  assert.equal(report.contract.valid, true);
  assert.equal(new Set(report.recipes.map((recipe) => recipe.recipeId)).size, 8);
  assert.ok(report.recipes.every((recipe) => recipe.definitionSha256 && recipe.nextAction));
});

test('readiness keeps all library recipes visible and fails closed when a lifecycle entry is missing', async () => {
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const ledger = structuredClone(context.ledger);
  const removed = ledger.entries.pop();
  const report = await buildMotionLifecycleReadiness({workspaceRoot, library: context.library, ledger});
  const recipe = report.recipes.find((item) => item.recipeId === removed.recipeId);
  assert.equal(report.summary.recipeCount, 8);
  assert.equal(report.contract.valid, false);
  assert.equal(report.summary.productionEligibleCount, 0);
  assert.equal(recipe.state, 'missing');
  assert.equal(recipe.contractValid, false);
  assert.equal(recipe.productionEligible, false);
  assert.equal(recipe.nextAction, 'repair-lifecycle-contract');
});

test('readiness rejects a stale recipe definition even if its ledger state claims template promotion', async () => {
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const ledger = structuredClone(context.ledger);
  const entry = ledger.entries[0];
  entry.definitionSha256 = 'f'.repeat(64);
  entry.state = 'promoted-template';
  entry.projectApprovals = [
    {projectId: 'project-a', approvedBy: 'reviewer-a', approvedAt: '2026-07-01T00:00:00.000Z'},
    {projectId: 'project-b', approvedBy: 'reviewer-b', approvedAt: '2026-07-02T00:00:00.000Z'},
  ];
  const report = await buildMotionLifecycleReadiness({workspaceRoot, library: context.library, ledger});
  const recipe = report.recipes.find((item) => item.recipeId === entry.recipeId);
  assert.equal(report.contract.valid, false);
  assert.equal(report.summary.productionEligibleCount, 0);
  assert.equal(recipe.contractValid, false);
  assert.equal(recipe.productionEligible, false);
});

test('human worksheets are non-authorizing placeholders with all nine checks', async () => {
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const template = motionHumanReviewTemplate({entry: context.ledger.entries[0], library: context.ledger.library});
  assert.equal(template.decision, null);
  assert.equal(template.confirmedHuman, false);
  assert.equal(template.authorizesLifecycleTransition, false);
  assert.equal(Object.keys(template.checks).length, 9);
  assert.ok(Object.values(template.checks).every((value) => value === null));
});

test('writer emits exactly one worksheet per recipe and rejects paths outside the workspace', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-readiness-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const context = await loadLifecycleContext({workspaceRoot, ...defaults});
  const report = await buildMotionLifecycleReadiness({workspaceRoot, library: context.library, ledger: context.ledger});
  const written = await writeMotionLifecycleReadiness({
    workspaceRoot: root,
    report,
    outputPath: 'status/readiness.json',
    templatesDir: 'templates',
    ledger: context.ledger,
  });
  assert.equal(written.templates.length, 8);
  assert.equal((await fs.readdir(path.join(root, 'templates'))).length, 8);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'status', 'readiness.json'), 'utf8')).summary.recipeCount, 8);
  await assert.rejects(
    () => writeMotionLifecycleReadiness({workspaceRoot: root, report, outputPath: '../escape.json', templatesDir: null, ledger: context.ledger}),
    /leaves the workspace/i,
  );
});
