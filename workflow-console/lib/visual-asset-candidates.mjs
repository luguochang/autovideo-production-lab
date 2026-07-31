import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {suggestVisualAssetPlan} from '../../tools/hyperframes-production/lib/suggest-visual-asset-plan.mjs';
import {assetLibraryPaths, listAssetLibrary} from './asset-library.mjs';

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const sha256Value = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function buildVisualAssetCandidates({projectRoot, projectId}) {
  const shotManifestPath = path.join(projectRoot, 'plan', 'shot-manifest.json');
  let shotManifest;
  try {
    shotManifest = JSON.parse(await fs.readFile(shotManifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {available: false, status: 'missing', message: 'No shot manifest is available for visual asset matching.', candidates: []};
    }
    throw error;
  }
  if (shotManifest?.schemaVersion !== 'autovideo-shot-manifest/v1' || shotManifest.projectId !== projectId) {
    throw new Error('The shot manifest is not a valid current-project visual asset source.');
  }

  const [assets, shotManifestSha256, assetRegistrySha256] = await Promise.all([
    listAssetLibrary(),
    sha256File(shotManifestPath),
    sha256File(assetLibraryPaths.registryPath),
  ]);
  const eligibleAssets = assets.filter((asset) => asset.sourceReady && asset.sourceShaMatches);
  const plan = suggestVisualAssetPlan({
    projectId,
    shots: shotManifest.shots,
    assetLibrary: {assets: eligibleAssets},
  });
  const digest = sha256Value({plan, shotManifestSha256, assetRegistrySha256});
  return {
    available: true,
    status: 'candidate',
    plan: {
      ...plan,
      sourceShotManifest: {path: 'plan/shot-manifest.json', sha256: shotManifestSha256},
      sourceAssetRegistry: {path: 'style-library/assets/ASSET_REGISTRY.json', sha256: assetRegistrySha256},
      candidateDigestSha256: digest,
    },
  };
}
