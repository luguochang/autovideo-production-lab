#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  approveRouteGold,
  attestRealProject,
  metricKeys,
  recordRecoveryEvidence,
  registerPublicReleaseCandidate,
  scaleEvidenceStatus,
} from '../workflow-console/lib/scale-evidence.mjs';
import {
  buildScaleMetricsDraft,
  mergeRecoveryMetrics,
  writeInternalScaleSimulation,
} from '../workflow-console/lib/scale-metrics-draft.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kebab = (value) => value.replace(/[A-Z]/gu, (match) => `-${match.toLowerCase()}`);
const parseArgs = (argv) => {
  const command = argv[0];
  const args = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'confirm-human') args[key] = true;
    else {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}.`);
      args[key] = next;
    }
  }
  return {command, args};
};
const required = (args, key) => {
  const value = String(args[key] ?? '').trim();
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
};
const human = (args) => ({reviewer: required(args, 'reviewer'), confirmedHuman: args['confirm-human'] === true});

const usage = `Usage:
  npm.cmd run video:scale-evidence -- status [--project <id>]
  npm.cmd run video:scale-evidence -- draft --project <id>
  npm.cmd run video:scale-evidence -- simulate --project <id>
  npm.cmd run video:scale-evidence -- real --project <id> --reviewer <name> --duration <30s|60s|90s> --carriers <csv> [--input <project-relative>] --confirm-human
  npm.cmd run video:scale-evidence -- gold --project <id> --reviewer <name> --quality-review <project-relative> --confirm-human
  npm.cmd run video:scale-evidence -- recovery --project <id> --reviewer <name> --confirm-human [metric overrides]
  npm.cmd run video:scale-evidence -- public-candidate --project <id> --reviewer <name> --master <project-relative> --confirm-human

draft derives trustworthy local metrics without writing. simulate writes a separate
internal-only receipt that never counts as human evidence. recovery reuses derived
values and reports only the still-unknown metric flags (${metricKeys.map((key) => `--${kebab(key)}`).join(', ')}).
--confirm-human is a real attestation and must never be supplied by an agent,
fixture, simulation, or batch job.`;

try {
  const {command, args} = parseArgs(process.argv.slice(2));
  let result;
  if (command === 'status') {
    result = await scaleEvidenceStatus({workspaceRoot, projectId: args.project ?? null});
  } else if (command === 'draft') {
    result = await buildScaleMetricsDraft({workspaceRoot, projectId: required(args, 'project')});
  } else if (command === 'simulate') {
    result = await writeInternalScaleSimulation({workspaceRoot, projectId: required(args, 'project')});
  } else if (command === 'real') {
    result = await attestRealProject({
      workspaceRoot,
      projectId: required(args, 'project'),
      ...human(args),
      durationClass: required(args, 'duration'),
      carriers: required(args, 'carriers').split(','),
      inputPath: args.input ?? null,
    });
  } else if (command === 'gold') {
    result = await approveRouteGold({
      workspaceRoot,
      projectId: required(args, 'project'),
      ...human(args),
      qualityReviewPath: required(args, 'quality-review'),
    });
  } else if (command === 'recovery') {
    const projectId = required(args, 'project');
    const draft = await buildScaleMetricsDraft({workspaceRoot, projectId});
    const merged = mergeRecoveryMetrics({
      draft,
      provided: Object.fromEntries(metricKeys.map((key) => [key, args[kebab(key)]])),
    });
    if (merged.missing.length) {
      throw new Error(`Recovery still needs trustworthy values for: ${merged.missing.map(kebab).join(', ')}. The draft left them unknown instead of assuming zero.`);
    }
    result = await recordRecoveryEvidence({
      workspaceRoot,
      projectId,
      ...human(args),
      metrics: merged.metrics,
      metricSources: merged.sources,
    });
  } else if (command === 'public-candidate') {
    result = await registerPublicReleaseCandidate({
      workspaceRoot,
      projectId: required(args, 'project'),
      ...human(args),
      masterPath: required(args, 'master'),
    });
  } else {
    throw new Error(usage);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
