import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildPronunciationGuide } from '../tools/voice-lab/pronunciation-contract.mjs';

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

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.input || !args.output) {
  console.error('Usage: node scripts/generate-pronunciation-preview.mjs --project <id> --input <draft.txt> --output <preview.json>');
  process.exit(1);
}

const narration = (await readFile(args.input, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const narrationSha256 = createHash('sha256').update(narration, 'utf8').digest('hex');
const guide = buildPronunciationGuide({
  projectId: args.project,
  narrationSha256,
  narration,
});

guide.policy = 'Preview only: generated from an unapproved editorial draft. Regenerate input/pronunciation.json from the final NarrationLock before TTS. Letter acronyms may use explicit spelling; every other Latin token still requires a hash-bound in-context listening probe.';

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${JSON.stringify(guide, null, 2)}\n`, 'utf8');

const byKind = Object.fromEntries(
  [...new Set(guide.entries.map((entry) => entry.kind))]
    .sort()
    .map((kind) => [kind, guide.entries.filter((entry) => entry.kind === kind).length]),
);
const occurrenceCount = guide.entries.reduce((sum, entry) => sum + entry.occurrences.length, 0);
const unresolved = guide.entries.filter((entry) => entry.status !== 'approved-default');

console.log(JSON.stringify({
  output: path.resolve(args.output),
  narrationSha256,
  uniqueTokens: guide.entries.length,
  occurrences: occurrenceCount,
  byKind,
  approvedDefaults: guide.entries.length - unresolved.length,
  needsListeningReview: unresolved.length,
}, null, 2));
