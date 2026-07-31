import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPublicationRightsRecord,
  sha256File,
  validatePublicationRightsRecord,
} from '../lib/rights-clearance.mjs';

const write = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
  return target;
};

const fixture = async (t, suffix) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), `autovideo-rights-${suffix}-`));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  const formalRoot = path.join(workspaceRoot, 'project');
  const assetPath = await write(path.join(formalRoot, 'media', 'asset.bin'), 'asset-v1');
  const evidencePath = await write(path.join(formalRoot, 'receipts', 'rights', 'evidence', 'license.txt'), 'licensed for public use');
  const projectId = `rights-${suffix}`;
  const record = {
    schemaVersion: 'autovideo-publication-rights/v2',
    projectId,
    declaration: 'internal-only',
    notes: '',
    generatedAt: new Date().toISOString(),
    inventoryBindings: [],
    items: [{
      id: 'asset-001',
      category: 'image',
      subject: 'asset',
      source: 'user supplied',
      license: 'unknown',
      status: 'needs-review',
      notApplicableReason: '',
      assetBindings: [{scope: 'project', path: 'media/asset.bin', sha256: await sha256File(assetPath)}],
      evidence: [],
      notes: '',
    }],
    policy: {},
  };
  return {workspaceRoot, formalRoot, projectId, assetPath, evidencePath, record};
};

test('internal-only rights v2 preserves unresolved items but still verifies asset bytes', async (t) => {
  const input = await fixture(t, 'internal');
  const result = await validatePublicationRightsRecord({
    ...input,
    declaration: 'internal-only',
  });
  assert.equal(result.valid, true);
  assert.equal(result.publicEligible, false);
  assert.equal(result.unresolvedCount, 1);
  await fs.appendFile(input.assetPath, '-changed');
  const stale = await validatePublicationRightsRecord({...input, declaration: 'internal-only'});
  assert.equal(stale.valid, false);
  assert.match(stale.issues.join(' '), /asset asset-001 changed/i);
});

test('public clearance requires typed local evidence and rejects evidence drift', async (t) => {
  const input = await fixture(t, 'public');
  const record = structuredClone(input.record);
  record.declaration = 'cleared';
  record.items[0].status = 'cleared';
  record.items[0].license = 'Project commercial license';

  const missing = await validatePublicationRightsRecord({...input, declaration: 'cleared', record});
  assert.equal(missing.valid, false);
  assert.match(missing.issues.join(' '), /requires a hash-bound local evidence file/i);

  record.items[0].evidence = [{
    kind: 'rights-attestation',
    scope: 'project',
    path: 'receipts/rights/evidence/license.txt',
    sha256: await sha256File(input.evidencePath),
  }];
  const cleared = await validatePublicationRightsRecord({...input, declaration: 'cleared', record});
  assert.equal(cleared.valid, true);
  assert.equal(cleared.publicEligible, true);

  await fs.appendFile(input.evidencePath, '-changed');
  const stale = await validatePublicationRightsRecord({...input, declaration: 'cleared', record});
  assert.equal(stale.valid, false);
  assert.match(stale.issues.join(' '), /evidence asset-001 changed/i);
});

test('legacy v1 remains internal-only compatible and can never authorize public release', async (t) => {
  const input = await fixture(t, 'legacy');
  const legacy = {schemaVersion: 'autovideo-publication-rights/v1', projectId: input.projectId, declaration: 'internal-only', items: []};
  const internal = await validatePublicationRightsRecord({...input, declaration: 'internal-only', record: legacy});
  assert.equal(internal.valid, true);
  assert.equal(internal.legacy, true);
  assert.equal(internal.publicEligible, false);
  legacy.declaration = 'cleared';
  const publicResult = await validatePublicationRightsRecord({...input, declaration: 'cleared', record: legacy});
  assert.equal(publicResult.valid, false);
  assert.match(publicResult.issues.join(' '), /cannot authorize public release/i);
});

test('generator inventories source, voice, template, media ledger, and current SHA bindings', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-rights-build-'));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  const formalRoot = path.join(workspaceRoot, 'project');
  const sourcePath = await write(path.join(workspaceRoot, 'inputs', 'source.txt'), 'source');
  const posePath = await write(path.join(workspaceRoot, 'style', 'POSE_MANIFEST.json'), '{}');
  const audioPath = await write(path.join(formalRoot, 'audio', 'narration.final.wav'), 'wav');
  await write(path.join(formalRoot, 'audio', 'voice.recipe.json'), '{}');
  const mediaPath = await write(path.join(formalRoot, '.media', 'images', 'image.png'), 'image');
  await write(path.join(formalRoot, '.media', 'manifest.jsonl'), `${JSON.stringify({
    id: 'image-001', type: 'image', path: '.media/images/image.png', sha256: await sha256File(mediaPath),
    source: 'user', licenseReceipt: 'not frozen',
  })}\n`);
  await write(path.join(formalRoot, 'template-lock.json'), '{}');
  const project = {
    id: 'rights-build', publicationRights: 'internal-only', rightsNotes: '', voiceRoute: 'preset14',
  };
  const record = await buildPublicationRightsRecord({
    formalRoot,
    workspaceRoot,
    project,
    sources: [{id: '001', path: 'inputs/source.txt', sha256: await sha256File(sourcePath), license: 'user-provided'}],
    templateLock: {
      styleId: 'modern-ip-host-explainer',
      sourcePath: 'style',
      sourceFiles: [{path: 'style/POSE_MANIFEST.json', sha256: await sha256File(posePath)}],
    },
  });
  const mediaSha256 = await sha256File(mediaPath);
  const audioSha256 = await sha256File(audioPath);
  assert.equal(record.schemaVersion, 'autovideo-publication-rights/v2');
  assert.ok(record.inventoryBindings.some((binding) => binding.path === 'audio/narration.final.wav'));
  assert.ok(record.items.some((item) => item.id === 'media-image-001' && item.assetBindings[0].sha256 === mediaSha256));
  assert.ok(record.items.some((item) => item.id === 'voice-speaker-rights' && item.assetBindings.some((binding) => binding.sha256 === audioSha256)));
  assert.ok(record.items.some((item) => item.id === 'host-artwork-rights' && item.assetBindings.some((binding) => binding.scope === 'workspace')));
});
