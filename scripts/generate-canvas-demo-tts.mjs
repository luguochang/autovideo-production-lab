import fs from 'node:fs/promises';
import path from 'node:path';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';

const narration = '很多人以为，语音智能体只是把几个模型接口串起来。其实真正的难点，是让音频接入、人声检测、语音识别、大模型和语音合成，在同一条异步链路里稳定协作。先用 WebSocket 接住连续音频，再用 VAD 找到说话边界，接着由 ASR 转成文字。大模型边生成，TTS 就边合成；用户再次开口时，还要立刻打断旧回复。这才是一套真正可用的实时语音 Agent。';
const dir = path.resolve('public/canvas-demo');
await fs.mkdir(dir, {recursive: true});
const tts = new MsEdgeTTS();
await tts.setMetadata('zh-CN-YunxiNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {sentenceBoundaryEnabled: true});
const result = await tts.toFile(dir, narration, {rate: 1.12});
tts.close();
const metadata = JSON.parse(await fs.readFile(result.metadataFilePath, 'utf8'));
const sentences = metadata.Metadata.filter((item) => item.Type === 'SentenceBoundary').map((item) => ({text: item.Data.text.Text, start: Number(item.Data.Offset) / 10_000_000, duration: Number(item.Data.Duration) / 10_000_000}));
const end = metadata.Metadata.reduce((max, item) => Math.max(max, Number(item.Data.Offset || 0) + Number(item.Data.Duration || 0)), 0);
await fs.writeFile('content/canvas-demo.json', `${JSON.stringify({narration, duration: Math.ceil((end / 10_000_000 + 0.8) * 30), audio: 'canvas-demo/audio.webm', sentences}, null, 2)}\n`, 'utf8');
console.log(`连续画板样片配音 ${(end / 10_000_000).toFixed(1)} 秒`);
