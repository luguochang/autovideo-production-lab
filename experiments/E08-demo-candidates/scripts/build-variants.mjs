import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const experimentDir = path.resolve(here, '..');
const narration = JSON.parse(await fs.readFile(path.join(experimentDir, 'shared', 'narration.json'), 'utf8'));
const visualChapters = JSON.parse(await fs.readFile(path.join(experimentDir, 'src', 'chapters.json'), 'utf8'));
if (narration.chapters.length !== visualChapters.length) {
  throw new Error(`Narration/visual chapter mismatch: ${narration.chapters.length}/${visualChapters.length}`);
}

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const CONTENT_CENTER_Y = 585;
const rootDuration = Math.ceil((narration.duration + 0.6) * 1000) / 1000;

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const seconds = (value) => Number(Math.max(0, value).toFixed(3));
const number = (value) => Number(value.toFixed(3));
const pad = (value) => String(value).padStart(2, '0');

const variants = [
  {
    id: 'A-system-map',
    short: 'A',
    label: '工程地图巡讲',
    mode: 'map',
    colors: {
      bg: '#edf1ec', ink: '#18241f', panel: '#ffffff', accent: '#a83b34',
      secondary: '#006c73', highlight: '#f0bd3e', muted: '#64736c', line: '#9aa9a1',
    },
  },
  {
    id: 'B-whiteboard-mindmap',
    short: 'B',
    label: '中心白板脑图',
    mode: 'mindmap',
    colors: {
      bg: '#f4f5f2', ink: '#15202b', panel: '#ffffff', accent: '#1f57b8',
      secondary: '#b72f29', highlight: '#efbf36', muted: '#68717c', line: '#9aa2ab',
    },
  },
  {
    id: 'C-diagnostic-console',
    short: 'C',
    label: '工程诊断台',
    mode: 'console',
    colors: {
      bg: '#e8ecef', ink: '#101820', panel: '#fbfcfc', accent: '#4d7000',
      secondary: '#b7323a', highlight: '#2868b2', muted: '#5e6872', line: '#88939d',
    },
  },
];

const makeLayouts = (mode) => {
  if (mode === 'mindmap') {
    const points = [
      [2700, 2050], [1750, 1900], [950, 2550], [950, 3550], [1800, 4350],
      [2800, 4750], [3850, 4350], [4650, 3550], [4650, 2550], [3850, 1850],
      [2850, 850], [1700, 780], [4050, 760], [2800, 5650],
    ];
    return {
      world: {width: 6200, height: 6600},
      core: {x: 2980, y: 3190},
      chapters: points.map(([x, y], index) => ({
        x, y, width: 900, height: index === 9 ? 820 : 720, zoom: index === 9 ? 0.59 : 0.64,
      })),
    };
  }
  if (mode === 'console') {
    return {
      world: {width: 2700, height: 12700},
      chapters: visualChapters.map((_, index) => ({
        x: index % 2 === 0 ? 240 : 1370,
        y: 220 + index * 875,
        width: 1080,
        height: index === 9 ? 760 : 650,
        zoom: index === 9 ? 0.54 : 0.58,
      })),
    };
  }
  return {
    world: {width: 2300, height: 16600},
    chapters: visualChapters.map((_, index) => ({
      x: index % 2 === 0 ? 160 : 1240,
      y: 260 + index * 1150,
      width: 900,
      height: index === 9 ? 1050 : 800,
      zoom: index === 9 ? 0.57 : 0.68,
    })),
  };
};

const cameraFor = (layout) => ({
  x: WIDTH / 2 - (layout.x + layout.width / 2) * layout.zoom,
  y: CONTENT_CENTER_Y - (layout.y + layout.height / 2) * layout.zoom,
  scale: layout.zoom,
});

const renderItems = (chapter, chapterIndex, variant) => chapter.items.map((item, itemIndex) => {
  const id = `${variant.short.toLowerCase()}-c${pad(chapterIndex + 1)}-item-${pad(itemIndex + 1)}`;
  return `<li id="${id}" data-hf-id="${id}" class="fact"><span>${pad(itemIndex + 1)}</span>${escapeHtml(item)}</li>`;
}).join('');

const renderTags = (chapter, chapterIndex, variant) => chapter.tags.map((tag, tagIndex) => {
  const id = `${variant.short.toLowerCase()}-c${pad(chapterIndex + 1)}-tag-${pad(tagIndex + 1)}`;
  return `<span id="${id}" data-hf-id="${id}" class="tag">${escapeHtml(tag)}</span>`;
}).join('');

const renderChapter = (chapter, index, layout, variant) => {
  const id = `chapter-${pad(index + 1)}`;
  const modeHeader = variant.mode === 'console'
    ? `<div class="window-bar"><i></i><i></i><i></i><code>CHECK/${pad(index + 1)}</code><b>LIVE</b></div>`
    : variant.mode === 'mindmap'
      ? `<div class="marker-line"><span></span><span></span><span></span></div>`
      : `<div class="map-coordinate">NODE ${pad(index + 1)} / ${pad(visualChapters.length)}</div>`;
  return `<article id="${id}" data-hf-id="${id}" class="chapter" style="--x:${layout.x}px;--y:${layout.y}px;--w:${layout.width}px;--h:${layout.height}px;--tone:${index % 2 === 0 ? variant.colors.accent : variant.colors.secondary}">${modeHeader}<div class="chapter-head"><div><p id="${id}-kicker" data-hf-id="${id}-kicker" class="kicker">${escapeHtml(chapter.kicker)}</p><h2 id="${id}-headline" data-hf-id="${id}-headline">${escapeHtml(chapter.headline)}</h2></div><strong id="${id}-metric" data-hf-id="${id}-metric" class="metric">${escapeHtml(chapter.metric)}</strong></div><p id="${id}-subhead" data-hf-id="${id}-subhead" class="subhead">${escapeHtml(chapter.subhead)}</p><ul class="facts">${renderItems(chapter, index, variant)}</ul><div class="tags">${renderTags(chapter, index, variant)}</div></article>`;
};

const pathFor = (from, to, mode, core) => {
  const fromPoint = from
    ? {x: from.x + from.width / 2, y: from.y + from.height / 2}
    : core;
  const toPoint = {x: to.x + to.width / 2, y: to.y + to.height / 2};
  if (mode === 'mindmap') return `M ${core.x} ${core.y} L ${toPoint.x} ${toPoint.y}`;
  if (mode === 'console') {
    const middleY = (fromPoint.y + toPoint.y) / 2;
    return `M ${fromPoint.x} ${fromPoint.y} V ${middleY} H ${toPoint.x} V ${toPoint.y}`;
  }
  const middleY = (fromPoint.y + toPoint.y) / 2;
  return `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x} ${middleY}, ${toPoint.x} ${middleY}, ${toPoint.x} ${toPoint.y}`;
};

const makePaths = (layouts, variant) => layouts.chapters.map((layout, index) => {
  const core = layouts.core ?? {
    x: layouts.chapters[0].x + layouts.chapters[0].width / 2,
    y: layouts.chapters[0].y + layouts.chapters[0].height / 2,
  };
  const from = index === 0 ? null : layouts.chapters[index - 1];
  return `<path id="route-${pad(index + 1)}" data-hf-id="route-${pad(index + 1)}" class="route" pathLength="1" d="${pathFor(from, layout, variant.mode, core)}"/>`;
}).join('');

const makeCaptionMarkup = () => narration.captions.map((caption, index) => {
  const id = `caption-${String(index + 1).padStart(3, '0')}`;
  return `<p id="${id}" data-hf-id="${id}" class="caption-line">${escapeHtml(caption.text)}</p>`;
}).join('');

const makeLiveLabels = () => visualChapters.map((chapter, index) => {
  const id = `live-${pad(index + 1)}`;
  return `<div id="${id}" data-hf-id="${id}" class="live-label"><span>${pad(index + 1)}</span>${escapeHtml(chapter.kicker)}</div>`;
}).join('');

const makeCss = (variant, layouts) => `
@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}
@font-face{font-family:"SimHei";src:local("SimHei")}
*{box-sizing:border-box}html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${variant.colors.bg}}body{font-family:"Microsoft YaHei","SimHei",sans-serif;color:${variant.colors.ink};letter-spacing:0}#root{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${variant.colors.bg}}#root::before{content:"";position:absolute;inset:0;background-size:28px 28px;background-image:linear-gradient(${variant.colors.line}26 1px,transparent 1px),linear-gradient(90deg,${variant.colors.line}26 1px,transparent 1px);z-index:0}#world{position:absolute;left:0;top:0;width:${layouts.world.width}px;height:${layouts.world.height}px;transform-origin:0 0;z-index:1}.routes{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.route{fill:none;stroke:${variant.colors.line};stroke-width:${variant.mode === 'mindmap' ? 7 : 10};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}.chapter{position:absolute;left:var(--x);top:var(--y);width:var(--w);height:var(--h);padding:${variant.mode === 'console' ? '82px 48px 44px' : '46px 52px'};background:${variant.colors.panel};border:${variant.mode === 'mindmap' ? `5px solid ${variant.colors.ink}` : `3px solid ${variant.colors.ink}`};border-radius:6px;box-shadow:${variant.mode === 'map' ? `18px 18px 0 var(--tone)` : variant.mode === 'mindmap' ? `12px 14px 0 ${variant.colors.highlight}` : `14px 14px 0 ${variant.colors.ink}`};overflow:hidden;transform-origin:center}.chapter::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:12px;background:var(--tone)}.chapter-head{display:grid;grid-template-columns:1fr 190px;gap:26px;align-items:start}.kicker{margin:0 0 18px;color:var(--tone);font-size:26px;font-weight:800}.chapter h2{margin:0;font-size:${variant.mode === 'console' ? 56 : 60}px;line-height:1.16;font-weight:900;letter-spacing:0;overflow-wrap:anywhere}.metric{display:grid;place-items:center;min-height:126px;padding:14px;border:4px solid var(--tone);border-radius:4px;color:var(--tone);font-size:45px;line-height:1;text-align:center;overflow-wrap:anywhere}.subhead{margin:26px 0 24px;max-width:760px;color:${variant.colors.muted};font-size:31px;line-height:1.45;font-weight:700}.facts{display:grid;grid-template-columns:${variant.mode === 'map' ? '1fr' : '1fr 1fr'};gap:10px 18px;margin:0;padding:0;list-style:none}.fact{display:flex;align-items:center;min-height:48px;border-bottom:2px solid ${variant.colors.line}66;color:${variant.colors.ink};font-size:${variant.mode === 'console' ? 25 : 27}px;font-weight:700;line-height:1.3}.fact span{display:inline-grid;place-items:center;flex:0 0 34px;width:34px;height:30px;margin-right:14px;background:#000;color:#fff;font-size:17px}.tags{position:absolute;left:52px;right:52px;bottom:34px;display:flex;gap:12px;flex-wrap:wrap}.tag{padding:7px 12px;border:2px solid ${variant.colors.ink};background:${variant.colors.bg};font-size:20px;font-weight:800}.map-coordinate{display:inline-block;margin:-10px 0 24px;padding:8px 12px;background:${variant.colors.ink};color:#fff;font-family:Consolas,monospace;font-size:18px;font-weight:700}.marker-line{display:flex;gap:15px;margin:-10px 0 24px}.marker-line span{width:62px;height:10px;background:${variant.colors.accent};transform:rotate(-2deg)}.marker-line span:nth-child(2){background:${variant.colors.highlight};transform:rotate(2deg)}.marker-line span:nth-child(3){background:${variant.colors.secondary};transform:rotate(-1deg)}.window-bar{position:absolute;left:0;right:0;top:0;height:54px;display:flex;align-items:center;gap:12px;padding:0 20px;background:${variant.colors.ink};color:#fff}.window-bar i{width:13px;height:13px;background:${variant.colors.secondary};border-radius:50%}.window-bar i:nth-child(2){background:${variant.colors.highlight}}.window-bar i:nth-child(3){background:${variant.colors.accent}}.window-bar code{margin-left:10px;font-size:18px}.window-bar b{margin-left:auto;color:#fff;font-size:18px}.mind-core{position:absolute;left:${(layouts.core?.x ?? 0) - 260}px;top:${(layouts.core?.y ?? 0) - 105}px;width:520px;height:210px;display:grid;place-items:center;border:6px solid ${variant.colors.ink};background:${variant.colors.highlight};box-shadow:14px 14px 0 ${variant.colors.secondary};font-size:44px;font-weight:900;text-align:center}.top-safe-mask{position:absolute;left:0;right:0;top:0;height:280px;z-index:18;background:${variant.colors.bg}}.brand{position:absolute;left:34px;top:34px;z-index:20;padding:14px 18px;background:${variant.colors.ink};color:#fff;font-size:19px;font-weight:900}.brand b{color:${variant.colors.highlight}}.live-stack{position:absolute;right:34px;top:34px;width:230px;height:52px;z-index:20}.live-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;gap:12px;color:${variant.colors.ink};font-size:19px;font-weight:900;opacity:0}.live-label span{display:grid;place-items:center;width:48px;height:48px;background:${variant.colors.secondary};color:#fff}.progress-track{position:absolute;left:34px;right:34px;top:104px;height:6px;background:${variant.colors.line}66;z-index:20}.progress-fill{width:100%;height:100%;background:${variant.colors.accent};transform:scaleX(0);transform-origin:left center}.caption-safe-mask{position:absolute;left:0;right:0;bottom:0;height:280px;z-index:28;background:${variant.colors.bg}}.caption-rail{position:absolute;left:34px;right:34px;bottom:34px;height:164px;z-index:30;display:grid;place-items:center;padding:30px 34px;background:${variant.colors.ink};border-bottom:8px solid ${variant.colors.highlight};color:#fff}.caption-line{position:absolute;left:32px;right:32px;margin:0;font-size:32px;line-height:1.45;font-weight:800;text-align:center;opacity:0;overflow-wrap:anywhere}.chapter-dots{position:absolute;right:16px;top:178px;z-index:25;display:grid;gap:10px}.chapter-dots i{display:block;width:7px;height:34px;background:${variant.colors.line};border-radius:2px}.sentinel{position:absolute;width:1px;height:1px;opacity:0}${variant.mode === 'mindmap' ? `.chapter{background:transparent;border:0;box-shadow:none;overflow:visible;padding:34px 52px}.chapter::after{width:68%;height:8px}.metric{background:#fff}.tag{background:#fff}` : ''}
`;

const makeTimeline = (variant, layouts) => {
  const lines = ['window.__timelines=window.__timelines||{};', 'const tl=gsap.timeline({paused:true});'];
  layouts.chapters.forEach((layout, index) => {
    const id = `#chapter-${pad(index + 1)}`;
    lines.push(`tl.set("${id}",{opacity:0,y:34,scale:.9},0);`);
    lines.push(`tl.set("#route-${pad(index + 1)}",{strokeDashoffset:1},0);`);
    lines.push(`tl.set("#live-${pad(index + 1)}",{opacity:0},0);`);
    visualChapters[index].items.forEach((_, itemIndex) => {
      lines.push(`tl.set("#${variant.short.toLowerCase()}-c${pad(index + 1)}-item-${pad(itemIndex + 1)}",{opacity:0,y:18},0);`);
    });
  });
  narration.captions.forEach((_, index) => {
    lines.push(`tl.set("#caption-${String(index + 1).padStart(3, '0')}",{opacity:0},0);`);
  });
  if (variant.mode === 'mindmap') lines.push('tl.set("#mind-core",{opacity:0,scale:.8},0);');
  const initialCamera = cameraFor(layouts.chapters[0]);
  lines.push(`tl.set("#world",{x:${number(initialCamera.x)},y:${number(initialCamera.y)},scale:${initialCamera.scale}},0);`);
  lines.push(`tl.set("#progress-fill",{scaleX:0},0);`);
  lines.push(`tl.to("#progress-fill",{scaleX:1,duration:${seconds(narration.duration)},ease:"none"},0);`);
  if (variant.mode === 'mindmap') lines.push('tl.to("#mind-core",{opacity:1,scale:1,duration:.8,ease:"back.out(1.25)"},.2);');

  narration.chapters.forEach((timing, index) => {
    const layout = layouts.chapters[index];
    const camera = cameraFor(layout);
    const start = seconds(timing.start);
    const transition = Math.min(1.35, Math.max(0.78, timing.duration * 0.08));
    if (index > 0) {
      lines.push(`tl.to("#world",{x:${number(camera.x)},y:${number(camera.y)},scale:${camera.scale},duration:${seconds(transition)},ease:"power3.inOut"},${start});`);
      lines.push(`tl.to("#chapter-${pad(index)}",{scale:.84,opacity:1,duration:.55,ease:"power2.out"},${start});`);
      lines.push(`tl.to("#live-${pad(index)}",{opacity:0,duration:.18},${start});`);
    }
    const reveal = seconds(start + Math.min(0.42, transition * 0.32));
    lines.push(`tl.to("#route-${pad(index + 1)}",{strokeDashoffset:0,duration:${seconds(Math.min(0.9, timing.duration * 0.08))},ease:"power2.out"},${start});`);
    lines.push(`tl.to("#chapter-${pad(index + 1)}",{opacity:1,y:0,scale:1,duration:.72,ease:"back.out(1.22)"},${reveal});`);
    lines.push(`tl.to("#live-${pad(index + 1)}",{opacity:1,duration:.22},${reveal});`);
    lines.push(`tl.to("#chapter-${pad(index + 1)}-metric",{scale:1.08,duration:.28,yoyo:true,repeat:1,ease:"power2.inOut"},${seconds(reveal + 0.52)});`);
    visualChapters[index].items.forEach((_, itemIndex) => {
      const itemAt = seconds(reveal + 0.62 + itemIndex * Math.min(0.28, timing.duration * 0.025));
      lines.push(`tl.to("#${variant.short.toLowerCase()}-c${pad(index + 1)}-item-${pad(itemIndex + 1)}",{opacity:1,y:0,duration:.38,ease:"power2.out"},${itemAt});`);
    });
  });

  narration.captions.forEach((caption, index) => {
    const selector = `#caption-${String(index + 1).padStart(3, '0')}`;
    const start = seconds(caption.start);
    const end = seconds(Math.max(caption.start + 0.24, caption.end));
    lines.push(`tl.to("${selector}",{opacity:1,duration:.08},${start});`);
    lines.push(`tl.to("${selector}",{opacity:0,duration:.08},${seconds(end - 0.08)});`);
  });
  lines.push(`tl.set("#timeline-sentinel",{opacity:0},${rootDuration});`);
  lines.push('window.__timelines.main=tl;');
  return lines.join('');
};

for (const variant of variants) {
  const layouts = makeLayouts(variant.mode);
  const variantDir = path.join(experimentDir, 'variants', variant.id);
  const assetsDir = path.join(variantDir, 'assets');
  await fs.mkdir(assetsDir, {recursive: true});
  await fs.copyFile(path.join(experimentDir, 'shared', 'narration.wav'), path.join(assetsDir, 'narration.wav'));
  await fs.copyFile(path.join(experimentDir, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), path.join(assetsDir, 'gsap.min.js'));
  const chapters = visualChapters.map((chapter, index) => renderChapter(chapter, index, layouts.chapters[index], variant)).join('');
  const core = variant.mode === 'mindmap'
    ? `<div id="mind-core" data-hf-id="mind-core" class="mind-core">AI 系统能力<br/>不是一次演示</div>`
    : '';
  const dots = visualChapters.map(() => '<i></i>').join('');
  const html = `<!doctype html><html lang="zh-CN" data-resolution="portrait"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${WIDTH},height=${HEIGHT}"/><script src="assets/gsap.min.js"></script><style>${makeCss(variant, layouts)}</style></head><body><main id="root" data-composition-id="main" data-start="0" data-duration="${rootDuration}" data-width="${WIDTH}" data-height="${HEIGHT}" data-fps="${FPS}" data-layout-allow-overflow><audio id="narration" src="assets/narration.wav" data-start="0" data-duration="${seconds(narration.duration)}" data-track-index="0"></audio><div class="top-safe-mask" data-layout-allow-occlusion></div><div id="brand" data-hf-id="brand" class="brand" data-layout-allow-occlusion data-layout-allow-overlap><b>${variant.short}</b> / ${escapeHtml(variant.label)}</div><div class="live-stack">${makeLiveLabels()}</div><div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div><div class="chapter-dots">${dots}</div><section id="world" data-hf-id="world" data-layout-allow-overflow><svg class="routes" viewBox="0 0 ${layouts.world.width} ${layouts.world.height}" aria-hidden="true">${makePaths(layouts, variant)}</svg>${core}${chapters}</section><div class="caption-safe-mask" data-layout-allow-occlusion></div><div class="caption-rail" data-layout-allow-occlusion data-layout-allow-overlap>${makeCaptionMarkup()}</div><span id="timeline-sentinel" class="sentinel"></span></main><script>${makeTimeline(variant, layouts)}</script></body></html>`;
  const packageJson = {
    name: variant.id.toLowerCase(),
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'npx --yes hyperframes@0.7.59 preview',
      lint: 'npx --yes hyperframes@0.7.59 lint',
      check: 'npx --yes hyperframes@0.7.59 check --snapshots',
      render: 'npx --yes hyperframes@0.7.59 render',
    },
  };
  await Promise.all([
    fs.writeFile(path.join(variantDir, 'index.html'), html, 'utf8'),
    fs.writeFile(path.join(variantDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(variantDir, 'meta.json'), `${JSON.stringify({id: variant.id, name: variant.label, createdAt: new Date().toISOString()}, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(variantDir, 'hyperframes.json'), `${JSON.stringify({
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
      paths: {blocks: 'compositions', components: 'compositions/components', assets: 'assets'},
    }, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(variantDir, 'board.json'), `${JSON.stringify({
      schemaVersion: 'demo-candidate-board/v1',
      variant: {id: variant.id, label: variant.label, mode: variant.mode, colors: variant.colors},
      video: {width: WIDTH, height: HEIGHT, fps: FPS, duration: rootDuration},
      world: layouts.world,
      chapters: visualChapters.map((chapter, index) => ({...chapter, ...narration.chapters[index], layout: layouts.chapters[index]})),
    }, null, 2)}\n`, 'utf8'),
  ]);
  console.log(`Built ${variant.id}: ${rootDuration}s, ${narration.captions.length} captions`);
}
