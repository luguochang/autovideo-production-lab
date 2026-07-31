import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {deriveVoiceBounds, mergeBreathAudio, planBreathGaps} from '../../tools/voice-lab/merge_breath_audio.mjs';

const run = promisify(execFile);
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

test('voice bounds preserve protective silence without retaining the complete file edge', () => {
  const bounds = deriveVoiceBounds(3, [
    '[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.2 | silence_duration: 0.2',
    '[silencedetect] silence_start: 2.75\n[silencedetect] silence_end: 3 | silence_duration: 0.25',
  ].join('\n'));
  assert.equal(bounds.activeStartSeconds, 0.2);
  assert.equal(bounds.activeEndSeconds, 2.75);
  assert.equal(bounds.trimStartSeconds, 0.14);
  assert.equal(bounds.trimEndSeconds, 2.85);
  assert.equal(bounds.retainedLeadingSilenceSeconds, 0.06);
  assert.equal(bounds.retainedTrailingSilenceSeconds, 0.1);
});

test('breath gap planning inserts only the silence needed for a 560ms active-voice gap', () => {
  const bounds = [
    {retainedTrailingSilenceSeconds: 0.1, retainedLeadingSilenceSeconds: 0.06},
    {retainedTrailingSilenceSeconds: 0.1, retainedLeadingSilenceSeconds: 0.06},
    {retainedTrailingSilenceSeconds: 0.1, retainedLeadingSilenceSeconds: 0.06},
  ];
  const gaps = planBreathGaps(bounds, 0.56);
  assert.equal(gaps.length, 2);
  assert.equal(gaps[0].insertedSilenceSeconds, 0.4);
  assert.equal(gaps[0].actualActiveVoiceGapSeconds, 0.56);
  assert.throws(() => planBreathGaps(bounds, 0.7), /between 0\.42 and 0\.65/);
});

test('breath-aware merger produces a hash-bound 48kHz PCM output with audited gaps', {timeout: 60_000}, async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-breath-audio-test-'));
  context.after(() => fs.rm(root, {recursive: true, force: true}));
  const partsRoot = path.join(root, 'parts');
  await fs.mkdir(partsRoot, {recursive: true});
  const parts = [];
  for (let index = 0; index < 3; index += 1) {
    const filePath = path.join(partsRoot, `part-${index + 1}.wav`);
    await run('ffmpeg.exe', [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-t', '0.2', '-i', 'anullsrc=r=48000:cl=mono',
      '-f', 'lavfi', '-i', `sine=frequency=${440 + index * 110}:sample_rate=48000:duration=0.5`,
      '-f', 'lavfi', '-t', '0.25', '-i', 'anullsrc=r=48000:cl=mono',
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', filePath,
    ], {windowsHide: true});
    parts.push({id: `part-${index + 1}`, path: `parts/${path.basename(filePath)}`, sha256: await sha256File(filePath)});
  }
  const manifestPath = path.join(root, 'merge-manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: 'autovideo-breath-merge/v1',
    targetGapSeconds: 0.56,
    parts,
    output: 'final.wav',
    receipt: 'merge-receipt.json',
  }, null, 2)}\n`, 'utf8');
  const receipt = await mergeBreathAudio(manifestPath);
  assert.equal(receipt.gaps.length, 2);
  assert.ok(receipt.gaps.every((gap) => gap.actualActiveVoiceGapSeconds === 0.56));
  assert.equal(receipt.output.codec, 'pcm_s16le');
  assert.equal(receipt.output.sampleRate, 48_000);
  assert.equal(receipt.output.channels, 1);
  assert.equal(receipt.policy.assemblyStrategy, 'prepared-segments-concat-demuxer');
  assert.equal(receipt.policy.commandLineBounded, true);
  assert.equal(receipt.output.sha256, await sha256File(path.join(root, 'final.wav')));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'merge-receipt.json'), 'utf8')), receipt);
});
