import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {syncProjectSopStatus} from './sync-project-sop-status.mjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const portable = (value) => value.replaceAll('\\', '/');

const compositionExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.woff', '.woff2', '.ttf', '.otf', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.webm',
]);
const ignoredDirectories = new Set([
  'node_modules', '.git', 'dist', 'renders', 'qa', '.thumbnails', '.waveform-cache',
]);
const ignoredFiles = new Set(['meta.json', 'data/composition-build.json']);

const parseArgs = (values) => {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const projectPath = (projectId) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId ?? '')) {
    throw new Error('Usage: node scripts/finalize-internal-review.mjs --project <id>');
  }
  const target = path.resolve(projectsRoot, projectId);
  if (!target.startsWith(`${projectsRoot}${path.sep}`)) throw new Error('Project path escaped the projects root.');
  return target;
};

const projectFile = (projectDir, relativePath) => {
  const target = path.resolve(projectDir, relativePath);
  if (target !== projectDir && !target.startsWith(`${projectDir}${path.sep}`)) {
    throw new Error(`Project path escaped the project root: ${relativePath}`);
  }
  return target;
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const hashCompositionManifest = async (directory) => {
  const files = [];
  const walk = async (current) => {
    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(target);
      } else if (entry.isFile() && compositionExtensions.has(path.extname(entry.name).toLowerCase())) {
        const relativePath = portable(path.relative(directory, target));
        if (ignoredFiles.has(relativePath)) continue;
        const stats = await fs.stat(target);
        files.push({path: relativePath, bytes: stats.size, sha256: await sha256File(target)});
      }
    }
  };
  await walk(directory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {digest: sha256(JSON.stringify(files)), files};
};

const fraction = (value) => {
  const [numerator, denominator = '1'] = String(value ?? '').split('/').map(Number);
  return denominator ? numerator / denominator : 0;
};

const extractMatches = (source, pattern, map) => [...source.matchAll(pattern)].map(map);

const frameReceipt = async (projectDir, filePath) => {
  const {stdout} = await run('ffprobe.exe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', filePath,
  ], {windowsHide: true, timeout: 60_000});
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (Number(stream?.width) !== 1920 || Number(stream?.height) !== 1080) {
    throw new Error(`Review frame must be 1920x1080: ${filePath}`);
  }
  const stats = await fs.stat(filePath);
  return {
    path: portable(path.relative(projectDir, filePath)),
    sha256: await sha256File(filePath),
    bytes: stats.size,
    width: Number(stream.width),
    height: Number(stream.height),
  };
};

export const finalizeInternalReview = async (projectId) => {
  const projectDir = projectPath(projectId);
  const compositionDir = path.join(projectDir, 'production', 'hyperframes');
  const buildPath = path.join(compositionDir, 'data', 'composition-build.json');
  const checkPath = path.join(projectDir, 'qa', 'hyperframes-check.json');
  const renderReceiptPath = path.join(projectDir, 'renders', `${projectId}-internal-review.receipt.json`);
  const videoPath = path.join(projectDir, 'renders', `${projectId}-internal-review.mp4`);
  const coverPath = path.join(projectDir, 'renders', `${projectId}-cover.png`);
  const qaDir = path.join(projectDir, 'qa');
  const ffprobePath = path.join(qaDir, 'internal-review.ffprobe.json');
  const decodeLogPath = path.join(qaDir, 'internal-review.decode.log');
  const qaPath = path.join(qaDir, 'internal-review-delivery.json');

  const [build, check, renderReceipt, composition] = await Promise.all([
    readJson(buildPath),
    readJson(checkPath),
    readJson(renderReceiptPath),
    hashCompositionManifest(compositionDir),
  ]);
  const [buildSha256, checkSha256, renderReceiptSha256, videoSha256, coverSha256] = await Promise.all([
    sha256File(buildPath),
    sha256File(checkPath),
    sha256File(renderReceiptPath),
    sha256File(videoPath),
    sha256File(coverPath),
  ]);

  if (build.projectId !== projectId) throw new Error('Composition build receipt belongs to another project.');
  if (check.ok !== true || check.strict !== true) throw new Error('HyperFrames strict check has not passed.');
  if (check.autoVideo?.compositionDigest !== composition.digest
    || Number(check.autoVideo?.compositionFileCount) !== composition.files.length
    || check.autoVideo?.buildReceiptSha256 !== buildSha256) {
    throw new Error('HyperFrames check is stale for the current composition or build receipt.');
  }
  if (renderReceipt.schemaVersion !== 'autovideo-internal-review-render/v1'
    || renderReceipt.projectId !== projectId
    || renderReceipt.releaseScope !== 'internal-only'
    || renderReceipt.publicReleaseBlocked !== true
    || renderReceipt.video?.sha256 !== videoSha256
    || renderReceipt.video?.fullDecodePassed !== true
    || renderReceipt.cover?.sha256 !== coverSha256) {
    throw new Error('Internal-review render receipt is missing, stale, or not internal-only.');
  }

  const {stdout: ffprobeOutput} = await run('ffprobe.exe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath,
  ], {windowsHide: true, timeout: 60_000, maxBuffer: 10 * 1024 * 1024});
  const probe = JSON.parse(ffprobeOutput);
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number(probe.format?.duration);
  const fps = fraction(video?.avg_frame_rate || video?.r_frame_rate);
  const blockers = [];
  if (!video || Number(video.width) !== 1920 || Number(video.height) !== 1080) blockers.push('Video must be 1920x1080.');
  if (video?.codec_name !== 'h264') blockers.push(`Video codec must be H.264, found ${video?.codec_name ?? 'missing'}.`);
  if (!audio || audio.codec_name !== 'aac') blockers.push(`Audio codec must be AAC, found ${audio?.codec_name ?? 'missing'}.`);
  if (Math.abs(fps - 30) > 0.01) blockers.push(`Video frame rate must be 30fps, found ${fps}.`);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) blockers.push('Video duration is missing or invalid.');
  if (Math.abs(durationSeconds - Number(renderReceipt.video.durationSeconds)) > 0.05) blockers.push('Video duration differs from the render receipt.');
  if (Number(video?.nb_frames) !== Number(renderReceipt.video.frameCount)) blockers.push('Video frame count differs from the render receipt.');
  if (blockers.length) throw new Error(`Internal-review media contract failed: ${blockers.join(' ')}`);

  await fs.mkdir(qaDir, {recursive: true});
  await fs.writeFile(ffprobePath, stableJson(probe), 'utf8');
  const nullTarget = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const [decodeResult, blackResult, loudnessResult] = await Promise.all([
    run('ffmpeg.exe', ['-v', 'error', '-i', videoPath, '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
    run('ffmpeg.exe', ['-hide_banner', '-i', videoPath, '-vf', 'blackdetect=d=0.5:pix_th=0.10', '-an', '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
    run('ffmpeg.exe', ['-hide_banner', '-i', videoPath, '-filter_complex', 'ebur128=peak=true', '-f', 'null', nullTarget], {
      windowsHide: true, timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024,
    }),
  ]);
  await fs.writeFile(decodeLogPath, decodeResult.stderr || '', 'utf8');

  const blackSegments = extractMatches(
    blackResult.stderr,
    /black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g,
    (match) => ({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])}),
  );
  const integratedMatches = [...loudnessResult.stderr.matchAll(/I:\s*(-?[\d.]+)\s*LUFS/g)];
  const peakMatches = [...loudnessResult.stderr.matchAll(/Peak:\s*(-?[\d.]+)\s*dBFS/g)];
  const integratedLufs = integratedMatches.length ? Number(integratedMatches.at(-1)[1]) : null;
  const truePeakDbfs = peakMatches.length ? Number(peakMatches.at(-1)[1]) : null;
  if (blackSegments.length) throw new Error(`Unexpected black segment detected: ${JSON.stringify(blackSegments)}`);
  if (integratedLufs === null || integratedLufs < -18 || integratedLufs > -12) {
    throw new Error(`Integrated loudness is outside the internal-review profile: ${integratedLufs} LUFS.`);
  }
  if (truePeakDbfs === null || truePeakDbfs > -1) {
    throw new Error(`True peak exceeds the internal-review ceiling: ${truePeakDbfs} dBFS.`);
  }

  const frameDirectory = path.join(projectDir, 'renders', 'qa-frames');
  const frameTimes = {
    start: Math.min(2, durationSeconds / 4),
    middle: durationSeconds / 2,
    end: Math.max(0, durationSeconds - 0.5),
  };
  await fs.mkdir(frameDirectory, {recursive: true});
  const frameFiles = [];
  for (const [label, timeSeconds] of Object.entries(frameTimes)) {
    const framePath = path.join(frameDirectory, `delivery-${label}.png`);
    await run('ffmpeg.exe', [
      '-v', 'error', '-ss', String(timeSeconds), '-i', videoPath, '-frames:v', '1', '-y', framePath,
    ], {windowsHide: true, timeout: 60_000, maxBuffer: 20 * 1024 * 1024});
    frameFiles.push(framePath);
  }
  const frames = await Promise.all(frameFiles.map((filePath) => frameReceipt(projectDir, filePath)));
  const deliveryStillRoot = path.join(qaDir, 'stills');
  await fs.mkdir(deliveryStillRoot, {recursive: true});
  await Promise.all(frameFiles.map((filePath) => fs.copyFile(filePath, path.join(deliveryStillRoot, path.basename(filePath)))));
  const videoStats = await fs.stat(videoPath);
  const coverStats = await fs.stat(coverPath);
  const qa = {
    schemaVersion: 'autovideo-internal-review-delivery/v1',
    projectId,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/finalize-internal-review.mjs',
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    machine: {status: 'passed'},
    composition: {
      path: 'production/hyperframes',
      digest: composition.digest,
      fileCount: composition.files.length,
      buildReceipt: {path: portable(path.relative(projectDir, buildPath)), sha256: buildSha256},
      hyperframesCheck: {path: portable(path.relative(projectDir, checkPath)), sha256: checkSha256},
    },
    renderReceipt: {path: portable(path.relative(projectDir, renderReceiptPath)), sha256: renderReceiptSha256},
    video: {
      path: portable(path.relative(projectDir, videoPath)),
      sha256: videoSha256,
      bytes: videoStats.size,
      durationSeconds,
      width: Number(video.width),
      height: Number(video.height),
      fps,
      frameCount: Number(video.nb_frames),
      videoCodec: video.codec_name,
      audioCodec: audio.codec_name,
      pixelFormat: video.pix_fmt,
      colorSpace: video.color_space,
    },
    cover: {path: portable(path.relative(projectDir, coverPath)), sha256: coverSha256, bytes: coverStats.size},
    ffprobe: {path: portable(path.relative(projectDir, ffprobePath)), sha256: await sha256File(ffprobePath)},
    fullDecode: {
      status: 'passed',
      command: 'ffmpeg -v error -i <internal-review.mp4> -f null <null-device>',
      log: {path: portable(path.relative(projectDir, decodeLogPath)), sha256: await sha256File(decodeLogPath)},
    },
    diagnostics: {blackSegments, loudness: {integratedLufs, truePeakDbfs}},
    sampledFrames: frames,
    humanGates: {
      listening: 'pending',
      subtitleReview: 'pending',
      screenTextReview: 'pending',
      studioFinalReview: 'pending',
      publicationRights: 'pending',
    },
    notes: 'Machine-verified internal-review video. This receipt does not imply human approval or public-release clearance.',
  };
  await fs.writeFile(qaPath, stableJson(qa), 'utf8');
  const deliveryReportPath = path.join(qaDir, 'delivery-report.json');
  const deliveryReport = {
    schemaVersion: 'autovideo-delivery-qa/v2',
    projectId,
    output: portable(path.relative(root, videoPath)),
    outputSha256: videoSha256,
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    checkedAt: qa.generatedAt,
    ok: true,
    blockers: [],
    warnings: [],
    ffprobe: probe,
    loudness: {integratedLufs, truePeakDbfs},
    blackSegments,
    silenceSegments: [],
    freezeSegments: [],
    reviewFrameTimes: {cover: frameTimes.start, ...frameTimes},
    internalReviewReceipt: {
      path: portable(path.relative(projectDir, qaPath)),
      sha256: await sha256File(qaPath),
      machineStatus: qa.machine.status,
    },
    reviewFrames: [
      portable(path.relative(projectDir, coverPath)),
      ...frameFiles.map((filePath) => portable(path.relative(projectDir, path.join(deliveryStillRoot, path.basename(filePath))))),
    ],
    deliveryManifest: 'delivery/delivery-manifest.json',
    scope: 'Current-video machine media QA plus freshly extracted deterministic review frames.',
    okForInternalReview: true,
    okForPublicRelease: false,
    releaseBlockers: [
      'Human listening and full-picture acceptance are pending.',
      'The internal-review artifact is not cleared for public release.',
    ],
  };
  await fs.writeFile(deliveryReportPath, stableJson(deliveryReport), 'utf8');
  const status = await syncProjectSopStatus(projectId);
  return {qaPath, qa, status};
};

if (import.meta.url === `file://${portable(process.argv[1] ?? '')}` || path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await finalizeInternalReview(args.project);
    console.log(JSON.stringify({
      ok: true,
      projectId: result.qa.projectId,
      technicalVideoGenerationReady: result.status.readiness.technicalVideoGenerationReady,
      releasePhase: result.status.release.phase,
      video: result.qa.video,
      qaReceipt: portable(path.relative(root, result.qaPath)),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
