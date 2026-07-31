import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import test from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = `graph-layout-editor-api-${process.pid}`;
const dataRoot = path.join(consoleRoot, 'data', projectId);
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const serverReceiptPath = path.join(dataRoot, 'server.json');

process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
const store = await import('../lib/project-store.mjs');

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close((error) => error ? reject(error) : resolve(address.port));
  });
});

const waitForHealth = async (baseUrl, child) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Workbench server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the workbench test server.');
};

const request = async (baseUrl, pathname, {method = 'GET', body} = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : {'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {response, payload: await response.json()};
};

const stopChild = async (child) => {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode == null) child.kill('SIGKILL');
};

const projectInput = {
  id: projectId,
  title: 'Graph layout editor API',
  route: 'script',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'verify position-only graph editing',
  automation: 'critical-gates',
  publicationRights: 'internal-only',
  rightsNotes: 'test-only fixture',
};

const graphIr = {
  schemaVersion: 'autovideo-graph-ir/v1',
  projectId,
  graphs: [{
    id: 'graph-scene-01',
    sceneId: 'scene-01',
    nodes: [
      {id: 'node-a', label: '事实 A', kind: 'claim', sourceCueIds: ['cue-001']},
      {id: 'node-b', label: '结论 B', kind: 'conclusion', sourceCueIds: ['cue-002']},
    ],
    edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b', label: '因此'}],
  }],
};

const graphLayout = {
  schemaVersion: 'autovideo-graph-layout/v1',
  projectId,
  generatedAt: '2026-07-22T00:00:00.000Z',
  planning: {workbenchRevision: 1},
  diagrams: [{
    graphId: 'graph-scene-01',
    beatId: 'graph-scene-01',
    source: 'graph-ir',
    layout: {
      id: 'graph-scene-01', x: 0, y: 0, width: 544, height: 120,
      children: [
        {id: 'node-a', x: 12, y: 12, width: 220, height: 96},
        {id: 'node-b', x: 312, y: 12, width: 220, height: 96},
      ],
      edges: [{id: 'edge-a-b', sources: ['node-a'], targets: ['node-b']}],
    },
  }],
};

test('Graph IR visual editor saves positions with optimistic concurrency and rejects identity drift', async () => {
  let child = null;
  await fs.rm(dataRoot, {recursive: true, force: true});
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'plan', 'graph-ir.json'), `${JSON.stringify(graphIr, null, 2)}\n`, 'utf8');
    await store.createProject(projectInput);
    const artifactPath = await store.saveArtifact(projectId, 'diagram-assets', 'graph-layout.json', graphLayout, 'json');
    await store.markStageGenerated(projectId, 'diagram-assets', {artifactPath, artifactKind: 'json'});
    const downstreamPath = await store.saveArtifact(projectId, 'style-probe', 'STYLE_REVIEW.md', '# generated\n', 'text');
    await store.markStageGenerated(projectId, 'style-probe', {artifactPath: downstreamPath, artifactKind: 'text'});

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {
        ...process.env,
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const health = await waitForHealth(baseUrl, child);
    assert.ok(health.capabilities.includes('graph-layout-editor-v1'));

    const initial = await request(baseUrl, `/api/projects/${projectId}/graph-layout-editor`);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload.editor.available, true);
    assert.equal(initial.payload.editor.policy.positionOnly, true);
    assert.equal(initial.payload.editor.diagrams[0].nodes[0].label, '事实 A');
    assert.equal(initial.payload.editor.diagrams[0].edges[0].source, 'node-a');

    const saveBody = {
      expectedRevision: initial.payload.editor.revision,
      expectedArtifactSha256: initial.payload.editor.artifactSha256,
      graphId: 'graph-scene-01',
      positions: [
        {id: 'node-a', x: 36, y: 44},
        {id: 'node-b', x: 420, y: 180},
      ],
      reason: '拉开两个节点，避免流程信息拥挤。',
    };
    const saved = await request(baseUrl, `/api/projects/${projectId}/graph-layout-editor`, {method: 'PUT', body: saveBody});
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.project.stages['diagram-assets'].status, 'needs-review');
    assert.equal(saved.payload.project.stages['diagram-assets'].revision, initial.payload.editor.revision + 1);
    assert.equal(saved.payload.project.stages['style-probe'].status, 'stale');
    assert.deepEqual(saved.payload.editor.diagrams[0].nodes.map((node) => node.position), [{x: 36, y: 44}, {x: 420, y: 180}]);
    assert.notEqual(saved.payload.editor.artifactSha256, initial.payload.editor.artifactSha256);

    const artifact = JSON.parse(await fs.readFile(store.resolveWorkspacePath(saved.payload.editor.artifactPath), 'utf8'));
    assert.equal(artifact.diagrams[0].layout.width, 652);
    assert.equal(artifact.diagrams[0].layout.height, 288);
    assert.deepEqual(artifact.diagrams[0].layout.edges[0].sources, ['node-a']);
    assert.deepEqual(artifact.diagrams[0].layout.edges[0].targets, ['node-b']);
    assert.equal(artifact.diagrams[0].layout.edges[0].sections[0].startPoint.x, 256);
    const history = await fs.readdir(path.join(path.dirname(store.resolveWorkspacePath(saved.payload.editor.artifactPath)), '.history'));
    assert.ok(history.length >= 1);

    const stale = await request(baseUrl, `/api/projects/${projectId}/graph-layout-editor`, {method: 'PUT', body: saveBody});
    assert.equal(stale.response.status, 500);
    assert.match(stale.payload.error, /changed after this editor loaded/i);

    const forged = await request(baseUrl, `/api/projects/${projectId}/graph-layout-editor`, {
      method: 'PUT',
      body: {
        ...saveBody,
        expectedRevision: saved.payload.editor.revision,
        expectedArtifactSha256: saved.payload.editor.artifactSha256,
        positions: [{id: 'node-a', x: 0, y: 0}, {id: 'node-c', x: 1, y: 1}],
      },
    });
    assert.equal(forged.response.status, 500);
    assert.match(forged.payload.error, /exactly the current Graph IR nodes/i);
    const afterRejected = await request(baseUrl, `/api/projects/${projectId}/graph-layout-editor`);
    assert.equal(afterRejected.payload.editor.artifactSha256, saved.payload.editor.artifactSha256);
    assert.equal(afterRejected.payload.editor.revision, saved.payload.editor.revision);
  } finally {
    await stopChild(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});
