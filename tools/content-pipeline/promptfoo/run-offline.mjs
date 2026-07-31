import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {workspaceRoot} from '../content-contract.mjs';

const promptfooRoot = path.join(workspaceRoot, 'tools', 'content-pipeline', 'promptfoo');
const resultsRoot = path.join(promptfooRoot, 'results');
const entrypoint = path.join(workspaceRoot, 'node_modules', 'promptfoo', 'dist', 'src', 'entrypoint.js');
await fs.access(entrypoint);
await fs.mkdir(path.join(resultsRoot, 'logs'), {recursive: true});

const stages = [
  'evidence-extractor',
  'outline-planner',
  'narration-writer',
  'oralizer',
  'duration-fitter',
  'claim-verifier',
];

const runStage = (stage) => new Promise((resolve, reject) => {
  const args = [entrypoint,
    'eval',
    '-c', path.join(promptfooRoot, `promptfoo.${stage}.yaml`),
    '--no-share', '--no-cache', '--no-write', '--no-progress-bar',
    '-j', '1',
    '-o', path.join(resultsRoot, `${stage}.json`),
    '-o', path.join(resultsRoot, `${stage}.junit.xml`),
  ];
  const child = spawn(process.execPath, args, {
    cwd: workspaceRoot,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      PROMPTFOO_FAILED_TEST_EXIT_CODE: '1',
      PROMPTFOO_PASS_RATE_THRESHOLD: '100',
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_CONFIG_DIR: path.join(resultsRoot, '.promptfoo'),
      PROMPTFOO_LOG_DIR: path.join(resultsRoot, 'logs'),
    },
  });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${stage} Promptfoo eval exited with ${code ?? 1}.`)));
});

for (const stage of stages) await runStage(stage);
console.log(JSON.stringify({passed: true, stages, modelCalls: 0, humanGoldCases: 0}, null, 2));
