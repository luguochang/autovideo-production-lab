import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendMediaLedgerRecords,
  loadMediaLedger,
  parseMediaLedger,
  renderMediaIndex,
  validateMediaLedgerRecords,
} from '../lib/media-ledger.mjs';
import {sha256} from '../lib/common.mjs';

const validRecord = (overrides = {}) => ({
  id: 'sfx_001',
  type: 'sfx',
  path: '.media/audio/sfx/sfx_001.mp3',
  sha256: 'a'.repeat(64),
  provider: 'bundled.sfx',
  licenseReceipt: 'Pixabay Content License; CREDITS.md',
  ...overrides,
});

test('media ledger requires sha, provider, and license receipts', () => {
  for (const field of ['sha256', 'provider', 'licenseReceipt']) {
    const record = validRecord();
    delete record[field];
    assert.throws(() => validateMediaLedgerRecords([record]), new RegExp(field === 'sha256' ? 'SHA-256' : field === 'provider' ? 'provider' : 'license'));
  }
});

test('media ledger rejects aliases with the same content hash', () => {
  assert.throws(
    () => validateMediaLedgerRecords([
      validRecord(),
      validRecord({id: 'sfx_002', path: '.media/audio/sfx/sfx_002.mp3'}),
    ]),
    /Duplicate media content/,
  );
});

test('media ledger rejects paths outside the project media root', () => {
  assert.throws(
    () => validateMediaLedgerRecords([validRecord({path: 'assets/sfx_001.mp3'})]),
    /project \.media directory/,
  );
  assert.throws(
    () => validateMediaLedgerRecords([validRecord({path: '.media/audio/../secret.txt'})]),
    /project \.media directory/,
  );
});

test('media ledger accepts nested media-use provenance', () => {
  const record = validRecord();
  delete record.provider;
  delete record.licenseReceipt;
  record.provenance = {provider: 'media-use', licenseReceipt: 'project receipt'};
  assert.equal(validateMediaLedgerRecords([record]).byId.get(record.id), record);
});

test('loadMediaLedger verifies the frozen local file hash', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'autovideo-media-ledger-'));
  const mediaDir = path.join(root, '.media', 'audio', 'sfx');
  await mkdir(mediaDir, {recursive: true});
  const mediaPath = path.join(mediaDir, 'sfx_001.mp3');
  await writeFile(mediaPath, 'fixture-audio');
  const record = validRecord({sha256: await sha256(mediaPath)});
  await writeFile(path.join(root, '.media', 'manifest.jsonl'), `${JSON.stringify(record)}\n`);

  const ledger = await loadMediaLedger(root);
  assert.equal(ledger.byId.get('sfx_001').sha256, record.sha256);

  await writeFile(mediaPath, 'tampered-audio');
  await assert.rejects(() => loadMediaLedger(root), /hash mismatch/);
});

test('parseMediaLedger reports the failing JSONL line', () => {
  assert.throws(() => parseMediaLedger('{"id":"ok"}\nnot-json\n'), /line 2/);
});

test('ledger writes keep manifest and human-readable index synchronized', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'autovideo-media-index-'));
  const mediaDir = path.join(root, '.media', 'audio', 'sfx');
  await mkdir(mediaDir, {recursive: true});
  const mediaPath = path.join(mediaDir, 'sfx_001.mp3');
  await writeFile(mediaPath, 'fixture-audio');
  const record = validRecord({sha256: await sha256(mediaPath), description: 'Quiet fixture click'});

  const ledger = await appendMediaLedgerRecords(root, [record]);
  assert.equal(ledger.records.length, 1);
  const index = await readFile(path.join(root, '.media', 'index.md'), 'utf8');
  assert.equal(index, renderMediaIndex(ledger.records));
  assert.match(index, /# \.media - 1 asset/);
  assert.match(index, /sfx_001/);
  assert.match(index, /Quiet fixture click/);
});
