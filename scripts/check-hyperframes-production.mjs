import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const run = promisify(execFile);
const compositionExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.woff', '.woff2', '.ttf', '.otf', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.webm',
]);
const ignoredDirectories = new Set([
  'node_modules', '.git', 'dist', 'renders', 'qa', 'snapshots', '.thumbnails', '.waveform-cache',
]);
const ignoredFiles = new Set(['meta.json', 'data/composition-build.json']);

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

const sha256File = async (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

const hashDirectoryManifest = async (directory) => {
  const files = [];
  const walk = async (current) => {
    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(target);
      } else if (entry.isFile() && compositionExtensions.has(path.extname(entry.name).toLowerCase())) {
        const relativePath = path.relative(directory, target).replaceAll('\\', '/');
        if (ignoredFiles.has(relativePath)) continue;
        const stats = await fs.stat(target);
        files.push({path: relativePath, bytes: stats.size, sha256: await sha256File(target)});
      }
    }
  };
  await walk(directory);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return {digest, files};
};

const parseCliJson = (output, label) => {
  const trimmed = output.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some CLI versions write progress before the final JSON object.
  }
  for (let start = 0; start < output.length; start += 1) {
    if (!['{', '['].includes(output[start])) continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < output.length; index += 1) {
      const char = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack.pop() !== expected) break;
        if (!stack.length) {
          try {
            return JSON.parse(output.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error(`${label} did not return a readable JSON payload.`);
};

const assertBuildOutputsCurrent = async (composition, build) => {
  const mismatches = [];
  for (const output of build.outputs ?? []) {
    const actual = await sha256File(path.join(composition, output.path)).catch(() => null);
    if (actual !== output.sha256) mismatches.push(output.path);
  }
  if (mismatches.length) {
    throw new Error(`Compiled output hashes changed after the deterministic build: ${mismatches.join(', ')}`);
  }
};

const args = parseArgs(process.argv.slice(2));
const projectId = args.project;
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/check-hyperframes-production.mjs --project <id>');
}

const projectDir = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
const composition = path.join(projectDir, 'production', 'hyperframes');
const packageSource = await fs.readFile(path.join(composition, 'package.json'), 'utf8');
const pinnedVersions = [...packageSource.matchAll(/hyperframes@(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
const uniqueVersions = [...new Set(pinnedVersions)];
if (uniqueVersions.length !== 1) throw new Error('Composition package.json must pin exactly one HyperFrames version.');
const hyperframesVersion = uniqueVersions[0];

const buildPath = path.join(composition, 'data', 'composition-build.json');
const build = JSON.parse(await fs.readFile(buildPath, 'utf8'));
await assertBuildOutputsCurrent(composition, build);

const indexSource = await fs.readFile(path.join(composition, 'index.html'), 'utf8');
const audioTag = indexSource.match(/<audio\b[^>]*\bid=["']narration-final["'][^>]*>/i)?.[0] ?? '';
const sourceAudioContract = {
  passed: /\bdata-duration=["'][^"']+["']/i.test(audioTag) && !/\bdata-end=/i.test(audioTag),
  hasDataDuration: /\bdata-duration=["'][^"']+["']/i.test(audioTag),
  hasDataEnd: /\bdata-end=/i.test(audioTag),
};
if (!sourceAudioContract.passed) {
  throw new Error('Top-level narration audio must use data-duration and must not use data-end.');
}

const beforeCheck = await hashDirectoryManifest(composition);
const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx';
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', `npx.cmd --yes hyperframes@${hyperframesVersion} check . --strict --json`]
  : ['--yes', `hyperframes@${hyperframesVersion}`, 'check', '.', '--strict', '--json'];
const {stdout, stderr} = await run(command, commandArgs, {
  cwd: composition,
  timeout: 20 * 60 * 1000,
  maxBuffer: 50 * 1024 * 1024,
  windowsHide: true,
});
const report = parseCliJson(stdout, 'HyperFrames check');
if (report.ok !== true || report.strict !== true) throw new Error('HyperFrames strict check did not pass.');

const afterCheck = await hashDirectoryManifest(composition);
if (afterCheck.digest !== beforeCheck.digest || afterCheck.files.length !== beforeCheck.files.length) {
  throw new Error('HyperFrames check mutated render-relevant composition files. Recompile with stable data-hf-id values.');
}
await assertBuildOutputsCurrent(composition, build);

const receipt = {
  ...report,
  autoVideo: {
    hyperframesVersion,
    checkedAt: new Date().toISOString(),
    scope: 'composition structure, runtime, layout, motion and contrast; final MP4 media QA runs after render',
    compositionDigest: afterCheck.digest,
    compositionFileCount: afterCheck.files.length,
    buildReceiptSha256: await sha256File(buildPath),
    sourceAudioContract,
    cliDiagnostics: stderr.trim() ? stderr.trim().split(/\r?\n/) : [],
  },
};
const qaDir = path.join(projectDir, 'qa');
await fs.mkdir(qaDir, {recursive: true});
const receiptPath = path.join(qaDir, 'hyperframes-check.json');
await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  projectId,
  hyperframesVersion,
  compositionDigest: afterCheck.digest,
  compositionFileCount: afterCheck.files.length,
  buildReceiptSha256: receipt.autoVideo.buildReceiptSha256,
  receiptPath,
}, null, 2));
