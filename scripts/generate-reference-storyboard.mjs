import fs from 'node:fs/promises';
import path from 'node:path';
import {loadEnv} from './env.mjs';

loadEnv();
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('用法: npm run generate:reference -- <资料.md>');
const {OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL} = process.env;
if (!OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL) throw new Error('缺少模型环境变量');
const source = await fs.readFile(path.resolve(sourcePath), 'utf8');
const prompt = `你是动态知识课件编导。只依据资料，制作一条横屏 16:9 技术讲解视频，聚焦 EchoFlow 实时语音 Agent 的架构和关键实现。
把内容拆成 20-28 个视觉节拍，每个节拍口播 20-45 个汉字，画面只保留最关键的信息。节拍之间逻辑连续，英文技术名保留。
layout 只能是 keywords、flow、compare、statement、wave。keywords 放 2-6 个短标签；flow 放 3-5 个流程节点；compare 放 2-4 个对比项；statement 展示一句结论；wave 用于承上启下。
只输出 JSON：{"title":"...","kicker":"...","beats":[{"section":"...","layout":"keywords|flow|compare|statement|wave","headline":"...","accent":"...","narration":"...","items":["..."]}]}
不要 Markdown，不要虚构资料外事实。

资料：
${source.slice(0, 30000)}`;
const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${OPENAI_API_KEY}`}, body: JSON.stringify({model: OPENAI_MODEL, temperature: 0.25, messages: [{role: 'user', content: prompt}]})});
if (!response.ok) throw new Error(`模型接口失败: HTTP ${response.status} ${await response.text()}`);
const payload = await response.json();
const raw = payload.choices?.[0]?.message?.content;
if (!raw) throw new Error('模型没有返回内容');
const data = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
if (!Array.isArray(data.beats) || data.beats.length < 12) throw new Error('参考风格分镜数量不足');
await fs.writeFile('content/reference.generated.json', `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`已生成 ${data.beats.length} 个视觉节拍`);
