import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';


const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
};

const sha256Text = (value) => crypto.createHash('sha256').update(value).digest('hex');

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
    throw new Error(`Planning input must stay inside the workspace: ${filePath}`);
  }
  return relative.replaceAll('\\', '/');
};

const readOptionalJson = async (filePath) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Cannot read planning JSON ${filePath}: ${error.message}`);
  }
};

const receiptFor = async (workspaceRoot, role, filePath, value) => ({
  role,
  path: workspaceRelativePath(workspaceRoot, filePath),
  sha256: await sha256File(filePath),
  schemaVersion: value?.schemaVersion ?? null,
});

const assertProjectId = (value, projectId, label) => {
  if (value?.projectId && value.projectId !== projectId) {
    throw new Error(`${label} projectId ${value.projectId} does not match ${projectId}.`);
  }
};

const assertStableIds = (items, label) => {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!item?.id || typeof item.id !== 'string') throw new Error(`${label}[${index}] is missing a stable id.`);
    if (ids.has(item.id)) throw new Error(`${label} contains duplicate id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
};

export const assertFormalStoryboard = (storyboard, projectId) => {
  if (storyboard?.schemaVersion !== 'autovideo-storyboard/v1' || !Array.isArray(storyboard.scenes) || !storyboard.scenes.length) {
    throw new Error('Formal storyboard must use autovideo-storyboard/v1 with a non-empty scenes array.');
  }
  assertProjectId(storyboard, projectId, 'Formal storyboard');
  assertStableIds(storyboard.scenes, 'storyboard.scenes');
  return storyboard;
};

export const assertGraphIr = (graphIr, projectId, sceneIds = null) => {
  if (graphIr == null) return null;
  if (graphIr.schemaVersion !== 'autovideo-graph-ir/v1' || !Array.isArray(graphIr.graphs)) {
    throw new Error('Graph IR must use autovideo-graph-ir/v1 with a graphs array.');
  }
  assertProjectId(graphIr, projectId, 'Graph IR');
  const graphIds = assertStableIds(graphIr.graphs, 'graphIr.graphs');
  for (const graph of graphIr.graphs) {
    if (sceneIds && graph.sceneId && !sceneIds.has(graph.sceneId)) {
      throw new Error(`Graph ${graph.id} references unknown scene ${graph.sceneId}.`);
    }
    const nodeIds = assertStableIds(graph.nodes ?? [], `graphIr.graphs.${graph.id}.nodes`);
    assertStableIds(graph.edges ?? [], `graphIr.graphs.${graph.id}.edges`);
    for (const edge of graph.edges ?? []) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        throw new Error(`Graph ${graph.id} edge ${edge.id} references an unknown node.`);
      }
    }
  }
  return graphIds;
};

export const assertShotManifest = (shotManifest, projectId, sceneIds = null) => {
  if (shotManifest == null) return null;
  if (shotManifest.schemaVersion !== 'autovideo-shot-manifest/v1' || !Array.isArray(shotManifest.shots)) {
    throw new Error('Shot manifest must use autovideo-shot-manifest/v1 with a shots array.');
  }
  assertProjectId(shotManifest, projectId, 'Shot manifest');
  const cueIds = new Set();
  for (const [index, shot] of shotManifest.shots.entries()) {
    if (!shot?.cueId || typeof shot.cueId !== 'string') {
      throw new Error(`shotManifest.shots[${index}] is missing cueId.`);
    }
    if (cueIds.has(shot.cueId)) throw new Error(`Shot manifest contains duplicate cue ${shot.cueId}.`);
    cueIds.add(shot.cueId);
    if (sceneIds && shot.sceneId && !sceneIds.has(shot.sceneId)) {
      throw new Error(`Shot ${shot.cueId} references unknown scene ${shot.sceneId}.`);
    }
  }
  if (Number.isInteger(shotManifest.cueCount) && shotManifest.cueCount !== shotManifest.shots.length) {
    throw new Error(`Shot manifest cueCount ${shotManifest.cueCount} does not match ${shotManifest.shots.length} shots.`);
  }
  return cueIds;
};

const assertShotManifestMatchesAlignment = (shotManifest, alignment) => {
  if (alignment?.schemaVersion !== 'autovideo-alignment-locked/v1'
    || !Array.isArray(alignment.cues)
    || !alignment.cues.length) {
    throw new Error('Formal planning import requires a current locked alignment with caption cues.');
  }
  const alignmentIds = alignment.cues.map((cue) => cue.id);
  if (new Set(alignmentIds).size !== alignmentIds.length || alignmentIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('Locked alignment cue IDs must be present and unique before planning import.');
  }
  const shots = shotManifest.shots ?? [];
  const byCueId = new Map(shots.map((shot) => [shot.cueId, shot]));
  if (shots.length !== alignment.cues.length || byCueId.size !== alignment.cues.length
    || alignmentIds.some((id) => !byCueId.has(id))) {
    throw new Error('Formal shot manifest must cover every current alignment cue exactly once.');
  }
  for (const cue of alignment.cues) {
    const shot = byCueId.get(cue.id);
    const expectedStart = Number(cue.start);
    const expectedEnd = Number(cue.end);
    const actualStart = Number(shot.start);
    const actualEnd = Number(shot.end);
    const actualDuration = Number(shot.duration);
    if (![expectedStart, expectedEnd, actualStart, actualEnd, actualDuration].every(Number.isFinite)
      || Math.abs(actualStart - expectedStart) > 0.001
      || Math.abs(actualEnd - expectedEnd) > 0.001
      || Math.abs(actualDuration - (expectedEnd - expectedStart)) > 0.001) {
      throw new Error(`Formal shot ${cue.id} timing is stale for the current alignment.`);
    }
    if (String(shot.narration ?? '') !== String(cue.text ?? '')) {
      throw new Error(`Formal shot ${cue.id} narration is stale for the current alignment.`);
    }
  }
};

export const planningDigestSha256 = ({storyboard, graphIr = null, shotManifest = null}) => sha256Text(
  JSON.stringify(canonicalize({storyboard, graphIr, shotManifest})),
);

export const refreshPlanningBundleRevision = (bundle, workbenchRevision) => {
  if (bundle?.schemaVersion !== 'autovideo-planning-bundle/v1') return bundle;
  if (!Number.isInteger(workbenchRevision) || workbenchRevision < 1) {
    throw new Error('Planning bundle revision must be a positive integer.');
  }
  const refreshed = structuredClone(bundle);
  refreshed.workbenchRevision = workbenchRevision;
  refreshed.planningDigestSha256 = planningDigestSha256(refreshed);
  return refreshed;
};

export const rebasePlanningBundleToAlignment = ({
  bundle,
  alignment,
  workbenchRevision = Number(bundle?.workbenchRevision ?? 0) + 1,
  sourceReceipt = null,
  rebasedAt = new Date().toISOString(),
}) => {
  const validated = assertPlanningBundle(bundle, bundle?.projectId);
  if (alignment?.schemaVersion !== 'autovideo-alignment-locked/v1'
    || !Array.isArray(alignment.cues)
    || !alignment.cues.length) {
    throw new Error('Planning timing rebase requires a current locked alignment with cues.');
  }
  const shots = validated.shotManifest?.shots ?? [];
  const shotByCueId = new Map(shots.map((shot) => [shot.cueId, shot]));
  if (shots.length !== alignment.cues.length || shotByCueId.size !== alignment.cues.length) {
    throw new Error('Planning timing rebase requires the same complete cue set.');
  }
  for (const cue of alignment.cues) {
    const shot = shotByCueId.get(cue.id);
    if (!shot) throw new Error(`Planning timing rebase is missing ${cue.id}.`);
    if (String(shot.narration ?? '') !== String(cue.text ?? '')) {
      throw new Error(`Planning timing rebase refuses changed narration at ${cue.id}.`);
    }
  }

  const rebased = structuredClone(validated);
  const cueById = new Map(alignment.cues.map((cue) => [cue.id, cue]));
  rebased.workbenchRevision = workbenchRevision;
  rebased.shotManifest.shots = rebased.shotManifest.shots.map((shot) => {
    const cue = cueById.get(shot.cueId);
    const start = Number(cue.start);
    const end = Number(cue.end);
    return {...shot, narration: cue.text, start, end, duration: Number((end - start).toFixed(6))};
  });
  rebased.storyboard.format = {
    ...(rebased.storyboard.format ?? {}),
    audioDurationSeconds: Number(alignment.durationSeconds),
    timelineEndSeconds: Number(alignment.lastEndSeconds ?? alignment.cues.at(-1).end),
  };
  rebased.storyboard.scenes = rebased.storyboard.scenes.map((scene) => {
    const sceneCues = (scene.cueIds ?? []).map((cueId) => cueById.get(cueId));
    if (!sceneCues.length || sceneCues.some((cue) => !cue)) {
      throw new Error(`Planning timing rebase found invalid cue coverage in scene ${scene.id}.`);
    }
    const start = Number(sceneCues[0].start);
    const end = Number(sceneCues.at(-1).end);
    return {...scene, timing: {start, end, duration: Number((end - start).toFixed(6))}};
  });
  const rebaseProvenance = {
    mode: 'alignment-timing-rebase',
    inputs: sourceReceipt ? {sourcePlanningBundle: sourceReceipt} : {},
    sourcePlanningDigestSha256: validated.planningDigestSha256,
    sourceMode: validated.provenance.mode,
    rebasedAt,
    policy: 'Narration and cue IDs must remain byte-exact; only shot and scene timing fields may change.',
  };
  rebased.provenance = rebaseProvenance;
  rebased.storyboard.provenance = {...(rebased.storyboard.provenance ?? {}), ...rebaseProvenance};
  rebased.shotManifest.provenance = {...(rebased.shotManifest.provenance ?? {}), ...rebaseProvenance};
  rebased.graphIr.provenance = {...(rebased.graphIr.provenance ?? {}), ...rebaseProvenance};
  rebased.planningDigestSha256 = planningDigestSha256(rebased);
  return assertPlanningBundle(rebased, rebased.projectId);
};

export const assertPlanningBundle = (bundle, projectId = bundle?.projectId) => {
  if (bundle?.schemaVersion !== 'autovideo-planning-bundle/v1') {
    throw new Error('Planning artifact must use autovideo-planning-bundle/v1.');
  }
  assertProjectId(bundle, projectId, 'Planning bundle');
  if (!Number.isInteger(bundle.workbenchRevision) || bundle.workbenchRevision < 1) {
    throw new Error('Planning bundle is missing a positive workbenchRevision.');
  }
  if (!bundle.provenance?.mode || !bundle.provenance?.inputs) {
    throw new Error('Planning bundle is missing provenance inputs.');
  }
  const storyboard = assertFormalStoryboard(bundle.storyboard, projectId);
  const sceneIds = new Set(storyboard.scenes.map((scene) => scene.id));
  assertGraphIr(bundle.graphIr, projectId, sceneIds);
  assertShotManifest(bundle.shotManifest, projectId, sceneIds);
  const digest = planningDigestSha256(bundle);
  if (bundle.planningDigestSha256 !== digest) {
    throw new Error(`Planning bundle digest mismatch: recorded=${bundle.planningDigestSha256}, actual=${digest}.`);
  }
  return bundle;
};

export const assertPlanningProvenanceCurrent = async (bundle, workspaceRoot) => {
  assertPlanningBundle(bundle, bundle.projectId);
  const root = path.resolve(workspaceRoot);
  for (const input of Object.values(bundle.provenance.inputs)) {
    if (!input?.path || !input?.sha256) continue;
    const target = path.resolve(root, input.path);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Planning provenance path escapes the workspace: ${input.path}`);
    }
    let actual;
    try {
      actual = await sha256File(target);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Planning provenance input is missing: ${input.path}`);
      throw error;
    }
    if (actual !== input.sha256) {
      throw new Error(`Planning provenance is stale for ${input.path}: recorded=${input.sha256}, actual=${actual}.`);
    }
  }
  return bundle;
};

const buildFormalProvenance = async ({formalRoot, workspaceRoot, storyboard, graphIr, shotManifest}) => {
  const inputs = {
    storyboard: await receiptFor(workspaceRoot, 'storyboard', path.join(formalRoot, 'plan', 'storyboard.json'), storyboard),
    graphIr: graphIr
      ? await receiptFor(workspaceRoot, 'graph-ir', path.join(formalRoot, 'plan', 'graph-ir.json'), graphIr)
      : null,
    shotManifest: shotManifest
      ? await receiptFor(workspaceRoot, 'shot-manifest', path.join(formalRoot, 'plan', 'shot-manifest.json'), shotManifest)
      : null,
  };
  for (const [key, role, filePath] of [
    ['narrationLock', 'narration-lock', path.join(formalRoot, 'NarrationLock.json')],
    ['alignment', 'alignment', path.join(formalRoot, 'audio', 'alignment.json')],
  ]) {
    const value = await readOptionalJson(filePath);
    inputs[key] = value ? await receiptFor(workspaceRoot, role, filePath, value) : null;
  }
  return {
    mode: 'formal-project-import',
    formalProjectPath: workspaceRelativePath(workspaceRoot, formalRoot),
    inputs,
  };
};

export const importFormalPlanningBundle = async ({formalRoot, workspaceRoot, projectId, workbenchRevision}) => {
  const storyboardPath = path.join(formalRoot, 'plan', 'storyboard.json');
  const storyboard = await readOptionalJson(storyboardPath);
  if (!storyboard) return null;
  assertFormalStoryboard(storyboard, projectId);
  const sceneIds = new Set(storyboard.scenes.map((scene) => scene.id));
  const graphIr = await readOptionalJson(path.join(formalRoot, 'plan', 'graph-ir.json'));
  const shotManifest = await readOptionalJson(path.join(formalRoot, 'plan', 'shot-manifest.json'));
  const alignment = await readOptionalJson(path.join(formalRoot, 'audio', 'alignment.json'));
  if (!graphIr || !shotManifest) return null;
  assertGraphIr(graphIr, projectId, sceneIds);
  assertShotManifest(shotManifest, projectId, sceneIds);
  assertShotManifestMatchesAlignment(shotManifest, alignment);
  const bundle = {
    schemaVersion: 'autovideo-planning-bundle/v1',
    projectId,
    workbenchRevision,
    provenance: await buildFormalProvenance({formalRoot, workspaceRoot, storyboard, graphIr, shotManifest}),
    planningDigestSha256: planningDigestSha256({storyboard, graphIr, shotManifest}),
    storyboard,
    graphIr,
    shotManifest,
  };
  return assertPlanningBundle(bundle, projectId);
};

const cueIdsFromAnchors = (startAnchor, endAnchor) => [...new Set([startAnchor, endAnchor]
  .filter((value) => typeof value === 'string' && /^cue-[A-Za-z0-9._-]+$/i.test(value)))];

export const planningBundleFromLegacyBeats = ({projectId, workbenchRevision, legacyStoryboard, provenance}) => {
  if (!['autovideo-storyboard-beats/v1', 'autovideo-storyboard/v1'].includes(legacyStoryboard?.schemaVersion)
    || !Array.isArray(legacyStoryboard.beats) || !legacyStoryboard.beats.length) {
    throw new Error('Legacy storyboard must contain a non-empty beats array.');
  }
  const scenes = legacyStoryboard.beats.map((beat, index) => {
    if (!beat?.id) throw new Error(`Legacy beat ${index} is missing id.`);
    const cueIds = cueIdsFromAnchors(beat.startAnchor, beat.endAnchor);
    return {
      id: beat.id,
      order: index + 1,
      title: beat.screenText || beat.id,
      role: beat.visualType || 'host_explain',
      cueIds,
      anchorRange: {start: beat.startAnchor, end: beat.endAnchor},
      status: 'draft',
      screenText: [{
        id: `${beat.id}-text-01`,
        text: beat.screenText,
        type: beat.screenTextKind === 'exact_excerpt' ? 'exact-source' : 'generated-summary',
        sourceCueIds: cueIds,
        claimIds: beat.claimIds ?? [],
      }],
      nodes: structuredClone(beat.nodes ?? []),
      edges: structuredClone(beat.edges ?? []),
    };
  });
  const storyboard = {
    schemaVersion: 'autovideo-storyboard/v1',
    projectId,
    status: 'draft',
    scenes,
  };
  const graphIr = {
    schemaVersion: 'autovideo-graph-ir/v1',
    projectId,
    purpose: 'Deterministic compatibility conversion from workbench beat nodes and edges.',
    globalPolicy: {},
    graphs: scenes.filter((scene) => scene.nodes.length).map((scene) => ({
      id: `graph-${scene.id}`,
      sceneId: scene.id,
      kind: 'diagram',
      sourceCueIds: scene.cueIds,
      nodes: scene.nodes.map((node) => ({...node, textType: 'generated-summary'})),
      edges: scene.edges.map((edge) => ({...edge, relation: edge.label ?? 'related-to'})),
      states: [],
      terminalStateId: null,
      motionRules: [],
    })),
  };
  const bundle = {
    schemaVersion: 'autovideo-planning-bundle/v1',
    projectId,
    workbenchRevision,
    provenance,
    planningDigestSha256: planningDigestSha256({storyboard, graphIr, shotManifest: null}),
    storyboard,
    graphIr,
    shotManifest: null,
  };
  return assertPlanningBundle(bundle, projectId);
};

export const coercePlanningBundle = ({value, projectId, workbenchRevision, provenance}) => {
  if (value?.schemaVersion === 'autovideo-planning-bundle/v1') {
    const bundle = assertPlanningBundle(value, projectId);
    if (bundle.workbenchRevision !== workbenchRevision) {
      throw new Error(`Planning bundle revision ${bundle.workbenchRevision} does not match active workbench revision ${workbenchRevision}.`);
    }
    return bundle;
  }
  if (Array.isArray(value?.beats)) {
    return planningBundleFromLegacyBeats({projectId, workbenchRevision, legacyStoryboard: value, provenance});
  }
  if (value?.schemaVersion === 'autovideo-storyboard/v1' && Array.isArray(value.scenes)) {
    const bundle = {
      schemaVersion: 'autovideo-planning-bundle/v1',
      projectId,
      workbenchRevision,
      provenance,
      planningDigestSha256: planningDigestSha256({storyboard: value, graphIr: null, shotManifest: null}),
      storyboard: value,
      graphIr: null,
      shotManifest: null,
    };
    return assertPlanningBundle(bundle, projectId);
  }
  throw new Error('Unsupported planning artifact: expected a planning bundle, formal scenes, or legacy beats.');
};

export const diagramGraphsFromPlanningBundle = (bundle) => {
  assertPlanningBundle(bundle, bundle.projectId);
  if (bundle.graphIr?.graphs?.length) {
    return bundle.graphIr.graphs.map((graph) => ({
      id: graph.id,
      source: 'graph-ir',
      nodes: (graph.nodes ?? []).map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind ?? node.textType ?? 'node',
      })),
      edges: (graph.edges ?? []).map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label ?? edge.relation ?? '',
      })),
    }));
  }
  return bundle.storyboard.scenes.filter((scene) => scene.nodes?.length).map((scene) => ({
    id: scene.id,
    source: 'storyboard-scenes',
    nodes: scene.nodes.map((node) => ({id: node.id, label: node.label, kind: node.kind ?? 'node'})),
    edges: (scene.edges ?? []).map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label ?? edge.relation ?? '',
    })),
  }));
};
