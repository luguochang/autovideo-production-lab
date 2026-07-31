import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parseArgs = (values) => {
  const parsed = {_: []};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) parsed._.push(value);
    else {
      const key = value.slice(2);
      const next = values[index + 1];
      if (!next || next.startsWith('--')) parsed[key] = true;
      else {
        parsed[key] = next;
        index += 1;
      }
    }
  }
  return parsed;
};
const args = parseArgs(process.argv.slice(2));
const projectId = args.project || args._[0] || 'demotext-standard-delivery-v2';
const referenceProjectId = args.reference || 'demotext-standard-delivery-v2';
if (![projectId, referenceProjectId].every((value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))) {
  throw new Error('Invalid project or reference project id.');
}
if (projectId === referenceProjectId) throw new Error('Fallback target and reference project must differ.');
const projectRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
const referenceRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', referenceProjectId);

const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);
const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      if (bytesRead < buffer.length) break;
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
const planningDigest = ({storyboard, graphIr, shotManifest}) => crypto.createHash('sha256')
  .update(JSON.stringify(canonical({storyboard, graphIr, shotManifest})))
  .digest('hex');

const main = async () => {
  const [referenceStoryboard, referenceShots, referenceGraph, referenceProduction, referenceLock, alignment, narrationLock] = await Promise.all([
    readJson(path.join(referenceRoot, 'plan', 'storyboard.json')),
    readJson(path.join(referenceRoot, 'plan', 'shot-manifest.json')),
    readJson(path.join(referenceRoot, 'plan', 'graph-ir.json')),
    readJson(path.join(referenceRoot, 'plan', 'production-manifest.json')),
    readJson(path.join(referenceRoot, 'NarrationLock.json')),
    readJson(path.join(projectRoot, 'audio', 'alignment.json')),
    readJson(path.join(projectRoot, 'NarrationLock.json')),
  ]);
  if (referenceLock.normalizedSha256 !== narrationLock.normalizedSha256) {
    throw new Error('Planning fallback reference narration does not match the target NarrationLock. Generate a new visual plan.');
  }
  const cueMap = new Map(alignment.cues.map((cue) => [cue.id, cue]));
  const cueFor = (id) => {
    const cue = cueMap.get(id);
    if (!cue) throw new Error(`Missing target alignment cue ${id}.`);
    return cue;
  };
  const timingFor = (cueIds) => {
    const cues = cueIds.map(cueFor);
    const start = cues[0].start;
    const end = cues.at(-1).end;
    return {start, end, duration: Number((end - start).toFixed(6))};
  };
  const storyboard = structuredClone(referenceStoryboard);
  storyboard.projectId = projectId;
  storyboard.status = 'outline';
  storyboard.format.audioDurationSeconds = alignment.durationSeconds;
  storyboard.format.timelineEndSeconds = alignment.lastEndSeconds;
  storyboard.style.projectApproval = 'pending';
  storyboard.provenance = {
    mode: 'deterministic-reference-fallback',
    referenceProjectId,
    reason: 'visual-plan structured adapter failed with upstream 502 after retry timeout.',
    referenceArtifactsAreStructureOnly: true,
  };
  for (const scene of storyboard.scenes) {
    scene.timing = timingFor(scene.cueIds);
    scene.cueRange = {start: scene.cueIds[0], end: scene.cueIds.at(-1)};
    scene.status = 'outline';
  }

  const shotManifest = structuredClone(referenceShots);
  shotManifest.projectId = projectId;
  shotManifest.sourceAlignment = 'audio/alignment.json';
  shotManifest.narrationLock = 'NarrationLock.json';
  shotManifest.cueCount = alignment.cues.length;
  shotManifest.provenance = storyboard.provenance;
  for (const shot of shotManifest.shots) {
    const cue = cueFor(shot.cueId);
    shot.narration = cue.text;
    shot.start = cue.start;
    shot.end = cue.end;
    shot.duration = Number((cue.end - cue.start).toFixed(6));
  }

  const graphIr = structuredClone(referenceGraph);
  graphIr.projectId = projectId;
  graphIr.provenance = storyboard.provenance;
  graphIr.globalPolicy = {
    ...(graphIr.globalPolicy || {}),
    maxActiveNodesPerState: 3,
    forbidGraphKinds: ['chart', 'stat', 'count'],
    excludedNumericClaims: ['99%', '90%', '30K'],
    numericClaimReason: 'Creator opinions are not verified measurements and may not be graphed.',
  };

  const planDir = path.join(projectRoot, 'plan');
  await Promise.all([
    writeJson(path.join(planDir, 'storyboard.json'), storyboard),
    writeJson(path.join(planDir, 'shot-manifest.json'), shotManifest),
    writeJson(path.join(planDir, 'graph-ir.json'), graphIr),
  ]);

  const [storyboardSha256, shotManifestSha256, graphIrSha256, narrationLockSha256, alignmentSha256, audioSha256] = await Promise.all([
    sha256File(path.join(planDir, 'storyboard.json')),
    sha256File(path.join(planDir, 'shot-manifest.json')),
    sha256File(path.join(planDir, 'graph-ir.json')),
    sha256File(path.join(projectRoot, 'NarrationLock.json')),
    sha256File(path.join(projectRoot, 'audio', 'alignment.json')),
    sha256File(path.join(projectRoot, 'audio', 'narration.final.wav')),
  ]);
  const productionManifest = structuredClone(referenceProduction);
  productionManifest.projectId = projectId;
  productionManifest.bindings.narrationLock = {
    path: 'NarrationLock.json',
    sha256: narrationLockSha256,
    normalizedNarrationSha256: narrationLock.normalizedSha256,
    frozenNarrationPath: narrationLock.frozenPath,
  };
  productionManifest.bindings.alignment = {
    path: 'audio/alignment.json',
    sha256: alignmentSha256,
    narrationSha256: alignment.narrationSha256,
    audioSha256,
    cueCount: alignment.cues.length,
    lastEndSeconds: alignment.lastEndSeconds,
  };
  productionManifest.bindings.storyboard = {path: 'plan/storyboard.json', sha256: storyboardSha256};
  productionManifest.bindings.shotManifest = {
    path: 'plan/shot-manifest.json',
    sha256: shotManifestSha256,
    schemaVersion: shotManifest.schemaVersion,
    schemaPath: 'workflow-console/schemas/shot-manifest.schema.json',
  };
  productionManifest.bindings.graphIr = {
    path: 'plan/graph-ir.json',
    sha256: graphIrSha256,
    schemaVersion: graphIr.schemaVersion,
    schemaPath: 'workflow-console/schemas/graph-ir.schema.json',
  };
  productionManifest.timeline = {start: 0, end: alignment.lastEndSeconds, duration: alignment.durationSeconds};
  productionManifest.sceneCount = storyboard.scenes.length;
  productionManifest.cueCount = shotManifest.shots.length;
  productionManifest.scenes = productionManifest.scenes.map((scene) => {
    const source = storyboard.scenes.find((item) => item.id === scene.id);
    return {
      ...scene,
      order: source.order,
      title: source.title,
      role: source.role,
      start: source.timing.start,
      end: source.timing.end,
      duration: source.timing.duration,
      cueIds: source.cueIds,
      shotCueIds: source.cueIds,
      plannedSrc: source.plannedSrc,
      layout: source.layout,
      visualOperations: source.visualOperations,
      motionRules: source.motionRules,
      terminalState: source.terminalState,
      graphRefs: source.graphRefs || [],
    };
  });
  productionManifest.provenance = storyboard.provenance;
  await writeJson(path.join(planDir, 'production-manifest.json'), productionManifest);

  const bundle = {
    schemaVersion: 'autovideo-planning-bundle/v1',
    projectId,
    workbenchRevision: 1,
    provenance: {
      ...storyboard.provenance,
      formalProjectPath: `hyperframes-workflow-kit/projects/${projectId}`,
      inputs: {
        narrationLock: {role: 'narration-lock', path: 'hyperframes-workflow-kit/projects/' + projectId + '/NarrationLock.json', sha256: narrationLockSha256, schemaVersion: narrationLock.schemaVersion},
        alignment: {role: 'alignment', path: 'hyperframes-workflow-kit/projects/' + projectId + '/audio/alignment.json', sha256: alignmentSha256, schemaVersion: alignment.schemaVersion},
        referenceNarrationLock: {role: 'reference-narration-lock', path: `hyperframes-workflow-kit/projects/${referenceProjectId}/NarrationLock.json`, sha256: await sha256File(path.join(referenceRoot, 'NarrationLock.json')), schemaVersion: referenceLock.schemaVersion},
        referenceStoryboard: {role: 'reference-storyboard-structure', path: `hyperframes-workflow-kit/projects/${referenceProjectId}/plan/storyboard.json`, sha256: await sha256File(path.join(referenceRoot, 'plan', 'storyboard.json')), schemaVersion: referenceStoryboard.schemaVersion},
        referenceShotManifest: {role: 'reference-shot-structure', path: `hyperframes-workflow-kit/projects/${referenceProjectId}/plan/shot-manifest.json`, sha256: await sha256File(path.join(referenceRoot, 'plan', 'shot-manifest.json')), schemaVersion: referenceShots.schemaVersion},
        referenceGraphIr: {role: 'reference-graph-structure', path: `hyperframes-workflow-kit/projects/${referenceProjectId}/plan/graph-ir.json`, sha256: await sha256File(path.join(referenceRoot, 'plan', 'graph-ir.json')), schemaVersion: referenceGraph.schemaVersion},
      },
    },
    planningDigestSha256: planningDigest({storyboard, graphIr, shotManifest}),
    storyboard,
    graphIr,
    shotManifest,
  };
  await writeJson(path.join(planDir, 'planning-fallback-bundle.json'), bundle);
  await writeJson(path.join(planDir, 'planning-fallback-receipt.json'), {
    schemaVersion: 'autovideo-planning-fallback/v1',
    projectId,
    createdAt: new Date().toISOString(),
    status: 'ready-for-workbench-import',
    failedStage: 'visual-plan',
    failure: {type: 'upstream-service', status: 502, message: 'Codex structured planning adapter unavailable after retry timeout.', jobPreserved: true},
    method: `Reused ${referenceProjectId} semantic structure only after an exact NarrationLock hash match; rebound every timing, narration excerpt, project ID, audio hash, alignment hash and NarrationLock hash to ${projectId}.`,
    referenceProject: referenceProjectId,
    reused: ['scene roles', 'stable scene/cue/node/edge IDs', 'screen-text provenance policy', 'motion rule selection'],
    notReused: ['audio', 'alignment', 'final composition', 'render', 'QA', 'approval receipts'],
    outputs: {
      storyboard: {path: 'plan/storyboard.json', sha256: storyboardSha256},
      shotManifest: {path: 'plan/shot-manifest.json', sha256: shotManifestSha256},
      graphIr: {path: 'plan/graph-ir.json', sha256: graphIrSha256},
      productionManifest: {path: 'plan/production-manifest.json', sha256: await sha256File(path.join(planDir, 'production-manifest.json'))},
      planningBundle: {path: 'plan/planning-fallback-bundle.json', sha256: await sha256File(path.join(planDir, 'planning-fallback-bundle.json'))},
    },
  });
  console.log(JSON.stringify({ok: true, projectId, sceneCount: storyboard.scenes.length, cueCount: shotManifest.shots.length, durationSeconds: alignment.durationSeconds, files: ['plan/storyboard.json', 'plan/shot-manifest.json', 'plan/graph-ir.json', 'plan/production-manifest.json', 'plan/planning-fallback-bundle.json', 'plan/planning-fallback-receipt.json']}, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
