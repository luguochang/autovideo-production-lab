import crypto from 'node:crypto';
import {lstat, mkdir, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './common.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
const ledgerWriteLocks = new Map();

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

export const mediaProviderFor = (record) => record.provider
  ?? record.provenance?.provider
  ?? null;

export const mediaLicenseReceiptFor = (record) => record.licenseReceipt
  ?? record.license
  ?? record.provenance?.licenseReceipt
  ?? record.provenance?.license
  ?? null;

export function parseMediaLedger(raw, sourceLabel = '.media/manifest.jsonl') {
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid ${sourceLabel} line ${index + 1}: ${error.message}`);
    }
  });
}

export function validateMediaLedgerRecords(records) {
  const byId = new Map();
  const byContent = new Map();

  for (const [index, record] of records.entries()) {
    const label = `Media ledger record ${index + 1}`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`${label} must be an object.`);
    }
    if (!ID_PATTERN.test(record.id ?? '')) throw new Error(`${label} has an invalid id.`);
    if (!nonEmpty(record.type)) throw new Error(`${label} requires type.`);
    if (!nonEmpty(record.path)) throw new Error(`${label} requires path.`);
    const normalizedPath = record.path.replaceAll('\\', '/');
    if (!normalizedPath.startsWith('.media/') || normalizedPath.includes('/../')) {
      throw new Error(`Media ${record.id} must stay under the project .media directory.`);
    }
    if (!SHA256_PATTERN.test(record.sha256 ?? '')) {
      throw new Error(`Media ${record.id} is missing a lowercase SHA-256 receipt.`);
    }
    if (!nonEmpty(mediaProviderFor(record))) {
      throw new Error(`Media ${record.id} is missing provider provenance.`);
    }
    if (!nonEmpty(mediaLicenseReceiptFor(record))) {
      throw new Error(`Media ${record.id} is missing a license receipt.`);
    }
    if (byId.has(record.id)) throw new Error(`Duplicate media ledger ID: ${record.id}`);

    const contentKey = `${record.type}:${record.sha256}`;
    const duplicate = byContent.get(contentKey);
    if (duplicate) {
      throw new Error(`Duplicate media content ${record.sha256}: ${duplicate.id} and ${record.id}. Reuse the canonical asset id.`);
    }
    byId.set(record.id, record);
    byContent.set(contentKey, record);
  }

  return {byId, byContent};
}

const indexCell = (value) => String(value ?? '-')
  .replace(/\r?\n/g, ' ')
  .replaceAll('|', '\\|')
  .trim() || '-';

const durationForIndex = (record) => {
  const duration = Number(record.durationSeconds ?? record.duration);
  return Number.isFinite(duration) && duration > 0 ? `${Number(duration.toFixed(3))}s` : '-';
};

const dimensionsForIndex = (record) => {
  const width = Number(record.width ?? record.dimensions?.width);
  const height = Number(record.height ?? record.dimensions?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? `${width}x${height}`
    : '-';
};

export function renderMediaIndex(records) {
  validateMediaLedgerRecords(records);
  const noun = records.length === 1 ? 'asset' : 'assets';
  const rows = records.map((record) => (
    `| ${indexCell(record.id)} | ${indexCell(record.type)} | ${durationForIndex(record)} | ${dimensionsForIndex(record)} | ${indexCell(record.path)} | ${indexCell(record.description ?? record.id)} |`
  ));
  return [
    `# .media - ${records.length} ${noun}`,
    '',
    '| id | type | duration | dimensions | path | description |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

const readOptionalBytes = async (filePath) => {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const writeAtomicText = async (filePath, content) => {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.tmp-${crypto.randomUUID()}`;
  await writeFile(temporaryPath, content, 'utf8');
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await writeFile(filePath, content, 'utf8');
    await rm(temporaryPath, {force: true});
  }
};

const restoreFile = async (filePath, bytes) => {
  if (bytes == null) {
    await rm(filePath, {force: true});
    return;
  }
  await writeFile(filePath, bytes);
};

export async function writeMediaIndex(projectDir, records = null) {
  const resolvedRecords = records ?? (await loadMediaLedger(projectDir)).records;
  const target = path.join(projectDir, '.media', 'index.md');
  await writeAtomicText(target, renderMediaIndex(resolvedRecords));
  return target;
}

const withLedgerWriteLock = async (projectDir, operation) => {
  const key = path.resolve(projectDir).toLowerCase();
  const previous = ledgerWriteLocks.get(key) ?? Promise.resolve();
  const next = previous.then(operation);
  const tracked = next.catch(() => undefined);
  ledgerWriteLocks.set(key, tracked);
  try {
    return await next;
  } finally {
    if (ledgerWriteLocks.get(key) === tracked) ledgerWriteLocks.delete(key);
  }
};

export async function appendMediaLedgerRecords(projectDir, additions) {
  if (!Array.isArray(additions)) throw new Error('Media ledger additions must be an array.');
  return withLedgerWriteLock(projectDir, async () => {
    const ledger = await loadMediaLedger(projectDir);
    if (!additions.length) {
      await writeMediaIndex(projectDir, ledger.records);
      return ledger;
    }
    const records = [...ledger.records, ...additions];
    validateMediaLedgerRecords(records);
    const manifestPath = path.join(projectDir, '.media', 'manifest.jsonl');
    const indexPath = path.join(projectDir, '.media', 'index.md');
    const [previousManifest, previousIndex] = await Promise.all([
      readOptionalBytes(manifestPath),
      readOptionalBytes(indexPath),
    ]);
    try {
      const manifest = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
      await writeAtomicText(manifestPath, manifest);
      await writeAtomicText(indexPath, renderMediaIndex(records));
      return await loadMediaLedger(projectDir);
    } catch (error) {
      await Promise.all([
        restoreFile(manifestPath, previousManifest),
        restoreFile(indexPath, previousIndex),
      ]);
      throw error;
    }
  });
}

const resolveSafeMediaPath = (projectDir, record) => {
  if (/^(?:[a-z]+:)?\/\//i.test(record.path)) {
    throw new Error(`Media ${record.id} must be frozen locally before production.`);
  }
  const root = path.resolve(projectDir);
  const source = path.resolve(root, record.path);
  if (source === root || !source.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Media ${record.id} leaves the formal project.`);
  }
  return source;
};

export async function loadMediaLedger(projectDir) {
  const ledgerPath = path.join(projectDir, '.media', 'manifest.jsonl');
  let raw;
  try {
    raw = await readFile(ledgerPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return {ledgerPath, records: [], byId: new Map(), byContent: new Map()};
    throw error;
  }

  const records = parseMediaLedger(raw);
  const indexes = validateMediaLedgerRecords(records);
  const mediaRoot = path.join(path.resolve(projectDir), '.media');
  const realMediaRoot = await realpath(mediaRoot);
  for (const record of records) {
    const source = resolveSafeMediaPath(projectDir, record);
    const fileStat = await lstat(source).catch((error) => {
      if (error?.code === 'ENOENT') throw new Error(`Media ${record.id} points to a missing file: ${record.path}`);
      throw error;
    });
    if (fileStat.isSymbolicLink()) throw new Error(`Media ${record.id} cannot be a symbolic link.`);
    if (!fileStat.isFile()) throw new Error(`Media ${record.id} must point to a file.`);
    const realSource = await realpath(source);
    const realRelative = path.relative(realMediaRoot, realSource);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new Error(`Media ${record.id} resolves outside the project .media directory.`);
    }
    const actualSha256 = await sha256(source);
    if (actualSha256 !== record.sha256) {
      throw new Error(`Media ledger hash mismatch for ${record.id}: expected ${record.sha256}, got ${actualSha256}.`);
    }
  }

  return {...indexes, ledgerPath, records};
}

export function safeMediaSource(projectDir, record) {
  return resolveSafeMediaPath(projectDir, record);
}
