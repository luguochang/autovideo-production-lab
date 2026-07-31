import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildVisualAssetFeedback,
  buildVisualAssetLibraryMetrics,
  saveVisualAssetFeedback,
} from '../lib/visual-asset-feedback.mjs';

test('visual asset feedback is current-source-bound, revisioned, and summarized', async (t) => {
  const projectId = 'visual-asset-feedback-test';
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-visual-feedback-workspace-'));
  const formalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-visual-feedback-project-'));
  t.after(() => Promise.all([
    fs.rm(workspaceRoot, {recursive: true, force: true}),
    fs.rm(formalRoot, {recursive: true, force: true}),
  ]));
  await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});
  await fs.writeFile(path.join(formalRoot, 'plan', 'shot-manifest.json'), `${JSON.stringify({
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId,
    shots: [{
      cueId: 'cue-001',
      start: 0,
      end: 5,
      visualType: 'diagram',
      narration: '工作流把多个节点连接起来。',
      screenText: {text: '工作流节点'},
      motionRecipeRefs: [{recipeId: 'diagram-build'}],
    }],
  }, null, 2)}\n`, 'utf8');

  const editor = await buildVisualAssetFeedback({workspaceRoot, formalRoot, projectId});
  const candidate = editor.plan.candidates[0];
  const adopted = await saveVisualAssetFeedback({
    workspaceRoot,
    formalRoot,
    projectId,
    reviewer: 'reviewer-a',
    input: {
      candidateDigestSha256: editor.plan.candidateDigestSha256,
      candidateId: candidate.id,
      decision: 'adopted',
      note: '',
    },
  });
  assert.equal(adopted.counts.adopted, 1);
  assert.equal(adopted.metrics.adoptionRate, 1);
  assert.equal(adopted.decisions[0].revision, 1);

  await assert.rejects(
    saveVisualAssetFeedback({
      workspaceRoot,
      formalRoot,
      projectId,
      input: {
        candidateDigestSha256: editor.plan.candidateDigestSha256,
        candidateId: candidate.id,
        decision: 'rejected',
        note: '',
      },
    }),
    /actionable note/,
  );

  const rejected = await saveVisualAssetFeedback({
    workspaceRoot,
    formalRoot,
    projectId,
    reviewer: 'reviewer-a',
    input: {
      candidateDigestSha256: editor.plan.candidateDigestSha256,
      candidateId: candidate.id,
      decision: 'rejected',
      note: 'The workflow diagram already carries this concept.',
    },
  });
  assert.equal(rejected.counts.rejected, 1);
  assert.equal(rejected.decisions[0].revision, 2);
  assert.equal(rejected.decisions[0].supersedes, adopted.decisions[0].id);
  const metrics = await buildVisualAssetLibraryMetrics({workspaceRoot});
  assert.equal(metrics.decisionCount, 1);
  assert.equal(metrics.adoptionRate, 0);
  assert.equal(metrics.rejectionRate, 1);
});
