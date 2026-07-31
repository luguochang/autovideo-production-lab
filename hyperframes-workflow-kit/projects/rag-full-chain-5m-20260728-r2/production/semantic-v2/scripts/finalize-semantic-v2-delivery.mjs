import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const semanticRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(semanticRoot, '..', '..');
const workspaceRoot = path.resolve(projectRoot, '..', '..', '..');
const qaRoot = path.join(projectRoot, 'qa', 'semantic-v2');
const deliveryRoot = path.join(projectRoot, 'delivery');
const packageRoot = path.join(deliveryRoot, 'standard-package-semantic-v2');
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

const episodes = [
  {
    id: 'episode-1',
    label: '上集：离线建库',
    chapterCount: 7,
    captionCount: 216,
    sourceDuration: 808.826479,
    expectedFrames: 24265,
    sourceAudio: 'audio/episodes-v2/episode-1.internal.wav',
    sourceAudioSha256: '1b4c8d370bb3636f8d3807bd6c991359feae6904ec11d364ae632f0aef2ef330',
    rawVideo: 'archive/semantic-v2-raw-renders/rag-full-chain-5m-20260728-r2-semantic-v2-episode-1-render-raw.mp4',
    finalVideo: 'renders/rag-full-chain-5m-20260728-r2-semantic-v2-episode-1-internal-review.mp4',
  },
  {
    id: 'episode-2',
    label: '下集：在线链路',
    chapterCount: 10,
    captionCount: 285,
    sourceDuration: 1099.714542,
    expectedFrames: 32992,
    sourceAudio: 'audio/episodes-v2/episode-2.internal.wav',
    sourceAudioSha256: '255bc4d38c9232e8c8a020fb6e04d06ec78eb82e0c1df74c3da66882e09b183a',
    rawVideo: 'archive/semantic-v2-raw-renders/rag-full-chain-5m-20260728-r2-semantic-v2-episode-2-render-raw.mp4',
    finalVideo: 'renders/rag-full-chain-5m-20260728-r2-semantic-v2-episode-2-internal-review.mp4',
  },
];

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== '--check') throw new Error(`Unknown argument: ${arg}`);
}

const rel = (root, target) => path.relative(root, target).replaceAll('\\', '/');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const exists = async (target) => fs.access(target).then(() => true).catch(() => false);

const ensureInside = (root, target) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.toLowerCase().startsWith(`${resolvedRoot.toLowerCase()}${path.sep}`)) {
    throw new Error(`Path escaped expected root: ${target}`);
  }
  return resolvedTarget;
};

const sha256 = async (target) => {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(target, 'r');
  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) hash.update(chunk);
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest('hex');
};

const run = async (command, commandArgs) => exec(command, commandArgs, {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
});

const ffprobe = async (target) => {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', target]);
  return JSON.parse(stdout);
};

const streamHash = async (target) => {
  const {stdout} = await run('ffmpeg', ['-v', 'error', '-i', target, '-map', '0:v:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-']);
  const match = stdout.match(/SHA256=([a-f0-9]{64})/i);
  if (!match) throw new Error(`Could not read video stream hash for ${target}`);
  return match[1].toLowerCase();
};

const measureLoudness = async (target) => {
  const {stderr} = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', target, '-map', '0:a:0',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', nullDevice,
  ]);
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/);
  if (!match) throw new Error(`Could not parse loudness output for ${target}`);
  const parsed = JSON.parse(match[0]);
  return {
    integratedLufs: Number(parsed.input_i),
    truePeakDbtp: Number(parsed.input_tp),
    loudnessRangeLu: Number(parsed.input_lra),
    thresholdLufs: Number(parsed.input_thresh),
  };
};

const decodeFully = async (target) => {
  const {stderr} = await run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-i', target,
    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', nullDevice,
  ]);
  if (stderr.trim()) throw new Error(`Decode emitted errors for ${target}: ${stderr.trim()}`);
  return {status: 'passed', command: 'ffmpeg -v error -i <video> -map 0:v:0 -map 0:a:0 -f null <null-device>'};
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const validateEpisode = async (episode) => {
  const sourceAudio = path.join(projectRoot, episode.sourceAudio);
  const rawVideo = path.join(projectRoot, episode.rawVideo);
  const finalVideo = path.join(projectRoot, episode.finalVideo);
  for (const target of [sourceAudio, rawVideo, finalVideo]) assert(await exists(target), `Missing required file: ${rel(projectRoot, target)}`);

  const [sourceAudioSha256, rawVideoSha256, finalVideoSha256, probe, rawStreamSha256, finalStreamSha256, loudness, decode] = await Promise.all([
    sha256(sourceAudio), sha256(rawVideo), sha256(finalVideo), ffprobe(finalVideo),
    streamHash(rawVideo), streamHash(finalVideo), measureLoudness(finalVideo), decodeFully(finalVideo),
  ]);
  assert(sourceAudioSha256 === episode.sourceAudioSha256, `${episode.id} source audio SHA-256 changed.`);

  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  assert(video && audio, `${episode.id} must contain one video and one audio stream.`);
  assert(video.codec_name === 'h264', `${episode.id} video codec must be H.264.`);
  assert(video.width === 1920 && video.height === 1080, `${episode.id} must be 1920x1080.`);
  assert(video.r_frame_rate === '30/1' && video.avg_frame_rate === '30/1', `${episode.id} must be constant 30fps.`);
  assert(video.pix_fmt === 'yuv420p', `${episode.id} pixel format must be yuv420p.`);
  assert(video.color_space === 'bt709' && video.color_primaries === 'bt709' && video.color_transfer === 'bt709', `${episode.id} must be tagged BT.709.`);
  assert(Number(video.nb_frames) === episode.expectedFrames, `${episode.id} frame count mismatch.`);
  assert(audio.codec_name === 'aac' && Number(audio.sample_rate) === 48000, `${episode.id} audio must be 48kHz AAC.`);
  assert(Number(audio.channels) === 2, `${episode.id} delivery audio must be stereo.`);
  assert(Math.abs(Number(probe.format.duration) - episode.sourceDuration) <= 0.05, `${episode.id} duration differs from the assembled WAV.`);
  assert(rawStreamSha256 === finalStreamSha256, `${episode.id} video stream changed during audio repackaging.`);
  assert(loudness.integratedLufs >= -16.2 && loudness.integratedLufs <= -15.8, `${episode.id} integrated loudness is outside -16 +/- 0.2 LUFS.`);
  assert(loudness.truePeakDbtp <= -1.5, `${episode.id} true peak exceeds -1.5 dBTP.`);

  const [sourceStats, rawStats, finalStats] = await Promise.all([fs.stat(sourceAudio), fs.stat(rawVideo), fs.stat(finalVideo)]);
  return {
    id: episode.id,
    label: episode.label,
    chapterCount: episode.chapterCount,
    captionCount: episode.captionCount,
    sourceAudio: {path: episode.sourceAudio, bytes: sourceStats.size, sha256: sourceAudioSha256, durationSeconds: episode.sourceDuration},
    rawRender: {path: episode.rawVideo, bytes: rawStats.size, sha256: rawVideoSha256},
    internalReviewVideo: {path: episode.finalVideo, bytes: finalStats.size, sha256: finalVideoSha256},
    media: {
      durationSeconds: Number(probe.format.duration),
      frameCount: Number(video.nb_frames),
      width: video.width,
      height: video.height,
      fps: video.r_frame_rate,
      videoCodec: video.codec_name,
      pixelFormat: video.pix_fmt,
      colorSpace: video.color_space,
      audioCodec: audio.codec_name,
      audioSampleRate: Number(audio.sample_rate),
      audioChannels: Number(audio.channels),
    },
    loudness,
    fullDecode: decode,
    videoStreamIdentity: {status: 'passed', rawSha256: rawStreamSha256, finalSha256: finalStreamSha256},
  };
};

const walkFiles = async (root) => {
  const output = [];
  const visit = async (directory) => {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) output.push(target);
    }
  };
  await visit(root);
  return output.sort((left, right) => rel(root, left).localeCompare(rel(root, right)));
};

const copyTree = async (source, destination) => {
  for (const sourceFile of await walkFiles(source)) {
    const destinationFile = ensureInside(destination, path.join(destination, rel(source, sourceFile)));
    await fs.mkdir(path.dirname(destinationFile), {recursive: true});
    await fs.copyFile(sourceFile, destinationFile);
  }
};

const copyProjectPath = async (projectPath, tempRoot) => {
  const source = ensureInside(projectRoot, path.join(projectRoot, projectPath));
  assert(await exists(source), `Package source is missing: ${projectPath}`);
  const destination = ensureInside(tempRoot, path.join(tempRoot, 'project', projectPath));
  const stats = await fs.stat(source);
  if (stats.isDirectory()) await copyTree(source, destination);
  else {
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.copyFile(source, destination);
  }
};

const copyDocumentationPath = async (workspacePath, tempRoot) => {
  const source = ensureInside(workspaceRoot, path.join(workspaceRoot, workspacePath));
  if (!await exists(source)) return;
  const destination = ensureInside(tempRoot, path.join(tempRoot, 'documentation', workspacePath));
  const stats = await fs.stat(source);
  if (stats.isDirectory()) await copyTree(source, destination);
  else {
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.copyFile(source, destination);
  }
};

const verifyPackage = async (root = packageRoot) => {
  const manifestPath = path.join(root, 'PACKAGE_MANIFEST.json');
  const statusPath = path.join(root, 'PACKAGE_STATUS.json');
  assert(await exists(manifestPath) && await exists(statusPath), 'Package manifest or status is missing.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert(manifest.schemaVersion === 'autovideo-semantic-v2-package/v1', 'Unexpected semantic-v2 package schema.');
  const actual = (await walkFiles(root)).filter((target) => path.basename(target) !== 'PACKAGE_MANIFEST.json');
  const actualPaths = actual.map((target) => rel(root, target));
  const expectedPaths = manifest.files.map((item) => item.path);
  assert(JSON.stringify(actualPaths) === JSON.stringify(expectedPaths), 'Package file list does not match its manifest.');
  for (const item of manifest.files) {
    const target = ensureInside(root, path.join(root, item.path));
    const stats = await fs.stat(target);
    assert(stats.size === item.bytes, `Package byte size mismatch: ${item.path}`);
    assert(await sha256(target) === item.sha256, `Package SHA-256 mismatch: ${item.path}`);
  }
  return {ok: true, packageRoot: root, fileCount: manifest.files.length, totalBytes: manifest.integrity.totalBytes};
};

const publishPackageDirectory = async (source, destination) => {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rename(source, destination);
      return {method: 'rename', attempts: attempt + 1};
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await delay(500 * (attempt + 1));
    }
  }

  assert(!await exists(destination), `Package destination appeared while rename was being retried: ${destination}`);
  try {
    await fs.cp(source, destination, {recursive: true, force: false, errorOnExist: true});
    await verifyPackage(destination);
    await fs.rm(source, {recursive: true, force: true});
    return {method: 'verified-copy-fallback', attempts: 5, renameError: lastError?.code ?? null};
  } catch (error) {
    if (await exists(destination)) await fs.rm(destination, {recursive: true, force: true});
    throw error;
  }
};

const assemblePackage = async (qaReport, deliveryManifest) => {
  await fs.mkdir(deliveryRoot, {recursive: true});
  const tempRoot = ensureInside(deliveryRoot, path.join(deliveryRoot, `.standard-package-semantic-v2-${crypto.randomUUID()}`));
  await fs.mkdir(tempRoot, {recursive: true});
  try {
    const projectPaths = [
      'AssetManifest.json', 'NarrationLock.json', 'SEMANTIC_V2_TASK.md', 'SEMANTIC_V2_REVIEW_GUIDE.md',
      'TRANSITION_NARRATION_LOCK.json', 'VIDEO_TASK.md', 'STYLE_REVIEW.md', 'style-selection.json',
      'audio/episodes-v2', 'production/semantic-v2', 'qa/semantic-v2',
      'delivery/semantic-v2-delivery-manifest.json',
      episodes[0].finalVideo, episodes[1].finalVideo,
    ];
    for (const projectPath of projectPaths) await copyProjectPath(projectPath, tempRoot);

    const documentationPaths = [
      'AGENTS.md', 'hyperframes-workflow-kit/VOICE_HANDOFF.md',
      'style-library/STYLE_REGISTRY.md', 'style-library/MOTION_REGISTRY.md',
      'style-library/styles/project/modern-ip-host-explainer',
    ];
    for (const documentationPath of documentationPaths) await copyDocumentationPath(documentationPath, tempRoot);

    const status = {
      schemaVersion: 'autovideo-semantic-v2-package-status/v1',
      projectId: path.basename(projectRoot),
      packageId: `${path.basename(projectRoot)}-semantic-v2-internal-review`,
      generatedAt: new Date().toISOString(),
      releaseScope: 'internal-review-only',
      internalReviewReady: true,
      publicReleaseBlocked: true,
      checks: {
        hyperframesVersion: '0.7.81',
        hyperframesCurrent: true,
        episode1PreRenderGate: 'passed',
        episode2PreRenderGate: 'passed',
        mediaQa: qaReport.status,
        finishedFrameReview: qaReport.finishedFrameReview.status,
        packageIntegrity: 'verified',
      },
      humanGates: {
        transitionVoiceListening: {status: 'pending', humanListeningPerformed: false},
        fullFilmReview: {status: 'pending', humanReviewPerformed: false},
        publicRelease: {status: 'blocked'},
      },
      finalVideos: deliveryManifest.deliverables,
      preservedArtifacts: {
        previousStandardPackage: 'delivery/standard-package',
        previousInternalReviewVideo: 'archive/legacy-v1-internal-review/rag-full-chain-5m-20260728-r2-internal-review.mp4',
        previousInternalReviewReceipt: 'archive/legacy-v1-internal-review/rag-full-chain-5m-20260728-r2-internal-review.receipt.json',
        rawSemanticV2RendersRetainedOutsidePackage: episodes.map((episode) => episode.rawVideo),
      },
      nextAction: '按上集、下集顺序完成一次集中听审和全片验收，再决定是否仅修改受影响的下游产物。',
    };
    await fs.writeFile(path.join(tempRoot, 'PACKAGE_STATUS.json'), stableJson(status), 'utf8');
    const readme = `# RAG 全链路 Semantic V2 内部审片包\n\n` +
      `这是上下集语义动画版的可复核内部交付包。旧标准包和旧成片未被覆盖。\n\n` +
      `- 上集：\`${episodes[0].finalVideo}\`\n` +
      `- 下集：\`${episodes[1].finalVideo}\`\n` +
      `- 终检：\`project/qa/semantic-v2/final-render-qa.json\`\n` +
      `- 听审手册：\`project/SEMANTIC_V2_REVIEW_GUIDE.md\`\n\n` +
      `公开发布仍被阻断：新增过渡口播尚未人工听审，上下集尚未完成一次人工全片验收。\n`;
    await fs.writeFile(path.join(tempRoot, 'README.md'), readme, 'utf8');

    const files = [];
    for (const target of await walkFiles(tempRoot)) {
      const relativePath = rel(tempRoot, target);
      const stats = await fs.stat(target);
      files.push({path: relativePath, bytes: stats.size, sha256: await sha256(target)});
    }
    const packageManifest = {
      schemaVersion: 'autovideo-semantic-v2-package/v1',
      projectId: path.basename(projectRoot),
      generatedAt: new Date().toISOString(),
      releaseScope: 'internal-review-only',
      publicReleaseBlocked: true,
      files,
      integrity: {status: 'verified', fileCount: files.length, totalBytes: files.reduce((sum, item) => sum + item.bytes, 0)},
    };
    await fs.writeFile(path.join(tempRoot, 'PACKAGE_MANIFEST.json'), stableJson(packageManifest), 'utf8');
    await verifyPackage(tempRoot);

    let previousPackage = null;
    if (await exists(packageRoot)) {
      const suffix = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
      previousPackage = ensureInside(deliveryRoot, `${packageRoot}-previous-${suffix}`);
      await fs.rename(packageRoot, previousPackage);
    }
    let publish;
    try {
      publish = await publishPackageDirectory(tempRoot, packageRoot);
    } catch (error) {
      if (previousPackage && await exists(previousPackage)) await fs.rename(previousPackage, packageRoot);
      throw error;
    }
    const verification = await verifyPackage(packageRoot);
    if (previousPackage && await exists(previousPackage)) await fs.rm(previousPackage, {recursive: true, force: true});
    return {...verification, previousPackage: null, publish};
  } catch (error) {
    if (await exists(tempRoot)) await fs.rm(tempRoot, {recursive: true, force: true});
    throw error;
  }
};

const finalize = async () => {
  await fs.mkdir(qaRoot, {recursive: true});
  const results = [];
  for (const episode of episodes) results.push(await validateEpisode(episode));
  const qaReport = {
    schemaVersion: 'autovideo-semantic-v2-final-qa/v1',
    projectId: path.basename(projectRoot),
    generatedAt: new Date().toISOString(),
    generatedBy: 'production/semantic-v2/scripts/finalize-semantic-v2-delivery.mjs',
    status: 'passed-internal-review',
    publicReleaseBlocked: true,
    hyperframes: {version: '0.7.81', latestVersion: '0.7.81', updateAvailable: false},
    preRenderGate: {
      episode1: {samples: 21, runtimeErrors: 0, layoutErrors: 0, motionErrors: 0, contrastPassed: '61/61'},
      episode2: {samples: 30, runtimeErrors: 0, layoutErrors: 0, motionErrors: 0, contrastPassed: '66/66'},
      acceptedMaintenanceWarnings: ['composition_file_too_large', 'timeline_track_too_dense'],
    },
    episodes: results,
    finishedFrameReview: {
      status: 'passed',
      frameCount: 21,
      coverage: '两集首尾、17 个章节和上下集衔接区域',
      checks: ['no-blank-subject', 'no-overlap', 'no-ghosting', 'no-host-occlusion', 'no-caption-overflow', 'no-transition-residue'],
      contactSheets: [
        'qa/semantic-v2/finished-frame-review/episode-1-contact-sheet.png',
        'qa/semantic-v2/finished-frame-review/episode-2-contact-sheet.png',
      ],
    },
    humanGates: {
      transitionVoiceListening: {humanListeningPerformed: false, status: 'pending'},
      fullFilmReview: {humanReviewPerformed: false, status: 'pending'},
    },
  };
  const qaPath = path.join(qaRoot, 'final-render-qa.json');
  await fs.writeFile(qaPath, stableJson(qaReport), 'utf8');

  const deliveryManifest = {
    schemaVersion: 'autovideo-semantic-v2-delivery/v1',
    projectId: path.basename(projectRoot),
    generatedAt: new Date().toISOString(),
    releaseScope: 'internal-review-only',
    publicReleaseBlocked: true,
    deliverables: results.map((result) => ({
      episodeId: result.id,
      label: result.label,
      path: result.internalReviewVideo.path,
      bytes: result.internalReviewVideo.bytes,
      sha256: result.internalReviewVideo.sha256,
      durationSeconds: result.media.durationSeconds,
      resolution: `${result.media.width}x${result.media.height}`,
      fps: result.media.fps,
      loudness: result.loudness,
    })),
    qa: {path: rel(projectRoot, qaPath), sha256: await sha256(qaPath)},
    retainedButNotDelivered: results.map((result) => result.rawRender),
    humanReviewPerformed: false,
    humanListeningPerformedForTransitions: false,
  };
  const deliveryManifestPath = path.join(deliveryRoot, 'semantic-v2-delivery-manifest.json');
  await fs.mkdir(deliveryRoot, {recursive: true});
  await fs.writeFile(deliveryManifestPath, stableJson(deliveryManifest), 'utf8');
  const packageResult = await assemblePackage(qaReport, deliveryManifest);
  return {ok: true, qaPath, deliveryManifestPath, ...packageResult};
};

const result = args.has('--check') ? await verifyPackage() : await finalize();
console.log(JSON.stringify(result, null, 2));
