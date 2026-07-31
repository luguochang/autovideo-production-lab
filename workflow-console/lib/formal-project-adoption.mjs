import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertPlanningBundle,
  importFormalPlanningBundle,
} from './planning-compat.mjs';
import {assertContentApprovalForNarration} from '../../tools/content-pipeline/content-contract.mjs';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FORMAL_PROJECTS_PATH = ['hyperframes-workflow-kit', 'projects'];
const HUMAN_REVIEW_STAGE_IDS = new Set([
  'script-review',
  'content-approval',
  'pronunciation-review',
  'voice-final',
  'subtitle-review',
  'style-probe',
  'rights-clearance',
  'final-preview',
  'screen-text-review',
  'retrospective',
]);

const portablePath = (value) => value.replaceAll('\\', '/');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const sha256File = async (filePath) => sha256(await fs.readFile(filePath));

const normalizedNarrationSha256 = (value) => sha256(
  value.toString('utf8').replaceAll('\r\n', '\n').trim(),
);

const isInside = (parent, target) => {
  const relative = path.relative(parent, target);
  return relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const workspaceRelativePath = (workspaceRoot, filePath) => {
  const relative = path.relative(workspaceRoot, filePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Formal project path leaves the AutoVideo workspace: ${filePath}`);
  }
  return portablePath(relative);
};

const readJson = async (filePath, label, {required = false} = {}) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && !required) return null;
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON: ${error.message}`);
    if (error?.code === 'ENOENT') throw new Error(`Formal project is missing required ${label}: ${filePath}`);
    throw error;
  }
};

const readText = async (filePath, label) => {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Formal project is missing required ${label}: ${filePath}`);
    throw error;
  }
};

const assertBoundHash = async ({formalRoot, relativePath, expectedSha256, label}) => {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedSha256 ?? ''))) {
    throw new Error(`${label} is missing a valid SHA-256 binding.`);
  }
  const actual = await sha256File(path.join(formalRoot, relativePath));
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`${label} is stale for ${relativePath}.`);
  }
};

const validateKnownJsonArtifact = async ({formalRoot, projectId, stageId, value}) => {
  if (value?.projectId && value.projectId !== projectId) {
    throw new Error(`${stageId} projectId must match formal project directory ${projectId}.`);
  }
  if (stageId === 'subtitle-qa') {
    if (value?.schemaVersion !== 'autovideo-subtitle-qa/v1' || value.projectId !== projectId || !value.machine) {
      throw new Error('qa/subtitle-qa.json must use autovideo-subtitle-qa/v1 and match the formal project.');
    }
    await Promise.all([
      assertBoundHash({formalRoot, relativePath: 'audio/alignment.json', expectedSha256: value.machine.alignmentSha256, label: 'Subtitle QA alignment binding'}),
      assertBoundHash({formalRoot, relativePath: 'captions/alignment-validation.json', expectedSha256: value.machine.validationSha256, label: 'Subtitle QA validation binding'}),
      assertBoundHash({formalRoot, relativePath: 'captions/narration.zh-CN.srt', expectedSha256: value.machine.srtSha256, label: 'Subtitle QA SRT binding'}),
    ]);
  }
  if (stageId === 'visual-variety-qa') {
    if (value?.schemaVersion !== 'autovideo-visual-variety-qa/v1' || value.projectId !== projectId || !value.machine) {
      throw new Error('qa/visual-variety-qa.json must use autovideo-visual-variety-qa/v1 and match the formal project.');
    }
    await Promise.all([
      assertBoundHash({formalRoot, relativePath: 'plan/shot-manifest.json', expectedSha256: value.bindings?.shotManifest?.sha256, label: 'Visual variety QA shot-manifest binding'}),
      assertBoundHash({formalRoot, relativePath: 'plan/storyboard.json', expectedSha256: value.bindings?.storyboard?.sha256, label: 'Visual variety QA storyboard binding'}),
      assertBoundHash({formalRoot, relativePath: 'plan/graph-ir.json', expectedSha256: value.bindings?.graphIr?.sha256, label: 'Visual variety QA Graph IR binding'}),
    ]);
  }
};

const projectArtifact = async ({workspaceRoot, formalRoot, projectId, stageId, relativePath, kind, required = false}) => {
  const absolutePath = path.join(formalRoot, relativePath);
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) throw new Error(`${relativePath} is not a file.`);
  } catch (error) {
    if (error?.code === 'ENOENT' && !required) return null;
    if (error?.code === 'ENOENT') throw new Error(`Formal project is missing required ${relativePath}.`);
    throw error;
  }
  if (kind === 'json') {
    let value;
    try {
      value = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`${relativePath} is not valid JSON: ${error.message}`);
      throw error;
    }
    await validateKnownJsonArtifact({formalRoot, projectId, stageId, value});
  }
  return {
    stageId,
    artifactPath: workspaceRelativePath(workspaceRoot, absolutePath),
    artifactKind: kind,
    sha256: await sha256File(absolutePath),
  };
};

const assertProjectIdentity = (value, projectId, label) => {
  if (!value?.projectId || value.projectId !== projectId) {
    throw new Error(`${label} projectId must match formal project directory ${projectId}.`);
  }
};

const resolveFormalRoot = async ({workspaceRoot, formalProjectPath}) => {
  const resolvedWorkspace = await fs.realpath(path.resolve(workspaceRoot));
  const expectedProjectsRoot = path.join(resolvedWorkspace, ...FORMAL_PROJECTS_PATH);
  const requested = path.resolve(resolvedWorkspace, formalProjectPath);
  let formalRoot;
  try {
    formalRoot = await fs.realpath(requested);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Formal project does not exist: ${formalProjectPath}`);
    throw error;
  }
  if (!isInside(expectedProjectsRoot, formalRoot) || path.dirname(formalRoot) !== expectedProjectsRoot) {
    throw new Error('Formal project must be a direct child of hyperframes-workflow-kit/projects inside this workspace.');
  }
  return {workspaceRoot: resolvedWorkspace, formalRoot};
};

const assertProductionBinding = async ({workspaceRoot, formalRoot, binding, label}) => {
  if (!binding?.path || !binding?.sha256) throw new Error(`Production manifest ${label} binding is incomplete.`);
  const target = path.resolve(formalRoot, binding.path);
  if (!isInside(formalRoot, target)) throw new Error(`Production manifest ${label} binding leaves the formal project.`);
  const actual = await sha256File(target).catch((error) => {
    if (error?.code === 'ENOENT') throw new Error(`Production manifest ${label} binding is missing: ${binding.path}`);
    throw error;
  });
  if (actual.toLowerCase() !== String(binding.sha256).toLowerCase()) {
    throw new Error(`Production manifest ${label} binding hash does not match ${binding.path}.`);
  }
  return {
    path: workspaceRelativePath(workspaceRoot, target),
    sha256: actual,
  };
};

const inspectProductionManifest = async ({workspaceRoot, formalRoot, projectId}) => {
  const manifestPath = path.join(formalRoot, 'plan', 'production-manifest.json');
  const manifest = await readJson(manifestPath, 'plan/production-manifest.json');
  if (!manifest) return null;
  if (manifest.schemaVersion !== 'autovideo-production-manifest/v1') {
    throw new Error('Production manifest must use autovideo-production-manifest/v1.');
  }
  assertProjectIdentity(manifest, projectId, 'Production manifest');
  const bindings = {};
  for (const key of ['narrationLock', 'templateLock', 'alignment', 'storyboard', 'shotManifest', 'graphIr', 'graphLayout']) {
    if (!manifest.bindings?.[key]) continue;
    bindings[key] = await assertProductionBinding({
      workspaceRoot,
      formalRoot,
      binding: manifest.bindings[key],
      label: key,
    });
  }
  return {
    path: workspaceRelativePath(workspaceRoot, manifestPath),
    sha256: await sha256File(manifestPath),
    bindings,
    format: manifest.format ?? null,
  };
};

const assertReceiptFileBinding = async ({formalRoot, receipt, key, label}) => {
  const binding = receipt?.[key];
  if (!binding?.path || !binding?.sha256) throw new Error(`${label} ${key} binding is incomplete.`);
  const target = path.resolve(formalRoot, binding.path);
  if (!isInside(formalRoot, target)) throw new Error(`${label} ${key} binding leaves the formal project.`);
  const actual = await sha256File(target).catch((error) => {
    if (error?.code === 'ENOENT') throw new Error(`${label} ${key} binding is missing: ${binding.path}`);
    throw error;
  });
  if (actual.toLowerCase() !== String(binding.sha256).toLowerCase()) {
    throw new Error(`${label} ${key} binding hash does not match ${binding.path}.`);
  }
  return {path: portablePath(binding.path), sha256: actual};
};

const inspectAudioHandoff = async ({workspaceRoot, formalRoot, projectId}) => {
  const receiptPath = path.join(formalRoot, 'audio-handoff.json');
  const receipt = await readJson(receiptPath, 'audio-handoff.json');
  if (!receipt) return null;
  if (!['autovideo-audio-handoff/v1', 'autovideo-audio-handoff/v2'].includes(receipt.schemaVersion)) {
    throw new Error('audio-handoff.json must use a supported autovideo-audio-handoff schema.');
  }
  assertProjectIdentity(receipt, projectId, 'Audio handoff receipt');
  return {
    path: workspaceRelativePath(workspaceRoot, receiptPath),
    sha256: await sha256File(receiptPath),
    audio: await assertReceiptFileBinding({formalRoot, receipt, key: 'audio', label: 'Audio handoff'}),
    alignment: await assertReceiptFileBinding({formalRoot, receipt, key: 'alignment', label: 'Audio handoff'}),
  };
};

const readVoiceRoute = async (formalRoot) => {
  const recipe = await readJson(path.join(formalRoot, 'audio', 'narration.final.recipe.json'), 'audio/narration.final.recipe.json');
  const description = `${recipe?.recipe ?? ''} ${recipe?.model ?? ''}`.toLowerCase();
  return description.includes('cosyvoice') || /\be14\b/i.test(description) ? 'preset14' : 'original';
};

const inspectContentApproval = async ({workspaceRoot, formalRoot, projectId, approval, narrationLock}) => {
  if (!approval) return null;
  const approvalPath = path.join(formalRoot, 'input', 'content-approval.json');
  const narrationPath = path.join(formalRoot, 'input', approval.approvedNarration?.path || 'script.approved.txt');
  const bindingFiles = {
    sourcesSha256: 'sources.json',
    suitabilitySha256: 'material-suitability.json',
    evidenceSha256: 'evidence.json',
    contentOutlineSha256: 'content-outline.json',
    scriptDraftSha256: 'script.draft.json',
    spokenRewriteSha256: 'spoken-rewrite.json',
    durationFitSha256: 'content-duration-fit.json',
    claimSourceReviewSha256: 'claim-source-review.json',
  };
  try {
    const narrationText = await fs.readFile(narrationPath, 'utf8');
    await assertContentApprovalForNarration({approval, projectId, narrationText});
    const approvalSha256 = await sha256File(approvalPath);
    if (narrationLock.approvalReceipt?.path !== 'input/content-approval.json'
      || narrationLock.approvalReceipt?.sha256 !== approvalSha256
      || narrationLock.approvalReceipt?.approvedNarrationSha256 !== approval.approvedNarration.sha256) {
      throw new Error('NarrationLock does not bind the current content approval.');
    }
    for (const key of ['sourcesSha256', 'suitabilitySha256', 'evidenceSha256', 'spokenRewriteSha256', 'claimSourceReviewSha256']) {
      if (!approval.bindings?.[key]) throw new Error(`Content approval is missing ${key}.`);
    }
    const intakeDir = path.join(formalRoot, 'input', 'content-intake');
    for (const [binding, fileName] of Object.entries(bindingFiles)) {
      if (!approval.bindings?.[binding]) continue;
      if (await sha256File(path.join(intakeDir, fileName)) !== approval.bindings[binding]) {
        throw new Error(`${fileName} does not match ${binding}.`);
      }
    }
    const sources = JSON.parse(await fs.readFile(path.join(intakeDir, bindingFiles.sourcesSha256), 'utf8'));
    for (const source of sources.sources ?? []) {
      if (!source.path || !source.sha256) throw new Error('sources.json contains an incomplete file binding.');
      const sourcePath = path.resolve(workspaceRoot, source.path);
      if (!isInside(workspaceRoot, sourcePath) || await sha256File(sourcePath) !== source.sha256) {
        throw new Error(`Registered source is stale: ${source.path}.`);
      }
    }
    return {
      valid: true,
      path: workspaceRelativePath(workspaceRoot, approvalPath),
      sha256: approvalSha256,
      narrationPath: workspaceRelativePath(workspaceRoot, narrationPath),
      narrationSha256: approval.approvedNarration.sha256,
    };
  } catch (error) {
    return {
      valid: false,
      path: workspaceRelativePath(workspaceRoot, approvalPath),
      reason: error.message,
    };
  }
};

const stageArtifactDefinitions = [
  ['source-register', 'input/narration.txt', 'text', true],
  ['content-approval', 'input/content-approval.json', 'json', false],
  ['narration-lock', 'NarrationLock.json', 'json', true],
  ['template-lock', 'template-lock.json', 'json', true],
  ['pronunciation-review', 'qa/pronunciation-approval.json', 'json', false],
  ['voice-final', 'audio/narration.final.recipe.json', 'json', false],
  ['audio-align', 'audio/alignment.json', 'json', false],
  ['subtitle-qa', 'qa/subtitle-qa.json', 'json', false],
  ['subtitle-review', 'qa/subtitle-human-approval.json', 'json', false],
  ['rights-clearance', 'receipts/publication-rights.json', 'json', false],
  ['audio-handoff', 'audio-handoff.json', 'json', false],
  ['diagram-assets', 'plan/graph-layout.json', 'json', false],
  ['style-probe', 'STYLE_REVIEW.md', 'text', false],
  ['visual-variety-qa', 'qa/visual-variety-qa.json', 'json', false],
  ['composition-readiness', 'SOP_STATUS.json', 'json', false],
  ['full-production', 'production/hyperframes/index.html', 'text', false],
  ['qa-review', 'qa/hyperframes-check.json', 'json', false],
  ['screen-text-review', 'qa/screen-text-human-approval.json', 'json', false],
  ['final-preview', 'qa/final-preview.json', 'json', false],
  ['render-deliver', 'delivery/delivery-manifest.json', 'json', false],
  ['delivery-qa', 'qa/delivery-report.json', 'json', false],
  ['retrospective', 'RETROSPECTIVE.md', 'text', false],
  ['package-export', 'delivery/standard-package/PACKAGE_STATUS.json', 'json', false],
];

export const humanReviewStageIds = HUMAN_REVIEW_STAGE_IDS;

export const inspectFormalProjectForAdoption = async ({workspaceRoot, formalProjectPath}) => {
  const roots = await resolveFormalRoot({workspaceRoot, formalProjectPath});
  const projectId = path.basename(roots.formalRoot);
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new Error(`Formal project directory has an invalid project ID: ${projectId}`);

  const statePath = path.join(roots.formalRoot, 'project-state.json');
  const state = await readJson(statePath, 'project-state.json', {required: true});
  if (state.schemaVersion !== 'autovideo-project-state/v1') {
    throw new Error('project-state.json must use autovideo-project-state/v1.');
  }
  assertProjectIdentity(state, projectId, 'project-state.json');

  const narrationPath = path.join(roots.formalRoot, 'input', 'narration.txt');
  const [narration, narrationLock, templateLock] = await Promise.all([
    readText(narrationPath, 'input/narration.txt'),
    readJson(path.join(roots.formalRoot, 'NarrationLock.json'), 'NarrationLock.json', {required: true}),
    readJson(path.join(roots.formalRoot, 'template-lock.json'), 'template-lock.json', {required: true}),
  ]);
  assertProjectIdentity(narrationLock, projectId, 'NarrationLock');
  assertProjectIdentity(templateLock, projectId, 'Template lock');
  const narrationSha = normalizedNarrationSha256(narration);
  if (String(narrationLock.normalizedSha256 ?? '').toLowerCase() !== narrationSha) {
    throw new Error('NarrationLock normalizedSha256 does not match input/narration.txt.');
  }
  if (templateLock.narrationSha256 && String(templateLock.narrationSha256).toLowerCase() !== narrationSha) {
    throw new Error('Template lock narrationSha256 does not match NarrationLock input.');
  }

  const productionManifest = await inspectProductionManifest({
    workspaceRoot: roots.workspaceRoot,
    formalRoot: roots.formalRoot,
    projectId,
  });
  const audioHandoff = await inspectAudioHandoff({
    workspaceRoot: roots.workspaceRoot,
    formalRoot: roots.formalRoot,
    projectId,
  });
  const planningBundle = await importFormalPlanningBundle({
    formalRoot: roots.formalRoot,
    workspaceRoot: roots.workspaceRoot,
    projectId,
    workbenchRevision: 1,
  });
  if (planningBundle) assertPlanningBundle(planningBundle, projectId);

  const artifacts = {};
  for (const [stageId, relativePath, kind, required] of stageArtifactDefinitions) {
    const artifact = await projectArtifact({
      workspaceRoot: roots.workspaceRoot,
      formalRoot: roots.formalRoot,
      projectId,
      stageId,
      relativePath,
      kind,
      required,
    });
    if (artifact) artifacts[stageId] = artifact;
  }

  const contentApproval = await readJson(path.join(roots.formalRoot, 'input', 'content-approval.json'), 'input/content-approval.json');
  if (contentApproval) {
    assertProjectIdentity(contentApproval, projectId, 'Content approval receipt');
    const approvedSha = contentApproval.approvedNarration?.sha256;
    if (approvedSha && String(approvedSha).toLowerCase() !== narrationSha) {
      throw new Error('Content approval receipt narration hash does not match NarrationLock input.');
    }
  }
  const contentApprovalEvidence = await inspectContentApproval({
    workspaceRoot: roots.workspaceRoot,
    formalRoot: roots.formalRoot,
    projectId,
    approval: contentApproval,
    narrationLock,
  });

  return {
    schemaVersion: 'autovideo-formal-project-adoption/v1',
    inspectedAt: new Date().toISOString(),
    projectId,
    formalProjectPath: workspaceRelativePath(roots.workspaceRoot, roots.formalRoot),
    projectState: {
      path: workspaceRelativePath(roots.workspaceRoot, statePath),
      sha256: await sha256File(statePath),
      stage: state.stage ?? null,
      nextAction: state.nextAction ?? null,
    },
    workbenchInput: {
      id: projectId,
      title: state.inputs?.title || `Imported ${projectId}`,
      route: 'script',
      sourcePath: workspaceRelativePath(roots.workspaceRoot, narrationPath),
      platform: state.inputs?.platform || 'unspecified',
      targetDuration: state.inputs?.targetDuration || 'unspecified',
      voiceRoute: await readVoiceRoute(roots.formalRoot),
      audience: state.inputs?.audience || 'AI learners and knowledge-video viewers',
      targetOutcome: state.inputs?.rememberedOutcome || '',
      automation: 'critical-gates',
      publicationRights: 'needs-review',
      rightsNotes: 'Imported formal project: publication rights must be reviewed again in the workbench.',
      ratio: state.inputs?.ratio || productionManifest?.format?.ratio || templateLock.ratio || '16:9',
      resolution: productionManifest?.format
        ? `${productionManifest.format.width}x${productionManifest.format.height}`
        : templateLock.resolution || '1920x1080',
      fps: productionManifest?.format?.fps || templateLock.fps || 30,
    },
    narration: {
      path: workspaceRelativePath(roots.workspaceRoot, narrationPath),
      normalizedSha256: narrationSha,
      bytes: narration.length,
    },
    formalEvidence: {
      narrationLock: {
        path: workspaceRelativePath(roots.workspaceRoot, path.join(roots.formalRoot, 'NarrationLock.json')),
        sha256: await sha256File(path.join(roots.formalRoot, 'NarrationLock.json')),
      },
      templateLock: {
        path: workspaceRelativePath(roots.workspaceRoot, path.join(roots.formalRoot, 'template-lock.json')),
        sha256: await sha256File(path.join(roots.formalRoot, 'template-lock.json')),
      },
      productionManifest,
      audioHandoff,
      contentApproval: contentApprovalEvidence,
      planningBundle: planningBundle
        ? {
          planningDigestSha256: planningBundle.planningDigestSha256,
          bundleSha256: sha256(Buffer.from(JSON.stringify(planningBundle))),
          provenanceSha256: sha256(Buffer.from(JSON.stringify(planningBundle.provenance ?? {}))),
          sceneCount: planningBundle.storyboard.scenes.length,
          cueCount: planningBundle.shotManifest.shots.length,
        }
        : null,
    },
    artifacts,
    planningBundle,
    humanReviewPolicy: {
      importedApprovalStatus: 'evidence-only',
      forcedReviewStages: [...HUMAN_REVIEW_STAGE_IDS],
      publicationRights: 'needs-review',
      message: 'Formal receipts are retained as evidence. The workbench does not inherit human approvals, listening review, final Studio review, or publication clearance.',
    },
    warnings: planningBundle
      ? []
      : ['The formal project has no complete canonical planning bundle; visual planning must be generated or reconciled in the workbench.'],
  };
};
