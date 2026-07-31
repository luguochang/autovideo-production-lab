import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const schemaVersion = 'autovideo-breath-merge/v1';
const sampleRate = 48_000;
const leadingPaddingSeconds = 0.06;
const trailingPaddingSeconds = 0.10;
const edgeFadeSeconds = 0.01;

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const round = (value) => Number(value.toFixed(6));

const resolveInside = (root, value, label) => {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  const resolved = path.resolve(root, value);
  if (path.relative(root, resolved).startsWith('..')) throw new Error(`${label} escapes the manifest directory.`);
  return resolved;
};

export const deriveVoiceBounds = (durationSeconds, silenceLog) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Audio duration must be positive.');
  const segments = [...silenceLog.matchAll(/silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match) => ({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])}));
  const leading = segments.find((segment) => segment.start <= 0.005);
  const trailing = [...segments].reverse().find((segment) => Math.abs(segment.end - duration) <= 0.03);
  const activeStart = Math.min(duration, Math.max(0, leading?.end ?? 0));
  const activeEnd = Math.min(duration, Math.max(activeStart, trailing?.start ?? duration));
  if (activeEnd - activeStart < 0.05) throw new Error('No stable active voice region was detected.');
  const trimStart = Math.max(0, activeStart - leadingPaddingSeconds);
  const trimEnd = Math.min(duration, activeEnd + trailingPaddingSeconds);
  return {
    durationSeconds: round(duration),
    activeStartSeconds: round(activeStart),
    activeEndSeconds: round(activeEnd),
    trimStartSeconds: round(trimStart),
    trimEndSeconds: round(trimEnd),
    retainedLeadingSilenceSeconds: round(activeStart - trimStart),
    retainedTrailingSilenceSeconds: round(trimEnd - activeEnd),
    detectedSilenceSegments: segments.map((segment) => Object.fromEntries(Object.entries(segment).map(([key, value]) => [key, round(value)]))),
  };
};

export const planBreathGaps = (bounds, targetGapSeconds) => {
  const target = Number(targetGapSeconds);
  if (!Number.isFinite(target) || target < 0.42 || target > 0.65) {
    throw new Error('targetGapSeconds must be between 0.42 and 0.65 seconds.');
  }
  return bounds.slice(0, -1).map((current, index) => {
    const next = bounds[index + 1];
    const retained = current.retainedTrailingSilenceSeconds + next.retainedLeadingSilenceSeconds;
    const inserted = target - retained;
    if (inserted < 0) throw new Error(`Existing protected silence exceeds the target gap before part ${index + 2}.`);
    return {
      afterPartIndex: index,
      targetActiveVoiceGapSeconds: round(target),
      retainedTrailingSilenceSeconds: current.retainedTrailingSilenceSeconds,
      retainedNextLeadingSilenceSeconds: next.retainedLeadingSilenceSeconds,
      insertedSilenceSeconds: round(inserted),
      actualActiveVoiceGapSeconds: round(retained + inserted),
    };
  });
};

const probe = async (filePath) => {
  const {stdout} = await run('ffprobe.exe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(stdout);
  const stream = report.streams.find((item) => item.codec_type === 'audio');
  if (!stream || Number(stream.sample_rate) !== sampleRate || Number(stream.channels) !== 1 || stream.codec_name !== 'pcm_s16le') {
    throw new Error(`Part must be 48 kHz mono PCM s16le: ${filePath}`);
  }
  return {durationSeconds: Number(report.format.duration), codec: stream.codec_name};
};

const detectBounds = async (filePath, durationSeconds) => {
  const {stderr} = await run('ffmpeg.exe', [
    '-hide_banner', '-i', filePath, '-af', 'silencedetect=noise=-38dB:d=0.03', '-f', 'null', 'NUL',
  ], {windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024});
  return deriveVoiceBounds(durationSeconds, stderr);
};

const loudnormFilter = async (source) => {
  const {stderr} = await run('ffmpeg.exe', [
    '-hide_banner', '-i', source, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', 'NUL',
  ], {windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024});
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error('Could not parse FFmpeg loudnorm measurements.');
  const stats = JSON.parse(match[0]);
  return `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true:print_format=summary`;
};

const writePcmSilence = async (filePath, durationSeconds) => {
  const sampleCount = Math.max(1, Math.round(Number(durationSeconds) * sampleRate));
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  await fs.writeFile(filePath, wav);
};

const concatListEntry = (filePath) => `file '${filePath.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;

export const mergeBreathAudio = async (manifestPath) => {
  const manifest = path.resolve(manifestPath);
  const root = path.dirname(manifest);
  const document = JSON.parse(await fs.readFile(manifest, 'utf8'));
  if (document.schemaVersion !== schemaVersion || !Array.isArray(document.parts) || !document.parts.length) {
    throw new Error(`Merge manifest must use ${schemaVersion} and contain at least one part.`);
  }
  const targetGapSeconds = Number(document.targetGapSeconds ?? 0.56);
  const output = resolveInside(root, document.output, 'output');
  const receiptPath = resolveInside(root, document.receipt, 'receipt');
  const parts = [];
  const ids = new Set();
  for (const [index, item] of document.parts.entries()) {
    if (!item?.id || ids.has(item.id)) throw new Error(`parts[${index}].id must be unique.`);
    ids.add(item.id);
    const source = resolveInside(root, item.path, `parts[${index}].path`);
    const actualSha256 = await sha256File(source);
    if (actualSha256 !== String(item.sha256 ?? '').toLowerCase()) throw new Error(`Part hash mismatch: ${item.id}`);
    const media = await probe(source);
    const bounds = await detectBounds(source, media.durationSeconds);
    parts.push({id: item.id, path: item.path, sha256: actualSha256, ...media, bounds, source});
  }
  const gaps = planBreathGaps(parts.map((part) => part.bounds), targetGapSeconds);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-breath-merge-'));
  const assembled = path.join(tempRoot, 'assembled.wav');
  const normalized = path.join(tempRoot, 'normalized.wav');
  try {
    const preparedFiles = [];
    for (const [index, part] of parts.entries()) {
      const duration = part.bounds.trimEndSeconds - part.bounds.trimStartSeconds;
      const fadeOutStart = Math.max(0, duration - edgeFadeSeconds);
      const preparedPart = path.join(tempRoot, `part-${String(index + 1).padStart(4, '0')}.wav`);
      await run('ffmpeg.exe', [
        '-y', '-v', 'error', '-i', part.source,
        '-af', `atrim=start=${part.bounds.trimStartSeconds}:end=${part.bounds.trimEndSeconds},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${edgeFadeSeconds},afade=t=out:st=${round(fadeOutStart)}:d=${edgeFadeSeconds}`,
        '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', preparedPart,
      ], {windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024});
      preparedFiles.push(preparedPart);
      if (index < gaps.length) {
        const silence = path.join(tempRoot, `gap-${String(index + 1).padStart(4, '0')}.wav`);
        await writePcmSilence(silence, gaps[index].insertedSilenceSeconds);
        preparedFiles.push(silence);
      }
    }
    const concatList = path.join(tempRoot, 'concat.txt');
    await fs.writeFile(concatList, `${preparedFiles.map(concatListEntry).join('\n')}\n`, 'utf8');
    await run('ffmpeg.exe', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concatList, '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', assembled], {
      windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    });
    const loudnorm = await loudnormFilter(assembled);
    await run('ffmpeg.exe', ['-y', '-v', 'error', '-i', assembled, '-af', loudnorm, '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', normalized], {
      windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    });
    await run('ffmpeg.exe', ['-v', 'error', '-i', normalized, '-f', 'null', 'NUL'], {windowsHide: true, timeout: 10 * 60 * 1000});
    const finalProbe = await probe(normalized);
    const receipt = {
      schemaVersion,
      generatedAt: new Date().toISOString(),
      manifest: {path: path.basename(manifest), sha256: await sha256File(manifest)},
      policy: {
        targetActiveVoiceGapSeconds: targetGapSeconds,
        permittedGapSeconds: {minimum: 0.42, maximum: 0.65},
        leadingPaddingSeconds,
        trailingPaddingSeconds,
        edgeFadeSeconds,
        assemblyStrategy: 'prepared-segments-concat-demuxer',
        commandLineBounded: true,
        silenceDetection: 'ffmpeg silencedetect noise=-38dB d=0.03',
        finalLoudness: {integratedLufs: -16, truePeakDb: -1.5, passes: 2},
      },
      parts: parts.map(({source, ...part}) => part),
      gaps,
      output: {path: document.output, sha256: await sha256File(normalized), durationSeconds: finalProbe.durationSeconds, codec: finalProbe.codec, sampleRate, channels: 1},
    };
    await fs.mkdir(path.dirname(output), {recursive: true});
    await fs.mkdir(path.dirname(receiptPath), {recursive: true});
    const stagedReceipt = path.join(tempRoot, 'receipt.json');
    await fs.writeFile(stagedReceipt, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await fs.copyFile(normalized, output);
    await fs.copyFile(stagedReceipt, receiptPath);
    return receipt;
  } finally {
    await fs.rm(tempRoot, {recursive: true, force: true});
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const flag = process.argv.indexOf('--manifest');
  const manifest = flag >= 0 ? process.argv[flag + 1] : null;
  if (!manifest) throw new Error('Usage: node tools/voice-lab/merge_breath_audio.mjs --manifest <merge-manifest.json>');
  mergeBreathAudio(manifest)
    .then((receipt) => console.log(JSON.stringify({ok: true, output: receipt.output, gaps: receipt.gaps}, null, 2)))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
