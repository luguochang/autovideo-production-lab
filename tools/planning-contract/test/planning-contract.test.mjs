import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {compileProductionManifest, validatePlanningDocuments} from '../compile-production-manifest.mjs';
import {assertSchema} from '../schema-validator.mjs';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDir, '..', '..', '..');
const projectRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', 'demotext-standard-delivery-v1');
const cliPath = path.join(workspaceRoot, 'scripts', 'compile-production-manifest.mjs');

const readJson = async (relativePath) => JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), 'utf8'));

const loadDocuments = async () => {
  const [narrationLock, alignment, storyboard, shotManifest, graphIr] = await Promise.all([
    readJson('NarrationLock.json'),
    readJson('audio/alignment.json'),
    readJson('plan/storyboard.json'),
    readJson('plan/shot-manifest.json'),
    readJson('plan/graph-ir.json'),
  ]);
  return {narrationLock, alignment, storyboard, shotManifest, graphIr};
};

test('compiles the formal planning package into a deterministic production manifest', async () => {
  const first = await compileProductionManifest({projectRoot});
  const second = await compileProductionManifest({projectRoot});
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'autovideo-production-manifest/v1');
  assert.equal(first.motionLifecycleAccess.authorized, false);
  assert.ok(first.motionLifecycleAccess.access.every((entry) => entry.lifecycleState === 'candidate' && entry.authorization === 'denied'));
  assert.match(first.motionLifecycleAccess.lifecycleLedger.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.sceneCount, 14);
  assert.equal(first.cueCount, 46);
  assert.deepEqual(first.timeline, {start: 0, end: 239.909, duration: 239.909});
  assert.deepEqual(first.scenes.flatMap((scene) => scene.shotCueIds), first.scenes.flatMap((scene) => scene.cueIds));
  assert.deepEqual(
    first.scenes.filter((scene) => scene.graphRefs.length).map((scene) => scene.id),
    ['scene-06', 'scene-10', 'scene-12', 'scene-13'],
  );
  for (const binding of Object.values(first.bindings)) assert.match(binding.sha256, /^[a-f0-9]{64}$/);
});

test('rejects duplicate or incomplete cue coverage', async () => {
  const documents = await loadDocuments();
  documents.shotManifest.shots[1].cueId = documents.shotManifest.shots[0].cueId;
  assert.throws(() => validatePlanningDocuments(documents), /cover every alignment cue exactly once|Shot cue IDs must be unique/);
});

test('rejects NarrationLock and alignment hash drift', async () => {
  const documents = await loadDocuments();
  documents.alignment.narrationSha256 = '0'.repeat(64);
  assert.throws(() => validatePlanningDocuments(documents), /NarrationLock\.normalizedSha256/);
});

test('rejects dangling stable graph references', async () => {
  const documents = await loadDocuments();
  documents.graphIr.graphs[0].edges[0].to = 'missing-node';
  assert.throws(() => validatePlanningDocuments(documents), /references a missing node/);
});

test('shot manifest schema accepts canonical descriptive and numeric SFX ids', async () => {
  const schema = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'tools', 'planning-contract', 'schemas', 'shot-manifest.schema.json'), 'utf8'));
  const sfxSchema = structuredClone(schema.$defs.sfxRef);
  sfxSchema.properties.cueId = schema.$defs.cueId;
  const base = {role: 'state-change', event: 'click', cueId: 'cue-001', offsetMs: 120, gainDb: -18, duckingDb: 0};
  assert.doesNotThrow(() => assertSchema(sfxSchema, {assetId: 'sfx-click-soft', ...base}, 'descriptive SFX ref'));
  assert.doesNotThrow(() => assertSchema(sfxSchema, {assetId: 'sfx_001', ...base}, 'numeric SFX ref'));
  assert.throws(() => assertSchema(sfxSchema, {assetId: 'click-soft', ...base}, 'invalid SFX ref'), /Does not match/);
});

test('rejects screen text falsely marked exact-source', async () => {
  const documents = await loadDocuments();
  documents.shotManifest.shots[0].screenText.text = '这不是原文';
  assert.throws(() => validatePlanningDocuments(documents), /exact-source but is not an exact excerpt/);
});

test('CLI writes only the requested new production manifest', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-planning-contract-'));
  const outputPath = path.join(tempRoot, 'production-manifest.json');
  try {
    const {stdout} = await execFileAsync(process.execPath, [cliPath, '--project', projectRoot, '--output', outputPath], {
      cwd: workspaceRoot,
      windowsHide: true,
    });
    const receipt = JSON.parse(stdout);
    const manifest = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.sceneCount, 14);
    assert.equal(manifest.sceneCount, 14);
    assert.equal(manifest.scenes[5].graphRefs[0].graphId, 'graph-hidden-complexity');
    await assert.rejects(
      () => execFileAsync(process.execPath, [cliPath, '--project', projectRoot, '--output', outputPath], {cwd: workspaceRoot, windowsHide: true}),
      /Output already exists/,
    );
  } finally {
    await fs.rm(tempRoot, {recursive: true, force: true});
  }
});

test('CLI preserves an explicit project-bound internal motion fallback in the written manifest', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-fallback-'));
  const outputPath = path.join(tempRoot, 'production-manifest.json');
  const requestPath = path.join(tempRoot, 'internal-motion-fallback.json');
  try {
    const candidate = await compileProductionManifest({projectRoot});
    const request = {
      schemaVersion: 'autovideo-motion-internal-fallback-request/v1',
      projectId: candidate.projectId,
      scope: 'internal-full-production',
      releaseScope: 'internal-only',
      publicReleaseBlocked: true,
      requestedBy: 'test-internal-operator',
      requestedAt: '2026-07-21T00:10:00.000Z',
      reason: 'Exercise the explicit internal-only manifest write path.',
      recipeIds: candidate.motionLifecycleAccess.access.map((entry) => entry.recipeId),
    };
    await fs.writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
    await execFileAsync(process.execPath, [
      cliPath,
      '--project', projectRoot,
      '--output', outputPath,
      '--internal-motion-fallback', requestPath,
    ], {cwd: workspaceRoot, windowsHide: true});
    const manifest = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    assert.equal(manifest.motionLifecycleAccess.authorized, true);
    assert.equal(manifest.motionLifecycleAccess.internalFallback.used, true);
    assert.equal(manifest.motionLifecycleAccess.releasePolicy.internalFallbackUsed, true);
    assert.ok(manifest.motionLifecycleAccess.access.every((entry) => entry.authorization === 'internal-fallback'));
  } finally {
    await fs.rm(tempRoot, {recursive: true, force: true});
  }
});
