#!/usr/bin/env node

import { copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assert, ensureDir, readJson, round3, sha256, writeUtf8 } from './lib/common.mjs';
import { INTRO_PADDING_SECONDS, renderContinuousIndex } from './lib/render-continuous-index.mjs';
import {compileSemanticSfxPlan} from './lib/compile-semantic-sfx-plan.mjs';
import {loadMediaLedger, mediaLicenseReceiptFor, mediaProviderFor, safeMediaSource} from './lib/media-ledger.mjs';
import {assertSemanticSfxApproval} from './lib/semantic-sfx-approval.mjs';
import {assertVisualAssetContracts} from './lib/visual-asset-contract.mjs';
import {
  verifyPrimaryCarrierAdapterSources,
  verifyPrimaryCarrierProjectEvidence,
} from '../planning-contract/primary-carrier-adapters.mjs';
import { renderMotionSidecar, renderScene } from './lib/render-scene.mjs';
import {ONE_SCREEN_INTRO_SECONDS, renderOneScreenIndex} from './lib/render-one-screen-index.mjs';
import {
  loadMotionRecipeLibrary,
  normalizeShotCreativeFields,
  validateShotCreativeFields,
} from '../planning-contract/creative-contract.mjs';
import {validateSemanticSfxPlan} from '../../style-library/schema/semantic-sfx-plan.validator.mjs';
import {assertGraphLayout} from '../planning-contract/graph-layout-contract.mjs';
import {
  assertMotionRecipeAccessReceipt,
  collectMotionRecipeRefs,
  createMotionRecipeAccessReceipt,
} from '../planning-contract/motion-lifecycle-gate.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const VERSION = '1.8.0';

function parseArgs(argv) {
  const args = { project: null, output: null, layout: 'one-screen' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--project') args.project = argv[++index];
    else if (value === '--output') args.output = argv[++index];
    else if (value === '--layout') args.layout = argv[++index];
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return 'Usage: node tools/hyperframes-production/compile-production.mjs --project <formal-project> [--output <hyperframes-dir>] [--layout one-screen|legacy]';
}

async function assertHash(projectDir, binding, label) {
  const root = binding.scope === 'workspace' ? WORKSPACE_ROOT : projectDir;
  const filePath = path.resolve(root, binding.path);
  assert(filePath === root || filePath.startsWith(`${root}${path.sep}`), `${label} path leaves its declared ${binding.scope ?? 'project'} scope.`);
  const actual = await sha256(filePath);
  assert(actual === binding.sha256, `${label} hash mismatch: expected ${binding.sha256}, got ${actual}`);
  return { filePath, sha256: actual };
}

function activeOverrides(document) {
  return [...(document?.overrides ?? [])]
    .filter((item) => ['active', 'approved', 'applied'].includes(item.status))
    .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
}

export function applyOverrides({ scenes, shots, overrides }) {
  const nextScenes = structuredClone(scenes);
  const nextShots = structuredClone(shots);
  const sceneMap = new Map(nextScenes.map((scene) => [scene.id, scene]));
  const shotMap = new Map(nextShots.map((shot) => [shot.cueId, shot]));
  const applied = [];

  for (const override of activeOverrides(overrides)) {
    const patch = { ...(override.patch ?? {}) };
    const target = override.target ?? {};
    const locks = override.locks ?? {};
    if (locks.text?.value !== undefined) patch.text = locks.text.value;
    if (locks.hostPose?.value !== undefined) patch.hostPose = locks.hostPose.value;
    if (locks.layout?.value !== undefined) patch.layout = locks.layout.value;
    if (locks.visualVariant?.value !== undefined) patch.visualVariant = locks.visualVariant.value;
    if (locks.visualType?.value !== undefined) patch.visualType = locks.visualType.value;
    if (locks.motionRecipeRefs?.value !== undefined) patch.motionRecipeRefs = locks.motionRecipeRefs.value;
    if (locks.assetRefs?.value !== undefined) patch.assetRefs = locks.assetRefs.value;
    if (locks.carrierPayload?.value !== undefined) patch.carrierPayload = locks.carrierPayload.value;
    if (locks.sfxRefs?.value !== undefined) patch.sfxRefs = locks.sfxRefs.value;
    if (locks.provenanceRefs?.value !== undefined) patch.provenanceRefs = locks.provenanceRefs.value;
    if (locks.timing?.value !== undefined) patch.timing = locks.timing.value;
    const targetLevel = target.level ?? target.kind;

    if (patch.timing) {
      const shot = shotMap.get(target.cueId ?? target.id);
      assert(shot, `Override ${override.id} timing lock must target a cue.`);
      const expected = patch.timing;
      const same = ['start', 'end', 'duration'].every((key) => expected[key] === undefined || Math.abs(Number(expected[key]) - Number(shot[key])) < 0.001);
      assert(same, `Override ${override.id} changes locked timing. Regenerate alignment and production manifest instead.`);
    }

    if (targetLevel === 'scene') {
      const sceneId = target.sceneId ?? target.id;
      const scene = sceneMap.get(sceneId);
      assert(scene, `Override ${override.id} targets unknown scene ${sceneId}`);
      if (patch.text) scene.title = patch.text;
      if (patch.hostPose) scene.layout.hostPose = patch.hostPose;
      if (patch.layout?.hostZone) scene.layout.hostZone = patch.layout.hostZone;
      if (patch.layout?.contentZone) scene.layout.contentZone = patch.layout.contentZone;
      if (patch.hidden === true || override.operation === 'hide') scene.hidden = true;
    } else if (targetLevel === 'cue') {
      const cueId = target.cueId ?? target.id;
      const shot = shotMap.get(cueId);
      assert(shot, `Override ${override.id} targets unknown cue ${cueId}`);
      if (patch.text) {
        shot.screenText.text = patch.text;
        shot.screenText.type = 'manual-keywords';
      }
      if (patch.hostPose) shot.hostPose = patch.hostPose;
      if (patch.visualVariant) shot.visualVariant = patch.visualVariant;
      if (patch.visualType) shot.visualType = patch.visualType;
      if (patch.motionRecipeRefs) shot.motionRecipeRefs = patch.motionRecipeRefs;
      if (patch.assetRefs) shot.assetRefs = patch.assetRefs;
      if (patch.carrierPayload !== undefined) shot.carrierPayload = patch.carrierPayload;
      if (patch.sfxRefs) shot.sfxRefs = patch.sfxRefs;
      if (patch.provenanceRefs) shot.provenanceRefs = patch.provenanceRefs;
      if (patch.hidden === true || override.operation === 'hide') shot.hidden = true;
    } else if (targetLevel === 'object') {
      const cueId = target.cueId ?? target.sourcePath ?? patch.cueId;
      const shot = shotMap.get(cueId);
      assert(shot, `Override ${override.id} object target requires cueId/sourcePath matching a cue`);
      if (patch.text) {
        shot.screenText.text = patch.text;
        shot.screenText.type = 'manual-keywords';
      }
      if (patch.visualVariant) shot.visualVariant = patch.visualVariant;
      if (patch.visualType) shot.visualType = patch.visualType;
      if (patch.motionRecipeRefs) shot.motionRecipeRefs = patch.motionRecipeRefs;
      if (patch.assetRefs) shot.assetRefs = patch.assetRefs;
      if (patch.carrierPayload !== undefined) shot.carrierPayload = patch.carrierPayload;
      if (patch.sfxRefs) shot.sfxRefs = patch.sfxRefs;
      if (patch.provenanceRefs) shot.provenanceRefs = patch.provenanceRefs;
    } else {
      throw new Error(`Override ${override.id} has unsupported target level ${targetLevel}`);
    }
    applied.push(override.id);
  }

  return {
    scenes: nextScenes.filter((scene) => !scene.hidden),
    shots: nextShots.filter((shot) => !shot.hidden),
    applied,
  };
}

export function applyPersistentHostPolicy({scenes, shots}) {
  let normalizedScenes = 0;
  const nextScenes = scenes.map((scene) => {
    if (scene.layout.hostZone === 'host.left' && scene.layout.contentZone === 'content.right') return scene;
    normalizedScenes += 1;
    return {
      ...scene,
      layout: {...scene.layout, hostZone: 'host.left', contentZone: 'content.right'},
    };
  });
  const nextShots = shots.map((shot) => ({
    ...shot,
    zones: Array.isArray(shot.zones)
      ? [...shot.zones.filter((zone) => !zone.startsWith('host.') && !zone.startsWith('content.')), 'host.left', 'content.right']
      : shot.zones,
  }));
  return {scenes: nextScenes, shots: nextShots, normalizedScenes};
}

export function applyOneScreenHostPolicy({scenes, shots}) {
  assert(scenes.length > 0, 'One-screen production requires at least one scene.');
  const fixedHostPose = scenes[0].layout.hostPose;
  const shell = applyPersistentHostPolicy({scenes, shots});
  let normalizedHostPoses = 0;
  const nextScenes = shell.scenes.map((scene) => {
    if (scene.layout.hostPose === fixedHostPose) return scene;
    normalizedHostPoses += 1;
    return {...scene, layout: {...scene.layout, hostPose: fixedHostPose}};
  });
  const nextShots = shell.shots.map((shot) => ({...shot, hostPose: fixedHostPose}));
  return {...shell, scenes: nextScenes, shots: nextShots, fixedHostPose, normalizedHostPoses};
}

async function resolveHostManifest(projectDir) {
  const candidates = [
    path.join(projectDir, 'production', 'host-assets', 'host-assets.json'),
    path.join(projectDir, 'production-assets', 'host-assets.manifest.json'),
    path.join(projectDir, 'production-assets', 'host-poses', 'manifest.json'),
    path.join(projectDir, 'production', 'assets', 'host', 'manifest.json'),
  ];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return { path: candidate, document: await readJson(candidate) };
    } catch {
      // Continue through the known deterministic asset-pack locations.
    }
  }
  throw new Error(`Prepared host asset manifest not found. Checked: ${candidates.join(', ')}`);
}

async function freezeCreativeMedia({projectDir, outputDir, shots, ledger}) {
  const copied = new Map();
  const ensureCopied = async (ref, expectedTypes, folder) => {
    const record = ledger.byId.get(ref.assetId);
    assert(record, `Creative reference ${ref.assetId} is not registered in .media/manifest.jsonl.`);
    assert(expectedTypes.includes(record.type), `${ref.assetId} has type ${record.type}; expected ${expectedTypes.join(' or ')}.`);
    const source = safeMediaSource(projectDir, record);
    const sourceSha256 = record.sha256;
    const provider = mediaProviderFor(record);
    const licenseReceipt = mediaLicenseReceiptFor(record);
    const extension = path.extname(record.path) || (record.type === 'sfx' ? '.wav' : '.png');
    const relativeTarget = `assets/${folder}/${record.id}${extension}`;
    const target = path.join(outputDir, relativeTarget);
    if (!copied.has(relativeTarget)) {
      await ensureDir(path.dirname(target));
      await copyFile(source, target);
      copied.set(relativeTarget, {
        id: record.id,
        type: record.type,
        path: relativeTarget,
        sha256: await sha256(target),
        source: record.source ?? null,
        sourceSha256,
        licenseReceipt,
        provenance: {...(record.provenance ?? {}), provider},
      });
    }
    return {
      ...ref,
      type: record.type,
      src: `./${relativeTarget}`,
      duration: Number(record.duration ?? 0.35),
      description: record.description ?? '',
    };
  };

  const resolvedShots = [];
  for (const shot of shots) {
    const resolvedAssets = [];
    for (const ref of shot.assetRefs ?? []) {
      resolvedAssets.push(await ensureCopied(ref, ['image', 'icon', 'logo', 'brand'], 'media'));
    }
    const resolvedSfx = [];
    for (const ref of shot.sfxRefs ?? []) {
      resolvedSfx.push(await ensureCopied(ref, ['sfx'], 'audio/sfx'));
    }
    resolvedShots.push({...shot, resolvedAssets, resolvedSfx});
  }
  return {
    shots: resolvedShots,
    ledgerPath: ledger.records.length ? ledger.ledgerPath : null,
    copied: [...copied.values()],
  };
}

export async function loadSemanticSfxPlan({projectDir, manifest, motionLibrary, shots, ledger}) {
  const planPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.json');
  try {
    await stat(planPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return {planPath: null, plan: null, sha256: null, compile: null, shots};
    throw error;
  }

  const plan = await readJson(planPath);
  const planSha256 = await sha256(planPath);
  const validationErrors = validateSemanticSfxPlan(plan, motionLibrary);
  assert(validationErrors.length === 0, `Semantic SFX plan is invalid:\n${validationErrors.map((error) => `${error.code} ${error.path}: ${error.message}`).join('\n')}`);
  assert(Math.abs(Number(plan.timelineDurationSeconds) - Number(manifest.timeline.duration)) < 0.001, 'Semantic SFX plan duration does not match the production timeline.');
  const approval = await assertSemanticSfxApproval({
    projectDir,
    projectId: manifest.projectId,
    plan,
    planPath,
    planSha256,
  });

  for (const binding of plan.bindings ?? []) {
    if (binding.resolutionStatus !== 'resolved') continue;
    const record = ledger.byId.get(binding.assetId);
    assert(record?.type === 'sfx', `Semantic SFX binding ${binding.role} does not resolve to a registered SFX asset.`);
    assert(record.path === binding.path, `Semantic SFX binding ${binding.role} path drifted from the media ledger.`);
    assert(record.sha256 === binding.sha256, `Semantic SFX binding ${binding.role} hash drifted from the media ledger.`);
    assert(mediaProviderFor(record) === binding.provider, `Semantic SFX binding ${binding.role} provider drifted from the media ledger.`);
    assert(mediaLicenseReceiptFor(record) === binding.licenseReceipt, `Semantic SFX binding ${binding.role} license receipt drifted from the media ledger.`);
  }

  const compile = compileSemanticSfxPlan({
    plan,
    shots,
    registeredSfxAssetIds: [...ledger.byId.values()].filter((record) => record.type === 'sfx'),
  });
  if (plan.status === 'approved') {
    assert(compile.ok, `Approved semantic SFX plan could not be compiled:\n${compile.diagnostics.errors.map((error) => `${error.code}: ${error.message}`).join('\n')}`);
  }
  return {
    planPath,
    plan,
    sha256: planSha256,
    approvalPath: approval ? path.join(projectDir, approval.path) : null,
    approval,
    compile,
    shots: compile.shots,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  assert(args.project, usage());
  assert(['one-screen', 'legacy'].includes(args.layout), '--layout must be one-screen or legacy.');
  const projectDir = path.resolve(WORKSPACE_ROOT, args.project);
  const outputDir = args.output
    ? path.resolve(WORKSPACE_ROOT, args.output)
    : path.join(projectDir, 'production', 'hyperframes');

  const manifestPath = path.join(projectDir, 'plan', 'production-manifest.json');
  const manifest = await readJson(manifestPath);
  const shotManifest = await readJson(path.join(projectDir, manifest.bindings.shotManifest.path));
  const graphIr = await readJson(path.join(projectDir, manifest.bindings.graphIr.path));
  const templateLock = await readJson(path.join(projectDir, manifest.bindings.templateLock.path));
  const overridesPath = path.join(projectDir, 'overrides', 'overrides.json');
  const overrides = await readJson(overridesPath);
  const motionLibraryBundle = await loadMotionRecipeLibrary({
    workspaceRoot: WORKSPACE_ROOT,
    expected: {
      styleId: templateLock.styleId,
      styleVersion: templateLock.styleVersion,
      paletteId: templateLock.paletteId,
    },
  });

  assert(manifest.schemaVersion === 'autovideo-production-manifest/v1', `Unsupported production manifest ${manifest.schemaVersion}`);
  assert(manifest.format.width === 1920 && manifest.format.height === 1080 && manifest.format.fps === 30, 'Production format must be 1920x1080 at 30fps.');
  assert(manifest.sceneCount === manifest.scenes.length, 'Scene count mismatch.');
  assert(shotManifest.cueCount === shotManifest.shots.length, 'Shot count mismatch.');
  assert(manifest.cueCount === shotManifest.cueCount, 'Production/shot cue count mismatch.');
  assert(graphIr.globalPolicy.maxActiveNodesPerState <= 3, 'Graph IR violates the three-active-node template contract.');

  const bound = {};
  for (const [label, binding] of Object.entries(manifest.bindings)) bound[label] = await assertHash(projectDir, binding, label);
  const graphLayout = manifest.bindings.graphLayout ? await readJson(bound.graphLayout.filePath) : null;
  if (graphLayout) assertGraphLayout({document: graphLayout, graphIr, projectId: manifest.projectId});
  if (manifest.bindings.motionRecipeLibrary) {
    assert(manifest.bindings.motionRecipeLibrary.sha256 === motionLibraryBundle.sha256, 'Production manifest pins a stale motion recipe library.');
  }
  for (const [label, binding] of Object.entries(overrides.base ?? {})) await assertHash(projectDir, binding, `overrides.base.${label}`);

  const audioSource = path.join(projectDir, 'audio', 'narration.final.wav');
  const audioHash = await sha256(audioSource);
  assert(audioHash === manifest.bindings.alignment.audioSha256, 'Final audio hash does not match alignment binding.');

  const graphMap = new Map(graphIr.graphs.map((graph) => [graph.id, graph]));
  const graphByScene = new Map(graphIr.graphs.map((graph) => [graph.sceneId, graph]));
  const sceneMap = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
  const effectiveShots = shotManifest.shots.map((shot) => normalizeShotCreativeFields({
    shot,
    scene: sceneMap.get(shot.sceneId),
    graph: graphByScene.get(shot.sceneId) ?? null,
    library: motionLibraryBundle.library,
  }));
  const plannedMotionAccess = await assertMotionRecipeAccessReceipt({
    workspaceRoot: WORKSPACE_ROOT,
    projectId: manifest.projectId,
    recipeRefs: collectMotionRecipeRefs({shots: effectiveShots}),
    receipt: manifest.motionLifecycleAccess,
    requireAuthorized: true,
  });
  if (manifest.cueDirectives) {
    assert(manifest.cueDirectives.length === effectiveShots.length, 'Production cueDirectives do not cover every shot.');
    const directiveByCue = new Map(manifest.cueDirectives.map((directive) => [directive.cueId, directive]));
    for (const shot of effectiveShots) {
      const directive = directiveByCue.get(shot.cueId);
      assert(directive, `Production manifest is missing cue directive ${shot.cueId}.`);
      for (const field of ['visualType', 'motionRecipeRefs', 'assetRefs', 'carrierPayload', 'sfxRefs', 'provenanceRefs']) {
        assert(JSON.stringify(directive[field]) === JSON.stringify(shot[field]), `Production cue directive ${shot.cueId}.${field} drifted from the shot manifest.`);
      }
    }
  }
  const mediaLedger = await loadMediaLedger(projectDir);
  const semanticSfx = await loadSemanticSfxPlan({
    projectDir,
    manifest,
    motionLibrary: motionLibraryBundle.library,
    shots: effectiveShots,
    ledger: mediaLedger,
  });
  const overridden = applyOverrides({ scenes: manifest.scenes, shots: semanticSfx.shots, overrides });
  const shellPolicy = args.layout === 'one-screen'
    ? applyOneScreenHostPolicy(overridden)
    : applyPersistentHostPolicy(overridden);
  const transformed = {...shellPolicy, applied: overridden.applied};
  for (const shot of transformed.shots) validateShotCreativeFields({shot, library: motionLibraryBundle.library});
  assertVisualAssetContracts({shots: transformed.shots, mediaById: mediaLedger.byId});
  const primaryCarrierAdapters = await verifyPrimaryCarrierAdapterSources({workspaceRoot: WORKSPACE_ROOT, shots: transformed.shots});
  const primaryCarrierEvidence = await verifyPrimaryCarrierProjectEvidence({projectDir, shots: transformed.shots, mediaLedger});
  const effectiveMotionAccess = await createMotionRecipeAccessReceipt({
    workspaceRoot: WORKSPACE_ROOT,
    projectId: manifest.projectId,
    recipeRefs: collectMotionRecipeRefs({shots: transformed.shots}),
    internalFallbackRequest: manifest.motionLifecycleAccess.internalFallback?.request ?? null,
  });
  if (!effectiveMotionAccess.receipt.authorized) {
    const denied = effectiveMotionAccess.receipt.access
      .filter((item) => !item.allowed)
      .map((item) => `${item.recipeId}@${item.version} (${item.lifecycleState}: ${item.reason})`);
    throw new Error(`Effective motion recipes are not authorized after overrides: ${denied.join(', ')}.`);
  }
  const sfxMoments = transformed.shots.flatMap((shot) => (shot.sfxRefs ?? []).map((ref) => Number(shot.start) + Number(ref.offsetMs ?? 0) / 1000)).sort((a, b) => a - b);
  for (const shot of transformed.shots) {
    for (const ref of shot.sfxRefs ?? []) {
      const eventTime = Number(shot.start) + Number(ref.offsetMs ?? 0) / 1000;
      assert(eventTime >= Number(shot.start) && eventTime < Number(shot.end), `${shot.cueId} SFX offset must land inside its cue window.`);
      assert(Number(ref.gainDb) <= -10, `${shot.cueId} semantic SFX must stay at or below -10 dB.`);
    }
  }
  const minSfxGap = Number(motionLibraryBundle.library.sfxPolicy?.minGapSeconds ?? 0);
  for (let index = 1; index < sfxMoments.length; index += 1) {
    assert(sfxMoments[index] - sfxMoments[index - 1] >= minSfxGap, `Semantic SFX events must stay at least ${minSfxGap}s apart.`);
  }
  for (const [index, windowStart] of sfxMoments.entries()) {
    const count = sfxMoments.slice(index).filter((time) => time < windowStart + 60).length;
    assert(count <= Number(motionLibraryBundle.library.sfxPolicy?.maxPerMinute ?? 0), 'Semantic SFX density exceeds the rolling one-minute limit.');
  }
  const hostPack = await resolveHostManifest(projectDir);
  const hostItems = hostPack.document.assets ?? hostPack.document.poses ?? hostPack.document.items ?? [];
  const hostMap = new Map(hostItems.map((item) => [item.id || item.poseId, item]));

  await ensureDir(path.join(outputDir, 'compositions', 'scenes'));
  await ensureDir(path.join(outputDir, 'assets', 'audio'));
  await ensureDir(path.join(outputDir, 'assets', 'host'));
  await ensureDir(path.join(outputDir, 'assets', 'runtime'));
  await ensureDir(path.join(outputDir, 'data'));

  const creativeMedia = await freezeCreativeMedia({projectDir, outputDir, shots: transformed.shots, ledger: mediaLedger});
  transformed.shots = creativeMedia.shots;

  const gsapSource = path.join(projectDir, 'review', 'probe-project', 'assets', 'gsap.min.js');
  await copyFile(audioSource, path.join(outputDir, 'assets', 'audio', 'narration.final.wav'));
  await copyFile(gsapSource, path.join(outputDir, 'assets', 'runtime', 'gsap.min.js'));
  await copyFile(path.join(WORKSPACE_ROOT, 'vendor', 'hyperframes', 'skills', 'hyperframes-creative', 'frame-presets', 'claude', 'fonts', 'JetBrainsMono-400.woff2'), path.join(outputDir, 'assets', 'runtime', 'JetBrainsMono-400.woff2'));
  await copyFile(path.join(WORKSPACE_ROOT, 'vendor', 'hyperframes', 'skills', 'hyperframes-creative', 'frame-presets', 'claude', 'fonts', 'JetBrainsMono-700.woff2'), path.join(outputDir, 'assets', 'runtime', 'JetBrainsMono-700.woff2'));
  const copiedDataFiles = [
    ['production-manifest.json', manifestPath],
    ['shot-manifest.json', path.join(projectDir, manifest.bindings.shotManifest.path)],
    ['graph-ir.json', path.join(projectDir, manifest.bindings.graphIr.path)],
    ['alignment.json', path.join(projectDir, manifest.bindings.alignment.path)],
    ['overrides.json', overridesPath],
    ['motion-recipe-library.json', motionLibraryBundle.filePath],
    ['motion-recipe-lifecycle.json', plannedMotionAccess.context.paths.ledgerPath],
  ];
  if (graphLayout) copiedDataFiles.push(['graph-layout.json', bound.graphLayout.filePath]);
  if (creativeMedia.ledgerPath) copiedDataFiles.push(['media-manifest.jsonl', creativeMedia.ledgerPath]);
  if (semanticSfx.planPath) copiedDataFiles.push(['semantic-sfx-plan.json', semanticSfx.planPath]);
  if (semanticSfx.approvalPath) copiedDataFiles.push(['semantic-sfx-review.json', semanticSfx.approvalPath]);
  for (const [name, source] of copiedDataFiles) await copyFile(source, path.join(outputDir, 'data', name));
  if (semanticSfx.compile) {
    await writeUtf8(path.join(outputDir, 'data', 'semantic-sfx-compile.json'), JSON.stringify(semanticSfx.compile.diagnostics, null, 2));
  }

  const sceneFiles = new Map();
  const hostAssets = new Map();
  const hostOutputFiles = new Set();
  const sourceMap = {
    schemaVersion: 'autovideo-composition-source-map/v1',
    projectId: manifest.projectId,
    motionLifecycleAccess: {
      plannedDecisionSha256: manifest.motionLifecycleAccess.decisionSha256,
      effectiveDecisionSha256: effectiveMotionAccess.receipt.decisionSha256,
      lifecycleLedgerSha256: effectiveMotionAccess.receipt.lifecycleLedger.sha256,
      authorized: effectiveMotionAccess.receipt.authorized,
      internalFallbackUsed: effectiveMotionAccess.receipt.releasePolicy.internalFallbackUsed,
    },
    semanticSfx: semanticSfx.plan ? {
      planId: semanticSfx.plan.planId,
      status: semanticSfx.plan.status,
      sha256: semanticSfx.sha256,
      approval: semanticSfx.approval ? {
        path: 'data/semantic-sfx-review.json',
        sha256: semanticSfx.approval.sha256,
        approvedBy: semanticSfx.approval.approvedBy,
        approvedAt: semanticSfx.approval.approvedAt,
        approvalScope: semanticSfx.approval.approvalScope,
        humanReviewPerformed: semanticSfx.approval.humanReviewPerformed,
        publicReleaseBlocked: semanticSfx.approval.publicReleaseBlocked,
      } : null,
      committed: semanticSfx.compile?.diagnostics.committed ?? false,
      appliedCueCount: semanticSfx.compile?.diagnostics.summary.appliedCueCount ?? 0,
    } : null,
    graphLayout: graphLayout ? {
      path: 'data/graph-layout.json',
      sha256: bound.graphLayout.sha256,
      diagramCount: graphLayout.diagrams.length,
    } : null,
    primaryCarrierAdapters,
    primaryCarrierEvidence,
    scenes: {},
  };
  for (const scene of transformed.scenes) {
    const sceneShots = transformed.shots.filter((shot) => shot.sceneId === scene.id);
    assert(sceneShots.length > 0, `${scene.id} has no shots after overrides.`);
    const graphRef = scene.graphRefs?.[0];
    const graph = graphRef ? graphMap.get(graphRef.graphId) : null;
    if (graphRef) assert(graph, `${scene.id} references missing graph ${graphRef.graphId}`);
    const hostItem = hostMap.get(scene.layout.hostPose);
    assert(hostItem, `${scene.id} requires missing prepared pose ${scene.layout.hostPose}`);
    const hostSource = path.resolve(path.dirname(hostPack.path), hostItem.output?.path || hostItem.path || hostItem.outputPath || hostItem.file);
    const hostTargetName = `${scene.layout.hostPose}.png`;
    const hostTarget = path.join(outputDir, 'assets', 'host', hostTargetName);
    await copyFile(hostSource, hostTarget);
    hostOutputFiles.add(`assets/host/${hostTargetName}`);
    hostAssets.set(scene.layout.hostPose, `./assets/host/${hostTargetName}`);
    const expectedHostHash = hostItem.output?.sha256 || hostItem.sha256;
    if (expectedHostHash) assert(await sha256(hostTarget) === expectedHostHash, `Prepared pose hash mismatch for ${scene.layout.hostPose}`);

    const fileName = path.basename(scene.plannedSrc);
    const relativeFile = `./compositions/scenes/${fileName}`;
    sceneFiles.set(scene.id, relativeFile);
    const html = renderScene({ scene, shots: sceneShots, graph, hostAsset: `./assets/host/${hostTargetName}` });
    await writeUtf8(path.join(outputDir, 'compositions', 'scenes', fileName), html);
    await writeUtf8(path.join(outputDir, 'compositions', 'scenes', fileName.replace(/\.html$/, '.motion.json')), renderMotionSidecar(scene));
    sourceMap.scenes[scene.id] = {
      file: relativeFile,
      cueIds: sceneShots.map((shot) => shot.cueId),
      graphId: graph?.id ?? null,
      graphLayoutBound: Boolean(graph && graphLayout?.diagrams.some((diagram) => diagram.graphId === graph.id)),
      hostPose: scene.layout.hostPose,
      editableTargets: sceneShots.map((shot) => `visual-${shot.cueId}`),
      visualVariants: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, shot.visualVariant ?? 'auto'])),
      visualTypes: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, shot.visualType])),
      motionRecipes: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, shot.motionRecipeRefs.map((ref) => `${ref.recipeId}@${ref.version}`)])),
      assetIds: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, shot.assetRefs.map((ref) => ref.assetId)])),
      primaryCarrierAdapters: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, shot.carrierPayload ? `${shot.carrierPayload.adapterId}@${shot.carrierPayload.adapterVersion}` : null])),
      sfxIds: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, shot.sfxRefs.map((ref) => ref.assetId)])),
      creativeDirectives: Object.fromEntries(sceneShots.map((shot) => [shot.cueId, {
        visualType: shot.visualType,
        motionRecipeRefs: shot.motionRecipeRefs,
        assetRefs: shot.assetRefs,
        carrierPayload: shot.carrierPayload ?? null,
        sfxRefs: shot.sfxRefs,
        provenanceRefs: shot.provenanceRefs,
        resolvedAssets: shot.resolvedAssets.map((asset) => ({assetId: asset.assetId, type: asset.type, src: asset.src})),
        resolvedSfx: shot.resolvedSfx.map((sfx) => ({assetId: sfx.assetId, role: sfx.role, src: sfx.src, offsetMs: sfx.offsetMs, gainDb: sfx.gainDb})),
      }])),
    };
  }

  const indexHtml = args.layout === 'one-screen' ? renderOneScreenIndex({
    manifest,
    scenes: transformed.scenes,
    shots: transformed.shots,
    hostAssets,
    graphs: graphIr.graphs,
  }) : renderContinuousIndex({
    manifest,
    scenes: transformed.scenes,
    shots: transformed.shots,
    hostAssets,
    graphs: graphIr.graphs,
    graphLayouts: graphLayout?.diagrams ?? [],
  });
  await writeUtf8(path.join(outputDir, 'hyperframes.json'), JSON.stringify({
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
    paths: {blocks: 'compositions', components: 'compositions/components', assets: 'assets'},
    media: {autoProxy: true},
  }, null, 2));
  await writeUtf8(path.join(outputDir, 'package.json'), JSON.stringify({
    name: `${manifest.projectId}-hyperframes`,
    private: true,
    type: 'module',
    scripts: {
      dev: 'npx --yes hyperframes@0.7.77 preview',
      check: 'npx --yes hyperframes@0.7.77 check',
      render: 'npx --yes hyperframes@0.7.77 render',
      publish: 'npx --yes hyperframes@0.7.77 publish',
    },
    dependencies: {},
  }, null, 2));
  await writeUtf8(path.join(outputDir, 'meta.json'), JSON.stringify({
    id: path.basename(outputDir),
    name: manifest.projectId,
    createdAt: new Date().toISOString(),
  }, null, 2));
  await writeUtf8(path.join(outputDir, 'BRIEF.md'), [
    '---',
    'workflow: general-video',
    'flow: automation',
    'storyboard: yes',
    'destination: douyin-landscape',
    'aspect: 1920x1080',
    'language: zh-CN',
    `length: ${round3(manifest.timeline.duration)}s`,
    `style_preset: modern-ip-host-explainer@1.0.0 + continuous-shell-compiler@${VERSION}`,
    '---',
    '',
    `# ${manifest.projectId}`,
    '',
    '- NarrationLock, alignment, storyboard, Graph IR and production manifest are hash-bound.',
    '- Scene/caption timing comes only from this project\'s hash-bound final alignment.',
    '- 99%, 90% and 30K remain creator opinion and are not rendered as statistical charts.',
    '- This build is internal-only until human listening, final review and publication rights are approved.',
    '',
  ].join('\n'));
  await copyFile(
    path.join(WORKSPACE_ROOT, 'style-library', 'styles', 'project', 'modern-ip-host-explainer', 'frame.md'),
    path.join(outputDir, 'frame.md'),
  );
  await writeUtf8(path.join(outputDir, 'index.html'), indexHtml);
  const introPaddingSeconds = args.layout === 'one-screen' ? ONE_SCREEN_INTRO_SECONDS : INTRO_PADDING_SECONDS;
  await writeUtf8(path.join(outputDir, 'index.motion.json'), JSON.stringify({
    duration: round3(manifest.timeline.duration + introPaddingSeconds),
    assertions: [
      { kind: 'appearsBy', selector: '#host-zone', bySec: 0.9 },
      { kind: 'appearsBy', selector: '#visual-cue-001', bySec: 0.9 },
      { kind: 'staysInFrame', selector: '#host-zone' },
      { kind: 'staysInFrame', selector: '#content-zone' },
      { kind: 'staysInFrame', selector: '#caption-shell' },
    ],
  }, null, 2));
  await writeUtf8(path.join(outputDir, 'data', 'source-map.json'), JSON.stringify(sourceMap, null, 2));

  const outputFiles = [
    'hyperframes.json',
    'package.json',
    'meta.json',
    'BRIEF.md',
    'frame.md',
    'index.html',
    'index.motion.json',
    'assets/audio/narration.final.wav',
    'assets/runtime/gsap.min.js',
    'assets/runtime/JetBrainsMono-400.woff2',
    'assets/runtime/JetBrainsMono-700.woff2',
    ...[...hostOutputFiles].sort(),
    ...creativeMedia.copied.map((item) => item.path).sort(),
    ...copiedDataFiles.map(([name]) => `data/${name}`),
    ...(semanticSfx.compile ? ['data/semantic-sfx-compile.json'] : []),
    'data/source-map.json',
    ...[...sceneFiles.values()].flatMap((file) => [file.replace(/^\.\//, ''), file.replace(/^\.\//, '').replace(/\.html$/, '.motion.json')]),
  ];
  const outputs = [];
  for (const relativePath of outputFiles) outputs.push({ path: relativePath, sha256: await sha256(path.join(outputDir, relativePath)) });
  const receipt = {
    schemaVersion: 'autovideo-hyperframes-build/v1',
    compilerVersion: VERSION,
    projectId: manifest.projectId,
    generatedAt: new Date().toISOString(),
    inputManifest: { path: path.relative(projectDir, manifestPath).replaceAll('\\', '/'), sha256: await sha256(manifestPath) },
    outputDir: path.relative(projectDir, outputDir).replaceAll('\\', '/'),
    format: manifest.format,
    timeline: manifest.timeline,
    sceneCount: transformed.scenes.length,
    cueCount: transformed.shots.length,
    appliedOverrideIds: transformed.applied,
    publicReleaseBlocked: true,
    motionLifecycleAccess: {
      ...effectiveMotionAccess.receipt,
      plannedDecisionSha256: manifest.motionLifecycleAccess.decisionSha256,
    },
    continuity: {
      mode: args.layout === 'one-screen' ? 'one-screen-master-board' : 'persistent-shell',
      introPaddingSeconds,
      hostZone: 'host.left',
      contentZone: 'content.right',
      cameraScope: 'content-world-only',
      normalizedSceneLayouts: transformed.normalizedScenes,
      transition: args.layout === 'one-screen' ? 'progressive-reveal-no-replacement' : 'compact-history-and-anchor-enter',
      fixedHostPose: transformed.fixedHostPose ?? null,
      normalizedHostPoses: transformed.normalizedHostPoses ?? 0,
      oneScreenStepCount: args.layout === 'one-screen' ? transformed.shots.length : null,
      screenTextPolicy: 'derived-keywords; exact narration remains in captions',
      manualTextPolicy: 'pipe-separated visual keywords; never changes NarrationLock or captions',
      visualVariants: ['focus', 'signal', 'stack', 'route', 'contrast', 'close'],
      motionRecipeLibrary: `${motionLibraryBundle.library.libraryId}@${motionLibraryBundle.library.version}`,
      recipeDrivenFields: ['visualType', 'motionRecipeRefs', 'assetRefs', 'carrierPayload', 'sfxRefs', 'provenanceRefs'],
      primaryCarrierAdapters,
      primaryCarrierEvidence,
      graphLayout: graphLayout ? {
        mode: 'bound-editable-layout',
        path: 'data/graph-layout.json',
        sha256: bound.graphLayout.sha256,
        diagramCount: graphLayout.diagrams.length,
      } : {mode: 'deterministic-css-fallback'},
      semanticSfxPolicy: motionLibraryBundle.library.sfxPolicy,
      iconSource: 'lucide-react@0.468.0 (ISC)',
    },
    creativeMedia: {
      ledger: creativeMedia.ledgerPath ? path.relative(projectDir, creativeMedia.ledgerPath).replaceAll('\\', '/') : null,
      frozenAssets: creativeMedia.copied,
    },
    semanticSfx: semanticSfx.plan ? {
      plan: {path: 'data/semantic-sfx-plan.json', sha256: semanticSfx.sha256, status: semanticSfx.plan.status},
      approval: semanticSfx.approval ? {
        path: 'data/semantic-sfx-review.json',
        sha256: semanticSfx.approval.sha256,
        approvedBy: semanticSfx.approval.approvedBy,
        approvedAt: semanticSfx.approval.approvedAt,
        approvalScope: semanticSfx.approval.approvalScope,
        humanReviewPerformed: semanticSfx.approval.humanReviewPerformed,
        publicReleaseBlocked: semanticSfx.approval.publicReleaseBlocked,
      } : null,
      diagnostics: {path: 'data/semantic-sfx-compile.json', sha256: await sha256(path.join(outputDir, 'data', 'semantic-sfx-compile.json'))},
      committed: semanticSfx.compile.diagnostics.committed,
      appliedCueCount: semanticSfx.compile.diagnostics.summary.appliedCueCount,
      policy: 'approved-plan-only-silence-default',
    } : null,
    hostAssetManifest: { path: path.relative(projectDir, hostPack.path).replaceAll('\\', '/'), sha256: await sha256(hostPack.path) },
    outputs,
  };
  await writeUtf8(path.join(outputDir, 'data', 'composition-build.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ok: true, outputDir, sceneCount: receipt.sceneCount, cueCount: receipt.cueCount, appliedOverrides: receipt.appliedOverrideIds.length }, null, 2));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
