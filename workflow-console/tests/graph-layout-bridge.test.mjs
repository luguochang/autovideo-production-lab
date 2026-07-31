import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {materializeGraphLayoutBinding} from '../lib/graph-layout-bridge.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const testRoot = path.join(workspaceRoot, 'workflow-console', 'data', `graph-layout-bridge-${process.pid}`);
const formalRoot = path.join(testRoot, 'formal');
const artifactPath = path.join(testRoot, 'graph-layout.json');

const graphIr = {
  schemaVersion: 'autovideo-graph-ir/v1',
  projectId: 'graph-layout-bridge',
  graphs: [{
    id: 'graph-scene-01',
    sceneId: 'scene-01',
    nodes: [
      {id: 'node-a', label: 'A', sourceCueIds: ['cue-001']},
      {id: 'node-b', label: 'B', sourceCueIds: ['cue-001']},
    ],
    edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b'}],
  }],
};

const graphLayout = {
  schemaVersion: 'autovideo-graph-layout/v1',
  projectId: 'graph-layout-bridge',
  generatedAt: '2026-07-21T00:00:00.000Z',
  planning: {workbenchRevision: 2},
  diagrams: [{
    graphId: 'graph-scene-01',
    beatId: 'graph-scene-01',
    source: 'graph-ir',
    layout: {
      id: 'graph-scene-01',
      x: 0,
      y: 0,
      width: 520,
      height: 120,
      children: [
        {id: 'node-a', x: 12, y: 12, width: 220, height: 96},
        {id: 'node-b', x: 288, y: 12, width: 220, height: 96},
      ],
      edges: [{id: 'edge-a-b', sources: ['node-a'], targets: ['node-b']}],
    },
  }],
};

before(async () => {
  await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});
  await fs.writeFile(path.join(formalRoot, 'plan', 'graph-ir.json'), `${JSON.stringify(graphIr, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(formalRoot, 'plan', 'production-manifest.json'), `${JSON.stringify({
    schemaVersion: 'autovideo-production-manifest/v1',
    projectId: graphIr.projectId,
    bindings: {},
    provenance: {},
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(artifactPath, `${JSON.stringify(graphLayout, null, 2)}\n`, 'utf8');
});

after(async () => {
  await fs.rm(testRoot, {recursive: true, force: true});
});

test('approved workbench graph layout is materialized and hash-bound into production', async () => {
  const result = await materializeGraphLayoutBinding({workspaceRoot, formalRoot, artifactPath});
  const [formalLayout, manifest] = await Promise.all([
    fs.readFile(path.join(formalRoot, 'plan', 'graph-layout.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(formalRoot, 'plan', 'production-manifest.json'), 'utf8').then(JSON.parse),
  ]);
  const actualSha256 = crypto.createHash('sha256')
    .update(await fs.readFile(path.join(formalRoot, 'plan', 'graph-layout.json')))
    .digest('hex');

  assert.deepEqual(formalLayout, graphLayout);
  assert.equal(manifest.bindings.graphLayout.path, 'plan/graph-layout.json');
  assert.equal(manifest.bindings.graphLayout.sha256, actualSha256);
  assert.equal(result.binding.sha256, actualSha256);
  assert.equal(manifest.provenance.graphLayout.mode, 'workbench-approved-layout');
});
