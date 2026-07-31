import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const experimentDir = path.resolve(here, '..');
const renderDir = path.join(experimentDir, 'renders');
const finalDir = path.join(renderDir, 'final');
const names = ['A-system-map', 'B-whiteboard-mindmap', 'C-diagnostic-console'];

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)));
});

await fs.mkdir(finalDir, {recursive: true});
for (const name of names) {
  const input = path.join(renderDir, `${name}.mp4`);
  const output = path.join(finalDir, `${name}.mp4`);
  const temporary = path.join(finalDir, `${name}.tmp.mp4`);
  await fs.rm(temporary, {force: true});
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest',
    '-movflags', '+faststart', temporary,
  ]);
  await fs.rm(output, {force: true});
  await fs.rename(temporary, output);
  console.log(`Normalized ${name}`);
}
