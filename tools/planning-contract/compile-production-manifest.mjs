import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertSchema} from './schema-validator.mjs';
import {
  loadMotionRecipeLibrary,
  normalizeShotCreativeFields,
  validateShotCreativeFields,
} from './creative-contract.mjs';
import {
  collectMotionRecipeRefs,
  createMotionRecipeAccessReceipt,
} from './motion-lifecycle-gate.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, '..', '..');
const schemaDir = path.join(moduleDir, 'schemas');
const tolerance = 0.0005;

const defaultRelativePaths = {
  narrationLock: 'NarrationLock.json',
  templateLock: 'template-lock.json',
  alignment: 'audio/alignment.json',
  storyboard: 'plan/storyboard.json',
  shotManifest: 'plan/shot-manifest.json',
  graphIr: 'plan/graph-ir.json',
};

const schemaFiles = {
  shotManifest: 'shot-manifest.schema.json',
  graphIr: 'graph-ir.schema.json',
  productionManifest: 'production-manifest.schema.json',
};

const toPosix = (value) => value.replaceAll('\\', '/');
const near = (left, right) => Math.abs(left - right) <= tolerance;
const overlapsPrevious = (previousEnd, nextStart) => Number(nextStart) + tolerance < Number(previousEnd);
const normalizedNarration = (text) => text.replace(/\r\n/g, '\n').trim();
const sha256Text = (text) => crypto.createHash('sha256').update(text).digest('hex');

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const pathInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

const unique = (values) => new Set(values).size === values.length;

export class PlanningContractError extends Error {
  constructor(issues) {
    super(`Planning contract validation failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'PlanningContractError';
    this.issues = issues;
  }
}

const assertNoIssues = (issues) => {
  if (issues.length) throw new PlanningContractError(issues);
};

const validateTextProvenance = ({item, label, cueById, allowedTypes, issues}) => {
  if (!allowedTypes.has(item.type ?? item.textType)) {
    issues.push(`${label} has an unsupported provenance type: ${item.type ?? item.textType}.`);
    return;
  }
  const sourceCueIds = item.sourceCueIds ?? [];
  if (!sourceCueIds.length || !unique(sourceCueIds)) issues.push(`${label} must have unique sourceCueIds.`);
  const sourceCues = sourceCueIds.map((cueId) => cueById.get(cueId));
  sourceCueIds.forEach((cueId, index) => {
    if (!sourceCues[index]) issues.push(`${label} references an unknown cue: ${cueId}.`);
  });
  const provenance = item.type ?? item.textType;
  if (provenance === 'exact-source' && sourceCues.every(Boolean)) {
    const sourceText = sourceCues.map((cue) => cue.text).join('');
    const text = item.text ?? item.label;
    if (!sourceText.includes(text)) issues.push(`${label} is exact-source but is not an exact excerpt of its source cues.`);
  }
  if (provenance === 'approved-summary' && !item.approvalReceipt) {
    issues.push(`${label} is approved-summary but has no approvalReceipt.`);
  }
};

export const validatePlanningDocuments = ({narrationLock, templateLock = null, templateContract = null, motionLibrary = null, alignment, storyboard, shotManifest, graphIr}) => {
  const issues = [];
  const projectIds = [narrationLock.projectId, templateLock?.projectId ?? narrationLock.projectId, storyboard.projectId, shotManifest.projectId, graphIr.projectId];
  if (!projectIds.every((value) => value === projectIds[0])) issues.push('Project IDs do not match across planning inputs.');
  if (templateLock && templateLock.narrationSha256 !== narrationLock.normalizedSha256) {
    issues.push('templateLock.narrationSha256 does not match NarrationLock.normalizedSha256.');
  }

  const cues = alignment.cues ?? [];
  const cueIds = cues.map((cue) => cue.id);
  const cueById = new Map(cues.map((cue) => [cue.id, cue]));
  if (!cues.length || !unique(cueIds)) issues.push('Alignment cues must be present and have unique IDs.');
  cues.forEach((cue, index) => {
    if (!(cue.start >= 0 && cue.end > cue.start)) issues.push(`Alignment cue ${cue.id} has invalid timing.`);
    if (index > 0 && overlapsPrevious(cues[index - 1].end, cue.start)) issues.push(`Alignment cue ${cue.id} overlaps the previous cue.`);
  });
  if (alignment.narrationSha256 !== narrationLock.normalizedSha256) {
    issues.push('alignment.narrationSha256 does not match NarrationLock.normalizedSha256.');
  }

  const allowedTextTypes = new Set(shotManifest.allowedScreenTextTypes ?? []);
  const allowedMotionRules = new Set(shotManifest.allowedMotionRules ?? []);
  const templatePoseIds = new Set(templateContract?.poseIds ?? []);
  const templateMotionRules = new Set(templateContract?.allowedMotionRules ?? []);
  const templateOperations = new Set(templateContract?.allowedVisualOperations ?? []);
  const templateLayoutPairs = new Set((templateContract?.layoutPairs ?? []).map((item) => `${item.hostZone}|${item.contentZone}|${item.captionZone}`));
  if (templateContract) {
    if (templateContract.styleId !== templateLock?.styleId || templateContract.styleVersion !== templateLock?.styleVersion) {
      issues.push('Template planning contract does not match template-lock style ID/version.');
    }
    const format = templateContract.format ?? {};
    if (storyboard.format?.ratio !== format.ratio
        || Number(storyboard.format?.width) !== Number(format.width)
        || Number(storyboard.format?.height) !== Number(format.height)
        || Number(storyboard.format?.fps) !== Number(format.fps)) {
      issues.push('Storyboard format does not match the template planning contract.');
    }
    for (const rule of allowedMotionRules) {
      if (!templateMotionRules.has(rule)) issues.push(`Shot manifest allowlists a motion rule outside the template contract: ${rule}.`);
    }
  }
  const shots = shotManifest.shots ?? [];
  const shotCueIds = shots.map((shot) => shot.cueId);
  if (shotManifest.cueCount !== cues.length) issues.push('shotManifest.cueCount does not match alignment cue count.');
  if (!unique(shotCueIds)) issues.push('Shot cue IDs must be unique.');
  if (shotCueIds.length !== cueIds.length || shotCueIds.some((cueId, index) => cueId !== cueIds[index])) {
    issues.push('Shots must cover every alignment cue exactly once and in alignment order.');
  }

  const shotByCueId = new Map(shots.map((shot) => [shot.cueId, shot]));
  shots.forEach((shot, index) => {
    const cue = cueById.get(shot.cueId);
    if (!cue) return;
    if (shot.narration !== cue.text) issues.push(`${shot.cueId} narration differs from the locked alignment cue.`);
    if (!near(shot.start, cue.start) || !near(shot.end, cue.end)) issues.push(`${shot.cueId} timing differs from alignment.`);
    if (!near(shot.duration, shot.end - shot.start)) issues.push(`${shot.cueId} duration differs from its boundaries.`);
    if (!shot.zones.includes('caption')) issues.push(`${shot.cueId} does not preserve the caption zone.`);
    if (templateContract) {
      if (!templatePoseIds.has(shot.hostPose)) issues.push(`${shot.cueId} uses a pose outside the template contract: ${shot.hostPose}.`);
      if (!templateOperations.has(shot.visualOperation)) issues.push(`${shot.cueId} uses an operation outside the template contract: ${shot.visualOperation}.`);
    }
    shot.motionRules.forEach((rule) => {
      if (!allowedMotionRules.has(rule)) issues.push(`${shot.cueId} uses a motion rule outside the shot manifest allowlist: ${rule}.`);
    });
    validateTextProvenance({item: shot.screenText, label: `${shot.cueId}.screenText`, cueById, allowedTypes: allowedTextTypes, issues});
    if (templateContract?.scenePolicy?.maxScreenTextCodePoints
        && storyboard.provenance?.mode === 'deterministic-baseline'
        && [...String(shot.screenText?.text ?? '')].length > Number(templateContract.scenePolicy.maxScreenTextCodePoints)) {
      issues.push(`${shot.cueId}.screenText exceeds the deterministic template code-point limit.`);
    }
    if (index > 0 && overlapsPrevious(shots[index - 1].end, shot.start)) issues.push(`${shot.cueId} overlaps the previous shot.`);
  });

  if (shotManifest.motionRecipeLibrary) {
    if (!motionLibrary) {
      issues.push('Shot manifest declares a motion recipe library but the library was not supplied for validation.');
    } else {
      if (shotManifest.motionRecipeLibrary.libraryId !== motionLibrary.libraryId
          || shotManifest.motionRecipeLibrary.version !== motionLibrary.version
          || shotManifest.motionRecipeLibrary.schemaVersion !== motionLibrary.schemaVersion) {
        issues.push('Shot manifest motion recipe library receipt is stale.');
      }
      for (const shot of shots) {
        try {
          validateShotCreativeFields({shot, library: motionLibrary});
        } catch (error) {
          issues.push(error.message);
        }
      }
      const sfxMoments = shots.flatMap((shot) => (shot.sfxRefs ?? []).map((ref) => ({
        cueId: shot.cueId,
        time: Number(shot.start) + Number(ref.offsetMs ?? 0) / 1000,
      }))).sort((left, right) => left.time - right.time);
      const minGap = Number(motionLibrary.sfxPolicy?.minGapSeconds ?? 0);
      for (let index = 1; index < sfxMoments.length; index += 1) {
        if (sfxMoments[index].time - sfxMoments[index - 1].time + tolerance < minGap) {
          issues.push(`SFX events at ${sfxMoments[index - 1].cueId} and ${sfxMoments[index].cueId} violate the ${minGap}s minimum gap.`);
        }
      }
      const durationMinutes = Math.max(Number(alignment.lastEndSeconds ?? alignment.durationSeconds ?? 0) / 60, 1);
      const maxEvents = Math.ceil(Number(motionLibrary.sfxPolicy?.maxPerMinute ?? 0) * durationMinutes);
      if (sfxMoments.length > maxEvents) issues.push(`SFX density ${sfxMoments.length} exceeds the semantic-only limit of ${maxEvents}.`);
    }
  }

  const scenes = storyboard.scenes ?? [];
  const sceneIds = scenes.map((scene) => scene.id);
  if (!scenes.length || !unique(sceneIds)) issues.push('Storyboard scenes must be present and have unique IDs.');
  if (!unique(scenes.map((scene) => scene.order))) issues.push('Storyboard scene order values must be unique.');
  if (!unique(scenes.map((scene) => scene.plannedSrc))) issues.push('Storyboard plannedSrc paths must be unique.');
  scenes.forEach((scene, index) => {
    if (scene.order !== index + 1) issues.push(`${scene.id} order must equal ${index + 1}.`);
    if (path.isAbsolute(scene.plannedSrc) || scene.plannedSrc.split(/[\\/]/).includes('..')) {
      issues.push(`${scene.id} plannedSrc must be project-relative and may not traverse upward.`);
    }
    if (!scene.cueIds.length || !unique(scene.cueIds)) issues.push(`${scene.id} must contain unique cue IDs.`);
    const firstCue = cueById.get(scene.cueIds[0]);
    const lastCue = cueById.get(scene.cueIds.at(-1));
    scene.cueIds.forEach((cueId) => {
      const shot = shotByCueId.get(cueId);
      if (!shot) issues.push(`${scene.id} references a cue with no shot: ${cueId}.`);
      else if (shot.sceneId !== scene.id) issues.push(`${cueId} points to ${shot.sceneId}, expected ${scene.id}.`);
    });
    if (firstCue && lastCue) {
      if (!near(scene.timing.start, firstCue.start) || !near(scene.timing.end, lastCue.end)) {
        issues.push(`${scene.id} boundaries do not match its first and last cues.`);
      }
      if (!near(scene.timing.duration, scene.timing.end - scene.timing.start)) issues.push(`${scene.id} duration differs from its boundaries.`);
      if (scene.cueRange?.start !== firstCue.id || scene.cueRange?.end !== lastCue.id) issues.push(`${scene.id} cueRange does not match cueIds.`);
    }
    if (index > 0 && overlapsPrevious(scenes[index - 1].timing.end, scene.timing.start)) issues.push(`${scene.id} overlaps the previous scene.`);
    if (templateContract) {
      const layoutKey = `${scene.layout?.hostZone}|${scene.layout?.contentZone}|${scene.layout?.captionZone}`;
      if (!templateLayoutPairs.has(layoutKey)) issues.push(`${scene.id} uses a zone pairing outside the template contract.`);
      if (!templatePoseIds.has(scene.layout?.hostPose)) issues.push(`${scene.id} uses a pose outside the template contract: ${scene.layout?.hostPose}.`);
      for (const operation of scene.visualOperations ?? []) {
        if (!templateOperations.has(operation)) issues.push(`${scene.id} uses an operation outside the template contract: ${operation}.`);
      }
    }
    scene.motionRules.forEach((rule) => {
      if (!allowedMotionRules.has(rule)) issues.push(`${scene.id} uses a motion rule outside the shot manifest allowlist: ${rule}.`);
    });
    for (const item of scene.screenText ?? []) {
      validateTextProvenance({item, label: `${scene.id}.screenText.${item.id}`, cueById, allowedTypes: allowedTextTypes, issues});
    }
  });
  const storyboardCueIds = scenes.flatMap((scene) => scene.cueIds);
  if (storyboardCueIds.length !== cueIds.length || !unique(storyboardCueIds) || storyboardCueIds.some((cueId, index) => cueId !== cueIds[index])) {
    issues.push('Storyboard scenes must partition all alignment cues exactly once and in order.');
  }

  const graphIds = graphIr.graphs.map((graph) => graph.id);
  const globalNodeIds = graphIr.graphs.flatMap((graph) => graph.nodes.map((node) => node.id));
  const globalEdgeIds = graphIr.graphs.flatMap((graph) => graph.edges.map((edge) => edge.id));
  const globalStateIds = graphIr.graphs.flatMap((graph) => graph.states.map((state) => state.id));
  if (!unique(graphIds)) issues.push('Graph IDs must be globally unique.');
  if (!unique(globalNodeIds)) issues.push('Graph node IDs must be globally unique.');
  if (!unique(globalEdgeIds)) issues.push('Graph edge IDs must be globally unique.');
  if (!unique(globalStateIds)) issues.push('Graph state IDs must be globally unique.');

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const forbiddenKinds = new Set(graphIr.globalPolicy.forbidGraphKinds ?? []);
  const excludedClaims = graphIr.globalPolicy.excludedNumericClaims ?? [];
  const maxActiveNodes = graphIr.globalPolicy.maxActiveNodesPerState;
  if (templateContract?.graphPolicy?.maxActiveNodesPerState
      && Number(maxActiveNodes) > Number(templateContract.graphPolicy.maxActiveNodesPerState)) {
    issues.push(`Graph IR maxActiveNodesPerState exceeds the template contract: ${maxActiveNodes}.`);
  }
  const graphAllowedMotion = new Set(graphIr.globalPolicy.allowedMotionRules ?? []);
  for (const graph of graphIr.graphs) {
    const scene = sceneById.get(graph.sceneId);
    if (!scene) issues.push(`${graph.id} references an unknown scene: ${graph.sceneId}.`);
    if (forbiddenKinds.has(graph.kind)) issues.push(`${graph.id} uses a forbidden graph kind: ${graph.kind}.`);
    if (templateContract && !(templateContract.graphPolicy?.allowedKinds ?? []).includes(graph.kind)) {
      issues.push(`${graph.id} uses a graph kind outside the template contract: ${graph.kind}.`);
    }
    if (excludedClaims.some((claim) => JSON.stringify(graph).includes(claim))) issues.push(`${graph.id} contains an excluded numeric claim.`);
    if (scene && graph.sourceCueIds.some((cueId) => !scene.cueIds.includes(cueId))) issues.push(`${graph.id} source cues must be contained by ${scene.id}.`);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    const stateIds = new Set(graph.states.map((state) => state.id));
    for (const node of graph.nodes) {
      if (node.sourceCueIds.some((cueId) => !graph.sourceCueIds.includes(cueId))) issues.push(`${graph.id}.${node.id} source cues must be contained by the graph.`);
      validateTextProvenance({item: node, label: `${graph.id}.node.${node.id}`, cueById, allowedTypes: allowedTextTypes, issues});
    }
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) issues.push(`${graph.id}.${edge.id} references a missing node.`);
    }
    for (const state of graph.states) {
      if (state.activeNodeIds.length > maxActiveNodes) issues.push(`${graph.id}.${state.id} exceeds maxActiveNodesPerState.`);
      for (const nodeId of [...state.activeNodeIds, ...(state.compactedNodeIds ?? [])]) {
        if (!nodeIds.has(nodeId)) issues.push(`${graph.id}.${state.id} references a missing node: ${nodeId}.`);
      }
      for (const edgeId of state.activeEdgeIds) {
        if (!edgeIds.has(edgeId)) issues.push(`${graph.id}.${state.id} references a missing edge: ${edgeId}.`);
      }
      for (const cueId of state.cueIds) {
        if (!graph.sourceCueIds.includes(cueId)) issues.push(`${graph.id}.${state.id} references a cue outside the graph: ${cueId}.`);
      }
    }
    if (graph.cueDirectives) {
      const directiveCueIds = graph.cueDirectives.map((directive) => directive.cueId);
      if (!unique(directiveCueIds) || directiveCueIds.length !== graph.sourceCueIds.length
          || directiveCueIds.some((cueId, index) => cueId !== graph.sourceCueIds[index])) {
        issues.push(`${graph.id} cueDirectives must cover every graph cue exactly once and in order.`);
      }
      for (const directive of graph.cueDirectives) {
        if (motionLibrary) {
          try {
            validateShotCreativeFields({shot: directive, library: motionLibrary});
          } catch (error) {
            issues.push(`${graph.id}.${error.message}`);
          }
        }
      }
    }
    if (!stateIds.has(graph.terminalStateId)) issues.push(`${graph.id} terminalStateId does not reference a graph state.`);
    graph.motionRules.forEach((rule) => {
      if (!graphAllowedMotion.has(rule) || !allowedMotionRules.has(rule)) issues.push(`${graph.id} uses an unapproved motion rule: ${rule}.`);
    });
  }

  assertNoIssues(issues);
  return {
    projectId: projectIds[0],
    cueCount: cues.length,
    sceneCount: scenes.length,
    graphCount: graphIr.graphs.length,
  };
};

const loadSchemas = async () => Object.fromEntries(await Promise.all(Object.entries(schemaFiles).map(async ([key, filename]) => [key, await readJson(path.join(schemaDir, filename))])));

const loadProjectDocuments = async (projectRoot, relativePaths = {}) => {
  const resolvedRoot = path.resolve(projectRoot);
  const paths = Object.fromEntries(Object.entries({...defaultRelativePaths, ...relativePaths}).map(([key, relative]) => [key, path.resolve(resolvedRoot, relative)]));
  for (const [key, filePath] of Object.entries(paths)) {
    if (!pathInside(resolvedRoot, filePath)) throw new Error(`${key} must resolve inside the project root.`);
  }
  const [narrationLock, templateLock, alignment, storyboard, shotManifest, graphIr] = await Promise.all([
    readJson(paths.narrationLock),
    readJson(paths.templateLock),
    readJson(paths.alignment),
    readJson(paths.storyboard),
    readJson(paths.shotManifest),
    readJson(paths.graphIr),
  ]);
  return {projectRoot: resolvedRoot, paths, narrationLock, templateLock, alignment, storyboard, shotManifest, graphIr};
};

const loadTemplatePlanningContract = async (documents) => {
  const sourceRoot = path.resolve(workspaceRoot, documents.templateLock.sourcePath ?? '');
  const contractPath = path.join(sourceRoot, 'PLANNING_CONTRACT.json');
  if (!pathInside(workspaceRoot, contractPath)) {
    throw new PlanningContractError(['Template planning contract must stay inside the workspace.']);
  }
  const contract = await readJson(contractPath);
  const contractSha256 = await sha256File(contractPath);
  const contractWorkspacePath = workspaceRelative(contractPath);
  const receipt = (documents.templateLock.sourceFiles ?? []).find((item) => toPosix(item.path) === contractWorkspacePath);
  if (documents.storyboard.provenance?.mode === 'deterministic-baseline'
      && (!receipt || receipt.sha256 !== contractSha256)) {
    throw new PlanningContractError(['Deterministic planning requires PLANNING_CONTRACT.json to be hash-bound by template-lock.']);
  }
  return {contract, contractPath, contractSha256};
};

const validatePhysicalBindings = async (documents) => {
  const issues = [];
  const {projectRoot, paths, narrationLock, alignment, shotManifest} = documents;
  if (path.resolve(projectRoot, shotManifest.narrationLock) !== paths.narrationLock) issues.push('shotManifest.narrationLock does not bind to the supplied NarrationLock path.');
  if (path.resolve(projectRoot, shotManifest.sourceAlignment) !== paths.alignment) issues.push('shotManifest.sourceAlignment does not bind to the supplied alignment path.');

  const frozenNarrationPath = path.resolve(projectRoot, narrationLock.frozenPath);
  if (!pathInside(projectRoot, frozenNarrationPath)) issues.push('NarrationLock frozenPath must resolve inside the project.');
  else {
    const narration = await fs.readFile(frozenNarrationPath, 'utf8');
    if (sha256Text(normalizedNarration(narration)) !== narrationLock.normalizedSha256) issues.push('Frozen narration content does not match NarrationLock.normalizedSha256.');
  }

  const audioPath = path.resolve(projectRoot, 'audio', 'narration.final.wav');
  if (alignment.narrationLock && path.resolve(alignment.narrationLock) !== paths.narrationLock) {
    issues.push('alignment.narrationLock does not point to the supplied NarrationLock file.');
  }
  if (alignment.narration && path.resolve(alignment.narration) !== frozenNarrationPath) {
    issues.push('alignment.narration does not point to the frozen NarrationLock text.');
  }
  if (alignment.source && path.resolve(alignment.source) !== audioPath) {
    issues.push('alignment.source does not point to the project final narration WAV.');
  }
  try {
    const audioSha256 = await sha256File(audioPath);
    if (audioSha256 !== alignment.sourceSha256) issues.push('Final narration WAV does not match alignment.sourceSha256.');
  } catch (error) {
    if (error?.code === 'ENOENT') issues.push('Final narration WAV is missing.');
    else throw error;
  }
  assertNoIssues(issues);
  return {frozenNarrationPath, audioPath};
};

const projectRelative = (projectRoot, filePath) => toPosix(path.relative(projectRoot, filePath));
const workspaceRelative = (filePath) => toPosix(path.relative(workspaceRoot, filePath));

export const compileProductionManifest = async ({projectRoot, relativePaths = {}, internalFallbackRequest = null}) => {
  const [documents, schemas] = await Promise.all([loadProjectDocuments(projectRoot, relativePaths), loadSchemas()]);
  const templatePlanning = await loadTemplatePlanningContract(documents);
  const motionLibraryBundle = await loadMotionRecipeLibrary({
    workspaceRoot,
    expected: {
      styleId: documents.templateLock.styleId,
      styleVersion: documents.templateLock.styleVersion,
      paletteId: documents.templateLock.paletteId,
    },
  });
  assertSchema(schemas.shotManifest, documents.shotManifest, 'shot-manifest.json');
  assertSchema(schemas.graphIr, documents.graphIr, 'graph-ir.json');
  const semanticSummary = validatePlanningDocuments({...documents, templateContract: templatePlanning.contract, motionLibrary: motionLibraryBundle.library});
  const {frozenNarrationPath} = await validatePhysicalBindings(documents);

  const fileHashes = Object.fromEntries(await Promise.all(Object.entries(documents.paths).map(async ([key, filePath]) => [key, await sha256File(filePath)])));
  const graphsByScene = new Map();
  for (const graph of documents.graphIr.graphs) {
    const refs = graphsByScene.get(graph.sceneId) ?? [];
    refs.push({graphId: graph.id, stateIds: graph.states.map((state) => state.id), sourceCueIds: graph.sourceCueIds});
    graphsByScene.set(graph.sceneId, refs);
  }
  const sceneById = new Map(documents.storyboard.scenes.map((scene) => [scene.id, scene]));
  const graphBySceneId = new Map(documents.graphIr.graphs.map((graph) => [graph.sceneId, graph]));
  const effectiveShots = documents.shotManifest.shots.map((shot) => normalizeShotCreativeFields({
    shot,
    scene: sceneById.get(shot.sceneId),
    graph: graphBySceneId.get(shot.sceneId) ?? null,
    library: motionLibraryBundle.library,
  }));
  const motionLifecycle = await createMotionRecipeAccessReceipt({
    workspaceRoot,
    projectId: semanticSummary.projectId,
    recipeRefs: collectMotionRecipeRefs({shots: effectiveShots}),
    internalFallbackRequest,
  });
  const shotsByScene = new Map();
  for (const shot of effectiveShots) {
    const sceneShots = shotsByScene.get(shot.sceneId) ?? [];
    sceneShots.push(shot);
    shotsByScene.set(shot.sceneId, sceneShots);
  }

  const uniqueObjects = (values) => [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];

  const scenes = documents.storyboard.scenes.map((scene) => {
    const sceneShots = shotsByScene.get(scene.id) ?? [];
    return ({
    id: scene.id,
    order: scene.order,
    title: scene.title,
    role: scene.role,
    start: scene.timing.start,
    end: scene.timing.end,
    duration: scene.timing.duration,
    cueIds: scene.cueIds,
    shotCueIds: sceneShots.map((shot) => shot.cueId),
    plannedSrc: scene.plannedSrc,
    layout: scene.layout,
    visualOperations: scene.visualOperations,
    motionRules: scene.motionRules,
    visualTypes: [...new Set(sceneShots.map((shot) => shot.visualType))],
    motionRecipeRefs: uniqueObjects(sceneShots.flatMap((shot) => shot.motionRecipeRefs)),
    assetRefs: uniqueObjects(sceneShots.flatMap((shot) => shot.assetRefs)),
    carrierPayloads: uniqueObjects(sceneShots.map((shot) => shot.carrierPayload).filter(Boolean)),
    sfxRefs: uniqueObjects(sceneShots.flatMap((shot) => shot.sfxRefs)),
    provenanceRefs: [...new Set(sceneShots.flatMap((shot) => shot.provenanceRefs))],
    terminalState: scene.terminalState,
    graphRefs: graphsByScene.get(scene.id) ?? [],
  });
  });
  const cueDirectives = effectiveShots.map((shot) => ({
    cueId: shot.cueId,
    sceneId: shot.sceneId,
    start: shot.start,
    end: shot.end,
    visualType: shot.visualType,
    motionRecipeRefs: shot.motionRecipeRefs,
    assetRefs: shot.assetRefs,
    carrierPayload: shot.carrierPayload ?? null,
    sfxRefs: shot.sfxRefs,
    provenanceRefs: shot.provenanceRefs,
  }));

  const manifest = {
    schemaVersion: 'autovideo-production-manifest/v1',
    projectId: semanticSummary.projectId,
    motionLifecycleAccess: motionLifecycle.receipt,
    bindings: {
      narrationLock: {
        path: projectRelative(documents.projectRoot, documents.paths.narrationLock),
        sha256: fileHashes.narrationLock,
        normalizedNarrationSha256: documents.narrationLock.normalizedSha256,
        frozenNarrationPath: projectRelative(documents.projectRoot, frozenNarrationPath),
      },
      templateLock: {
        path: projectRelative(documents.projectRoot, documents.paths.templateLock),
        sha256: fileHashes.templateLock,
      },
      alignment: {
        path: projectRelative(documents.projectRoot, documents.paths.alignment),
        sha256: fileHashes.alignment,
        narrationSha256: documents.alignment.narrationSha256,
        audioSha256: documents.alignment.sourceSha256,
        cueCount: documents.alignment.cues.length,
        lastEndSeconds: documents.alignment.lastEndSeconds,
      },
      storyboard: {
        path: projectRelative(documents.projectRoot, documents.paths.storyboard),
        sha256: fileHashes.storyboard,
      },
      shotManifest: {
        path: projectRelative(documents.projectRoot, documents.paths.shotManifest),
        sha256: fileHashes.shotManifest,
        schemaVersion: documents.shotManifest.schemaVersion,
        schemaPath: workspaceRelative(path.join(schemaDir, schemaFiles.shotManifest)),
      },
      graphIr: {
        path: projectRelative(documents.projectRoot, documents.paths.graphIr),
        sha256: fileHashes.graphIr,
        schemaVersion: documents.graphIr.schemaVersion,
        schemaPath: workspaceRelative(path.join(schemaDir, schemaFiles.graphIr)),
      },
      motionRecipeLibrary: {
        path: motionLibraryBundle.relativePath,
        sha256: motionLibraryBundle.sha256,
        schemaVersion: motionLibraryBundle.library.schemaVersion,
        scope: 'workspace',
      },
    },
    format: {
      ratio: documents.storyboard.format.ratio,
      width: documents.storyboard.format.width,
      height: documents.storyboard.format.height,
      fps: documents.storyboard.format.fps,
    },
    timeline: {
      start: scenes[0].start,
      end: scenes.at(-1).end,
      duration: Number((scenes.at(-1).end - scenes[0].start).toFixed(6)),
    },
    sceneCount: scenes.length,
    cueCount: documents.alignment.cues.length,
    cueDirectives,
    scenes,
    provenance: documents.storyboard.provenance ?? {mode: 'formal-project'},
  };
  assertSchema(schemas.productionManifest, manifest, 'production-manifest.json');
  return manifest;
};

export const writeProductionManifest = async ({projectRoot, outputPath, relativePaths = {}, internalFallbackRequest = null}) => {
  const manifest = await compileProductionManifest({projectRoot, relativePaths, internalFallbackRequest});
  const resolvedOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedOutput), {recursive: true});
  await fs.writeFile(resolvedOutput, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {manifest, outputPath: resolvedOutput};
};

export const planningContractPaths = {
  schemas: Object.fromEntries(Object.entries(schemaFiles).map(([key, filename]) => [key, path.join(schemaDir, filename)])),
  defaultRelativePaths: {...defaultRelativePaths},
};
