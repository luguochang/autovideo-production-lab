#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

import {resolveFfmpeg, resolveFfprobe} from '../workflow-console/lib/ffprobe-resolver.mjs';

const run = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256File = async (target) => crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
const portable = (value) => value.replaceAll('\\', '/');

const parseArgs = (values) => {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = values[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
  }
  return args;
};

const safeProjectPath = (projectId) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId ?? '')) throw new Error('Invalid project id.');
  const target = path.resolve(projectsRoot, projectId);
  if (!target.startsWith(`${projectsRoot}${path.sep}`)) throw new Error('Project path escaped the projects root.');
  return target;
};

const safeProjectFile = (projectRoot, relativePath) => {
  const target = path.resolve(projectRoot, relativePath);
  if (!target.startsWith(`${projectRoot}${path.sep}`)) throw new Error('Video path must stay inside the project root.');
  return target;
};

const mediaRate = (value) => {
  const [numerator, denominator = '1'] = String(value ?? '').split('/').map(Number);
  return denominator ? numerator / denominator : 0;
};

const parseLoudnorm = (source) => {
  const matches = [...source.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  if (!matches.length) throw new Error('FFmpeg loudnorm did not return measurement JSON.');
  const parsed = JSON.parse(matches.at(-1)[0]);
  return {
    integratedLufs: Number(parsed.input_i),
    truePeakDbfs: Number(parsed.input_tp),
    loudnessRangeLu: Number(parsed.input_lra),
    thresholdLufs: Number(parsed.input_thresh),
  };
};

const parseSilence = (source) => {
  const starts = [...source.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...source.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match, index) => ({start: starts[index] ?? null, end: Number(match[1]), duration: Number(match[2])}));
  return ends;
};

const scanBlackFrames = ({ffmpeg, videoPath, fps, width = 160, height = 90}) => new Promise((resolve, reject) => {
  const frameBytes = width * height;
  const child = spawn(ffmpeg, [
    '-v', 'error', '-i', videoPath, '-vf', `scale=${width}:${height}`, '-pix_fmt', 'gray',
    '-c:v', 'rawvideo', '-an', '-f', 'image2pipe', 'pipe:1',
  ], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let pending = Buffer.alloc(0);
  let stderr = '';
  let frameIndex = 0;
  let currentStart = null;
  const runs = [];

  const closeRun = () => {
    if (currentStart == null) return;
    const frameCount = frameIndex - currentStart;
    runs.push({
      startFrame: currentStart,
      endFrame: frameIndex - 1,
      frameCount,
      startSeconds: Number((currentStart / fps).toFixed(3)),
      durationSeconds: Number((frameCount / fps).toFixed(3)),
    });
    currentStart = null;
  };

  child.stdout.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= frameBytes) {
      const frame = pending.subarray(0, frameBytes);
      pending = pending.subarray(frameBytes);
      let sum = 0;
      let darkPixels = 0;
      for (const value of frame) {
        sum += value;
        if (value <= 16) darkPixels += 1;
      }
      const black = sum / frameBytes <= 12 && darkPixels / frameBytes >= 0.98;
      if (black && currentStart == null) currentStart = frameIndex;
      if (!black) closeRun();
      frameIndex += 1;
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => {
    closeRun();
    if (code !== 0) return reject(new Error(`Black-frame scan failed: ${stderr.trim()}`));
    if (pending.length) return reject(new Error('Black-frame scan ended with an incomplete raw frame.'));
    const blockingRuns = runs.filter((item) => item.durationSeconds >= 0.5);
    resolve({sampleWidth: width, sampleHeight: height, totalFrames: frameIndex, darkRuns: runs, blockingRuns});
  });
});

export async function verifyInternalVideoFile({projectId, video, label}) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label ?? '')) throw new Error('Invalid QA label.');
  const projectRoot = safeProjectPath(projectId);
  const videoPath = safeProjectFile(projectRoot, video);
  const outputPath = path.join(projectRoot, 'qa', `${label}.json`);
  const ffprobe = await resolveFfprobe({workspaceRoot});
  if (!ffprobe) throw new Error('FFprobe is unavailable. Set AUTOVIDEO_FFPROBE or install workspace media dependencies.');
  const ffmpeg = await resolveFfmpeg({workspaceRoot});
  if (!ffmpeg) throw new Error('FFmpeg is unavailable. Set AUTOVIDEO_FFMPEG or install workspace media dependencies.');
  const nullTarget = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const {stdout: probeOutput} = await run(ffprobe.path, [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath,
  ], {windowsHide: true, timeout: 60_000, maxBuffer: 20 * 1024 * 1024});
  const probe = JSON.parse(probeOutput);
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const fps = mediaRate(videoStream?.avg_frame_rate || videoStream?.r_frame_rate);
  const durationSeconds = Number(probe.format?.duration ?? videoStream?.duration ?? audioStream?.duration);
  const contractErrors = [];
  if (Number(videoStream?.width) !== 1920 || Number(videoStream?.height) !== 1080) contractErrors.push('video-not-1920x1080');
  if (Math.abs(fps - 30) > 0.01) contractErrors.push('video-not-30fps');
  if (videoStream?.codec_name !== 'h264') contractErrors.push('video-not-h264');
  if (audioStream?.codec_name !== 'aac') contractErrors.push('audio-not-aac');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) contractErrors.push('invalid-duration');

  const [, , loudnessResult, silenceResult, blackFrames] = await Promise.all([
    run(ffmpeg.path, ['-v', 'error', '-i', videoPath, '-c:v', 'rawvideo', '-an', '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
    run(ffmpeg.path, ['-v', 'error', '-i', videoPath, '-c:a', 'pcm_s16le', '-vn', '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
    run(ffmpeg.path, ['-hide_banner', '-i', videoPath, '-af', 'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-c:a', 'pcm_s16le', '-vn', '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
    run(ffmpeg.path, ['-hide_banner', '-i', videoPath, '-af', 'silencedetect=noise=-50dB:d=1', '-c:a', 'pcm_s16le', '-vn', '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
    scanBlackFrames({ffmpeg: ffmpeg.path, videoPath, fps}),
  ]);
  const loudness = parseLoudnorm(loudnessResult.stderr);
  const silenceSegments = parseSilence(silenceResult.stderr);
  if (loudness.integratedLufs < -18 || loudness.integratedLufs > -12) contractErrors.push('integrated-loudness-out-of-range');
  if (loudness.truePeakDbfs > -1) contractErrors.push('true-peak-over-ceiling');
  if (blackFrames.blockingRuns.length) contractErrors.push('blocking-black-frame-run');
  const stats = await fs.stat(videoPath);
  const receipt = {
    schemaVersion: 'autovideo-file-only-media-qa/v1',
    projectId,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/verify-internal-video-file.mjs',
    status: contractErrors.length ? 'failed' : 'passed',
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    humanReviewPerformed: false,
    safety: {microphoneUsed: false, playbackUsed: false, soundOutputUsed: false},
    source: {
      path: portable(path.relative(projectRoot, videoPath)),
      sha256: await sha256File(videoPath),
      bytes: stats.size,
    },
    media: {
      durationSeconds,
      width: Number(videoStream?.width),
      height: Number(videoStream?.height),
      fps,
      frameCount: Number(videoStream?.nb_frames),
      videoCodec: videoStream?.codec_name ?? null,
      pixelFormat: videoStream?.pix_fmt ?? null,
      colorSpace: videoStream?.color_space ?? null,
      audioCodec: audioStream?.codec_name ?? null,
      audioSampleRate: Number(audioStream?.sample_rate ?? 0),
      audioChannels: Number(audioStream?.channels ?? 0),
    },
    checks: {
      fullDecode: 'passed',
      loudness,
      silenceSegments,
      blackFrames,
    },
    contractErrors,
    notes: 'File-only internal QA. No microphone, media playback, sound output, human listening, or public-release approval is claimed.',
  };
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, stableJson(receipt), 'utf8');
  if (contractErrors.length) throw new Error(`File-only media QA failed: ${contractErrors.join(', ')}. Receipt: ${portable(path.relative(workspaceRoot, outputPath))}`);
  return {receipt, outputPath};
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.project || !args.video || !args.label) {
      throw new Error('Usage: node scripts/verify-internal-video-file.mjs --project <id> --video <project-relative.mp4> --label <qa-label>');
    }
    const result = await verifyInternalVideoFile({projectId: args.project, video: args.video, label: args.label});
    console.log(JSON.stringify({
      ok: true,
      status: result.receipt.status,
      video: result.receipt.source,
      media: result.receipt.media,
      loudness: result.receipt.checks.loudness,
      blackFrameRuns: result.receipt.checks.blackFrames.blockingRuns.length,
      receiptPath: portable(path.relative(workspaceRoot, result.outputPath)),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
