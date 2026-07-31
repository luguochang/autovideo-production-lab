import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';

import {assertGraphLayout} from '../../tools/planning-contract/graph-layout-contract.mjs';

const sha256Bytes = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const graphLayoutPositionInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  expectedArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  graphId: z.string().trim().min(1).max(160),
  positions: z.array(z.object({
    id: z.string().trim().min(1).max(160),
    x: z.number().finite().min(0).max(100_000),
    y: z.number().finite().min(0).max(100_000),
  }).strict()).min(1).max(200),
  reason: z.string().trim().min(2).max(500),
}).strict();

const endpointPair = (source, target) => {
  const sourceCenter = {x: source.x + source.width / 2, y: source.y + source.height / 2};
  const targetCenter = {x: target.x + target.width / 2, y: target.y + target.height / 2};
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? [{x: source.x + source.width, y: sourceCenter.y}, {x: target.x, y: targetCenter.y}]
      : [{x: source.x, y: sourceCenter.y}, {x: target.x + target.width, y: targetCenter.y}];
  }
  return dy >= 0
    ? [{x: sourceCenter.x, y: source.y + source.height}, {x: targetCenter.x, y: target.y}]
    : [{x: sourceCenter.x, y: source.y}, {x: targetCenter.x, y: target.y + target.height}];
};

const updateEdgeSections = (layout) => {
  const nodes = new Map(layout.children.map((node) => [node.id, node]));
  layout.edges = layout.edges.map((edge) => {
    const source = nodes.get(edge.sources?.[0]);
    const target = nodes.get(edge.targets?.[0]);
    if (!source || !target) return edge;
    const [startPoint, endPoint] = endpointPair(source, target);
    return {
      ...edge,
      sections: [{
        id: edge.sections?.[0]?.id || `${edge.id}_manual_0`,
        startPoint,
        endPoint,
        incomingShape: source.id,
        outgoingShape: target.id,
      }],
      container: layout.id,
    };
  });
};

const updateBounds = (layout) => {
  const padding = 12;
  layout.x = 0;
  layout.y = 0;
  layout.width = Math.max(1, ...layout.children.map((node) => node.x + node.width + padding));
  layout.height = Math.max(1, ...layout.children.map((node) => node.y + node.height + padding));
};

export const applyGraphLayoutPositions = ({document, graphIr, projectId, input}) => {
  const parsed = graphLayoutPositionInputSchema.parse(input);
  const next = structuredClone(document);
  const diagram = next.diagrams.find((item) => item.graphId === parsed.graphId);
  if (!diagram) throw new Error(`Unknown graph layout diagram: ${parsed.graphId}`);
  const expectedIds = new Set(diagram.layout.children.map((node) => node.id));
  const receivedIds = new Set(parsed.positions.map((position) => position.id));
  if (receivedIds.size !== parsed.positions.length) throw new Error('Graph layout positions contain duplicate node IDs.');
  if (expectedIds.size !== receivedIds.size
    || [...expectedIds].some((id) => !receivedIds.has(id))) {
    throw new Error('Graph layout positions must cover exactly the current Graph IR nodes.');
  }
  const byId = new Map(parsed.positions.map((position) => [position.id, position]));
  diagram.layout.children = diagram.layout.children.map((node) => ({
    ...node,
    x: byId.get(node.id).x,
    y: byId.get(node.id).y,
  }));
  updateEdgeSections(diagram.layout);
  updateBounds(diagram.layout);
  next.generatedAt = new Date().toISOString();
  next.planning = {
    ...next.planning,
    layoutEditMode: 'react-flow-position-only',
    layoutEditReason: parsed.reason,
  };
  assertGraphLayout({document: next, graphIr, projectId});
  return next;
};

export const readGraphLayoutEditor = async ({project, artifactPath, resolveWorkspacePath, formalProjectRoot}) => {
  const stage = project.stages?.['diagram-assets'];
  if (!stage?.artifactPath || !artifactPath) {
    return {available: false, reason: 'Generate the diagram-assets stage before opening the graph editor.'};
  }
  const artifactTarget = resolveWorkspacePath(artifactPath);
  const graphIrTarget = path.join(formalProjectRoot(project), 'plan', 'graph-ir.json');
  const [artifactBytes, graphIrBytes] = await Promise.all([
    fs.readFile(artifactTarget),
    fs.readFile(graphIrTarget),
  ]);
  const document = JSON.parse(artifactBytes.toString('utf8'));
  const graphIr = JSON.parse(graphIrBytes.toString('utf8'));
  assertGraphLayout({document, graphIr, projectId: project.id});
  const graphs = new Map(graphIr.graphs.map((graph) => [graph.id, graph]));
  return {
    schemaVersion: 'autovideo-graph-layout-editor/v1',
    available: true,
    projectId: project.id,
    revision: stage.revision,
    status: stage.status,
    artifactPath: stage.artifactPath,
    artifactSha256: sha256Bytes(artifactBytes),
    graphIr: {
      path: 'plan/graph-ir.json',
      sha256: sha256Bytes(graphIrBytes),
      immutable: true,
    },
    diagrams: document.diagrams.map((diagram) => {
      const graph = graphs.get(diagram.graphId);
      const nodes = new Map((graph?.nodes || []).map((node) => [node.id, node]));
      const edges = new Map((graph?.edges || []).map((edge) => [edge.id, edge]));
      return {
        graphId: diagram.graphId,
        beatId: diagram.beatId,
        sceneId: graph?.sceneId || null,
        source: diagram.source,
        width: diagram.layout.width,
        height: diagram.layout.height,
        nodes: diagram.layout.children.map((node) => ({
          id: node.id,
          label: nodes.get(node.id)?.label || node.label || node.id,
          kind: nodes.get(node.id)?.kind || node.kind || 'node',
          sourceCueIds: nodes.get(node.id)?.sourceCueIds || [],
          position: {x: node.x, y: node.y},
          size: {width: node.width, height: node.height},
        })),
        edges: diagram.layout.edges.map((edge) => ({
          id: edge.id,
          source: edge.sources[0],
          target: edge.targets[0],
          label: edges.get(edge.id)?.label || edge.label || '',
        })),
      };
    }),
    policy: {
      positionOnly: true,
      graphIdentityImmutable: true,
      labelsImmutable: true,
      edgesImmutable: true,
      saveRequiresCurrentRevisionAndSha: true,
    },
  };
};
