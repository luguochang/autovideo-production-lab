#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  DEFAULT_MATURITY_THRESHOLDS,
  writeMaturityReport,
} from '../workflow-console/lib/maturity-audit.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parseArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    if (['json', 'require-mature'].includes(key)) options[key] = true;
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}.`);
      options[key] = next;
      index += 1;
    }
  }
  return options;
};

const integer = (value, fallback, label) => {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
};

const usage = `Usage:
  node scripts/audit-autovideo-maturity.mjs [--out <path>] [--json] [--require-mature]
    [--real-projects <count>] [--content-gold <count>] [--motion-recipes <count>]

The default command writes reports/AUTOVIDEO_MATURITY.json. It reports blocked
gates without failing the command. Use --require-mature in a release job when a
blocked maturity gate must return exit code 2.`;

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
  } else {
    const thresholds = {
      ...DEFAULT_MATURITY_THRESHOLDS,
      recoverableRealProjects: integer(args['real-projects'], DEFAULT_MATURITY_THRESHOLDS.recoverableRealProjects, '--real-projects'),
      humanReviewedContentGoldCases: integer(args['content-gold'], DEFAULT_MATURITY_THRESHOLDS.humanReviewedContentGoldCases, '--content-gold'),
      motionRecipesWithHumanLifecycle: integer(args['motion-recipes'], DEFAULT_MATURITY_THRESHOLDS.motionRecipesWithHumanLifecycle, '--motion-recipes'),
    };
    const result = await writeMaturityReport({
      workspaceRoot,
      outputPath: args.out ?? 'reports/AUTOVIDEO_MATURITY.json',
      thresholds,
    });
    const summary = {
      ok: true,
      mature: result.report.mature,
      status: result.report.status,
      path: result.path,
      sha256: result.sha256,
      passedGates: result.report.gates.filter((item) => item.passed).length,
      totalGates: result.report.gates.length,
      blockers: result.report.blockers.length,
      counts: result.report.summary,
    };
    console.log(JSON.stringify(args.json ? result.report : summary, null, 2));
    if (args['require-mature'] && !result.report.mature) process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
