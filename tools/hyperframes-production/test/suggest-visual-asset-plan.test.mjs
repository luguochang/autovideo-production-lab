import assert from 'node:assert/strict';
import test from 'node:test';
import {suggestVisualAssetPlan} from '../lib/suggest-visual-asset-plan.mjs';

const assets = [
  {id: 'icon-workflow', type: 'icon', aliases: ['流程', '工作流', '节点'], recipeIds: ['diagram-build'], status: 'available'},
  {id: 'icon-debug-bug', type: 'icon', aliases: ['报错', '错误', '调试'], recipeIds: ['code-proof', 'comparison-split'], status: 'available'},
  {id: 'icon-data-store', type: 'icon', aliases: ['数据', '状态'], recipeIds: ['data-proof', 'diagram-build'], status: 'available'},
  {id: 'icon-click-pointer', type: 'icon', aliases: ['点击', '拖拽', '按钮'], recipeIds: ['device-surface-tour', 'comparison-split'], status: 'available'},
];

test('visual asset suggestions require a semantic local match and preserve density', () => {
  const plan = suggestVisualAssetPlan({
    projectId: 'visual-plan-test',
    assetLibrary: {assets},
    shots: [
      {cueId: 'cue-001', start: 0, end: 3, visualType: 'keyword', narration: '这是一个抽象开场。'},
      {cueId: 'cue-002', start: 3, end: 8, visualType: 'diagram', narration: '工作流把多个节点连起来。'},
      {cueId: 'cue-003', start: 8, end: 12, visualType: 'comparison', narration: '拖拽按钮，不等于真正理解。'},
      {cueId: 'cue-004', start: 12, end: 18, visualType: 'diagram', narration: '报错时先看数据状态。'},
    ],
  });
  assert.equal(plan.status, 'candidate');
  assert.equal(plan.policy.autoAttach, false);
  assert.equal(plan.candidates.length, 3);
  assert.deepEqual(plan.candidates.map((item) => item.assetId), ['icon-workflow', 'icon-click-pointer', 'icon-data-store']);
  assert.deepEqual(plan.deferred, [{cueId: 'cue-001', reason: 'no-semantic-local-asset-match'}]);
});

test('visual asset suggestions do not repeatedly force the same asset', () => {
  const plan = suggestVisualAssetPlan({
    projectId: 'visual-plan-test',
    assetLibrary: {assets: [assets[0]]},
    shots: [
      {cueId: 'cue-001', start: 0, end: 3, visualType: 'diagram', narration: '工作流的节点关系。'},
      {cueId: 'cue-002', start: 3, end: 6, visualType: 'diagram', narration: '另一个工作流节点。'},
    ],
  });
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].assetId, 'icon-workflow');
  assert.deepEqual(plan.deferred, [{cueId: 'cue-002', reason: 'no-semantic-local-asset-match'}]);
});
