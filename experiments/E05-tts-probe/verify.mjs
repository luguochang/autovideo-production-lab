import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..', '..');
const outputDir = path.resolve(root, process.argv[2] ?? 'experiments/E05-tts-probe/output/xiaoxiao-105');
const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
const sourcePath = path.resolve(root, manifest.source);
const source = (await fs.readFile(sourcePath, 'utf8')).replace(/^\uFEFF/, '');
const sourceSha256 = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
const words = JSON.parse(await fs.readFile(path.join(outputDir, manifest.outputs.words), 'utf8'));
const sentences = JSON.parse(await fs.readFile(path.join(outputDir, manifest.outputs.sentences), 'utf8'));
const captions = JSON.parse(await fs.readFile(path.join(outputDir, manifest.outputs.captions), 'utf8'));
const srt = await fs.readFile(path.join(outputDir, manifest.outputs.srt), 'utf8');

const assertions = [];
const check = (name, condition, details) => {
  assertions.push({name, passed: Boolean(condition), details});
};

check('source SHA-256 unchanged', sourceSha256 === manifest.sourceSha256, {expected: manifest.sourceSha256, actual: sourceSha256});
check('word count matches manifest', words.length === manifest.wordBoundaryCount, {expected: manifest.wordBoundaryCount, actual: words.length});
check('sentence count matches manifest', sentences.length === manifest.sentenceBoundaryCount, {expected: manifest.sentenceBoundaryCount, actual: sentences.length});
check('SRT cue count matches captions', (srt.match(/--> /g) ?? []).length === captions.length, {expected: captions.length, actual: (srt.match(/--> /g) ?? []).length});
const subtitleTextLines = srt.split(/\r?\n/).filter((line) => line && !/^\d+$/u.test(line) && !/--> /u.test(line));
check('SRT has no punctuation-only lines', subtitleTextLines.every((line) => !/^[，。！？；：、,.!?;:]+$/u.test(line)));
check('SRT lines are at most 13 characters', subtitleTextLines.every((line) => line.length <= 13));

const validTimeline = (entries) => entries.every((item, index) => (
  Number.isFinite(item.start)
  && Number.isFinite(item.duration)
  && item.start >= 0
  && item.duration >= 0
  && item.end <= manifest.durationSeconds + 0.1
  && (index === 0 || item.start >= entries[index - 1].start)
));
const nonOverlapping = (entries) => entries.every((item, index) => index === 0 || item.start + 0.000001 >= entries[index - 1].end);
check('word timeline is ordered and in range', validTimeline(words));
check('sentence timeline is ordered and in range', validTimeline(sentences));
check('caption timeline is ordered and in range', validTimeline(captions));
check('sentence timeline has no overlaps', nonOverlapping(sentences));
check('caption timeline has no overlaps', nonOverlapping(captions));
check('captions are at most 24 characters', captions.every((item) => item.text.length <= 24));
check('captions do not begin with punctuation', captions.every((item) => !/^[，。！？；：、,.!?;:]/u.test(item.text)));

const normalizedSource = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join('').replace(/\s/gu, '');
const normalizedTranscript = sentences.map((item) => item.text).join('').replace(/\s/gu, '');
check('service transcript matches source', normalizedTranscript === normalizedSource);
check('caption transcript matches source', captions.map((item) => item.text).join('').replace(/\s/gu, '') === normalizedSource);

for (const relativePath of [manifest.outputs.webm, manifest.outputs.mp3]) {
  const audioPath = path.join(outputDir, relativePath);
  await fs.access(audioPath);
  await execFileAsync('ffmpeg', ['-v', 'error', '-i', audioPath, '-map', '0:a:0', '-f', 'null', '-'], {maxBuffer: 16 * 1024 * 1024});
  check(`${relativePath} decodes without FFmpeg errors`, true);
}

const report = {
  verifiedAt: new Date().toISOString(),
  outputDir,
  passed: assertions.every((item) => item.passed),
  assertions,
};
await fs.writeFile(path.join(outputDir, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
