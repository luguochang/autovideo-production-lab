import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output) {
  fail('Usage: node scripts/extract-narration-from-markdown.mjs --input <source.md> --output <narration.txt>');
}

const source = (await readFile(args.input, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const lines = source.split('\n');
const startIndex = lines.findIndex((line) => /^##\s+0\./.test(line.trim()));
const endIndex = lines.findIndex((line, index) => index > startIndex && line.includes('口播稿结束'));

if (startIndex < 0) fail('Could not find narration start heading: "## 0."');
if (endIndex < 0) fail('Could not find narration end marker: "口播稿结束"');

const narration = lines
  .slice(startIndex, endIndex)
  .filter((line) => !/^\s*#{1,6}\s+/.test(line))
  .filter((line) => !/^\s*-{3,}\s*$/.test(line))
  .map((line) => line.replace(/\*\*/g, '').replace(/`/g, '').trimEnd())
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${narration}\n`, 'utf8');

const hanCount = (narration.match(/[\u3400-\u9fff]/g) ?? []).length;
const sectionCount = lines.slice(startIndex, endIndex).filter((line) => /^##\s+\d+\./.test(line.trim())).length;

console.log(JSON.stringify({
  input: path.resolve(args.input),
  output: path.resolve(args.output),
  sectionCount,
  hanCount,
  estimatedMinutesAt288_6HanPerMinute: Number((hanCount / 288.6).toFixed(2)),
}, null, 2));
