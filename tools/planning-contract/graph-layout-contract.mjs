const GRAPH_LAYOUT_SCHEMA_VERSION = 'autovideo-graph-layout/v1';
const GRAPH_IR_SCHEMA_VERSION = 'autovideo-graph-ir/v1';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const validatePoint = ({point, path, errors}) => {
  if (!isRecord(point)) {
    errors.push(`${path} must be an object with finite x and y coordinates.`);
    return;
  }
  for (const axis of ['x', 'y']) {
    if (!Number.isFinite(point[axis])) errors.push(`${path}.${axis} must be a finite number.`);
  }
};

const validateBox = ({box, path, errors}) => {
  for (const axis of ['x', 'y']) {
    if (!Number.isFinite(box?.[axis])) errors.push(`${path}.${axis} must be a finite number.`);
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isFinite(box?.[dimension]) || box[dimension] <= 0) {
      errors.push(`${path}.${dimension} must be a finite number greater than zero.`);
    }
  }
};

const recordUniqueId = ({id, seen, path, kind, errors}) => {
  if (!isNonEmptyString(id)) {
    errors.push(`${path}.id must be a non-empty string.`);
    return false;
  }
  if (seen.has(id)) {
    errors.push(`Duplicate ${kind} ID: ${id}.`);
    return false;
  }
  seen.add(id);
  return true;
};

const compareIds = ({actualIds, expectedIds, graphId, kind, errors}) => {
  for (const id of expectedIds) {
    if (!actualIds.has(id)) errors.push(`Diagram ${graphId} is missing Graph IR ${kind} ${id}.`);
  }
  for (const id of actualIds) {
    if (!expectedIds.has(id)) errors.push(`Diagram ${graphId} contains unknown ${kind} ${id}.`);
  }
};

const sameSingleEndpoint = (value, expected) => (
  Array.isArray(value) && value.length === 1 && value[0] === expected
);

/**
 * Validate an ELK graph-layout artifact against its canonical Graph IR.
 * ELK-specific extension fields are intentionally ignored.
 *
 * @returns {string[]} all contract violations in deterministic traversal order
 */
export const validateGraphLayout = ({document, graphIr, projectId} = {}) => {
  const errors = [];

  if (!isRecord(document)) {
    return ['Graph layout document must be an object.'];
  }
  if (!isRecord(graphIr)) {
    return ['Graph IR document must be an object.'];
  }

  if (document.schemaVersion !== GRAPH_LAYOUT_SCHEMA_VERSION) {
    errors.push(`Graph layout schemaVersion must be ${GRAPH_LAYOUT_SCHEMA_VERSION}.`);
  }
  if (graphIr.schemaVersion !== GRAPH_IR_SCHEMA_VERSION) {
    errors.push(`Graph IR schemaVersion must be ${GRAPH_IR_SCHEMA_VERSION}.`);
  }
  if (!isNonEmptyString(projectId)) {
    errors.push('Expected projectId must be a non-empty string.');
  } else {
    if (document.projectId !== projectId) {
      errors.push(`Graph layout projectId must be ${projectId}.`);
    }
    if (graphIr.projectId !== projectId) {
      errors.push(`Graph IR projectId must be ${projectId}.`);
    }
  }

  if (!Array.isArray(graphIr.graphs)) {
    errors.push('Graph IR graphs must be an array.');
    return errors;
  }
  if (!Array.isArray(document.diagrams)) {
    errors.push('Graph layout diagrams must be an array.');
    return errors;
  }

  const graphsById = new Map();
  for (const [graphIndex, graph] of graphIr.graphs.entries()) {
    const graphPath = `graphIr.graphs[${graphIndex}]`;
    if (!isRecord(graph) || !isNonEmptyString(graph.id)) {
      errors.push(`${graphPath}.id must be a non-empty string.`);
      continue;
    }
    if (graphsById.has(graph.id)) {
      errors.push(`Duplicate Graph IR graph ID: ${graph.id}.`);
      continue;
    }
    graphsById.set(graph.id, graph);
  }

  const diagramIds = new Set();
  const childIds = new Set();
  const layoutEdgeIds = new Set();

  for (const [diagramIndex, diagram] of document.diagrams.entries()) {
    const diagramPath = `diagrams[${diagramIndex}]`;
    if (!isRecord(diagram)) {
      errors.push(`${diagramPath} must be an object.`);
      continue;
    }

    const graphId = diagram.graphId;
    if (!isNonEmptyString(graphId)) {
      errors.push(`${diagramPath}.graphId must be a non-empty string.`);
      continue;
    }
    if (diagramIds.has(graphId)) {
      errors.push(`Duplicate diagram ID: ${graphId}.`);
      continue;
    }
    diagramIds.add(graphId);

    const graph = graphsById.get(graphId);
    if (!graph) {
      errors.push(`${diagramPath}.graphId references unknown Graph IR graph ${graphId}.`);
    }

    const layout = diagram.layout;
    if (!isRecord(layout)) {
      errors.push(`${diagramPath}.layout must be an object.`);
      continue;
    }
    if (layout.id !== graphId) {
      errors.push(`${diagramPath}.layout.id must equal graphId ${graphId}.`);
    }
    validateBox({box: layout, path: `${diagramPath}.layout`, errors});

    if (!Array.isArray(layout.children)) {
      errors.push(`${diagramPath}.layout.children must be an array.`);
    }
    if (!Array.isArray(layout.edges)) {
      errors.push(`${diagramPath}.layout.edges must be an array.`);
    }

    const actualNodeIds = new Set();
    for (const [childIndex, child] of (Array.isArray(layout.children) ? layout.children : []).entries()) {
      const childPath = `${diagramPath}.layout.children[${childIndex}]`;
      if (!isRecord(child)) {
        errors.push(`${childPath} must be an object.`);
        continue;
      }
      if (recordUniqueId({id: child.id, seen: childIds, path: childPath, kind: 'layout child', errors})) {
        actualNodeIds.add(child.id);
      }
      validateBox({box: child, path: childPath, errors});
    }

    const actualEdgeIds = new Set();
    const layoutEdgesById = new Map();
    for (const [edgeIndex, edge] of (Array.isArray(layout.edges) ? layout.edges : []).entries()) {
      const edgePath = `${diagramPath}.layout.edges[${edgeIndex}]`;
      if (!isRecord(edge)) {
        errors.push(`${edgePath} must be an object.`);
        continue;
      }
      if (recordUniqueId({id: edge.id, seen: layoutEdgeIds, path: edgePath, kind: 'layout edge', errors})) {
        actualEdgeIds.add(edge.id);
        layoutEdgesById.set(edge.id, {edge, edgePath});
      }

      if (edge.sections !== undefined) {
        if (!Array.isArray(edge.sections)) {
          errors.push(`${edgePath}.sections must be an array when present.`);
        } else {
          for (const [sectionIndex, section] of edge.sections.entries()) {
            const sectionPath = `${edgePath}.sections[${sectionIndex}]`;
            if (!isRecord(section)) {
              errors.push(`${sectionPath} must be an object.`);
              continue;
            }
            validatePoint({point: section.startPoint, path: `${sectionPath}.startPoint`, errors});
            validatePoint({point: section.endPoint, path: `${sectionPath}.endPoint`, errors});
            if (section.bendPoints !== undefined) {
              if (!Array.isArray(section.bendPoints)) {
                errors.push(`${sectionPath}.bendPoints must be an array when present.`);
              } else {
                for (const [pointIndex, point] of section.bendPoints.entries()) {
                  validatePoint({point, path: `${sectionPath}.bendPoints[${pointIndex}]`, errors});
                }
              }
            }
          }
        }
      }
    }

    if (!graph) continue;

    const graphNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const graphEdges = Array.isArray(graph.edges) ? graph.edges : [];
    if (!Array.isArray(graph.nodes)) errors.push(`Graph IR graph ${graphId}.nodes must be an array.`);
    if (!Array.isArray(graph.edges)) errors.push(`Graph IR graph ${graphId}.edges must be an array.`);

    const expectedNodeIds = new Set();
    for (const [nodeIndex, node] of graphNodes.entries()) {
      if (!isRecord(node) || !isNonEmptyString(node.id)) {
        errors.push(`Graph IR graph ${graphId}.nodes[${nodeIndex}].id must be a non-empty string.`);
      } else if (expectedNodeIds.has(node.id)) {
        errors.push(`Duplicate Graph IR node ID in ${graphId}: ${node.id}.`);
      } else {
        expectedNodeIds.add(node.id);
      }
    }

    const expectedEdgeIds = new Set();
    for (const [edgeIndex, edge] of graphEdges.entries()) {
      if (!isRecord(edge) || !isNonEmptyString(edge.id)) {
        errors.push(`Graph IR graph ${graphId}.edges[${edgeIndex}].id must be a non-empty string.`);
        continue;
      }
      if (expectedEdgeIds.has(edge.id)) {
        errors.push(`Duplicate Graph IR edge ID in ${graphId}: ${edge.id}.`);
        continue;
      }
      expectedEdgeIds.add(edge.id);

      const layoutEntry = layoutEdgesById.get(edge.id);
      if (!layoutEntry) continue;
      if (!sameSingleEndpoint(layoutEntry.edge.sources, edge.from)) {
        errors.push(`${layoutEntry.edgePath}.sources must exactly equal [${JSON.stringify(edge.from)}].`);
      }
      if (!sameSingleEndpoint(layoutEntry.edge.targets, edge.to)) {
        errors.push(`${layoutEntry.edgePath}.targets must exactly equal [${JSON.stringify(edge.to)}].`);
      }
    }

    compareIds({actualIds: actualNodeIds, expectedIds: expectedNodeIds, graphId, kind: 'node', errors});
    compareIds({actualIds: actualEdgeIds, expectedIds: expectedEdgeIds, graphId, kind: 'edge', errors});
  }

  return errors;
};

export const assertGraphLayout = (input) => {
  const errors = validateGraphLayout(input);
  if (errors.length > 0) {
    throw new Error(`Invalid graph layout:\n- ${errors.join('\n- ')}`);
  }
  return input.document;
};

