import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execa} from 'execa';
import {resolveFfprobe} from './ffprobe-resolver.mjs';
import {
  loadMediaLedger,
  mediaLicenseReceiptFor,
  mediaProviderFor,
  safeMediaSource,
} from '../../tools/hyperframes-production/lib/media-ledger.mjs';

const VISUAL_TYPES = new Set(['image', 'icon', 'logo', 'brand']);
const RASTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const VECTOR_EXTENSIONS = new Set(['.svg']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac']);
const MIME_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.svg', 'image/svg+xml'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.flac', 'audio/flac'],
]);
const probeCache = new Map();
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const inspectSafeSvg = async (filePath) => {
  const source = await fs.readFile(filePath, 'utf8');
  const normalized = source.replace(/^\uFEFF/, '').trim();
  if (normalized.length === 0 || normalized.length > 512_000 || !/^<svg\b/i.test(normalized)) {
    return {ok: false, error: 'unsafe-svg', width: null, height: null};
  }
  if (/<\/?(?:script|foreignObject|iframe|object|embed)\b/i.test(normalized)
      || /\son[a-z]+\s*=/i.test(normalized)
      || /(?:href|xlink:href)\s*=\s*["']\s*(?:javascript:|data:|https?:)/i.test(normalized)
      || /url\(\s*["']?\s*(?:javascript:|data:|https?:)/i.test(normalized)) {
    return {ok: false, error: 'unsafe-svg', width: null, height: null};
  }
  const viewBox = normalized.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  return {
    ok: true,
    error: null,
    width: viewBox ? Number(viewBox[1]) : null,
    height: viewBox ? Number(viewBox[2]) : null,
  };
};

const probeFrozenMedia = async (filePath, record) => {
  const cached = probeCache.get(record.sha256);
  if (cached) return cached;
  const promise = (async () => {
    const extension = path.extname(filePath).toLowerCase();
    const extensionAllowed = record.type === 'sfx'
      ? AUDIO_EXTENSIONS.has(extension)
      : VISUAL_TYPES.has(record.type) && (RASTER_EXTENSIONS.has(extension) || VECTOR_EXTENSIONS.has(extension));
    if (!extensionAllowed) {
      return {ok: false, error: 'unsupported-preview-format', mime: null, duration: null, width: null, height: null};
    }
    if (VECTOR_EXTENSIONS.has(extension)) {
      try {
        const vector = await inspectSafeSvg(filePath);
        return {
          ok: vector.ok,
          error: vector.error,
          mime: vector.ok ? MIME_BY_EXTENSION.get(extension) : null,
          duration: null,
          width: vector.width,
          height: vector.height,
        };
      } catch {
        return {ok: false, error: 'unsafe-svg', mime: null, duration: null, width: null, height: null};
      }
    }
    const ffprobe = await resolveFfprobe({workspaceRoot});
    if (!ffprobe) {
      return {ok: false, error: 'ffprobe-unavailable', mime: null, duration: null, width: null, height: null};
    }
    try {
      const result = await execa(ffprobe.path, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ], {timeout: 8_000});
      const parsed = JSON.parse(result.stdout);
      const stream = record.type === 'sfx'
        ? parsed.streams?.find((item) => item.codec_type === 'audio')
        : parsed.streams?.find((item) => item.codec_type === 'video');
      if (!stream) return {ok: false, error: 'media-not-decodable', mime: null, duration: null, width: null, height: null};
      return {
        ok: true,
        error: null,
        mime: MIME_BY_EXTENSION.get(extension) ?? null,
        duration: record.type === 'sfx' ? Number(parsed.format?.duration ?? stream.duration ?? record.duration ?? 0) : null,
        width: VISUAL_TYPES.has(record.type) ? Number(stream.width ?? 0) : null,
        height: VISUAL_TYPES.has(record.type) ? Number(stream.height ?? 0) : null,
      };
    } catch {
      return {ok: false, error: 'media-not-decodable', mime: null, duration: null, width: null, height: null};
    }
  })();
  probeCache.set(record.sha256, promise);
  return promise;
};

const publicAsset = ({record, probe, projectId}) => {
  const provider = mediaProviderFor(record);
  const licenseReceipt = mediaLicenseReceiptFor(record);
  const rightsStatus = record.rightsStatus ?? record.provenance?.rightsStatus ?? 'licensed';
  const rightsReady = Boolean(provider && licenseReceipt);
  const integrityReady = probe.ok;
  const selectionReady = rightsReady && integrityReady;
  return {
    id: record.id,
    type: record.type,
    description: record.description ?? record.id,
    duration: Number.isFinite(probe.duration) ? Number(probe.duration.toFixed(3)) : null,
    width: Number.isFinite(probe.width) && probe.width > 0 ? probe.width : null,
    height: Number.isFinite(probe.height) && probe.height > 0 ? probe.height : null,
    sha256: record.sha256,
    provider,
    licenseReceipt,
    rightsStatus,
    publicationReady: !/needs-review|internal-only/i.test(rightsStatus),
    rightsReady,
    integrityReady,
    selectionReady,
    integrityIssue: probe.error,
    mime: probe.mime,
    fileUrl: selectionReady
      ? `/api/projects/${encodeURIComponent(projectId)}/media-assets/${encodeURIComponent(record.id)}/file`
      : null,
  };
};

export async function readProjectMediaInventory({projectRoot, projectId}) {
  const ledger = await loadMediaLedger(projectRoot);
  const internalAssets = await Promise.all(ledger.records.map(async (record) => {
    const absolutePath = safeMediaSource(projectRoot, record);
    const probe = await probeFrozenMedia(absolutePath, record);
    return {
      ...publicAsset({record, probe, projectId}),
      absolutePath,
      record,
    };
  }));
  return {
    ledger,
    assets: internalAssets,
    byId: new Map(internalAssets.map((asset) => [asset.id, asset])),
  };
}

export const serializeMediaAsset = (asset) => {
  const {absolutePath, record, ...publicFields} = asset;
  return publicFields;
};

export async function resolveProjectMediaFile({projectRoot, projectId, assetId}) {
  if (!/^[a-z][a-z0-9_-]*$/.test(assetId ?? '')) throw new Error('Invalid media asset id.');
  const inventory = await readProjectMediaInventory({projectRoot, projectId});
  const asset = inventory.byId.get(assetId);
  if (!asset || !asset.selectionReady || !asset.fileUrl || !asset.mime) {
    throw new Error('Media asset is not available for preview.');
  }
  return asset;
}
