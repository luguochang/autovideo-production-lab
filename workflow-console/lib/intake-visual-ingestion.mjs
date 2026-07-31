import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {
  appendMediaLedgerRecords,
  loadMediaLedger,
  writeMediaIndex,
} from '../../tools/hyperframes-production/lib/media-ledger.mjs';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const portable = (value) => value.replaceAll('\\', '/');
const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const canonicalAssetId = (digest) => `image-intake-${digest.slice(0, 16)}`;

const assertExpectedIntake = (receipt, expectedIntake) => {
  if (!expectedIntake) return;
  if (receipt.id !== expectedIntake.id
      || receipt.payload?.sha256 !== expectedIntake.payload?.sha256
      || receipt.payload?.bytes !== expectedIntake.payload?.bytes
      || receipt.payload?.fileCount !== expectedIntake.payload?.fileCount) {
    throw new Error('Content intake submission no longer matches the workbench project receipt.');
  }
};

const validateReceiptShape = (receipt, projectId) => {
  if (receipt?.schemaVersion !== 'autovideo-content-intake-submission/v1') {
    throw new Error('Unsupported content intake submission receipt.');
  }
  if (receipt.projectId !== projectId) throw new Error('Content intake submission belongs to another project.');
  if (!/^[a-f0-9]{64}$/.test(receipt.id ?? '')) throw new Error('Content intake submission has an invalid id.');
  if (!Array.isArray(receipt.payload?.files) || receipt.payload.files.length !== receipt.payload.fileCount) {
    throw new Error('Content intake submission file count is inconsistent.');
  }
  for (const file of receipt.payload.files) {
    if (typeof file?.path !== 'string' || typeof file.relativePath !== 'string'
        || !SHA256_PATTERN.test(file.sha256 ?? '') || !Number.isInteger(file.bytes) || file.bytes < 0) {
      throw new Error('Content intake submission contains an invalid file receipt.');
    }
  }
  if (receipt.payload.hashAlgorithm === 'sha256-manifest-v1') {
    const digest = sha256(receipt.payload.files
      .map((file) => `${file.relativePath}\0${file.sha256}\0${file.bytes}`)
      .join('\n'));
    if (digest !== receipt.payload.sha256) throw new Error('Content intake directory manifest hash is stale.');
  } else if (receipt.payload.files.length === 1 && receipt.payload.files[0].sha256 !== receipt.payload.sha256) {
    throw new Error('Content intake payload hash is inconsistent with its file receipt.');
  }
};

const freezeSubmissionReceipt = async ({projectRoot, sourceBytes, sourceSha256}) => {
  const target = path.join(projectRoot, 'input', 'content-intake', 'submission.json');
  await fs.mkdir(path.dirname(target), {recursive: true});
  try {
    const existing = await fs.readFile(target);
    if (sha256(existing) !== sourceSha256) {
      throw new Error('The formal project is already bound to a different content intake submission. Use a new project revision.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await fs.writeFile(target, sourceBytes);
  }
  return portable(path.relative(projectRoot, target));
};

export async function ingestContentIntakeVisuals({
  workspaceRoot,
  projectRoot,
  projectId,
  submissionReceiptPath,
  expectedIntake = null,
}) {
  const workspace = await fs.realpath(path.resolve(workspaceRoot));
  const sourceReceipt = await fs.realpath(path.resolve(submissionReceiptPath));
  if (!isInside(workspace, sourceReceipt)) throw new Error('Content intake submission receipt leaves the workspace.');
  const submissionDir = path.dirname(sourceReceipt);
  const sourceBytes = await fs.readFile(sourceReceipt);
  const sourceReceiptSha256 = sha256(sourceBytes);
  const receipt = JSON.parse(sourceBytes.toString('utf8'));
  validateReceiptShape(receipt, projectId);
  assertExpectedIntake(receipt, expectedIntake);
  if (path.basename(submissionDir) !== receipt.id) {
    throw new Error('Content intake submission receipt is not stored in its content-addressed directory.');
  }

  const frozenReceiptPath = await freezeSubmissionReceipt({projectRoot, sourceBytes, sourceSha256: sourceReceiptSha256});
  const ledger = await loadMediaLedger(projectRoot);
  const additions = [];
  const assets = [];
  const skipped = [];
  const seenHashes = new Set();

  for (const file of receipt.payload.files) {
    const extension = path.extname(file.relativePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      skipped.push({relativePath: file.relativePath, reason: 'not-a-raster-visual'});
      continue;
    }
    if (seenHashes.has(file.sha256)) continue;
    seenHashes.add(file.sha256);
    const frozenPath = path.resolve(workspace, file.path);
    if (!isInside(workspace, frozenPath) || !isInside(submissionDir, frozenPath)) {
      throw new Error(`Frozen content intake visual leaves its immutable submission: ${file.relativePath}`);
    }
    const stats = await fs.lstat(frozenPath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== file.bytes) {
      throw new Error(`Frozen content intake visual is stale: ${file.relativePath}`);
    }
    const source = await fs.realpath(frozenPath);
    if (!isInside(submissionDir, source)) throw new Error(`Frozen content intake visual resolves outside its immutable submission: ${file.relativePath}`);
    const actualSha256 = await sha256File(source);
    if (actualSha256 !== file.sha256) throw new Error(`Frozen content intake visual hash drifted: ${file.relativePath}`);

    const existing = ledger.byContent.get(`image:${file.sha256}`);
    if (existing) {
      assets.push({assetId: existing.id, sha256: file.sha256, relativePath: file.relativePath, reused: true});
      continue;
    }
    const assetId = canonicalAssetId(file.sha256);
    const conflictingId = ledger.byId.get(assetId) ?? additions.find((record) => record.id === assetId);
    if (conflictingId && conflictingId.sha256 !== file.sha256) {
      throw new Error(`Canonical content intake asset id collision: ${assetId}`);
    }
    const relativeMediaPath = `.media/images/intake/${assetId}${extension}`;
    const target = path.resolve(projectRoot, relativeMediaPath);
    if (!isInside(projectRoot, target)) throw new Error('Content intake visual target leaves the formal project.');
    await fs.mkdir(path.dirname(target), {recursive: true});
    try {
      await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await sha256File(target) !== file.sha256) {
        throw new Error(`Formal media target contains different bytes: ${relativeMediaPath}`);
      }
    }
    if (await sha256File(target) !== file.sha256) throw new Error(`Copied content intake visual hash mismatch: ${file.relativePath}`);
    additions.push({
      id: assetId,
      type: 'image',
      path: relativeMediaPath,
      sha256: file.sha256,
      source: 'content-intake',
      description: `User-provided visual: ${file.relativePath}`,
      provider: 'user-provided',
      license: receipt.source?.license ?? 'user-provided; publication rights not implied',
      licenseReceipt: frozenReceiptPath,
      rightsStatus: 'needs-review',
      provenance: {
        provider: 'user-provided',
        intakeId: receipt.id,
        submissionReceipt: frozenReceiptPath,
        submissionReceiptSha256: sourceReceiptSha256,
        frozenSourcePath: file.path,
        sourceSha256: file.sha256,
      },
    });
    assets.push({assetId, sha256: file.sha256, relativePath: file.relativePath, reused: false});
  }

  if (additions.length) await appendMediaLedgerRecords(projectRoot, additions);
  else await writeMediaIndex(projectRoot, ledger.records);
  const ingestionReceipt = {
    schemaVersion: 'autovideo-content-visual-ingestion/v1',
    projectId,
    intakeId: receipt.id,
    sourceReceipt: {path: frozenReceiptPath, sha256: sourceReceiptSha256},
    policy: {
      autoAttachToShots: false,
      publicationRights: 'needs-review',
      canonicalKey: ['type', 'sha256'],
    },
    assets: assets.map(({reused, ...asset}) => asset),
    skipped,
  };
  const ingestionReceiptPath = path.join(projectRoot, 'input', 'content-intake', 'visual-media-ingestion.json');
  await fs.writeFile(ingestionReceiptPath, `${JSON.stringify(ingestionReceipt, null, 2)}\n`, 'utf8');
  return {
    receipt: ingestionReceipt,
    receiptPath: ingestionReceiptPath,
    importedCount: assets.filter((asset) => !asset.reused).length,
    reusedCount: assets.filter((asset) => asset.reused).length,
  };
}
