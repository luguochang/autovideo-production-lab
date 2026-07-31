import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';

const here = path.dirname(fileURLToPath(import.meta.url));
const experimentDir = path.resolve(here, '..');
const rootDir = path.resolve(experimentDir, '..', '..');
const sourcePath = path.join(rootDir, 'demo', 'demoText.txt');
const outputDir = path.join(experimentDir, 'shared');
const voice = process.env.TTS_VOICE || 'zh-CN-YunxiNeural';
const rate = Number(process.env.TTS_RATE || 1.08);

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0
    ? resolve({stdout: stdout.trim(), stderr: stderr.trim()})
    : reject(new Error(`${command} exited ${code}: ${stderr}`)));
});

const toSeconds = (ticks) => Number(ticks ?? 0) / 10_000_000;
const normalizeNewlines = (value) => value.replace(/\r\n/g, '\n').trim();
const splitCaption = (sentence, maxChars = 19) => {
  const chars = Array.from(sentence.text.trim());
  if (!chars.length) return [];
  const chunks = [];
  let offset = 0;
  while (offset < chars.length) {
    let end = Math.min(chars.length, offset + maxChars);
    if (end < chars.length) {
      for (let cursor = end; cursor > offset + 9; cursor -= 1) {
        if (/[，。！？：；、]/.test(chars[cursor - 1])) {
          end = cursor;
          break;
        }
      }
    }
    const startRatio = offset / chars.length;
    const endRatio = end / chars.length;
    chunks.push({
      text: chars.slice(offset, end).join(''),
      start: sentence.start + sentence.duration * startRatio,
      end: sentence.start + sentence.duration * endRatio,
    });
    offset = end;
  }
  return chunks;
};

await fs.mkdir(outputDir, {recursive: true});
const narration = normalizeNewlines(await fs.readFile(sourcePath, 'utf8'));
const paragraphs = narration.split(/\n+/).map((line) => line.trim()).filter(Boolean);
if (paragraphs.length !== 14) {
  throw new Error(`Expected 14 narration paragraphs, received ${paragraphs.length}`);
}

let result;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {
      wordBoundaryEnabled: true,
      sentenceBoundaryEnabled: true,
    });
    result = await tts.toFile(outputDir, narration, {rate});
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  } finally {
    tts.close();
  }
}

const metadata = JSON.parse(await fs.readFile(result.metadataFilePath, 'utf8'));
const entries = metadata.Metadata ?? [];
const boundary = (item) => ({
  text: item.Data.text.Text,
  start: toSeconds(item.Data.Offset),
  duration: toSeconds(item.Data.Duration),
});
const words = entries.filter((item) => item.Type === 'WordBoundary').map(boundary);
const sentences = entries.filter((item) => item.Type === 'SentenceBoundary').map(boundary);
const expectedSentenceCounts = paragraphs.map((paragraph) => Math.max(1, (paragraph.match(/[。！？!?]/g) ?? []).length));
const expectedSentenceTotal = expectedSentenceCounts.reduce((sum, count) => sum + count, 0);
if (sentences.length !== expectedSentenceTotal) {
  throw new Error(`Sentence boundary mismatch: source=${expectedSentenceTotal}, edge=${sentences.length}`);
}

let sentenceCursor = 0;
const chapters = paragraphs.map((text, index) => {
  const chapterSentences = sentences.slice(sentenceCursor, sentenceCursor + expectedSentenceCounts[index]);
  sentenceCursor += expectedSentenceCounts[index];
  const start = chapterSentences[0].start;
  const last = chapterSentences.at(-1);
  return {
    index: index + 1,
    text,
    start,
    end: last.start + last.duration,
    duration: last.start + last.duration - start,
    sentenceStart: sentenceCursor - chapterSentences.length,
    sentenceEnd: sentenceCursor,
  };
});

const metadataEnd = entries.reduce((max, item) => Math.max(
  max,
  toSeconds(Number(item.Data?.Offset ?? 0) + Number(item.Data?.Duration ?? 0)),
), 0);
const audioWebm = result.audioFilePath || path.join(outputDir, 'audio.webm');
const audioWav = path.join(outputDir, 'narration.wav');
await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', audioWebm, '-ar', '48000', '-ac', '2', audioWav]);
const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioWav]);
const probedDuration = Number(probe.stdout);
const duration = Number.isFinite(probedDuration) ? probedDuration : metadataEnd + 0.5;
const captions = sentences.flatMap((sentence) => splitCaption(sentence));

const output = {
  schemaVersion: 'autovideo-narration/v1',
  source: path.relative(rootDir, sourcePath).replaceAll('\\', '/'),
  sourceSha256: crypto.createHash('sha256').update(narration).digest('hex'),
  voice,
  rate,
  duration,
  metadataEnd,
  text: narration,
  paragraphs,
  chapters,
  words,
  sentences,
  captions,
};
await fs.writeFile(path.join(outputDir, 'narration.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  voice,
  rate,
  duration: Number(duration.toFixed(3)),
  words: words.length,
  sentences: sentences.length,
  captions: captions.length,
  chapters: chapters.length,
  sourceSha256: output.sourceSha256,
}));
