#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  authorizeRecipeUse,
  commitLifecycleTransition,
  evaluateLifecycleTransition,
  loadLifecycleContext,
  readJson,
  resolveInside,
  sha256File,
  stableJson,
  validateLifecycleLedger,
} from '../tools/motion-recipe-lifecycle/lifecycle.mjs';
import {buildMotionLifecycleReadiness, writeMotionLifecycleReadiness} from '../tools/motion-recipe-lifecycle/readiness.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = {
  library: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledger: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
  officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
  officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
};

const usage = () => `Usage:
  node scripts/motion-recipe-lifecycle.mjs validate
  node scripts/motion-recipe-lifecycle.mjs status [--recipe <id>] [--json]
  node scripts/motion-recipe-lifecycle.mjs readiness [--out <path>] [--templates-dir <path>] [--json]
  node scripts/motion-recipe-lifecycle.mjs assess --recipe <id> --to <state> --evidence <path> [--receipt-out <path>]
  node scripts/motion-recipe-lifecycle.mjs apply --recipe <id> --to <state> --evidence <path> --receipt-out <path> [--actor <name>]
  node scripts/motion-recipe-lifecycle.mjs authorize --recipe <id> --scope <probe|project|template|replay> [--project <id>] [--locked-definition <sha256>]

No force flag exists. approved-project, promoted-template, and retired require pre-existing human approval evidence.`;

const parseArgs = (argv) => {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'json') options.json = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
      options[key] = value;
    }
  }
  return {command, options};
};

const writeAtomic = async (relativePath, value) => {
  const target = resolveInside(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}-${process.pid}.tmp`);
  await fs.writeFile(temporary, stableJson(value), 'utf8');
  await fs.rename(temporary, target);
  return target;
};

const context = async (options) => loadLifecycleContext({
  workspaceRoot,
  libraryPath: options.library ?? defaults.library,
  ledgerPath: options.ledger ?? defaults.ledger,
  catalogPaths: {
    officialRegistry: options['official-registry'] ?? defaults.officialRegistry,
    officialBlueprints: options['official-blueprints'] ?? defaults.officialBlueprints,
    officialMotionRules: options['official-motion-rules'] ?? defaults.officialMotionRules,
  },
});

const main = async () => {
  const {command, options} = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || options.help) {
    console.log(usage());
    return;
  }
  const loaded = await context(options);
  const issues = await validateLifecycleLedger({workspaceRoot, ...loaded});
  if (command === 'validate') {
    console.log(JSON.stringify({ok: issues.length === 0, issues}, null, 2));
    if (issues.length) process.exitCode = 1;
    return;
  }
  if (issues.length) throw new Error(`Lifecycle ledger validation failed: ${JSON.stringify(issues)}`);

  if (command === 'status') {
    const entries = options.recipe
      ? loaded.ledger.entries.filter((entry) => entry.recipeId === options.recipe)
      : loaded.ledger.entries;
    if (options.recipe && entries.length === 0) throw new Error(`Unknown recipe: ${options.recipe}`);
    const payload = {library: loaded.ledger.library, entries};
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else {
      for (const entry of entries) {
        console.log(`${entry.recipeId}@${entry.recipeVersion}\t${entry.state}\trevision=${entry.revision}\tprojects=${entry.projectApprovals.length}`);
      }
    }
    return;
  }

  if (command === 'readiness') {
    const report = await buildMotionLifecycleReadiness({workspaceRoot, library: loaded.library, ledger: loaded.ledger});
    const written = await writeMotionLifecycleReadiness({
      workspaceRoot,
      report,
      outputPath: options.out ?? null,
      templatesDir: options['templates-dir'] ?? null,
      ledger: loaded.ledger,
    });
    const payload = {...report, written};
    if (options.json || (!options.out && !options['templates-dir'])) console.log(JSON.stringify(payload, null, 2));
    else console.log(JSON.stringify({ok: true, summary: report.summary, written}, null, 2));
    return;
  }

  if (command === 'authorize') {
    if (!options.recipe || !options.scope) throw new Error('authorize requires --recipe and --scope.');
    const result = authorizeRecipeUse({
      ledger: loaded.ledger,
      recipeId: options.recipe,
      scope: options.scope,
      projectId: options.project ?? null,
      lockedDefinitionSha256: options['locked-definition'] ?? null,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.allowed) process.exitCode = 2;
    return;
  }

  if (!['assess', 'apply'].includes(command)) throw new Error(`Unknown command: ${command}\n${usage()}`);
  if (!options.recipe || !options.to || !options.evidence) {
    throw new Error(`${command} requires --recipe, --to, and --evidence.`);
  }
  if (command === 'apply' && !options['receipt-out']) throw new Error('apply requires --receipt-out.');
  const evidence = await readJson(resolveInside(workspaceRoot, options.evidence));
  const evaluation = await evaluateLifecycleTransition({
    workspaceRoot,
    ...loaded,
    recipeId: options.recipe,
    targetState: options.to,
    evidence,
    actor: options.actor ?? 'autovideo-lifecycle-cli',
  });
  let receiptRef = null;
  if (options['receipt-out']) {
    const receiptPath = await writeAtomic(options['receipt-out'], evaluation.receipt);
    receiptRef = {path: options['receipt-out'].replaceAll('\\', '/'), sha256: await sha256File(receiptPath)};
  }
  if (command === 'apply' && evaluation.allowed) {
    const next = commitLifecycleTransition({ledger: loaded.ledger, evaluation, receiptRef});
    await writeAtomic(options.ledger ?? defaults.ledger, next);
  }
  console.log(JSON.stringify({allowed: evaluation.allowed, state: evaluation.receipt.effectiveState, blockedReasons: evaluation.receipt.blockedReasons, receiptRef}, null, 2));
  if (!evaluation.allowed) process.exitCode = 2;
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
