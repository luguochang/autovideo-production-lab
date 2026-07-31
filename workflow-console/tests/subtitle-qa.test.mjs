import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const root = path.join(consoleRoot, 'data', `subtitle-qa-test-${process.pid}`);
const {buildSubtitleQa} = await import('../lib/generators.mjs');

const fixture = async (name, {srtText} = {}) => {
  const formalRoot = path.join(root, name);
  await fs.mkdir(path.join(formalRoot, 'audio'), {recursive: true});
  await fs.mkdir(path.join(formalRoot, 'captions'), {recursive: true});
  const alignment = {
    schemaVersion: 'autovideo-alignment/v1',
    durationSeconds: 4,
    cues: [{id: 'cue-001', start: 0, end: 4, text: '平台会把复杂性藏起来。'}],
  };
  await fs.writeFile(path.join(formalRoot, 'audio', 'alignment.json'), `${JSON.stringify(alignment)}\n`, 'utf8');
  await fs.writeFile(path.join(formalRoot, 'captions', 'alignment-validation.json'), `${JSON.stringify({status: 'passed', outputs: {cueCount: 1}})}\n`, 'utf8');
  await fs.writeFile(path.join(formalRoot, 'captions', 'narration.zh-CN.srt'), srtText || '1\n00:00:00,000 --> 00:00:04,000\n平台会把复杂性藏起来。\n', 'utf8');
  return formalRoot;
};

after(() => fs.rm(root, {recursive: true, force: true}));

test('subtitle QA passes locked cue text/timing and keeps human gates separate', async () => {
  const formalRoot = await fixture('valid');
  const result = await buildSubtitleQa({formalRoot, projectId: 'subtitle-valid'});
  assert.equal(result.machine.status, 'passed');
  assert.equal(result.machine.cueCount, 1);
  assert.equal(result.machine.checks[0].textExact, true);
  assert.equal(result.humanSemanticReview.status, 'needs-review');
  assert.equal(result.ocrReview.status, 'unavailable');
  assert.equal(result.publicReleaseEligible, false);
  assert.ok((await fs.stat(path.join(formalRoot, 'qa', 'subtitle-qa.json'))).isFile());
});

test('subtitle QA fails stale text or timing instead of silently accepting it', async () => {
  const formalRoot = await fixture('invalid', {srtText: '1\n00:00:00,000 --> 00:00:03,000\n平台把复杂性藏起来。\n'});
  const result = await buildSubtitleQa({formalRoot, projectId: 'subtitle-invalid'});
  assert.equal(result.machine.status, 'failed');
  assert.ok(result.machine.errors.some((item) => /timing|text/i.test(item)));
});
