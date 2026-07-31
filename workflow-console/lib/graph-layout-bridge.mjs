import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertGraphLayout} from '../../tools/planning-contract/graph-layout-contract.mjs';

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const writeAtomic = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, stableJson(value), 'utf8');
  await fs.rename(temporary, target);
};

const assertInside = (parent, target, label) => {
  const relative = path.relative(parent, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} leaves the AutoVideo workspace.`);
};

export const materializeGraphLayoutBinding = async ({workspaceRoot, formalRoot, artifactPath}) => {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedFormalRoot = path.resolve(formalRoot);
  const resolvedArtifact = path.resolve(artifactPath);
  assertInside(resolvedWorkspace, resolvedFormalRoot, 'Formal project');
  assertInside(resolvedWorkspace, resolvedArtifact, 'Graph layout artifact');

  const graphIrPath = path.join(resolvedFormalRoot, 'plan', 'graph-ir.json');
  const productionManifestPath = path.join(resolvedFormalRoot, 'plan', 'production-manifest.json');
  const [document, graphIr, productionManifest] = await Promise.all([
    fs.readFile(resolvedArtifact, 'utf8').then(JSON.parse),
    fs.readFile(graphIrPath, 'utf8').then(JSON.parse),
    fs.readFile(productionManifestPath, 'utf8').then(JSON.parse),
  ]);
  if (productionManifest.projectId !== document.projectId || graphIr.projectId !== document.projectId) {
    throw new Error('Graph layout projectId does not match the formal planning bundle.');
  }
  assertGraphLayout({document, graphIr, projectId: document.projectId});

  const formalLayoutPath = path.join(resolvedFormalRoot, 'plan', 'graph-layout.json');
  await writeAtomic(formalLayoutPath, document);
  const binding = {
    path: 'plan/graph-layout.json',
    sha256: await sha256File(formalLayoutPath),
    schemaVersion: document.schemaVersion,
    schemaPath: 'tools/planning-contract/schemas/graph-layout.schema.json'
  };
  productionManifest.bindings.graphLayout = binding;
  productionManifest.provenance = {
    ...(productionManifest.provenance ?? {}),
    graphLayout: {
      mode: 'workbench-approved-layout',
      sourceArtifactPath: path.relative(resolvedWorkspace, resolvedArtifact).replaceAll('\\', '/'),
      sourceArtifactSha256: await sha256File(resolvedArtifact)
    }
  };
  await writeAtomic(productionManifestPath, productionManifest);
  return {
    binding,
    formalLayoutPath,
    productionManifestPath,
    productionManifestSha256: await sha256File(productionManifestPath)
  };
};
