import fs from 'node:fs/promises';
import path from 'node:path';
import {loadEnv} from './env.mjs';

loadEnv();
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('用法: npm run generate:storyboard -- <资料.md>');
const {OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL} = process.env;
if (!OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL) throw new Error('缺少 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL');

const source = await fs.readFile(path.resolve(sourcePath), 'utf8');
const prompt = `你是中文技术短视频编导。只依据资料，制作一条 45-75 秒的 9:16 知识讲解视频，主题聚焦 EchoFlow 实时语音 Agent 的完整链路。
要求：5-7 个场景；口播自然、信息密度高；屏幕文字简洁；英文术语保留；不要编造资料外事实。
只输出 JSON，不要 Markdown。格式：{"title":"...","subtitle":"...","scenes":[{"type":"hook|flow|compare|summary","headline":"...","body":"...","narration":"...","items":["..."]}]}

资料：
${source.slice(0, 28000)}`;

const endpoint = `${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
const response = await fetch(endpoint, {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${OPENAI_API_KEY}`}, body: JSON.stringify({model: OPENAI_MODEL, temperature: 0.3, messages: [{role: 'user', content: prompt}]})});
if (!response.ok) throw new Error(`模型接口失败: HTTP ${response.status} ${await response.text()}`);
const payload = await response.json();
const raw = payload.choices?.[0]?.message?.content;
if (!raw) throw new Error('模型响应中没有 choices[0].message.content');
const data = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
if (!data.title || !Array.isArray(data.scenes) || data.scenes.length < 3) throw new Error('模型返回的分镜结构不完整');
for (const scene of data.scenes) {
  if (!scene.headline || !scene.body || !scene.narration) throw new Error('场景缺少 headline/body/narration');
  scene.items ??= [];
}
await fs.mkdir('content', {recursive: true});
await fs.writeFile('content/storyboard.generated.json', `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`已生成 ${data.scenes.length} 个场景: content/storyboard.generated.json`);
