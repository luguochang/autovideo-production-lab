import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const experimentDir = path.resolve(here, '..');
const rootDir = path.resolve(experimentDir, '..', '..');
const qaDir = path.join(experimentDir, 'qa');
const narration = JSON.parse(await fs.readFile(path.join(experimentDir, 'shared', 'narration.json'), 'utf8'));
const source = (await fs.readFile(path.join(rootDir, 'demo', 'demoText.txt'), 'utf8')).replace(/\r\n/g, '\n').trim();

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0
    ? resolve({stdout, stderr})
    : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)));
});

const renderNames = ['A-system-map', 'B-whiteboard-mindmap', 'C-diagnostic-console'];
const expectedDuration = Math.ceil((narration.duration + 0.6) * 1000) / 1000;
const expectedFrames = Math.round(expectedDuration * 30);

const verifyVideo = async (name) => {
  const finalPath = path.join(experimentDir, 'renders', 'final', `${name}.mp4`);
  const videoPath = await fs.access(finalPath).then(() => finalPath).catch(() => path.join(experimentDir, 'renders', `${name}.mp4`));
  const probe = JSON.parse((await run('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels',
    '-of', 'json', videoPath,
  ])).stdout);
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const blackOutput = await run('ffmpeg', [
    '-hide_banner', '-i', videoPath, '-vf', 'blackdetect=d=0.08:pix_th=0.04',
    '-an', '-f', 'null', 'NUL',
  ]);
  const blackSegments = [...blackOutput.stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map((match) => ({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])}));

  const transitionFrames = narration.chapters.slice(1).flatMap((chapter) => {
    const center = Math.round(chapter.start * 30);
    return [center - 3, center, center + 3];
  });
  const selectExpression = transitionFrames.map((frame) => `eq(n\\,${frame})`).join('+');
  const stats = await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-vf', `select=${selectExpression},signalstats,metadata=print:file=-`,
    '-an', '-f', 'null', 'NUL',
  ]);
  const yavg = [...stats.stdout.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((match) => Number(match[1]));
  const transitionTriplets = [];
  for (let index = 0; index < yavg.length; index += 3) {
    const values = yavg.slice(index, index + 3);
    if (values.length === 3) {
      transitionTriplets.push({
        chapter: index / 3 + 2,
        values: values.map((value) => Number(value.toFixed(3))),
        maxDelta: Number(Math.max(Math.abs(values[1] - values[0]), Math.abs(values[2] - values[1])).toFixed(3)),
      });
    }
  }
  const maxTransitionLumaDelta = Math.max(...transitionTriplets.map((item) => item.maxDelta));
  await run('ffmpeg', ['-v', 'error', '-i', videoPath, '-f', 'null', 'NUL']);
  const checks = {
    h264: video?.codec_name === 'h264',
    aac: audio?.codec_name === 'aac',
    dimensions: video?.width === 720 && video?.height === 1280,
    fps: video?.r_frame_rate === '30/1',
    frameCount: Number(video?.nb_frames) === expectedFrames,
    audioRate: audio?.sample_rate === '48000' && audio?.channels === 2,
    duration: Math.abs(Number(probe.format.duration) - expectedDuration) < 0.05,
    blackFrames: blackSegments.length === 0,
    transitionLuma: maxTransitionLumaDelta < 35,
    fullDecode: true,
  };
  return {
    name,
    path: path.relative(experimentDir, videoPath).replaceAll('\\', '/'),
    bytes: Number(probe.format.size),
    duration: Number(probe.format.duration),
    video,
    audio,
    blackSegments,
    maxTransitionLumaDelta,
    transitionTriplets,
    checks,
    ok: Object.values(checks).every(Boolean),
  };
};

const captionOverlaps = [];
for (let index = 1; index < narration.captions.length; index += 1) {
  const previous = narration.captions[index - 1];
  const current = narration.captions[index];
  if (current.start < previous.end) {
    captionOverlaps.push({index, seconds: Number((previous.end - current.start).toFixed(4)), previous: previous.text, current: current.text});
  }
}

const videos = [];
for (const name of renderNames) videos.push(await verifyVideo(name));
const loudnessRun = await run('ffmpeg', [
  '-hide_banner', '-i', videos[0].path.startsWith('renders/final/')
    ? path.join(experimentDir, 'renders', 'final', 'A-system-map.mp4')
    : path.join(experimentDir, 'renders', 'A-system-map.mp4'),
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', 'NUL',
]);
const loudnessMatch = loudnessRun.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
const loudness = loudnessMatch ? JSON.parse(loudnessMatch[0]) : null;
const sentenceText = narration.sentences.map((sentence) => sentence.text).join('');

const sourceChecks = {
  narrationTextExact: source === narration.text,
  sentenceTextExactIgnoringParagraphBreaks: source.replace(/\n/g, '') === sentenceText,
  chapterCount: narration.chapters.length === 14,
  sentenceCount: narration.sentences.length === 46,
  captionCount: narration.captions.length === 109,
  captionOverlapBounded: captionOverlaps.length <= 1 && captionOverlaps.every((item) => item.seconds <= 0.051),
};
const report = {
  schemaVersion: 'demo-candidates-qa/v1',
  verifiedAt: new Date().toISOString(),
  source: {
    path: 'demo/demoText.txt',
    sha256: narration.sourceSha256,
    voice: narration.voice,
    rate: narration.rate,
    duration: narration.duration,
    checks: sourceChecks,
    captionOverlaps,
  },
  render: {expectedDuration, expectedFrames, videos},
  loudness,
  ok: Object.values(sourceChecks).every(Boolean) && videos.every((video) => video.ok),
};
await fs.mkdir(qaDir, {recursive: true});
await fs.writeFile(path.join(qaDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: report.ok,
  sourceChecks,
  videos: videos.map((video) => ({name: video.name, ok: video.ok, maxTransitionLumaDelta: video.maxTransitionLumaDelta, checks: video.checks})),
  loudness,
}, null, 2));
if (!report.ok) process.exitCode = 1;
