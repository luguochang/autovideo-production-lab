import fs from 'node:fs/promises';
import path from 'node:path';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';

const script = await fs.readFile('demo/demoText.txt', 'utf8');
const paragraphs = script.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const narration = paragraphs.slice(0, 3).join('');
const dir = path.resolve('public/flow-demo');
await fs.mkdir(dir, {recursive: true});

let result;
for (let attempt = 1; attempt <= 3; attempt++) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata('zh-CN-XiaoxiaoNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {
      wordBoundaryEnabled: true,
      sentenceBoundaryEnabled: true,
    });
    result = await tts.toFile(dir, narration, {rate: 1.05});
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  } finally {
    tts.close();
  }
}

const metadata = JSON.parse(await fs.readFile(result.metadataFilePath, 'utf8'));
const entries = metadata.Metadata ?? [];
const toSeconds = (ticks) => Number(ticks ?? 0) / 10_000_000;
const mapBoundary = (item) => ({
  text: item.Data.text.Text,
  start: toSeconds(item.Data.Offset),
  duration: toSeconds(item.Data.Duration),
});
const words = entries.filter((item) => item.Type === 'WordBoundary').map(mapBoundary);
const sentences = entries.filter((item) => item.Type === 'SentenceBoundary').map(mapBoundary);
const end = entries.reduce(
  (max, item) => Math.max(max, toSeconds(Number(item.Data?.Offset ?? 0) + Number(item.Data?.Duration ?? 0))),
  0,
);

const data = {
  narration,
  audio: 'flow-demo/audio.webm',
  duration: Math.ceil((end + 0.8) * 30),
  words,
  sentences,
};

await fs.writeFile('content/flow-demo.json', `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`流畅度样片配音 ${end.toFixed(2)} 秒，${words.length} 个词级时间点`);
