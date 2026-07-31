import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const buildRoot = path.resolve(here, '..');
const projectRoot = path.resolve(buildRoot, '..', '..');
const oldProductionRoot = path.join(projectRoot, 'production', 'hyperframes');
const originalAudio = path.join(projectRoot, 'audio', 'narration.final.wav');
const alignmentPath = path.join(projectRoot, 'audio', 'alignment.json');
const episodeRecipePath = path.join(projectRoot, 'audio', 'episodes-v2', 'episode-audio-recipe.json');
const alignment = JSON.parse(await fs.readFile(alignmentPath, 'utf8'));
const segments = alignment.segments;
const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
const splitSeconds = 794.88;
const originalDuration = Number(alignment.durationSeconds);

const COLORS = {
  background: '#F2DFC7',
  surface: '#FBF3E7',
  ink: '#2A211B',
  muted: '#675748',
  primary: '#496958',
  secondary: '#A94E36',
  line: '#DCC2A3',
  blue: '#376C8A',
  yellow: '#D79B2B',
};

const CHAPTERS = [
  {
    episode: 1,
    id: 'overview',
    stage: '全链总览',
    visual: 'pipeline',
    startCue: 'cue-001',
    showHost: false,
    states: [
      ['cue-001', '一条数据流'],
      ['cue-002', '离线建库 → 在线检索'],
      ['cue-003', '选型 · 指标 · 提升'],
      ['cue-004', '组合，而不是单选'],
    ],
  },
  {
    episode: 1,
    id: 'parsing',
    stage: '文档解析',
    visual: 'document',
    startCue: 'cue-006',
    states: [
      ['cue-006', '异构文档进入'],
      ['cue-009', '先识别复杂度'],
      ['cue-015', '主解析 + 清洗 + 兜底'],
      ['cue-021', '结构质量要验收'],
      ['cue-024', '复杂页面按需增强'],
    ],
  },
  {
    episode: 1,
    id: 'chunking',
    stage: '文本分块',
    visual: 'chunk',
    startCue: 'cue-025',
    states: [
      ['cue-025', '从整篇切到语义块'],
      ['cue-030', '五种切分路径'],
      ['cue-032', '按文档结构选择'],
      ['cue-035', '生产采用组合策略'],
      ['cue-038', '元数据必须随块保留'],
      ['cue-039', '检索块与合成块解耦'],
      ['cue-041', '用指标验证边界'],
    ],
  },
  {
    episode: 1,
    id: 'context',
    stage: '上下文增强',
    visual: 'context',
    startCue: 'cue-043',
    states: [
      ['cue-043', '分块之后再补语境'],
      ['cue-045', '孤立片段语义不完整'],
      ['cue-048', '上下文前缀或延迟分块'],
      ['cue-052', '公开结果只作参考'],
      ['cue-057', '收益与成本做对照'],
      ['cue-061', '用失败率回答值不值得'],
    ],
  },
  {
    episode: 1,
    id: 'embedding',
    stage: '向量化',
    visual: 'embedding',
    startCue: 'cue-063',
    states: [
      ['cue-063', '文本映射到向量空间'],
      ['cue-065', '开源与商业同台评测'],
      ['cue-069', '中文 · 部署 · 维度'],
      ['cue-075', '输入类型与版本管理'],
      ['cue-079', '领域召回率才是关键'],
    ],
  },
  {
    episode: 1,
    id: 'index',
    stage: '向量库与索引',
    visual: 'index',
    startCue: 'cue-081',
    states: [
      ['cue-081', '向量落库'],
      ['cue-084', 'HNSW · IVF · Flat'],
      ['cue-086', '规模 · 事务 · 运维'],
      ['cue-087', '中小规模先评估 pgvector'],
      ['cue-092', '向量索引 + 全文索引'],
      ['cue-099', '召回 · 延迟 · 内存'],
    ],
  },
  {
    episode: 2,
    id: 'query',
    stage: '查询理解',
    visual: 'query',
    startCue: 'cue-102',
    states: [
      ['cue-102', '从查询开始在线链路'],
      ['cue-104', '改写 + 路由'],
      ['cue-106', '按复杂度选择路径'],
      ['cue-109', '简单直走，复杂再改写'],
      ['cue-111', '路由与按需改写组合'],
      ['cue-115', '召回率与路由准确率'],
    ],
  },
  {
    episode: 2,
    id: 'retrieval',
    stage: '混合检索',
    visual: 'retrieval',
    startCue: 'cue-117',
    states: [
      ['cue-117', '召回开始'],
      ['cue-119', '向量 + BM25'],
      ['cue-121', '编号与术语需要精确命中'],
      ['cue-125', '多路各管一类问题'],
      ['cue-128', '候选并行汇入'],
      ['cue-133', '用召回率验证增益'],
    ],
  },
  {
    episode: 2,
    id: 'fusion',
    stage: 'RRF 融合',
    visual: 'fusion',
    startCue: 'cue-136',
    states: [
      ['cue-136', '不同分数不能直接相加'],
      ['cue-139', '先看名次'],
      ['cue-143', 'RRF 像多路投票'],
      ['cue-145', '标准 RRF 起步'],
      ['cue-148', '用 nDCG 验证融合'],
    ],
  },
  {
    episode: 2,
    id: 'rerank',
    stage: '重排精筛',
    visual: 'rerank',
    startCue: 'cue-151',
    states: [
      ['cue-151', '五十条候选进入精筛'],
      ['cue-152', '交叉编码器或 ColBERT'],
      ['cue-156', '双塔粗召，交叉编码器精排'],
      ['cue-158', '前五十到前五'],
      ['cue-163', 'nDCG · MRR · P99'],
    ],
  },
  {
    episode: 2,
    id: 'agent',
    stage: '智能体决策',
    visual: 'agent',
    startCue: 'cue-165',
    states: [
      ['cue-165', '证据充分性是分水岭'],
      ['cue-167', '评估 → 改写 → 重检'],
      ['cue-171', '生产先做轻量闭环'],
      ['cue-175', '支持性检查守住幻觉'],
      ['cue-176', '评估 · 重试 · 拒答'],
      ['cue-180', '用图状态机表达循环'],
      ['cue-183', '成功率与收敛轮数'],
    ],
  },
  {
    episode: 2,
    id: 'generation',
    stage: '生成与引用',
    visual: 'generation',
    startCue: 'cue-185',
    states: [
      ['cue-185', '证据够了才生成'],
      ['cue-187', '三种引用实现'],
      ['cue-191', '四道防幻觉防线'],
      ['cue-194', '逐条校验来源'],
      ['cue-196', '回溯到文档与页码'],
      ['cue-197', '真实 · 完整 · 忠实'],
    ],
  },
  {
    episode: 2,
    id: 'evaluation',
    stage: '评测闭环',
    visual: 'evaluation',
    startCue: 'cue-199',
    states: [
      ['cue-199', '不评测就是瞎调'],
      ['cue-201', '四类核心指标'],
      ['cue-205', '黄金集 + 调用链归因'],
      ['cue-209', '召回 · 引用 · 拒答'],
      ['cue-210', '记录完整调用链'],
      ['cue-215', '回归后再上线'],
    ],
  },
  {
    episode: 2,
    id: 'production',
    stage: '上线工程',
    visual: 'production',
    startCue: 'cue-216',
    states: [
      ['cue-216', '从演示走向生产'],
      ['cue-218', '缓存 · 安全 · 版本 · 监控'],
      ['cue-220', '缓存优先评估'],
      ['cue-223', '防提示词注入'],
      ['cue-224', '增量索引与版本管理'],
      ['cue-227', '能力必须组合配套'],
      ['cue-229', 'SLA · P99 · 成本'],
    ],
  },
  {
    episode: 2,
    id: 'summary',
    stage: '全链总结',
    visual: 'summary',
    startCue: 'cue-232',
    showHost: false,
    states: [
      ['cue-232', '一条数据流'],
      ['cue-233', '离线决定上限，在线决定召回'],
      ['cue-234', '生产依赖组合判断'],
      ['cue-235', '每一环都可测可提升'],
      ['cue-237', '可控 · 可测 · 可迭代'],
    ],
  },
];

const PROBES = [
  {id: 'parsing', chapterId: 'parsing', sourceStart: 110.24, duration: 8},
  {id: 'chunking', chapterId: 'chunking', sourceStart: 301.28, duration: 8},
  {id: 'retrieval', chapterId: 'retrieval', sourceStart: 976.0, duration: 8},
  {id: 'agent', chapterId: 'agent', sourceStart: 1362.96, duration: 8},
  {id: 'evaluation', chapterId: 'evaluation', sourceStart: 1547.38, duration: 8},
];

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const round = (value) => Number(Number(value).toFixed(3));
const cueStart = (cueId) => {
  const cue = segmentById.get(cueId);
  if (!cue) throw new Error(`Missing cue: ${cueId}`);
  return Number(cue.start);
};

const splitExactText = (text, maxChars = 30) => {
  const chars = [...text];
  const chunks = [];
  let current = '';
  for (const char of chars) {
    current += char;
    const punctuationBreak = /[。！？；]/u.test(char) && [...current].length >= 10;
    const softBreak = /[，、：]/u.test(char) && [...current].length >= 20;
    if (punctuationBreak || softBreak || [...current].length >= maxChars) {
      chunks.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
};

const captionsFromSegments = (sourceSegments, mapTime = (time) => time) => {
  const result = [];
  for (const segment of sourceSegments) {
    const parts = splitExactText(segment.text);
    const weights = parts.map((part) => Math.max(1, [...part].filter((char) => !/\s/u.test(char)).length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = Number(segment.start);
    for (let index = 0; index < parts.length; index += 1) {
      const remainingEnd = Number(segment.end);
      const end = index === parts.length - 1
        ? remainingEnd
        : cursor + (Number(segment.end) - Number(segment.start)) * (weights[index] / totalWeight);
      result.push({
        id: `${segment.id}-${String(index + 1).padStart(2, '0')}`,
        start: round(mapTime(cursor)),
        end: round(mapTime(end)),
        text: parts[index],
        sourceCueId: segment.id,
      });
      cursor = end;
    }
  }
  return result.filter((caption) => caption.end > caption.start);
};

const visualMarkup = (type, prefix) => {
  const node = (label, x, y, focus = 0, extra = '') => `<div class="diagram-node reveal focus-target ${extra}" data-focus="${focus}" style="left:${x}px;top:${y}px"><span class="pulse-core">${esc(label)}</span></div>`;
  const paths = (...items) => `<svg class="diagram-svg" viewBox="0 0 1400 610" aria-hidden="true">${items.map((d, index) => `<path id="${prefix}-path-${index}" class="draw-path" d="${d}" />`).join('')}</svg>`;
  switch (type) {
    case 'pipeline':
      return `<div class="visual-world pipeline-world">
        ${paths('M150 310 C300 310 330 310 480 310', 'M620 310 C770 310 790 310 940 310', 'M1080 310 C1130 310 1160 310 1210 310')}
        ${node('离线建库', 70, 220, 0, 'node-large')}
        ${node('在线检索', 430, 220, 1, 'node-large')}
        ${node('智能体决策', 890, 220, 2, 'node-large')}
        ${node('生成与评测', 1110, 220, 3, 'node-large')}
        <div class="flow-token reveal" style="left:124px;top:294px"></div>
        <div class="plain-label reveal" style="left:380px;top:420px">文档 → 知识库 → 证据 → 答案</div>
      </div>`;
    case 'document':
      return `<div class="visual-world document-world">
        <div class="document-page reveal focus-target" data-focus="0" style="left:80px;top:72px">
          <strong>原始文档</strong><i></i><i></i><i class="short"></i><div class="table-grid"></div>
        </div>
        ${paths('M425 300 C535 300 560 300 670 300', 'M810 170 L940 170 L940 285', 'M810 300 L1030 300', 'M810 430 L940 430 L940 335')}
        <div class="document-badge reveal" style="left:478px;top:244px">结构保留</div>
        ${node('标题树', 700, 92, 1)}
        ${node('正文与条款', 970, 222, 2)}
        ${node('表格整块', 700, 352, 3)}
        ${node('页码 · 版本', 1090, 352, 4)}
        <div class="fallback-mark reveal" style="left:1070px;top:94px">复杂页 → 多模态兜底</div>
      </div>`;
    case 'chunk':
      return `<div class="visual-world chunk-world">
        <div class="source-ribbon reveal" style="left:70px;top:110px">
          <span>章节一：系统边界与输入</span><span>条款 4.1：施工条件与验收要求</span><span>表格：材料参数与版本</span><span>章节二：异常处理</span>
        </div>
        <div class="cut-mark" style="left:382px;top:90px"></div><div class="cut-mark" style="left:704px;top:90px"></div><div class="cut-mark" style="left:1026px;top:90px"></div>
        <div class="chunk-piece reveal focus-target" data-focus="0" style="left:92px;top:300px"><b>结构块</b><small>祖先标题</small></div>
        <div class="chunk-piece reveal focus-target" data-focus="1" style="left:414px;top:300px"><b>条款块</b><small>页码 · 条文号</small></div>
        <div class="chunk-piece reveal focus-target" data-focus="2" style="left:736px;top:300px"><b>表格块</b><small>表头上下文</small></div>
        <div class="chunk-piece reveal focus-target" data-focus="3" style="left:1058px;top:300px"><b>语义块</b><small>检索 / 合成解耦</small></div>
        <div class="plain-label reveal" style="left:310px;top:530px">来源 · 章节 · 页码 · 版本，一起进入索引</div>
      </div>`;
    case 'context':
      return `<div class="visual-world context-world">
        <div class="orphan-sentence reveal focus-target" data-focus="1" style="left:190px;top:245px"><em>它</em>的定价是每月 50 元</div>
        <div class="question-ring reveal" style="left:112px;top:204px">?</div>
        ${paths('M610 300 C760 300 775 300 915 300')}
        <div class="context-prefix reveal focus-target" data-focus="2" style="left:790px;top:138px"><small>上下文前缀</small><strong>本段讨论企业知识库专业版</strong></div>
        <div class="resolved-sentence reveal focus-target" data-focus="3" style="left:860px;top:330px"><em>专业版</em>的定价是每月 50 元</div>
        <div class="metric-drop reveal focus-target" data-focus="4" style="left:1040px;top:500px"><span>5.7%</span><i>→</i><strong>1.9%</strong></div>
      </div>`;
    case 'embedding':
      return `<div class="visual-world embedding-world">
        <div class="term-cloud" style="left:80px;top:145px">
          <span class="reveal focus-target" data-focus="0">设备故障</span><span class="reveal focus-target" data-focus="1">检修步骤</span><span class="reveal focus-target" data-focus="2">质量验收</span>
        </div>
        ${paths('M390 205 C520 205 570 230 650 270', 'M390 305 C520 305 570 300 650 300', 'M390 405 C520 405 570 370 650 330')}
        <div class="vector-axis reveal" style="left:660px;top:50px"><span>x₁</span><i></i><b>x₂</b></div>
        ${Array.from({length: 14}, (_, index) => `<i class="vector-dot scatter-node" style="left:${760 + ((index * 83) % 470)}px;top:${100 + ((index * 137) % 390)}px"></i>`).join('')}
        <div class="vector-label reveal" style="left:860px;top:515px">语义距离决定候选邻近关系</div>
      </div>`;
    case 'index':
      return `<div class="visual-world index-world">
        <div class="db-cylinder reveal focus-target" data-focus="0" style="left:100px;top:150px"><span>pgvector</span><small>事务 · 联表 · 过滤</small></div>
        ${paths('M380 300 C500 300 520 300 630 300', 'M775 300 C930 300 960 300 1080 300')}
        <div class="index-gate reveal focus-target" data-focus="1" style="left:610px;top:205px"><strong>索引选择</strong><span>HNSW</span><span>IVF</span><span>Flat</span></div>
        <svg class="network-svg" viewBox="0 0 420 440" style="left:960px;top:80px">
          <path class="draw-path" d="M60 240 L150 80 L270 125 L350 250 L250 365 L110 350 Z M60 240 L270 125 M150 80 L250 365 M110 350 L350 250" />
          ${[[60,240],[150,80],[270,125],[350,250],[250,365],[110,350],[210,235]].map(([x,y], index) => `<circle class="network-node" data-focus="${index % 5}" cx="${x}" cy="${y}" r="${index === 6 ? 20 : 13}" />`).join('')}
        </svg>
        <div class="plain-label reveal" style="left:930px;top:525px">召回率 · P99 · 内存 · 运维</div>
      </div>`;
    case 'query':
      return `<div class="visual-world query-world">
        <div class="query-seed reveal focus-target" data-focus="0" style="left:90px;top:230px">用户查询</div>
        ${paths('M330 300 C470 300 500 300 610 300', 'M760 300 C850 210 900 170 1010 150', 'M760 300 C880 300 900 300 1010 300', 'M760 300 C850 390 900 430 1010 450')}
        <div class="router-node reveal focus-target" data-focus="1" style="left:590px;top:220px">复杂度路由</div>
        ${node('直接回答', 1030, 80, 2)}${node('单次检索', 1030, 230, 3)}${node('改写 / 多跳', 1030, 380, 4)}
        <div class="query-methods reveal" style="left:410px;top:500px">多查询 · HyDE · 后退一步 · 问题分解</div>
      </div>`;
    case 'retrieval':
      return `<div class="visual-world retrieval-world">
        ${['向量语义','BM25 关键词','编号精确','表格检索'].map((label, index) => `<div class="retrieval-lane focus-target" data-focus="${index + 1}" style="top:${92 + index * 116}px"><strong>${label}</strong><i></i>${Array.from({length: 3}, (_, tokenIndex) => `<span class="lane-token" style="left:${260 + tokenIndex * 90}px"></span>`).join('')}</div>`).join('')}
        <div class="retrieval-query reveal focus-target" data-focus="0" style="left:42px;top:235px">查询</div>
        <div class="candidate-pool reveal focus-target" data-focus="5" style="left:1130px;top:190px"><strong>候选池</strong><span>互补召回</span></div>
        ${paths('M1040 150 C1120 150 1120 230 1180 250', 'M1040 266 C1120 266 1120 270 1180 280', 'M1040 382 C1120 382 1120 310 1180 310', 'M1040 498 C1120 498 1120 350 1180 340')}
      </div>`;
    case 'fusion':
      return `<div class="visual-world fusion-world">
        <div class="rank-column reveal" style="left:80px;top:80px"><strong>向量名次</strong><span>A · 1</span><span>C · 2</span><span>B · 3</span></div>
        <div class="rank-column reveal" style="left:390px;top:80px"><strong>全文名次</strong><span>B · 1</span><span>A · 2</span><span>D · 3</span></div>
        <div class="rrf-symbol reveal focus-target" data-focus="2" style="left:740px;top:185px">只比较名次</div>
        ${paths('M305 270 C520 270 590 270 740 270', 'M615 270 C670 270 690 270 740 270', 'M930 270 C1010 270 1040 270 1110 270')}
        <div class="rank-column final-rank reveal focus-target" data-focus="3" style="left:1090px;top:80px"><strong>RRF 融合</strong><span>A · 1</span><span>B · 2</span><span>C · 3</span></div>
        <div class="plain-label reveal" style="left:520px;top:510px">尺度无关 · 简单鲁棒 · 可解释加权</div>
      </div>`;
    case 'rerank':
      return `<div class="visual-world rerank-world">
        <div class="candidate-field" style="left:80px;top:80px">${Array.from({length: 20}, (_, index) => `<i class="candidate-dot scatter-node" style="left:${(index % 5) * 74}px;top:${Math.floor(index / 5) * 86}px"></i>`).join('')}<strong>粗召回 50</strong></div>
        ${paths('M500 300 C620 300 650 300 760 300', 'M930 300 C1030 300 1060 300 1140 300')}
        <div class="encoder-lens reveal focus-target" data-focus="2" style="left:720px;top:175px"><strong>交叉编码器</strong><small>query × document</small></div>
        <div class="top-results reveal focus-target" data-focus="3" style="left:1120px;top:125px"><span>01</span><span>02</span><span>03</span><span>04</span><span>05</span><strong>精排 Top 5</strong></div>
        <div class="plain-label reveal" style="left:520px;top:520px">快而粗 → 慢而准</div>
      </div>`;
    case 'agent':
      return `<div class="visual-world agent-world">
        ${paths('M250 300 C250 150 440 100 590 180', 'M720 180 C900 100 1100 170 1110 300', 'M1110 330 C1080 490 870 510 720 420', 'M590 420 C410 510 250 455 250 330', 'M590 180 C640 230 640 370 590 420')}
        ${node('检索证据', 125, 230, 0, 'agent-node')}${node('充分性评估', 520, 80, 1, 'agent-node')}${node('生成答案', 1040, 230, 2, 'agent-node')}${node('改写重检', 520, 390, 3, 'agent-node')}
        <div class="reject-node reveal focus-target" data-focus="4" style="left:600px;top:238px">实在不够 → 拒答</div>
        <div class="agent-token reveal" style="left:235px;top:293px"></div>
        <div class="plain-label reveal" style="left:430px;top:545px">最大跳数限制 · 防止死循环</div>
      </div>`;
    case 'generation':
      return `<div class="visual-world generation-world">
        <div class="evidence-stack" style="left:60px;top:78px">
          <div class="evidence-snippet reveal focus-target" data-focus="0"><b>[1] 施工规范 · 第 12 页</b><span>关键条款与适用条件</span></div>
          <div class="evidence-snippet reveal focus-target" data-focus="1"><b>[2] 工艺手册 · 第 4 章</b><span>步骤、限制与异常处理</span></div>
          <div class="evidence-snippet reveal focus-target" data-focus="2"><b>[3] 版本记录 · v3</b><span>更新时间与责任来源</span></div>
        </div>
        ${paths('M530 170 C690 170 720 215 840 235', 'M530 300 C700 300 730 300 840 300', 'M530 430 C690 430 720 385 840 365')}
        <div class="answer-sheet reveal focus-target" data-focus="3" style="left:820px;top:92px"><strong>可信答案</strong><p>事实陈述对应证据 [1]</p><p>步骤结论对应证据 [2]</p><p>版本信息对应证据 [3]</p><small>支持性检查 · 引用校验</small></div>
      </div>`;
    case 'evaluation':
      return `<div class="visual-world evaluation-world">
        <div class="metric-bars" style="left:70px;top:80px">
          ${[['忠实度',0.9],['答案相关性',0.82],['上下文精度',0.76],['上下文召回率',0.86]].map(([label,value], index) => `<div class="metric-row focus-target" data-focus="${index + 1}"><strong>${label}</strong><i><span class="bar-fill" data-fill="${value}"></span></i></div>`).join('')}
        </div>
        <div class="trace-line reveal" style="left:720px;top:130px">
          <span>查询</span><b></b><span>改写</span><b></b><span>召回</span><b></b><span>排序</span><b></b><span>引用</span>
        </div>
        <div class="issue-loop reveal focus-target" data-focus="5" style="left:850px;top:310px"><strong>问题样例</strong><i>定位具体环节</i><span>回流迭代</span></div>
        <div class="plain-label reveal" style="left:830px;top:520px">黄金问答集 + 真实调用链</div>
      </div>`;
    case 'production':
      return `<div class="visual-world production-world">
        <div class="production-rail" style="left:80px;top:250px"><i></i><span class="rail-token"></span></div>
        ${node('提示词缓存', 90, 120, 1)}${node('防提示词注入', 410, 360, 2)}${node('增量索引', 730, 120, 3)}${node('版本管理', 1010, 360, 4)}
        <div class="monitor-ring reveal focus-target" data-focus="5" style="left:1170px;top:125px"><strong>监控</strong><span>SLA</span><span>P99</span><span>成本</span></div>
        <div class="plain-label reveal" style="left:400px;top:530px">缓存配增强 · 版本配增量 · 安全配过滤</div>
      </div>`;
    case 'summary':
      return `<div class="visual-world summary-world">
        ${paths('M110 250 C260 250 300 250 430 250', 'M570 250 C700 250 730 250 860 250', 'M1000 250 C1080 250 1120 250 1200 250')}
        ${node('离线建库', 50, 165, 0, 'node-large')}${node('在线检索', 400, 165, 1, 'node-large')}${node('智能体决策', 830, 165, 2, 'node-large')}${node('评测闭环', 1110, 165, 3, 'node-large')}
        <div class="summary-principles" style="left:190px;top:420px"><strong class="reveal">组合判断</strong><strong class="reveal">指标验证</strong><strong class="reveal">持续迭代</strong></div>
      </div>`;
    default:
      throw new Error(`Unsupported visual type: ${type}`);
  }
};

const baseCss = `
  @font-face{font-family:'Noto Sans SC';src:local('Noto Sans SC');font-weight:100 900}
  @font-face{font-family:'Microsoft YaHei';src:local('Microsoft YaHei');font-weight:400 800}
  @font-face{font-family:JetBrainsMono;src:url('./assets/JetBrainsMono-400.woff2') format('woff2');font-weight:400}
  @font-face{font-family:JetBrainsMono;src:url('./assets/JetBrainsMono-700.woff2') format('woff2');font-weight:700}
  *{box-sizing:border-box}
  html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:${COLORS.background};font-family:Inter,'Noto Sans SC','Microsoft YaHei',sans-serif;color:${COLORS.ink}}
  #root{position:relative;width:1920px;height:1080px;overflow:hidden}
  .clip{position:absolute}
  .stage-scene{inset:0;width:1920px;height:1080px;overflow:hidden}
  .stage-fill{position:absolute;inset:0;background:${COLORS.background};overflow:hidden;z-index:0}
  .stage-fill::before{content:'';position:absolute;left:0;right:0;top:126px;height:2px;background:${COLORS.line}}
  .stage-fill::after{content:'';position:absolute;left:96px;right:96px;bottom:143px;height:1px;background:${COLORS.line}}
  .stage-header{position:absolute;left:96px;right:96px;top:48px;height:64px;display:flex;align-items:center;gap:22px;letter-spacing:0;z-index:2}
  .stage-kicker{font-family:JetBrainsMono,monospace;font-size:20px;font-weight:700;color:${COLORS.ink}}
  .stage-header h1{margin:0;font-size:46px;line-height:1;font-weight:800;letter-spacing:0}
  .stage-progress{margin-left:auto;display:flex;gap:8px;align-items:center}
  .stage-progress i{display:block;width:34px;height:5px;background:${COLORS.line}}
  .stage-progress i.done{background:${COLORS.primary}}
  .canvas-shell{position:absolute;left:96px;top:150px;width:1728px;height:730px;overflow:hidden;z-index:2}
  .canvas-shell.has-host .visual-world{width:1260px}
  .visual-world{position:absolute;left:0;top:0;width:1400px;height:610px;transform-origin:50% 50%;overflow:visible}
  .diagram-svg{position:absolute;left:0;top:0;width:1400px;height:610px;overflow:visible}
  .draw-path{fill:none;stroke:${COLORS.primary};stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
  .diagram-node{position:absolute;width:230px;height:146px;display:grid;place-items:center;text-align:center;font-size:30px;font-weight:800;letter-spacing:0;color:${COLORS.ink};background:${COLORS.background};z-index:2}
  .diagram-node::before{content:'';position:absolute;inset:18px;border:3px solid ${COLORS.primary};border-radius:50%;opacity:.22}
  .diagram-node.node-large{width:250px;height:180px;font-size:31px}
  .pulse-core{position:relative;display:block;max-width:210px}
  .plain-label{position:absolute;font-size:30px;font-weight:700;color:${COLORS.muted};letter-spacing:0}
  .flow-token,.agent-token,.lane-token,.rail-token{position:absolute;width:22px;height:22px;border-radius:50%;background:${COLORS.secondary};box-shadow:0 0 0 10px rgba(169,78,54,.13);z-index:1}
  .host-figure{position:absolute;right:10px;bottom:0;width:430px;height:690px;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 16px 20px rgba(70,42,26,.14))}
  .state-note{position:absolute;left:80px;right:80px;bottom:26px;min-height:86px;display:flex;align-items:center;font-size:62px;line-height:1.1;font-weight:800;color:${COLORS.primary};letter-spacing:0;opacity:0;visibility:hidden}
  .state-note::before{content:'';width:54px;height:6px;background:${COLORS.secondary};margin-right:22px;flex:none}
  .caption-cue{left:96px;top:926px;width:1728px;height:92px;padding:0 30px;display:flex;align-items:center;background:rgba(251,243,231,.96);border-top:3px solid ${COLORS.primary};font-size:29px;font-weight:600;line-height:1.42;letter-spacing:0;overflow:hidden;z-index:200}
  .caption-cue span{display:block;width:100%;max-height:82px;overflow:hidden}
  .document-page{position:absolute;width:330px;height:410px;padding:34px;background:${COLORS.surface};border:3px solid ${COLORS.ink};box-shadow:12px 16px 0 rgba(73,105,88,.12);transform:rotate(-2deg)}
  .document-page strong{display:block;font-size:31px;margin-bottom:28px}
  .document-page i{display:block;width:100%;height:7px;background:${COLORS.line};margin:15px 0}.document-page i.short{width:62%}
  .table-grid{height:120px;margin-top:28px;border:3px solid ${COLORS.primary};background:linear-gradient(90deg,transparent 49%,${COLORS.line} 50%,transparent 51%),linear-gradient(0deg,transparent 49%,${COLORS.line} 50%,transparent 51%);background-size:50% 50%}
  .document-badge,.fallback-mark{position:absolute;font-size:26px;font-weight:800;color:${COLORS.secondary}}
  .source-ribbon{position:absolute;width:1260px;height:134px;display:grid;grid-template-columns:repeat(4,1fr);border-top:4px solid ${COLORS.ink};border-bottom:4px solid ${COLORS.ink}}
  .source-ribbon span{display:flex;align-items:center;padding:20px;font-size:24px;font-weight:700;border-right:2px solid ${COLORS.line}}
  .cut-mark{position:absolute;width:5px;height:185px;background:${COLORS.secondary};transform-origin:50% 0}
  .chunk-piece{position:absolute;width:276px;height:150px;padding:26px 24px;border-top:6px solid ${COLORS.primary};background:rgba(251,243,231,.72)}
  .chunk-piece b{display:block;font-size:35px}.chunk-piece small{display:block;margin-top:18px;font-size:22px;color:${COLORS.muted}}
  .orphan-sentence,.resolved-sentence{position:absolute;font-size:47px;font-weight:800}.orphan-sentence em,.resolved-sentence em{font-style:normal;color:${COLORS.secondary};font-size:72px}
  .question-ring{position:absolute;width:72px;height:72px;border:4px solid ${COLORS.secondary};border-radius:50%;display:grid;place-items:center;font-size:48px;font-weight:900;color:${COLORS.secondary}}
  .context-prefix{position:absolute;width:500px;padding:28px 0;border-top:5px solid ${COLORS.primary}}
  .context-prefix small{display:block;font:700 19px JetBrainsMono;color:${COLORS.secondary};margin-bottom:15px}.context-prefix strong{font-size:34px}
  .metric-drop{position:absolute;display:flex;align-items:center;gap:24px;font:700 42px JetBrainsMono}.metric-drop strong{color:${COLORS.primary};font-size:60px}.metric-drop span{color:${COLORS.muted}}
  .term-cloud{position:absolute;width:340px;display:grid;gap:42px}.term-cloud span{font-size:42px;font-weight:800;color:${COLORS.ink}}
  .vector-axis{position:absolute;width:650px;height:470px;border-left:4px solid ${COLORS.ink};border-bottom:4px solid ${COLORS.ink}}.vector-axis span{position:absolute;left:10px;top:10px}.vector-axis b{position:absolute;right:10px;bottom:10px}
  .vector-dot{position:absolute;width:18px;height:18px;border-radius:50%;background:${COLORS.primary}}.vector-dot:nth-of-type(3n){background:${COLORS.secondary}}.vector-label{position:absolute;font-size:26px;font-weight:700;color:${COLORS.muted}}
  .db-cylinder{position:absolute;width:310px;height:280px;border:4px solid ${COLORS.primary};border-radius:50% / 18%;display:grid;place-items:center;text-align:center;background:rgba(251,243,231,.55)}.db-cylinder::before{content:'';position:absolute;left:-4px;right:-4px;top:42px;border-top:4px solid ${COLORS.primary};border-radius:50%}.db-cylinder span{font:700 42px JetBrainsMono}.db-cylinder small{font-size:23px;color:${COLORS.muted}}
  .index-gate{position:absolute;width:240px;height:210px;border-left:6px solid ${COLORS.secondary};padding:24px}.index-gate strong{display:block;font-size:30px;margin-bottom:20px}.index-gate span{display:inline-block;font:700 22px JetBrainsMono;margin:7px 12px 7px 0}
  .network-svg{position:absolute;width:420px;height:440px}.network-svg path{fill:none;stroke:${COLORS.line};stroke-width:4}.network-node{fill:${COLORS.primary};stroke:${COLORS.surface};stroke-width:4}
  .query-seed,.router-node{position:absolute;width:260px;height:140px;display:grid;place-items:center;font-size:35px;font-weight:800}.query-seed{border-bottom:7px solid ${COLORS.secondary}}.router-node{border:4px solid ${COLORS.primary};border-radius:50%}
  .query-methods{position:absolute;font-size:30px;font-weight:700;color:${COLORS.muted}}
  .retrieval-lane{position:absolute;left:260px;width:780px;height:76px;border-bottom:4px solid ${COLORS.line}}.retrieval-lane strong{position:absolute;left:0;bottom:20px;width:210px;font-size:26px;background:${COLORS.background};z-index:2}.retrieval-lane i{position:absolute;left:210px;right:0;bottom:-4px;height:4px;background:${COLORS.primary}}.retrieval-lane .lane-token{top:31px;width:16px;height:16px}
  .retrieval-query{position:absolute;width:150px;height:150px;border:4px solid ${COLORS.secondary};border-radius:50%;display:grid;place-items:center;font-size:32px;font-weight:800}.candidate-pool{position:absolute;width:230px;height:230px;border:5px solid ${COLORS.primary};border-radius:50%;display:grid;place-items:center;text-align:center}.candidate-pool strong{font-size:35px}.candidate-pool span{font-size:22px;color:${COLORS.muted}}
  .rank-column{position:absolute;width:230px;padding-top:20px;border-top:6px solid ${COLORS.primary}}.rank-column strong{display:block;font-size:30px;margin-bottom:22px}.rank-column span{display:block;font:700 25px JetBrainsMono;padding:15px 0;border-bottom:2px solid ${COLORS.line}}.final-rank{border-color:${COLORS.secondary}}
  .rrf-symbol{position:absolute;font-size:44px;font-weight:900;color:${COLORS.secondary}}
  .candidate-field{position:absolute;width:390px;height:420px}.candidate-dot{position:absolute;width:36px;height:36px;border-radius:50%;background:${COLORS.line}}.candidate-field strong{position:absolute;bottom:-5px;left:0;font-size:30px}
  .encoder-lens{position:absolute;width:260px;height:260px;border:10px solid ${COLORS.primary};border-radius:50%;display:grid;place-items:center;text-align:center;box-shadow:0 0 0 22px rgba(73,105,88,.12)}.encoder-lens strong{font-size:31px}.encoder-lens small{font:700 18px JetBrainsMono}
  .top-results{position:absolute;display:flex;gap:13px;align-items:flex-end}.top-results span{width:52px;height:240px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:16px;background:${COLORS.primary};color:${COLORS.surface};font:700 20px JetBrainsMono}.top-results span:nth-child(n+4){height:150px;background:${COLORS.line};color:${COLORS.ink}}.top-results strong{position:absolute;left:0;top:270px;width:300px;font-size:30px}
  .agent-node{width:260px}.reject-node{position:absolute;width:280px;height:120px;display:grid;place-items:center;border-top:6px solid ${COLORS.secondary};font-size:26px;font-weight:800}
  .evidence-stack{position:absolute;width:500px;display:grid;gap:22px}.evidence-snippet{padding:22px 24px;border-left:6px solid ${COLORS.primary};background:rgba(251,243,231,.72)}.evidence-snippet b{display:block;font-size:24px}.evidence-snippet span{display:block;margin-top:12px;font-size:22px;color:${COLORS.muted}}
  .answer-sheet{position:absolute;width:500px;height:430px;padding:34px 42px;border-top:8px solid ${COLORS.secondary};background:${COLORS.surface};box-shadow:14px 16px 0 rgba(73,105,88,.11)}.answer-sheet strong{font-size:46px}.answer-sheet p{font-size:27px;margin:30px 0;border-bottom:2px solid ${COLORS.line};padding-bottom:12px}.answer-sheet small{font-size:21px;color:${COLORS.muted}}
  .metric-bars{position:absolute;width:560px;display:grid;gap:38px}.metric-row strong{display:block;font-size:25px;margin-bottom:10px}.metric-row>i{display:block;width:540px;height:20px;background:${COLORS.line};overflow:hidden}.bar-fill{display:block;width:100%;height:100%;background:${COLORS.primary};transform-origin:0 50%}
  .trace-line{position:absolute;width:600px;display:flex;align-items:center;gap:14px}.trace-line span{font-size:24px;font-weight:800}.trace-line b{display:block;width:45px;height:4px;background:${COLORS.secondary}}
  .issue-loop{position:absolute;width:340px;height:170px;border:5px solid ${COLORS.primary};border-radius:50%;display:grid;place-items:center;text-align:center}.issue-loop strong{font-size:31px}.issue-loop i{font-style:normal;color:${COLORS.primary};font-weight:800}.issue-loop span{font-size:22px}
  .production-rail{position:absolute;width:1080px;height:32px}.production-rail i{position:absolute;left:0;right:0;top:14px;height:5px;background:${COLORS.primary}}.production-rail .rail-token{top:5px;left:0}
  .monitor-ring{position:absolute;width:240px;height:240px;border:6px solid ${COLORS.secondary};border-radius:50%;display:grid;place-items:center;text-align:center}.monitor-ring strong{font-size:38px}.monitor-ring span{font:700 21px JetBrainsMono}
  .summary-principles{position:absolute;display:flex;gap:90px}.summary-principles strong{font-size:46px;color:${COLORS.secondary}}
`;

const renderScene = (chapter, start, end, chapterIndex, chapterCount, localStateTimes = null) => {
  const prefix = `scene-${chapter.id}`;
  const duration = round(end - start);
  const stateTimes = chapter.states.map(([cueId], index) => localStateTimes
    ? round(start + localStateTimes[index % localStateTimes.length])
    : round(cueStart(cueId)));
  const progress = Array.from({length: chapterCount}, (_, index) => `<i class="${index <= chapterIndex ? 'done' : ''}"></i>`).join('');
  return `<section id="${prefix}" class="clip stage-scene" data-visual="${chapter.visual}" data-start="${round(start)}" data-duration="${duration}" data-track-index="1">
    <div class="stage-fill" data-layout-ignore></div>
    <header class="stage-header" id="${prefix}-header">
      <span class="stage-kicker">阶段 ${String(chapterIndex + 1).padStart(2, '0')}</span>
      <h1>${esc(chapter.stage)}</h1>
      <div class="stage-progress">${progress}</div>
    </header>
    <div class="canvas-shell ${chapter.showHost ? 'has-host' : ''}">
      ${visualMarkup(chapter.visual, prefix)}
      ${chapter.showHost ? `<img class="host-figure reveal" src="./assets/host/${chapter.hostPose}.png" alt="" />` : ''}
      ${chapter.states.map(([, label], index) => `<div class="state-note" id="${prefix}-state-${index}" data-at="${stateTimes[index]}">${esc(label)}</div>`).join('')}
    </div>
  </section>`;
};

const renderCaptions = (captions) => captions.map((caption, index) => `<div id="caption-${String(index + 1).padStart(4, '0')}" class="clip caption-cue" data-start="${caption.start}" data-duration="${round(caption.end - caption.start)}" data-track-index="30" data-source-cue="${caption.sourceCueId}"><span>${esc(caption.text)}</span></div>`).join('\n');

const timelineScript = (compositionId) => `<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({paused:true});
  document.querySelectorAll('.stage-scene').forEach((scene) => {
    const sceneStart = Number(scene.dataset.start);
    const sceneDuration = Number(scene.dataset.duration);
    const scope = '#' + scene.id;
    tl.fromTo(scope + ' .stage-header', {opacity:0,y:-20}, {opacity:1,y:0,duration:.52,ease:'power3.out'}, sceneStart + .12);
    tl.fromTo(scope + ' .visual-world', {opacity:0,scale:.975}, {opacity:1,scale:1,duration:.72,ease:'expo.out'}, sceneStart + .22);
    const revealItems = Array.from(scene.querySelectorAll('.reveal'));
    revealItems.forEach((element,index) => {
      const variants = [{x:-26,y:0,scale:1},{x:0,y:24,scale:1},{x:0,y:0,scale:.88},{x:28,y:0,scale:1}];
      const from = variants[index % variants.length];
      tl.fromTo(element,{opacity:0,...from},{opacity:1,x:0,y:0,scale:1,duration:.46 + (index % 3) * .08,ease:index % 2 ? 'power3.out' : 'expo.out'},sceneStart + .42 + Math.min(index * .06,.48));
    });
    scene.querySelectorAll('.draw-path').forEach((element,index) => {
      const length = Math.max(1, element.getTotalLength());
      element.style.strokeDasharray = String(length);
      element.style.strokeDashoffset = String(length);
      tl.to(element,{strokeDashoffset:0,duration:.58 + index * .08,ease:'power2.out'},sceneStart + .58 + index * .09);
    });
    scene.querySelectorAll('.cut-mark').forEach((element,index) => {
      tl.fromTo(element,{scaleY:0,opacity:0},{scaleY:1,opacity:1,duration:.42,ease:'power3.out'},sceneStart + .7 + index * .1);
    });
    scene.querySelectorAll('.scatter-node').forEach((element,index) => {
      const offsetX = ((index % 5) - 2) * 34;
      const offsetY = ((index % 4) - 1.5) * 28;
      tl.fromTo(element,{opacity:0,x:offsetX,y:offsetY,scale:.45},{opacity:1,x:0,y:0,scale:1,duration:.5,ease:'power3.out'},sceneStart + .7 + Math.min(index * .045,.5));
    });
    scene.querySelectorAll('.bar-fill').forEach((element,index) => {
      tl.fromTo(element,{scaleX:0},{scaleX:Number(element.dataset.fill || .8),duration:.8,ease:'power2.out'},sceneStart + .75 + index * .12);
    });
    scene.querySelectorAll('.lane-token').forEach((element,index) => {
      tl.fromTo(element,{opacity:0,x:-40},{opacity:1,x:560,duration:1.7 + (index % 3) * .25,ease:'power2.inOut'},sceneStart + .75 + (index % 3) * .16);
      tl.to(element,{opacity:0,duration:.18,ease:'power1.in'},sceneStart + 2.55 + (index % 3) * .2);
    });
    const railToken = scene.querySelector('.rail-token');
    if (railToken) tl.fromTo(railToken,{x:0},{x:1030,duration:2.8,ease:'power2.inOut'},sceneStart + .8);
    const flowToken = scene.querySelector('.flow-token');
    if (flowToken) tl.fromTo(flowToken,{x:0},{x:1160,duration:3.2,ease:'power2.inOut'},sceneStart + .85);
    const agentToken = scene.querySelector('.agent-token');
    if (agentToken) {
      tl.to(agentToken,{x:400,y:-155,duration:1.0,ease:'power2.inOut'},sceneStart + 1.0);
      tl.to(agentToken,{x:800,y:0,duration:1.0,ease:'power2.inOut'},sceneStart + 2.15);
      tl.to(agentToken,{x:400,y:150,duration:1.0,ease:'power2.inOut'},sceneStart + 3.3);
      tl.to(agentToken,{x:0,y:0,duration:1.0,ease:'power2.inOut'},sceneStart + 4.45);
    }
    const host = scene.querySelector('.host-figure');
    if (host && sceneDuration > 4) {
      const repeats = Math.max(0, Math.floor((sceneDuration - 1) / 4) - 1);
      tl.to(host,{y:-6,duration:2,ease:'sine.inOut',yoyo:true,repeat:repeats},sceneStart + 1.1);
    }
    const states = Array.from(scene.querySelectorAll('.state-note'));
    states.forEach((state,index) => {
      const at = Number(state.dataset.at);
      const nextAt = index < states.length - 1 ? Number(states[index + 1].dataset.at) : sceneStart + sceneDuration;
      tl.set(state,{visibility:'visible'},at);
      tl.fromTo(state,{opacity:0,x:-26},{opacity:1,x:0,duration:.38,ease:'power3.out'},at + .01);
      if (nextAt - at > .8) {
        tl.to(state,{opacity:0,x:18,duration:.2,ease:'power2.in'},Math.max(at + .5,nextAt - .24));
        tl.set(state,{visibility:'hidden'},nextAt);
      }
      const focus = scene.querySelector('[data-focus="' + index + '"] .pulse-core') || scene.querySelector('[data-focus="' + index + '"]');
      if (focus) {
        tl.to(focus,{scale:1.055,color:'${COLORS.primary}',duration:.28,ease:'power2.out'},at + .08);
        tl.to(focus,{scale:1,color:'${COLORS.ink}',duration:.42,ease:'power2.inOut'},at + .52);
      }
    });
  });
  window.__timelines['${compositionId}'] = tl;
</script>`;

const renderHtml = ({compositionId, title, duration, audioFile, scenes, captions}) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920,height=1080" />
  <title>${esc(title)}</title>
  <script src="./assets/gsap.min.js"></script>
  <style>${baseCss}</style>
</head>
<body>
  <div id="root" data-composition-id="${compositionId}" data-start="0" data-width="1920" data-height="1080" data-duration="${round(duration)}">
    <audio id="narration" class="clip" src="./assets/audio/${audioFile}" data-start="0" data-duration="${round(duration)}" data-track-index="50" data-volume="1"></audio>
    ${scenes.join('\n')}
    ${renderCaptions(captions)}
  </div>
  ${timelineScript(compositionId)}
</body>
</html>`;

const ensureDir = (dir) => fs.mkdir(dir, {recursive: true});

const copySharedAssets = async (targetDir, hostPoses = []) => {
  const assetsDir = path.join(targetDir, 'assets');
  await ensureDir(path.join(assetsDir, 'audio'));
  await ensureDir(path.join(assetsDir, 'host'));
  await fs.copyFile(path.join(oldProductionRoot, 'assets', 'runtime', 'gsap.min.js'), path.join(assetsDir, 'gsap.min.js'));
  await fs.copyFile(path.join(oldProductionRoot, 'assets', 'runtime', 'JetBrainsMono-400.woff2'), path.join(assetsDir, 'JetBrainsMono-400.woff2'));
  await fs.copyFile(path.join(oldProductionRoot, 'assets', 'runtime', 'JetBrainsMono-700.woff2'), path.join(assetsDir, 'JetBrainsMono-700.woff2'));
  for (const pose of new Set(hostPoses)) {
    await fs.copyFile(path.join(oldProductionRoot, 'assets', 'host', `${pose}.png`), path.join(assetsDir, 'host', `${pose}.png`));
  }
  await fs.copyFile(path.join(buildRoot, 'hyperframes.json'), path.join(targetDir, 'hyperframes.json'));
};

const ffprobeDuration = async (filePath) => {
  const {stdout} = await run('ffprobe.exe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath], {windowsHide:true});
  return Number(stdout.trim());
};

const extractProbeAudio = async (probe, destination) => {
  await run('ffmpeg.exe', [
    '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(probe.sourceStart), '-t', String(probe.duration), '-i', originalAudio,
    '-af', `afade=t=in:st=0:d=0.03,afade=t=out:st=${probe.duration - .08}:d=0.08`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', destination,
  ], {windowsHide:true, timeout:120_000});
};

const buildProbes = async () => {
  const receipts = [];
  for (const probe of PROBES) {
    const chapter = CHAPTERS.find((item) => item.id === probe.chapterId);
    const targetDir = path.join(buildRoot, 'probes', probe.id);
    await ensureDir(targetDir);
    await copySharedAssets(targetDir, chapter.showHost ? [chapter.hostPose] : []);
    const audioName = `${probe.id}.wav`;
    const audioPath = path.join(targetDir, 'assets', 'audio', audioName);
    await extractProbeAudio(probe, audioPath);
    const sourceSegments = segments.filter((segment) => Number(segment.end) > probe.sourceStart && Number(segment.start) < probe.sourceStart + probe.duration)
      .map((segment) => ({...segment, start:Math.max(Number(segment.start),probe.sourceStart), end:Math.min(Number(segment.end),probe.sourceStart + probe.duration)}));
    const captions = captionsFromSegments(sourceSegments, (time) => time - probe.sourceStart);
    const probeChapter = {...chapter, states:chapter.states.slice(0, 4)};
    const scenes = [renderScene(probeChapter, 0, probe.duration, 0, 1, [.8, 2.6, 4.5, 6.3])];
    const html = renderHtml({compositionId:`probe-${probe.id}`,title:`RAG semantic probe - ${probe.id}`,duration:probe.duration,audioFile:audioName,scenes,captions});
    await fs.writeFile(path.join(targetDir, 'index.html'), html, 'utf8');
    const motion = {duration:probe.duration,assertions:[
      {kind:'appearsBy',selector:`#scene-${chapter.id}-header`,bySec:.75},
      {kind:'before',a:`#scene-${chapter.id}-header`,b:`#scene-${chapter.id}-state-0`},
      {kind:'staysInFrame',selector:`#scene-${chapter.id} .visual-world`},
    ]};
    await fs.writeFile(path.join(targetDir, 'index.motion.json'), `${JSON.stringify(motion,null,2)}\n`, 'utf8');
    receipts.push({id:probe.id,sourceStart:probe.sourceStart,duration:probe.duration,audio:path.relative(buildRoot,audioPath).replaceAll('\\','/'),visual:chapter.visual});
  }
  await fs.writeFile(path.join(buildRoot, 'data', 'probe-manifest.json'), `${JSON.stringify({schemaVersion:'autovideo-semantic-probes/v1',projectId:'rag-full-chain-5m-20260728-r2',items:receipts},null,2)}\n`, 'utf8');
};

const buildEpisodes = async () => {
  try {
    await fs.access(episodeRecipePath);
  } catch {
    return {built:false,reason:'episode audio recipe does not exist yet'};
  }
  const recipe = JSON.parse(await fs.readFile(episodeRecipePath, 'utf8'));
  const outputs = [];
  for (const episode of [1, 2]) {
    const targetDir = path.join(buildRoot, `episode-${episode}`);
    const audio = recipe[`episode${episode}`];
    const audioSource = path.resolve(projectRoot, audio.path);
    const audioDuration = await ffprobeDuration(audioSource);
    await ensureDir(targetDir);
    const episodeChapters = CHAPTERS.filter((chapter) => chapter.episode === episode);
    const transitionHostPose = episode === 1 ? 'close' : 'explain';
    await copySharedAssets(targetDir, [
      ...episodeChapters.filter((chapter) => chapter.showHost).map((chapter) => chapter.hostPose),
      transitionHostPose,
    ]);
    const audioName = `episode-${episode}.internal.wav`;
    await fs.copyFile(audioSource, path.join(targetDir, 'assets', 'audio', audioName));

    let chapters = episodeChapters.map((chapter) => ({...chapter}));
    let captions;
    if (episode === 1) {
      const originalSegments = segments.filter((segment) => Number(segment.end) <= splitSeconds + .001);
      captions = captionsFromSegments(originalSegments);
      const bridgeSegments = audio.bridgeSegments.map((segment) => ({...segment,source:`bridge:${segment.id}`}));
      captions.push(...captionsFromSegments(bridgeSegments));
      chapters.push({
        episode:1,id:'upper-close',stage:'上集收束',visual:'summary',showHost:false,
        startAt:audio.bridgeStartSeconds,
        states:[
          ['bridge-upper-01','离线建库已经完成'],
          ['bridge-upper-02','下集从查询开始'],
        ],
      });
    } else {
      captions = captionsFromSegments(audio.bridgeSegments);
      const originalShift = Number(audio.originalStartAtSeconds) - splitSeconds;
      const originalSegments = segments.filter((segment) => Number(segment.start) >= splitSeconds - .001);
      captions.push(...captionsFromSegments(originalSegments, (time) => time + originalShift));
      chapters.unshift({
        episode:2,id:'lower-recap',stage:'上集回顾',visual:'pipeline',showHost:false,
        startAt:0,
        states:[
          ['bridge-lower-01','解析 · 分块 · 上下文增强'],
          ['bridge-lower-02','向量化 · 索引入库'],
        ],
      });
    }

    const timeMap = (time) => episode === 1 ? time : time + Number(audio.originalStartAtSeconds) - splitSeconds;
    const starts = chapters.map((chapter) => chapter.startAt ?? timeMap(cueStart(chapter.startCue)));
    const scenes = chapters.map((chapter,index) => {
      const start = starts[index];
      const end = index < chapters.length - 1 ? starts[index + 1] : audioDuration;
      let localStateTimes = null;
      if (chapter.id === 'upper-close') localStateTimes = [0.6, Math.max(2.4,(end-start)*.52)];
      if (chapter.id === 'lower-recap') localStateTimes = [0.7, Math.max(2.6,(end-start)*.56)];
      const timedChapter = localStateTimes ? chapter : {
        ...chapter,
        states:chapter.states.map(([cueId,label]) => [cueId,label]),
      };
      if (!localStateTimes && episode === 2) {
        const stateTimes = timedChapter.states.map(([cueId]) => round(timeMap(cueStart(cueId)) - start));
        localStateTimes = stateTimes;
      }
      return renderScene(timedChapter,start,end,index,chapters.length,localStateTimes);
    });
    const compositionId = `rag-semantic-v2-episode-${episode}`;
    const html = renderHtml({compositionId,title:`RAG 全链路 ${episode === 1 ? '上集：离线建库' : '下集：在线链路'}`,duration:audioDuration,audioFile:audioName,scenes,captions});
    await fs.writeFile(path.join(targetDir, 'index.html'), html, 'utf8');
    const motion = {duration:round(audioDuration),assertions:[
      {kind:'appearsBy',selector:`#${episode === 1 ? 'scene-overview' : 'scene-lower-recap'}-header`,bySec:round(audioDuration / 299 + .4)},
      {kind:'staysInFrame',selector:`#${episode === 1 ? 'scene-overview' : 'scene-lower-recap'} .visual-world`},
    ]};
    await fs.writeFile(path.join(targetDir, 'index.motion.json'), `${JSON.stringify(motion,null,2)}\n`, 'utf8');
    outputs.push({episode,durationSeconds:round(audioDuration),path:path.relative(buildRoot,targetDir).replaceAll('\\','/'),chapterCount:chapters.length,captionCount:captions.length});
  }
  await fs.writeFile(path.join(buildRoot, 'data', 'episode-build-manifest.json'), `${JSON.stringify({schemaVersion:'autovideo-semantic-episodes/v1',outputs},null,2)}\n`, 'utf8');
  return {built:true,outputs};
};

await ensureDir(path.join(buildRoot, 'data'));
await buildProbes();
const episodeResult = await buildEpisodes();
const semanticPlan = {
  schemaVersion:'autovideo-semantic-visual-plan/v1',
  projectId:'rag-full-chain-5m-20260728-r2',
  splitSeconds,
  originalDuration,
  baseStyle:'modern-ip-host-explainer',
  projectOverride:'host appears only at chapter openings/transitions/summaries; semantic diagrams may use the full canvas',
  forbidden:['fake-terminal','fake-code','input-process-output-mock','equal-card-grid','verbatim-narration-on-main-stage','full-panel-crossfade'],
  officialReuse:{registryItems:['flowchart','data-chart'],motionRules:['svg-path-draw','stat-bars-and-fills','viewport-change','spring-pop-entrance']},
  chapters:CHAPTERS,
  episodes:episodeResult,
};
await fs.writeFile(path.join(buildRoot, 'data', 'semantic-plan.json'), `${JSON.stringify(semanticPlan,null,2)}\n`, 'utf8');
console.log(JSON.stringify({ok:true,probes:PROBES.length,episodes:episodeResult},null,2));
