#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {materializePlanningBundle} from '../workflow-console/lib/deterministic-planning.mjs';
import {rebasePlanningBundleToAlignment} from '../workflow-console/lib/planning-compat.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parseArgs = (values) => {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
};
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const inside = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);

const args = parseArgs(process.argv.slice(2));
const projectId = args.project;
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId) || !args.source) {
  throw new Error('Usage: node scripts/rebase-planning-timings.mjs --project <id> --source <planning-bundle.json>');
}
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const sourcePath = path.resolve(workspaceRoot, String(args.source));
if (!inside(workspaceRoot, sourcePath)) throw new Error('Planning source must stay inside the workspace.');
const [source, alignment] = await Promise.all([
  fs.readFile(sourcePath, 'utf8').then(JSON.parse),
  fs.readFile(path.join(formalRoot, 'audio', 'alignment.json'), 'utf8').then(JSON.parse),
]);
const rebased = rebasePlanningBundleToAlignment({
  bundle: source,
  alignment,
  workbenchRevision: Math.max(1, Number(source.workbenchRevision ?? 0) + 1),
  sourceReceipt: {
    role: 'previous-approved-planning-bundle',
    path: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
    sha256: await sha256File(sourcePath),
    schemaVersion: source.schemaVersion,
  },
});
const materialized = await materializePlanningBundle({formalRoot, workspaceRoot, projectId, bundle: rebased});
console.log(JSON.stringify({
  ok: true,
  projectId,
  source: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
  sourcePlanningDigestSha256: source.planningDigestSha256,
  planningDigestSha256: rebased.planningDigestSha256,
  sceneCount: materialized.sceneCount,
  cueCount: materialized.cueCount,
  timeline: materialized.productionManifest.timeline,
}, null, 2));
