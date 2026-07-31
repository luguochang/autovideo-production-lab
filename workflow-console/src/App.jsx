import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Background,
  applyNodeChanges,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  CirclePlus,
  ExternalLink,
  FileText,
  GitBranch,
  Headphones,
  LoaderCircle,
  Pencil,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import {stageAppliesToProject} from '../workflow-catalog.mjs';
import {
  markPronunciationCandidatePlayed,
  selectPronunciationCandidate,
} from '../lib/pronunciation-review-draft.mjs';
import {summarizeVisualPlanArtifact} from '../lib/visual-plan-review.mjs';

const STATUS_LABELS = {
  'not-started': '未开始',
  queued: '排队中',
  running: '生成中',
  'needs-review': '待微调',
  approved: '已批准',
  stale: '需重算',
  failed: '失败',
  complete: '已完成',
  canceled: '已取消',
  'cancel-requested': '取消中',
  disabled: '已停用',
};

const APPROVAL_SCOPE_LABELS = {
  'technical-only': '技术通过，待人工听审',
  'human-listening': '人工听审已批准',
  'user-directed-selection-no-listening': '用户确认选择，剩余试听已跳过',
  'internal-autonomous-review': '内部自动审查',
  'user-provided-input': '用户提供输入',
  'human-review': '人工审查',
  machine: '机器回执',
};

const MATURITY_LABELS = {
  ready: '已接入',
  'adapter-ready': '适配器可用',
  'ready-with-adapter': '已接入，可替换',
  'project-custom': '项目自定义',
  'partial-base-asr': '基础 ASR，待精确对齐',
  'ready-structure-only': '结构检查已接入',
  'master-only': '仅母版渲染',
  'ready-core-media': '核心媒体 QA 已接入',
  'ready-with-overrides': '已接对象级微调',
  'partial-layout-only': '仅自动布局已接入',
};

const RELEASE_PHASE_LABELS = {
  production: '制作中',
  'internal-review-package': '内部审片包',
  'public-master-candidate': '公开母版候选',
  published: '已发布',
};

const BATCH_STATUS_LABELS = {
  draft: '草稿',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '有失败',
  canceled: '已取消',
  'waiting-human': '等待人工确认',
};

const BATCH_READINESS_LABELS = {
  ready: '可进全片编排',
  delivery: '可交付',
  blocked: '有前置阻塞',
};

const MATURITY_GATE_LABELS = {
  'public-release-candidate': '公开发布候选',
  'three-route-real-gold': '三入口真实金标',
  'content-regression-human-gold': '真人内容金标',
  'motion-human-lifecycle': '动效人工生命周期',
  'twenty-real-project-recoveries': '20 项目稳定恢复',
  'rights-and-sha-current': '权利与 SHA',
  'workbench-state-separation': '状态分层',
  'human-approval-integrity': '人工批准完整性',
};

const SCALE_METRIC_LABELS = {
  elapsedSeconds: '恢复耗时',
  humanMinutes: '人工分钟',
  cpuSeconds: 'CPU 秒',
  gpuSeconds: 'GPU 秒',
  modelCalls: '模型调用',
  retryCount: '重试',
  overrideCount: '人工覆盖',
  assetReuseCount: '素材复用',
  assetCandidateCount: '素材候选',
  recipeReuseCount: '配方复用',
  recipeOpportunityCount: '配方机会',
  reworkCount: '返工',
};

const scaleMetricValue = (key, item) => {
  if (!item || item.value == null) return '未知';
  if (key.endsWith('Seconds')) return `${Number(item.value).toFixed(key === 'elapsedSeconds' ? 1 : 0)}s`;
  if (key === 'humanMinutes') return `${Number(item.value).toFixed(1)}m`;
  return String(item.value);
};

const maturityGateDetail = (gate, maturity) => {
  const summary = maturity.summary;
  const thresholds = maturity.policy.thresholds;
  if (gate.passed) return gate.id === 'workbench-state-separation'
    ? 'generated / override / effective 与发布状态已分开'
    : '证据当前有效';
  if (gate.id === 'public-release-candidate') return `公开候选 ${summary.publicReleaseCandidates}/${thresholds.publicReleaseCandidates}，真人四门与公开权利未齐`;
  if (gate.id === 'three-route-real-gold') return `文字 ${summary.routeGoldCounts.script} · 资料 ${summary.routeGoldCounts.materials} · 录音 ${summary.routeGoldCounts.audio}`;
  if (gate.id === 'content-regression-human-gold') return `真人评分 ${summary.humanReviewedContentGoldCases}/${thresholds.humanReviewedContentGoldCases}`;
  if (gate.id === 'motion-human-lifecycle') return `人工生命周期 ${summary.motionHumanLifecycle}/${thresholds.motionRecipesWithHumanLifecycle} · 模板 ${summary.motionTemplatesPromoted}`;
  if (gate.id === 'twenty-real-project-recoveries') return `真实恢复 ${summary.recoverableRealProjects}/${thresholds.recoverableRealProjects}，时长与载体矩阵待覆盖`;
  if (gate.id === 'rights-and-sha-current') return `权利当前 ${summary.rightsCurrentProjects}/${summary.realProjects} · 公开候选 ${summary.publicReleaseCandidates}`;
  if (gate.id === 'human-approval-integrity') return `内部模拟不计真人；可验证真实项目 ${summary.realProjects}`;
  return gate.blockers[0] || '证据未满足';
};

const LISTENING_CHECKLIST = [
  ['naturalness', '整体语速、语气和重音自然'],
  ['breathing', '段落呼吸和停顿自然'],
  ['pronunciation', '普通话与中英混读正确'],
  ['segmentJoins', '分段拼接连续，无跳变'],
  ['noArtifacts', '无削波、爆音、点击或异常噪声'],
];

const FINAL_REVIEW_CHECKLIST = [
  ['fullTimeline', '从头到尾观看完整时间线'],
  ['audioVisualSync', '配音、字幕、场景与动效同步'],
  ['captions', '字幕断句、可读性和术语正确'],
  ['visuals', '人物、图解、布局和转场无异常'],
  ['content', '观点边界、数字表达和结尾信息正确'],
];

const SUBTITLE_REVIEW_CHECKLIST = [
  ['meaning', '字幕语义与锁定口播和上下文一致'],
  ['terminology', '专名、数字与中英混排准确'],
  ['segmentation', '断句和字幕分段自然'],
  ['punctuation', '标点和语气符合口播'],
  ['timingReadability', '出现时机和停留时间可读'],
];

const SCREEN_TEXT_REVIEW_CHECKLIST = [
  ['allReviewFramesChecked', '逐张检查当前抽帧中的全部可见文字'],
  ['subtitleSafeArea', '字幕位于安全区且未被裁切'],
  ['noOcclusion', '人物、图解和字幕没有互相遮挡'],
  ['screenTextAccuracy', '标题、关键词和图解文字准确'],
  ['contrastAndLegibility', '字号、对比度和停留状态可读'],
  ['lineBreakAndOverflow', '换行自然，文字没有溢出容器'],
  ['duplicateTextRestraint', '屏幕文字没有重复整段口播'],
];

const TEXT_REVIEW_DECISION_LABELS = {
  pending: '待确认',
  accepted: '通过',
  revise: '退回修改',
};

const emptyListeningChecklist = Object.fromEntries(LISTENING_CHECKLIST.map(([key]) => [key, false]));

const makeAudioReviewDraft = (audioReview) => ({
  checklist: {...emptyListeningChecklist, ...(audioReview?.review?.checklist || {})},
  decision: audioReview?.review?.decision || 'pending',
  selectedCandidateId: audioReview?.review?.selectedCandidateId || null,
  playedCandidateIds: [...(audioReview?.review?.playedCandidateIds || [])],
  notes: audioReview?.review?.notes || '',
});

const makePronunciationReviewDraft = (pronunciationReview) => {
  const selectionOverrideApproved = pronunciationReview?.approval?.approvalScope === 'user-directed-selection-no-listening';
  return {
    terms: (pronunciationReview?.review?.terms || []).map((term) => ({
      token: term.token,
      decision: selectionOverrideApproved ? 'accepted' : (term.decision || 'pending'),
      selectedCandidateId: term.selectedCandidateId || null,
      playedCandidateIds: [...(term.playedCandidateIds || [])],
      note: term.note || '',
    })),
    notes: pronunciationReview?.review?.notes || '',
  };
};

const makeFinalReviewDraft = (finalReview) => ({
  checklist: {
    ...Object.fromEntries(FINAL_REVIEW_CHECKLIST.map(([key]) => [key, false])),
    ...(finalReview?.review?.checklist || {}),
  },
  notes: finalReview?.review?.notes || '',
});

const makeSubtitleReviewDraft = (subtitleReview) => ({
  checklist: {
    ...Object.fromEntries(SUBTITLE_REVIEW_CHECKLIST.map(([key]) => [key, false])),
    ...(subtitleReview?.review?.checklist || {}),
  },
  cues: (subtitleReview?.review?.cues || []).map((cue) => ({
    id: cue.id,
    decision: cue.decision || 'pending',
    note: cue.note || '',
  })),
  notes: subtitleReview?.review?.notes || '',
});

const makeScreenTextReviewDraft = (screenTextReview) => ({
  checklist: {
    ...Object.fromEntries(SCREEN_TEXT_REVIEW_CHECKLIST.map(([key]) => [key, false])),
    ...(screenTextReview?.review?.checklist || {}),
  },
  frames: (screenTextReview?.review?.frames || []).map((frame) => ({
    id: frame.id,
    decision: frame.decision || 'pending',
    note: frame.note || '',
  })),
  reviewMode: screenTextReview?.review?.reviewMode || (screenTextReview?.ocr?.available ? 'ocr-assisted' : 'manual'),
  notes: screenTextReview?.review?.notes || '',
});

const OVERRIDE_STAGE_IDS = new Set(['full-production', 'final-preview']);
const DEDICATED_REVIEW_STAGE_IDS = new Set(['pronunciation-review', 'voice-final', 'subtitle-review', 'screen-text-review', 'final-preview']);
const defaultInspectorTabForStage = (stageId) => {
  if (['pronunciation-review', 'voice-final', 'subtitle-review', 'screen-text-review', 'final-preview'].includes(stageId)) return 'review';
  if (stageId === 'visual-plan') return 'review';
  if (stageId === 'style-probe') return 'probe';
  if (stageId === 'full-production') return 'override';
  if (stageId === 'diagram-assets') return 'layout';
  if (stageId === 'retrospective') return 'feedback';
  return 'config';
};
const VISUAL_VARIANT_LABELS = [
  ['focus', '关键词聚焦'],
  ['signal', '风险 / 结论提示'],
  ['stack', '并列清单'],
  ['route', '真实流程 / 关系'],
  ['contrast', '前后对比'],
  ['close', '章节收束'],
];

const SFX_ROLE_LABELS = {
  'focus-hit': '重点落点',
  'connector-draw': '连线完成',
  'state-change': '鼠标点击 / 状态切换',
  error: '错误状态',
  'chapter-resolve': '章节收束',
};

const MOTION_INPUT_LABELS = {
  sourceCueIds: '缺少口播节拍绑定',
  'one-to-four-keywords': '缺少 1-4 个屏幕关键词',
  'Graph IR nodes/edges': '缺少可验证的流程图节点与连线',
  'two explicit states + contrast rule': '缺少两个明确状态和对比规则',
  'verified claim + source receipt': '缺少已核验观点及来源回执',
  'frozen evidence image': '缺少已冻结的证据图片',
  'frozen interface states': '缺少已冻结的界面状态素材',
  'real code/log/terminal evidence': '缺少真实代码、日志或终端证据',
  'frozen metaphor asset': '缺少已冻结的隐喻素材',
  'callback cue': '缺少后续回扣节拍',
};

const motionInputLabel = (input) => MOTION_INPUT_LABELS[input] || input;

const motionRecommendationReason = (decision) => {
  if (decision?.fallbackUsed) return '更高分配方的必需输入不完整，已选择语义相近且输入可用的保守回退。';
  if (decision?.trigger?.length > 0) return `口播命中 ${decision.trigger.join(' / ')}，并已核对当前场景角色和素材载体。`;
  return '当前没有强语义触发词，建议来自场景角色、已有素材和受控历史反馈。';
};

const MOTION_FEEDBACK_VERDICT_LABELS = {
  pending: '待评价',
  reuse: '可直接复用',
  tune: '需要调优',
  hold: '暂缓使用',
  'retire-candidate': '建议进入退役评估',
};

const MOTION_OVERALL_VERDICT_LABELS = {
  pending: '复盘进行中',
  reusable: '整体可复用',
  'needs-tuning': '整体需要调优',
  reject: '本次组合不应复用',
};

const MOTION_PROBE_CHECKLIST = [
  ['layout', '整体构图清晰，无越界、遮挡或无意义留白'],
  ['textFit', '中文换行与字号可读，文字没有溢出'],
  ['seekBehavior', '拖动时间轴后状态正确，无闪烁或跳帧'],
  ['hostStable', 'Q版人物固定在左侧，姿态切换连续'],
  ['captionStable', '字幕栏固定，不跟随内容镜头移动'],
  ['terminalFrameReadable', '结尾画面有足够停留且结论可读'],
  ['officialReuseVisible', '复用的官方组件或动效确实可见且适配'],
  ['exactBackground', '背景保持浅杏色 #F2DFC7'],
  ['cameraScopedToContentWorld', '镜头运动只作用于右侧内容世界'],
];

const MOTION_PROBE_DECISION_LABELS = {
  pending: '继续审片',
  passed: '人工通过',
  failed: '退回重做',
};

const MOTION_LIFECYCLE_STATE_LABELS = {
  candidate: '候选',
  'probe-passed': '探针已验收',
  'approved-project': '已有项目批准',
  'promoted-template': '模板已晋级',
  retired: '已退役',
  missing: '合同缺失',
};

const MOTION_NEXT_ACTION_LABELS = {
  'repair-lifecycle-contract': '修复配方定义与生命周期台账绑定',
  'create-3-8s-canonical-probe': '生成 3-8 秒正式探针',
  'complete-human-probe-review': '完成九项真人审片',
  'accept-reviewed-probe-into-lifecycle': '验收探针并写入生命周期',
  'approve-in-a-real-project': '在首个真实项目中批准',
  'approve-in-second-real-project': '在第二个真实项目中批准',
  'run-cross-project-regression-and-template-review': '执行跨项目回归与模板审核',
  'monitor-cross-project-regression': '持续监测跨项目回归',
  'retired-no-new-use': '停止新项目使用，仅允许锁定版本回放',
  'inspect-lifecycle-state': '检查生命周期状态',
};

const emptyMotionProbeChecks = Object.fromEntries(MOTION_PROBE_CHECKLIST.map(([key]) => [key, false]));

const makeMotionProbeDraft = (probe) => ({
  decision: probe?.review?.decision || 'pending',
  checks: {...emptyMotionProbeChecks, ...(probe?.review?.checks || {})},
  notes: probe?.review?.notes || '',
});

const motionProbeFileUrl = (probe, relativePath) => probe && relativePath
  ? `/api/motion-library/probes/${encodeURIComponent(probe.id)}/file?path=${encodeURIComponent(relativePath)}`
  : '';

const projectDeliverableUrl = (projectId, relativePath) => projectId && relativePath
  ? `/api/projects/${encodeURIComponent(projectId)}/deliverables/file?path=${encodeURIComponent(relativePath)}`
  : '';

const motionProbeReuseLabel = (item) => typeof item === 'string'
  ? item
  : item?.id || item?.registryName || item?.ruleName || item?.kind || '复用来源';

const parseListInput = (value) => [...new Set(String(value || '')
  .split(/[，,、\n]/)
  .map((item) => item.trim())
  .filter(Boolean))].slice(0, 20);

const CARRIER_RECIPE_BY_ADAPTER = {
  'data-chart-bounded': 'data-proof',
  'code-surface-bounded': 'code-proof',
  'device-surface-bounded': 'device-surface-tour',
};

const carrierPayloadFromDraft = (draft) => {
  if (!draft.carrierAdapterId) return undefined;
  if (draft.carrierAdapterId === '__clear__') return null;
  const evidence = {
    status: 'verified',
    label: draft.carrierEvidenceLabel.trim(),
    receipt: {
      kind: draft.carrierEvidenceKind,
      id: draft.carrierEvidenceId.trim(),
      sha256: draft.carrierEvidenceSha256.trim().toLowerCase(),
    },
  };
  if (draft.carrierAdapterId === 'data-chart-bounded') {
    return {
      adapterId: draft.carrierAdapterId,
      evidence,
      data: {
        title: draft.carrierTitle.trim(),
        unit: draft.carrierUnit.trim() || undefined,
        highlightIndex: Math.min(1, Math.max(0, draft.carrierSeries.filter((item) => item.label.trim()).length - 1)),
        series: draft.carrierSeries.filter((item) => item.label.trim()).map((item) => ({label: item.label.trim(), value: Number(item.value)})),
      },
    };
  }
  if (draft.carrierAdapterId === 'code-surface-bounded') {
    return {
      adapterId: draft.carrierAdapterId,
      evidence,
      data: {
        title: draft.carrierTitle.trim(), language: draft.carrierLanguage.trim(), mode: draft.carrierCodeMode,
        lines: draft.carrierCodeLines.filter((item) => item.text.trim()).map((item) => ({kind: item.kind, text: item.text.trim()})),
      },
    };
  }
  return {
    adapterId: draft.carrierAdapterId,
    evidence,
    data: {
      title: draft.carrierTitle.trim(), productLabel: draft.carrierProductLabel.trim(), activeState: 1,
      states: draft.carrierStates.filter((item) => item.label.trim()).map((item) => ({label: item.label.trim(), rows: [item.row.trim()]})),
    },
  };
};

const carrierDraftReady = (draft) => {
  if (!draft?.carrierAdapterId || draft.carrierAdapterId === '__clear__') return true;
  if (!draft.carrierTitle.trim() || !draft.carrierEvidenceLabel.trim()
      || !['claim', 'source', 'media'].includes(draft.carrierEvidenceKind)
      || !draft.carrierEvidenceId.trim()
      || !/^[a-f0-9]{64}$/i.test(draft.carrierEvidenceSha256.trim())) return false;
  if (draft.carrierAdapterId === 'data-chart-bounded') {
    const items = draft.carrierSeries.filter((item) => item.label.trim());
    return items.length >= 2 && items.every((item) => item.value !== '' && Number.isFinite(Number(item.value)) && Number(item.value) >= 0);
  }
  if (draft.carrierAdapterId === 'code-surface-bounded') {
    return draft.carrierLanguage.trim().length > 0 && draft.carrierCodeLines.filter((item) => item.text.trim()).length >= 2;
  }
  return draft.carrierProductLabel.trim().length > 0
    && draft.carrierStates.filter((item) => item.label.trim() && item.row.trim()).length >= 2;
};

const makeOverrideDraft = (editor, level = 'scene') => {
  const collection = editor?.targets?.[`${level}s`] || [];
  return {
    level,
    targetId: collection[0]?.id || '',
    text: '',
    hostPose: '',
    layoutPreset: '',
    visualVariant: '',
    motionRecipeId: '',
    assetId: '',
    carrierAdapterId: '',
    carrierTitle: '',
    carrierEvidenceLabel: '',
    carrierEvidenceKind: 'claim',
    carrierEvidenceId: '',
    carrierEvidenceSha256: '',
    carrierUnit: '',
    carrierSeries: [{label: '', value: ''}, {label: '', value: ''}, {label: '', value: ''}],
    carrierLanguage: 'TypeScript',
    carrierCodeMode: 'highlight',
    carrierCodeLines: [{kind: 'context', text: ''}, {kind: 'focus', text: ''}, {kind: 'context', text: ''}],
    carrierProductLabel: '',
    carrierStates: [{label: '', row: ''}, {label: '', row: ''}, {label: '', row: ''}],
    sfxAssetId: '',
    sfxRole: '',
    reason: '',
  };
};

const makeSemanticSfxReviewDraft = (review) => ({
  sourcePlanSha256: review?.sourcePlan?.sha256 || '',
  decisions: (review?.decisions || []).map((item) => ({
    cueId: item.cueId,
    decision: item.decision || 'pending',
    note: item.note || '',
  })),
  notes: review?.notes || '',
});

const makeMotionFeedbackDraft = (feedback) => {
  const existing = new Map((feedback?.review?.recipeFeedback || []).map((item) => [`${item.recipeId}@${item.version}`, item]));
  return {
    usageKey: feedback?.sourceUsage?.usageKey || '',
    overallVerdict: feedback?.review?.overallVerdict || 'pending',
    recipeFeedback: (feedback?.sourceUsage?.recipes || []).map((recipe) => {
      const current = existing.get(`${recipe.recipeId}@${recipe.version}`);
      return {
        recipeId: recipe.recipeId,
        version: recipe.version,
        cueIds: recipe.cueIds || [],
        verdict: current?.verdict || 'pending',
        suitableTopicsText: (current?.suitableTopics || []).join('，'),
        issuesText: (current?.issues || []).join('，'),
        notes: current?.notes || '',
      };
    }),
    notes: feedback?.review?.notes || '',
  };
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(Number(seconds))) return '--:--';
  const rounded = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};

const listeningDraftReady = (draft, review) => Boolean(draft && review)
  && LISTENING_CHECKLIST.every(([key]) => draft.checklist?.[key] === true)
  && draft.decision === 'accepted'
  && review.candidates.some((candidate) => candidate.candidateId === draft.selectedCandidateId && candidate.selectable)
  && review.candidates.every((candidate) => draft.playedCandidateIds.includes(candidate.candidateId));

const pronunciationDraftReady = (draft, review) => Boolean(draft && review)
  && draft.terms.length === review.review.terms.length
  && draft.terms.every((term, index) => {
    const candidateIds = review.review.terms[index]?.candidates?.map((candidate) => candidate.id) || [];
    return term.decision === 'accepted'
      && candidateIds.includes(term.selectedCandidateId)
      && candidateIds.every((candidateId) => term.playedCandidateIds.includes(candidateId));
  });

const pronunciationSelectionReady = (draft, review) => Boolean(draft && review)
  && draft.terms.length === review.review.terms.length
  && draft.terms.every((term, index) => {
    const candidateIds = review.review.terms[index]?.candidates?.map((candidate) => candidate.id) || [];
    return term.decision !== 'retake' && candidateIds.includes(term.selectedCandidateId);
  });

const pronunciationRetakeNotesReady = (draft) => (draft?.terms || [])
  .every((term) => term.decision !== 'retake' || term.note.trim().length >= 2);

const finalReviewDraftReady = (draft) => Boolean(draft)
  && FINAL_REVIEW_CHECKLIST.every(([key]) => draft.checklist?.[key] === true);

const itemDecisionsReady = (items) => Boolean(items?.length)
  && items.every((item) => item.decision === 'accepted');

const revisionNotesReady = (items) => (items || [])
  .every((item) => item.decision !== 'revise' || item.note.trim().length >= 2);

const subtitleReviewDraftReady = (draft) => Boolean(draft)
  && SUBTITLE_REVIEW_CHECKLIST.every(([key]) => draft.checklist?.[key] === true)
  && itemDecisionsReady(draft.cues);

const screenTextReviewDraftReady = (draft, ocrAvailable) => Boolean(draft)
  && SCREEN_TEXT_REVIEW_CHECKLIST.every(([key]) => draft.checklist?.[key] === true)
  && itemDecisionsReady(draft.frames)
  && (draft.reviewMode === 'manual' || (draft.reviewMode === 'ocr-assisted' && ocrAvailable));

const reviewStateLabel = (status) => ({
  approved: '已批准',
  'ready-for-approval': '可提交批准',
  stale: '证据已失效',
  'in-progress': '复核进行中',
  'not-started': '尚未开始',
}[status] || '复核进行中');

const reviewStateClass = (status) => status === 'approved'
  ? 'is-approved'
  : status === 'ready-for-approval'
    ? 'is-ready'
    : status === 'stale'
      ? 'is-failed'
      : '';

const formatCueTime = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '--:--.-';
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${remainder}`;
};

const OVERRIDE_STATE_FIELDS = [
  ['title', '场景标题'],
  ['text', '屏幕文字'],
  ['hostPose', '人物姿态'],
  ['hostZone', '人物区域'],
  ['contentZone', '内容区域'],
  ['visualVariant', '动效版式'],
  ['visualType', '视觉载体'],
  ['motionRecipeRefs', '动效配方'],
  ['assetRefs', '画面素材'],
  ['carrierPayload', '主载体'],
  ['sfxRefs', '语义音效'],
];

const formatOverrideStateValue = (field, value) => {
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'motionRecipeRefs') return value.length
    ? value.map((item) => `${item.recipeId}@${item.version}`).join(' / ')
    : '无';
  if (field === 'assetRefs') return value.length
    ? value.map((item) => `${item.assetId}${item.role ? ` · ${item.role}` : ''}`).join(' / ')
    : '无';
  if (field === 'sfxRefs') return value.length
    ? value.map((item) => `${item.assetId} · ${item.role}`).join(' / ')
    : '静音';
  if (field === 'carrierPayload') return value?.adapterId
    ? `${value.adapterId}@${value.adapterVersion || '?'}${value.data?.title ? ` · ${value.data.title}` : ''}`
    : '无';
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '无';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const stageStatusLabel = (stageId, stage, project) => {
  if (!stage) return '';
  if (stage.status !== 'approved') return STATUS_LABELS[stage.status];
  if (stageId === 'voice-final' && stage.approvalScope === 'technical-only') return '技术通过，待听审';
  if (stageId === 'rights-clearance' && project?.publicationRights === 'internal-only') return '仅内部使用';
  if (stageId === 'final-preview' && stage.approvalScope === 'internal-autonomous-review') return '内部审片';
  if (stageId === 'final-preview' && stage.approvalScope === 'human-review') return '用户审片已批准';
  return STATUS_LABELS.approved;
};

const emptyProjectForm = {
  id: 'ai-explainer-001',
  title: 'AI 知识讲解 001',
  route: 'materials',
  sourcePath: 'content/source-pack',
  intakeType: 'material-directory',
  intakeText: '',
  textReadiness: 'needs-oralization',
  intakePath: 'content/source-pack',
  intakeUrl: '',
  intakeSnapshotPath: '',
  platform: '抖音',
  targetDuration: '90s',
  voiceRoute: 'preset14',
  audience: 'AI learners and knowledge-video viewers',
  targetOutcome: '',
  automation: 'critical-gates',
  publicationRights: 'needs-review',
  rightsNotes: '',
};

const PLATFORM_OPTIONS = [
  {value: 'douyin', label: '抖音', aliases: ['抖音']},
  {value: 'wechat-video', label: '微信视频号', aliases: ['微信视频号']},
  {value: 'bilibili', label: 'B站', aliases: ['B站']},
  {value: 'course', label: '课程/知识库', aliases: ['课程/知识库']},
];

const platformSelectValue = (value) => {
  const option = PLATFORM_OPTIONS.find((item) => item.value === value || item.aliases.includes(value));
  return option?.value || '__custom__';
};

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {'content-type': 'application/json', ...(options.headers || {})},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function StageNode({data, selected}) {
  const status = data.enabled ? data.status : 'disabled';
  return (
    <button
      type="button"
      className={`flow-node status-${status}${selected ? ' is-selected' : ''}`}
      aria-label={`打开步骤：${data.title}`}
      aria-pressed={selected}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-topline">
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span>{data.groupLabel}</span>
        {data.humanGate && <span className="gate-mark">人工门</span>}
      </div>
      <strong>{data.title}</strong>
      <span className="flow-node-tool">{data.toolName}</span>
      <span className="flow-node-status">{data.statusLabel || STATUS_LABELS[status]}</span>
      <Handle type="source" position={Position.Right} />
    </button>
  );
}

function DiagramNode({data, selected}) {
  return (
    <div className={`diagram-node${selected ? ' is-selected' : ''}`} title={data.label}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span>{data.kind}</span>
      <strong>{data.label}</strong>
      {data.sourceCueIds?.length > 0 && <small>{data.sourceCueIds.join(' / ')}</small>}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = {stage: StageNode, diagram: DiagramNode};

const formatReviewTime = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

function VisualPlanReview({review}) {
  if (!review?.available) {
    return (
      <div className="inspector-body visual-plan-review-panel">
        <div className="artifact-empty visual-plan-review-empty">
          <AlertTriangle aria-hidden="true" />
          <span>视觉方案暂不能审核。</span>
          <small>{review?.error || '请先生成视觉方案。'}</small>
        </div>
      </div>
    );
  }

  const format = review.format;
  return (
    <div className="inspector-body visual-plan-review-panel">
      <section className="visual-plan-review-lead">
        <div className="section-heading">
          <div><span className="eyebrow">视觉决策 / r{review.revision}</span><strong>先确认结构，再做动效探针</strong></div>
          <span className="review-state is-ready">待人工确认</span>
        </div>
        <p>本次只确认分镜方向和画板稳定性。批准后只生成结构图与 3-8 秒代表性探针，不会直接进入全片制作。</p>
      </section>

      <dl className="visual-plan-metrics" aria-label="视觉方案概况">
        <div><dt>总时长</dt><dd>{formatReviewTime(format.durationSeconds)}</dd></div>
        <div><dt>输出</dt><dd>{format.width}x{format.height} · {format.fps} FPS</dd></div>
        <div><dt>场景</dt><dd>{review.counts.scenes}</dd></div>
        <div><dt>镜头</dt><dd>{review.counts.shots}</dd></div>
        <div><dt>结构图</dt><dd>{review.counts.graphs}</dd></div>
        <div><dt>平均停留</dt><dd>{review.pacing.averageSceneSeconds}s / 场景</dd></div>
      </dl>

      <section className="visual-plan-review-section">
        <div className="section-heading"><div><span className="eyebrow">稳定画板</span><strong>大区不跟着内容切换</strong></div><span>{review.stability.stableZoneShotPercent}% 镜头遵守</span></div>
        <ul className="visual-plan-checks">
          <li className={review.stability.fixedHostPercent === 100 ? 'is-pass' : 'is-warning'}><Check aria-hidden="true" /><span>人物固定在左侧</span><strong>{review.stability.fixedHostPercent}%</strong></li>
          <li className={review.stability.fixedContentPercent === 100 ? 'is-pass' : 'is-warning'}><Check aria-hidden="true" /><span>内容只在右侧画板变化</span><strong>{review.stability.fixedContentPercent}%</strong></li>
          <li className={review.stability.fixedCaptionPercent === 100 ? 'is-pass' : 'is-warning'}><Check aria-hidden="true" /><span>字幕栏固定</span><strong>{review.stability.fixedCaptionPercent}%</strong></li>
          <li className={review.stability.maxHostPoseChangesInEightSeconds <= 2 ? 'is-pass' : 'is-warning'}><Check aria-hidden="true" /><span>8 秒内人物姿态变化上限</span><strong>{review.stability.maxHostPoseChangesInEightSeconds} 次</strong></li>
        </ul>
        <p className="visual-plan-note">场景平均停留 {review.pacing.averageSceneSeconds} 秒，最长 {review.pacing.longestSceneSeconds} 秒；{review.pacing.scenesAtLeastTwentySeconds} 个场景会稳定展示至少 20 秒。</p>
      </section>

      <section className="visual-plan-review-section">
        <div className="section-heading"><div><span className="eyebrow">语义载体</span><strong>不是同一种文字卡反复出现</strong></div><span>最长连续 {review.variety.maxRepeatedCarrier} 次</span></div>
        <div className="visual-plan-distribution">
          {review.variety.carriers.map((item) => (
            <div className="visual-plan-distribution-row" key={item.id}>
              <div><span>{item.label}</span><strong>{item.count}</strong></div>
              <span className="visual-plan-bar" aria-label={`${item.label} ${item.percent}%`}><i style={{width: `${item.percent}%`}} /></span>
            </div>
          ))}
        </div>
        <p className="visual-plan-note">其中 {review.counts.illustrativeMocks} 个代码或界面载体明确标注为“口播逻辑示意”，不会冒充真实产品证据；当前尚未规划 SFX。</p>
      </section>

      <section className="visual-plan-review-section">
        <div className="section-heading"><div><span className="eyebrow">时间轴抽样</span><strong>从全片均匀抽取审核锚点</strong></div><span>{review.timelineAnchors.length} 处</span></div>
        <ol className="visual-plan-timeline">
          {review.timelineAnchors.map((anchor) => (
            <li key={anchor.id}>
              <time>{formatReviewTime(anchor.start)}</time>
              <div><strong>{anchor.title}</strong><span>场景 {anchor.order} · {anchor.role}</span></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="visual-plan-review-section visual-plan-review-boundary">
        <ShieldCheck aria-hidden="true" />
        <div><strong>通过后仍需探针自测</strong><span>叠影、遮挡、文字适配、seek 稳定性和截图质量必须在代表性探针上通过，当前规划摘要不替代这些检查。</span></div>
      </section>
    </div>
  );
}

function ProjectStyleProbeReview({projectId, probe, loading, error, stageStatus, reload}) {
  if (loading) {
    return <div className="inspector-body project-style-probe-panel"><div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载本项目视觉样片</div></div>;
  }

  if (!probe) {
    return (
      <div className="inspector-body project-style-probe-panel">
        <div className="artifact-empty project-style-probe-empty">
          <AlertTriangle aria-hidden="true" />
          <span>{stageStatus === 'not-started' ? '本项目视觉样片尚未生成。' : '本项目视觉样片暂时无法读取。'}</span>
          <small>{error || '先生成 3–8 秒样片，完成自测后再进行视觉批准。'}</small>
          <button type="button" className="button secondary" onClick={reload}><RefreshCw aria-hidden="true" />重新读取</button>
        </div>
      </div>
    );
  }

  const videoPath = probe.artifacts?.find((item) => item.path?.endsWith('.mp4'))?.path;
  const keyframes = (probe.check?.snapshotTimesSeconds || []).map((time, index) => ({
    label: ['起始', '中段', '交接', '终帧'][index] || `关键帧 ${index + 1}`,
    time,
    path: `review/probe-project/snapshots/frame-${String(index).padStart(2, '0')}-at-${Number(time)}s.png`,
  }));
  const checkPassed = probe.check?.status === 'passed';
  const videoStream = probe.ffprobe?.streams?.find((item) => item.codec_type === 'video');

  return (
    <div className="inspector-body project-style-probe-panel">
      <section className="audio-review-section project-style-probe-lead">
        <div className="section-heading">
          <div><span className="eyebrow">本项目可视样片</span><strong>先看画面和动效，再决定是否批准</strong></div>
          <span className={`review-state ${checkPassed ? 'is-approved' : 'is-failed'}`}>{checkPassed ? '自测通过' : '自测未通过'}</span>
        </div>
        <p>这里展示的才是视觉方案审核对象。上一步只确认结构方向，不代表你已经认可人物、排版或动效质量。</p>
        {videoPath ? (
          <video
            className="motion-probe-video project-style-probe-video"
            controls
            playsInline
            preload="metadata"
            src={projectDeliverableUrl(projectId, videoPath)}
          />
        ) : <div className="probe-missing"><AlertTriangle aria-hidden="true" /><span>样片 MP4 缺失。</span></div>}
      </section>

      <dl className="audio-facts project-style-probe-facts">
        <div><dt>口播窗口</dt><dd>{probe.window?.cueId || '--'}</dd></div>
        <div><dt>时长</dt><dd>{probe.window?.durationSeconds ?? '--'} 秒</dd></div>
        <div><dt>画布</dt><dd>{videoStream?.width || 1920}x{videoStream?.height || 1080}</dd></div>
        <div><dt>检查</dt><dd>{checkPassed ? '0 错误 / 0 警告' : '请查看失败回执'}</dd></div>
      </dl>

      <section className="audio-review-section">
        <div className="section-heading"><div><span className="eyebrow">关键帧截图</span><strong>起始、中段、交接、终帧</strong></div><span>{keyframes.length} 张</span></div>
        <div className="project-style-probe-frames">
          {keyframes.map((frame) => (
            <a key={frame.path} href={projectDeliverableUrl(projectId, frame.path)} target="_blank" rel="noreferrer">
              <img src={projectDeliverableUrl(projectId, frame.path)} alt={`${frame.label} ${frame.time} 秒`} />
              <span>{frame.label} · {frame.time}s</span>
            </a>
          ))}
        </div>
      </section>

      <section className="audio-review-section">
        <div className="section-heading"><div><span className="eyebrow">自测结果</span><strong>进入人工视觉审批前已完成</strong></div><span>{checkPassed ? '通过' : '阻断'}</span></div>
        <ul className="project-style-probe-checks">
          <li><Check aria-hidden="true" /><span>人物、内容区和字幕区无碰撞</span></li>
          <li><Check aria-hidden="true" /><span>单一人物姿态，无双层叠影</span></li>
          <li><Check aria-hidden="true" /><span>中文断行、字号和对比度通过</span></li>
          <li><Check aria-hidden="true" /><span>seek 跳转与终帧状态稳定</span></li>
        </ul>
        <div className="receipt-lock"><ShieldCheck aria-hidden="true" /><span>只有你看完这段 MP4 和关键帧后点击“批准本项目风格”，才算视觉质量通过；此前的结构批准不会替代本门。</span></div>
      </section>
    </div>
  );
}

const graphFlowNodes = (editor, graphId) => {
  const diagram = editor?.diagrams?.find((item) => item.graphId === graphId);
  return (diagram?.nodes || []).map((node) => ({
    id: node.id,
    type: 'diagram',
    position: node.position,
    width: node.size.width,
    height: node.size.height,
    style: {width: node.size.width, height: node.size.height},
    data: {
      label: node.label,
      kind: node.kind,
      sourceCueIds: node.sourceCueIds,
    },
  }));
};

function App() {
  const [catalog, setCatalog] = useState({groups: [], tools: [], stages: []});
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [batches, setBatches] = useState([]);
  const [maturity, setMaturity] = useState(null);
  const [maturityLoading, setMaturityLoading] = useState(false);
  const [scaleMetrics, setScaleMetrics] = useState(null);
  const [scaleMetricsLoading, setScaleMetricsLoading] = useState(false);
  const [batchDraft, setBatchDraft] = useState({title: '知识视频批次', stageId: 'next-human-gate', priority: 50, projectIds: []});
  const [project, setProject] = useState(null);
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [newProjectForm, setNewProjectForm] = useState(emptyProjectForm);
  const [stageForm, setStageForm] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [artifactDraft, setArtifactDraft] = useState('');
  const [graphLayoutEditor, setGraphLayoutEditor] = useState(null);
  const [graphLayoutNodes, setGraphLayoutNodes] = useState([]);
  const [selectedGraphId, setSelectedGraphId] = useState('');
  const [graphLayoutLoading, setGraphLayoutLoading] = useState(false);
  const [graphLayoutError, setGraphLayoutError] = useState(null);
  const [graphLayoutDirty, setGraphLayoutDirty] = useState(false);
  const [graphLayoutReason, setGraphLayoutReason] = useState('调整流程图节点位置，改善画面层级与可读性。');
  const [pronunciationReview, setPronunciationReview] = useState(null);
  const [pronunciationReviewDraft, setPronunciationReviewDraft] = useState(null);
  const [pronunciationReviewLoading, setPronunciationReviewLoading] = useState(false);
  const [pronunciationReviewError, setPronunciationReviewError] = useState(null);
  const [audioReview, setAudioReview] = useState(null);
  const [audioReviewDraft, setAudioReviewDraft] = useState(null);
  const [audioReviewLoading, setAudioReviewLoading] = useState(false);
  const [finalReview, setFinalReview] = useState(null);
  const [finalReviewDraft, setFinalReviewDraft] = useState(null);
  const [finalReviewLoading, setFinalReviewLoading] = useState(false);
  const [subtitleReview, setSubtitleReview] = useState(null);
  const [subtitleReviewDraft, setSubtitleReviewDraft] = useState(null);
  const [subtitleReviewLoading, setSubtitleReviewLoading] = useState(false);
  const [subtitleReviewError, setSubtitleReviewError] = useState(null);
  const [screenTextReview, setScreenTextReview] = useState(null);
  const [screenTextReviewDraft, setScreenTextReviewDraft] = useState(null);
  const [screenTextReviewLoading, setScreenTextReviewLoading] = useState(false);
  const [screenTextReviewError, setScreenTextReviewError] = useState(null);
  const [productionOverrides, setProductionOverrides] = useState(null);
  const [productionOverrideDraft, setProductionOverrideDraft] = useState(null);
  const [assetLibrary, setAssetLibrary] = useState([]);
  const [visualLibraryAssetId, setVisualLibraryAssetId] = useState('');
  const [libraryAssetId, setLibraryAssetId] = useState('');
  const [visualAssetCandidates, setVisualAssetCandidates] = useState(null);
  const [visualAssetCandidatesLoading, setVisualAssetCandidatesLoading] = useState(false);
  const [visualAssetCandidatesError, setVisualAssetCandidatesError] = useState(null);
  const [visualCandidateNotes, setVisualCandidateNotes] = useState({});
  const [productionOverridesLoading, setProductionOverridesLoading] = useState(false);
  const [productionOverridesError, setProductionOverridesError] = useState(null);
  const [semanticSfxReview, setSemanticSfxReview] = useState(null);
  const [semanticSfxReviewDraft, setSemanticSfxReviewDraft] = useState(null);
  const [semanticSfxReviewLoading, setSemanticSfxReviewLoading] = useState(false);
  const [semanticSfxReviewError, setSemanticSfxReviewError] = useState(null);
  const [motionFeedback, setMotionFeedback] = useState(null);
  const [motionFeedbackDraft, setMotionFeedbackDraft] = useState(null);
  const [motionFeedbackLoading, setMotionFeedbackLoading] = useState(false);
  const [motionFeedbackError, setMotionFeedbackError] = useState(null);
  const [motionProbes, setMotionProbes] = useState([]);
  const [motionReadiness, setMotionReadiness] = useState(null);
  const [selectedMotionProbeId, setSelectedMotionProbeId] = useState('');
  const [motionProbeDraft, setMotionProbeDraft] = useState(null);
  const [motionProbesLoading, setMotionProbesLoading] = useState(false);
  const [motionProbesError, setMotionProbesError] = useState(null);
  const [projectStyleProbe, setProjectStyleProbe] = useState(null);
  const [projectStyleProbeLoading, setProjectStyleProbeLoading] = useState(false);
  const [projectStyleProbeError, setProjectStyleProbeError] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('config');
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showFormalProjectDialog, setShowFormalProjectDialog] = useState(false);
  const [formalProjectPath, setFormalProjectPath] = useState('hyperframes-workflow-kit/projects/batch-smoke-30s-20260720');
  const [formalProjectInspection, setFormalProjectInspection] = useState(null);
  const [formalProjectInspecting, setFormalProjectInspecting] = useState(false);
  const [showFormalRefreshDialog, setShowFormalRefreshDialog] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [dangerAction, setDangerAction] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [projectJobs, setProjectJobs] = useState([]);
  const [releaseCenter, setReleaseCenter] = useState(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const loadBootstrap = useCallback(async () => {
    const [catalogPayload, healthPayload, projectPayload, assetLibraryPayload, batchesPayload, motionProbePayload, maturityPayload] = await Promise.all([
      api('/api/catalog'),
      api('/api/health'),
      api('/api/projects'),
      api('/api/library/assets').catch(() => ({assets: []})),
      api('/api/batches').catch(() => ({batches: []})),
      api('/api/motion-library/probes').catch(() => ({probes: [], readiness: null})),
      api('/api/maturity').catch(() => ({maturity: null})),
    ]);
    setCatalog(catalogPayload);
    setHealth(healthPayload);
    setProjects(projectPayload.projects);
    setAssetLibrary(assetLibraryPayload.assets || []);
    setBatches(batchesPayload.batches || []);
    setMotionProbes(motionProbePayload.probes || []);
    setMotionReadiness(motionProbePayload.readiness || null);
    setMaturity(maturityPayload.maturity || null);
    setSelectedMotionProbeId((current) => current || motionProbePayload.probes?.[0]?.id || '');
    setBatchDraft((current) => ({...current, projectIds: current.projectIds.length ? current.projectIds : projectPayload.projects.slice(0, 1).map((item) => item.id)}));
    if (!projectPayload.projects.length) setShowProjectDialog(true);
  }, []);

  const refreshMaturity = useCallback(async () => {
    setMaturityLoading(true);
    try {
      const payload = await api('/api/maturity');
      setMaturity(payload.maturity || null);
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setMaturityLoading(false);
    }
  }, []);

  const refreshScaleMetrics = useCallback(async (projectId) => {
    if (!projectId) return null;
    setScaleMetricsLoading(true);
    try {
      const payload = await api(`/api/projects/${projectId}/scale-metrics`);
      setScaleMetrics(payload);
      return payload;
    } catch (error) {
      setMessage({type: 'error', text: error.message});
      return null;
    } finally {
      setScaleMetricsLoading(false);
    }
  }, []);

  const simulateScaleMetrics = useCallback(async () => {
    if (!project?.id) return;
    setScaleMetricsLoading(true);
    try {
      await api(`/api/projects/${project.id}/scale-metrics/simulate`, {method: 'POST'});
      const payload = await api(`/api/projects/${project.id}/scale-metrics`);
      setScaleMetrics(payload);
      setMessage({type: 'success', text: '已生成内部模拟指标回执；未知值保持未知，不计入真人成熟度。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setScaleMetricsLoading(false);
    }
  }, [project?.id]);

  const loadMotionProbes = useCallback(async () => {
    setMotionProbesLoading(true);
    setMotionProbesError(null);
    try {
      const payload = await api('/api/motion-library/probes');
      const probes = payload.probes || [];
      setMotionProbes(probes);
      setMotionReadiness(payload.readiness || null);
      setSelectedMotionProbeId((current) => probes.some((probe) => probe.id === current) ? current : probes[0]?.id || '');
      return probes;
    } catch (error) {
      setMotionProbesError(error.message);
      return [];
    } finally {
      setMotionProbesLoading(false);
    }
  }, []);

  const loadProjectStyleProbe = useCallback(async (projectId) => {
    if (!projectId) return null;
    setProjectStyleProbeLoading(true);
    setProjectStyleProbeError(null);
    try {
      const payload = await api(projectDeliverableUrl(projectId, 'review/probe-review.json'));
      setProjectStyleProbe(payload);
      return payload;
    } catch (error) {
      setProjectStyleProbe(null);
      setProjectStyleProbeError(error.message);
      return null;
    } finally {
      setProjectStyleProbeLoading(false);
    }
  }, []);

  const loadGraphLayoutEditor = useCallback(async (projectId, preferredGraphId = '') => {
    setGraphLayoutLoading(true);
    setGraphLayoutError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/graph-layout-editor`);
      const editor = payload.editor;
      setGraphLayoutEditor(editor);
      if (!editor.available) {
        setSelectedGraphId('');
        setGraphLayoutNodes([]);
        setGraphLayoutDirty(false);
        return editor;
      }
      const graphId = editor.diagrams.some((diagram) => diagram.graphId === preferredGraphId)
        ? preferredGraphId
        : editor.diagrams[0]?.graphId || '';
      setSelectedGraphId(graphId);
      setGraphLayoutNodes(graphFlowNodes(editor, graphId));
      setGraphLayoutDirty(false);
      return editor;
    } catch (error) {
      setGraphLayoutError(error.message);
      setGraphLayoutEditor(null);
      setGraphLayoutNodes([]);
      return null;
    } finally {
      setGraphLayoutLoading(false);
    }
  }, []);

  const selectedMotionProbe = useMemo(
    () => motionProbes.find((probe) => probe.id === selectedMotionProbeId) || null,
    [motionProbes, selectedMotionProbeId],
  );
  const selectedMotionRecipeReadiness = useMemo(
    () => motionReadiness?.recipes?.find((recipe) => recipe.recipeId === selectedMotionProbe?.recipeId) || null,
    [motionReadiness, selectedMotionProbe?.recipeId],
  );

  const visualLibraryAssets = useMemo(
    () => assetLibrary.filter((asset) => ['image', 'icon', 'logo', 'brand'].includes(asset.type)),
    [assetLibrary],
  );
  const sfxLibraryAssets = useMemo(() => assetLibrary.filter((asset) => asset.type === 'sfx'), [assetLibrary]);

  useEffect(() => {
    setMotionProbeDraft(selectedMotionProbe ? makeMotionProbeDraft(selectedMotionProbe) : null);
  }, [selectedMotionProbe]);

  useEffect(() => {
    loadBootstrap().catch((error) => setMessage({type: 'error', text: error.message}));
  }, [loadBootstrap]);

  const loadProject = useCallback(async (projectId) => {
    const [payload, jobsPayload, releasePayload, scalePayload] = await Promise.all([
      api(`/api/projects/${projectId}`),
      api(`/api/jobs?projectId=${encodeURIComponent(projectId)}&limit=12`),
      api(`/api/projects/${projectId}/release-center`),
      api(`/api/projects/${projectId}/scale-metrics`).catch(() => ({draft: null, simulation: null})),
    ]);
    setProject(payload.project);
    setProjectJobs(jobsPayload.jobs);
    setReleaseCenter(releasePayload.releaseCenter);
    setScaleMetrics(scalePayload);
    setCurrentJob(jobsPayload.jobs.find((job) => ['queued', 'running', 'cancel-requested'].includes(job.status)) || null);
    setProjectForm({
      title: payload.project.title,
      route: payload.project.route,
      sourcePath: payload.project.sourcePath,
      platform: payload.project.platform,
      targetDuration: payload.project.targetDuration,
      voiceRoute: payload.project.voiceRoute,
      audience: payload.project.audience,
      targetOutcome: payload.project.targetOutcome,
      automation: payload.project.automation,
      publicationRights: payload.project.publicationRights,
      rightsNotes: payload.project.rightsNotes,
    });
    return payload.project;
  }, []);

  useEffect(() => {
    if (!project && projects.length) {
      loadProject(projects[0].id).catch((error) => setMessage({type: 'error', text: error.message}));
    }
  }, [loadProject, project, projects]);

  const definitions = useMemo(() => {
    if (!project) return new Map();
    return new Map([...catalog.stages, ...Object.values(project.customStages || {})].map((stage) => [stage.id, stage]));
  }, [catalog.stages, project]);

  const selectStage = useCallback((stageId) => {
    setSelectedStageId(stageId);
    setInspectorTab(defaultInspectorTabForStage(stageId));
  }, []);

  const activeStageIds = useMemo(() => {
    if (!project) return [];
    return project.stageOrder.filter((id) => {
      const definition = definitions.get(id);
      return stageAppliesToProject(definition, project);
    });
  }, [definitions, project]);

  const toolMap = useMemo(() => new Map(catalog.tools.map((tool) => [tool.id, tool])), [catalog.tools]);
  const groupMap = useMemo(() => new Map(catalog.groups.map((group) => [group.id, group.label])), [catalog.groups]);

  const nodes = useMemo(() => {
    if (!project) return [];
    const groupCounts = new Map();
    return activeStageIds.map((id) => {
      const definition = definitions.get(id);
      const state = project.stages[id];
      const groupIndex = Math.max(0, catalog.groups.findIndex((group) => group.id === definition.group));
      const rowIndex = groupCounts.get(definition.group) || 0;
      groupCounts.set(definition.group, rowIndex + 1);
      return {
        id,
        type: 'stage',
        initialWidth: 246,
        initialHeight: 118,
        selected: id === selectedStageId,
        position: state.positionEdited ? state.position : {x: groupIndex * 360, y: rowIndex * 180},
        data: {
          title: state.titleOverride || definition.title,
          groupLabel: groupMap.get(definition.group) || '自定义',
          humanGate: definition.humanGate,
          status: state.status,
          statusLabel: stageStatusLabel(id, state, project),
          enabled: state.enabled,
          toolName: toolMap.get(state.toolId)?.name || state.toolId,
        },
      };
    });
  }, [activeStageIds, catalog.groups, definitions, groupMap, project, selectStage, selectedStageId, toolMap]);

  const edges = useMemo(() => activeStageIds.slice(0, -1).map((id, index) => ({
    id: `${id}-${activeStageIds[index + 1]}`,
    source: id,
    target: activeStageIds[index + 1],
    animated: project?.stages[activeStageIds[index + 1]]?.status === 'running',
    className: project?.stages[id]?.status === 'approved' ? 'edge-approved' : 'edge-pending',
  })), [activeStageIds, project]);

  const selectedGraphDiagram = useMemo(
    () => graphLayoutEditor?.diagrams?.find((diagram) => diagram.graphId === selectedGraphId) || null,
    [graphLayoutEditor, selectedGraphId],
  );
  const graphLayoutEdges = useMemo(() => (selectedGraphDiagram?.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || undefined,
    markerEnd: {type: MarkerType.ArrowClosed, color: '#356650'},
    style: {stroke: '#356650', strokeWidth: 2},
    labelStyle: {fill: '#66726b', fontSize: 11},
  })), [selectedGraphDiagram]);

  const selectedDefinition = selectedStageId ? definitions.get(selectedStageId) : null;
  const selectedStage = selectedStageId && project ? project.stages[selectedStageId] : null;

  const loadPronunciationReview = useCallback(async (projectId) => {
    setPronunciationReviewLoading(true);
    setPronunciationReviewError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/pronunciation-review`);
      setPronunciationReview(payload.pronunciationReview);
      setPronunciationReviewDraft(makePronunciationReviewDraft(payload.pronunciationReview));
      return payload.pronunciationReview;
    } catch (error) {
      setPronunciationReview(null);
      setPronunciationReviewDraft(null);
      setPronunciationReviewError(error.message);
      return null;
    } finally {
      setPronunciationReviewLoading(false);
    }
  }, []);

  const loadAudioReview = useCallback(async (projectId) => {
    setAudioReviewLoading(true);
    try {
      const payload = await api(`/api/projects/${projectId}/audio-review`);
      setAudioReview(payload.audioReview);
      setAudioReviewDraft(makeAudioReviewDraft(payload.audioReview));
      return payload.audioReview;
    } finally {
      setAudioReviewLoading(false);
    }
  }, []);

  const loadFinalReview = useCallback(async (projectId) => {
    setFinalReviewLoading(true);
    try {
      const payload = await api(`/api/projects/${projectId}/final-review`);
      setFinalReview(payload.finalReview);
      setFinalReviewDraft(makeFinalReviewDraft(payload.finalReview));
      return payload.finalReview;
    } finally {
      setFinalReviewLoading(false);
    }
  }, []);

  const loadSubtitleReview = useCallback(async (projectId) => {
    setSubtitleReviewLoading(true);
    setSubtitleReviewError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/subtitle-review`);
      setSubtitleReview(payload.subtitleReview);
      setSubtitleReviewDraft(makeSubtitleReviewDraft(payload.subtitleReview));
      return payload.subtitleReview;
    } catch (error) {
      setSubtitleReview(null);
      setSubtitleReviewDraft(null);
      setSubtitleReviewError(error.message);
      return null;
    } finally {
      setSubtitleReviewLoading(false);
    }
  }, []);

  const loadScreenTextReview = useCallback(async (projectId) => {
    setScreenTextReviewLoading(true);
    setScreenTextReviewError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/screen-text-review`);
      setScreenTextReview(payload.screenTextReview);
      setScreenTextReviewDraft(payload.screenTextReview.available === false ? null : makeScreenTextReviewDraft(payload.screenTextReview));
      return payload.screenTextReview;
    } catch (error) {
      setScreenTextReview(null);
      setScreenTextReviewDraft(null);
      setScreenTextReviewError(error.message);
      return null;
    } finally {
      setScreenTextReviewLoading(false);
    }
  }, []);

  const loadProductionOverrides = useCallback(async (projectId) => {
    setProductionOverridesLoading(true);
    setProductionOverridesError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/production-overrides`);
      setProductionOverrides(payload.editor);
      setProductionOverrideDraft((current) => {
        const level = current?.level || 'scene';
        const collection = payload.editor.targets?.[`${level}s`] || [];
        const targetStillExists = collection.some((item) => item.id === current?.targetId);
        return targetStillExists ? current : makeOverrideDraft(payload.editor, level);
      });
      return payload.editor;
    } catch (error) {
      setProductionOverrides(null);
      setProductionOverrideDraft(null);
      setProductionOverridesError(error.message);
      return null;
    } finally {
      setProductionOverridesLoading(false);
    }
  }, []);

  const loadSemanticSfxReview = useCallback(async (projectId) => {
    setSemanticSfxReviewLoading(true);
    setSemanticSfxReviewError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/semantic-sfx-review`);
      setSemanticSfxReview(payload.review);
      setSemanticSfxReviewDraft(makeSemanticSfxReviewDraft(payload.review));
      return payload.review;
    } catch (error) {
      setSemanticSfxReview(null);
      setSemanticSfxReviewDraft(null);
      setSemanticSfxReviewError(error.message);
      return null;
    } finally {
      setSemanticSfxReviewLoading(false);
    }
  }, []);

  const loadVisualAssetCandidates = useCallback(async (projectId) => {
    setVisualAssetCandidatesLoading(true);
    setVisualAssetCandidatesError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/visual-asset-candidates`);
      setVisualAssetCandidates(payload.candidates);
      setVisualCandidateNotes(Object.fromEntries((payload.candidates?.plan?.candidates ?? []).map((candidate) => [
        candidate.id,
        candidate.decision?.note ?? '',
      ])));
      return payload.candidates;
    } catch (error) {
      setVisualAssetCandidates(null);
      setVisualAssetCandidatesError(error.message);
      return null;
    } finally {
      setVisualAssetCandidatesLoading(false);
    }
  }, []);

  const loadMotionFeedback = useCallback(async (projectId) => {
    setMotionFeedbackLoading(true);
    setMotionFeedbackError(null);
    try {
      const payload = await api(`/api/projects/${projectId}/motion-feedback`);
      setMotionFeedback(payload.feedback);
      setMotionFeedbackDraft(payload.feedback?.available ? makeMotionFeedbackDraft(payload.feedback) : null);
      return payload.feedback;
    } catch (error) {
      setMotionFeedback(null);
      setMotionFeedbackDraft(null);
      setMotionFeedbackError(error.message);
      return null;
    } finally {
      setMotionFeedbackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!project || !selectedStageId || !selectedStage || !selectedDefinition) return;
    setStageForm({
      titleOverride: selectedStage.titleOverride || '',
      descriptionOverride: selectedStage.descriptionOverride || '',
      notes: selectedStage.notes || '',
      promptOverride: selectedStage.promptOverride || '',
      toolId: selectedStage.toolId,
      mode: selectedStage.mode,
      enabled: selectedStage.enabled,
    });
    setArtifact(null);
    setArtifactDraft('');
    if (selectedStageId === 'diagram-assets') {
      loadGraphLayoutEditor(project.id, selectedGraphId);
    } else {
      setGraphLayoutEditor(null);
      setGraphLayoutNodes([]);
      setGraphLayoutError(null);
      setGraphLayoutDirty(false);
    }
    if (selectedStageId === 'pronunciation-review') {
      loadPronunciationReview(project.id);
    } else {
      setPronunciationReview(null);
      setPronunciationReviewDraft(null);
      setPronunciationReviewError(null);
    }
    if (selectedStageId === 'voice-final') {
      loadAudioReview(project.id).catch((error) => setMessage({type: 'error', text: error.message}));
    } else {
      setAudioReview(null);
      setAudioReviewDraft(null);
    }
    if (selectedStageId === 'final-preview') {
      loadFinalReview(project.id).catch((error) => setMessage({type: 'error', text: error.message}));
    } else {
      setFinalReview(null);
      setFinalReviewDraft(null);
    }
    if (selectedStageId === 'subtitle-review') {
      loadSubtitleReview(project.id);
    } else {
      setSubtitleReview(null);
      setSubtitleReviewDraft(null);
      setSubtitleReviewError(null);
    }
    if (selectedStageId === 'screen-text-review') {
      loadScreenTextReview(project.id);
    } else {
      setScreenTextReview(null);
      setScreenTextReviewDraft(null);
      setScreenTextReviewError(null);
    }
    if (OVERRIDE_STAGE_IDS.has(selectedStageId)) {
      loadProductionOverrides(project.id);
      loadSemanticSfxReview(project.id);
      loadVisualAssetCandidates(project.id);
    } else {
      setProductionOverrides(null);
      setProductionOverrideDraft(null);
      setProductionOverridesError(null);
      setSemanticSfxReview(null);
      setSemanticSfxReviewDraft(null);
      setSemanticSfxReviewError(null);
      setVisualAssetCandidates(null);
      setVisualAssetCandidatesError(null);
      setVisualCandidateNotes({});
    }
    if (selectedStageId === 'retrospective') {
      loadMotionFeedback(project.id);
    } else {
      setMotionFeedback(null);
      setMotionFeedbackDraft(null);
      setMotionFeedbackError(null);
    }
    if (selectedStageId === 'style-probe') {
      loadProjectStyleProbe(project.id);
      loadMotionProbes();
    } else {
      setProjectStyleProbe(null);
      setProjectStyleProbeError(null);
    }
    api(`/api/projects/${project.id}/stages/${selectedStageId}/artifact`)
      .then((payload) => {
        setArtifact(payload.artifact);
        setArtifactDraft(payload.artifact.content);
      })
      .catch(() => undefined);
  }, [loadAudioReview, loadFinalReview, loadGraphLayoutEditor, loadMotionFeedback, loadMotionProbes, loadProductionOverrides, loadProjectStyleProbe, loadPronunciationReview, loadScreenTextReview, loadSemanticSfxReview, loadSubtitleReview, loadVisualAssetCandidates, project?.id, project?.stages?.['style-probe']?.revision, selectedDefinition, selectedStageId]);

  useEffect(() => {
    setInspectorTab(defaultInspectorTabForStage(selectedStageId));
  }, [selectedStageId]);

  const refreshProjectList = useCallback(async () => {
    const payload = await api('/api/projects');
    setProjects(payload.projects);
  }, []);

  const refreshBatches = useCallback(async () => {
    const payload = await api('/api/batches');
    setBatches(payload.batches || []);
    return payload.batches || [];
  }, []);

  const createWorkbenchBatch = async () => {
    if (!batchDraft.title.trim() || !batchDraft.projectIds.length) {
      setMessage({type: 'error', text: '请填写批次名称并至少选择一个项目。'});
      return;
    }
    setBusy(true);
    try {
      const payload = await api('/api/batches', {
        method: 'POST',
        body: JSON.stringify({...batchDraft, priority: Number(batchDraft.priority) || 0}),
      });
      await refreshBatches();
      setMessage({type: 'success', text: `批次已创建，包含 ${payload.batch.projectIds.length} 个项目。`});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const controlBatch = async (batchId, action) => {
    setBusy(true);
    try {
      const payload = await api(`/api/batches/${encodeURIComponent(batchId)}/${action}`, {method: 'POST', body: '{}'});
      await refreshBatches();
      const errors = payload.errors?.length ? `，${payload.errors.length} 个项目未入队` : '';
      setMessage({type: action === 'pause' ? 'info' : 'success', text: `批次${action === 'run' ? '已开始' : action === 'pause' ? '已暂停' : '已恢复'}${errors}。`});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const openBatchProject = async (projectId) => {
    setBusy(true);
    try {
      await loadProject(projectId);
      setMessage({type: 'info', text: '已切换到批次中的项目，可继续处理下一道门。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!project?.id || !currentJob?.id || ['complete', 'failed', 'canceled'].includes(currentJob.status)) return undefined;
    let disposed = false;
    let timer = null;
    const poll = async () => {
      try {
        const payload = await api(`/api/jobs/${currentJob.id}`);
        if (disposed) return;
        setCurrentJob(payload.job);
        setProjectJobs((current) => [
          payload.job,
          ...current.filter((job) => job.id !== payload.job.id),
        ].slice(0, 12));
        if (['complete', 'failed', 'canceled'].includes(payload.job.status)) {
          await loadProject(project.id);
          await refreshProjectList();
          if (payload.job.status !== 'complete') {
            setMessage({type: payload.job.status === 'canceled' ? 'info' : 'error', text: payload.job.error || '任务已取消。'});
          }
          return;
        }
        timer = window.setTimeout(poll, 1200);
      } catch (error) {
        if (!disposed) setMessage({type: 'error', text: error.message});
      }
    };
    timer = window.setTimeout(poll, 1200);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [currentJob?.id, loadProject, project?.id, refreshProjectList]);

  useEffect(() => {
    if (!batches.some((batch) => batch.status === 'running')) return undefined;
    const timer = window.setInterval(() => {
      refreshBatches().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [batches, refreshBatches]);

  const createNewProject = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const intake = newProjectForm.intakeType === 'pasted-text'
        ? {type: 'pasted-text', text: newProjectForm.intakeText, label: newProjectForm.title, textReadiness: newProjectForm.textReadiness || 'needs-oralization'}
        : newProjectForm.intakeType === 'url-snapshot'
          ? {type: 'url-snapshot', url: newProjectForm.intakeUrl, snapshotPath: newProjectForm.intakeSnapshotPath}
          : {type: newProjectForm.intakeType, path: newProjectForm.intakePath};
      const payload = await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({...newProjectForm, intake}),
      });
      await refreshProjectList();
      await loadProject(payload.project.id);
      setShowProjectDialog(false);
      setMessage({
        type: 'success',
        text: payload.contentIntake?.idempotent
          ? '项目已创建，并复用相同内容的不可变输入凭据。'
          : '项目已创建；输入已冻结并记录 SHA-256，正式视频项目会在 NarrationLock 阶段创建。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const inspectFormalProject = async (event) => {
    event.preventDefault();
    const requestedPath = formalProjectPath.trim();
    if (!requestedPath) return;
    setFormalProjectInspecting(true);
    setFormalProjectInspection(null);
    try {
      const payload = await api(`/api/formal-projects/inspect?path=${encodeURIComponent(requestedPath)}`);
      setFormalProjectInspection(payload.adoption);
      setMessage({type: 'info', text: '正式项目已通过只读一致性校验。接入仍会保留全部人工审查和发布门禁。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setFormalProjectInspecting(false);
    }
  };

  const adoptInspectedFormalProject = async () => {
    const requestedPath = formalProjectPath.trim();
    if (!requestedPath || !formalProjectInspection) return;
    setBusy(true);
    try {
      const payload = await api('/api/formal-projects/adopt', {
        method: 'POST',
        body: JSON.stringify({formalProjectPath: requestedPath}),
      });
      await refreshProjectList();
      await loadProject(payload.project.id);
      setShowFormalProjectDialog(false);
      setFormalProjectInspection(null);
      setMessage({type: 'success', text: '正式项目已接入工作台。机器证据已保留；文案、试听、动效、成片审片与发布权限仍需逐项确认。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const refreshFormalEvidence = async () => {
    if (!project?.formalProjectPath) return;
    const projectId = project.id;
    const projectPath = project.formalProjectPath;
    setShowFormalRefreshDialog(false);
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${projectId}/formal-project/refresh`, {method: 'POST'});
      await refreshProjectList();
      await loadProject(projectId);
      const summary = payload.refresh?.summary ?? {};
      const changedCount = ['imported', 'changed', 'removed', 'preservedLocalEdits']
        .reduce((total, key) => total + (summary[key]?.length ?? 0), 0);
      const warningCount = (summary.removed?.length ?? 0) + (summary.preservedLocalEdits?.length ?? 0);
      const earliestStage = payload.refresh?.impact?.earliestChangedStage;
      setMessage({
        type: warningCount ? 'warning' : changedCount ? 'success' : 'info',
        text: changedCount
          ? `已刷新 ${projectPath}：新增 ${summary.imported?.length ?? 0}、变化 ${summary.changed?.length ?? 0}、移除 ${summary.removed?.length ?? 0}、保留本地冲突 ${summary.preservedLocalEdits?.length ?? 0}${earliestStage ? `；最早受影响步骤 ${earliestStage}` : ''}。未继承任何人工批准。`
          : `${projectPath} 的正式证据已经是最新状态，没有改动工作台步骤。`,
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveProjectSettings = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}`, {method: 'PATCH', body: JSON.stringify(projectForm)});
      setProject(payload.project);
      await refreshProjectList();
      setMessage({type: 'success', text: '项目设置已保存。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveStageConfig = async () => {
    if (!project || !selectedStageId || !stageForm) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${selectedStageId}`, {method: 'PATCH', body: JSON.stringify(stageForm)});
      setProject(payload.project);
      setMessage({type: 'success', text: '步骤配置已保存。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const waitForJob = async (jobId) => {
    for (let attempt = 0; attempt < 12_000; attempt += 1) {
      const payload = await api(`/api/jobs/${jobId}`);
      setCurrentJob(payload.job);
      if (['complete', 'failed', 'canceled'].includes(payload.job.status)) return payload.job;
      await sleep(1200);
    }
    throw new Error('任务轮询超过 4 小时，已停止等待；后台任务状态仍可在刷新后查看。');
  };

  const generateStage = async (stageId, {quiet = false} = {}) => {
    if (!project) return null;
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${stageId}/generate`, {method: 'POST', body: '{}'});
      setCurrentJob(payload.job);
      if (!quiet) setMessage({type: 'info', text: `${definitions.get(stageId)?.title || stageId} 已进入生成队列。`});
      const job = await waitForJob(payload.job.id);
      const fresh = await loadProject(project.id);
      await refreshProjectList();
      if (job.status === 'failed') throw new Error(job.error);
      if (job.status === 'canceled') throw new Error('任务已取消。');
      if (!quiet) setMessage({type: 'success', text: job.result?.summary || '生成完成。'});
      return {job, project: fresh};
    } catch (error) {
      setMessage({type: 'error', text: error.message});
      return null;
    } finally {
      setCurrentJob(null);
    }
  };

  const cancelJob = async (jobId) => {
    setBusy(true);
    try {
      const payload = await api(`/api/jobs/${jobId}/cancel`, {method: 'POST', body: '{}'});
      setCurrentJob(['queued', 'running', 'cancel-requested'].includes(payload.job.status) ? payload.job : null);
      await loadProject(project.id);
      setMessage({type: 'info', text: payload.job.status === 'cancel-requested' ? '已请求取消；当前执行结束后不会晋级产物。' : '排队任务已取消。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const retryJob = async (jobId) => {
    setBusy(true);
    try {
      const payload = await api(`/api/jobs/${jobId}/retry`, {method: 'POST', body: '{}'});
      setCurrentJob(payload.job);
      setProjectJobs((current) => [payload.job, ...current].slice(0, 12));
      setMessage({type: 'info', text: '失败任务已按原项目和步骤重新入队。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const runToNextGate = async () => {
    if (!project || autoRunning) return;
    setAutoRunning(true);
    let current = project;
    try {
      for (;;) {
        const nextId = activeStageIds.find((id) => current.stages[id]?.enabled && current.stages[id]?.status !== 'approved');
        if (!nextId) {
          const scopedBlockers = [];
          if (current.stages['voice-final']?.approvalScope !== 'human-listening') scopedBlockers.push('配音人工听审');
          if (current.stages['final-preview']?.approvalScope === 'internal-autonomous-review') scopedBlockers.push('用户 Studio 全片确认');
          if (current.publicationRights !== 'cleared') scopedBlockers.push('公开发布权利');
          setMessage({
            type: scopedBlockers.length ? 'info' : 'success',
            text: scopedBlockers.length
              ? `内部路线执行完成；仍需完成：${scopedBlockers.join('、')}。`
              : '公开交付路线的机器与人工门禁均已完成。',
          });
          break;
        }
        const definition = definitions.get(nextId);
        const state = current.stages[nextId];
        setSelectedStageId(nextId);
        if (state.status === 'needs-review') {
          setMessage({type: 'info', text: `已运行到人工门：${definition.title}`});
          break;
        }
        const result = await generateStage(nextId, {quiet: true});
        if (!result) break;
        current = result.project;
        if (definition.humanGate || current.stages[nextId].status === 'needs-review') {
          setMessage({type: 'info', text: `草案已生成，请微调并批准：${definition.title}`});
          break;
        }
      }
    } finally {
      setAutoRunning(false);
    }
  };

  const approveSelectedStage = async (approvalScope = null) => {
    if (!project || !selectedStageId) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${selectedStageId}/approve`, {
        method: 'POST',
        body: JSON.stringify({reviewer: 'user', approvalScope}),
      });
      setProject(payload.project);
      if (selectedStageId === 'voice-final') await loadAudioReview(project.id);
      setMessage({type: 'success', text: '步骤已批准，正式门禁与下游状态已同步。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const savePronunciationReview = async () => {
    if (!project || !pronunciationReviewDraft || !pronunciationRetakeNotesReady(pronunciationReviewDraft)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/pronunciation-review`, {
        method: 'PUT',
        body: JSON.stringify({...pronunciationReviewDraft, reviewer: 'user'}),
      });
      setProject(payload.project);
      setPronunciationReview(payload.pronunciationReview);
      setPronunciationReviewDraft(makePronunciationReviewDraft(payload.pronunciationReview));
      setMessage({
        type: 'success',
        text: payload.pronunciationReview.review.status === 'ready-for-approval'
          ? '候选审核已保存，可以冻结本项目发音表。'
          : '候选审核进度已保存；未完整结束的本地 WAV、未选读法或退回备注仍会阻止批准。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approvePronunciationReview = async () => {
    if (!project || !pronunciationReviewDraft || !pronunciationDraftReady(pronunciationReviewDraft, pronunciationReview)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/pronunciation-review/approve`, {
        method: 'POST',
        body: JSON.stringify({...pronunciationReviewDraft, reviewer: 'user'}),
      });
      setProject(payload.project);
      setPronunciationReview(payload.pronunciationReview);
      setPronunciationReviewDraft(makePronunciationReviewDraft(payload.pronunciationReview));
      await refreshProjectList();
      setMessage({type: 'success', text: '发音选择已绑定候选 WAV、CosyVoice recipe、上下文和 NarrationLock 哈希。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approvePronunciationSelection = async () => {
    if (!project || !pronunciationReviewDraft || !pronunciationSelectionReady(pronunciationReviewDraft, pronunciationReview)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/pronunciation-review/approve-selection`, {
        method: 'POST',
        body: JSON.stringify({
          ...pronunciationReviewDraft,
          reviewer: 'user',
          skipReason: 'User explicitly confirmed all selected pronunciations and directed the workflow to advance without playing the remaining probe candidates.',
          userDirective: `已选 ${pronunciationReviewStats.terms}/${pronunciationReviewStats.terms}，按当前选择进入下一步。`,
        }),
      });
      setProject(payload.project);
      setPronunciationReview(payload.pronunciationReview);
      setPronunciationReviewDraft(makePronunciationReviewDraft(payload.pronunciationReview));
      await refreshProjectList();
      setSelectedStageId('voice-final');
      setInspectorTab('artifact');
      setMessage({type: 'success', text: '已保留当前 41 项选择和真实试听记录，并进入正式配音步骤；公开发布仍保持阻塞。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveAudioReview = async () => {
    if (!project || !audioReviewDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/audio-review`, {
        method: 'PUT',
        body: JSON.stringify({...audioReviewDraft, reviewer: 'user'}),
      });
      setAudioReview(payload.audioReview);
      setAudioReviewDraft(makeAudioReviewDraft(payload.audioReview));
      setMessage({
        type: 'success',
        text: payload.review.status === 'ready-for-approval'
          ? '听审记录已保存，已满足人工批准条件。'
          : '听审进度已保存，未完成项仍会阻止人工批准。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approveAudioReview = async () => {
    if (!project || !audioReviewDraft || !listeningDraftReady(audioReviewDraft, audioReview)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/audio-review/approve`, {
        method: 'POST',
        body: JSON.stringify({...audioReviewDraft, reviewer: 'user'}),
      });
      setProject(payload.project);
      setAudioReview(payload.audioReview);
      setAudioReviewDraft(makeAudioReviewDraft(payload.audioReview));
      await refreshProjectList();
      setMessage({
        type: 'success',
        text: '已将所选候选原子晋升为唯一正式 WAV；alignment、字幕、分镜、HyperFrames 和交付下游已全部标记为需重算。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveFinalReview = async () => {
    if (!project || !finalReviewDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/final-review`, {
        method: 'PUT',
        body: JSON.stringify({...finalReviewDraft, reviewer: 'user'}),
      });
      setFinalReview(payload.finalReview);
      setFinalReviewDraft(makeFinalReviewDraft(payload.finalReview));
      setMessage({
        type: 'success',
        text: payload.finalReview.review.status === 'ready-for-approval'
          ? '全片审片记录已保存，已满足用户批准条件。'
          : '全片审片进度已保存，未完成项仍会阻止批准。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approveFinalReview = async () => {
    if (!project || !finalReviewDraft || !finalReviewDraftReady(finalReviewDraft)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/final-review/approve`, {
        method: 'POST',
        body: JSON.stringify({...finalReviewDraft, reviewer: 'user'}),
      });
      setProject(payload.project);
      setFinalReview(payload.finalReview);
      setFinalReviewDraft(makeFinalReviewDraft(payload.finalReview));
      await refreshProjectList();
      setMessage({type: 'success', text: '用户全片审片批准已绑定当前 composition；视频无需重做，交付元数据需要刷新。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveSubtitleReview = async () => {
    if (!project || !subtitleReviewDraft || !revisionNotesReady(subtitleReviewDraft.cues)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/subtitle-review`, {
        method: 'PUT',
        body: JSON.stringify({...subtitleReviewDraft, reviewer: 'user'}),
      });
      setSubtitleReview(payload.subtitleReview);
      setSubtitleReviewDraft(makeSubtitleReviewDraft(payload.subtitleReview));
      setMessage({
        type: 'success',
        text: payload.subtitleReview.review.status === 'ready-for-approval'
          ? '字幕逐条审校已保存，可以提交人工批准。'
          : '字幕审校进度已保存，待确认或退回项继续阻止批准。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approveSubtitleReview = async () => {
    if (!project || !subtitleReviewDraft || !subtitleReviewDraftReady(subtitleReviewDraft)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/subtitle-review/approve`, {
        method: 'POST',
        body: JSON.stringify({...subtitleReviewDraft, reviewer: 'user'}),
      });
      if (payload.project) setProject(payload.project);
      setSubtitleReview(payload.subtitleReview);
      setSubtitleReviewDraft(makeSubtitleReviewDraft(payload.subtitleReview));
      await refreshProjectList();
      setMessage({type: 'success', text: '字幕语义人工批准已绑定当前 SRT、alignment 与机器 QA 哈希。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveScreenTextReview = async () => {
    if (!project || !screenTextReviewDraft || !revisionNotesReady(screenTextReviewDraft.frames)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/screen-text-review`, {
        method: 'PUT',
        body: JSON.stringify({...screenTextReviewDraft, reviewer: 'user'}),
      });
      setScreenTextReview(payload.screenTextReview);
      setScreenTextReviewDraft(makeScreenTextReviewDraft(payload.screenTextReview));
      setMessage({
        type: 'success',
        text: payload.screenTextReview.review.status === 'ready-for-approval'
          ? '画面文字逐帧复核已保存，可以提交人工批准。'
          : '画面文字复核进度已保存，待确认或退回项继续阻止批准。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const rerunScreenOcr = async () => {
    if (!project || screenTextReviewApproved) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/screen-text-review/ocr`, {
        method: 'POST',
        body: JSON.stringify({minConfidence: 0.55}),
      });
      setScreenTextReview(payload.screenTextReview);
      setScreenTextReviewDraft(makeScreenTextReviewDraft(payload.screenTextReview));
      setMessage({
        type: payload.ocr.status === 'passed' ? 'success' : 'info',
        text: payload.ocr.status === 'passed'
          ? `OCR 已重跑：${payload.ocr.engine?.name || '本地引擎'} ${payload.ocr.engine?.version || ''}，全部当前抽帧可进入人工复核。`
          : payload.ocr.status === 'unresolved'
            ? `OCR 已重跑，但仍有 ${payload.ocr.unresolvedCount} 张低置信或失败帧；请保持人工模式。`
            : '本地 OCR 引擎不可用；已记录 unavailable 回执，请保持人工模式。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approveScreenTextReview = async () => {
    if (!project || !screenTextReviewDraft || !screenTextReviewDraftReady(screenTextReviewDraft, screenTextReview?.ocr?.available)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/screen-text-review/approve`, {
        method: 'POST',
        body: JSON.stringify({...screenTextReviewDraft, reviewer: 'user'}),
      });
      if (payload.project) setProject(payload.project);
      setScreenTextReview(payload.screenTextReview);
      setScreenTextReviewDraft(makeScreenTextReviewDraft(payload.screenTextReview));
      await refreshProjectList();
      setMessage({
        type: 'success',
        text: screenTextReviewDraft.reviewMode === 'ocr-assisted'
          ? 'OCR 辅助与人工逐帧复核已绑定当前 composition 和抽帧哈希。'
          : '人工逐帧复核已批准；回执不会把现有 OCR 报告写成 OCR 辅助批准。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const reopenSelectedStage = async () => {
    if (!project || !selectedStageId) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${selectedStageId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({reason: 'User requested a revision in the workbench.'}),
      });
      setProject(payload.project);
      setMessage({type: 'info', text: '步骤已退回，受影响的下游已标记为需重算。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveArtifact = async () => {
    if (!project || !selectedStageId) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${selectedStageId}/artifact`, {
        method: 'PUT',
        body: JSON.stringify({content: artifactDraft, reason: 'Manual micro-adjustment from the workbench'}),
      });
      setProject(payload.project);
      setArtifact((current) => current ? {...current, content: artifactDraft} : {content: artifactDraft});
      setMessage({type: 'success', text: '人工覆盖已保存，下游失效范围已更新。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const selectGraphDiagram = (graphId) => {
    if (!graphLayoutEditor?.available) return;
    setSelectedGraphId(graphId);
    setGraphLayoutNodes(graphFlowNodes(graphLayoutEditor, graphId));
    setGraphLayoutDirty(false);
  };

  const resetGraphLayoutDraft = () => {
    setGraphLayoutNodes(graphFlowNodes(graphLayoutEditor, selectedGraphId));
    setGraphLayoutDirty(false);
  };

  const saveGraphLayout = async () => {
    if (!project || !graphLayoutEditor?.available || !selectedGraphDiagram || !graphLayoutDirty) return;
    if (graphLayoutReason.trim().length < 2) {
      setMessage({type: 'error', text: '请填写本次布局调整原因。'});
      return;
    }
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/graph-layout-editor`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedRevision: graphLayoutEditor.revision,
          expectedArtifactSha256: graphLayoutEditor.artifactSha256,
          graphId: selectedGraphId,
          positions: graphLayoutNodes.map((node) => ({id: node.id, x: node.position.x, y: node.position.y})),
          reason: graphLayoutReason.trim(),
        }),
      });
      setProject(payload.project);
      setGraphLayoutEditor(payload.editor);
      setGraphLayoutNodes(graphFlowNodes(payload.editor, selectedGraphId));
      setGraphLayoutDirty(false);
      const artifactPayload = await api(`/api/projects/${project.id}/stages/diagram-assets/artifact`);
      setArtifact(artifactPayload.artifact);
      setArtifactDraft(artifactPayload.artifact.content);
      setMessage({type: 'success', text: '图解布局已保存；节点与连线身份未改变，后续全片制作已标记为需重算。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveProductionObjectOverride = async () => {
    if (!project || !productionOverrides || !productionOverrideDraft) return;
    const collection = productionOverrides.targets?.[`${productionOverrideDraft.level}s`] || [];
    const selectedTarget = collection.find((item) => item.id === productionOverrideDraft.targetId);
    if (!selectedTarget) {
      setMessage({type: 'error', text: '请选择一个有效的画面对象。'});
      return;
    }
    setBusy(true);
    try {
      const target = productionOverrideDraft.level === 'scene'
        ? {level: 'scene', sceneId: selectedTarget.sceneId}
        : productionOverrideDraft.level === 'cue'
          ? {level: 'cue', sceneId: selectedTarget.sceneId, cueId: selectedTarget.cueId}
          : {
              level: 'object',
              sceneId: selectedTarget.sceneId,
              cueId: selectedTarget.cueId,
              objectId: selectedTarget.objectId,
            };
      const payload = await api(`/api/projects/${project.id}/production-overrides`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: productionOverrides.revision,
          target,
          text: productionOverrideDraft.text || undefined,
          hostPose: productionOverrideDraft.hostPose || undefined,
          layoutPreset: productionOverrideDraft.layoutPreset || undefined,
          visualVariant: productionOverrideDraft.visualVariant || undefined,
          motionRecipeId: productionOverrideDraft.motionRecipeId || undefined,
          carrierPayload: carrierPayloadFromDraft(productionOverrideDraft),
          assetId: productionOverrideDraft.assetId && productionOverrideDraft.assetId !== '__clear__' ? productionOverrideDraft.assetId : undefined,
          clearAssets: productionOverrideDraft.assetId === '__clear__' || undefined,
          sfxAssetId: productionOverrideDraft.sfxAssetId && productionOverrideDraft.sfxAssetId !== '__clear__' ? productionOverrideDraft.sfxAssetId : undefined,
          sfxRole: productionOverrideDraft.sfxAssetId && productionOverrideDraft.sfxAssetId !== '__clear__' ? productionOverrideDraft.sfxRole || undefined : undefined,
          clearSfx: productionOverrideDraft.sfxAssetId === '__clear__' || undefined,
          reason: productionOverrideDraft.reason,
          authoredBy: 'user',
        }),
      });
      setProject(payload.project);
      setProductionOverrides(payload.editor);
      setProductionOverrideDraft((current) => ({
        ...makeOverrideDraft(payload.editor, current.level),
        targetId: current.targetId,
      }));
      setMessage({type: 'success', text: '画面微调已记录。全片制作及下游步骤已标记为需要重新生成。'});
    } catch (error) {
      if (/revision is stale/i.test(error.message)) await loadProductionOverrides(project.id);
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const importLibraryAsset = async (assetId) => {
    if (!project || !assetId) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/media-assets/import`, {
        method: 'POST',
        body: JSON.stringify({assetId}),
      });
      setProject(payload.project || project);
      setProductionOverrides(payload.editor);
      setProductionOverrideDraft((current) => {
        if (!current) return current;
        return payload.asset?.type === 'sfx'
          ? {...current, sfxAssetId: payload.projectAssetId, sfxRole: current.sfxRole || 'focus-hit'}
          : {...current, assetId: payload.projectAssetId};
      });
      setMessage({type: 'success', text: payload.reused ? '素材已复用，项目没有产生重复文件。' : '素材已导入项目媒体台账，可在画面微调中选择。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const decideVisualAssetCandidate = async (candidate, decision) => {
    if (!project || !visualAssetCandidates?.plan) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/visual-asset-candidates/${encodeURIComponent(candidate.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          candidateDigestSha256: visualAssetCandidates.plan.candidateDigestSha256,
          decision,
          note: visualCandidateNotes[candidate.id] || '',
          reviewer: 'user',
        }),
      });
      setVisualAssetCandidates(payload.candidates);
      setProject(payload.project || project);
      if (payload.editor) setProductionOverrides(payload.editor);
      if (decision === 'adopted' && payload.projectAssetId) {
        setProductionOverrideDraft((current) => current ? {...current, assetId: payload.projectAssetId} : current);
      }
      setMessage({
        type: 'success',
        text: decision === 'adopted'
          ? '候选素材已登记为采用并导入项目；保存画面微调后才会进入下一次全片编译。'
          : '候选素材已记录为不采用；原因会进入本地素材库反馈指标。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const revertProductionObjectOverride = async (overrideId) => {
    if (!project || !productionOverrides) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/production-overrides/${encodeURIComponent(overrideId)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          expectedRevision: productionOverrides.revision,
          reason: 'User reverted this visual adjustment in the workbench.',
          revertedBy: 'user',
        }),
      });
      setProject(payload.project);
      setProductionOverrides(payload.editor);
      setMessage({type: 'success', text: '该画面微调已撤销。重新生成全片后恢复生效。'});
    } catch (error) {
      if (/revision is stale/i.test(error.message)) await loadProductionOverrides(project.id);
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveSemanticSfxDecisions = async () => {
    if (!project || !semanticSfxReviewDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/semantic-sfx-review`, {
        method: 'PUT',
        body: JSON.stringify({...semanticSfxReviewDraft, reviewer: 'user'}),
      });
      setSemanticSfxReview(payload.review);
      setSemanticSfxReviewDraft(makeSemanticSfxReviewDraft(payload.review));
      setMessage({type: 'success', text: '语义音效审核进度已保存；候选计划仍保持静音。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approveSemanticSfxDecisions = async () => {
    if (!project || !semanticSfxReviewDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/semantic-sfx-review/approve`, {
        method: 'POST',
        body: JSON.stringify({...semanticSfxReviewDraft, reviewer: 'user'}),
      });
      setProject(payload.project);
      setSemanticSfxReview(payload.review);
      setSemanticSfxReviewDraft(makeSemanticSfxReviewDraft(payload.review));
      setMessage({type: 'success', text: '已批准选中的语义音效；被驳回的候选继续静音，全片制作已标记为需重算。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const simulateSemanticSfxDecisions = async () => {
    if (!project || !semanticSfxReviewDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/semantic-sfx-review/simulate`, {
        method: 'POST',
        body: JSON.stringify({reason: 'Creator-delegated internal sparse SFX simulation; resolved semantic cues are kept quiet and public release remains blocked.'}),
      });
      setProject(payload.project);
      setSemanticSfxReview(payload.review);
      setSemanticSfxReviewDraft(makeSemanticSfxReviewDraft(payload.review));
      setMessage({type: 'success', text: '已按当前本地素材与语义落点生成内部 SFX 混音候选；未声称真人听审。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const reopenSemanticSfxDecisions = async () => {
    if (!project || !semanticSfxReview?.sourcePlan?.sha256) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/semantic-sfx-review/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          sourcePlanSha256: semanticSfxReview.sourcePlan.sha256,
          reason: 'User reopened the sparse semantic SFX review in the workbench.',
          reviewer: 'user',
        }),
      });
      setProject(payload.project);
      setSemanticSfxReview(payload.review);
      setSemanticSfxReviewDraft(makeSemanticSfxReviewDraft(payload.review));
      setMessage({type: 'info', text: '语义音效计划已退回候选状态，所有候选在重新批准前保持静音。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveMotionLibraryFeedback = async () => {
    if (!project || !motionFeedbackDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/motion-feedback`, {
        method: 'PUT',
        body: JSON.stringify({
          usageKey: motionFeedbackDraft.usageKey,
          overallVerdict: motionFeedbackDraft.overallVerdict,
          recipeFeedback: motionFeedbackDraft.recipeFeedback.map((item) => ({
            recipeId: item.recipeId,
            version: item.version,
            verdict: item.verdict,
            suitableTopics: parseListInput(item.suitableTopicsText),
            issues: parseListInput(item.issuesText),
            notes: item.notes,
          })),
          notes: motionFeedbackDraft.notes,
          reviewer: 'user',
        }),
      });
      setProject(payload.project);
      setMotionFeedback(payload.feedback);
      setMotionFeedbackDraft(makeMotionFeedbackDraft(payload.feedback));
      setMessage({
        type: 'success',
        text: payload.feedback.review.humanReview === 'reviewed'
          ? '动效复盘已写回本地库；本次反馈不会自动晋级或退役配方。'
          : '动效复盘进度已保存，仍有配方等待评价。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const saveMotionProbeHumanReview = async () => {
    if (!selectedMotionProbe || !motionProbeDraft) return;
    setBusy(true);
    try {
      const payload = await api(`/api/motion-library/probes/${encodeURIComponent(selectedMotionProbe.id)}/review`, {
        method: 'PUT',
        body: JSON.stringify({...motionProbeDraft, reviewer: 'user'}),
      });
      setMotionProbes(payload.probes || []);
      setMotionReadiness(payload.readiness || null);
      setMessage({
        type: payload.review.decision === 'failed' ? 'info' : 'success',
        text: payload.review.decision === 'passed'
          ? '探针人工审片已通过并写入版本化回执；配方仍不会自动晋级或进入正式生产。'
          : payload.review.decision === 'failed'
            ? '探针已退回重做，问题和文件哈希已写回本地复盘记录。'
            : '探针审片进度已保存，配方继续保持候选状态。',
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const acceptMotionProbeIntoLifecycle = async () => {
    if (!selectedMotionProbe) return;
    setBusy(true);
    try {
      const payload = await api(`/api/motion-library/probes/${encodeURIComponent(selectedMotionProbe.id)}/accept`, {
        method: 'POST',
        body: JSON.stringify({actor: 'workbench:user'}),
      });
      setMotionProbes(payload.probes || []);
      setMotionReadiness(payload.readiness || null);
      setMessage({
        type: 'success',
        text: `已重新校验 ${payload.accepted.recipeId} 的探针证据，并写入可追溯的 probe-passed 回执；它仍未自动进入任何正式项目。`,
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const approveMotionRecipeForCurrentProject = async () => {
    if (!project || !selectedMotionProbe) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${encodeURIComponent(project.id)}/motion-recipes/${encodeURIComponent(selectedMotionProbe.recipeId)}/approve`, {
        method: 'POST',
        body: JSON.stringify({reviewer: 'user', actor: 'workbench:user'}),
      });
      setMotionProbes(payload.probes || []);
      setMotionReadiness(payload.readiness || null);
      await loadProductionOverrides(project.id);
      setMessage({
        type: 'success',
        text: `${payload.approval.recipeId} 已绑定当前项目的已批准样式和探针回执，可在该项目正式制作中使用。`,
      });
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const handleNodeDragStop = async (_event, node) => {
    if (!project) return;
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${node.id}`, {
        method: 'PATCH',
        body: JSON.stringify({position: node.position}),
      });
      setProject(payload.project);
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    }
  };

  const addCustomStage = async (event) => {
    event.preventDefault();
    if (!project) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          title: values.get('title'),
          description: values.get('description'),
          afterStageId: values.get('afterStageId'),
          toolId: values.get('toolId'),
          humanGate: values.get('humanGate') === 'on',
        }),
      });
      setProject(payload.project);
      setShowCustomDialog(false);
      setMessage({type: 'success', text: '自定义步骤已加入当前项目。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedCustomStage = async () => {
    if (!project || !selectedStageId || !selectedDefinition?.custom) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/stages/${selectedStageId}`, {method: 'DELETE'});
      setProject(payload.project);
      setSelectedStageId(null);
      setMessage({type: 'success', text: '自定义步骤已移除。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const resetCurrentProject = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/reset`, {method: 'POST', body: '{}'});
      setProject(payload.project);
      setProjectJobs([]);
      setCurrentJob(null);
      setSelectedStageId(null);
      setDangerAction(null);
      await refreshProjectList();
      setMessage({type: 'info', text: '工作台进度已重置；正式项目文件和锁稿输入未删除。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentProject = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, {method: 'DELETE'});
      setProject(null);
      setReleaseCenter(null);
      setSelectedStageId(null);
      setDangerAction(null);
      const payload = await api('/api/projects');
      setProjects(payload.projects);
      if (payload.projects.length) await loadProject(payload.projects[0].id);
      else setShowProjectDialog(true);
      setMessage({type: 'info', text: '工作台项目已删除；正式 HyperFrames 项目和已批准输入仍保留。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const startStudioPreview = async () => {
    if (!project) return;
    const previewWindow = window.open('about:blank', `autovideo-${project.id}-studio`);
    setBusy(true);
    try {
      const payload = await api(`/api/projects/${project.id}/preview/start`, {method: 'POST', body: '{}'});
      setProject(payload.project);
      if (previewWindow) previewWindow.location.href = payload.preview.url;
      setMessage({type: 'success', text: 'HyperFrames Studio 已启动。完整审片后再回到工作台批准。'});
    } catch (error) {
      if (previewWindow) previewWindow.close();
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const stopStudioPreview = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/preview/stop`, {method: 'POST', body: '{}'});
      setMessage({type: 'info', text: '当前项目的 Studio 服务已停止。'});
    } catch (error) {
      setMessage({type: 'error', text: error.message});
    } finally {
      setBusy(false);
    }
  };

  const nextStage = useMemo(() => {
    if (!project) return null;
    const id = activeStageIds.find((stageId) => project.stages[stageId]?.enabled && project.stages[stageId]?.status !== 'approved');
    return id ? {id, definition: definitions.get(id), state: project.stages[id]} : null;
  }, [activeStageIds, definitions, project]);

  const completionSummary = useMemo(() => {
    if (!project) return {title: '等待项目', detail: '请选择或创建项目'};
    if (nextStage) return {title: nextStage.definition.title, detail: STATUS_LABELS[nextStage.state.status]};
    const humanGates = [];
    if (project.stages['voice-final']?.approvalScope !== 'human-listening') humanGates.push('待配音人工听审');
    if (project.stages['final-preview']?.approvalScope === 'internal-autonomous-review') humanGates.push('待用户 Studio 全片确认');
    if (project.publicationRights !== 'cleared') humanGates.push('公开发布权利未清');
    if (humanGates.length) return {title: '内部交付已完成', detail: humanGates.join(' · ')};
    if (releaseCenter?.phase === 'published') return {title: '已发布', detail: releaseCenter.publishingAssets.publicationReceipt.url || '发布回执已登记'};
    return {title: '公开母版候选', detail: '机器与人工门已通过；发布后仍需登记平台回执'};
  }, [nextStage, project, releaseCenter]);

  const selectedTool = selectedStage ? toolMap.get(selectedStage.toolId) : null;
  const downstreamImpact = selectedStageId
    ? activeStageIds.slice(activeStageIds.indexOf(selectedStageId) + 1).filter((id) => project?.stages[id]?.enabled)
    : [];
  const pronunciationReviewApproved = Boolean(pronunciationReview?.approval) || pronunciationReview?.review?.status === 'approved';
  const pronunciationReviewStats = {
    terms: pronunciationReview?.review?.terms?.length || 0,
    candidates: pronunciationReview?.review?.terms?.reduce((sum, term) => sum + term.candidates.length, 0) || 0,
    selected: pronunciationReviewDraft?.terms?.filter((term) => term.selectedCandidateId).length || 0,
    played: pronunciationReviewDraft?.terms?.reduce((sum, term) => sum + term.playedCandidateIds.length, 0) || 0,
    accepted: pronunciationReviewDraft?.terms?.filter((term) => term.decision === 'accepted').length || 0,
  };
  const canSavePronunciationReview = Boolean(
    pronunciationReviewDraft
    && !pronunciationReviewApproved
    && selectedStage?.status === 'needs-review'
    && pronunciationRetakeNotesReady(pronunciationReviewDraft),
  );
  const canApprovePronunciationReview = canSavePronunciationReview
    && pronunciationDraftReady(pronunciationReviewDraft, pronunciationReview);
  const canApprovePronunciationSelection = canSavePronunciationReview
    && pronunciationSelectionReady(pronunciationReviewDraft, pronunciationReview);
  const audioReviewApproved = audioReview?.approval?.approvalScope === 'human-listening';
  const canSaveAudioReview = Boolean(audioReviewDraft && !audioReviewApproved && selectedStage?.status === 'needs-review'
    && (audioReviewDraft.decision !== 'retake' || audioReviewDraft.notes.trim().length >= 2));
  const canApproveAudioReview = canSaveAudioReview && listeningDraftReady(audioReviewDraft, audioReview);
  const finalReviewApproved = finalReview?.approval?.scope === 'human-review';
  const canApproveFinalReview = (selectedStage?.status === 'needs-review'
      || (selectedStage?.status === 'approved' && selectedStage?.approvalScope === 'internal-autonomous-review'))
    && Boolean(selectedStage.previewStartedAt)
    && finalReviewDraftReady(finalReviewDraft);
  const subtitleReviewApproved = Boolean(subtitleReview?.approval) || subtitleReview?.review?.status === 'approved';
  const subtitleCueStats = Object.fromEntries(['accepted', 'revise', 'pending'].map((decision) => [
    decision,
    subtitleReviewDraft?.cues?.filter((item) => item.decision === decision).length || 0,
  ]));
  const canSaveSubtitleReview = Boolean(
    subtitleReviewDraft
    && !subtitleReviewApproved
    && selectedStage?.status === 'needs-review'
    && revisionNotesReady(subtitleReviewDraft.cues),
  );
  const canApproveSubtitleReview = canSaveSubtitleReview && subtitleReviewDraftReady(subtitleReviewDraft);
  const screenTextReviewApproved = Boolean(screenTextReview?.approval) || screenTextReview?.review?.status === 'approved';
  const screenFrameStats = Object.fromEntries(['accepted', 'revise', 'pending'].map((decision) => [
    decision,
    screenTextReviewDraft?.frames?.filter((item) => item.decision === decision).length || 0,
  ]));
  const canSaveScreenTextReview = Boolean(
    screenTextReviewDraft
    && !screenTextReviewApproved
    && selectedStage?.status === 'needs-review'
    && revisionNotesReady(screenTextReviewDraft.frames)
    && (screenTextReviewDraft.reviewMode !== 'ocr-assisted' || screenTextReview?.ocr?.available),
  );
  const canApproveScreenTextReview = canSaveScreenTextReview
    && screenTextReviewDraftReady(screenTextReviewDraft, screenTextReview?.ocr?.available);
  const productionOverrideTargets = productionOverrideDraft
    ? productionOverrides?.targets?.[`${productionOverrideDraft.level}s`] || []
    : [];
  const selectedProductionOverrideTarget = productionOverrideTargets
    .find((item) => item.id === productionOverrideDraft?.targetId);
  const productionOverrideComparisonRows = selectedProductionOverrideTarget
    ? OVERRIDE_STATE_FIELDS
      .filter(([field]) => Object.hasOwn(selectedProductionOverrideTarget.states?.effective || {}, field))
      .map(([field, label]) => ({
        field,
        label,
        generated: selectedProductionOverrideTarget.states?.generated?.[field],
        override: selectedProductionOverrideTarget.states?.override?.[field],
        effective: selectedProductionOverrideTarget.states?.effective?.[field],
        source: selectedProductionOverrideTarget.fieldSources?.[field] || {source: 'generated'},
        changed: selectedProductionOverrideTarget.changedFields?.generatedToEffective?.includes(field),
      }))
    : [];
  const selectedProductionMediaAsset = productionOverrides?.mediaAssets
    ?.find((item) => item.id === productionOverrideDraft?.assetId);
  const selectedCarrierAdapter = productionOverrides?.carrierAdapters
    ?.find((item) => item.adapterId === productionOverrideDraft?.carrierAdapterId);
  const selectedProductionSfxAsset = productionOverrides?.sfxAssets
    ?.find((item) => item.id === productionOverrideDraft?.sfxAssetId);
  const selectedMotionRecommendation = productionOverrides?.motionRecommendations?.decisions
    ?.find((item) => item.cueId === selectedProductionOverrideTarget?.cueId);
  const selectedRecommendedRecipe = productionOverrides?.recipes
    ?.find((item) => item.id === selectedMotionRecommendation?.recommendedRecipeId);
  const selectedRecommendationReady = Boolean(
    selectedMotionRecommendation?.recommendation?.inputReady
    && selectedRecommendedRecipe?.allowedForProject,
  );
  const selectedRecommendationAlreadyActive = Boolean(
    selectedMotionRecommendation?.recommendedRecipeId
    && selectedMotionRecommendation.recommendedRecipeId === selectedMotionRecommendation.currentRecipeId,
  );
  const visualCandidatesForSelectedTarget = (visualAssetCandidates?.plan?.candidates ?? []).filter((candidate) => (
    candidate.sourceCueIds?.includes(selectedProductionOverrideTarget?.cueId ?? selectedProductionOverrideTarget?.id)
  ));
  const activeProductionOverrides = productionOverrides?.overrides?.filter((item) => item.status === 'active') || [];
  const semanticSfxPlanApproved = semanticSfxReview?.status === 'approved';
  const semanticSfxCanApprove = Boolean(
    semanticSfxReview?.available
    && !semanticSfxPlanApproved
    && semanticSfxReview?.canApprove
    && semanticSfxReviewDraft?.decisions?.length === semanticSfxReview?.counts?.total
    && semanticSfxReviewDraft.decisions.every((item) => item.decision !== 'pending'),
  );
  const productionSfxSelectionReady = !productionOverrideDraft?.sfxAssetId
    || productionOverrideDraft.sfxAssetId === '__clear__'
    || Boolean(productionOverrideDraft.sfxRole);
  const canSaveProductionOverride = Boolean(
    selectedProductionOverrideTarget
    && productionOverrideDraft?.reason.trim().length >= 2
    && productionSfxSelectionReady
    && carrierDraftReady(productionOverrideDraft)
    && (
      productionOverrideDraft.text.trim()
      || productionOverrideDraft.hostPose
      || productionOverrideDraft.layoutPreset
      || productionOverrideDraft.visualVariant
      || productionOverrideDraft.motionRecipeId
      || productionOverrideDraft.carrierAdapterId
      || productionOverrideDraft.assetId
      || productionOverrideDraft.sfxAssetId
    ),
  );
  const motionFeedbackReviewed = Boolean(
    motionFeedbackDraft?.overallVerdict !== 'pending'
    && motionFeedbackDraft?.recipeFeedback?.length
    && motionFeedbackDraft.recipeFeedback.every((item) => item.verdict !== 'pending'),
  );
  const motionProbeAllChecksPassed = Boolean(
    motionProbeDraft && MOTION_PROBE_CHECKLIST.every(([key]) => motionProbeDraft.checks?.[key] === true),
  );
  const canSaveMotionProbeReview = Boolean(
    selectedMotionProbe
    && motionProbeDraft
    && (motionProbeDraft.decision !== 'passed' || (selectedMotionProbe.technicalReady && motionProbeAllChecksPassed))
    && (motionProbeDraft.decision !== 'failed' || motionProbeDraft.notes.trim().length >= 2),
  );
  const canAcceptMotionProbeLifecycle = Boolean(
    selectedMotionProbe
    && motionReadiness?.contract?.valid === true
    && selectedMotionRecipeReadiness?.contractValid === true
    && selectedMotionProbe.status === 'candidate'
    && selectedMotionProbe.review?.decision === 'passed'
    && !selectedMotionProbe.reviewStale,
  );
  const canApproveMotionRecipeForProject = Boolean(
    project
    && selectedMotionProbe
    && motionReadiness?.contract?.valid === true
    && selectedMotionRecipeReadiness?.contractValid === true
    && ['probe-passed', 'approved-project'].includes(selectedMotionProbe.status),
  );
  const visualPlanReview = useMemo(
    () => selectedStageId === 'visual-plan' ? summarizeVisualPlanArtifact(artifactDraft) : null,
    [artifactDraft, selectedStageId],
  );
  const inspectorTabs = selectedStageId === 'final-preview'
    ? ['review', 'override', 'config', 'artifact', 'reuse']
    : ['pronunciation-review', 'voice-final', 'subtitle-review', 'screen-text-review'].includes(selectedStageId)
      ? ['review', 'config', 'artifact', 'reuse']
      : selectedStageId === 'full-production'
        ? ['override', 'config', 'artifact', 'reuse']
        : selectedStageId === 'retrospective'
          ? ['feedback', 'config', 'artifact', 'reuse']
          : selectedStageId === 'diagram-assets'
            ? ['layout', 'config', 'artifact', 'reuse']
          : selectedStageId === 'visual-plan'
            ? ['review', 'artifact', 'config', 'reuse']
          : selectedStageId === 'style-probe'
            ? ['probe', 'library', 'config', 'artifact', 'reuse']
            : ['config', 'artifact', 'reuse'];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <GitBranch aria-hidden="true" />
          <div>
            <strong>AutoVideo 生产工作台</strong>
            <span>生成、微调、失效传播、HyperFrames 最终确认</span>
          </div>
        </div>
        <div className="header-actions">
          <a className="button secondary" href="/api/files/raw?path=docs%2F10-%E8%AE%B2%E8%A7%A3%E8%A7%86%E9%A2%91%E8%A7%84%E6%A8%A1%E5%8C%96SOP.md" target="_blank" rel="noreferrer"><BookOpen aria-hidden="true" />完整 SOP</a>
          <span className={`connection-state ${health?.ok ? 'is-online' : ''}`}>{health?.ok ? (health.readOnlyPreview ? '只读预览已连接' : '本地后端已连接') : '正在连接'}</span>
          <button type="button" className="button secondary" onClick={() => { setFormalProjectInspection(null); setShowFormalProjectDialog(true); }}>
            <FileText aria-hidden="true" />接入正式项目
          </button>
          <button type="button" className="button secondary" onClick={() => setShowCustomDialog(true)} disabled={!project}>
            <CirclePlus aria-hidden="true" />新增步骤
          </button>
          <button type="button" className="button primary" onClick={runToNextGate} disabled={!project || autoRunning || currentJob}>
            {autoRunning ? <LoaderCircle className="spin" aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
            {autoRunning ? '自动运行中' : '自动运行到下一人工门'}
          </button>
        </div>
      </header>

      {message && (
        <div className={`message-bar ${message.type}`} role={['error', 'warning'].includes(message.type) ? 'alert' : 'status'}>
          {['error', 'warning'].includes(message.type) && <AlertTriangle aria-hidden="true" />}
          <span>{message.text}</span>
          <button type="button" className="icon-button" aria-label="关闭消息" onClick={() => setMessage(null)}><X aria-hidden="true" /></button>
        </div>
      )}

      <main className={`workbench-grid${selectedStageId === 'diagram-assets' ? ' graph-editor-active' : ''}`}>
        <aside className="project-rail" aria-label="项目设置">
          <div className="rail-heading">
            <h2>项目</h2>
            <button type="button" className="icon-button" aria-label="新建项目" onClick={() => { setNewProjectForm(emptyProjectForm); setShowProjectDialog(true); }}>
              <CirclePlus aria-hidden="true" />
            </button>
          </div>
          <label className="field-label" htmlFor="project-select">当前项目</label>
          <select id="project-select" className="select-control" value={project?.id || ''} onChange={(event) => loadProject(event.target.value)} disabled={busy}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>

          {project?.formalProjectPath && (
            <div className="formal-project-receipt">
              <FileText aria-hidden="true" />
              <div>
                <span>已接入正式项目</span>
                <code>{project.formalProjectPath}</code>
                {project.formalProjectRefreshedAt && <small>最近刷新 {new Date(project.formalProjectRefreshedAt).toLocaleString()}</small>}
              </div>
              <button
                type="button"
                className="icon-button"
                title="刷新正式证据，不覆盖人工修改或自动批准"
                aria-label="刷新正式项目证据"
                onClick={() => setShowFormalRefreshDialog(true)}
                disabled={busy || Boolean(currentJob)}
              >
                {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              </button>
            </div>
          )}

          {project && (
            <div className="project-fields">
              <label className="field-label">名称<input className="text-control" value={projectForm.title || ''} onChange={(event) => setProjectForm((current) => ({...current, title: event.target.value}))} /></label>
              <label className="field-label">输入路线<select className="select-control" value={projectForm.route || 'materials'} disabled={Boolean(project.contentIntake)} onChange={(event) => setProjectForm((current) => ({...current, route: event.target.value}))}>
                <option value="materials">资料包</option><option value="script">已审文字稿</option><option value="audio">口播音频</option>
              </select></label>
              <label className="field-label">输入路径<input className="text-control" value={projectForm.sourcePath || ''} readOnly={Boolean(project.contentIntake)} onChange={(event) => setProjectForm((current) => ({...current, sourcePath: event.target.value}))} /></label>
              {project.contentIntake && (
                <div className="intake-receipt">
                  <div><ShieldCheck aria-hidden="true" /><strong>不可变输入已登记</strong></div>
                  <span>{project.contentIntake.inputType} · {project.contentIntake.payload.fileCount} 个文件 · {project.contentIntake.payload.bytes} bytes</span>
                  <code title={project.contentIntake.payload.sha256}>{project.contentIntake.payload.sha256.slice(0, 16)}…</code>
                </div>
              )}
              <div className="field-pair">
                <label className="field-label">平台<select className="select-control" value={platformSelectValue(projectForm.platform)} onChange={(event) => setProjectForm((current) => ({...current, platform: event.target.value}))}>
                  {platformSelectValue(projectForm.platform) === '__custom__' && <option value="__custom__" disabled>{projectForm.platform || '未指定'}（当前项目）</option>}
                  {PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select></label>
                <label className="field-label">时长<select className="select-control" value={projectForm.targetDuration || '90s'} onChange={(event) => setProjectForm((current) => ({...current, targetDuration: event.target.value}))}>
                  {!['60s', '90s', '180s', '300s'].includes(projectForm.targetDuration) && projectForm.targetDuration && <option value={projectForm.targetDuration}>{projectForm.targetDuration}（当前项目）</option>}
                  <option value="60s">60 秒</option><option value="90s">90 秒</option><option value="180s">3 分钟</option><option value="300s">5 分钟</option>
                </select></label>
              </div>
              <label className="field-label">声音路线<select className="select-control" value={projectForm.voiceRoute || 'preset14'} onChange={(event) => setProjectForm((current) => ({...current, voiceRoute: event.target.value}))}>
                <option value="preset14">CosyVoice 预设 14</option><option value="original">保留原声</option><option value="authorized-vc">授权 VC</option>
              </select></label>
              <div className="tutorial-links">
                <a href="/api/files/raw?path=tools%2Fvoice-lab%2Ftutorials%2F08-final-voice-14.md" target="_blank" rel="noreferrer">预设 14 快速试读</a>
                <a href="/api/files/raw?path=hyperframes-workflow-kit%2FVOICE_HANDOFF.md" target="_blank" rel="noreferrer">配音交接契约</a>
              </div>
              <label className="field-label">观众<input className="text-control" value={projectForm.audience || ''} onChange={(event) => setProjectForm((current) => ({...current, audience: event.target.value}))} /></label>
              <label className="field-label">最终记忆点<textarea className="text-control textarea-small" value={projectForm.targetOutcome || ''} onChange={(event) => setProjectForm((current) => ({...current, targetOutcome: event.target.value}))} /></label>
              <label className="field-label">发布权利<select className="select-control" value={projectForm.publicationRights || 'needs-review'} onChange={(event) => setProjectForm((current) => ({...current, publicationRights: event.target.value}))}>
                <option value="needs-review">待核实，禁止最终渲染</option><option value="cleared">已清权</option><option value="internal-only">仅内部测试</option>
              </select></label>
              <label className="field-label">权利凭据备注<textarea className="text-control textarea-small" value={projectForm.rightsNotes || ''} onChange={(event) => setProjectForm((current) => ({...current, rightsNotes: event.target.value}))} /></label>
              <button type="button" className="button secondary block" onClick={saveProjectSettings} disabled={busy}><Save aria-hidden="true" />保存项目设置</button>
              <div className="project-danger-actions">
                <button type="button" className="button secondary" onClick={() => setDangerAction('reset')} disabled={busy}><RotateCcw aria-hidden="true" />重置进度</button>
                <button type="button" className="button danger" onClick={() => setDangerAction('delete')} disabled={busy}><Trash2 aria-hidden="true" />删除项目</button>
              </div>
            </div>
          )}

          {project && (
            <section className="task-queue" aria-labelledby="task-queue-title">
              <div className="section-heading">
                <div><span className="eyebrow">可恢复</span><strong id="task-queue-title">任务队列</strong></div>
                <span>{projectJobs.length} 条记录</span>
              </div>
              {projectJobs.length === 0
                ? <p className="muted-copy">当前项目还没有生成任务。</p>
                : <div className="task-list">
                    {projectJobs.slice(0, 6).map((job) => (
                      <div className="task-row" key={job.id}>
                        <div>
                          <strong>{definitions.get(job.stageId)?.title || job.stageId}</strong>
                          <span>{STATUS_LABELS[job.status] || job.status} · 第 {job.attempt || 1} 次</span>
                        </div>
                        {['queued', 'running'].includes(job.status) && (
                          <button type="button" className="icon-button" title="取消任务" aria-label={`取消 ${job.stageId}`} onClick={() => cancelJob(job.id)} disabled={busy}>
                            <Square aria-hidden="true" />
                          </button>
                        )}
                        {job.status === 'cancel-requested' && <span className="task-pending">收尾中</span>}
                        {['failed', 'canceled'].includes(job.status) && (
                          <button type="button" className="icon-button" title="重试任务" aria-label={`重试 ${job.stageId}`} onClick={() => retryJob(job.id)} disabled={busy || Boolean(currentJob)}>
                            <RefreshCw aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>}
            </section>
          )}

          <section className="batch-panel" aria-labelledby="batch-panel-title">
            <div className="section-heading">
              <div><span className="eyebrow">批量生产</span><strong id="batch-panel-title">批次管理</strong></div>
              <span>{batches.length} 个批次</span>
            </div>
            <label className="field-label">批次名称
              <input className="text-control" value={batchDraft.title} onChange={(event) => setBatchDraft((current) => ({...current, title: event.target.value}))} />
            </label>
            <div className="field-pair">
              <label className="field-label">目标步骤
                <select className="select-control" value={batchDraft.stageId} onChange={(event) => setBatchDraft((current) => ({...current, stageId: event.target.value}))}>
                  <option value="next-human-gate">自动运行到下一人工门</option>
                  {['voice-final', 'visual-plan', 'full-production', 'qa-review', 'render-deliver'].map((stageId) => <option key={stageId} value={stageId}>{definitions.get(stageId)?.title || stageId}</option>)}
                </select>
              </label>
              <label className="field-label">优先级
                <input className="text-control" type="number" min="0" max="100" value={batchDraft.priority} onChange={(event) => setBatchDraft((current) => ({...current, priority: event.target.value}))} />
              </label>
            </div>
            <div className="batch-project-picker">
              <span className="field-label">批次项目</span>
              {projects.map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={batchDraft.projectIds.includes(item.id)} onChange={(event) => setBatchDraft((current) => ({...current, projectIds: event.target.checked ? [...new Set([...current.projectIds, item.id])] : current.projectIds.filter((id) => id !== item.id)}))} /><span>{item.title}</span></label>)}
            </div>
            <button type="button" className="button secondary block" onClick={createWorkbenchBatch} disabled={busy || !projects.length}><CirclePlus aria-hidden="true" />创建批次</button>
            {batches.length > 0 && <div className="batch-list">
              {batches.slice(0, 5).map((batch) => <div className="batch-row" key={batch.id}>
                <div>
                  <strong>{batch.title}</strong>
                  <span>{BATCH_STATUS_LABELS[batch.status] || batch.status} · 运行 {batch.runCount || 0} 次 · {batch.metrics?.completedJobs || 0}/{batch.metrics?.latestJobCount || batch.metrics?.totalJobs || 0} 个最新任务 · {batch.projectIds.length} 个项目 · 素材候选 {batch.metrics?.visualCandidateAdoptionCount || 0}/{batch.metrics?.visualCandidateDecisionCount || 0} 采用</span>
                  <span className="batch-readiness-summary">
                    {batch.metrics?.readyForDeliveryCount || 0}/{batch.metrics?.totalProjects || batch.projectIds.length} 可交付 · {batch.metrics?.readyForCompositionCount || 0} 可进全片编排 · {batch.metrics?.blockedProjectCount || 0} 个有阻塞
                  </span>
                  {batch.lastRun && <small>最新运行：{batch.lastRun.status} · {batch.lastRun.plan?.filter((item) => item.action === 'skip' || item.action === 'reuse').length || 0} 个复用/跳过 · {batch.lastRun.plan?.filter((item) => item.action === 'blocked').length || 0} 个阻断</small>}
                  {(batch.metrics?.projectReadiness || []).slice(0, 6).map((readiness) => (
                    <button
                      type="button"
                      className={`batch-project-readiness ${readiness.readyForDelivery ? 'is-ready' : readiness.readyForComposition ? 'is-composition-ready' : ''}`}
                      key={readiness.projectId}
                      onClick={() => openBatchProject(readiness.projectId)}
                      disabled={busy}
                    >
                      <strong>{readiness.title || readiness.projectId}</strong>
                      <span>{readiness.readyForDelivery ? BATCH_READINESS_LABELS.delivery : readiness.readyForComposition ? BATCH_READINESS_LABELS.ready : `${BATCH_READINESS_LABELS.blocked}：${readiness.nextStageTitle || readiness.nextStageId || '待检查'}`}</span>
                      <small>{readiness.nextAction}</small>
                    </button>
                  ))}
                </div>
                <div className="batch-actions">
                  {['draft', 'failed', 'waiting-human'].includes(batch.status) && <button type="button" className="icon-button" title="运行批次" aria-label={`运行 ${batch.title}`} onClick={() => controlBatch(batch.id, 'run')} disabled={busy}><Play aria-hidden="true" /></button>}
                  {batch.status === 'running' && <button type="button" className="icon-button" title="暂停批次" aria-label={`暂停 ${batch.title}`} onClick={() => controlBatch(batch.id, 'pause')} disabled={busy}><Pause aria-hidden="true" /></button>}
                  {batch.status === 'paused' && <button type="button" className="icon-button" title="恢复批次" aria-label={`恢复 ${batch.title}`} onClick={() => controlBatch(batch.id, 'resume')} disabled={busy}><Play aria-hidden="true" /></button>}
                </div>
              </div>)}
            </div>}
          </section>

          <section className="maturity-panel" aria-labelledby="maturity-panel-title">
            <div className="section-heading">
              <div><span className="eyebrow">规模化门禁</span><strong id="maturity-panel-title">成熟度审计</strong></div>
              <button type="button" className="icon-button" title="刷新成熟度审计" aria-label="刷新成熟度审计" onClick={refreshMaturity} disabled={maturityLoading}>
                {maturityLoading ? <LoaderCircle className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              </button>
            </div>
            {maturity ? (
              <>
                <div className="maturity-status-line">
                  <strong className={maturity.mature ? 'is-ready' : 'is-blocked'}>{maturity.mature ? '成熟可批量交付' : '尚未成熟'}</strong>
                  <span>{maturity.gates.filter((item) => item.passed).length}/{maturity.gates.length} 门通过</span>
                </div>
                <div className="maturity-metrics">
                  <div><span>真实项目</span><strong>{maturity.summary.realProjects}/{maturity.policy.thresholds.recoverableRealProjects}</strong></div>
                  <div><span>公开候选</span><strong>{maturity.summary.publicReleaseCandidates}/{maturity.policy.thresholds.publicReleaseCandidates}</strong></div>
                  <div><span>动效人审</span><strong>{maturity.summary.motionHumanLifecycle}/{maturity.policy.thresholds.motionRecipesWithHumanLifecycle}</strong></div>
                  <div><span>内容金标</span><strong>{maturity.summary.humanReviewedContentGoldCases}/{maturity.policy.thresholds.humanReviewedContentGoldCases}</strong></div>
                </div>
                <div className="maturity-gate-list">
                  {maturity.gates.map((item) => (
                    <div className={`maturity-gate-row${item.passed ? ' is-ready' : ''}`} key={item.id}>
                      {item.passed ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                      <div><strong>{MATURITY_GATE_LABELS[item.id] || item.id}</strong><small>{maturityGateDetail(item, maturity)}</small></div>
                      <span>{item.passed ? '通过' : '阻塞'}</span>
                    </div>
                  ))}
                </div>
                {project && scaleMetrics?.draft && (
                  <div className="scale-metrics-block">
                    <div className="scale-metrics-heading">
                      <div>
                        <strong>当前项目指标草稿</strong>
                        <small>{scaleMetrics.simulation ? '内部模拟回执已保存' : '尚未保存模拟回执'}</small>
                      </div>
                      <div className="scale-metrics-actions">
                        <button type="button" className="icon-button" title="刷新指标草稿" aria-label="刷新指标草稿" onClick={() => refreshScaleMetrics(project.id)} disabled={scaleMetricsLoading}>
                          <RefreshCw className={scaleMetricsLoading ? 'spin' : ''} aria-hidden="true" />
                        </button>
                        <button type="button" className="icon-button" title="按当前证据生成内部模拟" aria-label="按当前证据生成内部模拟" onClick={simulateScaleMetrics} disabled={scaleMetricsLoading || health?.readOnlyPreview}>
                          <WandSparkles aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="scale-metric-list">
                      {Object.entries(scaleMetrics.draft.metrics).map(([key, item]) => (
                        <div className={`scale-metric-row is-${item.state}`} key={key}>
                          <span>{SCALE_METRIC_LABELS[key] || key}</span>
                          <strong>{scaleMetricValue(key, item)}</strong>
                          <small>{item.state === 'derived' ? '自动推导' : '待真人/遥测'}</small>
                        </div>
                      ))}
                    </div>
                    <p className="scale-metrics-note">
                      {scaleMetrics.draft.recoveryEligible
                        ? '当前恢复回执具备进入真人确认的机器前提。'
                        : '当前样片不是可计数的真实恢复项目；模拟结果仅用于演练工作台。'}
                    </p>
                  </div>
                )}
              </>
            ) : <p className="muted-copy">成熟度审计暂不可读取。</p>}
          </section>

          {project && releaseCenter && (
            <section className="release-center" aria-labelledby="release-center-title">
              <div className="section-heading">
                <div><span className="eyebrow">交付范围</span><strong id="release-center-title">发布中心</strong></div>
                <span className={`release-phase phase-${releaseCenter.phase}`}>{RELEASE_PHASE_LABELS[releaseCenter.phase] || releaseCenter.phase}</span>
              </div>
              <div className="release-readiness">
                <span className={releaseCenter.internalReviewReady ? 'is-ready' : ''}>内部审片</span>
                <span className={releaseCenter.publicMasterReady ? 'is-ready' : ''}>公开母版</span>
                <span className={releaseCenter.published ? 'is-ready' : ''}>平台发布</span>
              </div>
              {releaseCenter.files.length > 0 && (
                <div className="deliverable-list">
                  {releaseCenter.files.slice(0, 6).map((file) => (
                    <a key={file.path} href={`/api/projects/${project.id}/deliverables/file?path=${encodeURIComponent(file.path)}&download=1`}>
                      <span>{file.kind}</span><strong>{file.path.split('/').at(-1)}</strong><ExternalLink aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
              <div className="publishing-gaps">
                <span className={releaseCenter.publishingAssets.cover.status === 'ready' ? 'is-ready' : ''}>封面</span>
                <span className={releaseCenter.publishingAssets.title.status !== 'missing' ? 'is-draft' : ''}>标题</span>
                <span>简介</span><span>标签</span><span className={releaseCenter.published ? 'is-ready' : ''}>发布回执</span>
              </div>
              {releaseCenter.blockers.length > 0 && (
                <ul className="release-blockers">{releaseCenter.blockers.slice(0, 4).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
              )}
            </section>
          )}

          <div className="integration-strip">
            <h3>已发现能力</h3>
            <span className={health?.integrations?.codex?.ready ? 'ready' : 'missing'}>Codex CLI</span>
            <span className={health?.integrations?.cosyvoice14?.ready ? 'ready' : 'missing'}>CosyVoice 14</span>
            <span className={health?.integrations?.hyperframesVendor?.ready ? 'ready' : 'missing'}>HyperFrames</span>
          </div>

          <figure className="template-preview">
            <img src="/api/assets/host-template" alt="当前 IP 主持人模板静帧" />
            <figcaption>人物模板仍需完成颜色系统审批，工作台不会绕过正式风格门。</figcaption>
          </figure>
        </aside>

        <section className="flow-workspace" aria-label="视频生产流程">
          <div className="flow-toolbar">
            <div>
              <span className="eyebrow">下一步</span>
              <strong>{completionSummary.title}</strong>
              <span>{completionSummary.detail}</span>
            </div>
            {currentJob && (
              <div className="job-state"><LoaderCircle className="spin" aria-hidden="true" />{definitions.get(currentJob.stageId)?.title || currentJob.stageId} · {currentJob.status}</div>
            )}
          </div>
          <div className="flow-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_event, node) => selectStage(node.id)}
              onNodeDragStop={handleNodeDragStop}
              defaultViewport={{x: 28, y: 58, zoom: 0.72}}
              minZoom={0.25}
              maxZoom={1.6}
              nodesConnectable={false}
              deleteKeyCode={null}
            >
              <Background gap={24} size={1} color="#ccd3ce" />
              <MiniMap pannable zoomable nodeColor={(node) => ({approved: '#356650', running: '#3b5f8a', 'needs-review': '#926415', stale: '#a54836'}[node.data.status] || '#aeb9b2')} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </section>

        <aside className="inspector" aria-label="步骤检查器">
          {!selectedStage ? (
            <div className="empty-inspector">
              <GitBranch aria-hidden="true" />
              <strong>选择一个生产步骤</strong>
              <span>生成、编辑、切换工具或查看失效范围。</span>
            </div>
          ) : (
            <>
              <div className="inspector-heading">
                <div>
                  <span className="eyebrow">{groupMap.get(selectedDefinition.group) || '自定义步骤'}</span>
                  <h2>{selectedStage.titleOverride || selectedDefinition.title}</h2>
                </div>
                <span className={`status-badge status-${selectedStage.status}`}>{stageStatusLabel(selectedStageId, selectedStage, project)}</span>
              </div>

              <div className="inspector-tabs" style={{gridTemplateColumns: `repeat(${inspectorTabs.length}, minmax(0, 1fr))`}} role="tablist" aria-label="步骤内容">
                {inspectorTabs.map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} onClick={() => setInspectorTab(tab)}>
                    {tab === 'review'
                      ? (selectedStageId === 'visual-plan'
                        ? '方案审核'
                        : selectedStageId === 'pronunciation-review'
                        ? '发音审核'
                        : selectedStageId === 'voice-final'
                          ? '听审'
                          : selectedStageId === 'subtitle-review'
                            ? '字幕审校'
                            : selectedStageId === 'screen-text-review'
                              ? '文字复核'
                              : '审片')
                      : tab === 'probe'
                        ? '样片审片'
                      : tab === 'library'
                        ? '高级配方库'
                      : tab === 'override'
                        ? '画面微调'
                      : tab === 'layout'
                        ? '图解布局'
                      : tab === 'feedback'
                          ? '动效复盘'
                        : tab === 'config'
                          ? '配置'
                          : tab === 'artifact'
                            ? '产物'
                            : '开源复用'}
                  </button>
                ))}
              </div>

              {inspectorTab === 'review' && selectedStageId === 'visual-plan' && (
                <VisualPlanReview review={visualPlanReview} />
              )}

              {inspectorTab === 'layout' && selectedStageId === 'diagram-assets' && (
                <div className="inspector-body graph-layout-panel">
                  {graphLayoutLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载 Graph IR 布局</div>}
                  {!graphLayoutLoading && graphLayoutError && (
                    <div className="artifact-empty">
                      <AlertTriangle aria-hidden="true" />
                      <span>图解布局暂不可读取。</span>
                      <small>{graphLayoutError}</small>
                      <button type="button" className="button secondary" onClick={() => loadGraphLayoutEditor(project.id)}><RefreshCw aria-hidden="true" />重新加载</button>
                    </div>
                  )}
                  {!graphLayoutLoading && !graphLayoutError && graphLayoutEditor && !graphLayoutEditor.available && (
                    <div className="artifact-empty">
                      <GitBranch aria-hidden="true" />
                      <span>请先生成 ELK 布局产物。</span>
                      <small>{graphLayoutEditor.reason}</small>
                    </div>
                  )}
                  {!graphLayoutLoading && graphLayoutEditor?.available && selectedGraphDiagram && (
                    <>
                      <section className="graph-layout-summary">
                        <div>
                          <span className="eyebrow">Graph IR / Position Only</span>
                          <strong>{graphLayoutEditor.diagrams.length} 张可微调图解</strong>
                        </div>
                        <span className={`review-state ${graphLayoutDirty ? 'is-pending' : 'is-approved'}`}>{graphLayoutDirty ? '未保存' : `已保存 r${graphLayoutEditor.revision}`}</span>
                      </section>
                      <label className="field-label">当前图解
                        <select className="select-control" value={selectedGraphId} disabled={graphLayoutDirty} onChange={(event) => selectGraphDiagram(event.target.value)}>
                          {graphLayoutEditor.diagrams.map((diagram) => (
                            <option key={diagram.graphId} value={diagram.graphId}>{diagram.sceneId || diagram.beatId} · {diagram.nodes.length} 节点 / {diagram.edges.length} 连线</option>
                          ))}
                        </select>
                        {graphLayoutDirty && <span className="muted-copy">先保存或恢复当前图，再切换其他图解。</span>}
                      </label>
                      <div className="graph-layout-canvas" aria-label={`${selectedGraphId} 图解布局编辑器`}>
                        <ReactFlow
                          key={`${graphLayoutEditor.artifactSha256}-${selectedGraphId}`}
                          nodes={graphLayoutNodes}
                          edges={graphLayoutEdges}
                          nodeTypes={nodeTypes}
                          onNodesChange={(changes) => {
                            const positionChanged = changes.some((change) => change.type === 'position' && change.position);
                            setGraphLayoutNodes((current) => applyNodeChanges(changes, current));
                            if (positionChanged) setGraphLayoutDirty(true);
                          }}
                          fitView
                          fitViewOptions={{padding: 0.2}}
                          minZoom={0.35}
                          maxZoom={1.8}
                          nodesConnectable={false}
                          nodesFocusable
                          elementsSelectable
                          deleteKeyCode={null}
                        >
                          <Background gap={20} size={1} color="#d1d8d3" />
                          <Controls showInteractive={false} />
                        </ReactFlow>
                      </div>
                      <div className="graph-layout-readonly">
                        <ShieldCheck aria-hidden="true" />
                        <span>只允许拖动节点。文案、节点 ID、连线方向和 Graph IR 事实结构均为只读。</span>
                      </div>
                      <label className="field-label">调整原因
                        <input className="text-control" value={graphLayoutReason} onChange={(event) => setGraphLayoutReason(event.target.value)} />
                      </label>
                      <div className="graph-layout-actions">
                        <button type="button" className="button secondary" onClick={resetGraphLayoutDraft} disabled={busy || !graphLayoutDirty}><Undo2 aria-hidden="true" />恢复已保存位置</button>
                        <button type="button" className="button primary" onClick={saveGraphLayout} disabled={busy || !graphLayoutDirty || selectedStage.status === 'running'}><Save aria-hidden="true" />保存布局微调</button>
                      </div>
                      <div className="impact-summary">
                        <strong>保存后的影响</strong>
                        <span>当前图的布局 artifact 会增加 revision 并归档旧版；风格探针、全片编译、QA、Studio 与交付进入“需重算”，Graph IR 和音频不变。</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'probe' && selectedStageId === 'style-probe' && (
                <ProjectStyleProbeReview
                  projectId={project.id}
                  probe={projectStyleProbe}
                  loading={projectStyleProbeLoading}
                  error={projectStyleProbeError}
                  stageStatus={selectedStage.status}
                  reload={() => loadProjectStyleProbe(project.id)}
                />
              )}

              {inspectorTab === 'library' && selectedStageId === 'style-probe' && (
                <div className="inspector-body audio-review-panel motion-probe-panel">
                  {motionProbesLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载本地动效探针</div>}
                  {!motionProbesLoading && motionProbesError && (
                    <div className="artifact-empty motion-probe-empty">
                      <AlertTriangle aria-hidden="true" />
                      <span>探针目录暂不可读取。</span>
                      <small>{motionProbesError}</small>
                      <button type="button" className="button secondary" onClick={loadMotionProbes}><RefreshCw aria-hidden="true" />重新扫描</button>
                    </div>
                  )}
                  {!motionProbesLoading && !motionProbesError && motionReadiness && (
                    <section className="audio-review-section motion-readiness-section">
                      <div className="section-heading">
                        <div><span className="eyebrow">动效库生命周期</span><strong>8 个配方的真实就绪状态</strong></div>
                        <span className={`review-state ${motionReadiness.contract?.valid ? 'is-approved' : 'is-failed'}`}>{motionReadiness.contract?.valid ? '合同有效' : '合同阻断'}</span>
                      </div>
                      <div className="motion-readiness-metrics">
                        <div><span>配方</span><strong>{motionReadiness.summary.recipeCount}</strong></div>
                        <div><span>技术探针</span><strong>{motionReadiness.summary.canonicalProbeReadyCount}/{motionReadiness.summary.recipeCount}</strong></div>
                        <div><span>真人审片</span><strong>{motionReadiness.summary.currentHumanReviewedCount}/{motionReadiness.summary.recipeCount}</strong></div>
                        <div><span>可进生产</span><strong>{motionReadiness.summary.productionEligibleCount}/{motionReadiness.summary.recipeCount}</strong></div>
                      </div>
                      {!motionReadiness.contract?.valid && (
                        <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>配方定义、生命周期台账或官方来源绑定不一致；所有生产资格已失败关闭，请先修复合同。</span></div>
                      )}
                      <div className="motion-recipe-readiness-list">
                        {motionReadiness.recipes.map((recipe) => {
                          const probeId = recipe.technicalProbeIds[0] || recipe.probeIds[0] || '';
                          return (
                            <div className={`motion-recipe-readiness-row${recipe.recipeId === selectedMotionProbe?.recipeId ? ' is-selected' : ''}`} key={recipe.recipeId}>
                              <div className="motion-recipe-readiness-title">
                                <strong>{recipe.recipeId}</strong>
                                <span className={`review-state ${recipe.productionEligible ? 'is-approved' : recipe.contractValid ? '' : 'is-failed'}`}>{MOTION_LIFECYCLE_STATE_LABELS[recipe.state] || recipe.state}</span>
                              </div>
                              <div className="motion-recipe-readiness-evidence">
                                <span>技术 {recipe.technicalProbeIds.length ? '已就绪' : '未就绪'}</span>
                                <span>人审 {recipe.currentHumanPassedProbeIds.length ? '已完成' : '未完成'}</span>
                                <span>项目 {recipe.projectApprovals.length}</span>
                              </div>
                              <small>{MOTION_NEXT_ACTION_LABELS[recipe.nextAction] || recipe.nextAction}</small>
                              {probeId && (
                                <button type="button" className="icon-button" aria-label={`打开 ${recipe.recipeId} 探针`} title={`打开 ${recipe.recipeId} 探针`} onClick={() => setSelectedMotionProbeId(probeId)}>
                                  <ChevronRight aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {!motionProbesLoading && !motionProbesError && !motionProbes.length && (
                    <div className="artifact-empty motion-probe-empty">
                      <FileText aria-hidden="true" />
                      <span>本地还没有可识别的动效探针。</span>
                    </div>
                  )}
                  {!motionProbesLoading && selectedMotionProbe && motionProbeDraft && (
                    <>
                      <section className="audio-review-section motion-probe-summary">
                        <div className="probe-select-row">
                          <label className="field-label">待审探针
                            <select className="select-control" value={selectedMotionProbeId} onChange={(event) => setSelectedMotionProbeId(event.target.value)}>
                              {motionProbes.map((probe) => <option value={probe.id} key={probe.id}>{probe.recipeId}@{probe.recipeVersion} · {probe.id}</option>)}
                            </select>
                          </label>
                          <button type="button" className="icon-button" aria-label="重新扫描探针目录" title="重新扫描探针目录" onClick={loadMotionProbes} disabled={motionProbesLoading}><RefreshCw aria-hidden="true" /></button>
                        </div>
                        <div className="section-heading">
                          <div><span className="eyebrow">{selectedMotionProbe.recipeId}@{selectedMotionProbe.recipeVersion}</span><strong>{selectedMotionProbe.title}</strong></div>
                          <span className={`review-state ${selectedMotionProbe.review?.decision === 'passed' ? 'is-approved' : selectedMotionProbe.review?.decision === 'failed' ? 'is-failed' : ''}`}>
                            {MOTION_PROBE_DECISION_LABELS[selectedMotionProbe.review?.decision || 'pending']}
                          </span>
                        </div>
                        <dl className="audio-facts probe-facts">
                          <div><dt>生命周期</dt><dd>{selectedMotionProbe.status}，未自动晋级</dd></div>
                          <div><dt>证据格式</dt><dd>{selectedMotionProbe.canonicalEvidence ? '正式生命周期证据' : '早期探针回执'}</dd></div>
                          <div><dt>时长</dt><dd>{selectedMotionProbe.durationSeconds ?? '--'} 秒</dd></div>
                          <div><dt>审片版本</dt><dd>r{selectedMotionProbe.reviewRevision || 0}</dd></div>
                        </dl>
                        {selectedMotionProbe.videoReady ? (
                          <video
                            key={`${selectedMotionProbe.id}-${selectedMotionProbe.bindings?.video?.sha256}`}
                            className="motion-probe-video"
                            controls
                            playsInline
                            preload="metadata"
                            src={motionProbeFileUrl(selectedMotionProbe, selectedMotionProbe.videoPath)}
                          />
                        ) : <div className="probe-missing"><AlertTriangle aria-hidden="true" /><span>探针 MP4 尚未生成。</span></div>}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">关键帧联系表</span><strong>起始、交接与结尾状态</strong></div><span>{selectedMotionProbe.contactSheetReady ? '已绑定哈希' : '缺失'}</span></div>
                        {selectedMotionProbe.contactSheetReady
                          ? <a className="motion-probe-contact-link" href={motionProbeFileUrl(selectedMotionProbe, selectedMotionProbe.contactSheetPath)} target="_blank" rel="noreferrer"><img className="motion-probe-contact" src={motionProbeFileUrl(selectedMotionProbe, selectedMotionProbe.contactSheetPath)} alt={`${selectedMotionProbe.recipeId} 探针关键帧联系表`} /></a>
                          : <div className="probe-missing"><AlertTriangle aria-hidden="true" /><span>关键帧联系表尚未生成。</span></div>}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">自动门禁</span><strong>进入人工审片前的技术证据</strong></div><span className={`review-state ${selectedMotionProbe.technicalReady ? 'is-approved' : 'is-failed'}`}>{selectedMotionProbe.technicalReady ? '技术就绪' : '技术未就绪'}</span></div>
                        <div className="probe-technical-grid">
                          <div><span>HyperFrames strict check</span><strong>{selectedMotionProbe.strictCheck?.ok === true ? '通过' : '未通过'}</strong></div>
                          <div><span>品牌壳不变量</span><strong>{selectedMotionProbe.invariantAudit?.passed === true ? '通过' : '未通过'}</strong></div>
                          <div><span>官方复用来源</span><strong>{selectedMotionProbe.officialReuse.length} 项</strong></div>
                        </div>
                        {selectedMotionProbe.officialReuse.length > 0 && <div className="probe-source-list">{selectedMotionProbe.officialReuse.map((item, index) => <code key={`${motionProbeReuseLabel(item)}-${index}`}>{motionProbeReuseLabel(item)}</code>)}</div>}
                        {!selectedMotionProbe.canonicalEvidence && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>早期格式只保存独立人工回执，不会伪装成正式生命周期证据。</span></div>}
                        {selectedMotionProbe.reviewStale && <div className="receipt-lock"><RefreshCw aria-hidden="true" /><span>探针文件或配方定义已变化，上一版人工结论已自动失效，请重新完整审片。</span></div>}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">人工视觉检查</span><strong>固定品牌壳与内容动效</strong></div><span>{MOTION_PROBE_CHECKLIST.filter(([key]) => motionProbeDraft.checks[key]).length}/{MOTION_PROBE_CHECKLIST.length}</span></div>
                        <div className="listening-checks probe-checks">
                          {MOTION_PROBE_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="review-check">
                              <input type="checkbox" checked={motionProbeDraft.checks[key]} onChange={(event) => setMotionProbeDraft((current) => ({...current, checks: {...current.checks, [key]: event.target.checked}}))} />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">审片结论</span><strong>只记录人工判断</strong></div><span>{MOTION_PROBE_DECISION_LABELS[motionProbeDraft.decision]}</span></div>
                        <div className="mode-control three" role="group" aria-label="探针审片结论">
                          {Object.entries(MOTION_PROBE_DECISION_LABELS).map(([value, label]) => (
                            <button key={value} type="button" aria-pressed={motionProbeDraft.decision === value} disabled={value === 'passed' && (!selectedMotionProbe.technicalReady || !motionProbeAllChecksPassed)} onClick={() => setMotionProbeDraft((current) => ({...current, decision: value}))}>{label}</button>
                          ))}
                        </div>
                        <label className="field-label">复盘备注
                          <textarea className="text-control textarea-small" value={motionProbeDraft.notes} placeholder="退回时记录闪烁、跳帧、文字、人物稳定性、镜头或节奏问题。" onChange={(event) => setMotionProbeDraft((current) => ({...current, notes: event.target.value}))} />
                        </label>
                        {motionProbeDraft.decision === 'passed' && !motionProbeAllChecksPassed && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>九项检查全部确认后才能提交人工通过。</span></div>}
                        {motionProbeDraft.decision === 'failed' && motionProbeDraft.notes.trim().length < 2 && <div className="receipt-lock"><Pencil aria-hidden="true" /><span>退回重做必须留下可执行的问题说明。</span></div>}
                        <div className="impact-summary"><strong>固定约束</strong><span>Q版人物、#F2DFC7 背景、host.left、content.right 和 caption 不因动效探针而改变。</span><span>保存审片不会执行 lifecycle apply，也不会把候选配方自动放进批量生产。</span></div>
                        <button type="button" className="button primary block" onClick={saveMotionProbeHumanReview} disabled={busy || !canSaveMotionProbeReview}><Save aria-hidden="true" />保存版本化探针审片</button>
                        <div className="audio-review-actions">
                          <button type="button" className="button approve" onClick={acceptMotionProbeIntoLifecycle} disabled={busy || !canAcceptMotionProbeLifecycle}><Check aria-hidden="true" />验收为可用动效探针</button>
                          <button type="button" className="button secondary" onClick={approveMotionRecipeForCurrentProject} disabled={busy || !canApproveMotionRecipeForProject}><Check aria-hidden="true" />批准用于当前正式项目</button>
                        </div>
                        {selectedMotionProbe.status === 'candidate' && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>人工通过后仍需点击“验收为可用动效探针”，系统会重新验证所有文件哈希、品牌壳、HyperFrames 检查和官方复用证据。</span></div>}
                        {['probe-passed', 'approved-project'].includes(selectedMotionProbe.status) && <div className="receipt-lock"><Check aria-hidden="true" /><span>探针已通过库级验收；仍需单独批准当前项目，才会在正式制作候选中可用。</span></div>}
                      </section>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'review' && selectedStageId === 'pronunciation-review' && (
                <div className="inspector-body audio-review-panel pronunciation-review-panel">
                  {pronunciationReviewLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载本地发音候选</div>}
                  {!pronunciationReviewLoading && pronunciationReviewError && (
                    <div className="artifact-empty">
                      <AlertTriangle aria-hidden="true" />
                      <span>发音候选暂不可读取。</span>
                      <small>{pronunciationReviewError}</small>
                      <button type="button" className="button secondary" onClick={() => loadPronunciationReview(project.id)}><RefreshCw aria-hidden="true" />重新读取</button>
                    </div>
                  )}
                  {!pronunciationReviewLoading && pronunciationReview && pronunciationReviewDraft && (
                    <>
                      <section className="audio-review-section audio-review-summary">
                        <div className="section-heading">
                          <div><span className="eyebrow">中英混读上下文探针</span><strong>{pronunciationReview.review.terms.length} 个主观术语</strong></div>
                          <span className={`review-state ${reviewStateClass(pronunciationReview.review.status)}`}>{reviewStateLabel(pronunciationReview.review.status)}</span>
                        </div>
                        <dl className="audio-facts text-review-bindings">
                          <div><dt>生成词表</dt><dd><code title={pronunciationReview.generatedGuide?.sha256}>{pronunciationReview.generatedGuide?.sha256?.slice(0, 18) || '缺失'}</code></dd></div>
                          <div><dt>候选清单</dt><dd><code title={pronunciationReview.probeManifest?.sha256}>{pronunciationReview.probeManifest?.sha256?.slice(0, 18) || '缺失'}</code></dd></div>
                          <div><dt>输入方式</dt><dd>本地 WAV 文件，不调用麦克风</dd></div>
                        </dl>
                        <div className="review-progress-strip" aria-label="发音审核总进度">
                          <span>已选 {pronunciationReviewStats.selected}/{pronunciationReviewStats.terms}</span>
                          <span>已听 {pronunciationReviewStats.played}/{pronunciationReviewStats.candidates}</span>
                          <span className="is-accepted">通过 {pronunciationReviewStats.accepted}/{pronunciationReviewStats.terms}</span>
                        </div>
                        <div className="receipt-lock"><ShieldCheck aria-hidden="true" /><span>候选不会自动播放；只有手动播放到文件结尾才记录“已听完”。本步骤没有录音或麦克风入口。</span></div>
                        {pronunciationReview.approval?.approvalScope === 'user-directed-selection-no-listening' && (
                          <div className="receipt-lock"><Check aria-hidden="true" /><span>已按当前 {pronunciationReviewStats.terms} 项选择推进；试听记录保留为 {pronunciationReview.approval.humanListening?.playedCandidateCount}/{pronunciationReview.approval.humanListening?.candidateCount}，未试听候选没有记为已听，公开发布仍受阻。</span></div>
                        )}
                        {pronunciationReview.review.status === 'stale' && <div className="receipt-lock"><RefreshCw aria-hidden="true" /><span>NarrationLock、生成词表或候选文件已变化，旧选择已失效。请重新生成本步骤。</span></div>}
                        {pronunciationReviewApproved && pronunciationReview.review.terms.length === 0 && <div className="impact-summary"><strong>无需人工候选</strong><span>当前只包含明确逐字母朗读的缩写，系统已生成哈希绑定的 machine-no-subjective-terms 回执。</span></div>}
                      </section>

                      {pronunciationReview.review.terms.map((term, termIndex) => {
                        const draft = pronunciationReviewDraft.terms[termIndex];
                        const allPlayed = term.candidates.every((candidate) => draft?.playedCandidateIds?.includes(candidate.id));
                        const candidateIds = term.candidates.map((candidate) => candidate.id);
                        return (
                          <section className="audio-review-section pronunciation-term" key={term.token}>
                            <div className="section-heading">
                              <div><span className="eyebrow">{term.kind} · {term.locale}</span><strong>{term.token}</strong></div>
                              <span>{draft?.playedCandidateIds?.length || 0}/{term.candidates.length} 已听完</span>
                            </div>
                            {(term.targetIpa || term.targetCmu) && <div className="term-pronunciation-target"><span>IPA {term.targetIpa || '未登记'}</span><span>CMU {term.targetCmu || '未登记'}</span></div>}
                            <blockquote className="pronunciation-context">{term.contextText}</blockquote>
                            <div className="pronunciation-candidates">
                              {term.candidates.map((candidate) => {
                                const played = draft?.playedCandidateIds?.includes(candidate.id);
                                const selected = draft?.selectedCandidateId === candidate.id;
                                return (
                                  <article className={`pronunciation-candidate${played ? ' is-played' : ''}${selected ? ' is-selected' : ''}`} key={candidate.id}>
                                    <div className="candidate-heading"><strong>{candidate.label}</strong><span>{played ? '已听完' : '待完整播放'}</span></div>
                                    <small>送入 TTS：{candidate.ttsText}</small>
                                    <audio
                                      className="review-audio"
                                      controls
                                      preload="none"
                                      src={candidate.audioUrl}
                                      onEnded={() => setPronunciationReviewDraft((current) => current ? ({
                                        ...current,
                                        terms: current.terms.map((item, index) => index === termIndex
                                          ? markPronunciationCandidatePlayed(item, candidate.id, candidateIds)
                                          : item),
                                      }) : current)}
                                    />
                                    <label className="candidate-select">
                                      <input
                                        type="radio"
                                        name={`pronunciation-${term.token}`}
                                        checked={selected}
                                        disabled={pronunciationReviewApproved}
                                        onChange={() => setPronunciationReviewDraft((current) => ({
                                          ...current,
                                          terms: current.terms.map((item, index) => index === termIndex
                                            ? selectPronunciationCandidate(item, candidate.id, candidateIds)
                                            : item),
                                        }))}
                                      />
                                      <span>选择这个读法</span>
                                    </label>
                                  </article>
                                );
                              })}
                            </div>
                            <div className="field-label">
                              <span>当前结论</span>
                              <div className="pronunciation-decision-row">
                                <span className={`review-state ${draft?.decision === 'accepted' ? 'is-approved' : draft?.decision === 'retake' ? 'is-failed' : ''}`}>
                                  {draft?.decision === 'accepted' ? '已接受所选读法' : draft?.decision === 'retake' ? '候选需要重做' : allPlayed ? '请选择一个读法' : '听完全部候选后自动通过'}
                                </span>
                                <button
                                  type="button"
                                  className="button secondary"
                                  disabled={pronunciationReviewApproved}
                                  onClick={() => setPronunciationReviewDraft((current) => ({
                                    ...current,
                                    terms: current.terms.map((item, index) => index === termIndex ? ({
                                      ...item,
                                      decision: item.decision === 'retake' ? 'pending' : 'retake',
                                    }) : item),
                                  }))}
                                >
                                  {draft?.decision === 'retake' ? <RotateCcw aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                                  {draft?.decision === 'retake' ? '取消重做' : '候选需要重做'}
                                </button>
                              </div>
                            </div>
                            <label className="field-label">备注或重做要求
                              <input
                                className="text-control"
                                value={draft?.note || ''}
                                disabled={pronunciationReviewApproved}
                                placeholder={draft?.decision === 'retake' ? '必须说明发音、停顿或上下文问题' : '可选备注'}
                                onChange={(event) => setPronunciationReviewDraft((current) => ({
                                  ...current,
                                  terms: current.terms.map((item, index) => index === termIndex ? {...item, note: event.target.value} : item),
                                }))}
                              />
                            </label>
                          </section>
                        );
                      })}

                      {!pronunciationReviewApproved && pronunciationReview.review.terms.length > 0 && (
                        <>
                          <label className="field-label">整体审核备注<textarea className="text-control textarea-small" value={pronunciationReviewDraft.notes} onChange={(event) => setPronunciationReviewDraft((current) => ({...current, notes: event.target.value}))} /></label>
                          {!pronunciationRetakeNotesReady(pronunciationReviewDraft) && <div className="receipt-lock"><Pencil aria-hidden="true" /><span>要求重做的术语必须填写可执行的问题说明。</span></div>}
                          {!pronunciationDraftReady(pronunciationReviewDraft, pronunciationReview) && <div className="receipt-lock"><Headphones aria-hidden="true" /><span>每个候选都必须手动播放到结尾；选中读法后，系统会在该术语全部听完时自动通过。</span></div>}
                          {canApprovePronunciationSelection && !canApprovePronunciationReview && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>41 项读法都已选择。可按当前选择继续；未听的候选会如实登记为跳过，不能冒充完整听审。</span></div>}
                          <div className="audio-review-actions">
                            <button type="button" className="button secondary" onClick={savePronunciationReview} disabled={busy || !canSavePronunciationReview}><Save aria-hidden="true" />保存审核进度</button>
                            <button type="button" className="button approve" onClick={approvePronunciationReview} disabled={busy || !canApprovePronunciationReview}><Check aria-hidden="true" />冻结本项目发音表</button>
                            <button type="button" className="button approve" onClick={approvePronunciationSelection} disabled={busy || !canApprovePronunciationSelection || canApprovePronunciationReview}><ChevronRight aria-hidden="true" />按当前 {pronunciationReviewStats.terms} 项选择继续</button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'review' && selectedStageId === 'subtitle-review' && (
                <div className="inspector-body audio-review-panel text-review-panel">
                  {subtitleReviewLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载字幕审校清单</div>}
                  {!subtitleReviewLoading && subtitleReviewError && (
                    <div className="artifact-empty text-review-empty">
                      <AlertTriangle aria-hidden="true" />
                      <span>字幕审校材料暂不可用。</span>
                      <small>{subtitleReviewError}</small>
                      <button type="button" className="button secondary" onClick={() => loadSubtitleReview(project.id)}><RefreshCw aria-hidden="true" />重新加载</button>
                    </div>
                  )}
                  {!subtitleReviewLoading && subtitleReview && subtitleReviewDraft && (
                    <>
                      <section className="audio-review-section audio-review-summary">
                        <div className="section-heading">
                          <div><span className="eyebrow">字幕语义人工审校</span><strong>{subtitleReview.review.cues.length} 条当前字幕</strong></div>
                          <span className={`review-state ${reviewStateClass(subtitleReview.review.status)}`}>{reviewStateLabel(subtitleReview.review.status)}</span>
                        </div>
                        <dl className="audio-facts text-review-bindings">
                          <div><dt>字幕 QA</dt><dd><code title={subtitleReview.bindings?.subtitleQa?.sha256}>{subtitleReview.bindings?.subtitleQa?.sha256?.slice(0, 18) || '缺失'}</code></dd></div>
                          <div><dt>Alignment</dt><dd><code title={subtitleReview.bindings?.alignment?.sha256}>{subtitleReview.bindings?.alignment?.sha256?.slice(0, 18) || '缺失'}</code></dd></div>
                          <div><dt>SRT</dt><dd><code title={subtitleReview.bindings?.srt?.sha256}>{subtitleReview.bindings?.srt?.sha256?.slice(0, 18) || '缺失'}</code></dd></div>
                        </dl>
                        <div className="review-progress-strip" aria-label="字幕审校进度">
                          <span className="is-accepted">通过 {subtitleCueStats.accepted}</span>
                          <span className="is-revise">退回 {subtitleCueStats.revise}</span>
                          <span>待确认 {subtitleCueStats.pending}</span>
                        </div>
                        {subtitleReview.review.status === 'stale' && <div className="receipt-lock"><RefreshCw aria-hidden="true" /><span>SRT、alignment 或机器 QA 已变化，旧审校结论已失效。请重新生成本步骤后逐条复核。</span></div>}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">整体检查</span><strong>五项人工确认</strong></div><span>{SUBTITLE_REVIEW_CHECKLIST.filter(([key]) => subtitleReviewDraft.checklist[key]).length}/{SUBTITLE_REVIEW_CHECKLIST.length}</span></div>
                        <div className="listening-checks">
                          {SUBTITLE_REVIEW_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="review-check">
                              <input
                                type="checkbox"
                                checked={subtitleReviewDraft.checklist[key]}
                                disabled={subtitleReviewApproved}
                                onChange={(event) => setSubtitleReviewDraft((current) => ({...current, checklist: {...current.checklist, [key]: event.target.checked}}))}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">逐条字幕</span><strong>每条必须明确判断</strong></div><span>{subtitleCueStats.accepted}/{subtitleReviewDraft.cues.length}</span></div>
                        <div className="text-review-list">
                          {subtitleReview.review.cues.map((cue, index) => {
                            const draft = subtitleReviewDraft.cues[index];
                            return (
                              <article className={`text-review-row decision-${draft?.decision || 'pending'}`} key={cue.id}>
                                <div className="text-review-row-heading">
                                  <strong>{cue.id}</strong>
                                  <time>{formatCueTime(cue.start)} - {formatCueTime(cue.end)}</time>
                                </div>
                                <p className="subtitle-review-text">{cue.text}</p>
                                <label className="field-label">审校结论
                                  <select
                                    className="select-control"
                                    value={draft?.decision || 'pending'}
                                    disabled={subtitleReviewApproved}
                                    onChange={(event) => setSubtitleReviewDraft((current) => ({
                                      ...current,
                                      cues: current.cues.map((item, itemIndex) => itemIndex === index ? {...item, decision: event.target.value} : item),
                                    }))}
                                  >
                                    {Object.entries(TEXT_REVIEW_DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                  </select>
                                </label>
                                <label className="field-label">问题或修改要求
                                  <input
                                    className="text-control"
                                    value={draft?.note || ''}
                                    disabled={subtitleReviewApproved}
                                    placeholder={draft?.decision === 'revise' ? '退回修改必须填写具体原因' : '可选备注'}
                                    onChange={(event) => setSubtitleReviewDraft((current) => ({
                                      ...current,
                                      cues: current.cues.map((item, itemIndex) => itemIndex === index ? {...item, note: event.target.value} : item),
                                    }))}
                                  />
                                </label>
                              </article>
                            );
                          })}
                        </div>
                      </section>

                      <label className="field-label">整体审校备注<textarea className="text-control textarea-small" value={subtitleReviewDraft.notes} disabled={subtitleReviewApproved} onChange={(event) => setSubtitleReviewDraft((current) => ({...current, notes: event.target.value}))} /></label>
                      {!subtitleReviewApproved && !revisionNotesReady(subtitleReviewDraft.cues) && <div className="receipt-lock"><Pencil aria-hidden="true" /><span>退回修改的字幕必须填写可执行的问题说明。</span></div>}
                      {!subtitleReviewApproved && !subtitleReviewDraftReady(subtitleReviewDraft) && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>五项检查和每条字幕都通过后才能批准；系统不提供一键全部通过。</span></div>}
                      {subtitleCueStats.revise > 0 && <button type="button" className="button secondary block" onClick={() => setSelectedStageId('audio-align')}><RotateCcw aria-hidden="true" />返回字幕时间戳步骤处理</button>}
                      <div className="audio-review-actions">
                        <button type="button" className="button secondary" onClick={saveSubtitleReview} disabled={busy || !canSaveSubtitleReview}><Save aria-hidden="true" />保存审校进度</button>
                        <button type="button" className="button approve" onClick={approveSubtitleReview} disabled={busy || !canApproveSubtitleReview}><Check aria-hidden="true" />批准字幕语义审校</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'review' && selectedStageId === 'screen-text-review' && (
                <div className="inspector-body audio-review-panel text-review-panel">
                  {screenTextReviewLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载画面文字抽帧</div>}
                  {!screenTextReviewLoading && screenTextReviewError && (
                    <div className="artifact-empty text-review-empty">
                      <AlertTriangle aria-hidden="true" />
                      <span>画面文字复核材料暂不可用。</span>
                      <small>{screenTextReviewError}</small>
                      <button type="button" className="button secondary" onClick={() => loadScreenTextReview(project.id)}><RefreshCw aria-hidden="true" />重新加载</button>
                    </div>
                  )}
                  {!screenTextReviewLoading && screenTextReview?.available === false && (
                    <div className="artifact-empty text-review-empty text-review-blocked">
                      <ShieldCheck aria-hidden="true" />
                      <span>成片屏幕文字复核尚未到达。</span>
                      <small>{screenTextReview.summary}</small>
                      <ul className="review-blocker-list">
                        {screenTextReview.blockers.map((blocker) => (
                          <li key={blocker.code}><strong>{blocker.label}</strong><span>{blocker.action}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!screenTextReviewLoading && screenTextReview && screenTextReviewDraft && (
                    <>
                      <section className="audio-review-section audio-review-summary">
                        <div className="section-heading">
                          <div><span className="eyebrow">成片屏幕文字复核</span><strong>{screenTextReview.review.frames.length} 张当前抽帧</strong></div>
                          <span className={`review-state ${reviewStateClass(screenTextReview.review.status)}`}>{reviewStateLabel(screenTextReview.review.status)}</span>
                        </div>
                        <dl className="audio-facts text-review-bindings">
                          <div><dt>Composition</dt><dd><code title={screenTextReview.composition?.digest}>{screenTextReview.composition?.digest?.slice(0, 18) || '缺失'}</code></dd></div>
                          <div><dt>文件数</dt><dd>{screenTextReview.composition?.fileCount ?? '缺失'}</dd></div>
                          <div><dt>OCR</dt><dd>{screenTextReview.ocr?.available
                            ? `${screenTextReview.ocr.engine?.name || 'OCR'} ${screenTextReview.ocr.engine?.version || ''} · 当前有效`
                            : screenTextReview.ocr?.status === 'unresolved'
                              ? `有 ${screenTextReview.ocr.unresolvedCount ?? '待处理'} 张未解决，保持人工模式`
                              : screenTextReview.ocr?.status === 'unavailable'
                                ? '本机引擎不可用，保持人工模式'
                                : '报告与当前成片不匹配，需重新运行'}</dd></div>
                        </dl>
                        <div className="review-progress-strip" aria-label="画面文字复核进度">
                          <span className="is-accepted">通过 {screenFrameStats.accepted}</span>
                          <span className="is-revise">退回 {screenFrameStats.revise}</span>
                          <span>待确认 {screenFrameStats.pending}</span>
                        </div>
                        {screenTextReview.review.status === 'stale' && <div className="receipt-lock"><RefreshCw aria-hidden="true" /><span>Composition、检查回执、字幕批准或抽帧已变化，旧结论已失效。请重新生成本步骤。</span></div>}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">复核依据</span><strong>人工逐帧始终必需</strong></div><span>{screenTextReviewDraft.reviewMode === 'ocr-assisted' ? 'OCR 辅助' : '人工模式'}</span></div>
                        <div className="mode-control" role="group" aria-label="画面文字复核模式">
                          <button type="button" aria-pressed={screenTextReviewDraft.reviewMode === 'manual'} disabled={screenTextReviewApproved} onClick={() => setScreenTextReviewDraft((current) => ({...current, reviewMode: 'manual'}))}>人工逐帧</button>
                          <button type="button" aria-pressed={screenTextReviewDraft.reviewMode === 'ocr-assisted'} disabled={screenTextReviewApproved || !screenTextReview.ocr?.available} onClick={() => setScreenTextReviewDraft((current) => ({...current, reviewMode: 'ocr-assisted'}))}>OCR 报告 + 人工</button>
                        </div>
                        <button type="button" className="button secondary block" onClick={rerunScreenOcr} disabled={busy || screenTextReviewApproved}><RefreshCw aria-hidden="true" />重新运行 OCR</button>
                        {screenTextReviewDraft.reviewMode === 'manual'
                          ? <div className="receipt-lock"><ShieldCheck aria-hidden="true" /><span>本次批准只证明人工逐帧复核完成；即使存在 OCR 报告，回执也不会把它写成 OCR 辅助批准。</span></div>
                          : <div className="impact-summary"><strong>OCR 仅作辅助</strong><span>OCR 状态和哈希由服务端回执提供；仍需人工检查遮挡、对比度、裁切和动态终态。</span></div>}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">整体检查</span><strong>七项人工确认</strong></div><span>{SCREEN_TEXT_REVIEW_CHECKLIST.filter(([key]) => screenTextReviewDraft.checklist[key]).length}/{SCREEN_TEXT_REVIEW_CHECKLIST.length}</span></div>
                        <div className="listening-checks">
                          {SCREEN_TEXT_REVIEW_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="review-check">
                              <input
                                type="checkbox"
                                checked={screenTextReviewDraft.checklist[key]}
                                disabled={screenTextReviewApproved}
                                onChange={(event) => setScreenTextReviewDraft((current) => ({...current, checklist: {...current.checklist, [key]: event.target.checked}}))}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">逐帧检查</span><strong>查看原图后逐张判断</strong></div><span>{screenFrameStats.accepted}/{screenTextReviewDraft.frames.length}</span></div>
                        <div className="screen-text-frame-list">
                          {screenTextReview.review.frames.map((frame, index) => {
                            const draft = screenTextReviewDraft.frames[index];
                            return (
                              <article className={`screen-text-frame decision-${draft?.decision || 'pending'}`} key={frame.id}>
                                <a href={frame.imageUrl} target="_blank" rel="noreferrer" className="screen-text-frame-preview" title="打开原始抽帧">
                                  <img src={frame.imageUrl} alt={`${frame.id} 屏幕文字复核抽帧`} loading="lazy" />
                                </a>
                                <div className="text-review-row-heading">
                                  <strong>{frame.id}</strong>
                                  <code title={frame.sha256}>{frame.sha256?.slice(0, 14)}</code>
                                </div>
                                <small className="frame-path" title={frame.path}>{frame.path}</small>
                                <label className="field-label">复核结论
                                  <select
                                    className="select-control"
                                    value={draft?.decision || 'pending'}
                                    disabled={screenTextReviewApproved}
                                    onChange={(event) => setScreenTextReviewDraft((current) => ({
                                      ...current,
                                      frames: current.frames.map((item, itemIndex) => itemIndex === index ? {...item, decision: event.target.value} : item),
                                    }))}
                                  >
                                    {Object.entries(TEXT_REVIEW_DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                  </select>
                                </label>
                                <label className="field-label">问题或修改要求
                                  <input
                                    className="text-control"
                                    value={draft?.note || ''}
                                    disabled={screenTextReviewApproved}
                                    placeholder={draft?.decision === 'revise' ? '说明遮挡、错字、溢出或可读性问题' : '可选备注'}
                                    onChange={(event) => setScreenTextReviewDraft((current) => ({
                                      ...current,
                                      frames: current.frames.map((item, itemIndex) => itemIndex === index ? {...item, note: event.target.value} : item),
                                    }))}
                                  />
                                </label>
                              </article>
                            );
                          })}
                        </div>
                      </section>

                      <label className="field-label">整体复核备注<textarea className="text-control textarea-small" value={screenTextReviewDraft.notes} disabled={screenTextReviewApproved} onChange={(event) => setScreenTextReviewDraft((current) => ({...current, notes: event.target.value}))} /></label>
                      {!screenTextReviewApproved && !revisionNotesReady(screenTextReviewDraft.frames) && <div className="receipt-lock"><Pencil aria-hidden="true" /><span>退回修改的画面必须填写可执行的问题说明。</span></div>}
                      {!screenTextReviewApproved && !screenTextReviewDraftReady(screenTextReviewDraft, screenTextReview.ocr?.available) && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>七项检查和每张抽帧都通过后才能批准；系统不提供一键全部通过。</span></div>}
                      {screenFrameStats.revise > 0 && <button type="button" className="button secondary block" onClick={() => setSelectedStageId('full-production')}><SlidersHorizontal aria-hidden="true" />去画面微调处理</button>}
                      <div className="audio-review-actions">
                        <button type="button" className="button secondary" onClick={saveScreenTextReview} disabled={busy || !canSaveScreenTextReview}><Save aria-hidden="true" />保存复核进度</button>
                        <button type="button" className="button approve" onClick={approveScreenTextReview} disabled={busy || !canApproveScreenTextReview}><Check aria-hidden="true" />{screenTextReviewDraft.reviewMode === 'ocr-assisted' ? '批准 OCR + 人工复核' : '批准人工文字复核'}</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'review' && selectedStageId === 'final-preview' && (
                <div className="inspector-body audio-review-panel final-review-panel">
                  {finalReviewLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载审片合同</div>}
                  {!finalReviewLoading && finalReview && finalReviewDraft && (
                    <>
                      <section className="audio-review-section audio-review-summary">
                        <div className="section-heading">
                          <div><span className="eyebrow">HyperFrames 最终时间线</span><strong>{finalReview.composition.fileCount} 个文件</strong></div>
                          <span className={`review-state ${finalReviewApproved ? 'is-approved' : finalReview.review.status === 'ready-for-approval' ? 'is-ready' : ''}`}>
                            {finalReviewApproved ? '用户审片已批准' : finalReview.review.status === 'ready-for-approval' ? '可提交批准' : '审片进行中'}
                          </span>
                        </div>
                        <dl className="audio-facts">
                          <div><dt>摘要</dt><dd><code>{finalReview.composition.digest}</code></dd></div>
                          <div><dt>Studio</dt><dd>{selectedStage.previewStartedAt ? `已启动：${new Date(selectedStage.previewStartedAt).toLocaleString()}` : '尚未启动'}</dd></div>
                          <div><dt>交付范围</dt><dd>{project.publicationRights === 'cleared' ? '公开发布候选' : '仅内部审片，公开发布仍阻塞'}</dd></div>
                        </dl>
                        <button type="button" className="button primary block" onClick={startStudioPreview} disabled={busy}><Play aria-hidden="true" />启动并打开 Studio</button>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">全片检查</span><strong>五项人工确认</strong></div><span>{FINAL_REVIEW_CHECKLIST.filter(([key]) => finalReviewDraft.checklist[key]).length}/5</span></div>
                        <div className="listening-checks">
                          {FINAL_REVIEW_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="review-check">
                              <input
                                type="checkbox"
                                checked={finalReviewDraft.checklist[key]}
                                disabled={finalReviewApproved}
                                onChange={(event) => setFinalReviewDraft((current) => ({...current, checklist: {...current.checklist, [key]: event.target.checked}}))}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </section>

                      <label className="field-label">审片备注<textarea className="text-control textarea-small" value={finalReviewDraft.notes} disabled={finalReviewApproved} onChange={(event) => setFinalReviewDraft((current) => ({...current, notes: event.target.value}))} /></label>
                      {!finalReviewApproved && !selectedStage.previewStartedAt && <div className="receipt-lock"><Play aria-hidden="true" /><span>先启动 HyperFrames Studio，再完成整条时间线审片。</span></div>}
                      {!finalReviewApproved && !finalReviewDraftReady(finalReviewDraft) && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>五项检查全部完成后才能提交用户审片批准。</span></div>}
                      <div className="audio-review-actions">
                        <button type="button" className="button secondary" onClick={saveFinalReview} disabled={busy || finalReviewApproved}><Save aria-hidden="true" />保存审片进度</button>
                        <button type="button" className="button approve" onClick={approveFinalReview} disabled={busy || finalReviewApproved || !canApproveFinalReview}><Check aria-hidden="true" />批准用户全片审片</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'review' && selectedStageId === 'voice-final' && (
                <div className="inspector-body audio-review-panel">
                  {audioReviewLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载听审材料</div>}
                  {!audioReviewLoading && audioReview && audioReviewDraft && (
                    <>
                      <section className="audio-review-section audio-review-summary">
                        <div className="section-heading">
                          <div><span className="eyebrow">配音 A/B 候选</span><strong>{audioReview.candidates.length} 个本地 WAV</strong></div>
                          <span className={`review-state ${audioReviewApproved ? 'is-approved' : audioReview.review.status === 'ready-for-approval' ? 'is-ready' : ''}`}>
                            {audioReviewApproved ? '正式 WAV 已冻结' : audioReview.review.status === 'ready-for-approval' ? '可晋升候选' : 'A/B 听审进行中'}
                          </span>
                        </div>
                        <div className="receipt-lock"><ShieldCheck aria-hidden="true" /><span>候选生成不会覆盖现有正式音轨。页面不自动播放、不录音、不调用麦克风；每个本地文件必须手动播放到结尾后才记录为已听完。</span></div>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">候选文件</span><strong>逐个完整听完，再选一个新版候选</strong></div><span>{audioReviewDraft.playedCandidateIds.length}/{audioReview.candidates.length}</span></div>
                        <div className="voice-candidate-list">
                          {audioReview.candidates.map((candidate) => {
                            const played = audioReviewDraft.playedCandidateIds.includes(candidate.candidateId);
                            const selected = audioReviewDraft.selectedCandidateId === candidate.candidateId;
                            return (
                              <article className={`voice-candidate${played ? ' is-played' : ''}${selected ? ' is-selected' : ''}`} key={candidate.candidateId}>
                                <div className="candidate-heading">
                                  <div><strong>{candidate.role === 'baseline' ? 'A · 当前正式基线' : `B · ${candidate.candidateId}`}</strong><span>{formatDuration(candidate.durationSeconds)}</span></div>
                                  <span>{played ? '已听完' : '待完整播放'}</span>
                                </div>
                                <audio
                                  className="review-audio"
                                  controls
                                  preload="none"
                                  src={candidate.audioUrl}
                                  onEnded={() => setAudioReviewDraft((current) => current ? ({
                                    ...current,
                                    playedCandidateIds: [...new Set([...(current.playedCandidateIds || []), candidate.candidateId])],
                                  }) : current)}
                                />
                                <dl className="audio-facts compact">
                                  <div><dt>技术 QA</dt><dd>{candidate.integratedLufs ?? '--'} LUFS · {candidate.truePeakDbfs ?? '--'} dBFS</dd></div>
                                  <div><dt>SHA</dt><dd><code title={candidate.audioSha256}>{candidate.audioSha256.slice(0, 18)}</code></dd></div>
                                </dl>
                                <label className="candidate-select">
                                  <input
                                    type="radio"
                                    name="voice-candidate"
                                    checked={selected}
                                    disabled={audioReviewApproved || !candidate.selectable}
                                    onChange={() => setAudioReviewDraft((current) => ({...current, selectedCandidateId: candidate.candidateId}))}
                                  />
                                  <span>{candidate.selectable ? '选择为新版正式音轨' : '仅作旧版听感对照，不可重新晋升'}</span>
                                </label>
                                {candidate.selectionBlocker && <small className="candidate-blocker">{candidate.selectionBlocker}</small>}
                              </article>
                            );
                          })}
                        </div>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">检查清单</span><strong>五项人工确认</strong></div><span>{LISTENING_CHECKLIST.filter(([key]) => audioReviewDraft.checklist[key]).length}/5</span></div>
                        <div className="listening-checks">
                          {LISTENING_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="review-check">
                              <input
                                type="checkbox"
                                checked={audioReviewDraft.checklist[key]}
                                disabled={audioReviewApproved}
                                onChange={(event) => setAudioReviewDraft((current) => ({...current, checklist: {...current.checklist, [key]: event.target.checked}}))}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">听审结论</span><strong>只能明确接受一个新版候选，或要求重做</strong></div></div>
                        <select className="select-control" value={audioReviewDraft.decision} disabled={audioReviewApproved} onChange={(event) => setAudioReviewDraft((current) => ({...current, decision: event.target.value}))}>
                          <option value="pending">待确认</option>
                          <option value="accepted" disabled={!audioReviewDraft.selectedCandidateId}>接受已选候选</option>
                          <option value="retake">候选需要重做</option>
                        </select>
                      </section>

                      <label className="field-label">听审备注<textarea className="text-control textarea-small" value={audioReviewDraft.notes} disabled={audioReviewApproved} placeholder={audioReviewDraft.decision === 'retake' ? '必须说明语速、停顿、发音、接缝或噪声问题' : '记录选择理由和听感差异'} onChange={(event) => setAudioReviewDraft((current) => ({...current, notes: event.target.value}))} /></label>
                      {!audioReviewApproved && audioReviewDraft.decision === 'retake' && audioReviewDraft.notes.trim().length < 2 && <div className="receipt-lock"><Pencil aria-hidden="true" /><span>要求重做时必须填写可执行的听感问题。</span></div>}
                      {!audioReviewApproved && !listeningDraftReady(audioReviewDraft, audioReview) && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>必须逐个播放全部活动候选到结尾、选择一个新版候选、完成五项检查并明确接受。系统不提供一键通过。</span></div>}
                      <div className="audio-review-actions">
                        <button type="button" className="button secondary" onClick={saveAudioReview} disabled={busy || audioReviewApproved || !canSaveAudioReview}><Save aria-hidden="true" />保存 A/B 听审</button>
                        <button type="button" className="button approve" onClick={approveAudioReview} disabled={busy || audioReviewApproved || !canApproveAudioReview}><Check aria-hidden="true" />晋升为唯一正式 WAV</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'feedback' && selectedStageId === 'retrospective' && (
                <div className="inspector-body audio-review-panel motion-feedback-panel">
                  {motionFeedbackLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载实际动效使用回执</div>}
                  {!motionFeedbackLoading && motionFeedbackError && (
                    <div className="artifact-empty">
                      <AlertTriangle aria-hidden="true" />
                      <span>动效复盘暂不可用。</span>
                      <small>{motionFeedbackError}</small>
                    </div>
                  )}
                  {!motionFeedbackLoading && motionFeedback && !motionFeedback.available && (
                    <div className="artifact-empty">
                      <RefreshCw aria-hidden="true" />
                      <span>{motionFeedback.message}</span>
                      <small>{motionFeedback.reason === 'no-versioned-motion-recipes' ? '请在新一轮全片制作中使用已通过生命周期门禁的版本化 recipe；旧项目不会被追溯改写。' : '系统只记录实际编译使用过的配方，并要求 composition digest 与复盘回执一致。'}</small>
                    </div>
                  )}
                  {!motionFeedbackLoading && motionFeedback?.available && motionFeedbackDraft && (
                    <>
                      <section className="audio-review-section">
                        <div className="section-heading">
                          <div><span className="eyebrow">实际使用</span><strong>{motionFeedback.sourceUsage.recipes.length} 条动效配方</strong></div>
                          <span className={`review-state ${motionFeedbackReviewed ? 'is-approved' : ''}`}>{motionFeedbackReviewed ? '本轮复盘完成' : '等待评价'}</span>
                        </div>
                        <dl className="audio-facts">
                          <div><dt>Composition</dt><dd><code title={motionFeedback.sourceUsage.compositionDigest}>{motionFeedback.sourceUsage.compositionDigest.slice(0, 20)}</code></dd></div>
                          <div><dt>历史版本</dt><dd>{motionFeedback.historyCount} 次反馈</dd></div>
                          <div><dt>记录时间</dt><dd>{new Date(motionFeedback.sourceUsage.recordedAt).toLocaleString()}</dd></div>
                        </dl>
                        <div className="impact-summary">
                          <strong>反馈只形成证据</strong>
                          <span>“可复用”不会自动晋级，“建议退役”也不会自动停用。生命周期变更仍需独立短探针、项目审批和人工负责人批准。</span>
                        </div>
                      </section>

                      <section className="audio-review-section motion-feedback-list">
                        <div className="section-heading"><div><span className="eyebrow">逐配方评价</span><strong>记录适用范围与失败模式</strong></div></div>
                        {motionFeedbackDraft.recipeFeedback.map((item, index) => (
                          <div className="motion-feedback-row" key={`${item.recipeId}@${item.version}`}>
                            <div className="semantic-sfx-heading">
                              <div><strong>{item.recipeId}</strong><span>v{item.version} · {item.cueIds.length} 个 cue</span></div>
                              <code>{item.cueIds.join(' / ') || '未绑定 cue'}</code>
                            </div>
                            <label className="field-label">结论
                              <select
                                className="select-control"
                                value={item.verdict}
                                onChange={(event) => setMotionFeedbackDraft((current) => ({
                                  ...current,
                                  recipeFeedback: current.recipeFeedback.map((entry, entryIndex) => entryIndex === index ? {...entry, verdict: event.target.value} : entry),
                                }))}
                              >
                                {Object.entries(MOTION_FEEDBACK_VERDICT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                            <label className="field-label">适用主题
                              <input
                                className="text-control"
                                value={item.suitableTopicsText}
                                placeholder="例如：三步流程，因果关系，工具链"
                                onChange={(event) => setMotionFeedbackDraft((current) => ({
                                  ...current,
                                  recipeFeedback: current.recipeFeedback.map((entry, entryIndex) => entryIndex === index ? {...entry, suitableTopicsText: event.target.value} : entry),
                                }))}
                              />
                            </label>
                            <label className="field-label">问题与失败现象
                              <input
                                className="text-control"
                                value={item.issuesText}
                                placeholder="例如：停留过短，文字过密，音效抢旁白"
                                onChange={(event) => setMotionFeedbackDraft((current) => ({
                                  ...current,
                                  recipeFeedback: current.recipeFeedback.map((entry, entryIndex) => entryIndex === index ? {...entry, issuesText: event.target.value} : entry),
                                }))}
                              />
                            </label>
                            <label className="field-label">配方备注
                              <textarea
                                className="text-control textarea-small"
                                value={item.notes}
                                onChange={(event) => setMotionFeedbackDraft((current) => ({
                                  ...current,
                                  recipeFeedback: current.recipeFeedback.map((entry, entryIndex) => entryIndex === index ? {...entry, notes: event.target.value} : entry),
                                }))}
                              />
                            </label>
                          </div>
                        ))}
                      </section>

                      <section className="audio-review-section">
                        <label className="field-label">整片动效结论
                          <select className="select-control" value={motionFeedbackDraft.overallVerdict} onChange={(event) => setMotionFeedbackDraft((current) => ({...current, overallVerdict: event.target.value}))}>
                            {Object.entries(MOTION_OVERALL_VERDICT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label className="field-label">整片复盘备注
                          <textarea className="text-control textarea-small" value={motionFeedbackDraft.notes} placeholder="记录人物稳定性、信息密度、节奏、闪烁、素材和音效配合。" onChange={(event) => setMotionFeedbackDraft((current) => ({...current, notes: event.target.value}))} />
                        </label>
                        {motionFeedbackDraft.overallVerdict !== 'pending' && motionFeedbackDraft.recipeFeedback.some((item) => item.verdict === 'pending') && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>先评价全部配方，再提交整片结论。</span></div>}
                        <button type="button" className="button primary block" onClick={saveMotionLibraryFeedback} disabled={busy}><Save aria-hidden="true" />保存并回写本地动效库</button>
                      </section>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'override' && OVERRIDE_STAGE_IDS.has(selectedStageId) && (
                <div className="inspector-body production-override-panel">
                  {semanticSfxReviewLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载语义音效候选</div>}
                  {!semanticSfxReviewLoading && semanticSfxReviewError && (
                    <div className="artifact-empty">
                      <Headphones aria-hidden="true" />
                      <span>语义音效计划暂不可审核。</span>
                      <small>{semanticSfxReviewError}</small>
                    </div>
                  )}
                  {!semanticSfxReviewLoading && semanticSfxReview?.available && semanticSfxReviewDraft && (
                    <section className="audio-review-section semantic-sfx-review">
                      <div className="section-heading">
                        <div><span className="eyebrow">稀疏语义音效</span><strong>{semanticSfxPlanApproved ? (semanticSfxReview.humanReviewPerformed === false ? '内部模拟入轨' : '已批准入轨') : '候选默认静音'}</strong></div>
                        <span>{semanticSfxReview.counts.approved}/{semanticSfxReview.counts.total} 保留</span>
                      </div>
                      {semanticSfxPlanApproved && semanticSfxReview.humanReviewPerformed === false && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>这是创作者委托的内部模拟，未完成真人听审，公开发布仍阻塞。</span></div>}
                      <div className="impact-summary">
                        <strong>混音硬约束</strong>
                        <span>最多 {semanticSfxReview.policy.maxPerMinute} 次/分钟，间隔至少 {semanticSfxReview.policy.minGapSeconds}s，旁白增益变化 {semanticSfxReview.policy.narrationGainChangeDb}dB。必须逐项批准或驳回；整份计划批准后才会入轨。</span>
                      </div>
                      <div className="semantic-sfx-list">
                        {semanticSfxReview.cues.map((cue) => {
                          const draftDecision = semanticSfxReviewDraft.decisions.find((item) => item.cueId === cue.id);
                          return (
                            <div className="semantic-sfx-row" key={cue.id}>
                              <div className="semantic-sfx-heading">
                                <div><strong>{formatDuration(cue.timeSeconds)} · {SFX_ROLE_LABELS[cue.role] || cue.role}</strong><span>{cue.motionRecipeId} · {cue.sourceCueIds.join(' / ')}</span></div>
                                <code>{cue.binding.assetId || '未绑定'}</code>
                              </div>
                              <p>{cue.semanticEvent}</p>
                              {cue.binding.asset?.fileUrl && <audio className="review-audio" controls preload="none" src={cue.binding.asset.fileUrl} />}
                              <dl className="audio-facts semantic-sfx-facts">
                                <div><dt>来源</dt><dd>{cue.binding.provider || '未登记'}</dd></div>
                                <div><dt>许可</dt><dd>{cue.binding.licenseReceipt || '未登记'}</dd></div>
                                <div><dt>SHA</dt><dd><code title={cue.binding.sha256}>{cue.binding.sha256?.slice(0, 16) || '--'}</code></dd></div>
                                <div><dt>增益</dt><dd>{cue.gainDb}dB</dd></div>
                              </dl>
                              <div className="mode-control three" role="group" aria-label={`${cue.id} 审核决定`}>
                                {[
                                  ['pending', '待定'],
                                  ['approved', '保留'],
                                  ['rejected', '静音'],
                                ].map(([decision, label]) => (
                                  <button
                                    key={decision}
                                    type="button"
                                    aria-pressed={draftDecision?.decision === decision}
                                    disabled={semanticSfxPlanApproved}
                                    onClick={() => setSemanticSfxReviewDraft((current) => ({
                                      ...current,
                                      decisions: current.decisions.map((item) => item.cueId === cue.id ? {...item, decision} : item),
                                    }))}
                                  >{label}</button>
                                ))}
                              </div>
                              <label className="field-label">审核备注
                                <input
                                  className="text-control"
                                  value={draftDecision?.note || ''}
                                  disabled={semanticSfxPlanApproved}
                                  placeholder="说明为什么保留或静音"
                                  onChange={(event) => setSemanticSfxReviewDraft((current) => ({
                                    ...current,
                                    decisions: current.decisions.map((item) => item.cueId === cue.id ? {...item, note: event.target.value} : item),
                                  }))}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                      <label className="field-label">整份计划备注
                        <textarea className="text-control textarea-small" value={semanticSfxReviewDraft.notes} disabled={semanticSfxPlanApproved} onChange={(event) => setSemanticSfxReviewDraft((current) => ({...current, notes: event.target.value}))} />
                      </label>
                      {!semanticSfxPlanApproved && semanticSfxReviewDraft.decisions.some((item) => item.decision === 'pending') && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>还有 {semanticSfxReviewDraft.decisions.filter((item) => item.decision === 'pending').length} 个候选未决定；计划继续保持静音。</span></div>}
                      {(semanticSfxReview.approvalBlockers || []).length > 0 && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>{semanticSfxReview.approvalBlockers.length} 个已选择音效尚未绑定可验证的本地素材；先重新生成语义音效计划或把对应项设为静音。</span></div>}
                      <div className="audio-review-actions">
                        {semanticSfxPlanApproved
                          ? <button type="button" className="button secondary" onClick={reopenSemanticSfxDecisions} disabled={busy}><RotateCcw aria-hidden="true" />退回重新审核</button>
                          : <>
                              {project.publicationRights === 'internal-only' && <button type="button" className="button secondary" onClick={simulateSemanticSfxDecisions} disabled={busy || health?.readOnlyPreview}><WandSparkles aria-hidden="true" />内部模拟入轨</button>}
                              <button type="button" className="button secondary" onClick={saveSemanticSfxDecisions} disabled={busy}><Save aria-hidden="true" />保存审核进度</button>
                              <button type="button" className="button approve" onClick={approveSemanticSfxDecisions} disabled={busy || !semanticSfxCanApprove}><Check aria-hidden="true" />批准选中音效</button>
                            </>}
                      </div>
                      <span className="muted-copy">审核回执绑定源计划 SHA：<code>{semanticSfxReview.sourcePlan.sha256.slice(0, 16)}</code></span>
                    </section>
                  )}
                  {productionOverridesLoading && <div className="audio-review-loading"><LoaderCircle className="spin" aria-hidden="true" />加载可编辑画面对象</div>}
                  {!productionOverridesLoading && productionOverridesError && (
                    <div className="artifact-empty">
                      <SlidersHorizontal aria-hidden="true" />
                      <span>全片编译后才能进行对象级微调。</span>
                      <small>{productionOverridesError}</small>
                    </div>
                  )}
                  {!productionOverridesLoading && productionOverrides && productionOverrideDraft && (
                    <>
                      <section className="audio-review-section">
                        <div className="section-heading">
                          <div><span className="eyebrow">确定性画面覆盖</span><strong>不修改口播、字幕和时间轴</strong></div>
                          <span>r{productionOverrides.revision}</span>
                        </div>
                        <div className="mode-control three" role="group" aria-label="微调目标层级">
                          {[
                            ['scene', '场景'],
                            ['cue', '节拍'],
                            ['object', '画面对象'],
                          ].map(([level, label]) => (
                            <button
                              key={level}
                              type="button"
                              aria-pressed={productionOverrideDraft.level === level}
                              onClick={() => setProductionOverrideDraft(makeOverrideDraft(productionOverrides, level))}
                            >{label}</button>
                          ))}
                        </div>
                        <label className="field-label">目标对象
                          <select
                            className="select-control"
                            value={productionOverrideDraft.targetId}
                            onChange={(event) => setProductionOverrideDraft((current) => ({...current, targetId: event.target.value}))}
                          >
                            {productionOverrideTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                          </select>
                        </label>
                        {selectedProductionOverrideTarget && (
                          <>
                            <dl className="audio-facts override-source-facts">
                              <div><dt>稳定 ID</dt><dd><code>{selectedProductionOverrideTarget.id}</code></dd></div>
                              <div><dt>下次编译文字</dt><dd>{selectedProductionOverrideTarget.text || selectedProductionOverrideTarget.title || '无'}</dd></div>
                            </dl>
                            <div className="override-state-compare" role="table" aria-label="自动生成、人工覆盖和当前有效值对照">
                              <div className="override-state-row override-state-header" role="row">
                                <strong role="columnheader">字段</strong>
                                <strong role="columnheader">自动生成</strong>
                                <strong role="columnheader">人工覆盖</strong>
                                <strong role="columnheader">当前有效</strong>
                              </div>
                              {productionOverrideComparisonRows.map((row) => (
                                <div className={`override-state-row${row.changed ? ' is-changed' : ''}`} role="row" key={row.field}>
                                  <span className="override-field-name" role="rowheader">{row.label}</span>
                                  <code role="cell" title={formatOverrideStateValue(row.field, row.generated)}>{formatOverrideStateValue(row.field, row.generated)}</code>
                                  <div role="cell" className="override-state-value">
                                    <code title={formatOverrideStateValue(row.field, row.override)}>{formatOverrideStateValue(row.field, row.override)}</code>
                                    {row.source.source === 'override' && <small title={row.source.overrideId}>r{row.source.revision} · {row.source.authoredBy}</small>}
                                  </div>
                                  <div role="cell" className="override-state-value">
                                    <code title={formatOverrideStateValue(row.field, row.effective)}>{formatOverrideStateValue(row.field, row.effective)}</code>
                                    <small>{row.source.source === 'override' ? '来自人工覆盖' : '来自自动生成'}</small>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="muted-copy">当前成片：{productionOverrides.compileState === 'compiled' ? '已包含当前有效值' : productionOverrides.compileState === 'pending-recompile' ? '仍是旧编译结果，需重新生成全片' : '缺少可验证编译回执'}。</p>
                          </>
                        )}
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">覆盖字段</span><strong>只填写需要改变的项目</strong></div></div>
                        <label className="field-label">{productionOverrideDraft.level === 'scene' ? '场景标题' : '主画面关键词 / 短句'}
                          <textarea
                            className="text-control textarea-small"
                            value={productionOverrideDraft.text}
                            placeholder={productionOverrideDraft.level === 'scene'
                              ? selectedProductionOverrideTarget?.title || '保持自动场景标题'
                              : '例如：理解｜判断｜维护｜负责'}
                            onChange={(event) => setProductionOverrideDraft((current) => ({...current, text: event.target.value}))}
                          />
                        </label>
                        {productionOverrideDraft.level !== 'scene' && <p className="muted-copy">只写主画面要强调的 1-4 个词，用“｜”分隔。完整口播仍由底部字幕展示。</p>}
                        {productionOverrideDraft.level !== 'scene' && (
                          <label className="field-label">动效版式
                            <select className="select-control" value={productionOverrideDraft.visualVariant} onChange={(event) => setProductionOverrideDraft((current) => ({...current, visualVariant: event.target.value}))}>
                              <option value="">自动判断</option>
                              {VISUAL_VARIANT_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                        )}
                        {productionOverrideDraft.level !== 'scene' && (
                          <>
                            <label className="field-label">高级动效配方
                              <select className="select-control" value={productionOverrideDraft.motionRecipeId} onChange={(event) => setProductionOverrideDraft((current) => ({...current, motionRecipeId: event.target.value}))}>
                                <option value="">保持当前配方</option>
                                {(productionOverrides.recipes || []).map((recipe) => <option key={recipe.id} value={recipe.id} disabled={recipe.allowedForProject === false}>{recipe.id} · {recipe.visualType} · {recipe.lifecycleState || 'unknown'}{recipe.allowedForProject === false ? ` · ${recipe.blockedReason || '需先完成配方审批'}` : ''}</option>)}
                              </select>
                              <span className="muted-copy">配方只改变右侧内容世界；保存后会使短探针和全片生产失效，并重新进入现有审批链。</span>
                            </label>
                            {selectedMotionRecommendation && (
                              <section className="visual-asset-candidates motion-recommendation">
                                <div className="section-heading">
                                  <div><span className="eyebrow">语义动效建议</span><strong>{selectedMotionRecommendation.recommendedRecipeId || '没有可用建议'}</strong></div>
                                  <span>{selectedMotionRecommendation.recommendation?.visualType || '未分类'}</span>
                                </div>
                                <div className="visual-asset-candidate">
                                  <div>
                                    <span>{selectedMotionRecommendation.trigger?.length > 0 ? `命中：${selectedMotionRecommendation.trigger.join(' / ')}` : '根据场景角色与现有素材保守推荐'}</span>
                                    <p>{motionRecommendationReason(selectedMotionRecommendation)}</p>
                                    {selectedMotionRecommendation.missingInputs?.length > 0 && <span>还缺：{selectedMotionRecommendation.missingInputs.map(motionInputLabel).join('；')}</span>}
                                    {selectedMotionRecommendation.lifecycleBlocker && <span>生产门禁：{selectedMotionRecommendation.lifecycleBlocker}</span>}
                                    {selectedMotionRecommendation.alternatives?.length > 0 && <span>备选：{selectedMotionRecommendation.alternatives.map((item) => `${item.recipeId}${item.missingInputs?.length ? `（${item.missingInputs.map(motionInputLabel).join('、')}）` : ''}`).join(' / ')}</span>}
                                  </div>
                                  <div className="candidate-actions">
                                    <button
                                      type="button"
                                      className="button secondary"
                                      disabled={!selectedRecommendationReady || selectedRecommendationAlreadyActive}
                                      onClick={() => setProductionOverrideDraft((current) => ({
                                        ...current,
                                        motionRecipeId: selectedMotionRecommendation.recommendedRecipeId,
                                        reason: current.reason || `采用语义动效建议：${motionRecommendationReason(selectedMotionRecommendation)}`,
                                      }))}
                                    >
                                      <WandSparkles aria-hidden="true" />
                                      {selectedRecommendationAlreadyActive ? '当前配方' : '使用建议'}
                                    </button>
                                  </div>
                                </div>
                                <span className="muted-copy">建议只预填人工覆盖；必须再点击“保存画面微调”，且不能代替素材、探针和生命周期批准。</span>
                              </section>
                            )}
                          </>
                        )}
                        {productionOverrideDraft.level !== 'scene' && (
                          <section className="carrier-editor">
                            <label className="field-label">结构化主载体
                              <select
                                className="select-control"
                                value={productionOverrideDraft.carrierAdapterId}
                                onChange={(event) => {
                                  const adapterId = event.target.value;
                                  setProductionOverrideDraft((current) => ({
                                    ...current,
                                    carrierAdapterId: adapterId,
                                    motionRecipeId: CARRIER_RECIPE_BY_ADAPTER[adapterId] || current.motionRecipeId,
                                    assetId: adapterId && adapterId !== '__clear__' ? '' : current.assetId,
                                  }));
                                }}
                              >
                                <option value="">保持当前主载体</option>
                                <option value="__clear__">恢复为自动主载体</option>
                                {(productionOverrides.carrierAdapters || []).map((adapter) => {
                                  const recipe = productionOverrides.recipes?.find((item) => item.id === CARRIER_RECIPE_BY_ADAPTER[adapter.adapterId]);
                                  return <option key={adapter.adapterId} value={adapter.adapterId} disabled={!recipe?.allowedForProject}>{adapter.adapterId} · {adapter.visualType}{recipe?.allowedForProject ? '' : ' · 配方未获项目准入'}</option>;
                                })}
                              </select>
                            </label>
                            {selectedCarrierAdapter && (
                              <>
                                <div className="carrier-source-receipt"><span>本地来源</span><code>{selectedCarrierAdapter.sourceReceipt}</code></div>
                                <label className="field-label">画面标题<input className="text-control" value={productionOverrideDraft.carrierTitle} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierTitle: event.target.value}))} /></label>
                                <div className="carrier-row two">
                                  <label className="field-label">证据标签<input className="text-control" value={productionOverrideDraft.carrierEvidenceLabel} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierEvidenceLabel: event.target.value}))} /></label>
                                  <label className="field-label">证据类型<select className="select-control" value={productionOverrideDraft.carrierEvidenceKind} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierEvidenceKind: event.target.value}))}><option value="claim">观点 / 事实台账</option><option value="source">素材登记来源</option><option value="media">本地媒体台账</option></select></label>
                                </div>
                                <label className="field-label">项目内证据 ID<input className="text-control" value={productionOverrideDraft.carrierEvidenceId} placeholder="claim-* / source-* / media asset id" onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierEvidenceId: event.target.value}))} /></label>
                                <label className="field-label">证据 SHA-256<input className="text-control" value={productionOverrideDraft.carrierEvidenceSha256} maxLength={64} placeholder="64 位小写 SHA-256" onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierEvidenceSha256: event.target.value}))} /><span className="muted-copy">正式编译会核对项目内台账实体及其哈希；仅填写标签不能获得 verified 状态。</span></label>
                                {productionOverrideDraft.carrierAdapterId === 'data-chart-bounded' && <>
                                  <label className="field-label">单位<input className="text-control" value={productionOverrideDraft.carrierUnit} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierUnit: event.target.value}))} /></label>
                                  {productionOverrideDraft.carrierSeries.map((item, index) => <div className="carrier-row two" key={`series-${index}`}>
                                    <label className="field-label">数据项 {index + 1}<input className="text-control" value={item.label} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierSeries: current.carrierSeries.map((entry, entryIndex) => entryIndex === index ? {...entry, label: event.target.value} : entry)}))} /></label>
                                    <label className="field-label">数值<input className="text-control" type="number" min="0" value={item.value} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierSeries: current.carrierSeries.map((entry, entryIndex) => entryIndex === index ? {...entry, value: event.target.value} : entry)}))} /></label>
                                  </div>)}
                                </>}
                                {productionOverrideDraft.carrierAdapterId === 'code-surface-bounded' && <>
                                  <div className="carrier-row two">
                                    <label className="field-label">语言<input className="text-control" value={productionOverrideDraft.carrierLanguage} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierLanguage: event.target.value}))} /></label>
                                    <label className="field-label">模式<select className="select-control" value={productionOverrideDraft.carrierCodeMode} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierCodeMode: event.target.value}))}><option value="highlight">聚焦</option><option value="diff">差异</option></select></label>
                                  </div>
                                  {productionOverrideDraft.carrierCodeLines.map((item, index) => <div className="carrier-row code" key={`code-${index}`}>
                                    <select className="select-control" value={item.kind} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierCodeLines: current.carrierCodeLines.map((entry, entryIndex) => entryIndex === index ? {...entry, kind: event.target.value} : entry)}))}><option value="context">上下文</option><option value="focus">聚焦</option><option value="add">新增</option><option value="remove">删除</option></select>
                                    <input className="text-control" value={item.text} placeholder={`代码行 ${index + 1}`} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierCodeLines: current.carrierCodeLines.map((entry, entryIndex) => entryIndex === index ? {...entry, text: event.target.value} : entry)}))} />
                                  </div>)}
                                </>}
                                {productionOverrideDraft.carrierAdapterId === 'device-surface-bounded' && <>
                                  <label className="field-label">产品 / 项目标识<input className="text-control" value={productionOverrideDraft.carrierProductLabel} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierProductLabel: event.target.value}))} /></label>
                                  {productionOverrideDraft.carrierStates.map((item, index) => <div className="carrier-row two" key={`state-${index}`}>
                                    <label className="field-label">状态 {index + 1}<input className="text-control" value={item.label} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierStates: current.carrierStates.map((entry, entryIndex) => entryIndex === index ? {...entry, label: event.target.value} : entry)}))} /></label>
                                    <label className="field-label">状态内容<input className="text-control" value={item.row} onChange={(event) => setProductionOverrideDraft((current) => ({...current, carrierStates: current.carrierStates.map((entry, entryIndex) => entryIndex === index ? {...entry, row: event.target.value} : entry)}))} /></label>
                                  </div>)}
                                </>}
                              </>
                            )}
                          </section>
                        )}
                        {productionOverrideDraft.level !== 'scene' && (
                          <label className="field-label">本地视觉素材
                            <select className="select-control" value={productionOverrideDraft.assetId} onChange={(event) => setProductionOverrideDraft((current) => ({...current, assetId: event.target.value}))}>
                              <option value="">保持当前素材</option>
                              <option value="__clear__">移除该节拍素材</option>
                              {(productionOverrides.mediaAssets || []).map((asset) => <option key={asset.id} value={asset.id} disabled={!asset.selectionReady}>{asset.id} · {asset.description}{asset.selectionReady ? '' : ' · 完整性/权利未通过'}</option>)}
                            </select>
                            {(productionOverrides.mediaAssets || []).length === 0 && <span className="muted-copy">当前项目还没有登记视觉素材；先通过 media-use 写入 .media/manifest.jsonl。</span>}
                          </label>
                        )}
                        {selectedProductionMediaAsset?.fileUrl && (
                          <div className="media-asset-preview">
                            <img src={selectedProductionMediaAsset.fileUrl} alt={selectedProductionMediaAsset.description} />
                            <dl className="audio-facts">
                              <div><dt>来源</dt><dd>{selectedProductionMediaAsset.provider}</dd></div>
                              <div><dt>许可</dt><dd>{selectedProductionMediaAsset.licenseReceipt}</dd></div>
                              <div><dt>SHA</dt><dd><code title={selectedProductionMediaAsset.sha256}>{selectedProductionMediaAsset.sha256.slice(0, 16)}</code></dd></div>
                              <div><dt>尺寸</dt><dd>{selectedProductionMediaAsset.width} × {selectedProductionMediaAsset.height}</dd></div>
                            </dl>
                          </div>
                        )}
                        {productionOverrideDraft.level !== 'scene' && (
                          <div className="field-stack asset-library-import">
                            <label className="field-label">从本地视觉素材库导入
                              <select className="select-control" value={visualLibraryAssetId} onChange={(event) => setVisualLibraryAssetId(event.target.value)}>
                                <option value="">选择已登记的图标、图片或品牌素材</option>
                                {visualLibraryAssets.map((asset) => <option key={asset.id} value={asset.id} disabled={!asset.sourceReady || !asset.sourceShaMatches}>{asset.id} · {asset.description}</option>)}
                              </select>
                            </label>
                            <button type="button" className="button secondary block" onClick={() => importLibraryAsset(visualLibraryAssetId)} disabled={busy || !visualLibraryAssetId}>
                              <CirclePlus aria-hidden="true" />导入并绑定到当前节拍
                            </button>
                            <span className="muted-copy">只导入本地、SHA 和许可证完整的视觉素材；不会替换人物、背景或字幕轨。</span>
                          </div>
                        )}
                        {productionOverrideDraft.level !== 'scene' && visualAssetCandidatesLoading && <div className="candidate-loading"><LoaderCircle className="spin" aria-hidden="true" />正在匹配本地视觉素材</div>}
                        {productionOverrideDraft.level !== 'scene' && visualAssetCandidatesError && <div className="receipt-lock"><AlertTriangle aria-hidden="true" /><span>视觉素材候选暂不可读取：{visualAssetCandidatesError}</span></div>}
                        {productionOverrideDraft.level !== 'scene' && visualCandidatesForSelectedTarget.length > 0 && (
                          <section className="visual-asset-candidates">
                            <div className="section-heading"><div><span className="eyebrow">语义候选</span><strong>仅建议，不自动入画</strong></div><span>{visualAssetCandidates?.metrics?.adoptionRate == null ? '暂无反馈' : `采用率 ${Math.round(visualAssetCandidates.metrics.adoptionRate * 100)}%`}</span></div>
                            {visualCandidatesForSelectedTarget.map((candidate) => (
                              <div className="visual-asset-candidate" key={candidate.id}>
                                <div>
                                  <div className="candidate-title"><strong>{candidate.assetId}</strong>{candidate.decision && <span className={`review-state ${candidate.decision.decision === 'adopted' ? 'is-approved' : 'is-failed'}`}>{candidate.decision.decision === 'adopted' ? '已采用' : '不采用'} · r{candidate.decision.revision}</span>}</div>
                                  <span>{candidate.matchedAliases.join(' / ')} · {candidate.visualType}</span>
                                  <p>{candidate.rationale}</p>
                                  <input className="text-control" value={visualCandidateNotes[candidate.id] || ''} placeholder="不采用时填写具体原因；采用时可记录适用条件" onChange={(event) => setVisualCandidateNotes((current) => ({...current, [candidate.id]: event.target.value}))} />
                                </div>
                                <div className="candidate-actions">
                                  <button type="button" className="button secondary" onClick={() => decideVisualAssetCandidate(candidate, 'rejected')} disabled={busy || (visualCandidateNotes[candidate.id] || '').trim().length < 2}><X aria-hidden="true" />不采用</button>
                                  <button type="button" className="button approve" onClick={() => decideVisualAssetCandidate(candidate, 'adopted')} disabled={busy}><Check aria-hidden="true" />采用候选</button>
                                </div>
                              </div>
                            ))}
                            <span className="muted-copy">候选摘要绑定 {visualAssetCandidates?.plan?.candidateDigestSha256?.slice(0, 12)}；采用/拒绝都会写入项目回执和中央反馈账本。</span>
                          </section>
                        )}
                        {productionOverrideDraft.level !== 'scene' && (
                          <div className="field-stack">
                            <label className="field-label">克制语义音效
                             <select className="select-control" value={productionOverrideDraft.sfxAssetId} onChange={(event) => setProductionOverrideDraft((current) => ({...current, sfxAssetId: event.target.value, sfxRole: event.target.value && event.target.value !== '__clear__' ? current.sfxRole || 'focus-hit' : ''}))}>
                                <option value="">保持当前音效</option>
                                <option value="__clear__">移除该节拍音效</option>
                               {(productionOverrides.sfxAssets || []).map((asset) => <option key={asset.id} value={asset.id} disabled={!asset.selectionReady}>{asset.id} · {asset.description}{asset.selectionReady ? '' : ' · 完整性/权利未通过'}</option>)}
                             </select>
                           </label>
                            <div className="field-stack asset-library-import">
                              <label className="field-label">从本地素材库导入
                                <select className="select-control" value={libraryAssetId} onChange={(event) => setLibraryAssetId(event.target.value)}>
                                  <option value="">选择已登记的 SFX</option>
                                  {sfxLibraryAssets.map((asset) => <option key={asset.id} value={asset.id} disabled={!asset.sourceReady || !asset.sourceShaMatches}>{asset.id} · {asset.description}</option>)}
                                </select>
                              </label>
                              <button type="button" className="button secondary block" onClick={() => importLibraryAsset(libraryAssetId)} disabled={busy || !libraryAssetId}>
                                <CirclePlus aria-hidden="true" />导入并登记到当前项目
                              </button>
                              <span className="muted-copy">导入会复制到项目 .media 并写入 SHA、来源和许可证；不会自动把音效放进时间线。</span>
                            </div>
                            {selectedProductionSfxAsset?.fileUrl && (
                              <div className="media-asset-preview media-audio-preview">
                                <audio className="review-audio" controls preload="none" src={selectedProductionSfxAsset.fileUrl} />
                                <dl className="audio-facts">
                                  <div><dt>来源</dt><dd>{selectedProductionSfxAsset.provider}</dd></div>
                                  <div><dt>许可</dt><dd>{selectedProductionSfxAsset.licenseReceipt}</dd></div>
                                  <div><dt>SHA</dt><dd><code title={selectedProductionSfxAsset.sha256}>{selectedProductionSfxAsset.sha256.slice(0, 16)}</code></dd></div>
                                  <div><dt>时长</dt><dd>{selectedProductionSfxAsset.duration?.toFixed(2)}s</dd></div>
                                </dl>
                              </div>
                            )}
                            {productionOverrideDraft.sfxAssetId && productionOverrideDraft.sfxAssetId !== '__clear__' && <label className="field-label">音效语义
                              <select className="select-control" value={productionOverrideDraft.sfxRole} onChange={(event) => setProductionOverrideDraft((current) => ({...current, sfxRole: event.target.value}))}>
                                <option value="focus-hit">重点落点</option>
                                <option value="connector-draw">连线完成</option>
                                <option value="state-change">鼠标点击 / 状态切换</option>
                                <option value="error">错误状态</option>
                                <option value="chapter-resolve">章节收束</option>
                              </select>
                            </label>}
                            {(productionOverrides.sfxAssets || []).length === 0 && <span className="muted-copy">当前项目没有登记 SFX；流水线不会用未登记或远程音效替代。</span>}
                          </div>
                        )}
                        {productionOverrideDraft.level !== 'object' && (
                          <label className="field-label">人物姿态
                            <select className="select-control" value={productionOverrideDraft.hostPose} onChange={(event) => setProductionOverrideDraft((current) => ({...current, hostPose: event.target.value}))}>
                              <option value="">保持当前姿态</option>
                              {productionOverrides.poses.map((pose) => <option key={pose.id} value={pose.id}>{pose.id}{pose.use ? ` | ${pose.use}` : ''}</option>)}
                            </select>
                          </label>
                        )}
                        {productionOverrideDraft.level === 'scene' && (
                          <label className="field-label">左右布局（连续模板建议整片保持一致）
                            <select className="select-control" value={productionOverrideDraft.layoutPreset} onChange={(event) => setProductionOverrideDraft((current) => ({...current, layoutPreset: event.target.value}))}>
                              <option value="">保持当前布局</option>
                              {(productionOverrides.policy?.layoutPresets || ['host-left', 'host-right']).includes('host-left') && <option value="host-left">人物左侧 / 内容右侧</option>}
                              {(productionOverrides.policy?.layoutPresets || ['host-left', 'host-right']).includes('host-right') && <option value="host-right">人物右侧 / 内容左侧</option>}
                            </select>
                            {productionOverrides.policy?.fixedHostZone && <span className="muted-copy">Q 版人物已锁定在 host.left，只允许调整右侧 content-world。</span>}
                          </label>
                        )}
                        <label className="field-label">修改原因
                          <input className="text-control" value={productionOverrideDraft.reason} placeholder="例如：缩短屏幕文字，避免信息过密" onChange={(event) => setProductionOverrideDraft((current) => ({...current, reason: event.target.value}))} />
                        </label>
                        <div className="impact-summary">
                          <strong>保存后的影响</strong>
                          <span>全片编译、结构 QA、Studio 终审、渲染、交付 QA、复盘和标准包会进入“需重算”；配音与时间轴不会重做。</span>
                        </div>
                        <button type="button" className="button primary block" onClick={saveProductionObjectOverride} disabled={busy || !canSaveProductionOverride}><Save aria-hidden="true" />保存画面微调</button>
                      </section>

                      <section className="audio-review-section">
                        <div className="section-heading"><div><span className="eyebrow">下次编译生效</span><strong>{activeProductionOverrides.length} 条人工覆盖</strong></div><span>{productionOverrides.compileState === 'compiled' ? '当前成片已包含' : '等待重新生成全片'} · 历史共 {productionOverrides.overrides.length} 条</span></div>
                        {activeProductionOverrides.length === 0
                          ? <p className="muted-copy">当前全片没有人工画面覆盖。</p>
                          : <div className="override-list">
                              {activeProductionOverrides.map((item) => (
                                <div className="override-row" key={item.id}>
                                  <div>
                                    <strong>{item.target.objectId || item.target.cueId || item.target.sceneId}</strong>
                                    <span>{Object.keys(item.locks).join(' / ')} | {item.reason}</span>
                                  </div>
                                  <button type="button" className="icon-button" title="撤销该覆盖" aria-label={`撤销 ${item.id}`} onClick={() => revertProductionObjectOverride(item.id)} disabled={busy}><Undo2 aria-hidden="true" /></button>
                                </div>
                              ))}
                            </div>}
                      </section>
                    </>
                  )}
                </div>
              )}

              {inspectorTab === 'config' && stageForm && (
                <div className="inspector-body">
                  <label className="field-label">步骤名称<input className="text-control" value={stageForm.titleOverride} placeholder={selectedDefinition.title} onChange={(event) => setStageForm((current) => ({...current, titleOverride: event.target.value}))} /></label>
                  <label className="field-label">目标<textarea className="text-control textarea-small" value={stageForm.descriptionOverride} placeholder={selectedDefinition.description} onChange={(event) => setStageForm((current) => ({...current, descriptionOverride: event.target.value}))} /></label>
                  <label className="field-label">执行工具<select className="select-control" value={stageForm.toolId} onChange={(event) => setStageForm((current) => ({...current, toolId: event.target.value}))}>
                    {selectedDefinition.tools.map((toolId) => {
                      const executable = (selectedDefinition.executableTools || [selectedDefinition.defaultTool]).includes(toolId);
                      return <option key={toolId} value={toolId} disabled={!executable}>{toolMap.get(toolId)?.name || toolId}{executable ? '' : '（复用候选，未接执行器）'}</option>;
                    })}
                  </select></label>
                  <div className="mode-control" role="group" aria-label="执行模式">
                    <button type="button" aria-pressed={stageForm.mode === 'automation'} onClick={() => setStageForm((current) => ({...current, mode: 'automation'}))}>自动生成</button>
                    <button type="button" aria-pressed={stageForm.mode === 'companion'} onClick={() => setStageForm((current) => ({...current, mode: 'companion'}))}>协同微调</button>
                  </div>
                  <label className="switch-row"><input type="checkbox" checked={stageForm.enabled} onChange={(event) => setStageForm((current) => ({...current, enabled: event.target.checked}))} /><span>启用该步骤</span></label>
                  <label className="field-label">生成要求<textarea className="text-control textarea-medium" value={stageForm.promptOverride} onChange={(event) => setStageForm((current) => ({...current, promptOverride: event.target.value}))} /></label>
                  <label className="field-label">项目备注<textarea className="text-control textarea-small" value={stageForm.notes} onChange={(event) => setStageForm((current) => ({...current, notes: event.target.value}))} /></label>
                  <div className="impact-summary">
                    <strong>改动影响</strong>
                    <span>重新生成或人工覆盖后，后续 {downstreamImpact.length} 个已产出步骤会自动标记为“需重算”。</span>
                  </div>
                  {selectedDefinition.tutorial && <a className="button secondary block" href={`/api/files/raw?path=${encodeURIComponent(selectedDefinition.tutorial)}`} target="_blank" rel="noreferrer"><BookOpen aria-hidden="true" />查看本步骤教程</a>}
                  <button type="button" className="button secondary block" onClick={saveStageConfig} disabled={busy}><Settings2 aria-hidden="true" />保存步骤配置</button>
                </div>
              )}

              {inspectorTab === 'artifact' && (
                <div className="inspector-body artifact-panel">
                  {artifact ? (
                    <>
                      <div className="artifact-meta"><FileText aria-hidden="true" /><code>{artifact.path}</code></div>
                      <textarea className="artifact-editor" value={artifactDraft} onChange={(event) => setArtifactDraft(event.target.value)} spellCheck="false" readOnly={selectedDefinition.artifactEditable === false} />
                      {selectedDefinition.artifactEditable === false
                        ? <div className="receipt-lock"><ShieldCheck aria-hidden="true" /><span>这是机器回执，不能手工改绿；请修正输入后重新生成。</span></div>
                        : <button type="button" className="button secondary block" onClick={saveArtifact} disabled={busy || selectedStage.status === 'running'}><Pencil aria-hidden="true" />保存人工覆盖</button>}
                    </>
                  ) : (
                    <div className="artifact-empty"><FileText aria-hidden="true" /><span>这个步骤还没有产物。先生成草案。</span></div>
                  )}
                </div>
              )}

              {inspectorTab === 'reuse' && (
                <div className="inspector-body reuse-panel">
                  <div className="selected-tool">
                    <strong>{selectedTool?.name || selectedStage.toolId}</strong>
                    <span>{selectedTool?.license}</span>
                    <p>{selectedTool?.role}</p>
                    <span className="reuse-state">{selectedTool?.integration}{selectedTool?.resolvedVersion ? ` · ${selectedTool.resolvedVersion}` : ''}</span>
                    {selectedTool?.repo && <a href={selectedTool.repo} target="_blank" rel="noreferrer">官方仓库 <ExternalLink aria-hidden="true" /></a>}
                  </div>
                  <h3>本步骤可选</h3>
                  <ul className="tool-list">
                    {selectedDefinition.tools.map((toolId) => {
                      const tool = toolMap.get(toolId);
                      return <li key={toolId}><span>{tool?.name || toolId}</span><small>{tool?.license}</small></li>;
                    })}
                  </ul>
                  {selectedDefinition.tutorial && <a className="button secondary block" href={`/api/files/raw?path=${encodeURIComponent(selectedDefinition.tutorial)}`} target="_blank" rel="noreferrer">查看项目教程 <ExternalLink aria-hidden="true" /></a>}
                </div>
              )}

              <div className="stage-actions">
                <button type="button" className="button primary" onClick={() => generateStage(selectedStageId)} disabled={busy || currentJob || selectedStage.status === 'running'}>
                  {selectedStage.status === 'not-started' ? <Play aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                  {selectedStage.status === 'not-started' ? '生成草案' : '重新生成'}
                </button>
                {selectedStageId === 'final-preview' && ['needs-review', 'approved'].includes(selectedStage.status) && <button type="button" className="button secondary" onClick={startStudioPreview} disabled={busy}><Play aria-hidden="true" />启动并打开 Studio</button>}
                {selectedStageId === 'final-preview' && selectedStage.previewStartedAt && <button type="button" className="icon-button" aria-label="停止 Studio" onClick={stopStudioPreview} disabled={busy}><Square aria-hidden="true" /></button>}
                {selectedStageId === 'voice-final' && <button type="button" className="button secondary" onClick={() => setInspectorTab('review')} disabled={busy}><Headphones aria-hidden="true" />打开听审</button>}
                {selectedStageId === 'subtitle-review' && <button type="button" className="button secondary" onClick={() => setInspectorTab('review')} disabled={busy}><FileText aria-hidden="true" />打开逐条审校</button>}
                {selectedStageId === 'screen-text-review' && <button type="button" className="button secondary" onClick={() => setInspectorTab('review')} disabled={busy}><FileText aria-hidden="true" />打开逐帧复核</button>}
                {selectedStage.status === 'needs-review' && selectedStageId === 'final-preview' && <button type="button" className="button approve" onClick={() => setInspectorTab('review')} disabled={busy}><Check aria-hidden="true" />打开五项终审</button>}
                {selectedStage.status === 'needs-review' && !DEDICATED_REVIEW_STAGE_IDS.has(selectedStageId) && (selectedDefinition.humanGate || selectedDefinition.manualApproval) && <button type="button" className="button approve" onClick={() => approveSelectedStage()} disabled={busy}><Check aria-hidden="true" />{selectedStageId === 'style-probe' ? '批准本项目风格' : selectedStageId === 'visual-plan' ? '批准视觉方案' : '批准'}</button>}
                {selectedStage.status === 'approved' && <button type="button" className="button secondary" onClick={reopenSelectedStage} disabled={busy}><RotateCcw aria-hidden="true" />退回修改</button>}
                {selectedDefinition.custom && <button type="button" className="button danger" onClick={deleteSelectedCustomStage} disabled={busy || currentJob}><Trash2 aria-hidden="true" />删除</button>}
              </div>

              <div className="stage-receipt">
                <span>产物</span><code>{selectedStage.artifactPath || selectedDefinition.artifact}</code>
                <span>版本</span><strong>r{selectedStage.revision}</strong>
                <span>人工覆盖</span><strong>{selectedStage.overrides?.length || 0}</strong>
                {selectedStage.approvalScope && <><span>批准范围</span><strong>{APPROVAL_SCOPE_LABELS[selectedStage.approvalScope] || selectedStage.approvalScope}</strong></>}
                {selectedStage.previewStartedAt && <><span>Studio</span><strong>{new Date(selectedStage.previewStartedAt).toLocaleString()}</strong></>}
                {selectedStage.lastError && <p className="error-copy">{selectedStage.lastError}</p>}
              </div>
            </>
          )}
        </aside>
      </main>

      {project && (
        <section className="activity-band" aria-labelledby="activity-title">
          <div className="activity-heading"><h2 id="activity-title">最近活动</h2><span>{project.events.length} 条项目回执</span></div>
          <ol>
            {project.events.slice(0, 8).map((entry) => <li key={entry.id}><time>{new Date(entry.at).toLocaleString()}</time><span>{entry.message || entry.type}</span>{entry.stageId && <code>{entry.stageId}</code>}</li>)}
          </ol>
        </section>
      )}

      {showProjectDialog && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={createNewProject}>
            <div className="modal-heading"><h2 id="new-project-title">新建工作台项目</h2>{projects.length > 0 && <button type="button" className="icon-button" aria-label="关闭" onClick={() => setShowProjectDialog(false)}><X aria-hidden="true" /></button>}</div>
            <div className="modal-grid">
              <label className="field-label">项目 ID<input name="id" className="text-control" required pattern="[A-Za-z0-9._-]+" value={newProjectForm.id || ''} onChange={(event) => setNewProjectForm((current) => ({...current, id: event.target.value}))} /></label>
              <label className="field-label">项目名称<input name="title" className="text-control" required value={newProjectForm.title || ''} onChange={(event) => setNewProjectForm((current) => ({...current, title: event.target.value}))} /></label>
              <label className="field-label">输入方式<select className="select-control" value={newProjectForm.intakeType || 'material-directory'} onChange={(event) => setNewProjectForm((current) => ({...current, intakeType: event.target.value}))}>
                <option value="pasted-text">粘贴文字稿</option>
                <option value="material-file">单个素材文件</option>
                <option value="material-directory">素材目录</option>
                <option value="narration-audio">口播音频</option>
                <option value="url-snapshot">网页与本地快照</option>
              </select></label>
              <div className="intake-route-receipt"><span>自动路线</span><strong>{newProjectForm.intakeType === 'pasted-text' ? (newProjectForm.textReadiness === 'approved-script' ? '已审定脚本' : '待口播化处理') : newProjectForm.intakeType === 'narration-audio' ? '口播音频' : '资料包'}</strong></div>
              {newProjectForm.intakeType === 'pasted-text' && (
                <>
                  <label className="field-label">文字状态<select className="select-control" value={newProjectForm.textReadiness || 'needs-oralization'} onChange={(event) => setNewProjectForm((current) => ({...current, textReadiness: event.target.value}))}>
                    <option value="needs-oralization">待素材诊断与口播化重写</option>
                    <option value="approved-script">已审定，保持原文</option>
                  </select></label>
                  <label className="field-label modal-wide">文字内容<textarea className="text-control intake-textarea" required value={newProjectForm.intakeText || ''} onChange={(event) => setNewProjectForm((current) => ({...current, intakeText: event.target.value}))} placeholder="默认先诊断并口播化；只有明确选择已审定脚本时才保持原文。" /></label>
                </>
              )}
              {['material-file', 'material-directory', 'narration-audio'].includes(newProjectForm.intakeType) && (
                <label className="field-label modal-wide">本地路径<input className="text-control" required value={newProjectForm.intakePath || ''} onChange={(event) => setNewProjectForm((current) => ({...current, intakePath: event.target.value}))} placeholder="必须位于 AutoVideo 工作区内" /></label>
              )}
              {newProjectForm.intakeType === 'url-snapshot' && (
                <>
                  <label className="field-label modal-wide">原始网址<input className="text-control" type="url" required value={newProjectForm.intakeUrl || ''} onChange={(event) => setNewProjectForm((current) => ({...current, intakeUrl: event.target.value}))} /></label>
                  <label className="field-label modal-wide">本地快照路径<input className="text-control" required value={newProjectForm.intakeSnapshotPath || ''} onChange={(event) => setNewProjectForm((current) => ({...current, intakeSnapshotPath: event.target.value}))} placeholder="先保存 HTML/PDF/图片快照，再登记来源网址" /></label>
                </>
              )}
              <label className="field-label">交付平台<input name="platform" className="text-control" value={newProjectForm.platform || ''} onChange={(event) => setNewProjectForm((current) => ({...current, platform: event.target.value}))} /></label>
              <label className="field-label">目标时长<input name="targetDuration" className="text-control" value={newProjectForm.targetDuration || ''} onChange={(event) => setNewProjectForm((current) => ({...current, targetDuration: event.target.value}))} /></label>
            </div>
            <div className="modal-actions"><button type="submit" className="button primary" disabled={busy}><CirclePlus aria-hidden="true" />创建项目</button></div>
          </form>
        </div>
      )}

      {showFormalProjectDialog && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="formal-project-title" onSubmit={inspectFormalProject}>
            <div className="modal-heading"><h2 id="formal-project-title">接入已有正式项目</h2><button type="button" className="icon-button" aria-label="关闭" onClick={() => setShowFormalProjectDialog(false)}><X aria-hidden="true" /></button></div>
            <p className="muted-copy">仅允许接入当前工作区内 <code>hyperframes-workflow-kit/projects</code> 的直属项目。先读取并校验哈希，再手动确认接入。</p>
            <label className="field-label">正式项目相对路径<input className="text-control" required value={formalProjectPath} onChange={(event) => { setFormalProjectPath(event.target.value); setFormalProjectInspection(null); }} placeholder="hyperframes-workflow-kit/projects/project-id" /></label>
            {formalProjectInspection && (
              <section className="formal-adoption-summary" aria-label="正式项目校验结果">
                <div><span>项目</span><strong>{formalProjectInspection.projectId}</strong></div>
                <div><span>当前阶段</span><strong>{formalProjectInspection.projectState.stage || '未记录'}</strong></div>
                <div><span>规划证据</span><strong>{formalProjectInspection.formalEvidence.planningBundle ? `${formalProjectInspection.formalEvidence.planningBundle.sceneCount} 场景 / ${formalProjectInspection.formalEvidence.planningBundle.cueCount} 个 cue` : '待在工作台补齐'}</strong></div>
                <p>{formalProjectInspection.humanReviewPolicy.message}</p>
              </section>
            )}
            <div className="modal-actions formal-adoption-actions">
              <button type="submit" className="button secondary" disabled={busy || formalProjectInspecting}>{formalProjectInspecting ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}读取并校验</button>
              <button type="button" className="button primary" onClick={adoptInspectedFormalProject} disabled={busy || !formalProjectInspection}>接入工作台</button>
            </div>
          </form>
        </div>
      )}

      {showFormalRefreshDialog && project?.formalProjectPath && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="formal-refresh-title">
            <div className="modal-heading">
              <h2 id="formal-refresh-title">刷新正式项目证据</h2>
              <button type="button" className="icon-button" aria-label="关闭" onClick={() => setShowFormalRefreshDialog(false)}><X aria-hidden="true" /></button>
            </div>
            <p className="muted-copy">工作台将重新读取并校验 <code>{project.formalProjectPath}</code>，按 SHA-256 比较当前正式文件。</p>
            <div className="impact-summary">
              <strong>刷新边界</strong>
              <span>已保存的人工修改、自定义步骤和画面覆盖不会被替换；正式证据变化会撤销不匹配的批准，并把受影响下游标记为需重算。</span>
              <span>本操作不会继承人工听审、动效探针、Studio 终审或公开发布权利。未保存的表单草稿不会写入正式项目。</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setShowFormalRefreshDialog(false)}>取消</button>
              <button type="button" className="button primary" onClick={refreshFormalEvidence} disabled={busy || Boolean(currentJob)}><RefreshCw aria-hidden="true" />刷新正式证据</button>
            </div>
          </section>
        </div>
      )}

      {showCustomDialog && project && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="custom-stage-title" onSubmit={addCustomStage}>
            <div className="modal-heading"><h2 id="custom-stage-title">新增项目步骤</h2><button type="button" className="icon-button" aria-label="关闭" onClick={() => setShowCustomDialog(false)}><X aria-hidden="true" /></button></div>
            <label className="field-label">步骤名称<input name="title" className="text-control" required /></label>
            <label className="field-label">插入位置<select name="afterStageId" className="select-control" defaultValue={selectedStageId || activeStageIds[0]}>{activeStageIds.map((id) => <option key={id} value={id}>{definitions.get(id)?.title || id}之后</option>)}</select></label>
            <label className="field-label">执行工具<select name="toolId" className="select-control" defaultValue="codex-cli"><option value="codex-cli">Codex CLI（只读自定义检查）</option></select></label>
            <label className="field-label">目标<textarea name="description" className="text-control textarea-small" /></label>
            <label className="switch-row"><input type="checkbox" name="humanGate" /><span>作为人工审批门</span></label>
            <div className="modal-actions"><button type="submit" className="button primary" disabled={busy}><CirclePlus aria-hidden="true" />加入流程</button></div>
          </form>
        </div>
      )}

      {dangerAction && project && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal danger-modal" role="dialog" aria-modal="true" aria-labelledby="danger-title">
            <div className="modal-heading"><h2 id="danger-title">{dangerAction === 'reset' ? '重置工作台进度' : '删除工作台项目'}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={() => setDangerAction(null)}><X aria-hidden="true" /></button></div>
            <p>{dangerAction === 'reset'
              ? '会清空各步骤状态、产物和任务回执，但保留项目设置、自定义步骤、正式 HyperFrames 项目与已批准输入。'
              : '会删除工作台中的项目状态、产物和任务回执；正式 HyperFrames 项目与已批准输入不会删除。'}</p>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setDangerAction(null)}>取消</button>
              <button type="button" className="button danger" onClick={dangerAction === 'reset' ? resetCurrentProject : deleteCurrentProject} disabled={busy}>{dangerAction === 'reset' ? <RotateCcw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}{dangerAction === 'reset' ? '确认重置' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppWithProvider() {
  return <ReactFlowProvider><App /></ReactFlowProvider>;
}
