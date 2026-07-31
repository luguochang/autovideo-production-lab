import fs from 'node:fs/promises';
import path from 'node:path';
import {execa} from 'execa';

const isFile = async (target) => {
  try {
    const stat = await fs.stat(target);
    return stat.isFile();
  } catch {
    return false;
  }
};

const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

const installerPlatform = () => {
  if (process.platform === 'win32' && process.arch === 'x64') return 'win32-x64';
  return `${process.platform}-${process.arch}`;
};

const bundledFfprobeCandidates = ({workspaceRoot}) => {
  const platform = process.platform;
  const arch = process.arch;
  const candidates = [path.join(workspaceRoot, 'node_modules', '@ffprobe-installer', installerPlatform(), ffprobeName)];
  if (platform === 'win32' && arch === 'x64') {
    candidates.push(path.join(workspaceRoot, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', ffprobeName));
  }
  return candidates;
};

const bundledFfmpegCandidates = ({workspaceRoot}) => {
  const candidates = [path.join(workspaceRoot, 'node_modules', '@ffmpeg-installer', installerPlatform(), ffmpegName)];
  if (process.platform === 'win32' && process.arch === 'x64') {
    candidates.push(path.join(workspaceRoot, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', ffmpegName));
  }
  return candidates;
};

export const ffprobeCandidates = ({workspaceRoot, env = process.env} = {}) => {
  const explicit = [env.AUTOVIDEO_FFPROBE, env.FFPROBE_PATH].filter(Boolean).map((value) => path.resolve(String(value)));
  return [...new Set([...explicit, ...bundledFfprobeCandidates({workspaceRoot})])];
};

const pathProbes = new Map();
const canRunFromPath = async (executable) => {
  if (!pathProbes.has(executable)) {
    pathProbes.set(executable, execa(executable, ['-version'], {timeout: 3_000, windowsHide: true})
      .then(() => true)
      .catch(() => false));
  }
  return pathProbes.get(executable);
};

export async function resolveFfprobe({workspaceRoot, env = process.env} = {}) {
  const explicit = [env.AUTOVIDEO_FFPROBE, env.FFPROBE_PATH].filter(Boolean).map((value) => path.resolve(String(value)));
  for (const candidate of explicit) {
    if (await isFile(candidate)) return {path: candidate, source: 'explicit'};
  }
  if (await canRunFromPath(ffprobeName)) return {path: ffprobeName, source: 'PATH'};
  for (const candidate of bundledFfprobeCandidates({workspaceRoot})) {
    if (await isFile(candidate)) return {path: candidate, source: 'workspace-bundled'};
  }
  return null;
}

export async function resolveFfmpeg({workspaceRoot, env = process.env} = {}) {
  const explicit = [env.AUTOVIDEO_FFMPEG, env.FFMPEG_PATH].filter(Boolean).map((value) => path.resolve(String(value)));
  for (const candidate of explicit) {
    if (await isFile(candidate)) return {path: candidate, source: 'explicit'};
  }
  if (await canRunFromPath(ffmpegName)) return {path: ffmpegName, source: 'PATH'};
  for (const candidate of bundledFfmpegCandidates({workspaceRoot})) {
    if (await isFile(candidate)) return {path: candidate, source: 'workspace-bundled'};
  }
  return null;
}
