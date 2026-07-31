const ALGORITHM_VERSION = '1.0.1';
const PRODUCTION_LIFECYCLE_STATES = new Set(['approved-project', 'promoted-template']);
const DIVERSITY_SEMANTIC_TOLERANCE = 0.35;

const TRIGGER_PATTERNS = Object.freeze({
  'single-concept': /(核心|关键|本质|概念|意味着|就是|复杂性)/i,
  'short-conclusion': /(所以|因此|结论|真正|这才是|记住)/i,
  'chapter-label': /(第一|第二|第三|首先|其次|最后)/i,
  'source-evidence': /(证据|来源|截图|原文|案例|实测)/i,
  'article-claim': /(文章|报道|研究|资料|报告)/i,
  'product-proof': /(产品|功能|效果|结果|演示)/i,
  'app-workflow': /(应用|平台|工作流|低代码|无代码|工具)/i,
  'browser-step': /(浏览器|网页|页面|网址|标签页)/i,
  'tool-demonstration': /(点击|拖拽|按钮|选择|输入|打开|操作)/i,
  'interface-layer': /(界面|面板|节点|菜单|状态)/i,
  'ordered-process': /(步骤|流程|首先|其次|然后|接着|最后)/i,
  dependency: /(依赖|前置|上下游|调用|连接|关系)/i,
  'causal-chain': /(导致|因为|所以|原因|结果|影响)/i,
  'system-architecture': /(系统|架构|模型|接口|API|权限|数据|向量库|工具链|状态管理)/i,
  'verified-number': /\d+(?:[.,]\d+)?\s*(?:%|[kK]|万|亿|倍|秒|分钟|小时)?/i,
  'measured-change': /(增长|下降|提升|减少|增加|变化|对比)/i,
  'ranked-evidence': /(排名|第[一二三四五\d]+|Top\s*\d+)/i,
  'before-after': /(之前|之后|前后|从.+到|改造前|改造后)/i,
  'wrong-right': /(错误|正确|误区|真正|不是.+而是|不等于)/i,
  'demo-product': /(演示|成品|效果|实际)/i,
  'magic-engineering': /(封装|按钮|节点|底层|工程|架构)/i,
  'code-change': /(代码|改动|提交|diff|配置)/i,
  debugging: /(报错|错误|调试|debug|异常|失败)/i,
  'log-reading': /(日志|log|堆栈|trace)/i,
  maintenance: /(维护|排查|修复|复现|测试)/i,
  'failure-analysis': /(问题出在|故障|报错|权限|状态管理)/i,
  'hidden-complexity': /(隐藏|藏起来|复杂|黑盒|看不见)/i,
  'fragile-foundation': /(脆弱|基础|底座|根基|依赖)/i,
  shortcut: /(捷径|快速|拖拽|按钮|封装)/i,
  'system-layer': /(分层|层级|系统|架构|上下游)/i,
});

const normalize = (value) => String(value ?? '').trim();
const round3 = (value) => Math.round(value * 1000) / 1000;
const unique = (values) => [...new Set(values.filter(Boolean))];

const matchedTriggers = (recipe, text) => (recipe.semanticTriggers ?? [])
  .filter((trigger) => TRIGGER_PATTERNS[trigger]?.test(text));

const keywordCount = (text) => normalize(text).split(/[|｜、，,\s]+/).filter(Boolean).length;
const contrastReady = (text) => /(不是.+而是|不等于|≠|\bvs\.?\b|相比|区别|相反|前后|错误.+正确|好处.+问题|一边.+另一边)/i.test(text);

const requirementContext = ({shot, scene, graph, verifiedClaimIds}) => {
  const assetRefs = Array.isArray(shot.assetRefs) ? shot.assetRefs : [];
  const roles = new Set(assetRefs.map((ref) => ref.role));
  return {
    sourceCueIds: Boolean(shot.cueId),
    keywords: keywordCount(shot.screenText?.text ?? shot.text ?? shot.narration) >= 1,
    graph: Boolean(graph?.nodes?.length && graph?.edges?.length),
    comparison: contrastReady(`${shot.narration ?? ''} ${shot.screenText?.text ?? shot.text ?? ''}`),
    verifiedClaim: (verifiedClaimIds ?? []).length > 0,
    evidenceAsset: assetRefs.length > 0 && (roles.has('evidence') || roles.has('image')),
    interfaceAsset: assetRefs.length > 0 && roles.has('interface'),
    codeAsset: assetRefs.length > 0 && roles.has('code'),
    metaphorAsset: assetRefs.length > 0 && (roles.has('metaphor') || roles.has('icon')),
    callback: Array.isArray(shot.callbackCueIds) && shot.callbackCueIds.length > 0,
    sceneRole: scene?.role ?? null,
  };
};

const inputReady = (input, visualType) => ({
  keyword: input.sourceCueIds && input.keywords,
  'evidence-image': input.sourceCueIds && input.evidenceAsset,
  'device-surface': input.sourceCueIds && input.interfaceAsset,
  diagram: input.sourceCueIds && input.graph,
  'data-proof': input.sourceCueIds && input.verifiedClaim,
  comparison: input.sourceCueIds && input.comparison,
  'code-surface': input.sourceCueIds && input.codeAsset,
  'object-metaphor': input.sourceCueIds && input.metaphorAsset && input.callback,
}[visualType] === true);

const missingInputs = (recipe, input) => {
  if (inputReady(input, recipe.visualType)) return [];
  const missing = [];
  if (!input.sourceCueIds) missing.push('sourceCueIds');
  if (recipe.visualType === 'keyword' && !input.keywords) missing.push('one-to-four-keywords');
  if (recipe.visualType === 'diagram' && !input.graph) missing.push('Graph IR nodes/edges');
  if (recipe.visualType === 'comparison' && !input.comparison) missing.push('two explicit states + contrast rule');
  if (recipe.visualType === 'data-proof' && !input.verifiedClaim) missing.push('verified claim + source receipt');
  if (recipe.visualType === 'evidence-image' && !input.evidenceAsset) missing.push('frozen evidence image');
  if (recipe.visualType === 'device-surface' && !input.interfaceAsset) missing.push('frozen interface states');
  if (recipe.visualType === 'code-surface' && !input.codeAsset) missing.push('real code/log/terminal evidence');
  if (recipe.visualType === 'object-metaphor') {
    if (!input.metaphorAsset) missing.push('frozen metaphor asset');
    if (!input.callback) missing.push('callback cue');
  }
  return unique(missing);
};

const feedbackScore = ({recipe, text, feedback}) => {
  const record = feedback?.[recipe.id];
  if (!record) return {score: 0, receipt: null};
  const verdictScore = Number(record.reuse ?? 0) * 0.3
    + Number(record.tune ?? 0) * 0.05
    - Number(record.hold ?? 0) * 0.25
    - Number(record['retire-candidate'] ?? 0) * 0.8;
  const topicMatches = (record.suitableTopics ?? []).filter((topic) => normalize(text).includes(normalize(topic))).length;
  return {
    score: round3(Math.max(-1.5, Math.min(1.5, verdictScore + topicMatches * 0.2))),
    receipt: {sampleCount: Number(record.sampleCount ?? 0), topicMatches},
  };
};

const semanticScore = ({recipe, triggers, input, sceneRole, currentRecipeId, feedbackAdjustment}) => {
  let score = triggers.length * 2;
  if (recipe.id === currentRecipeId) score += 0.25;
  if (recipe.visualType === 'keyword') score += 0.35;
  if (sceneRole === 'process' && recipe.visualType === 'diagram') score += 0.8;
  if (sceneRole === 'compare' && recipe.visualType === 'comparison') score += 0.8;
  if (sceneRole === 'close' && recipe.visualType === 'keyword') score += 0.3;
  if (inputReady(input, recipe.visualType)) score += 0.4;
  return round3(score + feedbackAdjustment);
};

export function recommendMotionRecipes({projectId, shots, scenes = [], graphs = [], recipes, feedback = {}}) {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const graphByScene = new Map(graphs.map((graph) => [graph.sceneId, graph]));
  const decisions = [];
  const selectedUsage = new Map();
  let previousRecipeId = null;
  let repeated = 0;

  for (const shot of shots ?? []) {
    const scene = sceneById.get(shot.sceneId) ?? null;
    const graph = graphByScene.get(shot.sceneId) ?? null;
    const text = normalize(`${shot.narration ?? ''} ${shot.screenText?.text ?? shot.text ?? ''}`);
    const input = requirementContext({
      shot,
      scene,
      graph,
      verifiedClaimIds: (shot.provenanceRefs ?? []).filter((ref) => String(ref).startsWith('claim:')),
    });
    const ranked = (recipes ?? []).map((recipe) => {
      const triggers = matchedTriggers(recipe, text);
      const feedbackResult = feedbackScore({recipe, text, feedback});
      const missing = missingInputs(recipe, input);
      const lifecycleState = recipe.lifecycleState ?? recipe.status ?? 'unknown';
      const projectAllowed = recipe.allowedForProject === true;
      const lifecycleProductionReady = PRODUCTION_LIFECYCLE_STATES.has(lifecycleState);
      const lifecycleBlocker = lifecycleProductionReady && projectAllowed
        ? null
        : recipe.blockedReason ?? (lifecycleProductionReady
          ? 'project-approval-missing'
          : `${lifecycleState}-not-production-approved`);
      const score = semanticScore({
        recipe,
        triggers,
        input,
        sceneRole: scene?.role,
        currentRecipeId: shot.motionRecipeRefs?.[0]?.recipeId,
        feedbackAdjustment: feedbackResult.score,
      });
      return {
        recipeId: recipe.id,
        version: recipe.version,
        visualType: recipe.visualType,
        score,
        matchedTriggers: triggers,
        requiredInputs: recipe.requiredInputs ?? [],
        missingInputs: missing,
        inputReady: missing.length === 0,
        lifecycleState,
        allowedForProject: projectAllowed,
        lifecycleProductionReady,
        productionReady: missing.length === 0 && lifecycleProductionReady && projectAllowed,
        lifecycleBlocker,
        blockedReason: missing.length
          ? 'required-inputs-missing'
          : lifecycleProductionReady && projectAllowed
            ? null
            : lifecycleBlocker,
        feedback: feedbackResult.receipt,
        purpose: recipe.purpose,
        fallbackRecipeId: recipe.fallbackRecipeId ?? null,
      };
    }).sort((left, right) => right.score - left.score || left.recipeId.localeCompare(right.recipeId));

    const feasible = ranked.filter((candidate) => candidate.inputReady && (candidate.score >= 0.75 || candidate.visualType === 'keyword'));
    const feasibleLeader = feasible[0] ?? null;
    const semanticPeers = feasibleLeader
      ? feasible.filter((candidate) => candidate.score >= feasibleLeader.score - DIVERSITY_SEMANTIC_TOLERANCE)
      : [];
    const adjusted = semanticPeers.map((candidate) => {
      const repeatPenalty = candidate.recipeId === previousRecipeId && repeated >= 2 ? 0.9 : 0;
      const usagePenalty = Math.min(0.6, Number(selectedUsage.get(candidate.recipeId) ?? 0) * 0.08);
      return {...candidate, sequenceScore: round3(candidate.score - repeatPenalty - usagePenalty)};
    }).sort((left, right) => right.sequenceScore - left.sequenceScore || right.score - left.score || left.recipeId.localeCompare(right.recipeId));
    const selected = adjusted[0] ?? ranked.find((candidate) => candidate.visualType === 'keyword') ?? ranked[0] ?? null;
    if (selected) {
      repeated = selected.recipeId === previousRecipeId ? repeated + 1 : 1;
      previousRecipeId = selected.recipeId;
      selectedUsage.set(selected.recipeId, Number(selectedUsage.get(selected.recipeId) ?? 0) + 1);
    }
    const semanticLeader = ranked[0] ?? null;
    const recommendationReason = selected
      ? semanticLeader && semanticLeader.recipeId !== selected.recipeId
        ? semanticLeader.missingInputs.length
          ? `Selected ${selected.recipeId} because ${semanticLeader.recipeId} is missing required inputs.`
          : `Selected ${selected.recipeId} to avoid repetitive motion while preserving semantic fit.`
        : selected.matchedTriggers.length
          ? `Matched semantic trigger(s): ${selected.matchedTriggers.join(', ')}.`
          : selected.inputReady
            ? `Selected ${selected.recipeId} from scene role and available input carriers.`
            : `Selected ${selected.recipeId} as the conservative fallback; required inputs are still missing.`
      : 'No motion recipe candidate is available.';
    const summarizeCandidate = (candidate) => candidate ? ({
      recipeId: candidate.recipeId,
      version: candidate.version,
      visualType: candidate.visualType,
      score: candidate.score,
      trigger: candidate.matchedTriggers,
      reason: candidate.recipeId === selected?.recipeId ? recommendationReason : candidate.purpose,
      missingInputs: candidate.missingInputs,
      inputReady: candidate.inputReady,
      lifecycleState: candidate.lifecycleState,
      lifecycleBlocker: candidate.lifecycleBlocker,
      productionReady: candidate.productionReady,
      feedback: candidate.feedback,
    }) : null;
    decisions.push({
      cueId: shot.cueId,
      sceneId: shot.sceneId,
      currentRecipeId: shot.motionRecipeRefs?.[0]?.recipeId ?? null,
      recommendedRecipeId: selected?.recipeId ?? null,
      semanticLeaderRecipeId: semanticLeader?.recipeId ?? null,
      fallbackUsed: Boolean(semanticLeader && selected && semanticLeader.recipeId !== selected.recipeId),
      fallbackReason: semanticLeader && selected && semanticLeader.recipeId !== selected.recipeId
        ? semanticLeader.missingInputs.length
          ? `Higher-scoring ${semanticLeader.recipeId} is missing: ${semanticLeader.missingInputs.join(', ')}.`
          : 'A bounded diversity penalty selected an equally feasible alternative.'
        : null,
      recommendation: summarizeCandidate(selected),
      alternatives: ranked
        .filter((candidate) => candidate.recipeId !== selected?.recipeId)
        .slice(0, 3)
        .map(summarizeCandidate),
      trigger: selected?.matchedTriggers ?? [],
      reason: recommendationReason,
      missingInputs: selected?.missingInputs ?? [],
      lifecycleBlocker: selected?.lifecycleBlocker ?? null,
      candidates: ranked.slice(0, 4),
    });
  }

  return {
    schemaVersion: 'autovideo-motion-recipe-match-plan/v1',
    algorithmVersion: ALGORITHM_VERSION,
    projectId,
    status: 'candidate',
    policy: {
      autoApprove: false,
      humanProbeRequired: true,
      requiredInputsFailClosed: true,
      feedbackCannotPromoteLifecycle: true,
      maxConsecutiveSameRecipe: 2,
      fixedBrandShell: {
        baseStyleId: 'modern-ip-host-explainer',
        paletteId: 'light-apricot',
        background: '#F2DFC7',
        hostZone: 'host.left',
        contentZone: 'content.right',
        captionZone: 'caption',
      },
    },
    decisions,
  };
}

export const motionRecipeMatcherVersion = ALGORITHM_VERSION;
