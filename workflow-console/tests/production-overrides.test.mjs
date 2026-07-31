import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {
  readProductionOverrideEditor,
  revertProductionOverride,
  saveProductionOverride,
} from '../lib/production-overrides.mjs';
import {applyOverrides} from '../../tools/hyperframes-production/compile-production.mjs';
import {primaryCarrierEvidenceSha256} from '../../tools/planning-contract/primary-carrier-adapters.mjs';

const projectId = 'override-fixture';
const consoleRoot = path.resolve(import.meta.dirname, '..');
const storeDataRoot = path.join(consoleRoot, 'data', `test-overrides-${process.pid}`);
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = storeDataRoot;
const store = await import('../lib/project-store.mjs');
let projectRoot;

const workbenchInput = {
  id: projectId,
  title: 'Override transaction fixture',
  route: 'materials',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '30s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'verify override compensation',
  automation: 'critical-gates',
  publicationRights: 'needs-review',
  rightsNotes: '',
};

const motionLifecycleFixture = async ({recipeId, state, approvedProjectIds = []}) => {
  const lifecycle = JSON.parse(await fs.readFile(
    new URL('../../style-library/motion-library/knowledge-explainer.lifecycle.json', import.meta.url),
    'utf8',
  ));
  const entry = lifecycle.entries.find((item) => item.recipeId === recipeId);
  assert.ok(entry, `Missing lifecycle fixture entry for ${recipeId}.`);
  entry.state = state;
  entry.projectApprovals = approvedProjectIds.map((approvedProjectId) => ({projectId: approvedProjectId}));
  return lifecycle;
};

const writeJson = async (relativePath, value) => {
  const target = path.join(projectRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
};

const hash = async (relativePath) => crypto.createHash('sha256')
  .update(await fs.readFile(path.join(projectRoot, relativePath)))
  .digest('hex');

before(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-overrides-'));
  await store.createProject(workbenchInput);
  const basePaths = {
    narrationLock: 'NarrationLock.json',
    templateLock: 'template-lock.json',
    alignment: 'audio/alignment.json',
    storyboard: 'plan/storyboard.json',
    shotManifest: 'plan/shot-manifest.json',
    graphIr: 'plan/graph-ir.json',
  };
  await writeJson(basePaths.narrationLock, {projectId});
  await writeJson(basePaths.templateLock, {
    projectId,
    styleId: 'modern-ip-host-explainer',
    styleVersion: '1.0.0',
    paletteId: 'light-apricot',
  });
  await writeJson(basePaths.alignment, {projectId});
  await writeJson(basePaths.storyboard, {projectId});
  await writeJson(basePaths.graphIr, {projectId});
  await writeJson(basePaths.shotManifest, {
    projectId,
    cueCount: 1,
    shots: [{
      cueId: 'cue-001',
      sceneId: 'scene-01',
      narration: 'Locked narration.',
      start: 0,
      end: 4,
      duration: 4,
      screenText: {text: 'Generated screen text', type: 'generated-summary', sourceCueIds: ['cue-001']},
      hostPose: 'explain',
    }],
  });
  await writeJson('plan/production-manifest.json', {
    projectId,
    scenes: [{
      id: 'scene-01',
      title: 'Generated title',
      layout: {hostPose: 'explain', hostZone: 'host.left', contentZone: 'content.right'},
    }],
  });
  await writeJson('production/hyperframes/data/source-map.json', {
    projectId,
    scenes: {'scene-01': {cueIds: ['cue-001'], editableTargets: ['scene-01-state-01']}},
  });
  await writeJson('production/hyperframes/data/composition-build.json', {projectId, appliedOverrideIds: []});
  await writeJson('production-assets/host-assets.manifest.json', {
    projectId,
    poses: [{id: 'explain', use: 'explain'}, {id: 'emphasis', use: 'emphasize'}],
  });
  await fs.mkdir(path.join(projectRoot, '.media', 'images'), {recursive: true});
  await fs.mkdir(path.join(projectRoot, '.media', 'audio', 'sfx'), {recursive: true});
  const imagePath = path.join(projectRoot, '.media', 'images', 'image_001.png');
  const sfxPath = path.join(projectRoot, '.media', 'audio', 'sfx', 'sfx_001.wav');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(2, 40); wav.writeInt16LE(0, 44);
  await fs.writeFile(imagePath, png);
  await fs.writeFile(sfxPath, wav);
  await fs.writeFile(path.join(projectRoot, '.media', 'manifest.jsonl'), [
    JSON.stringify({id: 'image_001', type: 'image', path: '.media/images/image_001.png', description: 'Fixture evidence', sha256: await hash('.media/images/image_001.png'), licenseReceipt: 'test-fixture', provenance: {provider: 'test'}}),
    JSON.stringify({id: 'sfx_001', type: 'sfx', path: '.media/audio/sfx/sfx_001.wav', duration: 0.2, description: 'Soft click', sha256: await hash('.media/audio/sfx/sfx_001.wav'), licenseReceipt: 'test-fixture', provenance: {provider: 'bundled.sfx'}}),
    '',
  ].join('\n'), 'utf8');
  const claimFixture = {id: 'claim-fixture', evidenceStatus: 'verified', text: 'Fixture evidence'};
  await writeJson('input/claim-ledger.json', {claims: [claimFixture]});
  const base = Object.fromEntries(await Promise.all(Object.entries(basePaths).map(async ([key, value]) => [
    key,
    {path: value, sha256: await hash(value)},
  ])));
  await writeJson('overrides/overrides.json', {
    schemaVersion: 'autovideo-overrides/v1',
    projectId,
    revision: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'test',
    approvalStatus: 'not-applicable-empty',
    base,
    policy: {
      emptyMeans: 'No manual overrides have been recorded.',
      stableTargetIdsRequired: true,
      invalidationReceiptRequired: true,
      directProductionEditsAllowed: false,
    },
    overrides: [],
  });
});

after(async () => {
  await fs.rm(projectRoot, {recursive: true, force: true});
  const resolvedStoreRoot = path.resolve(storeDataRoot);
  assert.ok(resolvedStoreRoot.startsWith(path.join(consoleRoot, 'data') + path.sep));
  await fs.rm(resolvedStoreRoot, {recursive: true, force: true});
});

test('editor exposes stable scene, cue, and object targets', async () => {
  const editor = await readProductionOverrideEditor({projectRoot, projectId});
  assert.equal(editor.targets.scenes[0].sceneId, 'scene-01');
  assert.equal(editor.targets.cues[0].cueId, 'cue-001');
  assert.equal(editor.targets.objects[0].objectId, 'scene-01-state-01');
  assert.equal(editor.targets.cues[0].states.generated.text, 'Generated screen text');
  assert.equal(editor.targets.cues[0].states.override, null);
  assert.equal(editor.targets.cues[0].states.effective.text, 'Generated screen text');
  assert.equal(editor.targets.cues[0].fieldSources.text.source, 'generated');
  assert.equal(editor.policy.narrationLocked, true);
  assert.equal(editor.policy.timingLocked, true);
  assert.equal(editor.policy.motionRecommendationsAdvisoryOnly, true);
  assert.equal(editor.compileState, 'compiled');
  assert.equal(editor.motionRecommendations.policy.autoApprove, false);
  assert.equal(editor.motionRecommendations.policy.feedbackCannotPromoteLifecycle, true);
  assert.equal(editor.motionRecommendations.decisions.length, 1);
  assert.equal(editor.motionRecommendations.decisions[0].cueId, 'cue-001');
  assert.ok(editor.motionRecommendations.decisions[0].recommendation);
  assert.ok(Array.isArray(editor.motionRecommendations.decisions[0].alternatives));
  assert.equal(editor.motionRecommendations.decisions[0].lifecycleBlocker, 'candidate-not-production-approved');
  assert.equal(editor.motionRecommendations.feedbackSummary.policy.advisoryOnly, true);
  assert.equal(editor.mediaAssets[0].selectionReady, true);
  assert.equal(editor.mediaAssets[0].width, 1);
  assert.match(editor.mediaAssets[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(editor.mediaAssets[0].fileUrl, /\/media-assets\/image_001\/file$/);
  assert.equal(editor.sfxAssets[0].selectionReady, true);
  assert.match(editor.sfxAssets[0].fileUrl, /\/media-assets\/sfx_001\/file$/);
});

test('manual override is stored, superseded, compiled, and reverted with history', async () => {
  const first = await saveProductionOverride({
    projectRoot,
    projectId,
    authoredBy: 'test-user',
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      text: 'First manual text',
      hostPose: 'emphasis',
      visualVariant: 'signal',
      reason: 'Improve the first visual beat.',
    },
  });
  assert.equal(first.revision, 1);
  assert.equal(first.editor.compileState, 'pending-recompile');
  assert.equal(first.editor.overrides.at(-1).status, 'active');
  const firstCue = first.editor.targets.cues[0];
  assert.equal(firstCue.states.generated.text, 'Generated screen text');
  assert.equal(firstCue.states.override.text, 'First manual text');
  assert.equal(firstCue.states.effective.text, 'First manual text');
  assert.equal(firstCue.states.override.hostPose, 'emphasis');
  assert.equal(firstCue.fieldSources.text.source, 'override');
  assert.equal(firstCue.fieldSources.text.revision, 1);
  assert.ok(firstCue.changedFields.generatedToEffective.includes('text'));

  const second = await saveProductionOverride({
    projectRoot,
    projectId,
    authoredBy: 'test-user',
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      text: 'Second manual text',
      reason: 'Refine the wording again.',
    },
  });
  const stored = JSON.parse(await fs.readFile(path.join(projectRoot, 'overrides', 'overrides.json'), 'utf8'));
  assert.equal(stored.revision, 2);
  assert.equal(stored.overrides[0].status, 'superseded');
  assert.equal(stored.overrides[0].supersededBy, second.overrideId);
  assert.equal(stored.overrides[1].status, 'active');
  assert.equal(stored.overrides[2].status, 'active');

  const transformed = applyOverrides({
    scenes: [{id: 'scene-01', title: 'Generated title', layout: {hostPose: 'explain'}}],
    shots: [{cueId: 'cue-001', sceneId: 'scene-01', screenText: {text: 'Generated screen text'}, hostPose: 'explain'}],
    overrides: stored,
  });
  assert.equal(transformed.shots[0].screenText.text, 'Second manual text');
  assert.equal(transformed.shots[0].screenText.type, 'manual-keywords');
  assert.equal(transformed.shots[0].hostPose, 'emphasis');
  assert.equal(transformed.shots[0].visualVariant, 'signal');
  assert.deepEqual(transformed.applied, [first.overrideIds[1], first.overrideIds[2], second.overrideIds[0]]);

  const reverted = await revertProductionOverride({
    projectRoot,
    projectId,
    overrideId: second.overrideIds[0],
    revertedBy: 'test-user',
    input: {reason: 'Return to the generated value.'},
  });
  assert.equal(reverted.revision, 3);
  assert.equal(reverted.editor.overrides.find((item) => item.id === second.overrideIds[0]).status, 'reverted');
});

test('failed workbench DB record restores the exact override file and DB state on save', async () => {
  await store.markStageGenerated(projectId, 'full-production', {artifactPath: 'fixture/full-production.json', artifactKind: 'json'});
  await store.markStageGenerated(projectId, 'qa-review', {artifactPath: 'fixture/qa-review.json', artifactKind: 'json'});
  const overridePath = path.join(projectRoot, 'overrides', 'overrides.json');
  const dbPath = path.join(storeDataRoot, 'db.json');
  const beforeFile = await fs.readFile(overridePath);
  const beforeDb = await fs.readFile(dbPath);
  const beforeProject = await store.getProject(projectId);

  await assert.rejects(
    saveProductionOverride({
      projectRoot,
      projectId,
      authoredBy: 'test-user',
      input: {
        target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
        text: 'This value must be rolled back.',
        reason: 'Inject a DB failure after the override file is staged.',
      },
      commitProjectChange: (change) => store.recordProductionOverrideChange(projectId, change, {
        beforePersist: () => {
          throw new Error('injected override DB failure');
        },
      }),
    }),
    /injected override DB failure/,
  );

  const afterFile = await fs.readFile(overridePath);
  const afterDb = await fs.readFile(dbPath);
  const afterProject = await store.getProject(projectId);
  assert.equal(crypto.createHash('sha256').update(afterFile).digest('hex'), crypto.createHash('sha256').update(beforeFile).digest('hex'));
  assert.deepEqual(afterFile, beforeFile);
  assert.deepEqual(afterDb, beforeDb);
  assert.deepEqual(afterProject.stages['full-production'], beforeProject.stages['full-production']);
  assert.deepEqual(afterProject.stages['qa-review'], beforeProject.stages['qa-review']);
  assert.deepEqual(
    afterProject.events.filter((entry) => entry.type === 'production-override-changed'),
    beforeProject.events.filter((entry) => entry.type === 'production-override-changed'),
  );
});

test('failed workbench DB record restores the exact override file and DB state on revert', async () => {
  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    authoredBy: 'test-user',
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      text: 'Active value before failed revert.',
      reason: 'Create an active override for revert rollback coverage.',
    },
    commitProjectChange: (change) => store.recordProductionOverrideChange(projectId, change),
  });
  await store.markStageGenerated(projectId, 'full-production', {artifactPath: 'fixture/full-production-v2.json', artifactKind: 'json'});
  await store.markStageGenerated(projectId, 'qa-review', {artifactPath: 'fixture/qa-review-v2.json', artifactKind: 'json'});

  const overridePath = path.join(projectRoot, 'overrides', 'overrides.json');
  const dbPath = path.join(storeDataRoot, 'db.json');
  const beforeFile = await fs.readFile(overridePath);
  const beforeDb = await fs.readFile(dbPath);
  const beforeProject = await store.getProject(projectId);

  await assert.rejects(
    revertProductionOverride({
      projectRoot,
      projectId,
      overrideId: saved.overrideIds[0],
      revertedBy: 'test-user',
      input: {reason: 'Inject a DB failure while reverting.'},
      commitProjectChange: (change) => store.recordProductionOverrideChange(projectId, change, {
        beforePersist: () => {
          throw new Error('injected revert DB failure');
        },
      }),
    }),
    /injected revert DB failure/,
  );

  const afterFile = await fs.readFile(overridePath);
  const afterDb = await fs.readFile(dbPath);
  const afterProject = await store.getProject(projectId);
  const editor = await readProductionOverrideEditor({projectRoot, projectId});
  assert.equal(crypto.createHash('sha256').update(afterFile).digest('hex'), crypto.createHash('sha256').update(beforeFile).digest('hex'));
  assert.deepEqual(afterFile, beforeFile);
  assert.deepEqual(afterDb, beforeDb);
  assert.equal(editor.overrides.find((item) => item.id === saved.overrideIds[0]).status, 'active');
  assert.deepEqual(afterProject.stages['full-production'], beforeProject.stages['full-production']);
  assert.deepEqual(afterProject.stages['qa-review'], beforeProject.stages['qa-review']);
  assert.deepEqual(
    afterProject.events.filter((entry) => entry.type === 'production-override-changed'),
    beforeProject.events.filter((entry) => entry.type === 'production-override-changed'),
  );
});

test('recipe, local media, and semantic SFX overrides remain versioned and visible', async () => {
  const motionRecipeLifecycle = await motionLifecycleFixture({
    recipeId: 'evidence-pivot',
    state: 'promoted-template',
  });
  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    authoredBy: 'test-user',
    motionRecipeLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'evidence-pivot',
      assetId: 'image_001',
      sfxAssetId: 'sfx_001',
      sfxRole: 'focus-hit',
      reason: 'Use registered evidence with one quiet semantic click.',
    },
  });
  assert.equal(saved.invalidateFromStage, 'rights-clearance');
  const active = saved.editor.overrides.filter((item) => item.status === 'active');
  assert.ok(active.some((item) => item.locks.visualType?.value === 'evidence-image'));
  assert.ok(active.some((item) => item.locks.motionRecipeRefs?.value?.[0]?.recipeId === 'evidence-pivot'));
  assert.ok(active.some((item) => item.locks.assetRefs?.value?.[0]?.assetId === 'image_001'));
  assert.ok(active.some((item) => item.locks.sfxRefs?.value?.[0]?.assetId === 'sfx_001'));
  assert.equal(saved.editor.targets.cues[0].visualType, 'evidence-image');
  assert.equal(saved.editor.targets.cues[0].assetRefs[0].assetId, 'image_001');
  assert.equal(saved.editor.targets.cues[0].sfxRefs[0].role, 'focus-hit');
});

test('candidate recipes expose their lifecycle receipt and cannot enter a production override', async () => {
  const motionRecipeLifecycle = await motionLifecycleFixture({
    recipeId: 'keyword-handoff',
    state: 'candidate',
  });
  const editor = await readProductionOverrideEditor({projectRoot, projectId, motionRecipeLifecycle});
  const recipe = editor.recipes.find((item) => item.id === 'keyword-handoff');
  assert.equal(recipe.lifecycleState, 'candidate');
  assert.match(recipe.definitionSha256, /^[a-f0-9]{64}$/);
  assert.equal(recipe.allowedForProject, false);
  assert.equal(recipe.blockedReason, 'candidate-not-production-approved');

  const before = JSON.parse(await fs.readFile(path.join(projectRoot, 'overrides', 'overrides.json'), 'utf8'));
  await assert.rejects(() => saveProductionOverride({
    projectRoot,
    projectId,
    motionRecipeLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'keyword-handoff',
      reason: 'Candidate recipes must remain outside production.',
    },
  }), /candidate-not-production-approved/i);
  const after = JSON.parse(await fs.readFile(path.join(projectRoot, 'overrides', 'overrides.json'), 'utf8'));
  assert.equal(after.revision, before.revision);
  assert.equal(after.overrides.length, before.overrides.length);
});

test('promoted-template recipes are allowed for every project', async () => {
  const motionRecipeLifecycle = await motionLifecycleFixture({
    recipeId: 'diagram-build',
    state: 'promoted-template',
  });
  const editor = await readProductionOverrideEditor({projectRoot, projectId, motionRecipeLifecycle});
  const recipe = editor.recipes.find((item) => item.id === 'diagram-build');
  assert.equal(recipe.lifecycleState, 'promoted-template');
  assert.equal(recipe.allowedForProject, true);
  assert.equal(recipe.blockedReason, null);

  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    motionRecipeLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'diagram-build',
      reason: 'Use a template-promoted diagram recipe.',
    },
  });
  assert.ok(saved.editor.overrides.some((item) => (
    item.id.startsWith(saved.overrideId)
    && item.locks.motionRecipeRefs?.value?.[0]?.recipeId === 'diagram-build'
  )));
});

test('approved-project recipes are restricted to the matching project approval', async () => {
  const deniedLifecycle = await motionLifecycleFixture({
    recipeId: 'comparison-split',
    state: 'approved-project',
    approvedProjectIds: ['another-project'],
  });
  const deniedEditor = await readProductionOverrideEditor({
    projectRoot,
    projectId,
    motionRecipeLifecycle: deniedLifecycle,
  });
  const deniedRecipe = deniedEditor.recipes.find((item) => item.id === 'comparison-split');
  assert.equal(deniedRecipe.lifecycleState, 'approved-project');
  assert.equal(deniedRecipe.allowedForProject, false);
  assert.equal(deniedRecipe.blockedReason, 'project-approval-missing');
  await assert.rejects(() => saveProductionOverride({
    projectRoot,
    projectId,
    motionRecipeLifecycle: deniedLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'comparison-split',
      reason: 'Reject a recipe approved for another project.',
    },
  }), /project-approval-missing/i);

  const allowedLifecycle = await motionLifecycleFixture({
    recipeId: 'comparison-split',
    state: 'approved-project',
    approvedProjectIds: [projectId],
  });
  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    motionRecipeLifecycle: allowedLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'comparison-split',
      reason: 'Use the recipe approved for this exact project.',
    },
  });
  assert.ok(saved.editor.overrides.some((item) => (
    item.id.startsWith(saved.overrideId)
    && item.locks.motionRecipeRefs?.value?.[0]?.recipeId === 'comparison-split'
  )));
});

test('asset and SFX overrides do not bypass or inherit the new recipe lifecycle gate', async () => {
  const assetSaved = await saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      assetId: 'image_001',
      reason: 'Change only the registered evidence asset.',
    },
  });
  const assetEntries = assetSaved.editor.overrides.filter((item) => item.id.startsWith(assetSaved.overrideId));
  assert.ok(assetEntries.some((item) => item.locks.assetRefs));
  assert.equal(assetEntries.some((item) => item.locks.motionRecipeRefs), false);

  const sfxSaved = await saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      sfxAssetId: 'sfx_001',
      sfxRole: 'state-change',
      reason: 'Change only the quiet semantic click.',
    },
  });
  const sfxEntries = sfxSaved.editor.overrides.filter((item) => item.id.startsWith(sfxSaved.overrideId));
  assert.ok(sfxEntries.some((item) => item.locks.sfxRefs));
  assert.equal(sfxEntries.some((item) => item.locks.motionRecipeRefs), false);
});

test('asset-only changes inherit the current recipe visual role', async () => {
  const motionRecipeLifecycle = await motionLifecycleFixture({
    recipeId: 'device-surface-tour',
    state: 'promoted-template',
  });
  await saveProductionOverride({
    projectRoot,
    projectId,
    motionRecipeLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'device-surface-tour',
      reason: 'Use the approved interface-state recipe.',
    },
  });
  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      assetId: 'image_001',
      reason: 'Swap only the screenshot while retaining the current recipe.',
    },
  });
  const assetOverride = saved.editor.overrides.find((item) => (
    item.id.startsWith(saved.overrideId) && item.locks.assetRefs
  ));
  assert.equal(assetOverride.locks.assetRefs.value[0].role, 'interface');
});

test('primary carrier overrides are structured, reversible, and mutually exclusive with primary images', async () => {
  const motionRecipeLifecycle = await motionLifecycleFixture({recipeId: 'data-proof', state: 'promoted-template'});
  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    motionRecipeLifecycle,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      motionRecipeId: 'data-proof',
      carrierPayload: {
        adapterId: 'data-chart-bounded',
        evidence: {status: 'verified', label: 'Fixture evidence', receipt: {kind: 'claim', id: 'claim-fixture', sha256: primaryCarrierEvidenceSha256({id: 'claim-fixture', evidenceStatus: 'verified', text: 'Fixture evidence'})}},
        data: {title: 'Fixture chart', unit: '%', series: [{label: 'A', value: 30}, {label: 'B', value: 70}]},
      },
      reason: 'Use a bounded local chart carrier.',
    },
  });
  assert.equal(saved.invalidateFromStage, 'rights-clearance');
  assert.equal(saved.editor.targets.cues[0].carrierPayload.adapterId, 'data-chart-bounded');
  assert.equal(saved.editor.targets.cues[0].carrierPayload.zone, 'content.right');
  assert.equal(saved.editor.targets.cues[0].carrierPayload.sourceCueIds[0], 'cue-001');

  const imageSaved = await saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      target: {level: 'cue', sceneId: 'scene-01', cueId: 'cue-001'},
      assetId: 'image_001',
      reason: 'Replace the chart with a frozen primary image.',
    },
  });
  assert.equal(imageSaved.editor.targets.cues[0].carrierPayload, null);
  assert.equal(imageSaved.editor.targets.cues[0].assetRefs[0].assetId, 'image_001');
});

test('scene title uses the title field and stale editor revisions cannot save or revert', async () => {
  const before = await readProductionOverrideEditor({projectRoot, projectId});
  const saved = await saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      expectedRevision: before.revision,
      target: {level: 'scene', sceneId: 'scene-01'},
      text: 'Human-reviewed scene title',
      reason: 'Verify scene-title provenance and revision locking.',
    },
  });
  const scene = saved.editor.targets.scenes[0];
  assert.equal(scene.title, 'Human-reviewed scene title');
  assert.equal(scene.states.generated.title, 'Generated title');
  assert.equal(scene.states.override.title, 'Human-reviewed scene title');
  assert.equal(scene.states.effective.title, 'Human-reviewed scene title');
  assert.equal(scene.fieldSources.title.source, 'override');
  assert.equal(scene.fieldSources.title.revision, saved.revision);

  await assert.rejects(() => saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      expectedRevision: before.revision,
      target: {level: 'scene', sceneId: 'scene-01'},
      text: 'Stale overwrite',
      reason: 'A stale page must not replace a newer edit.',
    },
  }), /revision is stale/i);
  await assert.rejects(() => revertProductionOverride({
    projectRoot,
    projectId,
    overrideId: saved.overrideIds[0],
    input: {
      expectedRevision: before.revision,
      reason: 'A stale page must not revert a newer edit.',
    },
  }), /revision is stale/i);
  const after = await readProductionOverrideEditor({projectRoot, projectId});
  assert.equal(after.revision, saved.revision);
  assert.equal(after.targets.scenes[0].title, 'Human-reviewed scene title');
});

test('unknown poses and stale base bindings are rejected', async () => {
  await assert.rejects(() => saveProductionOverride({
    projectRoot,
    projectId,
    input: {
      target: {level: 'scene', sceneId: 'scene-01'},
      hostPose: 'missing-pose',
      reason: 'Invalid pose test.',
    },
  }), /unknown host pose/i);

  await fs.appendFile(path.join(projectRoot, 'NarrationLock.json'), ' ');
  await assert.rejects(
    () => readProductionOverrideEditor({projectRoot, projectId}),
    /base narrationLock is stale/i,
  );
});


