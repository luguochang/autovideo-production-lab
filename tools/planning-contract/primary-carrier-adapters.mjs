import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
const REMOTE_URL = /(?:https?:)?\/\//i;

const source = (registryItem, file, sha256) => ({
  registryItem,
  path: `vendor/hyperframes/registry/blocks/${registryItem}/${file}`,
  sha256,
});

export const PRIMARY_CARRIER_ADAPTERS = Object.freeze({
  'data-chart-bounded': Object.freeze({
    adapterId: 'data-chart-bounded',
    adapterVersion: '1.0.0',
    visualType: 'data-proof',
    sourceReceipt: 'hf-registry:data-chart@02ccb24bfa21850d',
    sources: [source('data-chart', 'data-chart.html', '02ccb24bfa21850d19c2842853256a3c47d5fd25dc746d6b99986bef268bf027')],
  }),
  'code-surface-bounded': Object.freeze({
    adapterId: 'code-surface-bounded',
    adapterVersion: '1.0.0',
    visualType: 'code-surface',
    sourceReceipt: 'hf-registry:code-diff+code-highlight@5356890f+2e28ffdb',
    sources: [
      source('code-diff', 'code-diff.html', '5356890fec4947e384b044d7dda3d03601432125a4ce60087caac0e3639d9d93'),
      source('code-highlight', 'code-highlight.html', '2e28ffdb11fe7b595e47488f2dfb93db514f315dd5f334c902540fcbebf2bb2f'),
    ],
  }),
  'device-surface-bounded': Object.freeze({
    adapterId: 'device-surface-bounded',
    adapterVersion: '1.0.0',
    visualType: 'device-surface',
    sourceReceipt: 'hf-registry:app-showcase@c7e1b4d8ec2a2c1f',
    sources: [source('app-showcase', 'app-showcase.html', 'c7e1b4d8ec2a2c1f70a8ed67a147ba5c4985074eb475d611b2bec6d921b10ade')],
  }),
});

export const PRIMARY_CARRIER_LICENSE = Object.freeze({
  id: 'Apache-2.0',
  path: 'vendor/hyperframes/LICENSE',
  sha256: '4259155fb06f127687ee7b0a8a3682d45132db0f2da26cbc0b7a2d1e796436b8',
});

const clean = (value) => String(value ?? '').trim();
const textWithin = (value, max) => clean(value).length > 0 && [...clean(value)].length <= max;
const RECEIPT_KINDS = new Set(['claim', 'source', 'media']);
const isReceipt = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && RECEIPT_KINDS.has(value.kind)
  && textWithin(value.id, 180)
  && SHA256.test(value.sha256 ?? '')
  && !REMOTE_URL.test(value.id);

const collectRemoteUrls = (value, found = []) => {
  if (typeof value === 'string' && REMOTE_URL.test(value)) found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectRemoteUrls(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectRemoteUrls(item, found));
  return found;
};

function validateEvidence(evidence, issues) {
  if (!evidence || !['verified', 'illustrative-mock'].includes(evidence.status)) {
    issues.push('carrier evidence.status must be verified or illustrative-mock');
    return;
  }
  if (!textWithin(evidence.label, 40)) issues.push('carrier evidence.label is required and limited to 40 characters');
  if (evidence.status === 'verified' && !isReceipt(evidence.receipt)) {
    issues.push('verified carrier evidence requires a structured project receipt with kind, id, and SHA-256');
  }
  if (evidence.status === 'illustrative-mock' && evidence.receipt) {
    issues.push('illustrative mock carrier evidence must not claim an evidence receipt');
  }
}

function validateDataChart(data, issues) {
  if (!textWithin(data?.title, 36)) issues.push('data chart title is required and limited to 36 characters');
  if (data?.unit && !textWithin(data.unit, 12)) issues.push('data chart unit is limited to 12 characters');
  if (!Array.isArray(data?.series) || data.series.length < 2 || data.series.length > 6) {
    issues.push('data chart requires 2-6 series entries');
    return;
  }
  for (const [index, item] of data.series.entries()) {
    if (!textWithin(item?.label, 12)) issues.push(`data chart series ${index + 1} label is required and limited to 12 characters`);
    if (!Number.isFinite(Number(item?.value)) || Number(item.value) < 0) issues.push(`data chart series ${index + 1} value must be a finite non-negative number`);
    if (item?.displayValue && !textWithin(item.displayValue, 14)) issues.push(`data chart series ${index + 1} displayValue is limited to 14 characters`);
  }
  if (data.highlightIndex !== undefined && (!Number.isInteger(data.highlightIndex) || data.highlightIndex < 0 || data.highlightIndex >= data.series.length)) {
    issues.push('data chart highlightIndex must point at a series entry');
  }
}

function validateCodeSurface(data, issues) {
  if (!textWithin(data?.title, 42)) issues.push('code surface title is required and limited to 42 characters');
  if (!textWithin(data?.language, 18)) issues.push('code surface language is required and limited to 18 characters');
  if (!['highlight', 'diff'].includes(data?.mode)) issues.push('code surface mode must be highlight or diff');
  if (!Array.isArray(data?.lines) || data.lines.length < 2 || data.lines.length > 10) {
    issues.push('code surface requires 2-10 lines');
    return;
  }
  for (const [index, line] of data.lines.entries()) {
    if (!textWithin(line?.text, 96)) issues.push(`code surface line ${index + 1} is required and limited to 96 characters`);
    if (!['context', 'add', 'remove', 'focus'].includes(line?.kind)) issues.push(`code surface line ${index + 1} has an unsupported kind`);
  }
}

function validateDeviceSurface(data, issues) {
  if (!textWithin(data?.title, 36)) issues.push('device surface title is required and limited to 36 characters');
  if (!textWithin(data?.productLabel, 28)) issues.push('device surface productLabel is required and limited to 28 characters');
  if (!Array.isArray(data?.states) || data.states.length < 2 || data.states.length > 3) {
    issues.push('device surface requires 2-3 states');
    return;
  }
  for (const [index, state] of data.states.entries()) {
    if (!textWithin(state?.label, 18)) issues.push(`device state ${index + 1} label is required and limited to 18 characters`);
    if (!Array.isArray(state?.rows) || state.rows.length < 1 || state.rows.length > 4 || state.rows.some((row) => !textWithin(row, 22))) {
      issues.push(`device state ${index + 1} requires 1-4 rows of at most 22 characters`);
    }
  }
  if (data.activeState !== undefined && (!Number.isInteger(data.activeState) || data.activeState < 0 || data.activeState >= data.states.length)) {
    issues.push('device activeState must point at a state');
  }
}

export function evaluatePrimaryCarrierPayload({visualType, carrierPayload}) {
  if (!carrierPayload) return {present: false, valid: true, verified: false, adapter: null, issues: []};
  const issues = [];
  const adapter = PRIMARY_CARRIER_ADAPTERS[carrierPayload.adapterId] ?? null;
  if (!adapter) issues.push(`unknown primary carrier adapter ${carrierPayload.adapterId ?? '(missing)'}`);
  if (adapter && carrierPayload.adapterVersion !== adapter.adapterVersion) issues.push(`${adapter.adapterId} requires adapterVersion ${adapter.adapterVersion}`);
  if (adapter && visualType !== adapter.visualType) issues.push(`${adapter.adapterId} supports ${adapter.visualType}, not ${visualType}`);
  if (carrierPayload.zone !== 'content.right') issues.push('primary carrier adapters may only render in content.right');
  if (adapter && carrierPayload.sourceReceipt !== adapter.sourceReceipt) issues.push(`${adapter.adapterId} sourceReceipt is missing or stale`);
  if (!Array.isArray(carrierPayload.sourceCueIds) || carrierPayload.sourceCueIds.length === 0) issues.push('primary carrier adapter requires sourceCueIds');
  validateEvidence(carrierPayload.evidence, issues);
  if (adapter?.adapterId === 'data-chart-bounded') validateDataChart(carrierPayload.data, issues);
  if (adapter?.adapterId === 'code-surface-bounded') validateCodeSurface(carrierPayload.data, issues);
  if (adapter?.adapterId === 'device-surface-bounded') validateDeviceSurface(carrierPayload.data, issues);
  if (collectRemoteUrls(carrierPayload).length) issues.push('primary carrier payload must not contain remote URLs');
  return {
    present: true,
    valid: issues.length === 0,
    verified: issues.length === 0 && carrierPayload.evidence?.status === 'verified',
    adapter,
    issues,
  };
}

export function assertPrimaryCarrierPayload({shot}) {
  const result = evaluatePrimaryCarrierPayload({visualType: shot.visualType, carrierPayload: shot.carrierPayload});
  if (result.present && (!shot.carrierPayload.sourceCueIds.includes(shot.cueId) || result.issues.length)) {
    const issues = [...result.issues];
    if (!shot.carrierPayload.sourceCueIds.includes(shot.cueId)) issues.push('sourceCueIds must include the owning cue');
    throw new Error(`${shot.cueId} primary carrier adapter failed: ${issues.join('; ')}.`);
  }
  return result;
}

const sha256File = async (filePath) => {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

export const primaryCarrierEvidenceSha256 = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(stableValue(value)))
  .digest('hex');

const readJsonIfPresent = async (filePath, fallback) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};

export async function loadPrimaryCarrierEvidenceIndex({projectDir, mediaLedger}) {
  const [claimLedger, sourceLedger] = await Promise.all([
    readJsonIfPresent(path.join(projectDir, 'input', 'claim-ledger.json'), {claims: []}),
    readJsonIfPresent(path.join(projectDir, 'input', 'content-intake', 'sources.json'), {sources: []}),
  ]);
  const index = new Map();
  for (const claim of claimLedger.claims ?? []) {
    if (!claim?.id) continue;
    index.set(`claim:${claim.id}`, {
      kind: 'claim', id: claim.id, sha256: primaryCarrierEvidenceSha256(claim),
      eligible: claim.evidenceStatus === 'verified', status: claim.evidenceStatus ?? 'missing', record: claim,
    });
  }
  for (const sourceRecord of sourceLedger.sources ?? []) {
    if (!sourceRecord?.id || !SHA256.test(sourceRecord.sha256 ?? '')) continue;
    index.set(`source:${sourceRecord.id}`, {
      kind: 'source', id: sourceRecord.id, sha256: sourceRecord.sha256,
      eligible: sourceRecord.status === 'registered', status: sourceRecord.status ?? 'missing', record: sourceRecord,
    });
  }
  for (const mediaRecord of mediaLedger?.records ?? []) {
    if (!mediaRecord?.id || !SHA256.test(mediaRecord.sha256 ?? '')) continue;
    index.set(`media:${mediaRecord.id}`, {
      kind: 'media', id: mediaRecord.id, sha256: mediaRecord.sha256,
      eligible: true, status: 'registered', record: mediaRecord,
    });
  }
  return index;
}

export async function verifyPrimaryCarrierProjectEvidence({projectDir, shots, mediaLedger}) {
  const index = await loadPrimaryCarrierEvidenceIndex({projectDir, mediaLedger});
  const verified = [];
  for (const shot of shots) {
    const payload = shot.carrierPayload;
    if (!payload || payload.evidence?.status !== 'verified') continue;
    const receipt = payload.evidence.receipt;
    if (!isReceipt(receipt)) throw new Error(`${shot.cueId} verified carrier evidence receipt is malformed.`);
    const item = index.get(`${receipt.kind}:${receipt.id}`);
    if (!item) throw new Error(`${shot.cueId} carrier evidence ${receipt.kind}:${receipt.id} does not exist in the formal project.`);
    if (item.sha256 !== receipt.sha256) {
      throw new Error(`${shot.cueId} carrier evidence ${receipt.kind}:${receipt.id} SHA-256 drifted.`);
    }
    if (!item.eligible) {
      throw new Error(`${shot.cueId} carrier evidence ${receipt.kind}:${receipt.id} is ${item.status}, not verified for formal use.`);
    }
    if (payload.adapterId === 'data-chart-bounded' && receipt.kind !== 'claim') {
      throw new Error(`${shot.cueId} data chart evidence must bind a verified claim, not ${receipt.kind}.`);
    }
    if (payload.adapterId === 'device-surface-bounded' && receipt.kind === 'claim') {
      throw new Error(`${shot.cueId} device surface evidence must bind a frozen source or media asset.`);
    }
    verified.push({cueId: shot.cueId, adapterId: payload.adapterId, receipt: structuredClone(receipt)});
  }
  return verified;
}

export async function verifyPrimaryCarrierAdapterSources({workspaceRoot, shots}) {
  const used = new Map();
  for (const shot of shots) {
    const result = assertPrimaryCarrierPayload({shot});
    if (result.adapter) used.set(`${result.adapter.adapterId}@${result.adapter.adapterVersion}`, result.adapter);
  }
  if (!used.size) return [];
  const root = path.resolve(workspaceRoot);
  const verifyFile = async (relativePath, expectedSha256, label) => {
    if (!SHA256.test(expectedSha256)) throw new Error(`${label} has an invalid pinned SHA-256.`);
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error(`${label} leaves the workspace.`);
    const actual = await sha256File(filePath);
    if (actual !== expectedSha256) throw new Error(`${label} hash mismatch: expected ${expectedSha256}, got ${actual}.`);
  };
  await verifyFile(PRIMARY_CARRIER_LICENSE.path, PRIMARY_CARRIER_LICENSE.sha256, 'HyperFrames registry license');
  for (const adapter of used.values()) {
    for (const item of adapter.sources) await verifyFile(item.path, item.sha256, `${adapter.adapterId} source ${item.registryItem}`);
  }
  return [...used.values()].map((adapter) => ({
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    visualType: adapter.visualType,
    sourceReceipt: adapter.sourceReceipt,
    sources: adapter.sources,
    license: PRIMARY_CARRIER_LICENSE,
    adaptation: 'bounded-local-adapter; official visual grammar only; no remote runtime or full-frame mount',
  }));
}
