import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertPlanningBundle,
  planningDigestSha256,
} from './planning-compat.mjs';
import {compileProductionManifest} from '../../tools/planning-contract/compile-production-manifest.mjs';
import {
  assertMotionRecipeLibrary,
  createSemanticCreativeSequence,
  loadMotionRecipeLibrary,
} from '../../tools/planning-contract/creative-contract.mjs';

const VERSION = '1.2.0';
const MAX_SCENE_CUES = 5;
const TARGET_SCENE_SECONDS = 30;
const ALLOWED_MOTION_RULES = [
  'viewport-change',
  'svg-path-draw',
  'scale-swap-transition',
  'card-morph-anchor',
];
const POSE_BY_ROLE = {
  hook: 'question',
  concept: 'explain',
  compare: 'present',
  process: 'point-right',
  proof: 'read',
  close: 'close',
};
const MOTION_BY_ROLE = {
  hook: ['scale-swap-transition'],
  concept: ['scale-swap-transition', 'viewport-change'],
  compare: ['card-morph-anchor', 'scale-swap-transition'],
  process: ['svg-path-draw', 'viewport-change'],
  proof: ['viewport-change'],
  close: ['card-morph-anchor', 'viewport-change'],
};

const serializeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Text = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256Json = (value) => sha256Text(serializeJson(value));

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
};

const workspaceRelativePath = (workspaceRoot, filePath) => {
  const relative = path.relative(workspaceRoot, filePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Deterministic planning input must stay inside the workspace: ${filePath}`);
  }
  return relative.replaceAll('\\', '/');
};

const round6 = (value) => Number(Number(value).toFixed(6));
const cleanText = (value) => String(value ?? '').trim();

const exactExcerpt = (value, maxChars) => {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  const punctuation = /[，。！？；：,.!?;:]/g;
  let match;
  let boundary = -1;
  while ((match = punctuation.exec(text)) && match.index < maxChars) {
    if (match.index >= Math.max(6, Math.floor(maxChars * 0.45))) boundary = match.index + 1;
  }
  return text.slice(0, boundary > 0 ? boundary : maxChars);
};

const screenExcerpt = (value, maxChars = 28) => {
  const text = cleanText(value);
  const nonWhitespaceLength = [...text.replace(/\s/g, '')].length;
  if (nonWhitespaceLength < 16) return exactExcerpt(text, maxChars);
  const compressedLimit = Math.max(6, Math.min(maxChars, Math.floor(nonWhitespaceLength * 0.68)));
  return exactExcerpt(text, compressedLimit);
};

const classifyScene = (text, index, count) => {
  if (count === 1) return 'hook';
  if (index === 0) return 'hook';
  if (index === count - 1) return 'close';
  if (/(步骤|流程|首先|其次|然后|接着|最后|第一|第二|第三|第四|第五)/i.test(text)) return 'process';
  if (/(不是|而是|但是|但凡|然而|相比|区别|相反|却|并不|不等于|≠|对比)/i.test(text)) return 'compare';
  if (/(证据|数据显示|研究表明|资料显示|来源|根据|报告)/i.test(text)) return 'proof';
  return 'concept';
};

const groupCues = (cues) => {
  const groups = [];
  let current = [];
  for (const cue of cues) {
    const proposedDuration = current.length ? Number(cue.end) - Number(current[0].start) : Number(cue.end) - Number(cue.start);
    if (current.length >= MAX_SCENE_CUES || (current.length >= 2 && proposedDuration > TARGET_SCENE_SECONDS)) {
      groups.push(current);
      current = [];
    }
    current.push(cue);
  }
  if (current.length) groups.push(current);
  return groups;
};

const validateInputs = ({projectId, narrationLock, alignment, templateLock, templateContract, motionLibrary, poseIds}) => {
  if (!projectId || narrationLock?.projectId !== projectId || templateLock?.projectId !== projectId) {
    throw new Error('Deterministic planning project IDs do not match.');
  }
  if (templateLock.styleId !== 'modern-ip-host-explainer'
      || templateLock.ratio !== '16:9'
      || templateLock.resolution !== '1920x1080'
      || Number(templateLock.fps) !== 30) {
    throw new Error('Deterministic planning requires the locked modern-ip-host-explainer 1920x1080/30 contract.');
  }
  if (templateContract?.schemaVersion !== 'autovideo-template-planning-contract/v1'
      || templateContract.styleId !== templateLock.styleId
      || templateContract.styleVersion !== templateLock.styleVersion
      || templateContract.format?.ratio !== templateLock.ratio
      || `${templateContract.format?.width}x${templateContract.format?.height}` !== templateLock.resolution
      || Number(templateContract.format?.fps) !== Number(templateLock.fps)) {
    throw new Error('Template planning contract is missing, stale, or incompatible with template-lock.');
  }
  if (Number(templateContract.scenePolicy?.maxCuesPerScene) !== MAX_SCENE_CUES
      || Number(templateContract.scenePolicy?.targetSceneSeconds) !== TARGET_SCENE_SECONDS
      || JSON.stringify(templateContract.allowedMotionRules) !== JSON.stringify(ALLOWED_MOTION_RULES)) {
    throw new Error('Deterministic planning algorithm settings do not match PLANNING_CONTRACT.json.');
  }
  if (alignment?.narrationSha256 !== narrationLock.normalizedSha256
      || templateLock.narrationSha256 !== narrationLock.normalizedSha256) {
    throw new Error('NarrationLock, alignment, and template-lock narration hashes do not match.');
  }
  if (!Array.isArray(alignment.cues) || alignment.cues.length === 0) {
    throw new Error('Deterministic planning requires at least one aligned cue.');
  }
  assertMotionRecipeLibrary(motionLibrary, {
    styleId: templateLock.styleId,
    styleVersion: templateLock.styleVersion,
    paletteId: templateLock.paletteId,
  });
  const cueIds = new Set();
  let previousEnd = 0;
  for (const [index, cue] of alignment.cues.entries()) {
    if (!cue?.id || cueIds.has(cue.id)) throw new Error(`Alignment cue ${index} has a missing or duplicate stable ID.`);
    if (!cleanText(cue.text)) throw new Error(`Alignment cue ${cue.id} has no exact NarrationLock text.`);
    const start = Number(cue.start);
    const end = Number(cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || start + 0.001 < previousEnd) {
      throw new Error(`Alignment cue ${cue.id} has invalid or non-monotonic timing.`);
    }
    cueIds.add(cue.id);
    previousEnd = end;
  }
  const requiredPoses = new Set(Object.values(POSE_BY_ROLE));
  for (const pose of requiredPoses) {
    if (!poseIds.includes(pose) || !templateContract.poseIds.includes(pose)) throw new Error(`Template pose contract is missing required pose ${pose}.`);
  }
};

const layoutFor = (role) => {
  return {
    hostPose: POSE_BY_ROLE[role],
    hostZone: 'host.left',
    contentZone: 'content.right',
    captionZone: 'caption',
  };
};

const operationsFor = (role) => {
  if (role === 'hook') return ['enter', 'hold'];
  if (role === 'compare') return ['replace', 'compare', 'compact'];
  if (role === 'process') return ['replace', 'compact'];
  if (role === 'close') return ['compact', 'hold'];
  return ['replace'];
};

const shotOperation = (role, cueIndex, cueCount) => {
  if (role === 'hook') return cueIndex === 0 ? 'enter' : 'hold';
  if (role === 'compare') return cueIndex === 0 ? 'replace' : 'compare';
  if (role === 'close') return cueIndex === cueCount - 1 ? 'hold' : 'compact';
  return cueIndex === 0 ? 'replace' : 'compact';
};

const numericClaimPattern = /\d+(?:[.,]\d+)?\s*(?:%|[kK]|万|亿)?/;

const buildGraph = (scene, cues) => {
  if (scene.role !== 'process' || cues.length < 2 || numericClaimPattern.test(cues.map((cue) => cue.text).join(' '))) return null;
  const graphId = `graph-${scene.id}`;
  const nodes = cues.map((cue, index) => ({
    id: `${graphId}-node-${String(index + 1).padStart(2, '0')}`,
    label: exactExcerpt(cue.text, 18),
    textType: 'exact-source',
    sourceCueIds: [cue.id],
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `${graphId}-edge-${String(index + 1).padStart(2, '0')}`,
    from: nodes[index].id,
    to: node.id,
    relation: 'next',
  }));
  const states = cues.map((cue, index) => {
    const activeStart = Math.max(0, index - 2);
    const activeNodes = nodes.slice(activeStart, index + 1);
    const activeNodeIds = activeNodes.map((node) => node.id);
    const activeNodeIdSet = new Set(activeNodeIds);
    return {
      id: `${graphId}-state-${String(index + 1).padStart(2, '0')}`,
      cueIds: [cue.id],
      operation: index === 0 ? 'replace' : 'compact',
      activeNodeIds,
      activeEdgeIds: edges
        .filter((edge) => activeNodeIdSet.has(edge.from) && activeNodeIdSet.has(edge.to))
        .map((edge) => edge.id),
      compactedNodeIds: nodes.slice(0, activeStart).map((node) => node.id),
    };
  });
  const graph = {
    id: graphId,
    sceneId: scene.id,
    kind: 'process',
    sourceCueIds: cues.map((cue) => cue.id),
    nodes,
    edges,
    states,
    terminalStateId: states.at(-1).id,
    motionRules: ['svg-path-draw', 'viewport-change'],
  };
  return graph;
};

export const buildDeterministicPlanningDocuments = ({
  projectId,
  narrationLock,
  alignment,
  templateLock,
  templateContract,
  motionLibrary,
  poseIds,
  inputReceipts,
  audioSha256,
  workbenchRevision = 1,
  createdAt = new Date().toISOString(),
  fallbackReason = 'Structured visual planning was unavailable; generated a conservative deterministic baseline.',
}) => {
  validateInputs({projectId, narrationLock, alignment, templateLock, templateContract, motionLibrary, poseIds});
  if (!inputReceipts?.narrationLock?.sha256 || !inputReceipts?.alignment?.sha256 || !inputReceipts?.templateLock?.sha256 || !inputReceipts?.templateContract?.sha256 || !inputReceipts?.motionRecipeLibrary?.sha256 || !audioSha256) {
    throw new Error('Deterministic planning requires hash receipts for every locked input and the final audio.');
  }
  const cueGroups = groupCues(alignment.cues);
  const provenance = {
    mode: 'deterministic-baseline',
    generator: 'workflow-console/lib/deterministic-planning.mjs',
    generatorVersion: VERSION,
    reason: fallbackReason,
    contentIndependent: false,
    policies: {
      exactSourceScreenText: true,
      everyCueExactlyOnce: true,
      maxCuesPerScene: MAX_SCENE_CUES,
      targetSceneSeconds: TARGET_SCENE_SECONDS,
      numericClaimsAsCharts: false,
      semanticCarrierSelection: true,
      illustrativeMockCarriers: ['code-surface', 'device-surface'],
      llmEnrichmentOptional: true,
    },
  };

  const scenes = cueGroups.map((cues, index) => {
    const sceneId = `scene-${String(index + 1).padStart(2, '0')}`;
    const sceneText = cues.map((cue) => cleanText(cue.text)).join(' ');
    const role = classifyScene(sceneText, index, cueGroups.length);
    const start = Number(cues[0].start);
    const end = Number(cues.at(-1).end);
    const scene = {
      id: sceneId,
      order: index + 1,
      title: exactExcerpt(cues[0].text, 16),
      role,
      cueRange: {start: cues[0].id, end: cues.at(-1).id},
      cueIds: cues.map((cue) => cue.id),
      timing: {start: round6(start), end: round6(end), duration: round6(end - start)},
      plannedSrc: `production/compositions/scenes/${String(index + 1).padStart(2, '0')}-${sceneId}.html`,
      status: 'deterministic-baseline',
      layout: layoutFor(role),
      visualOperations: operationsFor(role),
      screenText: cues.map((cue, cueIndex) => ({
        id: `${sceneId}-text-${String(cueIndex + 1).padStart(2, '0')}`,
        text: screenExcerpt(cue.text),
        type: 'exact-source',
        sourceCueIds: [cue.id],
      })),
      motionRules: MOTION_BY_ROLE[role],
      terminalState: {
        id: `${sceneId}-terminal`,
        operation: role === 'close' ? 'hold' : 'compact',
        ...(role === 'close' ? {minimumHoldSeconds: 0.6} : {}),
        description: 'Keep the final exact-source statement readable before the next semantic handoff.',
      },
    };
    return scene;
  });

  const graphs = [];
  const baseShots = [];
  for (const [sceneIndex, scene] of scenes.entries()) {
    const cues = cueGroups[sceneIndex];
    const graph = buildGraph(scene, cues);
    if (graph) {
      graphs.push(graph);
      scene.graphRefs = [graph.id];
    } else {
      scene.graphRefs = [];
    }
    for (const [cueIndex, cue] of cues.entries()) {
      const shot = {
        cueId: cue.id,
        sceneId: scene.id,
        narration: cleanText(cue.text),
        start: round6(cue.start),
        end: round6(cue.end),
        duration: round6(Number(cue.end) - Number(cue.start)),
        screenText: {
          text: screenExcerpt(cue.text),
          type: 'exact-source',
          sourceCueIds: [cue.id],
        },
        hostPose: scene.layout.hostPose,
        zones: [scene.layout.hostZone, scene.layout.contentZone, 'caption'],
        visualOperation: shotOperation(scene.role, cueIndex, cues.length),
        motionRules: scene.motionRules,
      };
      baseShots.push(shot);
    }
  }

  const shots = createSemanticCreativeSequence({
    shots: baseShots,
    scenes,
    graphs,
    library: motionLibrary,
  });
  const shotByCueId = new Map(shots.map((shot) => [shot.cueId, shot]));
  for (const graph of graphs) {
    graph.cueDirectives = graph.sourceCueIds.map((cueId) => {
      const shot = shotByCueId.get(cueId);
      return {
        cueId,
        visualType: shot.visualType,
        motionRecipeRefs: shot.motionRecipeRefs,
        assetRefs: shot.assetRefs,
        carrierPayload: shot.carrierPayload,
        sfxRefs: shot.sfxRefs,
        provenanceRefs: shot.provenanceRefs,
      };
    });
  }

  const allCueIds = alignment.cues.map((cue) => cue.id);
  const storyboardCueIds = scenes.flatMap((scene) => scene.cueIds);
  const shotCueIds = shots.map((shot) => shot.cueId);
  if (new Set(storyboardCueIds).size !== allCueIds.length
      || new Set(shotCueIds).size !== allCueIds.length
      || allCueIds.some((cueId, index) => cueId !== storyboardCueIds[index] || cueId !== shotCueIds[index])) {
    throw new Error('Deterministic planning did not cover every aligned cue exactly once and in order.');
  }

  const storyboard = {
    schemaVersion: 'autovideo-storyboard/v1',
    projectId,
    status: 'deterministic-baseline',
    format: {
      ratio: '16:9', width: 1920, height: 1080, fps: 30,
      audioDurationSeconds: Number(alignment.durationSeconds),
      timelineEndSeconds: Number(alignment.lastEndSeconds ?? alignment.cues.at(-1).end),
    },
    style: {
      id: templateLock.styleId,
      version: templateLock.styleVersion,
      palette: templateLock.paletteId,
      templateLock: 'template-lock.json',
      projectApproval: 'pending',
    },
    persistentZones: ['host', 'content', 'caption'],
    defaultVisualOperation: 'replace',
    allowedMotionRules: ALLOWED_MOTION_RULES,
    scenes,
    provenance,
  };
  const shotManifest = {
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId,
    sourceAlignment: 'audio/alignment.json',
    narrationLock: 'NarrationLock.json',
    cueCount: shots.length,
    timingUnit: 'seconds',
    captionPolicy: {
      zone: 'caption',
      textType: 'exact-source',
      source: 'NarrationLock exact text via audio/alignment.json',
      maxLines: 2,
    },
    defaultVisualOperation: 'replace',
    allowedScreenTextTypes: ['exact-source'],
    allowedMotionRules: ALLOWED_MOTION_RULES,
    motionRecipeLibrary: {
      libraryId: motionLibrary.libraryId,
      version: motionLibrary.version,
      path: inputReceipts.motionRecipeLibrary.path,
      sha256: inputReceipts.motionRecipeLibrary.sha256,
      schemaVersion: motionLibrary.schemaVersion,
    },
    shots,
    provenance,
  };
  const graphIr = {
    schemaVersion: 'autovideo-graph-ir/v1',
    projectId,
    purpose: 'Conservative deterministic process diagrams derived from aligned cue order.',
    globalPolicy: {
      maxActiveNodesPerState: 3,
      defaultStateTransition: 'replace',
      completedGroupTreatment: 'compact',
      allowedMotionRules: ALLOWED_MOTION_RULES,
      forbidGraphKinds: ['chart', 'stat', 'count'],
      excludedNumericClaims: [],
      numericClaimReason: 'The deterministic baseline never promotes numeric narration to a statistical chart.',
    },
    graphs,
    provenance,
  };

  const storyboardSha256 = sha256Json(storyboard);
  const shotManifestSha256 = sha256Json(shotManifest);
  const graphIrSha256 = sha256Json(graphIr);
  const timelineEnd = Number(alignment.lastEndSeconds ?? alignment.cues.at(-1).end);
  const productionManifest = {
    schemaVersion: 'autovideo-production-manifest/v1',
    projectId,
    format: {ratio: '16:9', width: 1920, height: 1080, fps: 30},
    timeline: {start: 0, end: timelineEnd, duration: Number(alignment.durationSeconds)},
    sceneCount: scenes.length,
    cueCount: shots.length,
    bindings: {
      narrationLock: {
        path: 'NarrationLock.json',
        sha256: inputReceipts.narrationLock.sha256,
        normalizedNarrationSha256: narrationLock.normalizedSha256,
        frozenNarrationPath: narrationLock.frozenPath,
      },
      templateLock: {
        path: 'template-lock.json',
        sha256: inputReceipts.templateLock.sha256,
      },
      alignment: {
        path: 'audio/alignment.json',
        sha256: inputReceipts.alignment.sha256,
        narrationSha256: alignment.narrationSha256,
        audioSha256,
        cueCount: shots.length,
        lastEndSeconds: timelineEnd,
      },
      storyboard: {path: 'plan/storyboard.json', sha256: storyboardSha256},
      shotManifest: {
        path: 'plan/shot-manifest.json',
        sha256: shotManifestSha256,
        schemaVersion: shotManifest.schemaVersion,
        schemaPath: 'workflow-console/schemas/shot-manifest.schema.json',
      },
      graphIr: {
        path: 'plan/graph-ir.json',
        sha256: graphIrSha256,
        schemaVersion: graphIr.schemaVersion,
        schemaPath: 'workflow-console/schemas/graph-ir.schema.json',
      },
      motionRecipeLibrary: {
        path: inputReceipts.motionRecipeLibrary.path,
        sha256: inputReceipts.motionRecipeLibrary.sha256,
        schemaVersion: motionLibrary.schemaVersion,
        scope: 'workspace',
      },
    },
    cueDirectives: shots.map((shot) => ({
      cueId: shot.cueId,
      sceneId: shot.sceneId,
      start: shot.start,
      end: shot.end,
      visualType: shot.visualType,
      motionRecipeRefs: shot.motionRecipeRefs,
      assetRefs: shot.assetRefs,
      carrierPayload: shot.carrierPayload,
      sfxRefs: shot.sfxRefs,
      provenanceRefs: shot.provenanceRefs,
    })),
    scenes: scenes.map((scene) => {
      const sceneShots = shots.filter((shot) => shot.sceneId === scene.id);
      return ({
      id: scene.id,
      order: scene.order,
      title: scene.title,
      role: scene.role,
      start: scene.timing.start,
      end: scene.timing.end,
      duration: scene.timing.duration,
      cueIds: scene.cueIds,
      shotCueIds: scene.cueIds,
      plannedSrc: scene.plannedSrc,
      layout: scene.layout,
      visualOperations: scene.visualOperations,
      motionRules: scene.motionRules,
      visualTypes: [...new Set(sceneShots.map((shot) => shot.visualType))],
      motionRecipeRefs: sceneShots.flatMap((shot) => shot.motionRecipeRefs),
      assetRefs: sceneShots.flatMap((shot) => shot.assetRefs),
      carrierPayloads: sceneShots.map((shot) => shot.carrierPayload).filter(Boolean),
      sfxRefs: sceneShots.flatMap((shot) => shot.sfxRefs),
      provenanceRefs: [...new Set(sceneShots.flatMap((shot) => shot.provenanceRefs))],
      terminalState: scene.terminalState,
      graphRefs: scene.graphRefs,
    });
    }),
    provenance,
  };

  const planningInputs = {
    narrationLock: inputReceipts.narrationLock,
    alignment: inputReceipts.alignment,
    templateLock: inputReceipts.templateLock,
    templateContract: inputReceipts.templateContract,
    motionRecipeLibrary: inputReceipts.motionRecipeLibrary,
  };
  const planningBundle = {
    schemaVersion: 'autovideo-planning-bundle/v1',
    projectId,
    workbenchRevision,
    provenance: {
      ...provenance,
      formalProjectPath: inputReceipts.formalProjectPath,
      inputs: planningInputs,
    },
    planningDigestSha256: planningDigestSha256({storyboard, graphIr, shotManifest}),
    storyboard,
    graphIr,
    shotManifest,
  };
  assertPlanningBundle(planningBundle, projectId);

  const productionManifestSha256 = sha256Json(productionManifest);
  const planningBundleSha256 = sha256Json(planningBundle);
  const receipt = {
    schemaVersion: 'autovideo-planning-fallback/v2',
    projectId,
    createdAt,
    status: 'ready-for-workbench-import',
    failedStage: 'visual-plan',
    failure: {type: 'structured-planning-unavailable', message: fallbackReason},
    method: 'Generated a deterministic semantic baseline from the current NarrationLock, alignment, and locked template contract.',
    reusableAcrossUnrelatedScripts: true,
    llmEnrichmentRequired: false,
    outputs: {
      storyboard: {path: 'plan/storyboard.json', sha256: storyboardSha256},
      shotManifest: {path: 'plan/shot-manifest.json', sha256: shotManifestSha256},
      graphIr: {path: 'plan/graph-ir.json', sha256: graphIrSha256},
      productionManifest: {path: 'plan/production-manifest.json', sha256: productionManifestSha256},
      planningBundle: {path: 'plan/planning-fallback-bundle.json', sha256: planningBundleSha256},
    },
  };

  return {storyboard, shotManifest, graphIr, productionManifest, planningBundle, receipt};
};

const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);

export const generateDeterministicPlanningFiles = async ({
  formalRoot,
  workspaceRoot,
  projectId,
  workbenchRevision = 1,
  replace = false,
  fallbackReason,
}) => {
  const resolvedFormalRoot = path.resolve(formalRoot);
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const paths = {
    narrationLock: path.join(resolvedFormalRoot, 'NarrationLock.json'),
    alignment: path.join(resolvedFormalRoot, 'audio', 'alignment.json'),
    templateLock: path.join(resolvedFormalRoot, 'template-lock.json'),
    finalAudio: path.join(resolvedFormalRoot, 'audio', 'narration.final.wav'),
  };
  const [narrationLock, alignment, templateLock] = await Promise.all([
    readJson(paths.narrationLock),
    readJson(paths.alignment),
    readJson(paths.templateLock),
  ]);
  const styleRoot = path.resolve(resolvedWorkspaceRoot, templateLock.sourcePath);
  const poseManifestPath = path.join(styleRoot, 'POSE_MANIFEST.json');
  const planningContractPath = path.join(styleRoot, 'PLANNING_CONTRACT.json');
  for (const sourcePath of [styleRoot, poseManifestPath, planningContractPath]) {
    if (sourcePath !== resolvedWorkspaceRoot && !sourcePath.startsWith(`${resolvedWorkspaceRoot}${path.sep}`)) {
      throw new Error(`Template contract path escapes the workspace: ${path.relative(resolvedWorkspaceRoot, sourcePath)}`);
    }
  }
  const [poseManifest, templateContract] = await Promise.all([
    readJson(poseManifestPath),
    readJson(planningContractPath),
  ]);
  const motionLibraryBundle = await loadMotionRecipeLibrary({
    workspaceRoot: resolvedWorkspaceRoot,
    expected: {
      styleId: templateLock.styleId,
      styleVersion: templateLock.styleVersion,
      paletteId: templateLock.paletteId,
    },
  });
  const templateContractWorkspacePath = workspaceRelativePath(resolvedWorkspaceRoot, planningContractPath);
  const templateContractReceipt = (templateLock.sourceFiles ?? []).find((item) => item.path.replaceAll('\\', '/') === templateContractWorkspacePath);
  if (!templateContractReceipt) throw new Error('template-lock does not hash-bind PLANNING_CONTRACT.json. Re-apply the template before planning.');
  for (const sourceFile of templateLock.sourceFiles ?? []) {
    const sourcePath = path.resolve(resolvedWorkspaceRoot, sourceFile.path);
    if (sourcePath !== resolvedWorkspaceRoot && !sourcePath.startsWith(`${resolvedWorkspaceRoot}${path.sep}`)) {
      throw new Error(`Template source path escapes the workspace: ${sourceFile.path}`);
    }
    const actual = await sha256File(sourcePath);
    if (actual !== sourceFile.sha256) throw new Error(`Template lock is stale for ${sourceFile.path}.`);
  }

  const planDir = path.join(resolvedFormalRoot, 'plan');
  const planExists = await fs.access(planDir).then(() => true).catch(() => false);
  if (planExists && !replace) {
    const entries = await fs.readdir(planDir);
    if (entries.length) {
      throw new Error(`Planning output already exists in ${path.relative(resolvedWorkspaceRoot, planDir)}. Pass replace=true only after explicit invalidation.`);
    }
  }

  const [narrationLockSha256, alignmentSha256, templateLockSha256, templateContractSha256, audioSha256] = await Promise.all([
    sha256File(paths.narrationLock),
    sha256File(paths.alignment),
    sha256File(paths.templateLock),
    sha256File(planningContractPath),
    sha256File(paths.finalAudio),
  ]);
  const formalProjectPath = workspaceRelativePath(resolvedWorkspaceRoot, resolvedFormalRoot);
  const documents = buildDeterministicPlanningDocuments({
    projectId,
    narrationLock,
    alignment,
    templateLock,
    templateContract,
    motionLibrary: motionLibraryBundle.library,
    poseIds: (poseManifest.poses ?? []).map((pose) => pose.id),
    inputReceipts: {
      formalProjectPath,
      narrationLock: {role: 'narration-lock', path: `${formalProjectPath}/NarrationLock.json`, sha256: narrationLockSha256, schemaVersion: narrationLock.schemaVersion},
      alignment: {role: 'alignment', path: `${formalProjectPath}/audio/alignment.json`, sha256: alignmentSha256, schemaVersion: alignment.schemaVersion},
      templateLock: {role: 'template-lock', path: `${formalProjectPath}/template-lock.json`, sha256: templateLockSha256, schemaVersion: templateLock.schemaVersion},
      templateContract: {role: 'template-planning-contract', path: templateContractWorkspacePath, sha256: templateContractSha256, schemaVersion: templateContract.schemaVersion},
      motionRecipeLibrary: {
        role: 'motion-recipe-library',
        path: motionLibraryBundle.relativePath,
        sha256: motionLibraryBundle.sha256,
        schemaVersion: motionLibraryBundle.library.schemaVersion,
        libraryId: motionLibraryBundle.library.libraryId,
        version: motionLibraryBundle.library.version,
      },
    },
    audioSha256,
    workbenchRevision,
    fallbackReason,
  });
  const stagingDir = path.join(resolvedFormalRoot, `.planning-staging-${process.pid}-${Date.now()}`);
  const stagingPaths = {
    storyboard: path.join(stagingDir, 'storyboard.json'),
    shotManifest: path.join(stagingDir, 'shot-manifest.json'),
    graphIr: path.join(stagingDir, 'graph-ir.json'),
    productionManifest: path.join(stagingDir, 'production-manifest.json'),
    planningBundle: path.join(stagingDir, 'planning-fallback-bundle.json'),
    receipt: path.join(stagingDir, 'planning-fallback-receipt.json'),
  };
  let backupDir = null;
  try {
    await fs.mkdir(stagingDir, {recursive: true});
    await Promise.all([
      fs.writeFile(stagingPaths.storyboard, serializeJson(documents.storyboard), 'utf8'),
      fs.writeFile(stagingPaths.shotManifest, serializeJson(documents.shotManifest), 'utf8'),
      fs.writeFile(stagingPaths.graphIr, serializeJson(documents.graphIr), 'utf8'),
    ]);

    const compiled = await compileProductionManifest({
      projectRoot: resolvedFormalRoot,
      relativePaths: {
        storyboard: path.relative(resolvedFormalRoot, stagingPaths.storyboard),
        shotManifest: path.relative(resolvedFormalRoot, stagingPaths.shotManifest),
        graphIr: path.relative(resolvedFormalRoot, stagingPaths.graphIr),
      },
    });
    for (const key of ['storyboard', 'shotManifest', 'graphIr']) compiled.bindings[key].path = `plan/${key === 'shotManifest' ? 'shot-manifest' : key === 'graphIr' ? 'graph-ir' : 'storyboard'}.json`;
    documents.productionManifest = compiled;
    documents.receipt.outputs.productionManifest.sha256 = sha256Json(compiled);
    documents.receipt.outputs.planningBundle.sha256 = sha256Json(documents.planningBundle);
    await Promise.all([
      fs.writeFile(stagingPaths.productionManifest, serializeJson(documents.productionManifest), 'utf8'),
      fs.writeFile(stagingPaths.planningBundle, serializeJson(documents.planningBundle), 'utf8'),
      fs.writeFile(stagingPaths.receipt, serializeJson(documents.receipt), 'utf8'),
    ]);

    if (planExists) {
      if (!replace) {
        await fs.rmdir(planDir);
      } else {
        backupDir = `${planDir}.backup-${process.pid}-${Date.now()}`;
        await fs.rename(planDir, backupDir);
      }
    }
    await fs.rename(stagingDir, planDir);
    if (backupDir) await fs.rm(backupDir, {recursive: true, force: true});
  } catch (error) {
    await fs.rm(stagingDir, {recursive: true, force: true}).catch(() => {});
    if (backupDir && !await fs.access(planDir).then(() => true).catch(() => false)) {
      await fs.rename(backupDir, planDir).catch(() => {});
    }
    throw error;
  }
  return documents;
};

export const materializePlanningBundle = async ({
  formalRoot,
  workspaceRoot,
  projectId,
  bundle,
}) => {
  const resolvedFormalRoot = path.resolve(formalRoot);
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const validated = assertPlanningBundle(bundle, projectId);
  if (!validated.shotManifest || !validated.graphIr) {
    throw new Error('Only a complete planning bundle with storyboard, shot manifest, and Graph IR can enter full production.');
  }
  const stagingDir = path.join(resolvedFormalRoot, `.planning-edit-staging-${process.pid}-${Date.now()}`);
  const stagingPaths = {
    storyboard: path.join(stagingDir, 'storyboard.json'),
    shotManifest: path.join(stagingDir, 'shot-manifest.json'),
    graphIr: path.join(stagingDir, 'graph-ir.json'),
  };
  const planDir = path.join(resolvedFormalRoot, 'plan');
  const backupDir = `${planDir}.backup-edit-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    await fs.mkdir(stagingDir, {recursive: true});
    await Promise.all([
      fs.writeFile(stagingPaths.storyboard, serializeJson(validated.storyboard), 'utf8'),
      fs.writeFile(stagingPaths.shotManifest, serializeJson(validated.shotManifest), 'utf8'),
      fs.writeFile(stagingPaths.graphIr, serializeJson(validated.graphIr), 'utf8'),
    ]);
    const compiled = await compileProductionManifest({
      projectRoot: resolvedFormalRoot,
      relativePaths: {
        storyboard: path.relative(resolvedFormalRoot, stagingPaths.storyboard),
        shotManifest: path.relative(resolvedFormalRoot, stagingPaths.shotManifest),
        graphIr: path.relative(resolvedFormalRoot, stagingPaths.graphIr),
      },
    });
    for (const key of ['storyboard', 'shotManifest', 'graphIr']) compiled.bindings[key].path = `plan/${key === 'shotManifest' ? 'shot-manifest' : key === 'graphIr' ? 'graph-ir' : 'storyboard'}.json`;
    await fs.writeFile(path.join(stagingDir, 'production-manifest.json'), serializeJson(compiled), 'utf8');
    await fs.writeFile(path.join(stagingDir, 'planning-bundle.json'), serializeJson(validated), 'utf8');
    if (await fs.access(planDir).then(() => true).catch(() => false)) {
      await fs.rename(planDir, backupDir);
      movedExisting = true;
    }
    await fs.rename(stagingDir, planDir);
    if (movedExisting) await fs.rm(backupDir, {recursive: true, force: true});
    return {bundle: validated, productionManifest: compiled, sceneCount: compiled.sceneCount, cueCount: compiled.cueCount};
  } catch (error) {
    await fs.rm(stagingDir, {recursive: true, force: true}).catch(() => {});
    if (movedExisting && !await fs.access(planDir).then(() => true).catch(() => false)) {
      await fs.rename(backupDir, planDir).catch(() => {});
    }
    throw error;
  }
};

export const deterministicPlanningVersion = VERSION;
