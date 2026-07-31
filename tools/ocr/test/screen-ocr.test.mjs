import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  frameSetDigestFor,
  hashComposition,
  runScreenOcr,
  sha256File,
} from '../screen-ocr.mjs';

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fakeAdapter = path.join(import.meta.dirname, 'fixtures', 'fake-ocr-adapter.mjs');

const write = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
  return target;
};

const makeFixture = async (t, suffix) => {
  const formalRoot = await fs.mkdtemp(path.join(os.tmpdir(), `autovideo-ocr-${suffix}-`));
  t.after(() => fs.rm(formalRoot, {recursive: true, force: true}));
  const projectId = `ocr-${suffix}`;
  const compositionRoot = path.join(formalRoot, 'production', 'hyperframes');
  await write(path.join(compositionRoot, 'index.html'), '<main>OCR contract fixture</main>\n');
  await write(path.join(compositionRoot, 'hyperframes.json'), '{"project":"ocr-contract"}\n');
  const compositionManifest = await hashComposition(compositionRoot);
  const composition = {
    path: 'production/hyperframes',
    digest: compositionManifest.digest,
    fileCount: compositionManifest.files.length,
  };
  const checkPath = await write(path.join(formalRoot, 'qa', 'hyperframes-check.json'), serialize({
    schemaVersion: 'autovideo-hyperframes-check/v1',
    projectId,
    ok: true,
    strict: true,
    autoVideo: {compositionDigest: composition.digest, compositionFileCount: composition.fileCount},
  }));
  const framePath = await write(path.join(formalRoot, 'qa', 'composition-snapshots', 'cue-at-0.5s.png'), Buffer.from('stable-image-bytes'));
  const frame = {
    id: 'frame-001',
    timeSeconds: 0.5,
    reason: 'deterministic-timeline-sample',
    cueIds: ['cue-001'],
    sceneId: 'scene-001',
    path: 'qa/composition-snapshots/cue-at-0.5s.png',
    sha256: await sha256File(framePath),
  };
  const frameSet = {
    schemaVersion: 'autovideo-screen-text-frame-set/v1',
    projectId,
    generatedAt: new Date().toISOString(),
    samplingPolicyVersion: 'cue-and-transition-snapshots/v1',
    composition,
    hyperframesCheck: {path: 'qa/hyperframes-check.json', sha256: await sha256File(checkPath)},
    frames: [frame],
  };
  frameSet.frameSetDigest = frameSetDigestFor(frameSet);
  await write(path.join(formalRoot, 'qa', 'screen-text-frame-set.json'), serialize(frameSet));
  return {formalRoot, projectId, framePath};
};

test('runner recognizes every frozen frame and emits a schema-valid hash-bound report', async (t) => {
  const fixture = await makeFixture(t, 'passed');
  const result = await runScreenOcr({
    ...fixture,
    adapterCommand: {command: process.execPath, args: [fakeAdapter]},
  });
  assert.equal(result.report.status, 'passed');
  assert.equal(result.report.unresolvedCount, 0);
  assert.equal(result.report.frames[0].recognizedText, 'Frame 1');
  assert.equal(result.report.frames[0].status, 'passed');
  assert.equal(result.report.bindings.frameSet.sha256, await sha256File(path.join(fixture.formalRoot, 'qa', 'screen-text-frame-set.json')));
  assert.equal(result.sha256, await sha256File(result.reportPath));

  const schema = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '..', '..', '..', 'workflow-console', 'schemas', 'ocr-report.schema.json'), 'utf8'));
  const ajv = new Ajv2020({allErrors: true, strict: false});
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(result.report), true, JSON.stringify(validate.errors));
});

test('missing OCR engine writes unavailable and cannot masquerade as passed', async (t) => {
  const fixture = await makeFixture(t, 'unavailable');
  const result = await runScreenOcr({
    ...fixture,
    adapterCommand: {command: 'autovideo-ocr-engine-does-not-exist', args: []},
  });
  assert.equal(result.report.status, 'unavailable');
  assert.equal(result.report.unresolvedCount, 1);
  assert.equal(result.report.frames[0].status, 'unavailable');
  assert.equal(result.report.issues[0].code, 'engine-unavailable');
});

test('low-confidence recognition remains unresolved for human review', async (t) => {
  const fixture = await makeFixture(t, 'low-confidence');
  const prior = process.env.AUTOVIDEO_FAKE_OCR_CONFIDENCE;
  process.env.AUTOVIDEO_FAKE_OCR_CONFIDENCE = '0.42';
  t.after(() => {
    if (prior === undefined) delete process.env.AUTOVIDEO_FAKE_OCR_CONFIDENCE;
    else process.env.AUTOVIDEO_FAKE_OCR_CONFIDENCE = prior;
  });
  const result = await runScreenOcr({
    ...fixture,
    adapterCommand: {command: process.execPath, args: [fakeAdapter]},
    minConfidence: 0.55,
  });
  assert.equal(result.report.status, 'unresolved');
  assert.equal(result.report.unresolvedCount, 1);
  assert.equal(result.report.frames[0].issues[0].code, 'low-confidence-text');
});

test('changed frame bytes fail before invoking OCR and preserve no false receipt', async (t) => {
  const fixture = await makeFixture(t, 'stale-frame');
  await fs.appendFile(fixture.framePath, '-changed');
  await assert.rejects(
    () => runScreenOcr({...fixture, adapterCommand: {command: process.execPath, args: [fakeAdapter]}}),
    /frame changed after sampling/i,
  );
  await assert.rejects(() => fs.access(path.join(fixture.formalRoot, 'qa', 'ocr-report.json')), {code: 'ENOENT'});
});
