import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertGraphLayout, validateGraphLayout} from '../graph-layout-contract.mjs';

const projectId = 'layout-contract-fixture';

const graphIr = {
  schemaVersion: 'autovideo-graph-ir/v1',
  projectId,
  graphs: [
    {
      id: 'graph-a',
      nodes: [{id: 'node-a'}, {id: 'node-b'}],
      edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b'}],
    },
    {
      id: 'graph-b',
      nodes: [{id: 'node-c'}],
      edges: [],
    },
  ],
};

const document = {
  schemaVersion: 'autovideo-graph-layout/v1',
  projectId,
  diagrams: [{
    graphId: 'graph-a',
    source: 'graph-ir',
    layout: {
      id: 'graph-a',
      x: 0,
      y: 0,
      width: 560,
      height: 120,
      $H: 13,
      layoutOptions: {'elk.algorithm': 'layered'},
      children: [
        {id: 'node-a', x: 12, y: 12, width: 200, height: 96, $H: 15},
        {id: 'node-b', x: 348, y: 12, width: 200, height: 96, $H: 17},
      ],
      edges: [{
        id: 'edge-a-b',
        sources: ['node-a'],
        targets: ['node-b'],
        container: 'graph-a',
        sections: [{
          id: 'edge-a-b_s0',
          startPoint: {x: 212, y: 60},
          bendPoints: [{x: 280, y: 60}],
          endPoint: {x: 348, y: 60},
        }],
      }],
    },
  }],
};

const clone = (value) => structuredClone(value);
const validate = (layout = document, ir = graphIr, expectedProjectId = projectId) => (
  validateGraphLayout({document: layout, graphIr: ir, projectId: expectedProjectId})
);

test('accepts a complete declared diagram, ELK extensions, and partial graph coverage', () => {
  assert.deepEqual(validate(), []);
  assert.equal(assertGraphLayout({document, graphIr, projectId}), document);
});

test('rejects schema and project identity drift', () => {
  const layout = clone(document);
  const ir = clone(graphIr);
  layout.schemaVersion = 'autovideo-graph-layout/v0';
  layout.projectId = 'another-project';
  ir.schemaVersion = 'autovideo-graph-ir/v0';
  ir.projectId = 'another-project';
  assert.deepEqual(validate(layout, ir), [
    'Graph layout schemaVersion must be autovideo-graph-layout/v1.',
    'Graph IR schemaVersion must be autovideo-graph-ir/v1.',
    `Graph layout projectId must be ${projectId}.`,
    `Graph IR projectId must be ${projectId}.`,
  ]);
});

test('rejects duplicate diagram, child, and edge IDs', () => {
  const layout = clone(document);
  layout.diagrams.push(clone(layout.diagrams[0]));
  layout.diagrams[0].layout.children.push(clone(layout.diagrams[0].layout.children[0]));
  layout.diagrams[0].layout.edges.push(clone(layout.diagrams[0].layout.edges[0]));
  const errors = validate(layout);
  assert.ok(errors.includes('Duplicate diagram ID: graph-a.'));
  assert.ok(errors.includes('Duplicate layout child ID: node-a.'));
  assert.ok(errors.includes('Duplicate layout edge ID: edge-a-b.'));
});

test('requires finite coordinates and positive dimensions', () => {
  const layout = clone(document);
  layout.diagrams[0].layout.width = 0;
  layout.diagrams[0].layout.children[0].x = Number.NaN;
  layout.diagrams[0].layout.children[1].height = -1;
  layout.diagrams[0].layout.edges[0].sections[0].endPoint.y = Number.POSITIVE_INFINITY;
  const errors = validate(layout);
  assert.ok(errors.includes('diagrams[0].layout.width must be a finite number greater than zero.'));
  assert.ok(errors.includes('diagrams[0].layout.children[0].x must be a finite number.'));
  assert.ok(errors.includes('diagrams[0].layout.children[1].height must be a finite number greater than zero.'));
  assert.ok(errors.includes('diagrams[0].layout.edges[0].sections[0].endPoint.y must be a finite number.'));
});

test('requires layout identity and exact Graph IR node and edge coverage', () => {
  const layout = clone(document);
  layout.diagrams[0].layout.id = 'wrong-graph';
  layout.diagrams[0].layout.children.pop();
  layout.diagrams[0].layout.children.push({id: 'unknown-node', x: 0, y: 0, width: 10, height: 10});
  layout.diagrams[0].layout.edges[0].id = 'unknown-edge';
  const errors = validate(layout);
  assert.ok(errors.includes('diagrams[0].layout.id must equal graphId graph-a.'));
  assert.ok(errors.includes('Diagram graph-a is missing Graph IR node node-b.'));
  assert.ok(errors.includes('Diagram graph-a contains unknown node unknown-node.'));
  assert.ok(errors.includes('Diagram graph-a is missing Graph IR edge edge-a-b.'));
  assert.ok(errors.includes('Diagram graph-a contains unknown edge unknown-edge.'));
});

test('requires exact Graph IR edge endpoints', () => {
  const layout = clone(document);
  layout.diagrams[0].layout.edges[0].sources = ['node-b'];
  layout.diagrams[0].layout.edges[0].targets = ['node-a', 'node-b'];
  const errors = validate(layout);
  assert.ok(errors.includes('diagrams[0].layout.edges[0].sources must exactly equal ["node-a"].'));
  assert.ok(errors.includes('diagrams[0].layout.edges[0].targets must exactly equal ["node-b"].'));
  assert.throws(
    () => assertGraphLayout({document: layout, graphIr, projectId}),
    /Invalid graph layout:[\s\S]*sources must exactly equal/,
  );
});

