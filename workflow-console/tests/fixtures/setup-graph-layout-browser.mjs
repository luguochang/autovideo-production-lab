import fs from 'node:fs/promises';
import path from 'node:path';

const consoleRoot = path.resolve(import.meta.dirname, '..', '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = 'graph-layout-browser-smoke';
const dataRoot = path.join(consoleRoot, 'data', 'graph-layout-browser-smoke');
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);

process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = dataRoot;
await fs.rm(dataRoot, {recursive: true, force: true});
await fs.rm(formalRoot, {recursive: true, force: true});
await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});

const store = await import('../../lib/project-store.mjs');
await store.createProject({
  id: projectId,
  title: 'Graph IR 布局验收',
  route: 'script',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'browser layout interaction smoke test',
  automation: 'critical-gates',
  publicationRights: 'internal-only',
  rightsNotes: 'temporary browser fixture',
});

const graphIr = {
  schemaVersion: 'autovideo-graph-ir/v1',
  projectId,
  graphs: [{
    id: 'graph-scene-01',
    sceneId: 'scene-01',
    nodes: [
      {id: 'node-a', label: '素材先形成事实台账', kind: 'claim', sourceCueIds: ['cue-001']},
      {id: 'node-b', label: '再生成可追溯口播稿', kind: 'conclusion', sourceCueIds: ['cue-002']},
    ],
    edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b', label: '然后'}],
  }],
};
await fs.writeFile(path.join(formalRoot, 'plan', 'graph-ir.json'), `${JSON.stringify(graphIr, null, 2)}\n`, 'utf8');

const layout = {
  schemaVersion: 'autovideo-graph-layout/v1',
  projectId,
  generatedAt: new Date().toISOString(),
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
const artifactPath = await store.saveArtifact(projectId, 'diagram-assets', 'graph-layout.json', layout, 'json');
await store.markStageGenerated(projectId, 'diagram-assets', {artifactPath, artifactKind: 'json'});
console.log(JSON.stringify({projectId, dataRoot, formalRoot}, null, 2));
