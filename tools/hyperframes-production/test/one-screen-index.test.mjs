import assert from 'node:assert/strict';
import test from 'node:test';
import {applyOneScreenHostPolicy} from '../compile-production.mjs';
import {renderOneScreenIndex} from '../lib/render-one-screen-index.mjs';

const scenes = [
  {id: 'scene-01', order: 1, role: 'hook', title: '平台隐藏复杂性', layout: {hostPose: 'question', hostZone: 'host.left', contentZone: 'content.right'}},
  {id: 'scene-02', order: 2, role: 'close', title: '先定位问题层', layout: {hostPose: 'close', hostZone: 'host.right', contentZone: 'content.left'}},
];

const shots = [
  {cueId: 'cue-001', sceneId: 'scene-01', narration: '平台会把系统的复杂性藏起来。', start: 0, end: 2, duration: 2, screenText: {text: '隐藏复杂性', type: 'generated-summary'}, visualType: 'keyword'},
  {cueId: 'cue-002', sceneId: 'scene-01', narration: '模型、接口和数据被包装成节点。', start: 2, end: 4, duration: 2, screenText: {text: '按钮｜节点', type: 'generated-summary'}, visualType: 'diagram'},
  {cueId: 'cue-003', sceneId: 'scene-02', narration: '遇到报错时，先定位问题层。', start: 4, end: 6, duration: 2, screenText: {text: '先定位问题层', type: 'generated-summary'}, visualType: 'keyword'},
];

test('one-screen host policy fixes both the shell and pose for the whole timeline', () => {
  const result = applyOneScreenHostPolicy({scenes, shots});
  assert.equal(result.fixedHostPose, 'question');
  assert.equal(result.normalizedHostPoses, 1);
  assert.equal(result.normalizedScenes, 1);
  assert.ok(result.scenes.every((scene) => scene.layout.hostPose === 'question'));
  assert.ok(result.scenes.every((scene) => scene.layout.hostZone === 'host.left'));
  assert.ok(result.shots.every((shot) => shot.hostPose === 'question'));
});

test('one-screen renderer precomputes non-overlapping steps and never creates residual handoffs', () => {
  const normalized = applyOneScreenHostPolicy({scenes, shots});
  const html = renderOneScreenIndex({
    manifest: {projectId: 'fixture', timeline: {duration: 6}},
    scenes: normalized.scenes,
    shots: normalized.shots,
    hostAssets: new Map([['question', './assets/host/question.png']]),
    graphs: [{
      id: 'graph-scene-02',
      sceneId: 'scene-02',
      nodes: [
        {id: 'model', label: '模型', sourceCueIds: ['cue-003']},
        {id: 'api', label: '接口', sourceCueIds: ['cue-003']},
        {id: 'auth', label: '权限', sourceCueIds: ['cue-003']},
        {id: 'data', label: '数据', sourceCueIds: ['cue-003']},
        {id: 'state', label: '上下游 / 状态', sourceCueIds: ['cue-003']},
      ],
    }],
  });

  assert.match(html, /data-layout-mode="one-screen-board"/);
  assert.match(html, /data-step-count="3"/);
  assert.match(html, /data-all-content-precomputed="true"/);
  assert.equal((html.match(/<img[^>]+id="host-pose-fixed"/g) ?? []).length, 1);
  assert.equal((html.match(/class="board-step(?: |")/g) ?? []).length, 3);
  assert.match(html, /id="visual-cue-001"[^>]+data-final-position="0,154,551,259"/);
  assert.match(html, /id="visual-cue-002"[^>]+data-final-position="579,154,551,259"/);
  assert.match(html, /id="visual-cue-003"[^>]+data-final-position="579,437,551,259"/);
  assert.doesNotMatch(html, /animated-handoff/);
  assert.doesNotMatch(html, /compact-history/);
  assert.doesNotMatch(html, /opacity: 0\.14/);
  assert.doesNotMatch(html, /host-pose-close/);
  assert.doesNotMatch(html, /tl\.to\("#visual-cue-001", \{ opacity: 0/);
  assert.match(html, /tl\.fromTo\("#visual-cue-003"/);
  assert.match(html, /id="caption-cue-003"[^>]+data-text-type="exact-source"/);
  assert.match(html, /id="narration-final"[^>]+class="clip"[^>]+data-duration="6"/);
  assert.match(html, />模型 \/ 接口<\/span>/);
  assert.match(html, />权限 \/ 数据<\/span>/);
  assert.match(html, />上下游 \/ 状态<\/span>/);
});

test('one-screen renderer rejects more than six semantic beats', () => {
  const tooMany = Array.from({length: 7}, (_, index) => ({
    ...shots[0],
    cueId: `cue-${String(index + 1).padStart(3, '0')}`,
    start: index,
    end: index + 1,
    duration: 1,
  }));
  assert.throws(() => renderOneScreenIndex({
    manifest: {projectId: 'fixture', timeline: {duration: 7}},
    scenes: [scenes[0]],
    shots: tooMany,
    hostAssets: new Map([['question', './assets/host/question.png']]),
  }), /supports 1-6 cues/);
});
