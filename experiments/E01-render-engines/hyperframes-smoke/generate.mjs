import {readFile, writeFile} from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('./canvas.json', import.meta.url), 'utf8'));

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const cards = data.objects.map((object) => `
      <article id="${escapeHtml(object.id)}" class="canvas-object card"
        style="--x:${object.x}px;--y:${object.y}px;--accent:${escapeHtml(object.color)}">
        <div class="eyebrow">知识节点</div>
        <h2>${escapeHtml(object.text)}</h2>
        <p>${escapeHtml(object.subtitle)}</p>
      </article>`).join('');

const operations = JSON.stringify(data.operations);
const initialPositions = JSON.stringify(Object.fromEntries(data.objects.map((object) => [object.id, {x: object.x, y: object.y}])));
const html = `<!doctype html>
<html lang="zh-CN" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${data.meta.width}, height=${data.meta.height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}
      @font-face{font-family:"Noto Sans CJK SC";src:local("Noto Sans CJK SC")}
      * {box-sizing:border-box} html,body{margin:0;width:${data.meta.width}px;height:${data.meta.height}px;overflow:hidden;background:${data.canvas.background}}
      body{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#182326}
      #root{position:relative;width:100%;height:100%;overflow:hidden;background:${data.canvas.background}}
      #grain{position:absolute;inset:0;opacity:.18;background-image:radial-gradient(#182326 0.7px,transparent 0.7px);background-size:14px 14px;z-index:5;pointer-events:none}
      #camera{position:absolute;left:0;top:0;width:${data.canvas.width}px;height:${data.canvas.height}px;transform-origin:0 0}
      .guide{position:absolute;left:160px;top:690px;width:2250px;border-top:5px solid #b8b0a2;opacity:.55}
      .canvas-object{position:absolute;left:var(--x);top:var(--y);width:520px;min-height:250px;padding:34px 42px;background:#fffdf8;border:4px solid #182326;box-shadow:14px 14px 0 var(--accent);opacity:0;transform:translateY(36px) scale(.88);transform-origin:center}
      .canvas-object::after{content:"";position:absolute;left:50%;bottom:-145px;width:5px;height:140px;background:var(--accent);transform:translateX(-50%)}
      .eyebrow{font-size:23px;color:var(--accent);font-weight:800}
      h2{margin:10px 0 8px;font-size:74px;line-height:1;letter-spacing:0}
      p{margin:0;font-size:29px;line-height:1.4;color:#48595b}
      #badge{position:absolute;left:70px;top:66px;z-index:6;padding:15px 22px;background:#182326;color:#fff;font-size:25px;font-weight:800}
      #caption{position:absolute;left:260px;right:260px;bottom:55px;z-index:10;padding:22px 40px;background:rgba(24,35,38,.9);color:#fff;text-align:center;font-size:34px;font-weight:700}
    </style>
  </head>
  <body>
    <main id="root" data-composition-id="main" data-start="0" data-duration="${data.meta.duration}" data-width="${data.meta.width}" data-height="${data.meta.height}" data-fps="${data.meta.fps}">
      <audio id="narration" src="assets/narration.wav" data-start="0" data-duration="${data.meta.duration}" data-track-index="0"></audio>
      <div id="badge">连续画板 / JSON 驱动</div>
      <section id="camera"><div class="guide"></div>${cards}</section>
      <div id="grain"></div>
      <div id="caption">对象不切页：保留、移动、强调，再由镜头带到下一块知识区域</div>
    </main>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({paused:true});
      const operations = ${operations};
      const initialPositions = ${initialPositions};
      for (const action of operations) {
        const selector = action.target ? '#' + action.target : '#camera';
        if (action.op === 'add') {
          tl.to(selector, {opacity:1, y:0, scale:1, duration:action.duration, ease:'back.out(1.35)'}, action.at);
        } else if (action.op === 'move') {
          const initial = initialPositions[action.target];
          tl.to(selector, {x:action.x - initial.x, y:action.y - initial.y, scale:action.scale ?? 1, duration:action.duration, ease:'power2.inOut'}, action.at);
        } else if (action.op === 'highlight') {
          tl.to(selector, {scale:action.scale, duration:action.duration / 2, ease:'power2.out', yoyo:true, repeat:1}, action.at);
        } else if (action.op === 'camera') {
          tl.to('#camera', {x:action.x, y:action.y, scale:action.zoom, duration:action.duration, ease:'power2.inOut'}, action.at);
        }
      }
      tl.set({}, {}, ${data.meta.duration});
      window.__timelines.main = tl;
    </script>
  </body>
</html>`;

await writeFile(new URL('./index.html', import.meta.url), html, 'utf8');
console.log(`Generated index.html from ${data.objects.length} objects and ${data.operations.length} operations.`);
