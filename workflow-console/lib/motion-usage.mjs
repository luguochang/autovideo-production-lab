import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {hashDirectoryManifest} from './project-store.mjs';

const usageLogRelativePath = 'style-library/motion-library/usage-log.jsonl';

const readLines = async (filePath) => {
  try {
    return (await fs.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};

export const recordMotionUsage = async ({workspaceRoot, formalRoot, projectId, feedback = null}) => {
  const sourceMapPath = path.join(formalRoot, 'production', 'hyperframes', 'data', 'source-map.json');
  let sourceMapBytes;
  let sourceMap;
  try {
    sourceMapBytes = await fs.readFile(sourceMapPath);
    sourceMap = JSON.parse(sourceMapBytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {recorded: false, reason: 'compiled-source-map-missing'};
    throw error;
  }
  if (sourceMap.projectId !== projectId) throw new Error('Compiled source map belongs to another project.');
  const recipes = new Map();
  for (const scene of Object.values(sourceMap.scenes ?? {})) {
    for (const [cueId, directive] of Object.entries(scene.creativeDirectives ?? {})) {
      for (const ref of directive.motionRecipeRefs ?? []) {
      const key = `${ref.libraryId ?? 'unknown'}:${ref.recipeId}@${ref.version}`;
        const current = recipes.get(key) ?? {key, libraryId: ref.libraryId ?? null, libraryVersion: ref.libraryVersion ?? null, recipeId: ref.recipeId, version: ref.version, cueIds: []};
        current.cueIds = [...new Set([...current.cueIds, ...(ref.sourceCueIds ?? [cueId]).filter(Boolean)])];
        recipes.set(key, current);
      }
    }
  }
  if (!recipes.size) return {recorded: false, reason: 'no-motion-recipes'};
  const composition = path.join(formalRoot, 'production', 'hyperframes');
  const manifest = await hashDirectoryManifest(composition);
  const logPath = path.join(workspaceRoot, usageLogRelativePath);
  const existing = await readLines(logPath);
  const usageKey = `${projectId}:${manifest.digest}`;
  const duplicate = existing.find((entry) => entry.usageKey === usageKey);
  if (duplicate) return {recorded: false, reason: 'already-recorded', usageKey, record: duplicate};
  const record = {
    schemaVersion: 'autovideo-motion-usage/v1',
    usageKey,
    projectId,
    compositionDigest: manifest.digest,
    compositionFileCount: manifest.files.length,
    compiledSourceMap: {
      path: 'production/hyperframes/data/source-map.json',
      sha256: crypto.createHash('sha256').update(sourceMapBytes).digest('hex'),
    },
    recipes: [...recipes.values()],
    humanReview: 'pending',
    feedback,
    recordedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(logPath), {recursive: true});
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  const receiptPath = path.join(formalRoot, 'review', 'motion-usage.json');
  await fs.mkdir(path.dirname(receiptPath), {recursive: true});
  await fs.writeFile(receiptPath, `${JSON.stringify({path: usageLogRelativePath, usageKey, record}, null, 2)}\n`, 'utf8');
  return {recorded: true, usageKey, record, receiptPath};
};

export {usageLogRelativePath};
