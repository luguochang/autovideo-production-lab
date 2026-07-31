import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {recordMotionUsage} from '../lib/motion-usage.mjs';

test('motion usage records compiled creative directives instead of the original shot plan', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-usage-'));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  const formalRoot = path.join(workspaceRoot, 'project');
  const projectId = 'motion-usage-fixture';
  const composition = path.join(formalRoot, 'production', 'hyperframes');
  await fs.mkdir(path.join(composition, 'data'), {recursive: true});
  await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});
  await fs.writeFile(path.join(formalRoot, 'plan', 'shot-manifest.json'), JSON.stringify({shots: [{cueId: 'cue-001', motionRecipeRefs: [{libraryId: 'knowledge-explainer', recipeId: 'keyword-handoff', version: '1.0.0'}]}]}));
  await fs.writeFile(path.join(composition, 'index.html'), '<main>compiled</main>', 'utf8');
  await fs.writeFile(path.join(composition, 'data', 'source-map.json'), `${JSON.stringify({
    schemaVersion: 'autovideo-composition-source-map/v1',
    projectId,
    scenes: {
      'scene-01': {
        creativeDirectives: {
          'cue-001': {motionRecipeRefs: [{libraryId: 'knowledge-explainer', libraryVersion: '1.0.0', recipeId: 'diagram-build', version: '1.0.0', sourceCueIds: ['cue-001']}]},
        },
      },
    },
  }, null, 2)}\n`, 'utf8');

  const result = await recordMotionUsage({workspaceRoot, formalRoot, projectId});
  assert.equal(result.recorded, true);
  assert.deepEqual(result.record.recipes.map((item) => item.recipeId), ['diagram-build']);
  assert.match(result.record.compiledSourceMap.sha256, /^[a-f0-9]{64}$/);
  const repeated = await recordMotionUsage({workspaceRoot, formalRoot, projectId});
  assert.equal(repeated.recorded, false);
  assert.equal(repeated.reason, 'already-recorded');
});
