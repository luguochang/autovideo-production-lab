import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {buildVisualAssetCandidates} from '../lib/visual-asset-candidates.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');

test('visual asset candidates are source-bound and only suggest semantic local matches', async (t) => {
  const projectId = 'visual-asset-candidates-test';
  const projectRoot = await fs.mkdtemp(path.join(root, 'workflow-console', 'data', 'visual-asset-candidates-'));
  t.after(() => fs.rm(projectRoot, {recursive: true, force: true}));
  await fs.mkdir(path.join(projectRoot, 'plan'), {recursive: true});
  await fs.writeFile(path.join(projectRoot, 'plan', 'shot-manifest.json'), `${JSON.stringify({
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId,
    shots: [
      {cueId: 'cue-001', start: 0, end: 4, visualType: 'diagram', narration: '工作流把节点连接成系统。', screenText: {text: '工作流节点'}},
      {cueId: 'cue-002', start: 4, end: 7, visualType: 'keyword', narration: '这是一个抽象开场。', screenText: {text: '开场'}},
    ],
  }, null, 2)}\n`, 'utf8');

  const result = await buildVisualAssetCandidates({projectRoot, projectId});
  assert.equal(result.available, true);
  assert.equal(result.plan.status, 'candidate');
  assert.equal(result.plan.policy.autoAttach, false);
  assert.equal(result.plan.candidates.length, 1);
  assert.equal(result.plan.candidates[0].assetId, 'icon-workflow');
  assert.equal(result.plan.sourceShotManifest.path, 'plan/shot-manifest.json');
  assert.match(result.plan.candidateDigestSha256, /^[a-f0-9]{64}$/);
});
