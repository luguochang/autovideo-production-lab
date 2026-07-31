import assert from 'node:assert/strict';
import test from 'node:test';
import {applyPersistentHostPolicy} from '../compile-production.mjs';
import { extractDisplayKeywords, renderContinuousIndex } from '../lib/render-continuous-index.mjs';

const scenes = [
  {
    id: 'scene-01', order: 1, role: 'hook', title: '对AI技术保持敬畏', start: 0, end: 4, duration: 4,
    layout: {hostPose: 'question', hostZone: 'host.left', contentZone: 'content.right'},
  },
  {
    id: 'scene-02', order: 2, role: 'process', title: '系统需要维护', start: 4, end: 8, duration: 4,
    layout: {hostPose: 'explain', hostZone: 'host.left', contentZone: 'content.right'},
  },
];

const shots = [
  {
    cueId: 'cue-001', sceneId: 'scene-01', narration: '对AI技术保持敬畏，也要擦亮双眼。',
    start: 0, end: 4, duration: 4, screenText: {text: '对AI技术保持敬畏'},
  },
  {
    cueId: 'cue-002', sceneId: 'scene-02', narration: '真正的系统需要开发、维护和测试。',
    start: 4, end: 8, duration: 4,
    screenText: {text: '维护｜测试｜回滚', type: 'manual-keywords'},
    visualVariant: 'stack',
  },
];

test('keyword extraction prioritizes technical concepts over filler words', () => {
  assert.deepEqual(
    extractDisplayKeywords('我奉劝很多人，对AI技术一定要有敬畏之心，也希望大家擦亮双眼。'),
    ['AI技术', '敬畏', '擦亮双眼'],
  );
});

test('keyword extraction removes conversational glue from the main visual', () => {
  const keywords = extractDisplayKeywords('尤其是你想知道它怎么处理失败，数据是否可信。');
  assert.ok(keywords.includes('失败'));
  assert.ok(keywords.includes('数据'));
  assert.ok(!keywords.some((term) => ['尤其是', '你想', '怎么', '是否'].includes(term)));
});

test('continuous index keeps the stage, host and content zones persistent', () => {
  const html = renderContinuousIndex({
    manifest: {projectId: 'fixture', timeline: {duration: 8}},
    scenes,
    shots,
    hostAssets: new Map([
      ['question', './assets/host/question.png'],
      ['explain', './assets/host/explain.png'],
    ]),
  });

  assert.match(html, /id="host-zone"[^>]+data-zone="host\.left"/);
  assert.match(html, /id="content-zone"[^>]+data-zone="content\.right"/);
  assert.doesNotMatch(html, /data-composition-src=/);
  assert.match(html, /class="host-pose is-initial"/);
  assert.match(html, /class="visual-state visual-focus is-initial"/);
  assert.match(html, /data-derived-text="keyword-extract"/);
  assert.match(html, /data-derived-text="manual-keywords"[^>]+data-visual-variant="stack"/);
  assert.match(html, />维护<\/strong>/);
  assert.match(html, />测试<\/strong>/);
  assert.match(html, /data-text-type="exact-source"[^>]*>.*对AI技术保持敬畏，也要擦亮双眼。/);
  assert.match(html, /id="root"[^>]+data-duration="8\.35"/);
  assert.match(html, /id="caption-cue-001"[^>]+class="caption-cue is-initial"[^>]+data-cue-start="0\.35"/);
  assert.doesNotMatch(html, /class="clip caption-cue"/);
  assert.match(html, /id="narration-final"[^>]+data-start="0\.35"[^>]+data-track-index="30"/);
  assert.match(html.match(/<audio[^>]+id="narration-final"[^>]*>/)?.[0] ?? '', /data-duration="8"/);
  assert.doesNotMatch(html.match(/<audio[^>]+id="narration-final"[^>]*>/)?.[0] ?? '', /data-end=/);
  assert.match(html, /data-hf-id="lucide-receipt"[^>]+class="lucide-receipt"/);
  const renderedBody = html.match(/<body>([\s\S]*?)<script>/)?.[1] ?? '';
  const editableTags = [...renderedBody.matchAll(/<(?:div|span|strong|svg|path|line|circle|rect|img|audio|figure|figcaption)\b[^>]*>/g)];
  assert.equal(editableTags.filter((match) => !/\bdata-hf-id=/.test(match[0])).length, 0);
  assert.match(html, /durationAnchor/);
  assert.match(html, /compact-history/);
  assert.match(html, /tl\.set\("#host-pose-question", \{ opacity: 0 \}, 4\.23\)/);
});

test('continuous index consumes versioned recipes, frozen media, and semantic SFX', () => {
  const creativeShots = structuredClone(shots);
  creativeShots[1] = {
    ...creativeShots[1],
    visualType: 'evidence-image',
    motionRecipeRefs: [{
      libraryId: 'knowledge-explainer',
      libraryVersion: '1.0.0',
      recipeId: 'evidence-pivot',
      version: '1.0.0',
      params: {entrance: 'wipe', handoff: 'fade', enterSeconds: 0.7, handoffSeconds: 0.4, staggerSeconds: 0.09, variant: 'signal'},
      sourceCueIds: ['cue-002'],
    }],
    assetRefs: [{assetId: 'image_001', role: 'evidence', zone: 'content.right', required: true, sourceCueIds: ['cue-002']}],
    resolvedAssets: [{assetId: 'image_001', type: 'image', src: './assets/media/image_001.png'}],
    sfxRefs: [{assetId: 'sfx_001', role: 'focus-hit', event: 'enter', cueId: 'cue-002', offsetMs: 120, gainDb: -18, duckingDb: -4}],
    resolvedSfx: [{assetId: 'sfx_001', role: 'focus-hit', src: './assets/audio/sfx/sfx_001.wav', duration: 0.2, offsetMs: 120, gainDb: -18}],
  };
  const html = renderContinuousIndex({
    manifest: {projectId: 'fixture', timeline: {duration: 8}},
    scenes,
    shots: creativeShots,
    hostAssets: new Map([
      ['question', './assets/host/question.png'],
      ['explain', './assets/host/explain.png'],
    ]),
  });

  assert.match(html, /data-visual-type="evidence-image"[^>]+data-motion-recipe="evidence-pivot@1\.0\.0"/);
  assert.match(html, /src="\.\/assets\/media\/image_001\.png"/);
  assert.match(html, /id="sfx-cue-002-1"[^>]+class="clip"[^>]+data-role="semantic-sfx"/);
  assert.match(html, /data-volume="0\.126"/);
  assert.match(html, /duration: 0\.7/);
});

test('continuous index renders approved summaries and Graph IR instead of re-extracting narration', () => {
  const graphShots = structuredClone(shots);
  graphShots[1] = {
    ...graphShots[1],
    narration: '真正遇到报错时，要判断问题出在模型、接口、权限、数据还是状态。',
    screenText: {text: '问题在哪一层？', type: 'generated-summary', sourceCueIds: ['cue-002']},
    visualVariant: undefined,
    visualType: 'diagram',
    motionRecipeRefs: [{
      libraryId: 'knowledge-explainer',
      libraryVersion: '1.0.0',
      recipeId: 'diagram-build',
      version: '1.0.0',
      params: {entrance: 'wipe', handoff: 'compact-up', enterSeconds: 0.7, handoffSeconds: 0.5, staggerSeconds: 0.09, variant: 'route'},
      sourceCueIds: ['cue-002'],
    }],
    assetRefs: [{assetId: 'icon-workflow', role: 'icon', zone: 'content.right', required: false, sourceCueIds: ['cue-002']}],
    resolvedAssets: [{assetId: 'icon-workflow', type: 'icon', role: 'icon', src: './assets/media/icon-workflow.svg'}],
  };
  const html = renderContinuousIndex({
    manifest: {projectId: 'fixture', timeline: {duration: 8}},
    scenes,
    shots: graphShots,
    graphs: [{
      id: 'graph-scene-02',
      sceneId: 'scene-02',
      nodes: [
        {id: 'node-model', label: '模型', sourceCueIds: ['cue-002']},
        {id: 'node-api', label: '接口', sourceCueIds: ['cue-002']},
        {id: 'node-auth', label: '权限', sourceCueIds: ['cue-002']},
        {id: 'node-data', label: '数据', sourceCueIds: ['cue-002']},
        {id: 'node-state', label: '上下游 / 状态', sourceCueIds: ['cue-002']},
      ],
    }],
    graphLayouts: [{
      graphId: 'graph-scene-02',
      layout: {
        id: 'graph-scene-02',
        width: 844,
        height: 120,
        children: [
          {id: 'node-model', x: 12, y: 12, width: 120, height: 96},
          {id: 'node-api', x: 162, y: 12, width: 120, height: 96},
          {id: 'node-auth', x: 332, y: 12, width: 120, height: 96},
          {id: 'node-data', x: 482, y: 12, width: 120, height: 96},
          {id: 'node-state', x: 652, y: 12, width: 180, height: 96},
        ],
        edges: [],
      },
    }],
    hostAssets: new Map([
      ['question', './assets/host/question.png'],
      ['explain', './assets/host/explain.png'],
    ]),
  });

  assert.match(html, /data-derived-text="generated-summary"[^>]+data-visual-type="diagram"/);
  assert.match(html, /class="route-title">问题在哪一层？<\/div>/);
  assert.match(html, />模型 \/ 接口<\/strong>/);
  assert.match(html, />权限 \/ 数据<\/strong>/);
  assert.match(html, />上下游 \/ 状态<\/strong>/);
  assert.match(html, /data-graph-layout="bound"/);
  assert.match(html, /class="supporting-assets"/);
  assert.match(html, /src="\.\/assets\/media\/icon-workflow\.svg"/);
  assert.doesNotMatch(html, /class="media-frame"/);
  assert.match(html, /data-layout-node-ids="node-model,node-api"/);
  assert.match(html, /\.route-line, #visual-cue-002 \.route-layout-line/);
  assert.doesNotMatch(html, /把便宜的生成/);
});

test('continuous index renders bounded primary carriers inside content.right without replacing host shell', () => {
  const carrierShots = structuredClone(shots);
  carrierShots[1] = {
    ...carrierShots[1],
    visualType: 'data-proof',
    carrierPayload: {
      adapterId: 'data-chart-bounded', adapterVersion: '1.0.0', zone: 'content.right',
      sourceReceipt: 'hf-registry:data-chart@02ccb24bfa21850d', sourceCueIds: ['cue-002'],
      evidence: {status: 'verified', label: '本地数据', receipt: {kind: 'claim', id: 'claim-fixture', sha256: 'a'.repeat(64)}},
      data: {title: '接口稳定性', unit: '%', highlightIndex: 1, series: [{label: '旧链路', value: 32}, {label: '新链路', value: 68}]},
    },
    motionRecipeRefs: [{recipeId: 'data-proof', version: '1.0.0', libraryId: 'knowledge-explainer', libraryVersion: '1.0.0', params: {}, sourceCueIds: ['cue-002']}],
  };
  const html = renderContinuousIndex({manifest: {projectId: 'fixture', timeline: {duration: 8}}, scenes, shots: carrierShots, hostAssets: new Map([['question', './assets/host/question.png'], ['explain', './assets/host/explain.png']])});
  assert.match(html, /data-carrier-adapter="data-chart-bounded@1\.0\.0"/);
  assert.match(html, /class="chart-bar-fill"/);
  assert.match(html, /data-zone="host\.left"/);
  assert.match(html, /data-zone="content\.right"/);
  assert.match(html, /chart-bar-fill.*scaleY/);
});

test('persistent host policy normalizes every scene and shot to the approved shell', () => {
  const result = applyPersistentHostPolicy({
    scenes: [{id: 'scene-01', layout: {hostPose: 'explain', hostZone: 'host.right', contentZone: 'content.left'}}],
    shots: [{cueId: 'cue-001', zones: ['host.right', 'content.left', 'caption']}],
  });

  assert.equal(result.normalizedScenes, 1);
  assert.equal(result.scenes[0].layout.hostZone, 'host.left');
  assert.equal(result.scenes[0].layout.contentZone, 'content.right');
  assert.deepEqual(result.shots[0].zones, ['caption', 'host.left', 'content.right']);
});

