import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';

const readCodeTree = async (root, excludedNames = new Set()) => {
  const entries = await fs.readdir(root, {withFileTypes: true});
  const chunks = await Promise.all(entries.map(async (entry) => {
    if (excludedNames.has(entry.name)) return '';
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return readCodeTree(target, excludedNames);
    return /\.(?:[cm]?[jt]sx?)$/u.test(entry.name) ? fs.readFile(target, 'utf8') : '';
  }));
  return chunks.join('\n');
};

const assertNoLiveAudioApis = (source) => {
  assert.doesNotMatch(source, /\bautoPlay\b|\bautoplay\b/u);
  assert.doesNotMatch(source, /getUserMedia|mediaDevices|MediaRecorder|AudioWorklet|ScriptProcessorNode|AudioContext|webkitAudioContext|setSinkId/u);
  assert.doesNotMatch(source, /(?:\.play|\[['"]play['"]\])\s*\(/u);
};

test('workbench audio review is file-in/file-out without live capture or sound output APIs', async () => {
  const source = await readCodeTree(path.resolve(import.meta.dirname, '..', 'src'));
  assertNoLiveAudioApis(source);
  assert.match(source, /preload="none"/u);
  assert.match(source, /onEnded=/u);
});

test('automated workbench tests do not invoke microphone, recording, or playback APIs', async () => {
  const tests = await readCodeTree(import.meta.dirname, new Set([path.basename(import.meta.filename)]));
  assertNoLiveAudioApis(tests);
});
