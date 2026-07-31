import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  appendMediaLedgerRecords,
  loadMediaLedger,
  writeMediaIndex,
} from '../../tools/hyperframes-production/lib/media-ledger.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, '..', '..');
const registryPath = path.join(workspaceRoot, 'style-library', 'assets', 'ASSET_REGISTRY.json');
const importLocks = new Map();
const shaPattern = /^[a-f0-9]{64}$/;
const importableMediaDirectories = new Map([
  ['sfx', '.media/audio/sfx'],
  ['image', '.media/images'],
  ['icon', '.media/images/icons'],
  ['logo', '.media/images/logos'],
  ['brand', '.media/images/brand'],
]);

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const resolveWorkspaceSource = (relativePath) => {
  if (typeof relativePath !== 'string' || /^(?:[a-z]+:)?\/\//i.test(relativePath)) {
    throw new Error('Asset library sources must be local workspace paths.');
  }
  const source = path.resolve(workspaceRoot, relativePath);
  const rootPrefix = `${workspaceRoot.toLowerCase()}${path.sep}`;
  if (source !== workspaceRoot && !source.toLowerCase().startsWith(rootPrefix)) {
    throw new Error('Asset library source leaves the workspace.');
  }
  return source;
};

const readRegistry = async () => {
  const registry = await readJson(registryPath);
  if (registry?.schemaVersion !== 'autovideo-asset-registry/v1') throw new Error('Unsupported asset library schema version.');
  if (registry?.policy?.allowRemoteAtRender !== false || registry?.policy?.requireSha256 !== true) {
    throw new Error('Asset library policy must require local, hash-bound assets.');
  }
  const assets = [...(registry.assets ?? []), ...(registry.motionComponents ?? [])];
  const byId = new Map();
  for (const asset of assets) {
    if (!asset?.id || byId.has(asset.id)) throw new Error(`Duplicate asset library id: ${asset?.id ?? '(missing)'}`);
    if (!shaPattern.test(asset.sha256 ?? '')) throw new Error(`Asset ${asset.id} has no valid SHA-256 receipt.`);
    byId.set(asset.id, asset);
  }
  return {registry, assets, byId};
};

const publicAsset = (asset, sourceStatus = {}) => ({
  id: asset.id,
  type: asset.type,
  path: asset.path,
  sha256: asset.sha256,
  bytes: asset.bytes ?? null,
  durationSeconds: asset.durationSeconds ?? null,
  description: asset.description ?? asset.id,
  provider: asset.provider ?? null,
  license: asset.license ?? null,
  licenseReceipt: asset.licenseReceipt ?? null,
  aliases: asset.aliases ?? [],
  semanticRoles: asset.semanticRoles ?? [],
  recipeIds: asset.recipeIds ?? [],
  status: asset.status ?? 'available',
  sourceReady: sourceStatus.sourceReady ?? null,
  sourceShaMatches: sourceStatus.sourceShaMatches ?? null,
});

export const listAssetLibrary = async ({type = null} = {}) => {
  const {assets} = await readRegistry();
  const filtered = assets.filter((asset) => !type || asset.type === type);
  return Promise.all(filtered.map(async (asset) => {
    const source = resolveWorkspaceSource(asset.path);
    try {
      const actual = await sha256File(source);
      return publicAsset(asset, {sourceReady: true, sourceShaMatches: actual === asset.sha256});
    } catch {
      return publicAsset(asset, {sourceReady: false, sourceShaMatches: false});
    }
  }));
};

const importOne = async ({projectRoot, assetId}) => {
  const {registry, byId} = await readRegistry();
  const asset = byId.get(assetId);
  if (!asset) throw new Error(`Unknown asset library item: ${assetId}`);
  const targetDirectory = importableMediaDirectories.get(asset.type);
  if (!targetDirectory) throw new Error(`Asset library item ${assetId} is not importable media.`);
  const source = resolveWorkspaceSource(asset.path);
  const sourceHash = await sha256File(source);
  if (sourceHash !== asset.sha256) throw new Error(`Asset library hash mismatch for ${assetId}.`);

  const ledger = await loadMediaLedger(projectRoot);
  const existing = ledger.records.find((record) => record.type === asset.type && record.sha256 === asset.sha256);
  if (existing) {
    await writeMediaIndex(projectRoot, ledger.records);
    return {libraryId: registry.libraryId, libraryVersion: registry.version, asset: publicAsset(asset), projectAssetId: existing.id, reused: true};
  }

  const extension = path.extname(source).toLowerCase() || '.bin';
  const relativeMediaPath = `${targetDirectory}/${asset.id}${extension}`;
  const target = path.resolve(projectRoot, relativeMediaPath);
  const projectPrefix = `${path.resolve(projectRoot).toLowerCase()}${path.sep}`;
  if (!target.toLowerCase().startsWith(projectPrefix)) throw new Error('Imported asset leaves the formal project.');
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL).catch(async (error) => {
    if (error?.code !== 'EEXIST') throw error;
    const existingHash = await sha256File(target);
    if (existingHash !== asset.sha256) throw new Error(`Project asset path ${relativeMediaPath} already contains different bytes.`);
  });
  const copiedHash = await sha256File(target);
  if (copiedHash !== asset.sha256) throw new Error(`Copied asset hash mismatch for ${assetId}.`);

  const record = {
    id: asset.id,
    type: asset.type,
    path: relativeMediaPath,
    sha256: asset.sha256,
    source: 'local-asset-library',
    description: asset.description,
    provider: asset.provider,
    license: asset.license,
    licenseReceipt: asset.licenseReceipt,
    provenance: {
      provider: asset.provider,
      libraryId: registry.libraryId,
      libraryVersion: registry.version,
      sourcePath: asset.path,
      sourceSha256: asset.sha256,
    },
  };
  const validated = await appendMediaLedgerRecords(projectRoot, [record]);
  if (!validated.byId.has(asset.id)) throw new Error(`Imported asset ${assetId} was not accepted by the project media ledger.`);
  return {libraryId: registry.libraryId, libraryVersion: registry.version, asset: publicAsset(asset), projectAssetId: asset.id, reused: false};
};

export const importAssetToProject = async ({projectRoot, assetId}) => {
  const key = `${path.resolve(projectRoot)}:${assetId}`;
  const previous = importLocks.get(key) ?? Promise.resolve();
  const next = previous.then(() => importOne({projectRoot, assetId}));
  const tracked = next.catch(() => undefined);
  importLocks.set(key, tracked);
  try {
    return await next;
  } finally {
    if (importLocks.get(key) === tracked) importLocks.delete(key);
  }
};

export const assetLibraryPaths = {registryPath};
