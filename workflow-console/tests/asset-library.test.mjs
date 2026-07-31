import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {listAssetLibrary, importAssetToProject} from '../lib/asset-library.mjs';
import {readProjectMediaInventory} from '../lib/media-assets.mjs';
import {loadMediaLedger} from '../../tools/hyperframes-production/lib/media-ledger.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');

test('central asset library exposes hash-bound semantic SFX', async () => {
  const assets = await listAssetLibrary({type: 'sfx'});
  assert.ok(assets.length >= 5);
  const click = assets.find((asset) => asset.id === 'sfx-click-soft');
  assert.equal(click.sourceReady, true);
  assert.equal(click.sourceShaMatches, true);
  assert.ok(click.semanticRoles.includes('focus-hit'));
  assert.ok(click.licenseReceipt.endsWith('CREDITS.md'));
});

test('central asset library exposes a hash-bound visual icon pack', async () => {
  const assets = await listAssetLibrary({type: 'icon'});
  assert.equal(assets.length, 8);
  const workflow = assets.find((asset) => asset.id === 'icon-workflow');
  assert.equal(workflow.sourceReady, true);
  assert.equal(workflow.sourceShaMatches, true);
  assert.equal(workflow.license, 'ISC');
});

test('library import freezes a canonical SFX into a project ledger and is idempotent', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(root, 'workflow-console', 'data', 'asset-library-test-'));
  t.after(() => fs.rm(projectRoot, {recursive: true, force: true}));
  const first = await importAssetToProject({projectRoot, assetId: 'sfx-click-soft'});
  assert.equal(first.reused, false);
  assert.equal(first.projectAssetId, 'sfx-click-soft');
  const second = await importAssetToProject({projectRoot, assetId: 'sfx-click-soft'});
  assert.equal(second.reused, true);
  assert.equal(second.projectAssetId, 'sfx-click-soft');
  const ledger = await loadMediaLedger(projectRoot);
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].provider, 'hyperframes-media-use-bundled');
  assert.equal(ledger.records[0].license, 'Pixabay Content License');
});

test('library import freezes a visual icon into the project media ledger and is idempotent', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(root, 'workflow-console', 'data', 'asset-library-test-'));
  t.after(() => fs.rm(projectRoot, {recursive: true, force: true}));
  const first = await importAssetToProject({projectRoot, assetId: 'icon-workflow'});
  assert.equal(first.reused, false);
  assert.equal(first.asset.type, 'icon');
  const second = await importAssetToProject({projectRoot, assetId: 'icon-workflow'});
  assert.equal(second.reused, true);
  const ledger = await loadMediaLedger(projectRoot);
  assert.equal(ledger.records[0].type, 'icon');
  assert.match(ledger.records[0].path, /^\.media\/images\/icons\/icon-workflow\.svg$/);
  const inventory = await readProjectMediaInventory({projectRoot, projectId: 'asset-library-test'});
  assert.equal(inventory.byId.get('icon-workflow').selectionReady, true);
  assert.equal(inventory.byId.get('icon-workflow').mime, 'image/svg+xml');
});

test('motion component references cannot be silently imported as media', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(root, 'workflow-console', 'data', 'asset-library-test-'));
  t.after(() => fs.rm(projectRoot, {recursive: true, force: true}));
  await assert.rejects(
    importAssetToProject({projectRoot, assetId: 'flowchart'}),
    /not importable media/,
  );
});
