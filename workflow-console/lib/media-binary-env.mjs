import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {resolveFfmpeg, resolveFfprobe} from './ffprobe-resolver.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function ensureMediaBinaryEnvironment({env = process.env} = {}) {
  const [ffprobe, ffmpeg] = await Promise.all([
    resolveFfprobe({workspaceRoot, env}),
    resolveFfmpeg({workspaceRoot, env}),
  ]);
  if (!ffprobe || !ffmpeg) return {available: false, ffprobe, ffmpeg, directories: []};
  const directories = [...new Set([ffprobe.path, ffmpeg.path].filter(path.isAbsolute).map((target) => path.dirname(target)))];
  const delimiter = process.platform === 'win32' ? ';' : ':';
  const pathEntries = String(env.PATH ?? '').split(delimiter).filter(Boolean);
  const missing = directories.filter((directory) => !pathEntries.some((entry) => path.resolve(entry).toLowerCase() === directory.toLowerCase()));
  if (missing.length) env.PATH = [...missing, ...pathEntries].join(delimiter);
  if (path.isAbsolute(ffprobe.path)) env.AUTOVIDEO_FFPROBE ??= ffprobe.path;
  if (path.isAbsolute(ffmpeg.path)) env.AUTOVIDEO_FFMPEG ??= ffmpeg.path;
  return {available: true, ffprobe, ffmpeg, directories};
}

await ensureMediaBinaryEnvironment();
