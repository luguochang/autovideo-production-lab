#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  buildSemanticSfxReview,
  findCreatorDelegationReceipt,
  simulateSemanticSfxReview,
} from '../workflow-console/lib/semantic-sfx-review.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parseArgs = (argv) => {
  const command = argv[0];
  const args = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'project' || key === 'delegation' || key === 'reason') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
      args[key] = value;
    } else throw new Error(`Unknown argument: --${key}`);
  }
  return {command, args};
};

const usage = `Usage:
  npm.cmd run video:sfx-review -- status --project <formal-project-id>
  npm.cmd run video:sfx-review -- simulate --project <formal-project-id> [--delegation <project-relative-receipt>] [--reason <text>]

simulate approves only currently resolved local SFX cues for internal review.
It never creates a human approval and always keeps public release blocked.`;

try {
  const {command, args} = parseArgs(process.argv.slice(2));
  const projectId = String(args.project || '').trim();
  if (!projectId) throw new Error(usage);
  const projectRoot = path.resolve(workspaceRoot, projectId.startsWith('hyperframes-workflow-kit')
    ? projectId
    : path.join('hyperframes-workflow-kit', 'projects', projectId));
  let result;
  if (command === 'status') {
    result = await buildSemanticSfxReview({projectRoot, projectId: path.basename(projectRoot)});
  } else if (command === 'simulate') {
    const delegationReceipt = args.delegation || await findCreatorDelegationReceipt({projectRoot, projectId: path.basename(projectRoot)});
    result = await simulateSemanticSfxReview({
      projectRoot,
      projectId: path.basename(projectRoot),
      delegationReceipt,
      reason: args.reason || 'Creator delegated an internal sparse semantic SFX mix for silent file-based QA.',
    });
  } else throw new Error(usage);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
