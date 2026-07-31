import { escapeHtml, round3 } from './common.mjs';

const COLORS = {
  background: '#F2DFC7',
  surface: '#FBF3E7',
  ink: '#2A211B',
  muted: '#675748',
  primary: '#496958',
  secondary: '#A94E36',
  line: '#DCC2A3',
};

function textSize(text, role) {
  const count = [...String(text)].length;
  if (role === 'close') return count > 22 ? 54 : 66;
  if (count > 36) return 44;
  if (count > 26) return 52;
  if (count > 18) return 60;
  return 70;
}

function claimLabel(shot, stateId) {
  return /99%|90%|30K/i.test(`${shot.screenText?.text ?? ''} ${shot.narration ?? ''}`)
    ? `<div data-hf-id="${stateId}-claim-label" class="claim-label">创作者观点 · 未核验</div>`
    : '';
}

function renderStandardState(scene, shots, shot, index) {
  const previous = index > 0 ? shots[index - 1] : null;
  const isCompare = shot.visualOperation === 'compare' && previous;
  const sourceIds = (shot.screenText?.sourceCueIds ?? [shot.cueId]).join(',');
  const stateId = `${scene.id}-state-${String(index + 1).padStart(2, '0')}`;
  const text = shot.screenText?.text || shot.narration;

  if (scene.role === 'close' && index === shots.length - 1) {
    return `
      <div data-hf-id="${stateId}" id="${stateId}" class="state state-close" data-state-id="${stateId}" data-operation="${escapeHtml(shot.visualOperation)}" data-source-cues="${escapeHtml(sourceIds)}">
        <div data-hf-id="${stateId}-value-terms" class="value-terms"><span data-hf-id="${stateId}-value-understand">理解</span><span data-hf-id="${stateId}-value-judge">判断</span><span data-hf-id="${stateId}-value-maintain">维护</span><span data-hf-id="${stateId}-value-own">负责</span></div>
        <div data-hf-id="${stateId}-close-route" class="close-route">${escapeHtml(text)}</div>
        <div data-hf-id="${stateId}-meta" class="state-meta">${escapeHtml(shot.cueId)} · ${escapeHtml(shot.screenText?.type ?? 'exact-source')}</div>
      </div>`;
  }

  if (isCompare) {
    return `
      <div data-hf-id="${stateId}" id="${stateId}" class="state state-compare" data-state-id="${stateId}" data-operation="compare" data-source-cues="${escapeHtml(sourceIds)}">
        <div data-hf-id="${stateId}-before" class="compare-side compare-before"><span data-hf-id="${stateId}-before-kicker" class="compare-kicker">BEFORE</span><strong data-hf-id="${stateId}-before-text">${escapeHtml(previous.screenText?.text || previous.narration)}</strong></div>
        <div data-hf-id="${stateId}-divider" class="compare-divider" aria-hidden="true"></div>
        <div data-hf-id="${stateId}-after" class="compare-side compare-after"><span data-hf-id="${stateId}-after-kicker" class="compare-kicker">AFTER</span><strong data-hf-id="${stateId}-after-text">${escapeHtml(text)}</strong></div>
        ${claimLabel(shot, stateId)}
        <div data-hf-id="${stateId}-meta" class="state-meta">${escapeHtml(shot.cueId)} · ${escapeHtml(shot.screenText?.type ?? 'generated-summary')}</div>
      </div>`;
  }

  return `
      <div data-hf-id="${stateId}" id="${stateId}" class="state state-focus" data-state-id="${stateId}" data-operation="${escapeHtml(shot.visualOperation)}" data-source-cues="${escapeHtml(sourceIds)}">
        <div data-hf-id="${stateId}-focus-rule" class="focus-rule" aria-hidden="true"></div>
        <div data-hf-id="${stateId}-text" class="state-text" style="font-size:${textSize(text, scene.role)}px">${escapeHtml(text)}</div>
        ${claimLabel(shot, stateId)}
        <div data-hf-id="${stateId}-meta" class="state-meta">${escapeHtml(shot.cueId)} · ${escapeHtml(shot.screenText?.type ?? 'exact-source')}</div>
      </div>`;
}

function connectorPath(nodeCount) {
  if (nodeCount <= 1) return 'M 120 222 L 770 222';
  if (nodeCount === 2) return 'M 170 222 C 350 222, 520 222, 700 222';
  return 'M 118 222 C 270 222, 340 222, 456 222 S 650 222, 806 222';
}

function renderGraphState(scene, graph, state, index) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const activeNodes = state.activeNodeIds.map((id) => nodeMap.get(id)).filter(Boolean);
  const stateId = `${scene.id}-${state.id}`;
  return `
      <div data-hf-id="${stateId}" id="${stateId}" class="state graph-state" data-state-id="${escapeHtml(state.id)}" data-operation="${escapeHtml(state.operation)}" data-source-cues="${escapeHtml(state.cueIds.join(','))}">
        <svg data-hf-id="${stateId}-connector" class="graph-connector" viewBox="0 0 920 444" aria-hidden="true">
          <path data-hf-id="${stateId}-path" id="${stateId}-path" pathLength="100" d="${connectorPath(activeNodes.length)}"></path>
        </svg>
        <div data-hf-id="${stateId}-nodes" class="graph-nodes graph-count-${activeNodes.length}">
          ${activeNodes.map((node, nodeIndex) => `
            <div data-hf-id="${scene.id}-node-${escapeHtml(node.id)}-${index}" id="${scene.id}-node-${escapeHtml(node.id)}-${index}" class="graph-node" data-node-id="${escapeHtml(node.id)}" data-source-cues="${escapeHtml(node.sourceCueIds.join(','))}">
              <span data-hf-id="${scene.id}-node-${escapeHtml(node.id)}-${index}-index" class="node-index">${String(nodeIndex + 1).padStart(2, '0')}</span>
              <strong data-hf-id="${scene.id}-node-${escapeHtml(node.id)}-${index}-label">${escapeHtml(node.label)}</strong>
            </div>`).join('')}
        </div>
        <div data-hf-id="${stateId}-meta" class="state-meta">${escapeHtml(state.cueIds.join(' + '))} · ${escapeHtml(state.operation)}</div>
      </div>`;
}

function renderTimeline(scene, shots, graph) {
  const hostDirection = scene.layout.hostZone === 'host.left' ? -1 : 1;
  const stateEntries = graph
    ? graph.states.map((state) => ({
        id: `${scene.id}-${state.id}`,
        start: Math.max(0, Math.min(...state.cueIds.map((cueId) => shots.find((shot) => shot.cueId === cueId)?.start ?? scene.start)) - scene.start),
        graph: true,
      }))
    : shots.map((shot, index) => ({
        id: `${scene.id}-state-${String(index + 1).padStart(2, '0')}`,
        start: Math.max(0, shot.start - scene.start),
        graph: false,
      }));
  if (graph) {
    stateEntries.forEach((entry, index) => {
      if (index > 0 && entry.start <= stateEntries[index - 1].start + 0.05) {
        entry.start = (scene.duration * index) / stateEntries.length;
      }
    });
  }

  const lines = [
    'window.__timelines = window.__timelines || {};',
    'const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });',
    `const sceneDuration = ${round3(scene.duration)};`,
    `const world = document.getElementById("${scene.id}-world");`,
    'const cam = { scale: 1, x: 0, y: 0 };',
    'const durationAnchor = { progress: 0 };',
    'const applyCamera = () => { world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`; };',
    'applyCamera();',
    'tl.to(durationAnchor, { progress: 1, duration: sceneDuration, ease: "none" }, 0);',
    `tl.fromTo("#${scene.id}-host-wrap", { opacity: 0, x: ${hostDirection * 34}, scale: 0.985 }, { opacity: 1, x: 0, scale: 1, duration: 0.62, ease: "power4.out" }, 0.12);`,
    `tl.fromTo("#${scene.id}-eyebrow", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.38, ease: "power2.out" }, 0.2);`,
    `tl.fromTo("#${scene.id}-heading", { opacity: 0, x: ${hostDirection * -38} }, { opacity: 1, x: 0, duration: 0.62, ease: "power4.out" }, 0.24);`,
    `tl.fromTo("#${scene.id}-ambient-rule", { scaleX: 0.78 }, { scaleX: 1, duration: Math.max(1, sceneDuration - 0.3), ease: "none" }, 0.15);`,
    `tl.to(cam, { scale: 1.012, x: ${hostDirection * -4}, duration: Math.max(1, sceneDuration - 0.45), ease: "sine.inOut", onUpdate: applyCamera }, 0.3);`,
    `tl.to("#${scene.id}-host-wrap", { y: -5, duration: Math.max(1, sceneDuration - 0.55), ease: "sine.inOut" }, 0.35);`,
  ];

  stateEntries.forEach((entry, index) => {
    const start = round3(index === 0 ? Math.min(0.48, Math.max(0.18, scene.duration * 0.07)) : entry.start);
    if (index > 0) {
      const previous = stateEntries[index - 1];
      lines.push(`tl.to("#${previous.id}", { opacity: 0, scale: 0.965, duration: 0.22, ease: "power2.in" }, ${round3(Math.max(0, start - 0.22))});`);
    }
    lines.push(`tl.fromTo("#${entry.id}", { opacity: 0, scale: 0.965, x: ${hostDirection * -18} }, { opacity: 1, scale: 1, x: 0, duration: 0.42, ease: "power3.out" }, ${start});`);
    if (entry.graph) {
      lines.push(`tl.fromTo("#${entry.id} .graph-node", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.38, stagger: 0.08, ease: "power3.out" }, ${round3(start + 0.08)});`);
      lines.push(`tl.fromTo("#${entry.id} .graph-connector path", { strokeDashoffset: 100 }, { strokeDashoffset: 0, duration: 0.58, ease: "power2.out" }, ${round3(start + 0.12)});`);
    }
  });

  lines.push(`window.__timelines["${scene.id}"] = tl;`);
  return lines.join('\n      ');
}

export function renderScene({ scene, shots, graph, hostAsset }) {
  const isHostLeft = scene.layout.hostZone === 'host.left';
  const hostRect = isHostLeft ? { left: 96, top: 156 } : { left: 1224, top: 156 };
  const contentRect = isHostLeft
    ? { left: 694, top: 112, width: 1130 }
    : { left: 96, top: 112, width: 1030 };
  const pose = scene.layout.hostPose;
  const mirror = scene.layout.hostZone === 'host.right' || (pose === 'point-right' && scene.layout.hostZone === 'host.left');
  const poseScale = pose === 'close' ? 1.18 : pose === 'point-right' ? 1.1 : 1;
  const poseTransform = `${mirror ? 'scaleX(-1) ' : ''}scale(${poseScale})`;
  const graphStates = graph ? graph.states.map((state, index) => renderGraphState(scene, graph, state, index)).join('') : '';
  const standardStates = graph ? '' : shots.map((shot, index) => renderStandardState(scene, shots, shot, index)).join('');

  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        @font-face { font-family:"Noto Sans SC Variable"; src:local("Noto Sans SC Variable"), local("Noto Sans SC"); font-weight:100 900; }
        @font-face { font-family:"Microsoft YaHei"; src:local("Microsoft YaHei"); }
        #root { position:absolute; inset:0; width:1920px; height:1080px; overflow:hidden; color:${COLORS.ink}; font-family:"Noto Sans SC Variable", "Microsoft YaHei", sans-serif; }
        .stage-fill { position:absolute; inset:0; width:1920px; height:1080px; overflow:hidden; background:${COLORS.background}; }
        .world { position:absolute; inset:0; width:1920px; height:1080px; transform-origin:50% 50%; will-change:transform; }
        .ambient-orbit { position:absolute; ${isHostLeft ? 'left:-210px' : 'right:-210px'}; top:94px; width:810px; height:810px; border:2px solid ${COLORS.line}; border-radius:50%; opacity:.62; }
        .ambient-rule { position:absolute; left:${contentRect.left}px; top:874px; width:${contentRect.width}px; height:3px; background:${COLORS.primary}; opacity:.55; transform-origin:${isHostLeft ? '0 50%' : '100% 50%'}; }
        .host-wrap { position:absolute; left:${hostRect.left}px; top:${hostRect.top}px; width:600px; height:730px; overflow:hidden; z-index:4; transform-origin:50% 100%; will-change:transform,opacity; }
        .host-wrap img { display:block; width:600px; height:730px; object-fit:contain; object-position:50% 100%; transform:${poseTransform}; transform-origin:50% 0; }
        .content-zone { position:absolute; left:${contentRect.left}px; top:${contentRect.top}px; width:${contentRect.width}px; height:760px; overflow:hidden; z-index:5; }
        .eyebrow { position:absolute; left:0; top:0; height:38px; color:${COLORS.muted}; font-family:"JetBrains Mono",monospace; font-size:20px; font-weight:700; line-height:38px; }
        .eyebrow::before { content:""; display:inline-block; width:50px; height:4px; margin-right:16px; vertical-align:5px; background:${COLORS.primary}; }
        .heading { position:absolute; left:0; top:42px; width:${contentRect.width}px; height:210px; padding-top:18px; overflow:hidden; color:${COLORS.ink}; font-size:72px; font-weight:800; line-height:1.12; letter-spacing:0; }
        .state-stage { position:absolute; left:0; top:270px; width:${contentRect.width}px; height:456px; overflow:hidden; }
        .state { position:absolute; inset:0; width:100%; height:100%; opacity:0; transform-origin:50% 50%; overflow:hidden; }
        .state-focus { display:flex; align-items:center; padding:24px 28px 58px 0; }
        .focus-rule { flex:0 0 auto; width:10px; height:214px; margin-right:38px; background:${COLORS.primary}; }
        .state-text { max-width:calc(100% - 70px); color:${COLORS.ink}; font-weight:800; line-height:1.15; letter-spacing:0; overflow-wrap:anywhere; }
        .claim-label { position:absolute; left:48px; bottom:42px; min-width:270px; height:42px; padding:0 18px; border:2px solid ${COLORS.secondary}; border-radius:6px; color:${COLORS.secondary}; font-size:20px; font-weight:700; line-height:38px; }
        .state-meta { position:absolute; right:10px; bottom:6px; color:${COLORS.muted}; font-family:"JetBrains Mono",monospace; font-size:17px; font-weight:700; }
        .state-compare { display:grid; grid-template-columns:1fr 3px 1fr; gap:30px; align-items:center; padding:18px 8px 52px; }
        .compare-divider { width:3px; height:260px; background:${COLORS.line}; }
        .compare-side { min-width:0; display:flex; flex-direction:column; gap:20px; }
        .compare-side strong { color:${COLORS.ink}; font-size:42px; font-weight:800; line-height:1.2; overflow-wrap:anywhere; }
        .compare-after strong { color:${COLORS.primary}; }
        .compare-kicker { color:${COLORS.muted}; font-family:"JetBrains Mono",monospace; font-size:18px; font-weight:700; }
        .graph-state { padding:10px 0 52px; }
        .graph-connector { position:absolute; left:0; top:20px; width:100%; height:390px; overflow:visible; }
        .graph-connector path { fill:none; stroke:${COLORS.primary}; stroke-width:7; stroke-linecap:round; stroke-dasharray:100; stroke-dashoffset:100; }
        .graph-nodes { position:absolute; left:18px; right:18px; top:126px; height:190px; display:flex; align-items:center; justify-content:space-between; gap:28px; }
        .graph-node { position:relative; flex:1 1 0; min-width:0; height:164px; padding:34px 22px 20px; border:3px solid ${COLORS.primary}; border-radius:8px; background:${COLORS.surface}; box-shadow:0 12px 32px rgba(73,105,88,.12); display:flex; align-items:center; justify-content:center; text-align:center; }
        .graph-node strong { color:${COLORS.ink}; font-size:28px; font-weight:800; line-height:1.22; overflow-wrap:anywhere; }
        .node-index { position:absolute; left:16px; top:12px; color:${COLORS.secondary}; font-family:"JetBrains Mono",monospace; font-size:17px; font-weight:700; }
        .graph-count-1 .graph-node { max-width:440px; margin:0 auto; }
        .state-close { padding:10px 0 54px; display:flex; flex-direction:column; justify-content:center; gap:38px; }
        .value-terms { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .value-terms span { height:92px; display:flex; align-items:center; justify-content:center; border-bottom:7px solid ${COLORS.primary}; color:${COLORS.ink}; font-size:42px; font-weight:800; }
        .close-route { color:${COLORS.primary}; font-size:54px; font-weight:800; line-height:1.16; }
      </style>
      <div data-hf-id="${scene.id}-root" id="root" data-composition-id="${scene.id}" data-width="1920" data-height="1080" data-duration="${round3(scene.duration)}">
        <div data-hf-id="${scene.id}-stage" id="${scene.id}-stage" class="stage-fill" data-role="stage" data-zone="stage">
          <div data-hf-id="${scene.id}-world" id="${scene.id}-world" class="world" data-layout-allow-overflow="viewport-change">
            <div data-hf-id="${scene.id}-ambient-orbit" class="ambient-orbit" data-role="ambient-structure" data-zone="stage" data-layout-ignore aria-hidden="true"></div>
            <div data-hf-id="${scene.id}-ambient-rule" id="${scene.id}-ambient-rule" class="ambient-rule" data-role="ambient-structure" data-zone="stage" data-layout-ignore aria-hidden="true"></div>
            <div data-hf-id="${scene.id}-host-wrap" id="${scene.id}-host-wrap" class="host-wrap" data-role="host" data-zone="${escapeHtml(scene.layout.hostZone)}">
              <img data-hf-id="${scene.id}-host-image" id="${scene.id}-host-image" src="${escapeHtml(hostAsset)}" alt="" data-pose-id="${escapeHtml(pose)}" data-layout-allow-overflow="normalized pose crop" />
            </div>
            <div data-hf-id="${scene.id}-content-zone" id="${scene.id}-content-zone" class="content-zone" data-role="content" data-zone="${escapeHtml(scene.layout.contentZone)}">
              <div data-hf-id="${scene.id}-eyebrow" id="${scene.id}-eyebrow" class="eyebrow">SCENE ${String(scene.order).padStart(2, '0')} / ${escapeHtml(scene.role.toUpperCase())}</div>
              <div data-hf-id="${scene.id}-heading" id="${scene.id}-heading" class="heading" data-role="headline">${escapeHtml(scene.title)}</div>
              <div data-hf-id="${scene.id}-state-stage" class="state-stage" data-role="state-stage">${graphStates}${standardStates}
              </div>
            </div>
          </div>
        </div>
      </div>
      <script>
      ${renderTimeline(scene, shots, graph)}
      </script>
    </template>
  </body>
</html>`;
}

export function renderMotionSidecar(scene) {
  return JSON.stringify({
    duration: round3(scene.duration),
    assertions: [
      { kind: 'appearsBy', selector: `#${scene.id}-host-wrap`, bySec: Math.min(0.9, round3(scene.duration * 0.25)) },
      { kind: 'appearsBy', selector: `#${scene.id}-heading`, bySec: Math.min(0.95, round3(scene.duration * 0.28)) },
      { kind: 'staysInFrame', selector: `#${scene.id}-host-wrap` },
      { kind: 'staysInFrame', selector: `#${scene.id}-content-zone` },
    ],
  }, null, 2);
}
