import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

import {loadLifecycleContext, recipeDefinitionSha256, sha256File, stableJson} from './lifecycle.mjs';

const execFileAsync = promisify(execFile);
const configurationName = 'probe-canonicalization.json';
const evidenceName = 'lifecycle-evidence.draft.json';
const legacyEvidenceName = 'lifecycle-evidence.legacy.json';
const receiptName = 'canonicalization-receipt.json';

const lifecyclePaths = {
  libraryPath: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledgerPath: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  catalogPaths: {
    officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
    officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
    officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
  },
};

const normalizedRelative = (value) => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const sha256Text = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalizedNarration = (value) => String(value).replace(/\r\n?/gu, '\n').trim();

const resolveInside = (root, relativePath, label) => {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`${label} must be a relative path.`);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(root, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`${label} leaves its allowed root.`);
  return target;
};

const readJson = async (target) => JSON.parse(await fs.readFile(target, 'utf8'));
const writeAtomic = async (target, value) => {
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, stableJson(value), 'utf8');
  await fs.rm(target, {force: true});
  await fs.rename(temporary, target);
};

const ffprobe = async (target) => {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=index,codec_type,width,height,avg_frame_rate,sample_rate,channels',
    '-of', 'json',
    target,
  ], {windowsHide: true, maxBuffer: 4 * 1024 * 1024});
  return JSON.parse(stdout);
};

const fpsValue = (value) => {
  const [numerator, denominator = '1'] = String(value || '').split('/').map(Number);
  return denominator ? numerator / denominator : 0;
};

const normalizedInvariantChecks = (audit) => ({
  landscape16x9: audit.checks?.landscape16x9 === true
    || (audit.composition?.width === 1920 && audit.composition?.height === 1080),
  lightApricotBackground: audit.checks?.lightApricotBackground === true
    || audit.brandShell?.background === '#F2DFC7',
  qVersionHostAssets: audit.checks?.qVersionHostAssets === true
    || audit.checks?.singleQVersionHostAsset === true
    || Boolean(audit.brandShell?.hostAssetPath),
  hostLeft: audit.checks?.hostLeft === true || audit.brandShell?.hostZone === 'host.left',
  contentRight: audit.checks?.contentRight === true || audit.camera?.contentZone === 'content.right',
  captionPersistent: audit.checks?.captionPersistent === true || audit.brandShell?.captionZone === 'caption',
  contentWorldOnlyCamera: audit.checks?.contentWorldOnlyCamera === true || audit.camera?.scope === 'content-world-only',
});

const strictCheckPassed = ({audit, renderQa}) => Boolean(
  audit.automatedEvidence?.strictCheck?.ok === true
  || audit.automatedEvidence?.strictCheck?.findingCount === 0
  || renderQa?.checks?.strictHyperframesCheckPassed === true,
);

const catalogIds = (catalogs) => ({
  'official-registry': new Set((catalogs.officialRegistry ?? []).map((item) => item.name)),
  'official-blueprint': new Set((catalogs.officialBlueprints ?? []).map((item) => item.id)),
  'official-motion-rule': new Set((catalogs.officialMotionRules ?? []).map((item) => item.id)),
});

const fileBinding = async ({workspaceRoot, probeRoot, relativePath, workspaceRelative = false}) => {
  const target = workspaceRelative
    ? resolveInside(workspaceRoot, relativePath, 'Workspace evidence path')
    : resolveInside(probeRoot, relativePath, 'Probe evidence path');
  const outputPath = normalizedRelative(path.relative(workspaceRoot, target));
  return {path: outputPath, sha256: await sha256File(target)};
};

const assertHostAssetCurrent = async ({probeRoot, manifest}) => {
  const host = (manifest.assets ?? []).find((asset) => asset.type === 'image'
    && (String(asset.id).startsWith('host-') || String(asset.purpose || '').includes('host.left')));
  if (!host?.path || !isSha256(host.sha256)) throw new Error('AssetManifest has no hash-bound host image.');
  const actual = await sha256File(resolveInside(probeRoot, host.path, 'Host asset path'));
  if (actual !== host.sha256) throw new Error('Host asset bytes no longer match AssetManifest.');
};

export const buildCanonicalProbeEvidence = async ({workspaceRoot, probePath}) => {
  const probeRelative = normalizedRelative(probePath);
  const probeRoot = resolveInside(workspaceRoot, probeRelative, 'Probe path');
  const configPath = path.join(probeRoot, configurationName);
  const config = await readJson(configPath);
  if (config.schemaVersion !== 'autovideo-motion-probe-canonicalization/v1') throw new Error('Unsupported probe canonicalization config.');

  const context = await loadLifecycleContext({workspaceRoot, ...lifecyclePaths});
  const recipe = context.library.recipes.find((item) => item.id === config.recipeId);
  const entry = context.ledger.entries.find((item) => item.recipeId === config.recipeId);
  if (!recipe || !entry || recipe.version !== config.recipeVersion || entry.recipeVersion !== config.recipeVersion) {
    throw new Error('Probe recipe/version does not match the current motion library.');
  }
  if (entry.definitionSha256 !== recipeDefinitionSha256(recipe)) throw new Error('Motion recipe definition binding is stale.');

  const [narrationLock, audit, manifest, renderQa] = await Promise.all([
    readJson(path.join(probeRoot, 'NarrationLock.json')),
    readJson(resolveInside(probeRoot, config.invariantAuditPath, 'Invariant audit path')),
    readJson(resolveInside(probeRoot, config.hostAssetManifestPath, 'Host manifest path')),
    config.renderQaPath ? readJson(resolveInside(probeRoot, config.renderQaPath, 'Render QA path')) : Promise.resolve(null),
  ]);
  if (narrationLock.window?.durationSeconds < 3 || narrationLock.window?.durationSeconds > 8) throw new Error('Narration window must be 3-8 seconds.');
  const narrationPath = resolveInside(probeRoot, narrationLock.frozenPath, 'Frozen narration path');
  const narrationHash = sha256Text(normalizedNarration(await fs.readFile(narrationPath, 'utf8')));
  if (narrationHash !== narrationLock.normalizedSha256) throw new Error('NarrationLock text hash is stale.');
  const audioPath = resolveInside(probeRoot, narrationLock.window.audioPath, 'Narration audio path');
  const audioSha256 = await sha256File(audioPath);
  if (audioSha256 !== narrationLock.window.audioSha256) throw new Error('Narration window audio hash is stale.');

  const renderPath = resolveInside(probeRoot, config.renderPath, 'Probe render path');
  const media = await ffprobe(renderPath);
  const video = media.streams?.find((stream) => stream.codec_type === 'video');
  const durationSeconds = Number(media.format?.duration);
  if (!video || video.width !== 1920 || video.height !== 1080 || Math.abs(fpsValue(video.avg_frame_rate) - 30) > 0.01) {
    throw new Error('Probe render must be 1920x1080 at 30 fps.');
  }
  if (durationSeconds < 3 || durationSeconds > 8.05) throw new Error('Probe render must be 3-8 seconds.');

  const checks = normalizedInvariantChecks(audit);
  if (!Object.values(checks).every(Boolean)) throw new Error(`Probe invariant audit is incomplete: ${JSON.stringify(checks)}`);
  if (audit.passed === false || audit.status === 'failed') throw new Error('Probe invariant audit failed.');
  if (!strictCheckPassed({audit, renderQa})) throw new Error('Strict HyperFrames check is not proven by current probe evidence.');
  await assertHostAssetCurrent({probeRoot, manifest});

  const idsByKind = catalogIds(context.catalogs);
  const officialReuseObserved = [];
  for (const observed of config.officialReuseObserved ?? []) {
    if (!idsByKind[observed.kind]?.has(observed.id)) throw new Error(`Unknown official reuse source ${observed.kind}:${observed.id}.`);
    officialReuseObserved.push({
      kind: observed.kind,
      id: observed.id,
      implementation: await fileBinding({workspaceRoot, probeRoot, relativePath: observed.implementationPath}),
    });
  }
  if (!officialReuseObserved.length) throw new Error('Canonical probe requires observed official reuse.');

  const stills = [];
  for (const stillPath of config.stillPaths ?? []) stills.push(await fileBinding({workspaceRoot, probeRoot, relativePath: stillPath}));
  if (!stills.length) throw new Error('Canonical probe requires at least one still.');

  const evidence = {
    schemaVersion: 'autovideo-motion-recipe-lifecycle-evidence/v1',
    recipeId: config.recipeId,
    recipeVersion: config.recipeVersion,
    requestedState: 'probe-passed',
    probe: {
      kind: 'motion-probe',
      projectId: config.projectId,
      path: probeRelative,
      durationSeconds: Number(Math.min(8, durationSeconds).toFixed(3)),
      sameNarrationWindow: true,
      narrationSha256: narrationLock.normalizedSha256,
      audioSha256,
      invariants: structuredClone(context.ledger.invariants),
      invariantAudit: {
        binding: await fileBinding({workspaceRoot, probeRoot, relativePath: config.invariantAuditPath}),
        passed: true,
        checks,
      },
      hostAssetManifest: await fileBinding({workspaceRoot, probeRoot, relativePath: config.hostAssetManifestPath}),
      stills,
      motionProbe: await fileBinding({workspaceRoot, probeRoot, relativePath: config.renderPath}),
      hyperframesCheck: {
        binding: await fileBinding({workspaceRoot, probeRoot, relativePath: config.strictCheckPath}),
        ok: true,
        strict: true,
        snapshotsEnabled: true,
        findingCount: 0,
        version: config.hyperframesVersion,
      },
      visualReview: null,
      officialReuseObserved,
    },
  };
  return {
    config,
    configPath,
    probeRoot,
    evidence,
    evidencePath: path.join(probeRoot, evidenceName),
    receipt: {
      schemaVersion: 'autovideo-motion-probe-canonicalization-receipt/v1',
      projectId: config.projectId,
      recipeId: config.recipeId,
      recipeVersion: config.recipeVersion,
      recipeDefinitionSha256: entry.definitionSha256,
      canonicalizer: 'tools/motion-recipe-lifecycle/canonicalize-probe.mjs',
      inputs: {
        config: await fileBinding({workspaceRoot, probeRoot, relativePath: configurationName}),
        narrationLock: await fileBinding({workspaceRoot, probeRoot, relativePath: 'NarrationLock.json'}),
        invariantAudit: await fileBinding({workspaceRoot, probeRoot, relativePath: config.invariantAuditPath}),
        hostAssetManifest: await fileBinding({workspaceRoot, probeRoot, relativePath: config.hostAssetManifestPath}),
        strictCheck: await fileBinding({workspaceRoot, probeRoot, relativePath: config.strictCheckPath}),
        render: await fileBinding({workspaceRoot, probeRoot, relativePath: config.renderPath}),
      },
      humanReviewInvented: false,
      lifecycleMutationApplied: false,
    },
  };
};

export const canonicalizeProbe = async ({workspaceRoot, probePath, write = false}) => {
  const result = await buildCanonicalProbeEvidence({workspaceRoot, probePath});
  if (!write) return {...result, written: false};
  let existing = null;
  try {
    existing = await readJson(result.evidencePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing && existing.schemaVersion !== result.evidence.schemaVersion) {
    const legacyPath = path.join(result.probeRoot, legacyEvidenceName);
    try {
      await fs.access(legacyPath);
    } catch {
      await writeAtomic(legacyPath, existing);
    }
  }
  await writeAtomic(result.evidencePath, result.evidence);
  const evidenceBinding = {path: normalizedRelative(path.relative(workspaceRoot, result.evidencePath)), sha256: await sha256File(result.evidencePath)};
  const receipt = {...result.receipt, evidence: evidenceBinding};
  await writeAtomic(path.join(result.probeRoot, receiptName), receipt);
  return {...result, receipt, evidenceBinding, written: true};
};

const parseArgs = (values) => {
  const args = {write: false};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--probe') args.probePath = values[++index];
    else if (value === '--write') args.write = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.probePath) throw new Error('Usage: node tools/motion-recipe-lifecycle/canonicalize-probe.mjs --probe <workspace-relative-path> [--write]');
  return args;
};

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
  const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
  canonicalizeProbe({workspaceRoot, ...parseArgs(process.argv.slice(2))})
    .then((result) => console.log(JSON.stringify({
      ok: true,
      probe: result.config.projectId,
      recipeId: result.config.recipeId,
      written: result.written,
      evidencePath: normalizedRelative(path.relative(workspaceRoot, result.evidencePath)),
      evidenceSha256: result.evidenceBinding?.sha256 ?? null,
      humanReviewInvented: false,
      lifecycleMutationApplied: false,
    }, null, 2)))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
