import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeVisualPlanArtifact} from '../lib/visual-plan-review.mjs';

const fixture = () => ({
  projectId: 'review-demo',
  workbenchRevision: 3,
  planningDigestSha256: 'a'.repeat(64),
  storyboard: {
    format: {ratio: '16:9', width: 1920, height: 1080, fps: 30, audioDurationSeconds: 30},
    persistentZones: ['host', 'content', 'caption'],
    scenes: [
      {id: 'scene-01', order: 1, role: 'hook', title: '开场', timing: {start: 0, end: 12, duration: 12}, layout: {hostZone: 'host.left', contentZone: 'content.right', captionZone: 'caption'}, screenText: [{type: 'exact-source', text: '先看整个流程'}]},
      {id: 'scene-02', order: 2, role: 'process', title: '过程', timing: {start: 12, end: 30, duration: 18}, layout: {hostZone: 'host.left', contentZone: 'content.right', captionZone: 'caption'}, screenText: [{type: 'exact-source', text: '再逐步展开'}]},
    ],
  },
  graphIr: {graphs: [{id: 'graph-01'}]},
  shotManifest: {
    shots: [
      {cueId: 'cue-01', start: 0, hostPose: 'question', zones: ['host.left', 'content.right', 'caption'], visualType: 'keyword', screenText: {type: 'exact-source'}, motionRecipeRefs: [{recipeId: 'keyword-handoff'}], carrierPayload: null, sfxRefs: []},
      {cueId: 'cue-02', start: 12, hostPose: 'present', zones: ['host.left', 'content.right', 'caption'], visualType: 'diagram', screenText: {type: 'exact-source'}, motionRecipeRefs: [{recipeId: 'diagram-build'}], carrierPayload: null, sfxRefs: []},
      {cueId: 'cue-03', start: 20, hostPose: 'present', zones: ['host.left', 'content.right', 'caption'], visualType: 'device-surface', screenText: {type: 'exact-source'}, motionRecipeRefs: [{recipeId: 'device-surface-tour'}], carrierPayload: {evidence: {status: 'illustrative-mock'}}, sfxRefs: []},
    ],
  },
});

test('visual plan review summarizes approval-critical pacing, stability, and variety', () => {
  const summary = summarizeVisualPlanArtifact(JSON.stringify(fixture()));
  assert.equal(summary.available, true);
  assert.deepEqual(summary.format, {ratio: '16:9', width: 1920, height: 1080, fps: 30, durationSeconds: 30});
  assert.deepEqual(summary.counts, {scenes: 2, shots: 3, graphs: 1, exactScreenText: 3, illustrativeMocks: 1, sfxCues: 0});
  assert.equal(summary.pacing.averageSceneSeconds, 15);
  assert.equal(summary.pacing.averageShotSeconds, 10);
  assert.equal(summary.stability.stableZoneShotPercent, 100);
  assert.equal(summary.stability.maxHostPoseChangesInEightSeconds, 1);
  assert.equal(summary.variety.maxRepeatedCarrier, 1);
  assert.equal(summary.variety.carriers.length, 3);
  assert.equal(summary.timelineAnchors.length, 2);
});

test('visual plan review reports invalid or incomplete artifacts without throwing', () => {
  assert.match(summarizeVisualPlanArtifact('{').error, /无法解析/);
  assert.match(summarizeVisualPlanArtifact(JSON.stringify({storyboard: {scenes: []}, shotManifest: {shots: []}})).error, /缺少场景或镜头/);
});

