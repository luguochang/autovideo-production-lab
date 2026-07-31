#!/usr/bin/env node

import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {readJson, sha256} from '../tools/hyperframes-production/lib/common.mjs';
import {loadMediaLedger, mediaLicenseReceiptFor, mediaProviderFor} from '../tools/hyperframes-production/lib/media-ledger.mjs';
import {
  recommendSemanticSfxAssets,
  resolvedSemanticSfxBinding,
} from '../tools/hyperframes-production/lib/resolve-semantic-sfx-bindings.mjs';
import {suggestSemanticSfxPlan} from '../tools/hyperframes-production/lib/suggest-semantic-sfx-plan.mjs';
import {loadMotionRecipeLibrary, normalizeShotCreativeFields} from '../tools/planning-contract/creative-contract.mjs';
import {validateSemanticSfxPlan} from '../style-library/schema/semantic-sfx-plan.validator.mjs';
import {
  assetLibraryPaths,
  importAssetToProject,
  listAssetLibrary,
} from '../workflow-console/lib/asset-library.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '..');

const parseArgs = (argv) => {
  const args = {project: null, write: false, force: false};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--project') args.project = argv[++index];
    else if (value === '--write') args.write = true;
    else if (value === '--force') args.force = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
};

const optionalJson = async (filePath) => {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) throw new Error('Usage: node scripts/generate-semantic-sfx-plan.mjs --project <formal-project> [--write] [--force]');
  const projectDir = path.resolve(WORKSPACE_ROOT, args.project);
  const manifestPath = path.join(projectDir, 'plan', 'production-manifest.json');
  const outputPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.json');
  const receiptPath = path.join(projectDir, 'plan', 'semantic-sfx-plan.generation.json');
  const [manifest, existingPlan, ledger, motionLibraryBundle, librarySfxAssets] = await Promise.all([
    readJson(manifestPath),
    optionalJson(outputPath),
    loadMediaLedger(projectDir),
    loadMotionRecipeLibrary({workspaceRoot: WORKSPACE_ROOT}),
    listAssetLibrary({type: 'sfx'}),
  ]);
  if (existingPlan && ['approved', 'retired'].includes(existingPlan.status) && !args.force) {
    throw new Error(`Refusing to replace ${existingPlan.status} semantic SFX plan without --force.`);
  }

  const shotManifestPath = path.join(projectDir, manifest.bindings.shotManifest.path);
  const graphIrPath = path.join(projectDir, manifest.bindings.graphIr.path);
  const [shotManifest, graphIr] = await Promise.all([readJson(shotManifestPath), readJson(graphIrPath)]);
  const sceneMap = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
  const graphByScene = new Map(graphIr.graphs.map((graph) => [graph.sceneId, graph]));
  const effectiveShots = shotManifest.shots.map((shot) => normalizeShotCreativeFields({
    shot,
    scene: sceneMap.get(shot.sceneId),
    graph: graphByScene.get(shot.sceneId) ?? null,
    library: motionLibraryBundle.library,
  }));

  const validExistingBindings = (existingPlan?.bindings ?? []).filter((binding) => {
    if (binding.resolutionStatus !== 'resolved') return false;
    const record = ledger.byId.get(binding.assetId);
    return record?.type === 'sfx'
      && record.path === binding.path
      && record.sha256 === binding.sha256
      && mediaProviderFor(record) === binding.provider
      && mediaLicenseReceiptFor(record) === binding.licenseReceipt;
  });
  const candidatePlan = suggestSemanticSfxPlan({
    projectId: manifest.projectId,
    durationSeconds: manifest.timeline.duration,
    shots: effectiveShots,
    motionLibrary: motionLibraryBundle.library,
    existingBindings: validExistingBindings,
  });
  const recommendations = recommendSemanticSfxAssets({plan: candidatePlan, assets: librarySfxAssets});
  const imports = [];
  let effectiveLedger = ledger;
  let plan = candidatePlan;
  if (args.write) {
    for (const recommendation of recommendations.filter((item) => item.status === 'recommended')) {
      const imported = await importAssetToProject({projectRoot: projectDir, assetId: recommendation.assetId});
      imports.push({role: recommendation.role, assetId: recommendation.assetId, projectAssetId: imported.projectAssetId, reused: imported.reused});
    }
    effectiveLedger = await loadMediaLedger(projectDir);
    const resolvedBindings = recommendations.flatMap((recommendation) => {
      if (recommendation.status !== 'recommended') return [];
      const binding = candidatePlan.bindings.find((item) => item.role === recommendation.role);
      const record = effectiveLedger.byId.get(recommendation.assetId);
      return binding && record ? [resolvedSemanticSfxBinding({binding, record})] : [];
    });
    plan = suggestSemanticSfxPlan({
      projectId: manifest.projectId,
      durationSeconds: manifest.timeline.duration,
      shots: effectiveShots,
      motionLibrary: motionLibraryBundle.library,
      existingBindings: [...validExistingBindings, ...resolvedBindings],
    });
  }
  const validationErrors = validateSemanticSfxPlan(plan, motionLibraryBundle.library);
  if (validationErrors.length) throw new Error(validationErrors.map((error) => `${error.code} ${error.path}: ${error.message}`).join('\n'));

  const preview = {
    ok: true,
    write: args.write,
    projectId: manifest.projectId,
    outputPath: path.relative(WORKSPACE_ROOT, outputPath).replaceAll('\\', '/'),
    suggestionCount: plan.cues.length,
    roles: [...new Set(plan.cues.map((cue) => cue.role))],
    preservedResolvedBindings: plan.bindings.filter((binding) => binding.resolutionStatus === 'resolved').map((binding) => binding.role),
    recommendedAssets: recommendations,
    importedAssets: imports,
  };
  if (!args.write) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const receipt = {
    schemaVersion: 'autovideo-semantic-sfx-plan-generation/v1',
    projectId: manifest.projectId,
    generatedAt: new Date().toISOString(),
    status: 'candidate-needs-human-review',
    sources: {
      productionManifest: {path: 'plan/production-manifest.json', sha256: await sha256(manifestPath)},
      shotManifest: {path: manifest.bindings.shotManifest.path, sha256: await sha256(shotManifestPath)},
      graphIr: {path: manifest.bindings.graphIr.path, sha256: await sha256(graphIrPath)},
      motionRecipeLibrary: {path: motionLibraryBundle.relativePath, sha256: motionLibraryBundle.sha256},
      assetRegistry: {path: 'style-library/assets/ASSET_REGISTRY.json', sha256: await sha256(assetLibraryPaths.registryPath), scope: 'workspace'},
      mediaLedger: effectiveLedger.records.length ? {path: '.media/manifest.jsonl', sha256: await sha256(effectiveLedger.ledgerPath)} : null,
    },
    output: {path: 'plan/semantic-sfx-plan.json', sha256: await sha256(outputPath)},
    suggestionCount: plan.cues.length,
    roles: preview.roles,
    resolvedBindings: plan.bindings.filter((binding) => binding.resolutionStatus === 'resolved').map((binding) => ({role: binding.role, assetId: binding.assetId})),
    importedAssets: imports,
    approvalRule: 'Suggestions remain silent until the entire plan status is approved.',
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({...preview, receiptPath: path.relative(WORKSPACE_ROOT, receiptPath).replaceAll('\\', '/')}, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
