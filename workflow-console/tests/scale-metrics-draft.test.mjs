import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, test} from 'node:test';

import {
  buildScaleMetricsDraft,
  mergeRecoveryMetrics,
  writeInternalScaleSimulation,
} from '../lib/scale-metrics-draft.mjs';

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, {recursive: true, force: true})));
});

const writeJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const makeWorkspace = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-scale-draft-'));
  temporaryRoots.push(root);
  const projectId = 'scale-draft-project';
  const formalRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
  const dataRoot = path.join(root, 'workflow-console', 'data');
  await writeJson(path.join(dataRoot, 'db.json'), {
    projects: {
      [projectId]: {
        id: projectId,
        route: 'script',
        formalProjectPath: `hyperframes-workflow-kit/projects/${projectId}`,
        events: [{type: 'stage-reopened', at: '2026-07-22T00:00:03.000Z'}],
        stages: {visual: {overrides: [{id: 'override-1'}]}},
      },
    },
    jobs: {
      failed: {
        id: 'failed', projectId, stageId: 'visual', status: 'failed', attempt: 1,
        createdAt: '2026-07-22T00:00:00.000Z', startedAt: '2026-07-22T00:00:00.000Z', finishedAt: '2026-07-22T00:00:01.000Z',
      },
      recovered: {
        id: 'recovered', projectId, stageId: 'visual', status: 'complete', attempt: 2, retryOf: 'failed',
        createdAt: '2026-07-22T00:00:01.100Z', startedAt: '2026-07-22T00:00:01.100Z', finishedAt: '2026-07-22T00:00:03.000Z',
      },
    },
  });
  await writeJson(path.join(formalRoot, 'project-state.json'), {
    schemaVersion: 'autovideo-project-state/v1', projectId, invalidations: [{reason: 'upstream changed'}],
  });
  await writeJson(path.join(formalRoot, 'STANDARD_RUN_RECEIPT.json'), {
    schemaVersion: 'autovideo-standard-run-receipt/v1', projectId, runId: 'run-2', resumesRunId: 'run-1',
    status: 'waiting-for-human', currentStageId: 'evidence-ledger',
    startedAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:05.000Z',
  });
  await writeJson(path.join(formalRoot, 'AssetManifest.json'), {
    assets: [
      {id: 'generated', path: 'generated.png', sha256: 'a'.repeat(64), source: 'project-generated'},
      {id: 'shared', path: 'shared.mp3', sha256: 'b'.repeat(64), source: 'local-asset-library'},
    ],
  });
  await fs.mkdir(path.join(formalRoot, '.media'), {recursive: true});
  await fs.writeFile(path.join(formalRoot, '.media', 'manifest.jsonl'), [
    JSON.stringify({id: 'shared-copy', path: 'shared.mp3', sha256: 'b'.repeat(64), source: 'local-asset-library'}),
    JSON.stringify({id: 'ingested', path: 'voice.wav', sha256: 'c'.repeat(64), source: 'ingested'}),
    '',
  ].join('\n'), 'utf8');
  await writeJson(path.join(formalRoot, 'plan', 'planning-bundle.json'), {
    shotManifest: {shots: [
      {cueId: 'cue-1', motionRecipeRefs: [{recipeId: 'keyword-handoff'}]},
      {cueId: 'cue-2', motionRecipeRefs: [{recipeId: 'diagram-build'}]},
    ]},
  });
  await writeJson(path.join(formalRoot, 'overrides', 'overrides.json'), {overrides: [{id: 'override-1'}]});
  return {root, dataRoot, formalRoot, projectId};
};

test('scale metrics draft derives mechanical fields and preserves unknown telemetry', async () => {
  const workspace = await makeWorkspace();
  const draft = await buildScaleMetricsDraft({
    workspaceRoot: workspace.root,
    workbenchDataRoot: workspace.dataRoot,
    projectId: workspace.projectId,
    generatedAt: '2026-07-22T00:00:06.000Z',
  });
  assert.equal(draft.countsForMaturity, false);
  assert.equal(draft.recoveryEligible, true);
  assert.equal(draft.metrics.elapsedSeconds.value, 5);
  assert.equal(draft.metrics.retryCount.value, 1);
  assert.equal(draft.metrics.overrideCount.value, 1);
  assert.equal(draft.metrics.assetReuseCount.value, 1);
  assert.equal(draft.metrics.assetCandidateCount.value, 3);
  assert.equal(draft.metrics.recipeReuseCount.value, 2);
  assert.equal(draft.metrics.recipeOpportunityCount.value, 2);
  assert.equal(draft.metrics.reworkCount.value, 1);
  assert.equal(draft.metrics.humanMinutes.state, 'unavailable');
  assert.equal(draft.metrics.cpuSeconds.value, null);
  assert.equal(draft.policy.unknownIsNeverZero, true);
});

test('internal simulation is separate from human evidence and recovery asks only for unknown values', async () => {
  const workspace = await makeWorkspace();
  const result = await writeInternalScaleSimulation({
    workspaceRoot: workspace.root,
    workbenchDataRoot: workspace.dataRoot,
    projectId: workspace.projectId,
    generatedAt: '2026-07-22T00:00:06.000Z',
  });
  assert.equal(result.receipt.status, 'internal-simulation-only');
  assert.equal(result.receipt.countsForMaturity, false);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);

  const merged = mergeRecoveryMetrics({
    draft: result.receipt,
    provided: {humanMinutes: 4, cpuSeconds: 12, gpuSeconds: 0, modelCalls: 1},
  });
  assert.deepEqual(merged.missing, []);
  assert.equal(merged.metrics.elapsedSeconds, 5);
  assert.equal(merged.metrics.humanMinutes, 4);
  assert.match(merged.sources.retryCount, /^derived:/u);
  assert.equal(merged.sources.humanMinutes, 'human-confirmed-input');
});
