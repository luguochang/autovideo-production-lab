import fs from 'node:fs/promises';
import path from 'node:path';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';
import {loadEnv} from './env.mjs';

loadEnv();
const file = 'content/reference.generated.json';
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const voice = process.env.TTS_VOICE || 'zh-CN-YunxiNeural';
for (let index = 0; index < data.beats.length; index++) {
  const dir = path.resolve('public/reference-audio', String(index));
  await fs.mkdir(dir, {recursive: true});
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {sentenceBoundaryEnabled: true});
      result = await tts.toFile(dir, data.beats[index].narration, {rate: 1.12});
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    } finally { tts.close(); }
  }
  const metadata = JSON.parse(await fs.readFile(result.metadataFilePath, 'utf8'));
  const end = metadata.Metadata.reduce((max, item) => Math.max(max, Number(item.Data?.Offset || 0) + Number(item.Data?.Duration || 0)), 0);
  data.beats[index].duration = Math.max(105, Math.ceil((end / 10_000_000 + 0.5) * 30));
  data.beats[index].audio = `reference-audio/${index}/audio.webm`;
  console.log(`${index + 1}/${data.beats.length}: ${(data.beats[index].duration / 30).toFixed(1)} 秒`);
}
await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
