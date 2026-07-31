import path from 'node:path';

import {runScreenOcr} from '../tools/ocr/screen-ocr.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const parseArgs = (values) => {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
const projectId = args.project;
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(projectId)) {
  throw new Error('Usage: node scripts/run-screen-ocr.mjs --project <id> [--min-confidence 0.55]');
}

const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const result = await runScreenOcr({
  formalRoot,
  projectId,
  minConfidence: args['min-confidence'] === undefined ? 0.55 : Number(args['min-confidence']),
});

console.log(JSON.stringify({
  ok: result.report.status === 'passed',
  projectId,
  status: result.report.status,
  engine: result.report.engine,
  frameCount: result.report.frames.length,
  unresolvedCount: result.report.unresolvedCount,
  reportPath: result.reportPath,
  reportSha256: result.sha256,
}, null, 2));

if (result.report.status !== 'passed') process.exitCode = 2;
