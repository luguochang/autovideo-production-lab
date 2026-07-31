import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const project = path.resolve(value('--project', '.'));
const port = String(value('--port', '3303'));
const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', `npx.cmd --yes http-server ${project} -p ${port} -c-1`]
  : ['--yes', 'http-server', project, '-p', port, '-c-1'];
const child = spawn(command, commandArgs, {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
await fs.writeFile(path.join(project, 'review-server.json'), `${JSON.stringify({port: Number(port), pid: child.pid, url: `http://127.0.0.1:${port}/review/`}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({project, port: Number(port), pid: child.pid, url: `http://127.0.0.1:${port}/review/`}, null, 2));
