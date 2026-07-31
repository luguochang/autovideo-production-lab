import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..', '..');
const audioRoot = path.join(projectRoot, 'audio');
const episodeRoot = path.join(audioRoot, 'episodes-v2');
const originalAudio = path.join(audioRoot, 'narration.final.wav');
const originalExpectedSha256 = '8bc44127b6d4e925491a4d9bc8e09f7abb223b237075c633c48e8d167ea17702';
const splitSeconds = 794.88;
const transitionGapSeconds = 0.72;

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const round = (value) => Number(value.toFixed(6));

const probe = async (filePath) => {
  const {stdout} = await run('ffprobe.exe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath,
  ], {windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024});
  const report = JSON.parse(stdout);
  const stream = report.streams.find((item) => item.codec_type === 'audio');
  if (!stream) throw new Error(`Missing audio stream: ${filePath}`);
  return {
    durationSeconds: Number(report.format.duration),
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
  };
};

const measureLoudness = async (filePath) => {
  const {stderr} = await run('ffmpeg.exe', [
    '-hide_banner', '-i', filePath,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null', 'NUL',
  ], {windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024});
  const matches = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (!matches.length) throw new Error(`Could not parse loudness report: ${filePath}`);
  const report = JSON.parse(matches.at(-1)[0]);
  return {
    integratedLufs: Number(report.input_i),
    truePeakDb: Number(report.input_tp),
    loudnessRangeLu: Number(report.input_lra),
    thresholdLufs: Number(report.input_thresh),
  };
};

const verifyPcm = (media, label) => {
  if (media.codec !== 'pcm_s16le' || media.sampleRate !== 48_000 || media.channels !== 1) {
    throw new Error(`${label} must be 48 kHz mono PCM s16le.`);
  }
};

const bridgeSegments = async (prefix, mergeReceipt, offsetSeconds) => {
  const gap = Number(mergeReceipt.gaps[0]?.actualActiveVoiceGapSeconds ?? 0);
  let cursor = offsetSeconds;
  const segments = [];
  for (const [index, part] of mergeReceipt.parts.entries()) {
    const textPath = path.join(episodeRoot, `${part.id}.txt`);
    const text = (await fs.readFile(textPath, 'utf8')).trim();
    const start = round(cursor);
    const end = round(start + Number(part.durationSeconds));
    segments.push({id:`bridge-${prefix}-${String(index + 1).padStart(2, '0')}`,start,end,text});
    cursor = end + (index < mergeReceipt.parts.length - 1 ? gap : 0);
  }
  return segments;
};

const assemble = async ({outputName, bridgeName, filter, expectedDurationSeconds}) => {
  const output = path.join(episodeRoot, outputName);
  const staged = path.join(episodeRoot, `.${outputName}.staged.wav`);
  await fs.rm(staged, {force:true});
  await run('ffmpeg.exe', [
    '-y', '-v', 'error', '-i', originalAudio, '-i', path.join(episodeRoot, bridgeName),
    '-filter_complex', filter, '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', staged,
  ], {windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024});
  await run('ffmpeg.exe', ['-v', 'error', '-i', staged, '-f', 'null', 'NUL'], {
    windowsHide:true, timeout:30 * 60 * 1000, maxBuffer:8 * 1024 * 1024,
  });
  const media = await probe(staged);
  verifyPcm(media, outputName);
  if (Math.abs(media.durationSeconds - expectedDurationSeconds) > 0.03) {
    throw new Error(`${outputName} duration mismatch: ${media.durationSeconds} vs ${expectedDurationSeconds}`);
  }
  const loudness = await measureLoudness(staged);
  await fs.rm(output, {force:true});
  await fs.rename(staged, output);
  return {
    path:path.relative(projectRoot, output).replaceAll('\\','/'),
    sha256:await sha256File(output),
    ...media,
    loudness,
    decodePassed:true,
  };
};

const originalSha256Before = await sha256File(originalAudio);
if (originalSha256Before !== originalExpectedSha256) throw new Error('Approved narration hash does not match the lock.');
const originalMedia = await probe(originalAudio);
verifyPcm(originalMedia, 'Approved narration');

const upperReceiptPath = path.join(episodeRoot, 'upper-close.merge.recipe.json');
const lowerReceiptPath = path.join(episodeRoot, 'lower-recap.merge.recipe.json');
const upperReceipt = await readJson(upperReceiptPath);
const lowerReceipt = await readJson(lowerReceiptPath);
for (const [label, receipt] of [['upper close',upperReceipt],['lower recap',lowerReceipt]]) {
  const bridgePath = path.join(episodeRoot, receipt.output.path);
  if (await sha256File(bridgePath) !== receipt.output.sha256) throw new Error(`${label} hash mismatch.`);
  verifyPcm(await probe(bridgePath), label);
}

const upperDuration = Number(upperReceipt.output.durationSeconds);
const lowerDuration = Number(lowerReceipt.output.durationSeconds);
const episode1Expected = splitSeconds + transitionGapSeconds + upperDuration;
const episode2OriginalStartAt = lowerDuration + transitionGapSeconds;
const episode2Expected = episode2OriginalStartAt + originalMedia.durationSeconds - splitSeconds;

const episode1 = await assemble({
  outputName:'episode-1.internal.wav',
  bridgeName:upperReceipt.output.path,
  filter:`[0:a]atrim=start=0:end=${splitSeconds},asetpts=PTS-STARTPTS[main];anullsrc=r=48000:cl=mono:d=${transitionGapSeconds}[gap];[main][gap][1:a]concat=n=3:v=0:a=1[out]`,
  expectedDurationSeconds:episode1Expected,
});
const episode2 = await assemble({
  outputName:'episode-2.internal.wav',
  bridgeName:lowerReceipt.output.path,
  filter:`[0:a]atrim=start=${splitSeconds},asetpts=PTS-STARTPTS[main];anullsrc=r=48000:cl=mono:d=${transitionGapSeconds}[gap];[1:a][gap][main]concat=n=3:v=0:a=1[out]`,
  expectedDurationSeconds:episode2Expected,
});

const originalSha256After = await sha256File(originalAudio);
if (originalSha256After !== originalSha256Before) throw new Error('Approved narration changed during episode assembly.');

const upperBridgeStart = splitSeconds + transitionGapSeconds;
const recipe = {
  schemaVersion:'autovideo-episode-audio/v1',
  generatedAt:new Date().toISOString(),
  internalOnly:true,
  humanListeningRequired:true,
  humanListeningPerformed:false,
  publicReleaseBlocked:true,
  split:{seconds:splitSeconds,reason:'semantic boundary before the online query stage'},
  transitionGapSeconds,
  original:{
    path:'audio/narration.final.wav',
    sha256:originalSha256After,
    durationSeconds:round(originalMedia.durationSeconds),
    preserved:true,
  },
  bridges:{
    upperClose:{path:'audio/episodes-v2/upper-close.wav',sha256:upperReceipt.output.sha256,receipt:'audio/episodes-v2/upper-close.merge.recipe.json'},
    lowerRecap:{path:'audio/episodes-v2/lower-recap.wav',sha256:lowerReceipt.output.sha256,receipt:'audio/episodes-v2/lower-recap.merge.recipe.json'},
  },
  episode1:{
    ...episode1,
    bridgeStartSeconds:round(upperBridgeStart),
    bridgeSegments:await bridgeSegments('upper',upperReceipt,upperBridgeStart),
  },
  episode2:{
    ...episode2,
    originalStartAtSeconds:round(episode2OriginalStartAt),
    bridgeSegments:await bridgeSegments('lower',lowerReceipt,0),
  },
};
await fs.writeFile(path.join(episodeRoot,'episode-audio-recipe.json'),`${JSON.stringify(recipe,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:true,episode1:recipe.episode1,episode2:recipe.episode2,originalPreserved:true},null,2));
