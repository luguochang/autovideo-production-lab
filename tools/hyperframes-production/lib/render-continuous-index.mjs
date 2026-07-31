import { escapeHtml, round3 } from './common.mjs';

const COLORS = {
  background: '#F2DFC7',
  surface: '#FBF3E7',
  ink: '#2A211B',
  muted: '#675748',
  primary: '#496958',
  secondary: '#A94E36',
  secondaryText: '#A14A33',
  line: '#DCC2A3',
};

const TECHNICAL_TERMS = [
  'Claude Code', 'AI技术', '敬畏', '并不简单', '擦亮双眼', '底层逻辑', '演示流程', '五个原因',
  '模型调用', 'API连接', '工作流工具', '工具链调度', '快速上手', '拖拽节点', '系统架构',
  '原型能力', '产品能力', '工程底座', '展示结果', '展示维护', '弯道超车', '表达需求',
  '生成原型', '不懂代码', '不懂系统', '不懂工程', '自欺欺人', '任务边界', '工具调用',
  '权限控制', '回滚机制', '成本控制', '隐私安全', '状态管理', '边界条件', '上下文',
  'AI补丁', '系统学习', '学习路线', 'Agent集群', '上线产品', '基础设施', '可维护',
  '理解', '判断', '负责', '珍贵', '廉价', 'Claude Code', '工作流', '提示词', '向量库',
  '工具链', 'Agent', 'Codex', 'Coze', 'Dify',
  'Engineering', 'Magic', 'Demo', 'Token', 'MCP', 'API', 'AI技术', 'AI', '系统', '工程', '开发',
  '维护', '产品', '业务', '模型', '代码', '架构', '数据', '日志', '监控', '测试', '回滚', '可靠',
  '安全', '失败', '复杂性', '接口', '权限', '智能体', '玩具', '工具', '软件', '创业', '薪资',
];

const STOP_WORDS = new Set([
  '我', '你', '他', '它', '他们', '我们', '大家', '这个', '这些', '一种', '一个', '一些', '很多',
  '就是', '其实', '但是', '而且', '因为', '所以', '如果', '然后', '最后', '现在', '今年', '时候',
  '已经', '可以', '能够', '应该', '需要', '不是', '并不', '没有', '有的', '非常', '真正', '完全',
  '第一', '第二', '第三', '第四', '第五', '第一点', '第二点', '第三点', '第四点', '第五点',
  '告诉', '觉得', '看到', '希望', '奉劝', '要有', '之心', '一定', '一下', '起来', '出来', '进去',
  '进行', '东西', '问题',
  '你想', '尤其是', '不只是', '怎么', '如何', '是否', '什么', '哪里', '为什么', '怎么办',
  '该怎么', '该如何', '能不能', '有没有', '想的', '所谓', '来说', '的话', '这一点', '这部分',
  '那么', '简单', '市场', '明确', '原因', '对照', '自己', '误以为', '好处', '不知道', '漂亮',
  '视频', '疯狂', '展示', '于是', '强烈', '心理', '一部分', '这种', '我不会', '有些人',
  '不能', '至少', '回答', '处理', '机制', '别人', '以后', '他用', '一定是', '实话', '有人',
  '上来', '不上来', '地学', '随便', '当作', '一遍', '变得', '动作', '三周',
  '上有', '普通', '后面', '确实', '进一步', '来去', '打得', '不错', '整理', '才是', '消耗',
  '无数', '清晰', '坏处', '擅长', '每次', '不需要', '工作', '决定', '一点',
]);

export const VISUAL_VARIANTS = ['focus', 'signal', 'stack', 'route', 'contrast', 'close'];
export const INTRO_PADDING_SECONDS = 0.35;

const addStableHfIds = (html) => {
  let index = 0;
  return html.replace(/<(div|span|strong|svg|path|line|circle|rect|img|audio|figure|figcaption)\b([^>]*)>/g, (match, tag, attributes) => {
    if (/\bdata-hf-id=/.test(attributes)) return match;
    index += 1;
    return `<${tag} data-hf-id="auto-${String(index).padStart(3, '0')}-${tag}"${attributes}>`;
  });
};

const RECIPE_VARIANTS = {
  'keyword-handoff': 'focus',
  'evidence-pivot': 'signal',
  'device-surface-tour': 'signal',
  'diagram-build': 'route',
  'data-proof': 'signal',
  'comparison-split': 'contrast',
  'code-proof': 'stack',
  'object-metaphor': 'focus',
};

const SEMANTIC_ALIASES = [
  [/并不是[^。！？]*简单/, '并不简单'],
  [/底层逻辑[^。！？]*不清晰/, '认知不清'],
  [/成本是否可控/, '成本可控'],
  [/(别人[^。！？]*维护|被别人[^。！？]*维护)/, '可维护'],
  [/(出了?Bug[^。！？]*补丁|AI[^。！？]*补丁)/i, 'AI补丁'],
  [/(回答得上来吗|回答不上来|有人回答)/, '能否回答'],
  [/(真正地学起来|系统地过一遍)/, '系统学习'],
  [/(能够上线的产品|上线的产品)/, '上线产品'],
  [/降低[^。！？]*门槛/, '降低门槛'],
  [/不需要懂代码[^。！？]*不需要懂系统[^。！？]*不需要懂工程/, '工程捷径'],
];

const REJECTED_TERM_PATTERNS = [
  /^(你想|尤其是|不只是|怎么|如何|是否|什么|哪里|为什么|怎么办|该怎么|该如何|能不能|有没有)$/,
  /^(这个|这些|一种|一个|一些|很多|真正|完全|非常)(人|东西|问题)?$/,
];

const ICONS = {
  focus: '<circle cx="12" cy="12" r="3"></circle><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>',
  route: '<circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle>',
  contrast: '<path d="M7 11v4a2 2 0 0 0 2 2h4"></path><rect width="8" height="8" x="3" y="3" rx="2"></rect><rect width="8" height="8" x="13" y="13" rx="2"></rect>',
  signal: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>',
  stack: '<path d="m13.11 7.664 1.78 2.672"></path><path d="m14.162 12.788-3.324 1.424"></path><path d="m20 4-6.06 1.515"></path><circle cx="12" cy="6" r="2"></circle><circle cx="16" cy="12" r="2"></circle><circle cx="9" cy="15" r="2"></circle>',
  close: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>',
};

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });

function uniqueTerms(items) {
  const result = [];
  for (const item of items) {
    const normalized = item.toLowerCase();
    if (result.some((existing) => existing.toLowerCase() === normalized || existing.includes(item) || item.includes(existing))) continue;
    result.push(item);
  }
  return result;
}

function normalizeCandidate(value) {
  return String(value ?? '')
    .replace(/^(尤其是|不只是|你想|该怎么|该如何|怎么|如何|是否|为什么|所谓的?)/, '')
    .replace(/(的话|来说|怎么办|怎么做|是什么|是否可信)$/g, '')
    .trim();
}

function parseManualKeywords(value, limit = 4) {
  return uniqueTerms(String(value ?? '')
    .split(/[|｜/、,，;；·•\n]+/)
    .map((term) => term.trim())
    .filter(Boolean))
    .slice(0, limit);
}

function authoredScreenTerms(shot, limit = 6) {
  if (!['manual-keywords', 'generated-summary', 'approved-summary'].includes(shot.screenText?.type)) return [];
  return parseManualKeywords(shot.screenText?.text, limit);
}

function graphTermsForCue(graph, cueId) {
  if (!graph) return [];
  return uniqueTerms((graph.nodes ?? [])
    .filter((node) => node.sourceCueIds?.includes(cueId))
    .map((node) => node.label)
    .filter(Boolean));
}

function compactRouteTerms(items, limit = 3) {
  const terms = uniqueTerms(items.filter(Boolean));
  if (terms.length <= limit) return terms;
  const groups = Array.from({length: limit}, () => []);
  terms.forEach((term, index) => groups[Math.min(limit - 1, Math.floor(index * limit / terms.length))].push(term));
  return groups.filter((group) => group.length).map((group) => group.join(' / '));
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function routeLayoutGroups(graph, diagram, cueId) {
  const layout = diagram?.layout;
  if (!graph || !layout?.children?.length || !Number.isFinite(layout.width) || !Number.isFinite(layout.height)) return null;
  const activeNodes = (graph.nodes ?? []).filter((node) => node.sourceCueIds?.includes(cueId));
  if (!activeNodes.length) return null;
  const childById = new Map(layout.children.map((child) => [child.id, child]));
  if (activeNodes.some((node) => !childById.has(node.id))) return null;

  const groupCount = Math.min(3, activeNodes.length);
  const nodeGroups = Array.from({length: groupCount}, () => []);
  activeNodes.forEach((node, index) => nodeGroups[Math.min(groupCount - 1, Math.floor(index * groupCount / activeNodes.length))].push(node));
  const canvas = {width: 1040, height: 250};
  const scale = Math.min(canvas.width / layout.width, canvas.height / layout.height);
  const offsetX = (canvas.width - layout.width * scale) / 2;
  const offsetY = (canvas.height - layout.height * scale) / 2;
  const nodeWidth = activeNodes.length > 3 ? 250 : 270;
  const nodeHeight = 126;

  const groups = nodeGroups.map((nodes, index) => {
    const children = nodes.map((node) => childById.get(node.id));
    const centerX = children.reduce((sum, child) => sum + child.x + child.width / 2, 0) / children.length;
    const centerY = children.reduce((sum, child) => sum + child.y + child.height / 2, 0) / children.length;
    const left = clamp(offsetX + centerX * scale - nodeWidth / 2, 0, canvas.width - nodeWidth);
    const top = clamp(offsetY + centerY * scale - nodeHeight / 2, 0, canvas.height - nodeHeight);
    return {
      index,
      nodeIds: nodes.map((node) => node.id),
      term: nodes.map((node) => node.label).join(' / '),
      left: round3(left),
      top: round3(top),
      width: nodeWidth,
      height: nodeHeight,
      centerX: round3(left + nodeWidth / 2),
      centerY: round3(top + nodeHeight / 2),
    };
  });
  return {canvas, groups};
}

function renderBoundRouteLayout({id, graph, graphLayout, cueId}) {
  const route = routeLayoutGroups(graph, graphLayout, cueId);
  if (!route) return null;
  const lines = route.groups.slice(1).map((group, index) => {
    const previous = route.groups[index];
    return `<line data-hf-id="${id}-edge-${index + 1}" class="route-layout-line" x1="${previous.centerX}" y1="${previous.centerY}" x2="${group.centerX}" y2="${group.centerY}" />`;
  }).join('');
  const nodes = route.groups.map((group) => `<div data-hf-id="${id}-term-${group.index + 1}" class="route-term route-layout-term" data-layout-node-ids="${escapeHtml(group.nodeIds.join(','))}" style="left:${group.left}px;top:${group.top}px;width:${group.width}px;height:${group.height}px"><span>${String(group.index + 1).padStart(2, '0')}</span><strong>${escapeHtml(group.term)}</strong></div>`).join('');
  return `<div data-hf-id="${id}-layout" class="route-layout-canvas"><svg data-hf-id="${id}-layout-lines" class="route-layout-lines" viewBox="0 0 ${route.canvas.width} ${route.canvas.height}" aria-hidden="true">${lines}</svg>${nodes}</div>`;
}

function comparisonTerms(value) {
  const parts = String(value ?? '').split(/\s*(?:≠|!=|VS\.?|vs\.?|→)\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? parts : [];
}

export function extractDisplayKeywords(value, limit = 4) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const semantic = SEMANTIC_ALIASES
    .filter(([pattern]) => pattern.test(text))
    .map(([, term]) => term);
  const technical = TECHNICAL_TERMS
    .filter((term) => text.toLowerCase().includes(term.toLowerCase()))
    .sort((a, b) => {
      const position = text.toLowerCase().indexOf(a.toLowerCase()) - text.toLowerCase().indexOf(b.toLowerCase());
      return position || [...b].length - [...a].length;
    });
  const segmented = [...segmenter.segment(text)]
    .filter((part) => part.isWordLike)
    .map((part) => normalizeCandidate(part.segment.replace(/^[的了着过把被给将从到在与和或而及也又都只很更最再还就则]+|[的了着过把被给将从到在与和或而及也又都只很更最再还就则]+$/g, '')))
    .filter((part) => part
      && !STOP_WORDS.has(part)
      && !REJECTED_TERM_PATTERNS.some((pattern) => pattern.test(part))
      && !/^\d+$/.test(part)
      && (/[A-Za-z0-9]/.test(part) || [...part].length >= 2))
    .sort((a, b) => {
      const score = (term) => (/[A-Z0-9]/.test(term) ? 20 : 0) + Math.min([...term].length, 8);
      return score(b) - score(a);
    });
  const keywords = uniqueTerms([...semantic, ...technical, ...segmented]).slice(0, limit);
  if (keywords.length) return keywords;
  return ['关键观点'];
}

function mainSize(keyword) {
  const length = [...keyword].length;
  if (length <= 3) return 138;
  if (length <= 6) return 118;
  if (length <= 10) return 98;
  return 78;
}

function hasOrderedRelationship(value) {
  const text = String(value ?? '');
  return /(从.+到.+|先.+再.+|第一.+第二|步骤|流程|依次|进入.+然后|变成.+再)/.test(text);
}

function stateVariant(scene, shot, index) {
  if (VISUAL_VARIANTS.includes(shot.visualVariant)) return shot.visualVariant;
  const recipe = shot.motionRecipeRefs?.[0];
  if (VISUAL_VARIANTS.includes(recipe?.params?.variant)) return recipe.params.variant;
  if (RECIPE_VARIANTS[recipe?.recipeId]) return RECIPE_VARIANTS[recipe.recipeId];
  if (scene.role === 'close') return 'close';
  if (scene.role === 'compare') return 'contrast';
  if (hasOrderedRelationship(shot.narration)) return 'route';
  if (/(失败|危险|风险|报错|失真|自欺|塌|不可信|不靠谱)/.test(shot.narration)) return 'signal';
  if ((shot.narration.match(/[、，]/g) ?? []).length >= 3) return 'stack';
  return index % 4 === 3 ? 'signal' : 'focus';
}

function primaryRecipe(shot) {
  return shot.motionRecipeRefs?.[0] ?? {recipeId: 'legacy-auto', version: '0.0.0', params: {}};
}

function carrierEvidenceBadge(payload, cueId) {
  const mock = payload.evidence.status === 'illustrative-mock';
  return `<div data-hf-id="carrier-${cueId}-${payload.adapterId}-evidence" class="carrier-evidence ${mock ? 'is-mock' : 'is-verified'}"><span>${mock ? '示意内容' : '基于已核验来源重建'}</span><strong>${escapeHtml(payload.evidence.label)}</strong></div>`;
}

function renderBoundedDataProof({shot, common, motif}) {
  const payload = shot.carrierPayload;
  if (payload?.adapterId !== 'data-chart-bounded') return null;
  const data = payload.data;
  const values = data.series.map((item) => Number(item.value));
  const maximum = Math.max(...values.map((value) => Math.abs(value)), 1);
  const bars = data.series.map((item, index) => {
    const height = round3(Math.max(0.04, Math.abs(Number(item.value)) / maximum) * 100);
    const display = item.displayValue || `${item.value}${data.unit ?? ''}`;
    return `<div data-hf-id="visual-${shot.cueId}-bar-${index + 1}" class="chart-column${index === data.highlightIndex ? ' is-highlight' : ''}"><strong>${escapeHtml(display)}</strong><div class="chart-bar-track"><span class="chart-bar-fill" style="height:${height}%"></span></div><label>${escapeHtml(item.label)}</label></div>`;
  }).join('');
  return `<div ${common} data-carrier-adapter="${payload.adapterId}@${payload.adapterVersion}">${motif}<div class="bounded-carrier data-carrier"><div class="carrier-header"><span>DATA / LOCAL ADAPTER</span><h2>${escapeHtml(data.title)}</h2></div><div class="chart-grid" style="grid-template-columns:repeat(${data.series.length},1fr)">${bars}</div>${carrierEvidenceBadge(payload, shot.cueId)}</div></div>`;
}

function renderBoundedCodeProof({shot, common, motif}) {
  const payload = shot.carrierPayload;
  if (payload?.adapterId !== 'code-surface-bounded') return null;
  const data = payload.data;
  const lines = data.lines.map((line, index) => {
    const marker = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : line.kind === 'focus' ? '>' : ' ';
    return `<div data-hf-id="visual-${shot.cueId}-code-${index + 1}" class="code-line code-${line.kind}"><span>${String(index + 1).padStart(2, '0')}</span><b>${marker}</b><code>${escapeHtml(line.text)}</code></div>`;
  }).join('');
  return `<div ${common} data-carrier-adapter="${payload.adapterId}@${payload.adapterVersion}">${motif}<div class="bounded-carrier code-carrier"><div class="carrier-window-bar"><i></i><i></i><i></i><strong>${escapeHtml(data.language)} · ${escapeHtml(data.title)}</strong></div><div class="code-lines">${lines}</div>${carrierEvidenceBadge(payload, shot.cueId)}</div></div>`;
}

function renderBoundedDeviceTour({shot, common, motif}) {
  const payload = shot.carrierPayload;
  if (payload?.adapterId !== 'device-surface-bounded') return null;
  const data = payload.data;
  const states = data.states.map((state, index) => `<section data-hf-id="visual-${shot.cueId}-device-${index + 1}" class="device-state${index === data.activeState ? ' is-active' : ''}"><div class="device-state-top"><span>0${index + 1}</span><strong>${escapeHtml(state.label)}</strong></div>${state.rows.map((row) => `<div class="device-row"><i></i><span>${escapeHtml(row)}</span></div>`).join('')}</section>`).join('');
  return `<div ${common} data-carrier-adapter="${payload.adapterId}@${payload.adapterVersion}">${motif}<div class="bounded-carrier device-carrier"><div class="carrier-header"><span>STATE TOUR / ${escapeHtml(data.productLabel)}</span><h2>${escapeHtml(data.title)}</h2></div><div class="device-state-grid" style="grid-template-columns:repeat(${data.states.length},1fr)">${states}</div>${carrierEvidenceBadge(payload, shot.cueId)}</div></div>`;
}

function renderCarrierSurface(args) {
  return renderBoundedDataProof(args) || renderBoundedCodeProof(args) || renderBoundedDeviceTour(args);
}

function renderMediaSurface({shot, common, motif, main, supportTerms}) {
  const assets = (shot.resolvedAssets ?? []).filter((asset) => asset.role !== 'icon' && asset.type !== 'icon');
  if (!assets.length) return null;
  const recipe = primaryRecipe(shot);
  if (['keyword', 'diagram'].includes(shot.visualType)) return null;
  if (shot.visualType === 'comparison' && assets.length >= 2) {
    return `<div ${common}>${motif}<div class="media-compare"><figure><img data-hf-id="visual-${shot.cueId}-asset-1" src="${escapeHtml(assets[0].src)}" alt="" /><figcaption>${escapeHtml(supportTerms[0] ?? 'BEFORE')}</figcaption></figure><figure><img data-hf-id="visual-${shot.cueId}-asset-2" src="${escapeHtml(assets[1].src)}" alt="" /><figcaption>${escapeHtml(main)}</figcaption></figure></div></div>`;
  }
  if (shot.visualType === 'comparison') return null;
  const asset = assets[0];
  const shellClass = shot.visualType === 'device-surface' || shot.visualType === 'code-surface' ? 'media-frame device-frame' : 'media-frame';
  return `<div ${common}>${motif}<div class="${shellClass}" data-media-type="${escapeHtml(asset.type)}"><div class="media-frame-bar"><span></span><span></span><span></span><strong>${escapeHtml(recipe.recipeId)}</strong></div><img data-hf-id="visual-${shot.cueId}-asset-1" src="${escapeHtml(asset.src)}" alt="" /><div class="media-callout"><strong>${escapeHtml(main)}</strong><span>${escapeHtml(supportTerms.slice(0, 2).join(' / '))}</span></div></div></div>`;
}

function iconMarkup(variant, id) {
  return `<svg data-hf-id="${id}-icon" class="motif-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[variant] ?? ICONS.focus}</svg>`;
}

function supportingAssetMarkup(shot, id) {
  const supporting = (shot.resolvedAssets ?? [])
    .filter((asset) => asset.role === 'icon' || asset.type === 'icon')
    .slice(0, 2);
  if (!supporting.length) return '';
  return `<div data-hf-id="${id}-supporting-assets" class="supporting-assets">${supporting.map((asset, index) => `<img data-hf-id="${id}-supporting-asset-${index + 1}" src="${escapeHtml(asset.src)}" alt="" />`).join('')}</div>`;
}

function renderVisualState(scene, shot, index, graph, graphLayout) {
  const id = `visual-${shot.cueId}`;
  const screenTerms = authoredScreenTerms(shot);
  const graphTerms = graphTermsForCue(graph, shot.cueId);
  const keywords = screenTerms.length
    ? screenTerms
    : extractDisplayKeywords(`${shot.screenText?.text ?? ''} ${shot.narration ?? ''}`);
  const [main, ...support] = keywords;
  const variant = stateVariant(scene, shot, index);
  const fallbackSupport = extractDisplayKeywords(shot.narration, 4)
    .filter((term) => term !== main && !main?.includes(term) && !term.includes(main ?? ''));
  const supportTerms = uniqueTerms([...support, ...graphTerms, ...fallbackSupport]).filter((term) => term !== main);
  const textMode = screenTerms.length ? shot.screenText.type : 'keyword-extract';
  const screenHeadline = String(shot.screenText?.text ?? main ?? '').trim();
  const recipe = primaryRecipe(shot);
  const assetIds = (shot.assetRefs ?? []).map((ref) => ref.assetId).join(',');
  const sfxIds = (shot.sfxRefs ?? []).map((ref) => ref.assetId).join(',');
  const common = `data-hf-id="${id}" id="${id}" class="visual-state visual-${variant}${index === 0 ? ' is-initial' : ''}" data-role="keyword-state" data-zone="content.right" data-source-cues="${escapeHtml(shot.cueId)}" data-derived-text="${textMode}" data-visual-type="${escapeHtml(shot.visualType ?? 'keyword')}" data-motion-recipe="${escapeHtml(`${recipe.recipeId}@${recipe.version}`)}" data-asset-ids="${escapeHtml(assetIds)}" data-sfx-ids="${escapeHtml(sfxIds)}" data-visual-variant="${variant}" data-layout-allow-overflow="compact-history" data-layout-allow-overlap="animated-handoff"`;
  const motif = `${iconMarkup(variant, id)}${supportingAssetMarkup(shot, id)}`;
  const carrierSurface = renderCarrierSurface({shot, common, motif, main, supportTerms});
  if (carrierSurface) return carrierSurface;
  const mediaSurface = renderMediaSurface({shot, common, motif, main, supportTerms});
  if (mediaSurface) return mediaSurface;

  if (variant === 'route') {
    const boundLayout = renderBoundRouteLayout({id, graph, graphLayout, cueId: shot.cueId});
    if (boundLayout) {
      return `<div ${common} data-graph-layout="bound">${motif}<div class="route-kicker">RELATION / ${escapeHtml(shot.cueId.toUpperCase())}</div><div data-hf-id="${id}-title" class="route-title">${escapeHtml(screenHeadline)}</div>${boundLayout}</div>`;
    }
    const terms = compactRouteTerms(graphTerms.length ? graphTerms : [main, ...supportTerms]);
    return `<div ${common}>${motif}<div class="route-kicker">RELATION / ${escapeHtml(shot.cueId.toUpperCase())}</div><div data-hf-id="${id}-title" class="route-title">${escapeHtml(screenHeadline)}</div><div class="route-line" aria-hidden="true"></div><div class="route-terms">${terms.map((term, termIndex) => `<div data-hf-id="${id}-term-${termIndex + 1}" class="route-term"><span>${String(termIndex + 1).padStart(2, '0')}</span><strong>${escapeHtml(term)}</strong></div>`).join('')}</div></div>`;
  }

  if (variant === 'contrast') {
    const pair = comparisonTerms(screenHeadline);
    const left = pair[0] ?? supportTerms[0] ?? '表面结果';
    const right = pair[1] ?? main;
    const operator = screenHeadline.includes('≠') ? '≠' : '→';
    return `<div ${common}>${motif}<div class="contrast-label">SHIFT THE FRAME</div><div class="contrast-layout"><div class="contrast-word muted-word">${escapeHtml(left)}</div><div class="contrast-arrow" aria-hidden="true">${operator}</div><div class="contrast-word primary-word" style="font-size:${mainSize(right)}px">${escapeHtml(right)}</div></div></div>`;
  }

  if (variant === 'stack') {
    const terms = uniqueTerms([main, ...supportTerms]).slice(0, 3);
    return `<div ${common}>${motif}<div class="stack-index" data-layout-ignore aria-hidden="true">${escapeHtml(shot.cueId.replace('cue-', ''))}</div><div class="stack-terms">${terms.map((term, termIndex) => `<div data-hf-id="${id}-term-${termIndex + 1}" class="stack-term ${termIndex === 0 ? 'stack-primary' : ''}"><span>0${termIndex + 1}</span><strong>${escapeHtml(term)}</strong></div>`).join('')}</div></div>`;
  }

  if (variant === 'close') {
    const cueIndex = graph?.sourceCueIds?.indexOf(shot.cueId) ?? -1;
    const contextCueId = cueIndex > 0 ? graph.sourceCueIds[cueIndex - 1] : null;
    const contextTerms = compactRouteTerms((graph?.nodes ?? [])
      .filter((node) => contextCueId ? node.sourceCueIds?.includes(contextCueId) : !node.sourceCueIds?.includes(shot.cueId))
      .map((node) => node.label), 3);
    const terms = contextTerms.length ? contextTerms : compactRouteTerms(supportTerms, 3);
    return `<div ${common}>${motif}<div class="close-kicker">CONCLUSION</div><div class="close-terms" style="grid-template-columns:repeat(${Math.max(1, terms.length)},1fr)">${terms.map((term, termIndex) => `<strong data-hf-id="${id}-term-${termIndex + 1}">${escapeHtml(term)}</strong>`).join('')}</div><div data-hf-id="${id}-main" class="close-line">${escapeHtml(screenHeadline)}</div></div>`;
  }

  return `<div ${common}>${motif}<div class="keyword-kicker">KEY IDEA / ${escapeHtml(shot.cueId.toUpperCase())}</div><div data-hf-id="${id}-main" class="keyword-main" style="font-size:${mainSize(main)}px">${escapeHtml(main)}</div><div class="keyword-rule" aria-hidden="true"></div><div class="keyword-support">${supportTerms.slice(0, 3).map((term, termIndex) => `<span data-hf-id="${id}-support-${termIndex + 1}">${escapeHtml(term)}</span>`).join('')}</div></div>`;
}

function contentMotionSelector(scene, shot, index) {
  const root = `#visual-${shot.cueId}`;
  const adapterId = shot.carrierPayload?.adapterId;
  if (adapterId === 'data-chart-bounded') return `${root} .carrier-header`;
  if (adapterId === 'code-surface-bounded') return `${root} .carrier-window-bar`;
  if (adapterId === 'device-surface-bounded') return `${root} .carrier-header`;
  const assets = (shot.resolvedAssets ?? []).filter((asset) => asset.role !== 'icon' && asset.type !== 'icon');
  if (assets.length && !['keyword', 'diagram'].includes(shot.visualType)) {
    return shot.visualType === 'comparison' && assets.length >= 2
      ? `${root} .media-compare figure`
      : `${root} .media-frame`;
  }
  switch (stateVariant(scene, shot, index)) {
    case 'route': return `${root} .route-kicker, ${root} .route-title, ${root} .route-term`;
    case 'contrast': return `${root} .contrast-word`;
    case 'stack': return `${root} .stack-term`;
    case 'close': return `${root} .close-terms strong, ${root} .close-line`;
    default: return `${root} .keyword-main`;
  }
}

function renderTopic(scene, sceneShots, initial) {
  const planned = uniqueTerms(sceneShots.flatMap((shot) => authoredScreenTerms(shot, 2)));
  const keywords = planned.length ? [planned[0], planned.at(-1)].filter((term, index, all) => all.indexOf(term) === index) : extractDisplayKeywords(`${scene.title} ${sceneShots[0]?.narration ?? ''}`, 2);
  return `<div data-hf-id="topic-${scene.id}" id="topic-${scene.id}" class="scene-topic${initial ? ' is-initial' : ''}" data-layout-allow-overlap="topic-crossfade"><span>SCENE ${String(scene.order).padStart(2, '0')}</span><strong>${escapeHtml(keywords.join(' → '))}</strong></div>`;
}

function renderTimeline({ duration, scenes, shots, introPaddingSeconds }) {
  const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]));
  const lines = [
    'window.__timelines = window.__timelines || {};',
    'const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });',
    'const safeFromTo = (selector, fromVars, toVars, at) => { if (typeof selector === "string" && (!selector.trim() || !document.querySelector(selector))) return; tl.fromTo(selector, fromVars, toVars, at); };',
    'const safeTo = (target, vars, at) => { if (typeof target === "string" && (!target.trim() || !document.querySelector(target))) return; tl.to(target, vars, at); };',
    'const durationAnchor = { progress: 0 };',
    `tl.to(durationAnchor, { progress: 1, duration: ${duration}, ease: "none" }, 0);`,
  ];
  const firstScene = scenes[0];
  lines.push(`safeFromTo("#content-progress", { scaleX: 0 }, { scaleX: 1, duration: ${duration}, ease: "none" }, 0);`);

  let activePose = firstScene.layout.hostPose;
  let activeSceneId = firstScene.id;
  shots.forEach((shot, index) => {
    const scene = sceneMap.get(shot.sceneId);
    const start = round3(shot.start + introPaddingSeconds);
    if (index > 0) {
      const previous = shots[index - 1];
      const params = primaryRecipe(shot).params ?? {};
      const handoffSeconds = Math.min(0.9, Math.max(0.18, Number(params.handoffSeconds ?? 0.5)));
      const enterSeconds = Math.min(1.1, Math.max(0.2, Number(params.enterSeconds ?? 0.58)));
      const staggerSeconds = Math.min(0.16, Math.max(0, Number(params.staggerSeconds ?? 0.07)));
      const handoffLead = Math.min(0.22, Math.max(0.18, handoffSeconds * 0.36));
      const handoff = round3(Math.max(0, start - handoffLead));
      const outgoing = params.handoff === 'fade'
        ? '{ opacity: 0, y: -24, scale: 0.94 }'
        : params.handoff === 'slide-left'
          ? '{ opacity: 0, x: -120, scale: 0.78 }'
          : '{ opacity: 0, y: -188, scale: 0.4 }';
      const incoming = params.entrance === 'wipe'
        ? '{ opacity: 0, x: -54, scale: 0.98 }'
        : params.entrance === 'split'
          ? '{ opacity: 0, x: 62, scale: 0.92 }'
          : '{ opacity: 0, y: 58, scale: 0.86 }';
      if (index > 1) {
        lines.push(`safeTo("#visual-${shots[index - 2].cueId}", { opacity: 0, duration: 0.2, ease: "power1.out" }, ${handoff});`);
        lines.push(`tl.set("#visual-${shots[index - 2].cueId}", { opacity: 0 }, ${start});`);
      }
      lines.push(`safeTo("#visual-${previous.cueId}", { ...${outgoing}, duration: ${round3(Math.min(handoffSeconds, handoffLead))}, ease: "power3.inOut" }, ${handoff});`);
      lines.push(`safeFromTo("#visual-${shot.cueId}", ${incoming}, { opacity: 1, x: 0, y: 0, scale: 1, duration: ${enterSeconds}, ease: "power4.out" }, ${round3(Math.max(0, start - 0.06))});`);
      lines.push(`safeFromTo(${JSON.stringify(contentMotionSelector(scene, shot, index))}, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.42, stagger: ${staggerSeconds}, ease: "power3.out" }, ${round3(start + 0.04)});`);
      if (shot.visualType === 'diagram') lines.push(`safeFromTo("#visual-${shot.cueId} .route-line, #visual-${shot.cueId} .route-layout-line", { scaleX: 0 }, { scaleX: 1, duration: 0.58, stagger: 0.08, transformOrigin: "0% 50%", ease: "power2.out" }, ${round3(start + 0.12)});`);
    }
    if (shot.carrierPayload?.adapterId === 'data-chart-bounded') {
      lines.push(`safeFromTo("#visual-${shot.cueId} .chart-bar-fill", { scaleY: 0 }, { scaleY: 1, duration: 0.62, stagger: 0.08, transformOrigin: "50% 100%", ease: "power3.out" }, ${round3(start + 0.1)});`);
      lines.push(`safeFromTo("#visual-${shot.cueId} .chart-column > strong", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.28, stagger: 0.08, ease: "power2.out" }, ${round3(start + 0.42)});`);
      lines.push(`safeTo("#visual-${shot.cueId} .chart-column.is-highlight", { scale: 1.055, duration: 0.42, ease: "power2.inOut" }, ${round3(start + Math.min(2.05, shot.duration * 0.36))});`);
      lines.push(`safeTo("#visual-${shot.cueId} .chart-column.is-highlight", { scale: 1, duration: 0.42, ease: "power2.inOut" }, ${round3(start + Math.min(3.05, shot.duration * 0.54))});`);
    } else if (shot.carrierPayload?.adapterId === 'code-surface-bounded') {
      lines.push(`safeFromTo("#visual-${shot.cueId} .code-line", { opacity: 0, x: 26 }, { opacity: 1, x: 0, duration: 0.32, stagger: 0.07, ease: "power2.out" }, ${round3(start + 0.12)});`);
      lines.push(`safeTo("#visual-${shot.cueId} .code-focus", { x: 10, backgroundColor: "rgba(220,194,163,.32)", duration: 0.46, ease: "power2.inOut" }, ${round3(start + Math.min(2.05, shot.duration * 0.36))});`);
      lines.push(`safeTo("#visual-${shot.cueId} .code-remove", { opacity: 0.36, duration: 0.38, ease: "power2.out" }, ${round3(start + Math.min(3.15, shot.duration * 0.56))});`);
      lines.push(`safeTo("#visual-${shot.cueId} .code-add", { x: 10, duration: 0.38, ease: "power2.out" }, ${round3(start + Math.min(4.05, shot.duration * 0.68))});`);
    } else if (shot.carrierPayload?.adapterId === 'device-surface-bounded') {
      const durationSeconds = Math.max(0.4, Number(shot.duration) || 0);
      const activePulseIn = Math.min(2.35, durationSeconds * 0.42);
      const activePulseDuration = Math.min(0.46, Math.max(0.12, durationSeconds * 0.18));
      const activePulseOut = Math.max(durationSeconds * 0.68, activePulseIn + activePulseDuration + 0.04);
      lines.push(`safeFromTo("#visual-${shot.cueId} .device-state", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.12, ease: "power3.out" }, ${round3(start + 0.12)});`);
      lines.push(`safeTo("#visual-${shot.cueId} .device-state:not(.is-active)", { opacity: 0.58, scale: 0.97, duration: 0.42, ease: "power2.inOut" }, ${round3(start + Math.min(2.05, shot.duration * 0.36))});`);
      lines.push(`safeTo("#visual-${shot.cueId} .device-state.is-active", { scale: 1.045, y: -8, duration: ${round3(activePulseDuration)}, ease: "power2.inOut" }, ${round3(start + activePulseIn)});`);
      lines.push(`safeTo("#visual-${shot.cueId} .device-state.is-active", { scale: 1, y: 0, duration: ${round3(activePulseDuration)}, ease: "power2.inOut" }, ${round3(start + activePulseOut)});`);
    }
    if (shot.carrierPayload) {
      const resolveAt = round3(start + Math.max(1, Math.min(Number(shot.duration) - 0.6, Number(shot.duration) * 0.76)));
      lines.push(`safeFromTo("#visual-${shot.cueId} .carrier-evidence", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.36, ease: "power2.out" }, ${resolveAt});`);
    }
    if (index > 0) {
      const previousCaption = shots[index - 1].cueId;
      const captionHandoff = round3(Math.max(0, start - 0.12));
      lines.push(`safeTo("#caption-${previousCaption}", { opacity: 0, y: -3, duration: 0.12, ease: "power2.in" }, ${captionHandoff});`);
      lines.push(`tl.set("#caption-${previousCaption}", { opacity: 0 }, ${start});`);
      lines.push(`safeFromTo("#caption-${shot.cueId}", { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, ${round3(start + 0.02)});`);
    }

    if (scene.id !== activeSceneId) {
      const topicExit = round3(Math.max(0, start - 0.34));
      const topicEnter = round3(Math.max(0, start - 0.1));
      lines.push(`safeTo("#topic-${activeSceneId}", { opacity: 0, duration: 0.18, ease: "power2.in" }, ${topicExit});`);
      lines.push(`tl.set("#topic-${activeSceneId}", { opacity: 0 }, ${round3(topicExit + 0.18)});`);
      lines.push(`safeFromTo("#topic-${scene.id}", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.28, ease: "power3.out" }, ${topicEnter});`);
      activeSceneId = scene.id;
    }
    if (scene.layout.hostPose !== activePose) {
      const poseExit = round3(Math.max(0, start - 0.28));
      const poseEnter = round3(Math.max(0, start - 0.12));
      lines.push(`safeTo("#host-pose-${activePose}", { opacity: 0, duration: 0.16, ease: "power2.in" }, ${poseExit});`);
      lines.push(`tl.set("#host-pose-${activePose}", { opacity: 0 }, ${poseEnter});`);
      lines.push(`safeFromTo("#host-pose-${scene.layout.hostPose}", { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out" }, ${poseEnter});`);
      lines.push(`tl.set("#host-pose-${scene.layout.hostPose}", { opacity: 1 }, ${round3(start + 0.1)});`);
      lines.push(`safeFromTo("#host-accent", { scaleX: 0.72 }, { scaleX: 1, duration: 0.4, ease: "power3.out" }, ${poseExit});`);
      activePose = scene.layout.hostPose;
    }
  });
  lines.push('window.__timelines["main"] = tl;');
  return lines.join('');
}

export function renderContinuousIndex({ manifest, scenes, shots, hostAssets, graphs = [], graphLayouts = [] }) {
  const introPaddingSeconds = INTRO_PADDING_SECONDS;
  const audioDuration = round3(manifest.timeline.duration);
  const duration = round3(audioDuration + introPaddingSeconds);
  const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]));
  const graphByScene = new Map(graphs.map((graph) => [graph.sceneId, graph]));
  const graphLayoutById = new Map(graphLayouts.map((diagram) => [diagram.graphId, diagram]));
  const uniquePoses = [...new Set(scenes.map((scene) => scene.layout.hostPose))];
  const topics = scenes.map((scene, index) => renderTopic(scene, shots.filter((shot) => shot.sceneId === scene.id), index === 0)).join('');
  const visualStates = shots.map((shot, index) => {
    const graph = graphByScene.get(shot.sceneId);
    return renderVisualState(sceneMap.get(shot.sceneId), shot, index, graph, graphLayoutById.get(graph?.id));
  }).join('');
  const captions = shots.map((shot, index) => `<div id="caption-${shot.cueId}" data-hf-id="caption-${shot.cueId}" class="caption-cue${index === 0 ? ' is-initial' : ''}" data-role="caption" data-zone="caption" data-cue-start="${round3(shot.start + introPaddingSeconds)}" data-cue-duration="${round3(shot.duration)}" data-source-cues="${escapeHtml(shot.cueId)}" data-text-type="exact-source"><span data-hf-id="caption-${shot.cueId}-text">${escapeHtml(shot.narration)}</span></div>`).join('');
  const firstPose = scenes[0].layout.hostPose;
  const hostLayers = uniquePoses.map((pose) => {
    const src = hostAssets.get(pose);
    const transform = pose === 'close' ? 'scale(1.18)' : pose === 'point-right' ? 'scaleX(-1) scale(1.1)' : 'scale(1)';
    return `<img data-hf-id="host-pose-${pose}" id="host-pose-${pose}" class="host-pose${pose === firstPose ? ' is-initial' : ''}" src="${escapeHtml(src)}" alt="" data-pose-id="${escapeHtml(pose)}" data-layout-allow-overflow="intentional-pose-crop" style="transform:${transform}" />`;
  }).join('');
  let sfxTrackIndex = 31;
  const sfxClips = shots.flatMap((shot) => (shot.resolvedSfx ?? []).map((sfx, index) => {
    const start = round3(shot.start + introPaddingSeconds + Number(sfx.offsetMs ?? 0) / 1000);
    const available = Math.max(0.05, duration - start);
    const clipDuration = round3(Math.min(Math.max(0.05, Number(sfx.duration ?? 0.35)), available));
    const volume = Math.max(0, Math.min(1, 10 ** (Number(sfx.gainDb ?? -18) / 20)));
    const trackIndex = sfxTrackIndex;
    sfxTrackIndex += 1;
    return `<audio data-hf-id="sfx-${shot.cueId}-${index + 1}" id="sfx-${shot.cueId}-${index + 1}" class="clip" src="${escapeHtml(sfx.src)}" data-start="${start}" data-duration="${clipDuration}" data-track-index="${trackIndex}" data-volume="${round3(volume)}" data-role="semantic-sfx" data-sfx-role="${escapeHtml(sfx.role)}" data-source-cues="${escapeHtml(shot.cueId)}"></audio>`;
  })).join('');

  const html = `<!doctype html>
<html lang="zh-CN" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>${escapeHtml(manifest.projectId)} - Continuous AutoVideo</title>
    <script src="./assets/runtime/gsap.min.js"></script>
    <style>
      @font-face { font-family:"Noto Sans SC"; src:local("Noto Sans SC"), local("Noto Sans CJK SC"), local("Microsoft YaHei"); font-weight:100 900; }
      @font-face { font-family:"JetBrains Mono Local"; src:url("./assets/runtime/JetBrainsMono-400.woff2") format("woff2"); font-weight:100 600; }
      @font-face { font-family:"JetBrains Mono Local"; src:url("./assets/runtime/JetBrainsMono-700.woff2") format("woff2"); font-weight:700 900; }
      * { box-sizing:border-box; }
      html, body { width:1920px; height:1080px; margin:0; overflow:hidden; background:${COLORS.background}; }
      body { font-family:"Noto Sans SC",sans-serif; color:${COLORS.ink}; }
      #root { position:relative; width:1920px; height:1080px; overflow:hidden; }
      .stage-fill { position:absolute; inset:0; width:1920px; height:1080px; overflow:hidden; background:${COLORS.background}; }
      .stage-fill::before { content:""; position:absolute; left:-250px; top:92px; width:820px; height:820px; border:2px solid ${COLORS.line}; border-radius:50%; opacity:.62; }
      .stage-fill::after { content:""; position:absolute; left:96px; top:874px; width:1728px; height:3px; background:${COLORS.line}; }
      .host-zone { position:absolute; left:96px; top:156px; width:600px; height:730px; overflow:hidden; z-index:4; }
      .host-shadow { position:absolute; left:110px; bottom:2px; width:380px; height:44px; border-radius:50%; background:rgba(73,105,88,.12); filter:blur(14px); }
      .host-pose { position:absolute; inset:0; width:600px; height:730px; object-fit:contain; object-position:50% 100%; transform-origin:50% 0; opacity:0; will-change:opacity; }
      .host-pose.is-initial,.scene-topic.is-initial,.visual-state.is-initial { opacity:1; }
      .host-accent { position:absolute; left:34px; bottom:18px; width:510px; height:5px; background:${COLORS.primary}; transform-origin:0 50%; opacity:.7; }
      .content-zone { position:absolute; left:694px; top:92px; width:1130px; height:782px; overflow:hidden; z-index:8; }
      .scene-topic { position:absolute; left:0; top:0; width:100%; height:118px; display:flex; align-items:flex-end; gap:22px; opacity:0; }
      .scene-topic span { height:72px; display:flex; align-items:center; color:${COLORS.secondaryText}; font-family:"JetBrains Mono Local",monospace; font-size:19px; font-weight:800; }
      .scene-topic strong { max-width:890px; height:72px; display:flex; align-items:center; color:${COLORS.ink}; font-size:48px; font-weight:850; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .visual-stage { position:absolute; left:0; top:138px; width:1130px; height:614px; overflow:hidden; }
      .visual-state { position:absolute; left:0; top:0; width:1130px; height:614px; opacity:0; transform-origin:38% 34%; will-change:transform,opacity; }
      .motif-icon { position:absolute; right:42px; top:32px; width:84px; height:84px; color:${COLORS.secondary}; opacity:.82; }
      .supporting-assets { position:absolute; right:38px; top:126px; display:flex; gap:10px; z-index:3; }
      .supporting-assets img { width:54px; height:54px; object-fit:contain; padding:8px; border:1px solid ${COLORS.line}; background:${COLORS.surface}; box-shadow:0 8px 18px rgba(73,60,49,.1); }
      .keyword-kicker,.route-kicker,.contrast-label,.close-kicker { position:absolute; left:8px; top:54px; color:${COLORS.muted}; font-family:"JetBrains Mono Local",monospace; font-size:20px; font-weight:800; }
      .keyword-main { position:absolute; left:0; top:122px; width:940px; min-height:170px; color:${COLORS.ink}; font-weight:900; line-height:1.02; letter-spacing:0; overflow-wrap:anywhere; }
      .keyword-rule { position:absolute; left:4px; top:338px; width:820px; height:8px; background:${COLORS.primary}; transform-origin:0 50%; }
      .keyword-support { position:absolute; left:0; top:382px; width:1030px; display:flex; align-items:center; gap:0; color:${COLORS.muted}; font-size:33px; font-weight:760; }
      .keyword-support span { display:block; padding:0 24px; border-left:3px solid ${COLORS.line}; white-space:nowrap; }
      .keyword-support span:first-child { padding-left:0; border-left:0; color:${COLORS.primary}; }
      .visual-signal .keyword-main { color:${COLORS.primary}; }
      .visual-signal .keyword-rule { width:530px; background:${COLORS.secondary}; }
      .route-title { position:absolute; left:0; top:86px; width:900px; color:${COLORS.ink}; font-size:58px; font-weight:900; line-height:1.08; }
      .route-line { position:absolute; left:70px; right:90px; top:310px; height:5px; background:${COLORS.primary}; transform-origin:0 50%; }
      .route-line::after { content:""; position:absolute; right:-2px; top:-8px; width:20px; height:20px; border-top:5px solid ${COLORS.primary}; border-right:5px solid ${COLORS.primary}; transform:rotate(45deg); }
      .route-terms { position:absolute; left:0; right:18px; top:196px; display:flex; justify-content:space-between; gap:42px; }
      .route-term { position:relative; width:31%; min-height:238px; padding-top:92px; text-align:center; }
      .route-term::before { content:""; position:absolute; left:50%; top:102px; width:28px; height:28px; margin-left:-14px; border:6px solid ${COLORS.primary}; border-radius:50%; background:${COLORS.background}; }
      .route-term span { position:absolute; left:50%; top:20px; transform:translateX(-50%); color:${COLORS.secondaryText}; font-family:"JetBrains Mono Local",monospace; font-size:20px; font-weight:800; }
      .route-term strong { display:block; margin-top:72px; color:${COLORS.ink}; font-size:42px; font-weight:860; line-height:1.1; }
      .route-layout-canvas { position:absolute; left:0; top:190px; width:1040px; height:250px; }
      .route-layout-lines { position:absolute; inset:0; width:1040px; height:250px; overflow:visible; }
      .route-layout-line { fill:none; stroke:${COLORS.primary}; stroke-width:5; stroke-linecap:round; }
      .route-layout-term { position:absolute; min-height:0; padding:24px 12px 14px; border-bottom:5px solid ${COLORS.primary}; background:rgba(251,243,231,.72); text-align:center; }
      .route-layout-term::before { left:50%; top:-12px; width:24px; height:24px; margin-left:-12px; border-width:5px; }
      .route-layout-term span { top:10px; }
      .route-layout-term strong { margin-top:28px; font-size:34px; line-height:1.08; overflow-wrap:anywhere; }
      .contrast-layout { position:absolute; left:0; right:26px; top:156px; height:340px; display:grid; grid-template-columns:1fr 100px 1.25fr; align-items:center; }
      .contrast-word { min-width:0; font-weight:900; line-height:1.03; overflow-wrap:anywhere; }
      .muted-word { color:${COLORS.muted}; font-size:62px; }
      .primary-word { color:${COLORS.primary}; }
      .contrast-arrow { color:${COLORS.secondary}; font-size:74px; font-weight:300; text-align:center; }
      .stack-index { position:absolute; right:38px; top:124px; color:${COLORS.line}; font-family:"JetBrains Mono Local",monospace; font-size:178px; font-weight:900; line-height:1; }
      .stack-terms { position:absolute; left:0; top:132px; width:780px; }
      .stack-term { height:118px; display:flex; align-items:center; gap:34px; border-bottom:2px solid ${COLORS.line}; color:${COLORS.muted}; }
      .stack-term span { width:48px; color:${COLORS.secondaryText}; font-family:"JetBrains Mono Local",monospace; font-size:20px; font-weight:800; }
      .stack-term strong { font-size:47px; font-weight:820; }
      .stack-primary { color:${COLORS.ink}; border-bottom:7px solid ${COLORS.primary}; }
      .stack-primary strong { font-size:72px; font-weight:900; }
      .close-terms { position:absolute; left:0; top:144px; width:1030px; display:grid; grid-template-columns:repeat(4,1fr); gap:24px; }
      .close-terms strong { height:128px; display:flex; align-items:center; justify-content:center; border-bottom:8px solid ${COLORS.primary}; color:${COLORS.ink}; font-size:48px; font-weight:900; }
      .close-line { position:absolute; left:0; top:346px; width:960px; color:${COLORS.primary}; font-size:54px; font-weight:860; line-height:1.18; }
      .media-frame { position:absolute; left:0; top:62px; width:980px; height:492px; overflow:hidden; border:2px solid ${COLORS.line}; background:${COLORS.surface}; box-shadow:0 24px 54px rgba(73,60,49,.12); }
      .media-frame-bar { height:52px; padding:0 18px; display:flex; align-items:center; gap:9px; border-bottom:2px solid ${COLORS.line}; color:${COLORS.muted}; }
      .media-frame-bar span { width:12px; height:12px; border-radius:50%; background:${COLORS.line}; }
      .media-frame-bar span:nth-child(2) { background:${COLORS.secondary}; }
      .media-frame-bar span:nth-child(3) { background:${COLORS.primary}; }
      .media-frame-bar strong { margin-left:auto; font-family:"JetBrains Mono Local",monospace; font-size:17px; }
      .media-frame > img { width:100%; height:438px; object-fit:cover; object-position:center; }
      .device-frame > img { object-fit:contain; padding:22px; background:#fff; }
      .media-callout { position:absolute; left:28px; bottom:24px; max-width:760px; padding:16px 22px; background:rgba(242,223,199,.94); border-left:7px solid ${COLORS.primary}; }
      .media-callout strong { display:block; font-size:38px; line-height:1.05; }
      .media-callout span { display:block; margin-top:7px; color:${COLORS.muted}; font-size:21px; }
      .media-compare { position:absolute; left:0; top:90px; width:1040px; height:456px; display:grid; grid-template-columns:1fr 1fr; gap:28px; }
      .media-compare figure { position:relative; margin:0; overflow:hidden; border:2px solid ${COLORS.line}; background:${COLORS.surface}; }
      .media-compare img { width:100%; height:100%; object-fit:cover; }
      .media-compare figcaption { position:absolute; left:18px; right:18px; bottom:18px; padding:12px 16px; background:rgba(242,223,199,.94); color:${COLORS.ink}; font-size:30px; font-weight:850; }
      .bounded-carrier { position:absolute; left:0; top:56px; width:1040px; height:500px; overflow:hidden; border:2px solid ${COLORS.line}; background:${COLORS.surface}; box-shadow:0 24px 54px rgba(73,60,49,.12); }
      .carrier-header { position:absolute; left:30px; top:24px; right:30px; z-index:3; }
      .carrier-header > span { color:${COLORS.secondaryText}; font:700 17px/1.2 "JetBrains Mono Local",monospace; letter-spacing:0; }
      .carrier-header h2 { margin:10px 0 0; color:${COLORS.ink}; font-size:42px; line-height:1.1; font-weight:900; }
      .carrier-evidence { position:absolute; right:24px; bottom:22px; min-width:170px; padding:10px 14px; border-left:5px solid ${COLORS.primary}; background:rgba(242,223,199,.94); z-index:5; }
      .carrier-evidence span { display:block; color:${COLORS.muted}; font:700 13px/1.1 "JetBrains Mono Local",monospace; }
      .carrier-evidence strong { display:block; margin-top:4px; color:${COLORS.ink}; font-size:18px; line-height:1.15; }
      .carrier-evidence.is-mock { border-left-color:${COLORS.secondary}; }
      .chart-grid { position:absolute; left:52px; right:230px; bottom:55px; height:280px; display:grid; grid-template-columns:repeat(6,1fr); gap:18px; align-items:end; border-bottom:2px solid ${COLORS.line}; }
      .chart-column { position:relative; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; min-width:0; }
      .chart-column > strong { min-height:30px; margin-bottom:8px; color:${COLORS.ink}; font-size:18px; white-space:nowrap; }
      .chart-column label { position:absolute; bottom:-35px; max-width:100%; overflow:hidden; color:${COLORS.muted}; font-size:15px; white-space:nowrap; text-overflow:ellipsis; }
      .chart-bar-track { width:64px; height:210px; display:flex; align-items:flex-end; justify-content:center; border-radius:6px 6px 0 0; background:rgba(220,194,163,.38); overflow:hidden; }
      .chart-bar-fill { display:block; width:100%; min-height:8px; border-radius:6px 6px 0 0; background:${COLORS.primary}; transform:scaleY(0); }
      .chart-column.is-highlight .chart-bar-fill { background:${COLORS.secondary}; }
      .carrier-window-bar { position:relative; height:48px; padding:0 18px; display:flex; align-items:center; gap:8px; border-bottom:2px solid ${COLORS.line}; background:${COLORS.surface}; color:${COLORS.muted}; z-index:3; }
      .carrier-window-bar i { width:11px; height:11px; border-radius:50%; background:${COLORS.line}; }
      .carrier-window-bar i:nth-child(2) { background:${COLORS.secondary}; }
      .carrier-window-bar i:nth-child(3) { background:${COLORS.primary}; }
      .carrier-window-bar strong { margin-left:auto; font:700 16px/1.1 "JetBrains Mono Local",monospace; }
      .code-lines { position:absolute; left:24px; top:74px; right:24px; bottom:24px; padding:12px 0 78px; overflow:hidden; background:#2A211B; color:#FBF3E7; font:600 20px/1.55 "JetBrains Mono Local",monospace; z-index:1; }
      .code-line { display:grid; grid-template-columns:48px 30px 1fr; align-items:center; min-height:36px; padding:0 16px; white-space:nowrap; }
      .code-line > span { color:#F0E2D2; }
      .code-line > b { color:#F2DFC7; }
      .code-line code { overflow:hidden; text-overflow:ellipsis; }
      .code-line.code-add { background:rgba(73,105,88,.35); }
      .code-line.code-add > b { color:#D7F2DF; }
      .code-line.code-remove { background:rgba(169,78,54,.35); }
      .code-line.code-remove > b { color:#FFD5CA; }
      .code-line.code-focus { box-shadow:inset 7px 0 ${COLORS.secondary}; background:rgba(220,194,163,.18); }
      .device-state-grid { position:absolute; left:34px; right:34px; top:126px; display:grid; grid-template-columns:repeat(3, 1fr); gap:18px; }
      .device-state { min-height:258px; padding:18px; border:2px solid ${COLORS.line}; border-radius:10px; background:#FFF9F1; opacity:0; }
      .device-state.is-active { border-color:${COLORS.primary}; box-shadow:0 12px 26px rgba(73,105,88,.14); }
      .device-state-top { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; border-bottom:2px solid ${COLORS.line}; color:${COLORS.ink}; }
      .device-state-top span { color:${COLORS.secondaryText}; font:700 16px/1 "JetBrains Mono Local",monospace; }
      .device-state-top strong { font-size:23px; }
      .device-row { display:flex; align-items:center; gap:10px; padding:16px 0 0; color:${COLORS.muted}; font-size:18px; }
      .device-row i { flex:0 0 auto; width:12px; height:12px; border-radius:50%; background:${COLORS.primary}; }
      .content-progress { position:absolute; left:0; bottom:0; width:1130px; height:4px; background:${COLORS.secondary}; transform-origin:0 50%; }
      .caption-shell { position:absolute; left:96px; top:926px; width:1728px; height:88px; border-top:2px solid ${COLORS.line}; background:${COLORS.surface}; z-index:190; }
      .caption-cue { position:absolute; left:96px; top:926px; width:1728px; height:88px; padding:0 34px; display:flex; align-items:center; overflow:hidden; z-index:200; color:#493C31; font-size:27px; font-weight:550; line-height:1.35; letter-spacing:0; opacity:0; will-change:transform,opacity; }
      .caption-cue.is-initial { opacity:1; }
      .caption-cue span { display:block; width:1660px; max-height:76px; overflow:hidden; text-align:left; }
      .lucide-receipt { display:none; }
    </style>
  </head>
  <body>
    <div data-hf-id="main-root" id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080" data-fps="30">
      <div data-hf-id="persistent-stage" class="stage-fill" data-role="persistent-stage" data-zone="stage" data-layout-ignore></div>
      <div data-hf-id="host-zone" id="host-zone" class="host-zone" data-role="host" data-zone="host.left">
        <div data-hf-id="host-shadow" class="host-shadow" aria-hidden="true"></div>
        ${hostLayers}
        <div data-hf-id="host-accent" id="host-accent" class="host-accent" aria-hidden="true"></div>
      </div>
      <div data-hf-id="content-zone" id="content-zone" class="content-zone" data-role="content" data-zone="content.right">
        ${topics}
        <div data-hf-id="visual-stage" class="visual-stage" data-role="visual-stage">${visualStates}</div>
        <div data-hf-id="content-progress" id="content-progress" class="content-progress" aria-hidden="true"></div>
      </div>
      <div id="caption-shell" data-hf-id="caption-shell" class="caption-shell" data-role="caption-shell" data-zone="caption"></div>
      ${captions}
      <audio data-hf-id="narration-final" id="narration-final" class="clip" src="./assets/audio/narration.final.wav" data-start="${introPaddingSeconds}" data-duration="${audioDuration}" data-track-index="30" data-volume="1"></audio>
      ${sfxClips}
      <div data-hf-id="lucide-receipt" class="lucide-receipt" data-source="lucide-react@0.468.0" data-license="ISC"></div>
    </div>
    <script>
      ${renderTimeline({ duration, scenes, shots, introPaddingSeconds })}
    </script>
  </body>
</html>`;
  return addStableHfIds(html);
}
