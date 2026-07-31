import fs from 'node:fs/promises';
import path from 'node:path';
import {loadEnv} from './env.mjs';

loadEnv();
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('用法: npm run import:script -- <已审稿口播稿.md>');
const raw = await fs.readFile(path.resolve(sourcePath), 'utf8');
const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(sourcePath, path.extname(sourcePath));
const plain = raw.replace(/^#{1,6}\s+.*$/gm, '').replace(/^[-*>]\s*/gm, '').replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();
const sentences = plain.match(/[^。！？!?；;]+[。！？!?；;]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
const segments = [];
for (const sentence of sentences) {
  const previous = segments.at(-1);
  if (previous && previous.narration.length + sentence.length <= 58) previous.narration += sentence;
  else segments.push({id: `beat-${String(segments.length + 1).padStart(2, '0')}`, narration: sentence});
}
if (segments.length < 2) throw new Error('口播稿过短，至少需要两个句子');

const {OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL} = process.env;
if (!OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL) throw new Error('缺少模型环境变量');
const prompt = `你只负责为已审定口播片段设计画面，绝对不能改写口播。为每个 id 返回视觉信息。
layout 只能是 keywords、flow、compare、statement、wave；items 为 1-5 个短词；headline 不超过 16 字；accent 不超过 14 字。
只输出 JSON：{"visuals":[{"id":"beat-01","section":"...","layout":"...","headline":"...","accent":"...","items":["..."]}]}
片段：${JSON.stringify(segments)}`;
const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${OPENAI_API_KEY}`}, body: JSON.stringify({model: OPENAI_MODEL, temperature: 0.2, messages: [{role: 'user', content: prompt}]})});
if (!response.ok) throw new Error(`模型接口失败: HTTP ${response.status} ${await response.text()}`);
const payload = await response.json();
const content = payload.choices?.[0]?.message?.content;
const visuals = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '')).visuals;
const byId = new Map(visuals.map((visual) => [visual.id, visual]));
const beats = segments.map((segment) => {
  const visual = byId.get(segment.id);
  if (!visual) throw new Error(`缺少 ${segment.id} 的画面设计`);
  return {...visual, narration: segment.narration};
});
await fs.writeFile('content/reference.generated.json', `${JSON.stringify({title, kicker: '已审稿口播驱动', beats}, null, 2)}\n`, 'utf8');
console.log(`保留原文并拆分为 ${beats.length} 个视觉节拍`);
