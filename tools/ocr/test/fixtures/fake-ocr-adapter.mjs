import fs from 'node:fs/promises';

const requestIndex = process.argv.indexOf('--request');
if (requestIndex < 0 || !process.argv[requestIndex + 1]) throw new Error('--request is required');
const request = JSON.parse(await fs.readFile(process.argv[requestIndex + 1], 'utf8'));
const confidence = Number(process.env.AUTOVIDEO_FAKE_OCR_CONFIDENCE ?? 0.98);

console.log(JSON.stringify({
  ok: true,
  engine: {
    name: 'Contract OCR Adapter',
    version: '1.0.0-test',
    runtime: 'node-test',
    source: 'project fixture',
    modelSource: 'project fixture',
    license: 'test-only',
  },
  frames: request.frames.map((frame, index) => ({
    id: frame.id,
    ok: true,
    elapsedMs: 1 + index,
    detections: [{
      text: `Frame ${index + 1}`,
      confidence,
      polygon: [[10, 10], [200, 10], [200, 60], [10, 60]],
    }],
  })),
}));
