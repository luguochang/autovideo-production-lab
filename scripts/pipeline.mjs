import {spawnSync} from 'node:child_process';
import {loadEnv} from './env.mjs';

loadEnv();
const source = process.argv[2];
if (!source) throw new Error('用法: npm run pipeline -- <资料.md>');

const run = (command, args) => {
  const result = spawnSync(command, args, {stdio: 'inherit', env: process.env, shell: process.platform === 'win32'});
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('node', ['scripts/generate-storyboard.mjs', source]);
run('node', ['scripts/generate-tts.mjs']);
run('npm.cmd', ['run', 'render']);
