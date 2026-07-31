import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';

import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..', '..');

const parseArgs = (argv) => {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    result[rawKey] = value;
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(root, args.input ?? 'demo/demoText.txt');
const outputDir = path.resolve(root, args.output ?? 'experiments/E05-tts-probe/output/xiaoxiao-105');
const voice = args.voice ?? 'zh-CN-XiaoxiaoNeural';
const rate = Number(args.rate ?? 1.05);
const retries = Number(args.retries ?? 3);

if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid --rate value: ${args.rate}`);
if (!Number.isInteger(retries) || retries < 1) throw new Error(`Invalid --retries value: ${args.retries}`);

const source = (await fs.readFile(inputPath, 'utf8')).replace(/^\uFEFF/, '');
const segments = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
if (segments.length === 0) throw new Error(`No narration found in ${inputPath}`);

const escapeXml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const ticksToSeconds = (ticks) => Number(ticks ?? 0) / 10_000_000;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getAudioDuration = async (audioPath) => {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate:frame=nb_samples',
    '-of', 'json',
    audioPath,
  ], {maxBuffer: 16 * 1024 * 1024});
  const probe = JSON.parse(stdout);
  const sampleRate = Number(probe.streams?.[0]?.sample_rate ?? 0);
  const samples = (probe.frames ?? []).reduce((sum, frame) => sum + Number(frame.nb_samples ?? 0), 0);
  const duration = samples / sampleRate;
  if (duration <= 0) throw new Error(`Could not determine audio duration: ${audioPath}`);
  return duration;
};

const synthesize = async (dir, narration) => {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {
        wordBoundaryEnabled: true,
        sentenceBoundaryEnabled: true,
      });
      return await tts.toFile(dir, escapeXml(narration), {rate});
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`  attempt ${attempt}/${retries} failed; retrying`);
        await sleep(attempt * 1000);
      }
    } finally {
      tts.close();
    }
  }
  throw lastError;
};

const mapBoundary = (item, segmentIndex, segmentStart) => ({
  segmentIndex,
  text: item.Data?.text?.Text ?? '',
  start: segmentStart + ticksToSeconds(item.Data?.Offset),
  duration: ticksToSeconds(item.Data?.Duration),
  end: segmentStart + ticksToSeconds(item.Data?.Offset) + ticksToSeconds(item.Data?.Duration),
});

const srtTime = (seconds) => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const wrapCaption = (text, maxChars = 20) => {
  const lines = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const space = window.lastIndexOf(' ');
    let cut = space >= Math.ceil(maxChars / 2) ? space + 1 : maxChars;
    if (/[，。！？；：、,.!?;:]/u.test(remaining[cut] ?? '')) cut += 1;
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) lines.push(remaining);
  return lines.join('\n');
};

const splitCaptionText = (text, maxChars = 24, minChars = 6) => {
  const clauses = text.match(/.*?[，。！？；：、]|.+$/gu) ?? [text];
  const pieces = [];
  for (const clause of clauses) {
    let remaining = clause;
    while (remaining.length > maxChars) {
      const window = remaining.slice(0, maxChars + 1);
      const space = window.lastIndexOf(' ');
      let cut = space >= minChars ? space + 1 : maxChars;
      if (/[，。！？；：、,.!?;:]/u.test(remaining[cut] ?? '') && cut > minChars) cut -= 1;
      pieces.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    if (remaining) pieces.push(remaining);
  }

  const merged = [];
  for (const piece of pieces) {
    const previous = merged.at(-1);
    if (previous && previous.length + piece.length <= maxChars && (previous.length < minChars || piece.length < minChars)) {
      merged[merged.length - 1] += piece;
    } else {
      merged.push(piece);
    }
  }
  return merged;
};

const captionWeight = (text) => Math.max(1, [...text].filter((character) => !/[\s，。！？；：、,.!?;:]/u.test(character)).length);

const buildCaptions = (sentenceEntries) => sentenceEntries.flatMap((sentence, sentenceIndex) => {
  const pieces = splitCaptionText(sentence.text);
  const weights = pieces.map(captionWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = sentence.start;
  return pieces.map((text, index) => {
    const end = index === pieces.length - 1
      ? sentence.end
      : cursor + sentence.duration * weights[index] / totalWeight;
    const caption = {
      sentenceIndex,
      text,
      start: cursor,
      duration: end - cursor,
      end,
      timingSource: 'sentence-boundary-proportional',
    };
    cursor = end;
    return caption;
  });
});

const serializeSrt = (entries, wrapWidth = null) => entries.map((entry, index) => [
  index + 1,
  `${srtTime(entry.start)} --> ${srtTime(entry.end)}`,
  wrapWidth ? wrapCaption(entry.text, wrapWidth) : entry.text,
  '',
].join('\n')).join('\n');

const serializeVtt = (entries) => `WEBVTT\n\n${entries.map((entry) => [
  `${srtTime(entry.start).replace(',', '.')} --> ${srtTime(entry.end).replace(',', '.')}`,
  wrapCaption(entry.text, 12),
  '',
].join('\n')).join('\n')}`;

await fs.mkdir(outputDir, {recursive: true});
const chunkRoot = path.join(outputDir, 'chunks');
await fs.mkdir(chunkRoot, {recursive: true});

const chunks = [];
const words = [];
const sentences = [];
let cursor = 0;

for (let index = 0; index < segments.length; index += 1) {
  const dir = path.join(chunkRoot, String(index).padStart(3, '0'));
  await fs.mkdir(dir, {recursive: true});
  console.log(`[${index + 1}/${segments.length}] synthesizing ${segments[index].length} characters`);
  const result = await synthesize(dir, segments[index]);
  const metadata = JSON.parse(await fs.readFile(result.metadataFilePath, 'utf8'));
  const audioDuration = await getAudioDuration(result.audioFilePath);
  const entries = [...(metadata.Metadata ?? [])].sort(
    (left, right) => Number(left.Data?.Offset ?? 0) - Number(right.Data?.Offset ?? 0),
  );

  words.push(...entries
    .filter((item) => item.Type === 'WordBoundary')
    .map((item) => mapBoundary(item, index, cursor)));
  sentences.push(...entries
    .filter((item) => item.Type === 'SentenceBoundary')
    .map((item) => mapBoundary(item, index, cursor)));
  chunks.push({
    index,
    text: segments[index],
    start: cursor,
    duration: audioDuration,
    end: cursor + audioDuration,
    audio: path.relative(outputDir, result.audioFilePath).replaceAll('\\', '/'),
    metadata: path.relative(outputDir, result.metadataFilePath).replaceAll('\\', '/'),
  });
  cursor += audioDuration;
}

const audioInputs = chunks.flatMap((chunk) => ['-i', path.join(outputDir, chunk.audio)]);
const concatFilter = chunks.map((_, index) => `[${index}:a]`).join('') + `concat=n=${chunks.length}:v=0:a=1[out]`;
const webmPath = path.join(outputDir, 'narration.webm');
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  ...audioInputs,
  '-filter_complex', concatFilter,
  '-map', '[out]',
  '-c:a', 'libopus', '-b:a', '48k',
  webmPath,
], {maxBuffer: 16 * 1024 * 1024});

const mp3Path = path.join(outputDir, 'narration.mp3');
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', webmPath,
  '-map', '0:a:0',
  '-c:a', 'libmp3lame', '-b:a', '96k',
  mp3Path,
], {maxBuffer: 16 * 1024 * 1024});

await execFileAsync('ffmpeg', [
  '-v', 'error',
  '-i', webmPath,
  '-map', '0:a:0',
  '-f', 'null', '-'
], {maxBuffer: 16 * 1024 * 1024});

const finalDuration = await getAudioDuration(webmPath);
for (let index = 0; index < sentences.length; index += 1) {
  const sentence = sentences[index];
  const nextStart = sentences[index + 1]?.start ?? finalDuration;
  sentence.serviceDuration = sentence.duration;
  sentence.serviceEnd = sentence.end;
  sentence.end = Math.max(sentence.start, Math.min(sentence.end, nextStart, finalDuration));
  sentence.duration = sentence.end - sentence.start;
}
const normalizedSource = segments.join('').replace(/\s/gu, '');
const normalizedServiceTranscript = sentences.map((item) => item.text).join('').replace(/\s/gu, '');
const captions = buildCaptions(sentences);
const sourceSha256 = crypto.createHash('sha256').update(source, 'utf8').digest('hex');

const manifest = {
  generatedAt: new Date().toISOString(),
  source: path.relative(root, inputPath).replaceAll('\\', '/'),
  sourceSha256,
  sourceCharacters: source.length,
  sourceNonWhitespaceCharacters: source.replace(/\s/gu, '').length,
  voice,
  rate,
  segmentCount: chunks.length,
  durationSeconds: finalDuration,
  wordBoundaryCount: words.length,
  sentenceBoundaryCount: sentences.length,
  captionCueCount: captions.length,
  serviceTranscriptMatchesSource: normalizedServiceTranscript === normalizedSource,
  outputs: {
    webm: 'narration.webm',
    mp3: 'narration.mp3',
    words: 'words.json',
    sentences: 'sentences.json',
    captions: 'captions.json',
    srt: 'subtitles.srt',
    vtt: 'subtitles.vtt',
    sentenceSrt: 'sentences.srt',
  },
  chunks,
};

const srt = serializeSrt(captions, 12);
const vtt = serializeVtt(captions);
const sentenceSrt = serializeSrt(sentences, 20);

await Promise.all([
  fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'sentences.json'), `${JSON.stringify(sentences, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'captions.json'), `${JSON.stringify(captions, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'subtitles.srt'), `${srt}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'subtitles.vtt'), vtt, 'utf8'),
  fs.writeFile(path.join(outputDir, 'sentences.srt'), `${sentenceSrt}\n`, 'utf8'),
]);

console.log(JSON.stringify({
  outputDir,
  durationSeconds: finalDuration,
  wordBoundaryCount: words.length,
  sentenceBoundaryCount: sentences.length,
  captionCueCount: captions.length,
  serviceTranscriptMatchesSource: manifest.serviceTranscriptMatchesSource,
}, null, 2));
