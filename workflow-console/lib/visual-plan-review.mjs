const CARRIER_LABELS = {
  keyword: '关键词聚焦',
  'device-surface': '界面状态',
  comparison: '双态对比',
  diagram: '流程图解',
  'code-surface': '代码 / 终端',
  'data-proof': '数据证据',
  'evidence-image': '证据图片',
  'object-metaphor': '对象隐喻',
};

const RECIPE_LABELS = {
  'keyword-handoff': '关键词交接',
  'device-surface-tour': '界面状态演示',
  'comparison-split': '双态对比',
  'diagram-build': '流程逐步构建',
  'code-proof': '代码证据聚焦',
  'data-proof': '数据证据',
  'evidence-pivot': '证据切换',
  'object-metaphor': '对象隐喻',
};

const round = (value, precision = 1) => {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
};

const compactText = (value, maxLength = 46) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const countBy = (items, keyFor) => {
  const counts = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};

const sortedDistribution = (counts, total, labels) => [...counts.entries()]
  .map(([id, count]) => ({id, label: labels[id] || id, count, percent: total ? round((count / total) * 100) : 0}))
  .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));

const maxConsecutive = (items, keyFor) => {
  let previous = null;
  let run = 0;
  let maximum = 0;
  for (const item of items) {
    const key = keyFor(item);
    run = key && key === previous ? run + 1 : (key ? 1 : 0);
    previous = key;
    maximum = Math.max(maximum, run);
  }
  return maximum;
};

const maxChangesInWindow = (items, keyFor, timeFor, windowSeconds) => {
  if (items.length < 2) return 0;
  const changes = [];
  let previous = keyFor(items[0]);
  for (let index = 1; index < items.length; index += 1) {
    const current = keyFor(items[index]);
    if (current && previous && current !== previous) changes.push(Number(timeFor(items[index]) || 0));
    previous = current || previous;
  }
  let maximum = 0;
  for (let left = 0, right = 0; right < changes.length; right += 1) {
    while (changes[right] - changes[left] > windowSeconds) left += 1;
    maximum = Math.max(maximum, right - left + 1);
  }
  return maximum;
};

const makeTimelineAnchors = (scenes, durationSeconds, desiredCount = 8) => {
  if (!scenes.length) return [];
  const count = Math.min(desiredCount, scenes.length);
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    const target = count === 1 ? 0 : (durationSeconds * index) / (count - 1);
    const scene = scenes.find((item) => Number(item?.timing?.end || 0) >= target) || scenes.at(-1);
    if (!scene || selected.some((item) => item.id === scene.id)) continue;
    const exactExcerpt = scene.screenText?.find((item) => item.type === 'exact-source')?.text;
    selected.push({
      id: scene.id,
      order: Number(scene.order || selected.length + 1),
      start: Number(scene.timing?.start || 0),
      end: Number(scene.timing?.end || 0),
      role: scene.role || 'scene',
      title: compactText(exactExcerpt || scene.title || scene.id),
    });
  }
  return selected;
};

export const summarizeVisualPlanArtifact = (content) => {
  if (!String(content || '').trim()) return {available: false, error: '视觉方案产物尚未载入。'};

  let bundle;
  try {
    bundle = JSON.parse(content);
  } catch (error) {
    return {available: false, error: `视觉方案 JSON 无法解析：${error.message}`};
  }

  const storyboard = bundle?.storyboard;
  const shotManifest = bundle?.shotManifest;
  const graphIr = bundle?.graphIr;
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  const shots = Array.isArray(shotManifest?.shots) ? shotManifest.shots : [];
  const graphs = Array.isArray(graphIr?.graphs) ? graphIr.graphs : [];
  if (!scenes.length || !shots.length) return {available: false, error: '视觉方案缺少场景或镜头数据，不能提交人工审核。'};

  const sceneDurations = scenes.map((scene) => Number(scene?.timing?.duration ?? (scene?.timing?.end - scene?.timing?.start)) || 0);
  const durationSeconds = Number(storyboard?.format?.audioDurationSeconds)
    || Math.max(...scenes.map((scene) => Number(scene?.timing?.end || 0)), 0);
  const carrierCounts = countBy(shots, (shot) => shot.visualType);
  const recipeCounts = countBy(shots, (shot) => shot.motionRecipeRefs?.[0]?.recipeId);
  const fixedHostScenes = scenes.filter((scene) => scene?.layout?.hostZone === 'host.left').length;
  const fixedContentScenes = scenes.filter((scene) => scene?.layout?.contentZone === 'content.right').length;
  const fixedCaptionScenes = scenes.filter((scene) => scene?.layout?.captionZone === 'caption').length;
  const stableZoneShots = shots.filter((shot) => {
    const zones = Array.isArray(shot.zones) ? shot.zones : [];
    return ['host.left', 'content.right', 'caption'].every((zone) => zones.includes(zone));
  }).length;
  const exactScreenTextCount = shots.filter((shot) => shot?.screenText?.type === 'exact-source').length;
  const illustrativeMockCount = shots.filter((shot) => shot?.carrierPayload?.evidence?.status === 'illustrative-mock').length;
  const sfxCueCount = shots.filter((shot) => Array.isArray(shot.sfxRefs) && shot.sfxRefs.length > 0).length;

  return {
    available: true,
    projectId: bundle.projectId || storyboard.projectId || null,
    revision: Number(bundle.workbenchRevision || 0),
    digest: bundle.planningDigestSha256 || null,
    format: {
      ratio: storyboard?.format?.ratio || null,
      width: Number(storyboard?.format?.width || 0),
      height: Number(storyboard?.format?.height || 0),
      fps: Number(storyboard?.format?.fps || 0),
      durationSeconds: round(durationSeconds, 3),
    },
    counts: {
      scenes: scenes.length,
      shots: shots.length,
      graphs: graphs.length,
      exactScreenText: exactScreenTextCount,
      illustrativeMocks: illustrativeMockCount,
      sfxCues: sfxCueCount,
    },
    pacing: {
      averageSceneSeconds: round(durationSeconds / scenes.length),
      averageShotSeconds: round(durationSeconds / shots.length),
      shortestSceneSeconds: round(Math.min(...sceneDurations)),
      longestSceneSeconds: round(Math.max(...sceneDurations)),
      scenesAtLeastTwentySeconds: sceneDurations.filter((duration) => duration >= 20).length,
      scenesUnderEightSeconds: sceneDurations.filter((duration) => duration < 8).length,
    },
    stability: {
      persistentZones: Array.isArray(storyboard?.persistentZones) ? storyboard.persistentZones : [],
      fixedHostPercent: round((fixedHostScenes / scenes.length) * 100),
      fixedContentPercent: round((fixedContentScenes / scenes.length) * 100),
      fixedCaptionPercent: round((fixedCaptionScenes / scenes.length) * 100),
      stableZoneShotPercent: round((stableZoneShots / shots.length) * 100),
      maxHostPoseChangesInEightSeconds: maxChangesInWindow(shots, (shot) => shot.hostPose, (shot) => shot.start, 8),
    },
    variety: {
      carriers: sortedDistribution(carrierCounts, shots.length, CARRIER_LABELS),
      recipes: sortedDistribution(recipeCounts, shots.length, RECIPE_LABELS),
      maxRepeatedCarrier: maxConsecutive(shots, (shot) => shot.visualType),
      maxRepeatedRecipe: maxConsecutive(shots, (shot) => shot.motionRecipeRefs?.[0]?.recipeId),
    },
    timelineAnchors: makeTimelineAnchors(scenes, durationSeconds),
  };
};

