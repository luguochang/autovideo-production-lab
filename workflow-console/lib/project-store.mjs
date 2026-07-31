import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {JSONFilePreset} from 'lowdb/node';
import PQueue from 'p-queue';
import {z} from 'zod';
import {toolRegistry, workflowStages} from '../workflow-catalog.mjs';
import {assertPlanningBundle, refreshPlanningBundleRevision} from './planning-compat.mjs';
import {materializePlanningBundle} from './deterministic-planning.mjs';
import {assertGraphLayout} from '../../tools/planning-contract/graph-layout-contract.mjs';
import {applyGraphLayoutPositions, graphLayoutPositionInputSchema} from './graph-layout-editor.mjs';
import {humanReviewStageIds, inspectFormalProjectForAdoption} from './formal-project-adoption.mjs';
import {assertPublicationRightsCurrent} from './rights-clearance.mjs';
import {
  CREATOR_DELEGATED_REVIEWER,
  INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
} from './creator-delegation.mjs';

const consoleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workspaceRoot = path.resolve(consoleRoot, '..');
export const dataRoot = process.env.AUTOVIDEO_CONSOLE_DATA_ROOT
  ? path.resolve(process.env.AUTOVIDEO_CONSOLE_DATA_ROOT)
  : path.join(consoleRoot, 'data');
if (dataRoot !== consoleRoot && !dataRoot.toLowerCase().startsWith(`${consoleRoot.toLowerCase()}${path.sep}`)) {
  throw new Error('AUTOVIDEO_CONSOLE_DATA_ROOT must stay inside workflow-console.');
}
const dbPath = path.join(dataRoot, 'db.json');
const requiredStages = new Set([
  'material-suitability',
  'content-outline',
  'script-draft',
  'content-duration-fit',
  'script-review',
  'content-approval',
  'narration-lock',
  'template-lock',
  'pronunciation-review',
  'voice-final',
  'audio-align',
  'subtitle-qa',
  'subtitle-review',
  'visual-plan',
  'visual-variety-qa',
  'style-probe',
  'rights-clearance',
  'audio-handoff',
  'composition-readiness',
  'qa-review',
  'screen-text-review',
  'final-preview',
  'render-deliver',
  'delivery-qa',
  'package-export',
]);
const storeQueue = new PQueue({concurrency: 1});

await fs.mkdir(dataRoot, {recursive: true});
const db = await JSONFilePreset(dbPath, {projects: {}, jobs: {}});

const projectInputSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(80),
  title: z.string().trim().min(1).max(120),
  route: z.enum(['materials', 'script', 'audio']),
  sourcePath: z.string().trim().min(1).max(500),
  platform: z.string().trim().min(1).max(80),
  targetDuration: z.string().trim().min(1).max(40),
  voiceRoute: z.enum(['preset14', 'original', 'authorized-vc']),
  audience: z.string().trim().max(300).default('AI learners and knowledge-video viewers'),
  targetOutcome: z.string().trim().max(500).default(''),
  automation: z.enum(['critical-gates', 'companion']).default('critical-gates'),
  publicationRights: z.enum(['needs-review', 'cleared', 'internal-only']).default('needs-review'),
  rightsNotes: z.string().trim().max(1500).default(''),
});

const projectPatchSchema = projectInputSchema.omit({id: true}).partial();
const stagePatchSchema = z.object({
  titleOverride: z.string().trim().max(100).nullable().optional(),
  descriptionOverride: z.string().trim().max(600).nullable().optional(),
  notes: z.string().max(6000).optional(),
  promptOverride: z.string().max(20000).optional(),
  toolId: z.string().min(1).max(100).optional(),
  mode: z.enum(['automation', 'companion']).optional(),
  enabled: z.boolean().optional(),
  position: z.object({x: z.number(), y: z.number()}).optional(),
});

const customStageSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(600).default(''),
  afterStageId: z.string().min(1),
  toolId: z.string().trim().min(1).max(100).default('codex-cli'),
  humanGate: z.boolean().default(false),
});

const now = () => new Date().toISOString();
const artifactDirFor = (projectId, stageId) => path.join(dataRoot, 'projects', projectId, 'artifacts', stageId);
const groupOrder = ['content', 'audio', 'visual', 'video', 'delivery', 'custom'];

const makeStageState = (stage, index) => ({
  id: stage.id,
  status: 'not-started',
  enabled: true,
  mode: stage.humanGate ? 'companion' : 'automation',
  toolId: stage.defaultTool,
  titleOverride: null,
  descriptionOverride: null,
  notes: '',
  promptOverride: '',
  revision: 0,
  generatedAt: null,
  artifactSha256: null,
  approvedArtifactSha256: null,
  formalEvidence: null,
  approvedAt: null,
  approvedBy: null,
  approvalScope: null,
  previewStartedAt: null,
  artifactPath: null,
  artifactKind: null,
  lastError: null,
  overrides: [],
  position: {
    x: Math.max(0, groupOrder.indexOf(stage.group)) * 360,
    y: workflowStages.slice(0, index).filter((item) => item.group === stage.group).length * 180,
  },
  positionEdited: false,
});

const event = (type, detail = {}) => ({id: crypto.randomUUID(), type, at: now(), ...detail});

const definitionFor = (project, stageId) => workflowStages.find((item) => item.id === stageId) ?? project.customStages?.[stageId];

export const mergeCatalogStageOrder = (project) => {
  const catalogIds = workflowStages.map((stage) => stage.id);
  const catalogSet = new Set(catalogIds);
  const customIds = new Set(Object.keys(project.customStages));
  const previousOrder = Array.isArray(project.stageOrder) ? project.stageOrder : [];
  if (!previousOrder.length) return [...catalogIds, ...customIds];

  const customsByAnchor = new Map();
  let anchor = null;
  for (const stageId of previousOrder) {
    if (catalogSet.has(stageId)) {
      anchor = stageId;
    } else if (customIds.has(stageId)) {
      const anchored = customsByAnchor.get(anchor) ?? [];
      anchored.push(stageId);
      customsByAnchor.set(anchor, anchored);
    }
  }

  const merged = [...(customsByAnchor.get(null) ?? [])];
  for (const stageId of catalogIds) {
    merged.push(stageId, ...(customsByAnchor.get(stageId) ?? []));
  }
  for (const customId of customIds) {
    if (!merged.includes(customId)) merged.push(customId);
  }
  return merged;
};

function markDownstreamStale(project, stageId, reason) {
  const index = project.stageOrder.indexOf(stageId);
  if (index < 0) return;
  for (const downstreamId of project.stageOrder.slice(index + 1)) {
    const downstream = project.stages[downstreamId];
    if (!downstream || downstream.status === 'not-started') continue;
    downstream.status = 'stale';
    downstream.lastError = reason;
    downstream.approvedAt = null;
    downstream.approvedBy = null;
    downstream.approvalScope = null;
    downstream.approvedArtifactSha256 = null;
    downstream.previewStartedAt = null;
  }
}

const invalidateFrom = (project, stageId, reason, {includeStage = true} = {}) => {
  const stage = project.stages[stageId];
  if (includeStage && stage && stage.status !== 'not-started') {
    stage.status = 'stale';
    stage.approvedAt = null;
    stage.approvedBy = null;
    stage.approvalScope = null;
    stage.approvedArtifactSha256 = null;
    stage.previewStartedAt = null;
    stage.lastError = reason;
  }
  markDownstreamStale(project, stageId, reason);
};

const ensureProjectShape = (project) => {
  if (!project) return null;
  project.customStages ??= {};
  project.stages ??= {};
  project.events ??= [];
  project.stageOrder = mergeCatalogStageOrder(project);
  const addedRequiredPronunciationGate = !project.stages['pronunciation-review'];
  const addedContentPromptGate = project.route === 'materials'
    && (!project.stages['content-outline'] || !project.stages['script-draft'] || !project.stages['content-duration-fit']);
  workflowStages.forEach((stage, index) => {
    project.stages[stage.id] ??= makeStageState(stage, index);
    project.stages[stage.id].positionEdited ??= false;
    project.stages[stage.id].previewStartedAt ??= null;
    project.stages[stage.id].artifactSha256 ??= null;
    project.stages[stage.id].approvedArtifactSha256 ??= null;
    project.stages[stage.id].formalEvidence ??= null;
    if (project.stages[stage.id].approvedBy == null && project.stages[stage.id].status === 'approved') {
      project.stages[stage.id].approvedBy = project.events.find((entry) => entry.type === 'stage-approved' && entry.stageId === stage.id)?.reviewer
        ?? (project.stages[stage.id].approvalScope === 'machine' ? 'automation' : null);
    }
    if (project.stages[stage.id].approvalScope == null) {
      project.stages[stage.id].approvalScope = stage.id === 'voice-final'
        && project.stages[stage.id].status === 'approved'
        ? 'technical-only'
        : null;
    }
    if (project.stages[stage.id].approvedBy === 'codex-autonomous-internal-review'
      && project.stages[stage.id].approvalScope === 'human-review') {
      project.stages[stage.id].approvalScope = 'internal-autonomous-review';
    }
  });
  if (addedRequiredPronunciationGate && project.stages['voice-final']?.status !== 'not-started') {
    invalidateFrom(project, 'voice-final', 'The required pronunciation v2 review gate was added; reconcile pronunciation before reusing the existing final voice.');
  }
  if (addedContentPromptGate && project.stages['spoken-rewrite']?.status !== 'not-started') {
    invalidateFrom(project, 'content-outline', 'The required Outline, Writer, and Duration contracts were added; regenerate the material-route content chain before reusing this spoken rewrite.');
  }
  project.schemaVersion ??= 'autovideo-workbench/v1';
  project.publicationRights ??= 'needs-review';
  project.rightsNotes ??= '';
  project.contentIntake ??= null;
  return project;
};

const write = async (fn, {beforePersist = null, afterPersist = null, rollbackPersist = null} = {}) => storeQueue.add(async () => {
  await db.read();
  const previousData = structuredClone(db.data);
  let persistenceStarted = false;
  try {
    const value = structuredClone(await fn(db.data));
    await beforePersist?.();
    persistenceStarted = true;
    await db.write();
    await afterPersist?.();
    return value;
  } catch (error) {
    db.data = previousData;
    if (persistenceStarted) {
      try {
        await db.write();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Workbench database transaction failed and db.json could not be restored.',
        );
      }
    }
    try {
      await rollbackPersist?.();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Workbench transaction failed and its filesystem side effect could not be restored.',
      );
    }
    throw error;
  }
});

const read = async (fn) => storeQueue.add(async () => {
  await db.read();
  return structuredClone(await fn(db.data));
});

export const listProjects = () => read((data) => Object.values(data.projects)
  .map(ensureProjectShape)
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  .map(({events, ...project}) => ({...project, eventCount: events.length})));

export const createProject = async (input) => {
  const parsed = projectInputSchema.parse(input);
  return write(async (data) => {
    if (data.projects[parsed.id]) throw new Error(`Project already exists: ${parsed.id}`);
    const createdAt = now();
    const stages = Object.fromEntries(workflowStages.map((stage, index) => [stage.id, makeStageState(stage, index)]));
    const project = {
      schemaVersion: 'autovideo-workbench/v1',
      ...parsed,
      ratio: '16:9',
      resolution: '1920x1080',
      fps: 30,
      createdAt,
      updatedAt: createdAt,
      formalProjectPath: null,
      stageOrder: workflowStages.map((stage) => stage.id),
      customStages: {},
      stages,
      events: [event('project-created', {message: 'Created workbench project.'})],
    };
    data.projects[parsed.id] = project;
    await fs.mkdir(path.join(dataRoot, 'projects', parsed.id), {recursive: true});
    return project;
  });
};

export const inspectFormalProjectForWorkbench = ({formalProjectPath}) => inspectFormalProjectForAdoption({
  workspaceRoot,
  formalProjectPath,
});

export const adoptFormalProject = async ({formalProjectPath}) => {
  const adoption = await inspectFormalProjectForWorkbench({formalProjectPath});
  return write(async (data) => {
    if (data.projects[adoption.projectId]) throw new Error(`Project already exists: ${adoption.projectId}`);
    const createdAt = now();
    const stages = Object.fromEntries(workflowStages.map((stage, index) => [stage.id, makeStageState(stage, index)]));
    const importedArtifact = (stageId) => adoption.artifacts[stageId] ?? null;
    const applyArtifact = (stageId, status, message) => {
      const artifact = importedArtifact(stageId);
      if (!artifact) return;
      const stage = stages[stageId];
      stage.status = status;
      stage.revision = 1;
      stage.generatedAt = adoption.inspectedAt;
      stage.artifactPath = artifact.artifactPath;
      stage.artifactKind = artifact.artifactKind;
      stage.artifactSha256 = artifact.sha256;
      stage.formalEvidence = {
        path: artifact.artifactPath,
        sha256: artifact.sha256,
        verifiedAt: adoption.inspectedAt,
        disposition: 'evidence-only',
      };
      stage.lastResult = message;
      if (status === 'approved') {
        stage.approvedAt = adoption.inspectedAt;
        stage.approvedBy = 'formal-project-import';
        stage.approvalScope = 'machine';
        stage.approvedArtifactSha256 = artifact.sha256;
      }
      if (status === 'stale') {
        stage.lastError = 'Formal artifact is preserved, but downstream production is blocked until imported human gates are reconciled.';
      }
    };

    // A readable input is a machine-verifiable starting point. Every claimed human gate is evidence-only.
    applyArtifact('source-register', 'approved', 'Verified immutable narration input from formal project.');
    for (const stageId of humanReviewStageIds) {
      applyArtifact(stageId, 'needs-review', 'Imported formal evidence requires a fresh workbench human review.');
    }
    const firstUnverifiedGate = 'script-review';
    for (const stage of workflowStages) {
      if (stage.id === 'source-register' || humanReviewStageIds.has(stage.id)) continue;
      const artifact = importedArtifact(stage.id);
      if (artifact) applyArtifact(stage.id, 'stale', `Imported formal artifact is held after unverified ${firstUnverifiedGate}.`);
    }
    if (adoption.planningBundle) {
      const artifactPath = await saveArtifact(adoption.projectId, 'visual-plan', 'planning-bundle.imported.json', adoption.planningBundle, 'json');
      stages['visual-plan'].status = 'stale';
      stages['visual-plan'].revision = 1;
      stages['visual-plan'].generatedAt = adoption.inspectedAt;
      stages['visual-plan'].artifactPath = artifactPath;
      stages['visual-plan'].artifactKind = 'json';
      stages['visual-plan'].artifactSha256 = await artifactShaOrNull(artifactPath);
      stages['visual-plan'].formalEvidence = {
        sha256: adoption.formalEvidence.planningBundle.bundleSha256
          ?? adoption.formalEvidence.planningBundle.planningDigestSha256,
        semanticSha256: adoption.formalEvidence.planningBundle.planningDigestSha256,
        provenanceSha256: adoption.formalEvidence.planningBundle.provenanceSha256,
        verifiedAt: adoption.inspectedAt,
        disposition: 'evidence-only',
      };
      stages['visual-plan'].lastResult = 'Imported canonical planning bundle; requires upstream workbench reconciliation.';
      stages['visual-plan'].lastError = 'Formal planning is preserved but cannot be used for production until imported human gates are reconciled.';
    }

    const receiptPath = path.join(dataRoot, 'projects', adoption.projectId, 'formal-project-adoption.json');
    await fs.mkdir(path.dirname(receiptPath), {recursive: true});
    await fs.writeFile(receiptPath, `${JSON.stringify({...adoption, planningBundle: adoption.planningBundle ? {
      schemaVersion: adoption.planningBundle.schemaVersion,
      planningDigestSha256: adoption.planningBundle.planningDigestSha256,
    } : null}, null, 2)}\n`, 'utf8');
    const project = {
      schemaVersion: 'autovideo-workbench/v1',
      ...adoption.workbenchInput,
      createdAt,
      updatedAt: createdAt,
      formalProjectPath: adoption.formalProjectPath,
      ratio: adoption.workbenchInput.ratio,
      resolution: adoption.workbenchInput.resolution,
      fps: adoption.workbenchInput.fps,
      importReceiptPath: path.relative(workspaceRoot, receiptPath).replaceAll('\\', '/'),
      stageOrder: workflowStages.map((stage) => stage.id),
      customStages: {},
      stages,
      events: [event('formal-project-adopted', {
        message: `Imported formal project evidence from ${adoption.formalProjectPath}; human approvals and publication clearance were intentionally not inherited.`,
        formalProjectPath: adoption.formalProjectPath,
      })],
    };
    data.projects[project.id] = project;
    return project;
  });
};

const readFormalEvidenceReceipt = async (project) => {
  const candidates = [project.formalProjectRefreshReceiptPath, project.importReceiptPath].filter(Boolean);
  for (const receiptPath of candidates) {
    try {
      return JSON.parse(await fs.readFile(resolveWorkspacePath(receiptPath), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw new Error(`Formal evidence receipt is invalid: ${error.message}`);
    }
  }
  return null;
};

const artifactShaOrNull = async (artifactPath) => {
  if (!artifactPath) return null;
  try {
    return await sha256File(resolveWorkspacePath(artifactPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

export const refreshFormalProjectEvidence = async (projectId) => {
  const snapshot = await getProject(projectId);
  if (!snapshot.formalProjectPath) throw new Error('Only an adopted formal project can refresh formal evidence.');
  if (Object.values(snapshot.stages).some((stage) => stage.status === 'running')) {
    throw new Error('Wait for running stage jobs to finish before refreshing formal evidence.');
  }

  const adoption = await inspectFormalProjectForWorkbench({formalProjectPath: snapshot.formalProjectPath});
  if (adoption.projectId !== projectId || adoption.formalProjectPath !== snapshot.formalProjectPath) {
    throw new Error('Formal evidence refresh does not match the adopted project identity.');
  }

  const previousReceipt = await readFormalEvidenceReceipt(snapshot);
  const previousArtifacts = previousReceipt?.artifacts ?? {};
  const previousPlanningEvidence = previousReceipt?.formalEvidence?.planningBundle ?? null;
  const currentPlanningEvidence = adoption.formalEvidence.planningBundle ?? null;
  const previousPlanningFingerprint = previousPlanningEvidence?.bundleSha256
    ?? previousPlanningEvidence?.planningDigestSha256
    ?? null;
  const currentPlanningFingerprint = currentPlanningEvidence?.bundleSha256
    ?? currentPlanningEvidence?.planningDigestSha256
    ?? null;
  const currentArtifactShas = Object.fromEntries(await Promise.all(
    Object.entries(snapshot.stages).map(async ([stageId, stage]) => [stageId, await artifactShaOrNull(stage.artifactPath)]),
  ));

  let refreshedPlanningArtifactPath = null;
  let refreshedPlanningArtifactSha256 = null;
  const planningChanged = previousPlanningFingerprint !== currentPlanningFingerprint;
  const planningStageSnapshot = snapshot.stages['visual-plan'];
  const planningHasLocalEdits = Boolean(planningStageSnapshot?.overrides?.length)
    || (planningStageSnapshot?.revision > 1
      && !/^Imported canonical planning bundle|^Refreshed canonical planning bundle/.test(planningStageSnapshot?.lastResult ?? ''));
  if (planningChanged && adoption.planningBundle && !planningHasLocalEdits) {
    refreshedPlanningArtifactPath = await saveArtifact(
      projectId,
      'visual-plan',
      'planning-bundle.refreshed.json',
      adoption.planningBundle,
      'json',
    );
    refreshedPlanningArtifactSha256 = await artifactShaOrNull(refreshedPlanningArtifactPath);
  }

  return write(async (data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    if (project.updatedAt !== snapshot.updatedAt) {
      throw new Error('Project changed while formal evidence was being inspected. Refresh again.');
    }

    const summary = {
      imported: [],
      changed: [],
      unchanged: [],
      removed: [],
      preservedLocalEdits: [],
    };
    const changedStageIds = new Set();
    const approvedContentBinding = {value: null};
    const clearApproval = (stage) => {
      stage.approvedAt = null;
      stage.approvedBy = null;
      stage.approvalScope = null;
      stage.approvedArtifactSha256 = null;
      stage.previewStartedAt = null;
    };
    const markChanged = (stageId, kind) => {
      changedStageIds.add(stageId);
      summary[kind].push(stageId);
    };

    for (const [stageId, artifact] of Object.entries(adoption.artifacts)) {
      const stage = project.stages[stageId];
      if (!stage) continue;
      const currentSha = currentArtifactShas[stageId];
      const hadPreviousEvidence = Boolean(previousArtifacts[stageId]);
      const localEdit = Boolean(stage.overrides?.length)
        && stage.artifactPath !== previousArtifacts[stageId]?.artifactPath;
      const hasPreviousFormalEvidence = Boolean(previousArtifacts[stageId]?.sha256);
      const formalEvidenceUnchanged = hasPreviousFormalEvidence
        && previousArtifacts[stageId].sha256 === artifact.sha256;
      if (formalEvidenceUnchanged && (currentSha === artifact.sha256 || localEdit)) {
        stage.formalEvidence = {
          path: artifact.artifactPath,
          sha256: artifact.sha256,
          verifiedAt: adoption.inspectedAt,
          disposition: localEdit ? 'preserved-local-artifact' : 'active',
        };
        summary.unchanged.push(stageId);
        continue;
      }

      const approvalMatchesIncoming = stage.status === 'approved'
        && currentSha === artifact.sha256
        && stage.approvedArtifactSha256 === artifact.sha256;
      stage.revision += 1;
      stage.generatedAt = adoption.inspectedAt;
      stage.formalEvidence = {
        path: artifact.artifactPath,
        sha256: artifact.sha256,
        verifiedAt: adoption.inspectedAt,
        disposition: localEdit ? 'conflict-preserved-local-artifact' : 'evidence-only',
      };
      if (localEdit && !approvalMatchesIncoming) {
        clearApproval(stage);
        stage.status = 'stale';
        stage.lastError = `Formal evidence for ${stageId} changed; the local edit was preserved and must be reconciled.`;
        stage.lastResult = 'Preserved the workbench artifact instead of overwriting a local edit.';
        markChanged(stageId, 'preservedLocalEdits');
        continue;
      }

      stage.artifactPath = artifact.artifactPath;
      stage.artifactKind = artifact.artifactKind;
      stage.artifactSha256 = artifact.sha256;
      if (approvalMatchesIncoming) {
        stage.formalEvidence.disposition = 'active-approved-binding';
        stage.lastError = null;
        stage.lastResult = `Formal evidence changed, but the active approval already binds ${artifact.sha256.slice(0, 12)}.`;
        if (stageId === 'content-approval' && adoption.formalEvidence.contentApproval?.valid === true) {
          approvedContentBinding.value = {
            approvedAt: stage.approvedAt,
            approvedBy: stage.approvedBy,
            approvalScope: stage.approvalScope,
            artifactSha256: artifact.sha256,
          };
        }
      } else {
        clearApproval(stage);
        stage.status = 'stale';
        stage.lastError = `Refreshed formal evidence for ${stageId} is evidence-only until the workbench stage is reconciled.`;
        stage.lastResult = `Refreshed hash-bound formal evidence (${artifact.sha256.slice(0, 12)}); no approval was inherited.`;
      }
      markChanged(stageId, hadPreviousEvidence ? 'changed' : 'imported');
    }

    for (const [stageId, previousArtifact] of Object.entries(previousArtifacts)) {
      if (adoption.artifacts[stageId]) continue;
      const stage = project.stages[stageId];
      if (!stage) continue;
      const localEdit = Boolean(stage.overrides?.length)
        || (stage.artifactPath && stage.artifactPath !== previousArtifact.artifactPath);
      stage.revision += 1;
      clearApproval(stage);
      stage.status = 'stale';
      stage.formalEvidence = {
        path: previousArtifact.artifactPath,
        sha256: previousArtifact.sha256,
        verifiedAt: adoption.inspectedAt,
        disposition: 'missing',
      };
      stage.lastError = `Previously imported formal evidence for ${stageId} is no longer present.`;
      if (localEdit) {
        stage.lastResult = 'The local workbench artifact was preserved after formal evidence disappeared.';
        markChanged(stageId, 'preservedLocalEdits');
      } else {
        stage.artifactPath = null;
        stage.artifactKind = null;
        stage.artifactSha256 = null;
        stage.lastResult = 'The removed formal artifact is no longer available in the workbench.';
        markChanged(stageId, 'removed');
      }
    }

    if (planningChanged) {
      const stage = project.stages['visual-plan'];
      stage.revision += 1;
      stage.generatedAt = adoption.inspectedAt;
      stage.status = 'stale';
      clearApproval(stage);
      stage.formalEvidence = currentPlanningEvidence
        ? {
          sha256: currentPlanningFingerprint,
          semanticSha256: currentPlanningEvidence.planningDigestSha256,
          provenanceSha256: currentPlanningEvidence.provenanceSha256,
          verifiedAt: adoption.inspectedAt,
          disposition: planningHasLocalEdits ? 'conflict-preserved-local-artifact' : 'evidence-only',
        }
        : {
          sha256: previousPlanningFingerprint,
          verifiedAt: adoption.inspectedAt,
          disposition: 'missing',
        };
      if (planningHasLocalEdits || !adoption.planningBundle) {
        stage.lastError = adoption.planningBundle
          ? 'Formal planning changed; the local planning artifact was preserved and must be reconciled.'
          : 'Previously imported formal planning is now missing or incomplete; the last workbench artifact was preserved for audit.';
        stage.lastResult = adoption.planningBundle
          ? 'Preserved the local planning bundle instead of replacing it.'
          : 'Formal planning evidence is unavailable; no local artifact was deleted.';
        markChanged('visual-plan', adoption.planningBundle ? 'preservedLocalEdits' : 'removed');
      } else {
        stage.artifactPath = refreshedPlanningArtifactPath;
        stage.artifactKind = 'json';
        stage.artifactSha256 = refreshedPlanningArtifactSha256;
        stage.lastError = 'Refreshed formal planning is evidence-only until upstream workbench gates are reconciled.';
        stage.lastResult = `Refreshed canonical planning bundle ${currentPlanningEvidence.planningDigestSha256.slice(0, 12)}.`;
        markChanged('visual-plan', previousPlanningFingerprint ? 'changed' : 'imported');
      }
    }

    const earliestChangedStage = project.stageOrder.find((stageId) => changedStageIds.has(stageId));
    if (earliestChangedStage) {
      markDownstreamStale(project, earliestChangedStage, `Formal project evidence changed at ${earliestChangedStage}.`);
    }
    if (approvedContentBinding.value) {
      const stage = project.stages['content-approval'];
      stage.status = 'approved';
      stage.approvedAt = approvedContentBinding.value.approvedAt;
      stage.approvedBy = approvedContentBinding.value.approvedBy;
      stage.approvalScope = approvedContentBinding.value.approvalScope;
      stage.approvedArtifactSha256 = approvedContentBinding.value.artifactSha256;
      stage.lastError = null;
      stage.lastResult = 'Preserved the current human approval after validating every formal content-chain and source binding.';
    }

    const receiptPath = path.join(dataRoot, 'projects', projectId, 'formal-project-refresh.json');
    const receipt = {
      schemaVersion: 'autovideo-formal-project-refresh/v1',
      projectId,
      formalProjectPath: adoption.formalProjectPath,
      refreshedAt: adoption.inspectedAt,
      projectState: adoption.projectState,
      artifacts: adoption.artifacts,
      formalEvidence: adoption.formalEvidence,
      summary,
      impact: {
        earliestChangedStage: earliestChangedStage ?? null,
      },
      humanReviewPolicy: adoption.humanReviewPolicy,
    };
    await fs.mkdir(path.dirname(receiptPath), {recursive: true});
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    project.formalProjectRefreshReceiptPath = path.relative(workspaceRoot, receiptPath).replaceAll('\\', '/');
    project.formalProjectRefreshedAt = adoption.inspectedAt;
    project.updatedAt = now();
    project.events.unshift(event('formal-project-evidence-refreshed', {
      changedStageIds: [...changedStageIds],
      summary,
      message: changedStageIds.size
        ? `Refreshed formal evidence for ${changedStageIds.size} stage(s); human approvals were not synthesized.`
        : 'Formal evidence is already current; no workbench stage changed.',
    }));
    project.events = project.events.slice(0, 250);
    return {project, refresh: receipt};
  });
};

export const getProject = (projectId) => read((data) => {
  const project = data.projects[projectId];
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return ensureProjectShape(project);
});

export const updateProject = (projectId, patch) => {
  const parsed = projectPatchSchema.parse(patch);
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const changed = Object.keys(parsed).filter((key) => parsed[key] !== project[key]);
    Object.assign(project, parsed, {updatedAt: now()});
    if (changed.some((key) => ['route', 'sourcePath'].includes(key))) {
      invalidateFrom(project, 'source-register', 'Input route or source changed.');
    } else if (changed.some((key) => ['title', 'audience', 'targetOutcome', 'targetDuration'].includes(key))) {
      const firstContentStage = project.route === 'materials' ? 'evidence-ledger' : 'script-review';
      invalidateFrom(project, firstContentStage, 'Content brief or duration changed.');
    }
    if (changed.includes('platform')) invalidateFrom(project, 'narration-lock', 'Delivery platform changed.');
    if (changed.includes('voiceRoute')) {
      invalidateFrom(project, project.voiceRoute === 'preset14' ? 'pronunciation-review' : 'voice-final', 'Voice route changed.');
    }
    if (changed.some((key) => ['publicationRights', 'rightsNotes'].includes(key))) {
      invalidateFrom(project, 'rights-clearance', 'Publication rights declaration changed.');
    }
    project.events.unshift(event('project-updated', {changed, message: 'Updated project settings and dependency state.'}));
    project.events = project.events.slice(0, 250);
    return project;
  });
};

export const recordContentIntake = (projectId, receipt) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  if (receipt?.projectId !== projectId || !receipt?.registration?.workbenchInput) {
    throw new Error('Content intake receipt does not match the workbench project.');
  }
  const previousSourcePath = project.sourcePath;
  project.route = receipt.registration.workbenchInput.route;
  project.sourcePath = receipt.registration.workbenchInput.sourcePath;
  project.contentIntake = {
    id: receipt.id,
    schemaVersion: receipt.schemaVersion,
    inputType: receipt.inputType,
    route: receipt.route,
    createdAt: receipt.createdAt,
    payload: {
      path: receipt.payload.path,
      sha256: receipt.payload.sha256,
      bytes: receipt.payload.bytes,
      fileCount: receipt.payload.fileCount,
    },
    pipelineIntakePath: receipt.registration.pipelineIntakePath,
  };
  if (previousSourcePath !== project.sourcePath) {
    invalidateFrom(project, 'source-register', 'A new immutable content intake was registered.');
  }
  project.updatedAt = now();
  project.events.unshift(event('content-intake-recorded', {
    stageId: 'source-register',
    intakeId: receipt.id,
    message: `Registered immutable ${receipt.inputType} input (${receipt.payload.fileCount} file(s)).`,
  }));
  project.events = project.events.slice(0, 250);
  return project;
});

export const updateStage = (projectId, stageId, patch) => {
  const parsed = stagePatchSchema.parse(patch);
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const stage = project.stages[stageId];
    if (!stage) throw new Error(`Unknown stage: ${stageId}`);
    const catalogStage = workflowStages.find((item) => item.id === stageId);
    if (parsed.enabled === false && requiredStages.has(stageId)) {
      throw new Error(`${catalogStage?.title ?? stageId} is a required gate and cannot be disabled.`);
    }
    if (parsed.toolId && catalogStage && !catalogStage.tools.includes(parsed.toolId)) {
      throw new Error(`Tool ${parsed.toolId} is not registered for ${stageId}.`);
    }
    const executionFields = ['promptOverride', 'toolId', 'mode', 'enabled'];
    const executionChanged = executionFields.some((key) => key in parsed && parsed[key] !== stage[key]);
    Object.assign(stage, parsed);
    if (parsed.position) stage.positionEdited = true;
    if (executionChanged) invalidateFrom(project, stageId, `Execution settings changed in ${stageId}.`);
    project.updatedAt = now();
    project.events.unshift(event('stage-configured', {stageId, message: `Updated ${catalogStage?.title ?? stageId}.`}));
    project.events = project.events.slice(0, 250);
    return project;
  });
};

export const addCustomStage = (projectId, input) => {
  const parsed = customStageSchema.parse(input);
  if (!toolRegistry.some((tool) => tool.id === parsed.toolId)) throw new Error(`Unknown tool: ${parsed.toolId}`);
  if (parsed.toolId !== 'codex-cli') throw new Error('Only the read-only Codex CLI adapter is connected for custom stages.');
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const custom = {
      id,
      group: 'custom',
      title: parsed.title,
      description: parsed.description,
      artifact: `custom/${id}.md`,
      generator: 'codex-stage',
      defaultTool: parsed.toolId,
      tools: [parsed.toolId],
      executableTools: ['codex-cli'],
      humanGate: parsed.humanGate,
      manualApproval: true,
      artifactEditable: true,
      maturity: 'project-custom',
      tutorial: null,
      custom: true,
    };
    const afterIndex = project.stageOrder.indexOf(parsed.afterStageId);
    const insertIndex = afterIndex >= 0 ? afterIndex + 1 : project.stageOrder.length;
    project.stageOrder.splice(insertIndex, 0, id);
    project.customStages[id] = custom;
    project.stages[id] = makeStageState(custom, insertIndex);
    markDownstreamStale(project, id, `Custom stage ${id} was inserted.`);
    project.updatedAt = now();
    project.events.unshift(event('custom-stage-added', {stageId: id, message: `Added ${parsed.title}.`}));
    return project;
  });
};

export const removeCustomStage = (projectId, stageId) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  if (!project.customStages[stageId]) throw new Error('Only custom stages can be removed.');
  if (project.stages[stageId]?.status === 'running') throw new Error('A running custom stage cannot be removed.');
  const index = project.stageOrder.indexOf(stageId);
  delete project.customStages[stageId];
  delete project.stages[stageId];
  project.stageOrder = project.stageOrder.filter((id) => id !== stageId);
  const previousId = project.stageOrder[Math.max(0, index - 1)];
  if (previousId) markDownstreamStale(project, previousId, `Custom stage ${stageId} was removed.`);
  project.updatedAt = now();
  project.events.unshift(event('custom-stage-removed', {stageId, message: `Removed ${stageId}.`}));
  return project;
});

export const saveArtifact = async (projectId, stageId, filename, content, kind = 'text') => {
  const dir = artifactDirFor(projectId, stageId);
  await fs.mkdir(dir, {recursive: true});
  const safeName = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '-');
  const target = path.join(dir, safeName || 'artifact.txt');
  try {
    await fs.access(target);
    const historyDir = path.join(dir, '.history');
    await fs.mkdir(historyDir, {recursive: true});
    const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
    await fs.copyFile(target, path.join(historyDir, `${timestamp}-${path.basename(target)}`));
  } catch {
    // The first revision has no prior artifact to archive.
  }
  await fs.writeFile(target, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  return path.relative(workspaceRoot, target).replaceAll('\\', '/');
};

export const readArtifact = async (projectId, stageId) => {
  const project = await getProject(projectId);
  const stage = project.stages[stageId];
  if (!stage?.artifactPath) return null;
  const target = resolveWorkspacePath(stage.artifactPath);
  const stats = await fs.stat(target);
  if (stats.size > 2_000_000) throw new Error('Artifact is too large for the text editor.');
  return {path: stage.artifactPath, kind: stage.artifactKind, content: await fs.readFile(target, 'utf8')};
};

export const saveManualArtifact = async (projectId, stageId, content, reason = 'manual edit') => {
  const project = await getProject(projectId);
  const stage = project.stages[stageId];
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);
  const catalogStage = definitionFor(project, stageId);
  if (catalogStage?.artifactEditable === false) throw new Error('This artifact is a machine receipt and cannot be edited manually. Regenerate its stage instead.');
  const artifactKind = stage.artifactKind ?? (path.extname(catalogStage?.artifact || '').toLowerCase() === '.json' ? 'json' : 'text');
  let preparedContent = content;
  let parsedPlanningBundle = null;
  let parsedGraphLayout = null;
  if (artifactKind === 'json') {
    try {
      let parsed = JSON.parse(content);
      if (stageId === 'visual-plan' && parsed?.schemaVersion === 'autovideo-planning-bundle/v1') {
        parsed = refreshPlanningBundleRevision(parsed, stage.revision + 1);
        assertPlanningBundle(parsed, projectId);
        parsedPlanningBundle = parsed;
        preparedContent = `${JSON.stringify(parsed, null, 2)}\n`;
      } else if (stageId === 'diagram-assets') {
        parsedGraphLayout = parsed;
        const graphIr = JSON.parse(await fs.readFile(path.join(formalProjectRoot(project), 'plan', 'graph-ir.json'), 'utf8'));
        assertGraphLayout({document: parsedGraphLayout, graphIr, projectId});
        preparedContent = `${JSON.stringify(parsedGraphLayout, null, 2)}\n`;
      }
    } catch (error) {
      throw new Error(`The edited JSON is invalid: ${error.message}`);
    }
  }
  if (stageId === 'visual-plan') {
    if (!parsedPlanningBundle) throw new Error('Visual planning edits must remain a complete canonical planning bundle.');
    if (parsedPlanningBundle.shotManifest && parsedPlanningBundle.graphIr) {
      await materializePlanningBundle({
        formalRoot: formalProjectRoot(project),
        workspaceRoot,
        projectId,
        bundle: parsedPlanningBundle,
      });
    } else if (parsedPlanningBundle.provenance?.mode !== 'workbench-generated') {
      throw new Error('Only a complete planning bundle may be promoted to formal production files.');
    }
  } else if (stageId === 'diagram-assets' && !parsedGraphLayout) {
    throw new Error('Graph layout edits must remain a valid autovideo-graph-layout/v1 document.');
  }
  const filename = path.basename(stage.artifactPath || catalogStage?.artifact || `${stageId}.md`);
  const artifactPath = await saveArtifact(projectId, stageId, filename, preparedContent, artifactKind);
  const artifactSha256 = await artifactShaOrNull(artifactPath);
  return write((data) => {
    const current = ensureProjectShape(data.projects[projectId]);
    const currentStage = current.stages[stageId];
    currentStage.artifactPath = artifactPath;
    currentStage.artifactKind = artifactKind;
    currentStage.artifactSha256 = artifactSha256;
    currentStage.approvedArtifactSha256 = null;
    currentStage.status = 'needs-review';
    currentStage.revision += 1;
    currentStage.generatedAt = now();
    currentStage.approvedAt = null;
    currentStage.approvedBy = null;
    currentStage.approvalScope = null;
    currentStage.previewStartedAt = null;
    currentStage.overrides.push({id: crypto.randomUUID(), at: now(), reason, revision: currentStage.revision});
    markDownstreamStale(current, stageId, `Manual edit in ${stageId}`);
    current.updatedAt = now();
    current.events.unshift(event('artifact-edited', {stageId, message: reason}));
    current.events = current.events.slice(0, 250);
    return current;
  });
};

export const saveGraphLayoutPositions = async (projectId, input) => {
  const parsed = graphLayoutPositionInputSchema.parse(input);
  let artifactTarget = null;
  let previousBytes = null;
  let temporaryPath = null;
  let rollbackPath = null;
  let historyPath = null;
  let filesystemChanged = false;
  return write(async (data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const stage = project.stages['diagram-assets'];
    if (!stage?.artifactPath) throw new Error('Generate the graph layout before opening the visual editor.');
    if (stage.status === 'running') throw new Error('Wait for graph layout generation to finish before editing.');
    if (stage.revision !== parsed.expectedRevision) {
      throw new Error('Graph layout changed after this editor loaded. Reload before saving.');
    }
    artifactTarget = resolveWorkspacePath(stage.artifactPath);
    previousBytes = await fs.readFile(artifactTarget);
    const currentSha256 = createHash('sha256').update(previousBytes).digest('hex');
    if (currentSha256 !== parsed.expectedArtifactSha256 || stage.artifactSha256 !== currentSha256) {
      throw new Error('Graph layout bytes changed after this editor loaded. Reload before saving.');
    }
    const [document, graphIr] = await Promise.all([
      Promise.resolve(JSON.parse(previousBytes.toString('utf8'))),
      fs.readFile(path.join(formalProjectRoot(project), 'plan', 'graph-ir.json'), 'utf8').then(JSON.parse),
    ]);
    const next = applyGraphLayoutPositions({document, graphIr, projectId, input: parsed});
    const nextBytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
    const nextSha256 = createHash('sha256').update(nextBytes).digest('hex');
    const nonce = `${process.pid}-${crypto.randomUUID()}`;
    temporaryPath = `${artifactTarget}.${nonce}.tmp`;
    rollbackPath = `${artifactTarget}.${nonce}.rollback`;
    const historyDir = path.join(path.dirname(artifactTarget), '.history');
    historyPath = path.join(historyDir, `${new Date().toISOString().replace(/[.:]/g, '-')}-${path.basename(artifactTarget)}`);
    await fs.mkdir(historyDir, {recursive: true});
    await fs.writeFile(temporaryPath, nextBytes);

    stage.artifactSha256 = nextSha256;
    stage.approvedArtifactSha256 = null;
    stage.status = 'needs-review';
    stage.revision += 1;
    stage.generatedAt = now();
    stage.approvedAt = null;
    stage.approvedBy = null;
    stage.approvalScope = null;
    stage.previewStartedAt = null;
    stage.lastError = null;
    stage.lastResult = `Adjusted ${parsed.graphId} node positions in the visual Graph IR layout editor.`;
    stage.overrides.push({id: crypto.randomUUID(), at: now(), reason: parsed.reason, revision: stage.revision, graphId: parsed.graphId});
    markDownstreamStale(project, 'diagram-assets', `Graph layout ${parsed.graphId} was manually adjusted.`);
    project.updatedAt = now();
    project.events.unshift(event('graph-layout-edited', {stageId: 'diagram-assets', graphId: parsed.graphId, message: parsed.reason}));
    project.events = project.events.slice(0, 250);
    return project;
  }, {
    beforePersist: async () => {
      await fs.copyFile(artifactTarget, historyPath);
      await fs.rename(artifactTarget, rollbackPath);
      try {
        await fs.rename(temporaryPath, artifactTarget);
        filesystemChanged = true;
      } catch (error) {
        await fs.rename(rollbackPath, artifactTarget).catch(() => undefined);
        throw error;
      }
    },
    afterPersist: async () => {
      await fs.rm(rollbackPath, {force: true});
      rollbackPath = null;
    },
    rollbackPersist: async () => {
      await fs.rm(temporaryPath, {force: true}).catch(() => undefined);
      if (filesystemChanged && rollbackPath) {
        await fs.rm(artifactTarget, {force: true});
        await fs.rename(rollbackPath, artifactTarget);
      }
      if (historyPath) await fs.rm(historyPath, {force: true}).catch(() => undefined);
    },
  });
};

export const markStageRunning = (projectId, stageId, jobId) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  const stage = project.stages[stageId];
  stage.status = 'running';
  stage.lastError = null;
  stage.jobId = jobId;
  stage.previewStartedAt = null;
  project.updatedAt = now();
  project.events.unshift(event('stage-running', {stageId, jobId, message: `Started ${stageId}.`}));
  return project;
});

export const markStageGenerated = (projectId, stageId, result) => write(async (data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  const stage = project.stages[stageId];
  if (!stage) throw new Error(`Stage ${stageId} was removed before its job completed.`);
  const catalogStage = workflowStages.find((item) => item.id === stageId) ?? project.customStages[stageId];
  const preserveInternalApproval = stageId === 'rights-clearance'
    && result.preserveInternalApproval === true
    && project.publicationRights === 'internal-only'
    && Boolean(stage.approvedBy);
  const previousApproval = {
    approvedAt: stage.approvedAt,
    approvedBy: stage.approvedBy,
    approvalScope: stage.approvalScope,
  };
  const artifactPath = result.artifactPath ?? stage.artifactPath;
  const actualArtifactSha256 = await artifactShaOrNull(artifactPath);
  const claimedArtifactSha256 = result.artifactSha256 ? String(result.artifactSha256).toLowerCase() : null;
  if (actualArtifactSha256 && claimedArtifactSha256 && actualArtifactSha256 !== claimedArtifactSha256) {
    throw new Error(`Generated artifact SHA-256 mismatch for ${stageId}.`);
  }
  const artifactSha256 = actualArtifactSha256 ?? claimedArtifactSha256;
  const autoApprovedPronunciation = stageId === 'pronunciation-review'
    && result.autoApprove === true
    && result.approvalScope === 'machine-no-subjective-terms';
  stage.status = preserveInternalApproval || autoApprovedPronunciation ? 'approved' : catalogStage?.humanGate ? 'needs-review' : 'approved';
  stage.revision += 1;
  stage.generatedAt = now();
  stage.approvedAt = preserveInternalApproval ? previousApproval.approvedAt : autoApprovedPronunciation ? now() : catalogStage?.humanGate ? null : now();
  stage.approvedBy = preserveInternalApproval ? previousApproval.approvedBy : autoApprovedPronunciation ? 'automation' : catalogStage?.humanGate ? null : 'automation';
  stage.approvalScope = preserveInternalApproval ? previousApproval.approvalScope : autoApprovedPronunciation ? result.approvalScope : catalogStage?.humanGate ? null : 'machine';
  stage.artifactPath = artifactPath;
  stage.artifactKind = result.artifactKind ?? stage.artifactKind;
  stage.artifactSha256 = artifactSha256;
  stage.approvedArtifactSha256 = stage.status === 'approved' ? artifactSha256 : null;
  stage.lastError = null;
  stage.jobId = null;
  stage.previewStartedAt = null;
  stage.lastResult = result.summary ?? null;
  if (result.formalProjectPath) project.formalProjectPath = result.formalProjectPath;
  if (preserveInternalApproval) {
    for (const downstreamId of ['delivery-qa', 'retrospective']) {
      const downstream = project.stages[downstreamId];
      if (!downstream || downstream.status === 'not-started') continue;
      downstream.status = 'stale';
      downstream.lastError = 'Publication-rights inventory refreshed without widening the approved internal-only scope.';
      downstream.approvedAt = null;
      downstream.approvedBy = null;
      downstream.approvalScope = null;
      downstream.approvedArtifactSha256 = null;
    }
  } else if (!(stageId === 'voice-final' && result.preserveFinalAudio === true)) {
    markDownstreamStale(project, stageId, `Regenerated ${stageId}`);
  }
  project.updatedAt = now();
  project.events.unshift(event('stage-generated', {stageId, message: result.summary ?? `Generated ${stageId}.`}));
  project.events = project.events.slice(0, 250);
  return project;
});

export const markStageFailed = (projectId, stageId, errorMessage) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  const stage = project.stages[stageId];
  if (!stage) return project;
  stage.status = 'failed';
  stage.lastError = errorMessage;
  stage.jobId = null;
  project.updatedAt = now();
  project.events.unshift(event('stage-failed', {stageId, message: errorMessage}));
  project.events = project.events.slice(0, 250);
  return project;
});

export const approveStage = async (projectId, stageId, reviewer = 'user', {approvalScope = null} = {}) => {
  const project = await getProject(projectId);
  const stage = project.stages[stageId];
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);
  const definition = definitionFor(project, stageId);
  if (stage.status === 'stale') throw new Error('This artifact is stale. Regenerate or manually reconcile it before approval.');
  if (stage.status !== 'needs-review') throw new Error('Only review-ready stages can be approved.');
  if (!definition?.humanGate && !definition?.manualApproval) throw new Error('This machine receipt cannot be manually approved. Regenerate the stage.');
  if (stageId === 'voice-final') {
    throw new Error('Voice-final approval must use the dedicated A/B candidate listening and atomic promotion contract.');
  }
  if (stageId === 'voice-final' && !['technical-only', 'human-listening'].includes(approvalScope)) {
    throw new Error('Voice approval must declare technical-only or human-listening scope.');
  }
  if (stageId === 'script-review') {
    const artifact = await readArtifact(projectId, stageId);
    if (!artifact?.content.trim()) throw new Error('Approved narration is empty.');
    const target = path.join(workspaceRoot, 'content', `${projectId}-narration.approved.txt`);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, artifact.content, 'utf8');
  }
  if (stageId === 'rights-clearance') {
    if (!['cleared', 'internal-only'].includes(project.publicationRights)) {
      throw new Error('Publication rights must be marked cleared or explicitly internal-only before this gate can be approved.');
    }
    const artifact = await readArtifact(projectId, stageId);
    const rights = JSON.parse(artifact?.content || '{}');
    await assertPublicationRightsCurrent({
      formalRoot: formalProjectRoot(project),
      workspaceRoot,
      projectId,
      declaration: project.publicationRights,
      record: rights,
    });
  }
  let approvalArtifact = null;
  if (stageId === 'final-preview') {
    if (!stage.previewStartedAt) throw new Error('Start HyperFrames Studio and review the full timeline before approval.');
    const formalRoot = formalProjectRoot(project);
    const composition = await findCompositionRoot(formalRoot);
    const manifest = await hashDirectoryManifest(composition);
    const receipt = {
      schemaVersion: 'autovideo-final-preview/v2',
      projectId,
      releaseScope: project.publicationRights === 'cleared' ? 'public-release' : 'internal-only',
      publicReleaseBlocked: project.publicationRights !== 'cleared',
      approvedBy: reviewer,
      approvedAt: now(),
      previewStartedAt: stage.previewStartedAt,
      composition: path.relative(workspaceRoot, composition).replaceAll('\\', '/'),
      compositionDigest: manifest.digest,
      fileCount: manifest.files.length,
      files: manifest.files,
    };
    approvalArtifact = await saveArtifact(projectId, stageId, 'final-preview.json', receipt, 'json');
  }
  const approvedArtifactPath = approvalArtifact ?? stage.artifactPath;
  const approvedArtifactSha256 = await artifactShaOrNull(approvedArtifactPath);
  return write((data) => {
    const current = ensureProjectShape(data.projects[projectId]);
    const currentStage = current.stages[stageId];
    currentStage.status = 'approved';
    currentStage.approvedAt = now();
    currentStage.approvedBy = reviewer;
    currentStage.approvalScope = stageId === 'voice-final'
      ? approvalScope
      : stageId === 'script-review' && reviewer === 'user-provided-script'
        ? 'user-provided-input'
        : reviewer === 'codex-autonomous-internal-review'
          ? 'internal-autonomous-review'
          : 'human-review';
    currentStage.lastError = null;
    if (approvalArtifact) {
      currentStage.artifactPath = approvalArtifact;
      currentStage.artifactKind = 'json';
    }
    currentStage.artifactSha256 = approvedArtifactSha256;
    currentStage.approvedArtifactSha256 = approvedArtifactSha256;
    current.updatedAt = now();
    current.events.unshift(event('stage-approved', {
      stageId,
      reviewer,
      approvalScope: currentStage.approvalScope,
      message: `Approved ${stageId} (${currentStage.approvalScope}).`,
    }));
    current.events = current.events.slice(0, 250);
    return current;
  });
};

const dedicatedTextReviewStageIds = new Set(['pronunciation-review', 'subtitle-review', 'screen-text-review']);

export const approveBoundTextReviewStage = async (projectId, stageId, reviewer, {
  artifactPath,
  artifactSha256,
  approvedAt = now(),
  approvalScope = 'human-review',
  delegatedSimulation = null,
} = {}) => {
  if (!dedicatedTextReviewStageIds.has(stageId)) throw new Error('Unknown dedicated text-review stage.');
  if (!artifactPath || !/^[a-f0-9]{64}$/i.test(String(artifactSha256 ?? ''))) {
    throw new Error('A hash-bound text-review approval receipt is required.');
  }
  const actualSha256 = await artifactShaOrNull(artifactPath);
  if (actualSha256 !== artifactSha256.toLowerCase()) throw new Error('Text-review approval receipt hash mismatch.');
  if (!['human-review', INTERNAL_AUTONOMOUS_REVIEW_SCOPE, 'user-directed-selection-no-listening'].includes(approvalScope)) {
    throw new Error('Text-review approval scope is invalid.');
  }
  if (approvalScope === INTERNAL_AUTONOMOUS_REVIEW_SCOPE) {
    const receipt = JSON.parse(await fs.readFile(resolveWorkspacePath(artifactPath), 'utf8'));
    if (reviewer !== CREATOR_DELEGATED_REVIEWER
      || delegatedSimulation?.mode !== 'creator-delegated-internal-only'
      || !delegatedSimulation?.receiptPath
      || !/^[a-f0-9]{64}$/i.test(String(delegatedSimulation?.receiptSha256 ?? ''))
      || receipt.approvalScope !== INTERNAL_AUTONOMOUS_REVIEW_SCOPE
      || receipt.approvedBy !== CREATOR_DELEGATED_REVIEWER
      || receipt.humanReviewPerformed !== false
      || receipt.publicReleaseBlocked !== true
      || receipt.delegation?.path !== delegatedSimulation.receiptPath
      || receipt.delegation?.sha256 !== delegatedSimulation.receiptSha256) {
      throw new Error('Internal text-review approval requires a bound creator-delegated simulation receipt.');
    }
  }
  if (approvalScope === 'user-directed-selection-no-listening') {
    const receipt = JSON.parse(await fs.readFile(resolveWorkspacePath(artifactPath), 'utf8'));
    if (stageId !== 'pronunciation-review'
      || receipt.approvalScope !== approvalScope
      || receipt.humanListening?.completed !== false
      || receipt.humanListening?.status !== 'skipped-by-user-direction'
      || receipt.selectionOverride?.selectedTermCount !== receipt.selectionOverride?.termCount
      || receipt.selectionOverride?.skippedCandidateCount < 1
      || receipt.publicReleaseBlocked !== true) {
      throw new Error('User-directed pronunciation selection requires a complete selection and an explicit incomplete-listening receipt.');
    }
  }
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const stage = project.stages[stageId];
    if (!stage || stage.status !== 'needs-review') {
      throw new Error('Only a review-ready dedicated text-review stage can be approved.');
    }
    stage.status = 'approved';
    stage.approvedAt = approvedAt;
    stage.approvedBy = reviewer;
    stage.approvalScope = approvalScope;
    stage.artifactPath = artifactPath;
    stage.artifactKind = 'json';
    stage.artifactSha256 = actualSha256;
    stage.approvedArtifactSha256 = actualSha256;
    stage.lastError = null;
    stage.lastResult = approvalScope === 'human-review'
      ? `Approved ${stageId} through its dedicated hash-bound checklist.`
      : approvalScope === 'user-directed-selection-no-listening'
        ? 'Accepted all current pronunciation selections by explicit user direction; remaining candidate listening was skipped and public release stays blocked.'
        : `Accepted ${stageId} for internal-only production under creator delegation; human review was not performed.`;
    project.updatedAt = approvedAt;
    project.events.unshift(event('text-review-approved', {
      stageId,
      reviewer,
      approvalScope,
      humanReviewPerformed: approvalScope === 'human-review',
      selectionConfirmed: approvalScope === 'user-directed-selection-no-listening',
      humanListeningCompleted: stageId === 'pronunciation-review' ? approvalScope === 'human-review' : null,
      publicReleaseBlocked: approvalScope !== 'human-review',
      delegatedSimulation,
      artifactSha256: actualSha256,
      message: approvalScope === 'human-review'
        ? `Approved ${stageId} through its dedicated review endpoint.`
        : approvalScope === 'user-directed-selection-no-listening'
          ? 'Accepted the user-selected pronunciations without claiming the remaining candidates were heard.'
          : `Accepted ${stageId} through its creator-delegated internal-only simulation endpoint.`,
    }));
    project.events = project.events.slice(0, 250);
    return project;
  });
};

export const recordTextReviewProgress = async (projectId, stageId, {
  artifactPath,
  artifactSha256,
  summary,
} = {}) => {
  if (!dedicatedTextReviewStageIds.has(stageId)) throw new Error('Unknown dedicated text-review stage.');
  const actualSha256 = await artifactShaOrNull(artifactPath);
  if (!actualSha256 || actualSha256 !== artifactSha256) throw new Error('Text-review progress receipt hash mismatch.');
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const stage = project.stages[stageId];
    if (!stage || stage.status !== 'needs-review') throw new Error('Text-review stage is not review-ready.');
    stage.artifactPath = artifactPath;
    stage.artifactKind = 'json';
    stage.artifactSha256 = actualSha256;
    stage.approvedArtifactSha256 = null;
    stage.lastResult = summary;
    stage.lastError = null;
    project.updatedAt = now();
    project.events.unshift(event('text-review-progress-saved', {stageId, message: summary}));
    project.events = project.events.slice(0, 250);
    return project;
  });
};

export const upgradeVoiceApproval = (projectId, reviewer = 'user') => write((data) => {
  void data;
  void reviewer;
  throw new Error(`Project ${projectId} must use the dedicated A/B candidate listening and atomic promotion contract.`);
});

export const approveVoiceCandidatePromotion = async (projectId, reviewer = 'user', {
  artifactPath,
  artifactSha256,
  selectedCandidateId,
  approvedAt = now(),
  approvalScope = 'human-listening',
  delegatedSimulation = null,
} = {}) => {
  if (!artifactPath || !/^[a-f0-9]{64}$/i.test(String(artifactSha256 ?? '')) || !selectedCandidateId) {
    throw new Error('A hash-bound voice promotion receipt and selected candidate are required.');
  }
  const actualSha256 = await artifactShaOrNull(artifactPath);
  if (actualSha256 !== artifactSha256.toLowerCase()) throw new Error('Voice promotion receipt hash mismatch.');
  if (!['human-listening', 'technical-only'].includes(approvalScope)) throw new Error('Voice promotion scope is invalid.');
  if (approvalScope === 'technical-only' && delegatedSimulation?.mode !== 'creator-delegated-internal-only') {
    throw new Error('Technical-only voice promotion requires a creator-delegated simulation receipt.');
  }
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const stage = project.stages['voice-final'];
    if (!stage || stage.status !== 'needs-review') throw new Error('Voice-final is not ready for candidate promotion.');
    stage.status = 'approved';
    stage.approvedAt = approvedAt;
    stage.approvedBy = reviewer;
    stage.approvalScope = approvalScope;
    stage.artifactPath = artifactPath;
    stage.artifactKind = 'json';
    stage.artifactSha256 = actualSha256;
    stage.approvedArtifactSha256 = actualSha256;
    stage.lastError = null;
    stage.lastResult = approvalScope === 'human-listening'
      ? `Promoted ${selectedCandidateId} as the unique final narration after hash-bound A/B listening review.`
      : `Promoted ${selectedCandidateId} for internal-only technical simulation; human listening was not performed.`;
    markDownstreamStale(project, 'voice-final', `Final narration changed to ${selectedCandidateId}; regenerate every timing and composition dependency.`);
    project.updatedAt = approvedAt;
    project.events.unshift(event('voice-candidate-promoted', {
      stageId: 'voice-final', reviewer, approvalScope, selectedCandidateId,
      artifactSha256: actualSha256,
      delegatedSimulation,
      message: approvalScope === 'human-listening'
        ? `Promoted ${selectedCandidateId} as narration.final.wav after dedicated file listening review.`
        : `Promoted ${selectedCandidateId} as narration.final.wav for internal-only simulation without human listening.`,
    }));
    project.events = project.events.slice(0, 250);
    return project;
  });
};

export const upgradeFinalPreviewApproval = (projectId, reviewer = 'user') => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const stage = project.stages['final-preview'];
  if (!stage || stage.status !== 'approved') {
    throw new Error('Internal final-preview approval must exist before human final review.');
  }
  if (stage.approvalScope === 'human-review') return project;
  if (stage.approvalScope !== 'internal-autonomous-review') {
    throw new Error('Only internal-autonomous final-preview approval can be upgraded to human-review.');
  }
  stage.approvalScope = 'human-review';
  stage.approvedBy = reviewer;
  stage.approvedAt = now();
  stage.approvedArtifactSha256 = stage.artifactSha256;
  stage.lastError = null;
  stage.lastResult = 'Human final review approved against the unchanged composition and preview receipt.';
  for (const downstreamId of ['delivery-qa', 'retrospective', 'package-export']) {
    const downstream = project.stages[downstreamId];
    if (!downstream || downstream.status === 'not-started') continue;
    downstream.status = 'stale';
    downstream.lastError = 'Human final-review approval changed delivery metadata; regenerate delivery QA and retrospective.';
    downstream.approvedAt = null;
    downstream.approvedBy = null;
    downstream.approvalScope = null;
    downstream.approvedArtifactSha256 = null;
  }
  project.updatedAt = now();
  project.events.unshift(event('final-preview-approval-upgraded', {
    stageId: 'final-preview',
    reviewer,
    approvalScope: 'human-review',
    message: 'Upgraded final-preview approval to human-review without invalidating the composition, structural QA, or render.',
  }));
  project.events = project.events.slice(0, 250);
  return project;
});

export const approveFinalPreviewHumanReview = async (projectId, reviewer = 'user', {
  artifactPath,
  approvedAt = now(),
} = {}) => {
  const artifactSha256 = await artifactShaOrNull(artifactPath);
  return write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const stage = project.stages['final-preview'];
  if (!stage || stage.status !== 'needs-review') {
    throw new Error('Only a review-ready final preview can receive direct human approval.');
  }
  if (!stage.previewStartedAt || Number.isNaN(Date.parse(stage.previewStartedAt))) {
    throw new Error('Start HyperFrames Studio before approving the human final review.');
  }
  if (project.stages['qa-review']?.status !== 'approved') {
    throw new Error('HyperFrames check must pass before approving the human final review.');
  }
  if (!artifactPath) throw new Error('A hash-bound final-preview artifact is required for human approval.');

  stage.status = 'approved';
  stage.approvalScope = 'human-review';
  stage.approvedBy = reviewer;
  stage.approvedAt = approvedAt;
  stage.artifactPath = artifactPath;
  stage.artifactKind = 'json';
  stage.artifactSha256 = artifactSha256;
  stage.approvedArtifactSha256 = artifactSha256;
  stage.lastError = null;
  stage.lastResult = 'Human final review approved against the current Studio session and composition digest.';
  project.updatedAt = approvedAt;
  project.events.unshift(event('final-preview-human-approved', {
    stageId: 'final-preview',
    reviewer,
    approvalScope: 'human-review',
    message: 'Approved final-preview through the dedicated five-item human review gate.',
  }));
  project.events = project.events.slice(0, 250);
  return project;
  });
};

export const approveFinalPreviewInternalReview = async (projectId, {
  artifactPath,
  artifactSha256,
  approvedAt = now(),
  delegatedSimulation = null,
} = {}) => {
  const actualSha256 = await artifactShaOrNull(artifactPath);
  if (!actualSha256 || actualSha256 !== String(artifactSha256 ?? '').toLowerCase()) {
    throw new Error('Internal final-preview approval receipt hash mismatch.');
  }
  const receipt = JSON.parse(await fs.readFile(resolveWorkspacePath(artifactPath), 'utf8'));
  if (receipt.schemaVersion !== 'autovideo-final-preview-internal-approval/v1'
    || receipt.status !== 'approved-internal-only'
    || receipt.approvalScope !== INTERNAL_AUTONOMOUS_REVIEW_SCOPE
    || receipt.approvedBy !== CREATOR_DELEGATED_REVIEWER
    || receipt.humanReviewPerformed !== false
    || receipt.publicReleaseBlocked !== true
    || delegatedSimulation?.mode !== 'creator-delegated-internal-only'
    || receipt.delegation?.path !== delegatedSimulation?.receiptPath
    || receipt.delegation?.sha256 !== delegatedSimulation?.receiptSha256) {
    throw new Error('Internal final-preview approval requires a bound creator-delegated simulation receipt.');
  }
  return write((data) => {
    const project = ensureProjectShape(data.projects[projectId]);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const stage = project.stages['final-preview'];
    if (!stage || stage.status !== 'needs-review') {
      throw new Error('Only a review-ready final preview can receive internal approval.');
    }
    if (project.publicationRights !== 'internal-only') {
      throw new Error('Internal final-preview approval requires an internal-only project.');
    }
    if (!stage.previewStartedAt || Number.isNaN(Date.parse(stage.previewStartedAt))) {
      throw new Error('Start HyperFrames Studio before internal final-preview approval.');
    }
    if (project.stages['qa-review']?.status !== 'approved') {
      throw new Error('HyperFrames check must pass before internal final-preview approval.');
    }
    stage.status = 'approved';
    stage.approvalScope = INTERNAL_AUTONOMOUS_REVIEW_SCOPE;
    stage.approvedBy = CREATOR_DELEGATED_REVIEWER;
    stage.approvedAt = approvedAt;
    stage.artifactPath = artifactPath;
    stage.artifactKind = 'json';
    stage.artifactSha256 = actualSha256;
    stage.approvedArtifactSha256 = actualSha256;
    stage.lastError = null;
    stage.lastResult = 'Accepted final preview for internal-only rendering; human final review was not performed.';
    project.updatedAt = approvedAt;
    project.events.unshift(event('final-preview-internal-approved', {
      stageId: 'final-preview',
      reviewer: CREATOR_DELEGATED_REVIEWER,
      approvalScope: INTERNAL_AUTONOMOUS_REVIEW_SCOPE,
      humanReviewPerformed: false,
      publicReleaseBlocked: true,
      delegatedSimulation,
      message: 'Accepted final preview through creator-delegated internal-only simulation.',
    }));
    project.events = project.events.slice(0, 250);
    return project;
  });
};

export const recordProductionOverrideChange = (projectId, {
  overrideId,
  action = 'saved',
  reason = 'Production object override changed.',
  invalidateFromStage = 'full-production',
} = {}, writeOptions = {}) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const stage = project.stages['full-production'];
  if (!stage) throw new Error('The full-production stage is unavailable.');
  if (stage.status === 'running') throw new Error('Cannot change production overrides while full production is running.');
  const invalidationStage = project.stages[invalidateFromStage];
  if (!invalidationStage) throw new Error(`The override invalidation stage ${invalidateFromStage} is unavailable.`);
  if (invalidationStage.status === 'running') throw new Error(`Cannot change production overrides while ${invalidateFromStage} is running.`);
  const message = action === 'reverted'
    ? `Reverted production override ${overrideId}.`
    : `Saved production override ${overrideId}.`;
  stage.overrides.push({id: overrideId, at: now(), reason, action, revision: stage.revision});
  invalidateFrom(project, invalidateFromStage, message);
  project.updatedAt = now();
  project.events.unshift(event('production-override-changed', {
    stageId: 'full-production',
    overrideId,
    action,
    invalidateFromStage,
    message,
  }));
  project.events = project.events.slice(0, 250);
  return project;
}, writeOptions);

export const recordMediaAssetImport = (projectId, {
  assetId,
  reused = false,
  origin = 'library',
  candidateId = null,
  candidateDigestSha256 = null,
} = {}) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const message = reused
    ? `Reused registered media asset ${assetId}; no duplicate bytes were added.`
    : `Imported registered media asset ${assetId} into the project ledger.`;
  invalidateFrom(project, 'rights-clearance', message);
  project.updatedAt = now();
  project.events.unshift(event('media-asset-imported', {
    assetId,
    reused,
    origin,
    candidateId,
    candidateDigestSha256,
    message,
  }));
  project.events = project.events.slice(0, 250);
  return project;
});

export const recordVisualAssetCandidateDecision = (projectId, {
  candidateId,
  assetId,
  decision,
  candidateDigestSha256,
  revision,
} = {}) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const message = `${decision === 'adopted' ? 'Adopted' : 'Rejected'} visual asset candidate ${candidateId} (${assetId}).`;
  project.updatedAt = now();
  project.events.unshift(event('visual-asset-candidate-decided', {
    stageId: 'full-production',
    candidateId,
    assetId,
    decision,
    candidateDigestSha256,
    revision,
    message,
  }));
  project.events = project.events.slice(0, 250);
  return project;
});

export const recordMotionFeedbackChange = (projectId, {
  usageKey,
  revision,
  overallVerdict,
} = {}) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const message = `Saved motion-library feedback revision ${revision} (${overallVerdict}).`;
  project.updatedAt = now();
  project.events.unshift(event('motion-feedback-saved', {
    stageId: 'retrospective',
    usageKey,
    revision,
    overallVerdict,
    message,
  }));
  project.events = project.events.slice(0, 250);
  return project;
});

export const recordSemanticSfxReviewChange = (projectId, {
  action,
  reason = 'Semantic SFX plan review changed.',
} = {}) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const stage = project.stages['full-production'];
  if (!stage) throw new Error('The full-production stage is unavailable.');
  if (stage.status === 'running') throw new Error('Cannot change semantic SFX review while full production is running.');
  const message = action === 'reopened'
    ? 'Reopened the semantic SFX plan; all candidate cues are silent until re-approved.'
    : action === 'simulated'
      ? 'Accepted a creator-delegated internal-only semantic SFX subset for the next full-production compile.'
      : 'Approved the human-reviewed semantic SFX subset for the next full-production compile.';
  invalidateFrom(project, 'full-production', message);
  project.updatedAt = now();
  project.events.unshift(event('semantic-sfx-review-changed', {
    stageId: 'full-production',
    action,
    reason,
    message,
  }));
  project.events = project.events.slice(0, 250);
  return project;
});

export const reopenStage = (projectId, stageId, reason = 'Revision requested') => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  const stage = project.stages[stageId];
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);
  stage.status = stage.artifactPath ? 'needs-review' : 'not-started';
  stage.approvedAt = null;
  stage.approvedBy = null;
  stage.approvalScope = null;
  stage.approvedArtifactSha256 = null;
  stage.previewStartedAt = null;
  markDownstreamStale(project, stageId, reason);
  project.updatedAt = now();
  project.events.unshift(event('stage-reopened', {stageId, message: reason}));
  return project;
});

export const recordPreviewStarted = (projectId, previewUrl) => write((data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const stage = project.stages['final-preview'];
  if (!stage || !['needs-review', 'stale', 'approved'].includes(stage.status)) throw new Error('Generate the final preview stage before opening Studio.');
  stage.previewStartedAt = now();
  stage.previewUrl = previewUrl;
  project.updatedAt = now();
  project.events.unshift(event('preview-started', {stageId: 'final-preview', message: `Opened HyperFrames Studio at ${previewUrl}`}));
  project.events = project.events.slice(0, 250);
  return project;
});

export const resetProject = (projectId) => write(async (data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  if (Object.values(project.stages).some((stage) => stage.status === 'running')) throw new Error('A running stage must finish before this project can be reset.');
  const definitions = new Map([...workflowStages, ...Object.values(project.customStages)].map((stage) => [stage.id, stage]));
  project.stages = Object.fromEntries(project.stageOrder.map((stageId, index) => {
    const definition = definitions.get(stageId);
    const reset = makeStageState(definition, index);
    const previous = project.stages[stageId];
    reset.position = previous?.position ?? reset.position;
    reset.positionEdited = previous?.positionEdited ?? false;
    reset.titleOverride = previous?.titleOverride ?? null;
    reset.descriptionOverride = previous?.descriptionOverride ?? null;
    reset.notes = previous?.notes ?? '';
    reset.promptOverride = previous?.promptOverride ?? '';
    reset.toolId = previous?.toolId ?? reset.toolId;
    reset.mode = previous?.mode ?? reset.mode;
    reset.enabled = previous?.enabled ?? reset.enabled;
    return [stageId, reset];
  }));
  project.formalProjectPath = null;
  project.updatedAt = now();
  project.events = [event('project-reset', {message: 'Reset workbench progress. Formal project files were preserved.'})];
  for (const [jobId, job] of Object.entries(data.jobs)) {
    if (job.projectId === projectId) delete data.jobs[jobId];
  }
  await fs.rm(path.join(dataRoot, 'projects', projectId), {recursive: true, force: true});
  return project;
});

export const deleteProject = (projectId) => write(async (data) => {
  const project = ensureProjectShape(data.projects[projectId]);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  if (Object.values(project.stages).some((stage) => stage.status === 'running')) throw new Error('A running stage must finish before this project can be deleted.');
  delete data.projects[projectId];
  for (const [jobId, job] of Object.entries(data.jobs)) {
    if (job.projectId === projectId) delete data.jobs[jobId];
  }
  await fs.rm(path.join(dataRoot, 'projects', projectId), {recursive: true, force: true});
  return {id: projectId, formalProjectPath: project.formalProjectPath, formalFilesPreserved: true};
});

export const createJobRecord = (job) => write((data) => {
  data.jobs[job.id] = job;
  return job;
});

export const updateJobRecord = (jobId, patch) => write((data) => {
  if (!data.jobs[jobId]) throw new Error(`Unknown job: ${jobId}`);
  Object.assign(data.jobs[jobId], patch);
  return data.jobs[jobId];
});

export const getJobRecord = (jobId) => read((data) => data.jobs[jobId] ?? null);

export const listJobRecords = ({projectId = null, batchId = null, statuses = null, limit = 100} = {}) => read((data) => {
  const statusSet = Array.isArray(statuses) && statuses.length ? new Set(statuses) : null;
  return Object.values(data.jobs)
    .filter((job) => (!projectId || job.projectId === projectId)
      && (!batchId || job.batchId === batchId)
      && (!statusSet || statusSet.has(job.status)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));
});

export const requestJobCancellation = (jobId) => write((data) => {
  const job = data.jobs[jobId];
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (['complete', 'failed', 'canceled'].includes(job.status)) return job;
  const canceledAt = now();
  job.cancelRequestedAt = canceledAt;
  if (job.status === 'queued') {
    job.status = 'canceled';
    job.finishedAt = canceledAt;
    job.error = null;
  } else {
    job.status = 'cancel-requested';
  }
  const project = ensureProjectShape(data.projects[job.projectId]);
  const stage = project?.stages[job.stageId];
  if (stage?.jobId === job.id && job.status === 'canceled') {
    stage.status = stage.artifactPath ? 'stale' : 'failed';
    stage.lastError = 'Generation was canceled before it started.';
    stage.jobId = null;
    project.updatedAt = canceledAt;
    project.events.unshift(event('job-canceled', {
      stageId: job.stageId,
      jobId: job.id,
      message: stage.lastError,
    }));
    project.events = project.events.slice(0, 250);
  }
  return job;
});

export const pauseQueuedJob = (jobId) => write((data) => {
  const job = data.jobs[jobId];
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.status !== 'queued') return job;
  const pausedAt = now();
  job.status = 'paused';
  job.pausedAt = pausedAt;
  const project = ensureProjectShape(data.projects[job.projectId]);
  const stage = project?.stages[job.stageId];
  if (stage?.jobId === job.id) {
    stage.status = stage.artifactPath ? 'stale' : 'not-started';
    stage.jobId = null;
    stage.lastError = 'Batch paused before this job started.';
    project.updatedAt = pausedAt;
    project.events.unshift(event('batch-job-paused', {
      stageId: job.stageId,
      jobId: job.id,
      message: stage.lastError,
    }));
    project.events = project.events.slice(0, 250);
  }
  return job;
});

export const recoverInterruptedJobs = () => write((data) => {
  const recoveredAt = now();
  const jobs = [];
  for (const job of Object.values(data.jobs)) {
    if (job.status === 'cancel-requested') {
      job.status = 'canceled';
      job.finishedAt = recoveredAt;
      job.error = null;
      const project = ensureProjectShape(data.projects[job.projectId]);
      const stage = project?.stages[job.stageId];
      if (stage?.jobId === job.id) {
        stage.status = stage.artifactPath ? 'stale' : 'failed';
        stage.lastError = 'Cancellation completed during workbench restart; partial output was not promoted.';
        stage.jobId = null;
        project.updatedAt = recoveredAt;
      }
      continue;
    }
    if (!['queued', 'running'].includes(job.status)) continue;
    job.status = 'queued';
    job.startedAt = null;
    job.finishedAt = null;
    job.error = null;
    job.recoveredAt = recoveredAt;
    job.resumeCount = Number(job.resumeCount || 0) + 1;
    const project = ensureProjectShape(data.projects[job.projectId]);
    const stage = project?.stages[job.stageId];
    if (stage) {
      stage.status = 'running';
      stage.lastError = null;
      stage.jobId = job.id;
      project.updatedAt = recoveredAt;
      project.events.unshift(event('job-resumed', {
        stageId: job.stageId,
        jobId: job.id,
        message: `Requeued interrupted job for ${job.stageId}.`,
      }));
      project.events = project.events.slice(0, 250);
    }
    jobs.push(structuredClone(job));
  }
  return {count: jobs.length, jobs};
});

export const resolveWorkspacePath = (relativeOrAbsolute) => {
  const target = path.resolve(workspaceRoot, relativeOrAbsolute);
  const rootWithSeparator = `${workspaceRoot.toLowerCase()}${path.sep}`;
  const lowered = target.toLowerCase();
  if (target !== workspaceRoot && !lowered.startsWith(rootWithSeparator)) throw new Error('Path must stay inside the AutoVideo workspace.');
  if (lowered.endsWith(`${path.sep}.env`) || lowered.includes(`${path.sep}.git${path.sep}`)) throw new Error('Sensitive workspace path is not allowed.');
  return target;
};

export const resolveExistingWorkspacePath = async (relativeOrAbsolute) => {
  const target = resolveWorkspacePath(relativeOrAbsolute);
  const realTarget = await fs.realpath(target);
  const realRoot = await fs.realpath(workspaceRoot);
  const lowered = realTarget.toLowerCase();
  const rootWithSeparator = `${realRoot.toLowerCase()}${path.sep}`;
  if (realTarget !== realRoot && !lowered.startsWith(rootWithSeparator)) throw new Error('Resolved path leaves the AutoVideo workspace.');
  return realTarget;
};

export const formalProjectRoot = (project) => path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', project.id);

export const findCompositionRoot = async (formalRoot) => {
  const candidates = [path.join(formalRoot, 'production', 'hyperframes'), formalRoot];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, 'hyperframes.json'));
      return candidate;
    } catch {
      // Try the next supported project shape.
    }
  }
  throw new Error('No HyperFrames composition exists yet.');
};

export const sha256File = async (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

const compositionExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.woff', '.woff2', '.ttf', '.otf', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.webm',
]);
const compositionIgnoredDirectories = new Set([
  'node_modules', '.git', 'dist', 'renders', 'qa',
  '.thumbnails', '.waveform-cache',
]);
const compositionIgnoredFiles = new Set([
  // Studio metadata and build receipts do not affect rendered frames. They also
  // contain timestamps, so including them would make an otherwise identical
  // composition digest change on every compile or preview.
  'meta.json',
  'data/composition-build.json',
]);

export const hashDirectoryManifest = async (root) => {
  const files = [];
  const walk = async (directory) => {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!compositionIgnoredDirectories.has(entry.name)) await walk(target);
      } else if (entry.isFile() && compositionExtensions.has(path.extname(entry.name).toLowerCase())) {
        const relativePath = path.relative(root, target).replaceAll('\\', '/');
        if (compositionIgnoredFiles.has(relativePath)) continue;
        const stats = await fs.stat(target);
        files.push({
          path: relativePath,
          bytes: stats.size,
          sha256: await sha256File(target),
        });
      }
    }
  };
  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return {digest, files};
};

export const schemas = {projectInputSchema, projectPatchSchema, stagePatchSchema, customStageSchema};
