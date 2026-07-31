import fs from 'node:fs/promises';
import path from 'node:path';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';
import {loadEnv} from './env.mjs';

loadEnv();
const file = 'content/storyboard.generated.json';
const storyboard = JSON.parse(await fs.readFile(file, 'utf8'));
const voice = process.env.TTS_VOICE || 'zh-CN-YunxiNeural';

const synthesize = async (dir, narration) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {wordBoundaryEnabled: true, sentenceBoundaryEnabled: true});
      return await tts.toFile(dir, narration, {rate: 1.08});
    } catch (error) {
      lastError = error;
      console.warn(`Edge TTS 第 ${attempt} 次请求失败，准备重试`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    } finally {
      tts.close();
    }
  }
  throw lastError;
};

for (let index = 0; index < storyboard.scenes.length; index++) {
  const dir = path.resolve('public/audio', String(index));
  await fs.mkdir(dir, {recursive: true});
  const result = await synthesize(dir, storyboard.scenes[index].narration);
  const metadata = result.metadataFilePath ? JSON.parse(await fs.readFile(result.metadataFilePath, 'utf8')) : {Metadata: []};
  const boundaries = metadata.Metadata || [];
  const endTicks = boundaries.reduce((max, item) => Math.max(max, Number(item.Data?.Offset || 0) + Number(item.Data?.Duration || 0)), 0);
  const seconds = Math.max(3, endTicks / 10_000_000 + 0.7);
  storyboard.scenes[index].duration = Math.ceil(seconds * 30);
  storyboard.scenes[index].audio = `audio/${index}/audio.webm`;
  storyboard.scenes[index].captions = boundaries.filter((item) => item.Type === 'WordBoundary').map((item) => ({text: item.Data.text.Text, start: Number(item.Data.Offset) / 10_000_000, duration: Number(item.Data.Duration) / 10_000_000}));
  console.log(`场景 ${index + 1}: ${seconds.toFixed(1)} 秒`);
}
await fs.writeFile(file, `${JSON.stringify(storyboard, null, 2)}\n`, 'utf8');
