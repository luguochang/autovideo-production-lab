import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const probes = [
  'editorial-data-report',
  'apple-clean-product',
  'pixel-card-platform-ui',
  'magazine-collage-cards',
  'monochrome-cyber-editorial-cards',
  'handdrawn-workflow-tutorial',
  'data-hud-narration',
];

const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: root, encoding: 'utf8'});
  return {...result, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
};

const report = {
  schemaVersion: 'autovideo-f1-style-review-qa/v1',
  expected: {duration: 20, width: 720, height: 1280, fps: '30/1'},
  ok: true,
  probes: [],
};

for (const id of probes) {
  const file = `review/probes/${id}.mp4`;
  const absolute = path.join(root, file);
  const row = {id, file, exists: fs.existsSync(absolute)};
  if (!row.exists) {
    row.ok = false;
    report.probes.push(row);
    report.ok = false;
    continue;
  }

  const mediaProbe = run('ffprobe.exe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
    '-of', 'json',
    file,
  ]);
  if (mediaProbe.status !== 0) throw new Error(`ffprobe failed for ${id}: ${mediaProbe.stderr}`);
  row.media = JSON.parse(mediaProbe.stdout);
  const video = row.media.streams?.find((stream) => stream.codec_type === 'video') ?? null;
  const audio = row.media.streams?.find((stream) => stream.codec_type === 'audio') ?? null;
  row.duration = Number(row.media.format?.duration ?? 0);
  row.video = video;
  row.audio = audio;

  const decode = run('ffmpeg.exe', ['-v', 'error', '-i', file, '-f', 'null', '-']);
  const blackDetect = run('ffmpeg.exe', [
    '-v', 'info', '-i', file,
    '-vf', 'blackdetect=d=0.15:pix_th=0.10',
    '-an', '-f', 'null', '-',
  ]);
  row.decodeOk = decode.status === 0;
  row.blackDetectOk = blackDetect.status === 0;
  row.blackIntervals = (blackDetect.stderr.match(/black_start:/g) ?? []).length;
  row.ok = video?.codec_name === 'h264'
    && audio?.codec_name === 'aac'
    && video?.width === 720
    && video?.height === 1280
    && video?.r_frame_rate === '30/1'
    && row.duration >= 19.9
    && row.duration <= 20.2
    && row.decodeOk
    && row.blackDetectOk
    && row.blackIntervals === 0;
  report.probes.push(row);
  report.ok &&= row.ok;
}

fs.mkdirSync(path.join(root, 'qa'), {recursive: true});
fs.writeFileSync(path.join(root, 'qa', 'media-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
