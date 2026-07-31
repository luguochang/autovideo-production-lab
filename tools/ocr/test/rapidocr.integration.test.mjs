import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';

const run = promisify(execFile);
const enabled = process.env.AUTOVIDEO_RUN_REAL_OCR === '1';

test('local RapidOCR recognizes a generated bitmap without network or browser APIs', {skip: !enabled, timeout: 120_000}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-real-ocr-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const imagePath = path.join(root, 'ocr-smoke.png');
  const requestPath = path.join(root, 'request.json');
  await run('ffmpeg.exe', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=1280x720:d=1',
    '-vf', "drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='AUTO VIDEO OCR 2026':fontcolor=black:fontsize=72:x=120:y=300",
    '-frames:v', '1', imagePath,
  ], {windowsHide: true});
  await fs.writeFile(requestPath, serialize({
    schemaVersion: 'autovideo-ocr-adapter-request/v1',
    projectId: 'rapidocr-smoke',
    frames: [{id: 'frame-001', inputPath: imagePath}],
  }), 'utf8');
  const python = path.resolve(import.meta.dirname, '..', '.venv', 'Scripts', 'python.exe');
  const adapter = path.resolve(import.meta.dirname, '..', 'rapidocr_adapter.py');
  const {stdout} = await run(python, [adapter, '--request', requestPath], {windowsHide: true, maxBuffer: 10 * 1024 * 1024});
  const payload = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1));
  assert.equal(payload.ok, true);
  assert.match(payload.engine.version, /^1\.4\.4$/u);
  const recognized = payload.frames.flatMap((frame) => frame.detections.map((item) => item.text)).join(' ').toUpperCase();
  assert.match(recognized, /AUTO|VIDEO|OCR/u);
});

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
