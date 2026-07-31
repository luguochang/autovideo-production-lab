#!/usr/bin/env node

import path from 'node:path';
import {generateDeterministicPlanningFiles} from '../workflow-console/lib/deterministic-planning.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..');

const parseArgs = (values) => {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const projectId = args.project;
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/generate-deterministic-planning.mjs --project <id> [--replace] [--reason <message>]');
}

const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const documents = await generateDeterministicPlanningFiles({
  formalRoot,
  workspaceRoot,
  projectId,
  replace: args.replace === true,
  fallbackReason: args.reason ? String(args.reason).slice(0, 500) : undefined,
});

console.log(JSON.stringify({
  ok: true,
  projectId,
  mode: documents.storyboard.provenance.mode,
  sceneCount: documents.storyboard.scenes.length,
  cueCount: documents.shotManifest.shots.length,
  graphCount: documents.graphIr.graphs.length,
  durationSeconds: documents.productionManifest.timeline.duration,
  files: Object.values(documents.receipt.outputs).map((item) => item.path),
}, null, 2));
