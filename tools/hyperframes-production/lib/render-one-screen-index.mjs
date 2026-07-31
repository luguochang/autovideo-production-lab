import {escapeHtml, round3} from './common.mjs';
import {extractDisplayKeywords} from './render-continuous-index.mjs';

const COLORS = {
  background: '#F2DFC7',
  surface: '#FBF3E7',
  ink: '#2A211B',
  muted: '#675748',
  primary: '#496958',
  secondary: '#A94E36',
  line: '#DCC2A3',
};

export const ONE_SCREEN_INTRO_SECONDS = 0.35;
export const ONE_SCREEN_MAX_STEPS = 6;

const addStableHfIds = (html) => {
  let index = 0;
  return html.replace(/<(div|span|strong|svg|path|line|circle|rect|img|audio|figure|figcaption)\b([^>]*)>/g, (match, tag, attributes) => {
    if (/\bdata-hf-id=/.test(attributes)) return match;
    index += 1;
    return `<${tag} data-hf-id="auto-${String(index).padStart(3, '0')}-${tag}"${attributes}>`;
  });
};

const uniqueTerms = (items) => {
  const result = [];
  for (const value of items) {
    const item = String(value ?? '').trim();
    if (!item) continue;
    const normalized = item.toLowerCase();
    if (result.some((current) => current.toLowerCase() === normalized || current.includes(item) || item.includes(current))) continue;
    result.push(item);
  }
  return result;
};

const GENERIC_SUPPORT_TERMS = new Set(['这样', '这里', '地方', '问题', '真正', '复杂', '系统']);

const compactTerms = (items, limit = 3) => {
  const terms = uniqueTerms(items);
  if (terms.length <= limit) return terms;
  const groups = Array.from({length: limit}, () => []);
  terms.forEach((term, index) => groups[Math.min(limit - 1, Math.floor(index * limit / terms.length))].push(term));
  return groups.filter((group) => group.length).map((group) => group.join(' / '));
};

const screenTerms = (shot) => String(shot.screenText?.text ?? '')
  .split(/[|｜、，,\n]+/)
  .map((term) => term.trim())
  .filter(Boolean);

const titleForShot = (shot) => {
  const terms = screenTerms(shot);
  return terms.join(' / ') || extractDisplayKeywords(shot.narration, 2).join(' / ');
};

const supportForShot = (shot, graph) => {
  const title = titleForShot(shot);
  const graphTerms = (graph?.nodes ?? [])
    .filter((node) => node.sourceCueIds?.includes(shot.cueId))
    .map((node) => node.label);
  if (graphTerms.length) return compactTerms(graphTerms, 3).filter((term) => !title.includes(term));
  const narrationTerms = extractDisplayKeywords(shot.narration, 5);
  return uniqueTerms(narrationTerms)
    .filter((term) => !GENERIC_SUPPORT_TERMS.has(term) && !title.includes(term))
    .slice(0, 3);
};

const titleSize = (value) => {
  const length = [...String(value ?? '')].length;
  if (length <= 7) return 34;
  if (length <= 12) return 30;
  if (length <= 18) return 26;
  return 23;
};

const buildLayout = (count) => {
  if (count < 1 || count > ONE_SCREEN_MAX_STEPS) {
    throw new Error(`One-screen MVP supports 1-${ONE_SCREEN_MAX_STEPS} cues; received ${count}. Re-plan the narration into 3-6 beats or compile with --layout legacy.`);
  }
  const columns = count === 1 ? 1 : 2;
  const rows = Math.ceil(count / columns);
  const area = {left: 0, top: 154, width: 1130, height: 542};
  const gapX = 28;
  const gapY = rows >= 3 ? 18 : 24;
  const width = columns === 1 ? area.width : (area.width - gapX) / 2;
  const height = (area.height - gapY * (rows - 1)) / rows;
  const positions = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const orderInRow = index % columns;
    const column = columns === 2 && row % 2 === 1 ? columns - 1 - orderInRow : orderInRow;
    positions.push({
      left: round3(area.left + column * (width + gapX)),
      top: round3(area.top + row * (height + gapY)),
      width: round3(width),
      height: round3(height),
      centerX: round3(area.left + column * (width + gapX) + width / 2),
      centerY: round3(area.top + row * (height + gapY) + height / 2),
    });
  }
  return {area, positions};
};

const renderConnectors = (positions, shots) => positions.slice(1).map((position, index) => {
  const previous = positions[index];
  const cueId = shots[index + 1].cueId;
  const sameRow = Math.abs(previous.centerY - position.centerY) < 1;
  const path = sameRow
    ? `M ${previous.centerX} ${previous.centerY} L ${position.centerX} ${position.centerY}`
    : `M ${previous.centerX} ${previous.centerY} L ${previous.centerX} ${position.centerY} L ${position.centerX} ${position.centerY}`;
  return `<path data-hf-id="connector-${cueId}" id="connector-${cueId}" class="board-connector" d="${path}" pathLength="1" data-source-cues="${escapeHtml(cueId)}" />`;
}).join('');

const renderStep = ({shot, index, position, graph}) => {
  const id = `visual-${shot.cueId}`;
  const title = titleForShot(shot);
  const support = supportForShot(shot, graph);
  const resolvedAsset = (shot.resolvedAssets ?? []).find((asset) => asset.type !== 'icon') ?? null;
  const recipe = shot.motionRecipeRefs?.[0];
  return `<div data-hf-id="${id}" id="${id}" class="board-step${index === 0 ? ' is-initial' : ''}" style="left:${position.left}px;top:${position.top}px;width:${position.width}px;height:${position.height}px" data-role="board-step" data-zone="content.right" data-step-index="${index + 1}" data-source-cues="${escapeHtml(shot.cueId)}" data-visual-type="${escapeHtml(shot.visualType ?? 'keyword')}" data-motion-recipe="${escapeHtml(recipe ? `${recipe.recipeId}@${recipe.version}` : 'one-screen-reveal@1.0.0')}" data-final-position="${position.left},${position.top},${position.width},${position.height}">
    <div data-hf-id="${id}-focus" id="${id}-focus" class="board-step-focus" aria-hidden="true"></div>
    <span data-hf-id="${id}-index" class="board-step-index">${String(index + 1).padStart(2, '0')}</span>
    <div data-hf-id="${id}-copy" class="board-step-copy${resolvedAsset ? ' has-asset' : ''}">
      <strong data-hf-id="${id}-title" class="board-step-title" style="font-size:${titleSize(title)}px">${escapeHtml(title)}</strong>
      ${support.length ? `<div data-hf-id="${id}-support" class="board-step-support">${support.map((term, termIndex) => `<span data-hf-id="${id}-support-${termIndex + 1}">${escapeHtml(term)}</span>`).join('')}</div>` : ''}
    </div>
    ${resolvedAsset ? `<img data-hf-id="${id}-asset" class="board-step-asset" src="${escapeHtml(resolvedAsset.src)}" alt="" />` : ''}
  </div>`;
};

const renderTimeline = ({duration, shots, introSeconds}) => {
  const lines = [
    'window.__timelines = window.__timelines || {};',
    'const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });',
    'const durationAnchor = { progress: 0 };',
    `tl.to(durationAnchor, { progress: 1, duration: ${duration}, ease: "none" }, 0);`,
    `tl.fromTo("#content-progress", { scaleX: 0 }, { scaleX: 1, duration: ${duration}, ease: "none" }, 0);`,
    'tl.fromTo("#host-pose-fixed", { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, 0.04);',
    'tl.fromTo("#board-heading", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.44, ease: "power3.out" }, 0.08);',
  ];

  shots.forEach((shot, index) => {
    const start = round3(shot.start + introSeconds);
    if (index > 0) {
      lines.push(`tl.fromTo("#connector-${shot.cueId}", { strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, duration: 0.42, ease: "power2.out" }, ${round3(Math.max(0, start - 0.18))});`);
      lines.push(`tl.to("#visual-${shots[index - 1].cueId}-focus", { opacity: 0.22, duration: 0.24, ease: "power2.out" }, ${round3(Math.max(0, start - 0.08))});`);
    }
    lines.push(`tl.fromTo("#visual-${shot.cueId}", { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.46, ease: "power3.out" }, ${start});`);
    lines.push(`tl.fromTo("#visual-${shot.cueId} .board-step-title, #visual-${shot.cueId} .board-step-support span, #visual-${shot.cueId} .board-step-asset", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.045, ease: "power2.out" }, ${round3(start + 0.08)});`);
    if (index > 0) {
      const previous = shots[index - 1].cueId;
      const captionHandoff = round3(Math.max(0, start - 0.12));
      lines.push(`tl.to("#caption-${previous}", { opacity: 0, y: -3, duration: 0.1, ease: "power2.in" }, ${captionHandoff});`);
      lines.push(`tl.set("#caption-${previous}", { opacity: 0 }, ${start});`);
      lines.push(`tl.fromTo("#caption-${shot.cueId}", { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, ${round3(start + 0.02)});`);
    }
  });
  lines.push('window.__timelines["main"] = tl;');
  return lines.join('');
};

export function renderOneScreenIndex({manifest, scenes, shots, hostAssets, graphs = []}) {
  const introSeconds = ONE_SCREEN_INTRO_SECONDS;
  const audioDuration = round3(manifest.timeline.duration);
  const duration = round3(audioDuration + introSeconds);
  const layout = buildLayout(shots.length);
  const graphByScene = new Map(graphs.map((graph) => [graph.sceneId, graph]));
  const fixedPose = scenes[0].layout.hostPose;
  const fixedHostAsset = hostAssets.get(fixedPose);
  if (!fixedHostAsset) throw new Error(`One-screen renderer is missing fixed host asset ${fixedPose}.`);
  const firstTitle = titleForShot(shots[0]);
  const finalTitle = titleForShot(shots.at(-1));
  const boardTitle = firstTitle === finalTitle ? firstTitle : `${firstTitle} → ${finalTitle}`;
  const connectors = renderConnectors(layout.positions, shots);
  const steps = shots.map((shot, index) => renderStep({
    shot,
    index,
    position: layout.positions[index],
    graph: graphByScene.get(shot.sceneId),
  })).join('');
  const captions = shots.map((shot, index) => `<div data-hf-id="caption-${shot.cueId}" id="caption-${shot.cueId}" class="caption-cue${index === 0 ? ' is-initial' : ''}" data-role="caption" data-zone="caption" data-cue-start="${round3(shot.start + introSeconds)}" data-cue-duration="${round3(shot.duration)}" data-source-cues="${escapeHtml(shot.cueId)}" data-text-type="exact-source"><span data-hf-id="caption-${shot.cueId}-text">${escapeHtml(shot.narration)}</span></div>`).join('');
  let sfxTrackIndex = 31;
  const sfxClips = shots.flatMap((shot) => (shot.resolvedSfx ?? []).map((sfx, index) => {
    const start = round3(shot.start + introSeconds + Number(sfx.offsetMs ?? 0) / 1000);
    const clipDuration = round3(Math.min(Math.max(0.05, Number(sfx.duration ?? 0.35)), Math.max(0.05, duration - start)));
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
    <title>${escapeHtml(manifest.projectId)} - One Screen AutoVideo</title>
    <script src="./assets/runtime/gsap.min.js"></script>
    <style>
      @font-face { font-family:"Noto Sans SC"; src:local("Noto Sans SC"),local("Noto Sans CJK SC"),local("Microsoft YaHei"); font-weight:100 900; }
      @font-face { font-family:"JetBrains Mono Local"; src:url("./assets/runtime/JetBrainsMono-400.woff2") format("woff2"); font-weight:100 600; }
      @font-face { font-family:"JetBrains Mono Local"; src:url("./assets/runtime/JetBrainsMono-700.woff2") format("woff2"); font-weight:700 900; }
      * { box-sizing:border-box; }
      html,body { width:1920px; height:1080px; margin:0; overflow:hidden; background:${COLORS.background}; }
      body { font-family:"Noto Sans SC",sans-serif; color:${COLORS.ink}; }
      #root { position:relative; width:1920px; height:1080px; overflow:hidden; }
      .stage-fill { position:absolute; inset:0; width:1920px; height:1080px; overflow:hidden; background:${COLORS.background}; }
      .stage-fill::before { content:""; position:absolute; left:-260px; top:80px; width:820px; height:820px; border:2px solid ${COLORS.line}; border-radius:50%; opacity:.55; }
      .stage-fill::after { content:""; position:absolute; left:96px; top:874px; width:1728px; height:3px; background:${COLORS.line}; }
      .host-zone { position:absolute; left:96px; top:156px; width:520px; height:730px; overflow:hidden; z-index:4; }
      .host-shadow { position:absolute; left:72px; bottom:2px; width:370px; height:44px; border-radius:50%; background:rgba(73,105,88,.12); filter:blur(14px); }
      .host-pose { position:absolute; inset:0; width:520px; height:730px; object-fit:contain; object-position:50% 100%; transform-origin:50% 0; opacity:0; will-change:transform,opacity; }
      .host-accent { position:absolute; left:26px; bottom:18px; width:460px; height:5px; background:${COLORS.primary}; opacity:.72; }
      .content-zone { position:absolute; left:654px; top:72px; width:1170px; height:802px; overflow:hidden; z-index:8; }
      .board-heading { position:absolute; left:0; top:0; width:1130px; height:128px; opacity:0; }
      .board-kicker { display:block; color:#A14A33; font:800 18px/1.2 "JetBrains Mono Local",monospace; }
      .board-title { display:block; max-width:1100px; margin-top:14px; color:${COLORS.ink}; font-size:48px; font-weight:900; line-height:1.08; overflow-wrap:anywhere; }
      .master-board { position:absolute; left:0; top:0; width:1130px; height:720px; overflow:hidden; }
      .connector-layer { position:absolute; inset:0; width:1130px; height:720px; overflow:hidden; z-index:0; }
      .board-connector { fill:none; stroke:${COLORS.primary}; stroke-width:4; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; opacity:0; }
      .board-step { position:absolute; padding:18px 20px 16px 62px; overflow:hidden; border-left:5px solid ${COLORS.line}; border-bottom:2px solid ${COLORS.line}; border-radius:4px; background:rgba(251,243,231,.94); box-shadow:0 10px 24px rgba(73,60,49,.08); opacity:0; transform-origin:50% 50%; z-index:2; will-change:transform,opacity; }
      .board-step.is-initial { opacity:0; }
      .board-step-focus { position:absolute; left:0; top:0; width:5px; height:100%; background:${COLORS.secondary}; opacity:1; }
      .board-step-index { position:absolute; left:18px; top:19px; color:${COLORS.secondary}; font:800 17px/1 "JetBrains Mono Local",monospace; }
      .board-step-copy { width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; min-width:0; }
      .board-step-copy.has-asset { padding-right:126px; }
      .board-step-title { display:block; color:${COLORS.ink}; font-weight:900; line-height:1.12; overflow-wrap:anywhere; }
      .board-step-support { display:flex; align-items:center; flex-wrap:wrap; gap:6px 16px; margin-top:10px; color:${COLORS.muted}; font-size:17px; font-weight:650; line-height:1.2; }
      .board-step-support span { display:block; white-space:nowrap; }
      .board-step-support span::before { content:"/"; margin-right:8px; color:${COLORS.line}; }
      .board-step-support span:first-child::before { content:""; margin:0; }
      .board-step-asset { position:absolute; right:16px; top:50%; width:104px; height:104px; transform:translateY(-50%); object-fit:contain; border:1px solid ${COLORS.line}; background:#fff; }
      .content-progress { position:absolute; left:0; bottom:0; width:1130px; height:4px; background:${COLORS.secondary}; transform-origin:0 50%; }
      .caption-shell { position:absolute; left:96px; top:926px; width:1728px; height:88px; border-top:2px solid ${COLORS.line}; background:${COLORS.surface}; z-index:190; }
      .caption-cue { position:absolute; left:96px; top:926px; width:1728px; height:88px; padding:0 34px; display:flex; align-items:center; overflow:hidden; z-index:200; color:#493C31; font-size:27px; font-weight:550; line-height:1.35; opacity:0; will-change:transform,opacity; }
      .caption-cue.is-initial { opacity:1; }
      .caption-cue span { display:block; width:1660px; max-height:76px; overflow:hidden; text-align:left; }
      .lucide-receipt { display:none; }
    </style>
  </head>
  <body>
    <div data-hf-id="main-root" id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080" data-fps="30" data-layout-mode="one-screen-board" data-step-count="${shots.length}" data-all-content-precomputed="true">
      <div data-hf-id="persistent-stage" class="stage-fill" data-role="persistent-stage" data-zone="stage" data-layout-ignore></div>
      <div data-hf-id="host-zone" id="host-zone" class="host-zone" data-role="host" data-zone="host.left">
        <div data-hf-id="host-shadow" class="host-shadow" aria-hidden="true"></div>
        <img data-hf-id="host-pose-fixed" id="host-pose-fixed" class="host-pose" src="${escapeHtml(fixedHostAsset)}" alt="" data-pose-id="${escapeHtml(fixedPose)}" data-layout-allow-overflow="intentional-pose-crop" />
        <div data-hf-id="host-accent" class="host-accent" aria-hidden="true"></div>
      </div>
      <div data-hf-id="content-zone" id="content-zone" class="content-zone" data-role="content" data-zone="content.right">
        <div data-hf-id="board-heading" id="board-heading" class="board-heading">
          <span data-hf-id="board-kicker" class="board-kicker">TOPIC / ${escapeHtml(manifest.projectId.toUpperCase())}</span>
          <strong data-hf-id="board-title" class="board-title">${escapeHtml(boardTitle)}</strong>
        </div>
        <div data-hf-id="master-board" id="master-board" class="master-board" data-role="master-storyboard" data-zone="content.right">
          <svg data-hf-id="connector-layer" class="connector-layer" viewBox="0 0 1130 720" aria-hidden="true" data-layout-ignore>${connectors}</svg>
          ${steps}
        </div>
        <div data-hf-id="content-progress" id="content-progress" class="content-progress" aria-hidden="true"></div>
      </div>
      <div data-hf-id="caption-shell" id="caption-shell" class="caption-shell" data-role="caption-shell" data-zone="caption"></div>
      ${captions}
      <audio data-hf-id="narration-final" id="narration-final" class="clip" src="./assets/audio/narration.final.wav" data-start="${introSeconds}" data-duration="${audioDuration}" data-track-index="30" data-volume="1"></audio>
      ${sfxClips}
      <div data-hf-id="lucide-receipt" class="lucide-receipt" data-source="lucide-react@0.468.0" data-license="ISC"></div>
    </div>
    <script>${renderTimeline({duration, shots, introSeconds})}</script>
  </body>
</html>`;
  return addStableHfIds(html);
}
