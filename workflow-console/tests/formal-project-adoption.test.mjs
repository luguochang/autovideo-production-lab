import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const projectId = `formal-adopt-${process.pid}`;
const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const testDataRoot = path.join(consoleRoot, 'data', `formal-adoption-test-${process.pid}`);
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = testDataRoot;

const store = await import('../lib/project-store.mjs');
const {assertPlanningBundle} = await import('../lib/planning-compat.mjs');
const generators = await import('../lib/generators.mjs');
const {canonicalJsonSha256} = await import('../../tools/content-pipeline/content-regression.mjs');

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalizedNarrationSha256 = (value) => sha256(value.replaceAll('\r\n', '\n').trim());

const writeJson = async (relativePath, value) => {
  const target = path.join(formalRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};

const writeText = async (relativePath, value) => {
  const target = path.join(formalRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value, 'utf8');
  return target;
};

const relative = (filePath) => path.relative(formalRoot, filePath).replaceAll('\\', '/');
const hashFile = async (filePath) => sha256(await fs.readFile(filePath));

const makeFormalProject = async () => {
  const narration = '这是一段可以被接管的知识讲解口播。它会先登记来源和观点，再核对口播文字、目标时长与技术术语。配音确认后，系统会重新生成时间轴、字幕、分镜和画面，并在最终渲染前保留人工审核门。所有关键产物都必须通过哈希回执保持可追溯和可恢复。';
  const narrationSha = normalizedNarrationSha256(narration);
  await writeText('input/narration.txt', narration);
  await writeJson('project-state.json', {
    schemaVersion: 'autovideo-project-state/v1',
    projectId,
    stage: 'qa-passed',
    inputs: {
      ratio: '16:9',
      targetDuration: '30s',
      platform: 'douyin',
      audience: 'test audience',
      rememberedOutcome: 'adoption test',
    },
    gates: {
      task: {status: 'approved', approvedBy: 'test-user', approvedAt: '2026-07-22T00:00:00.000Z'},
      style: {status: 'approved', approvedBy: 'test-user', approvedAt: '2026-07-22T00:00:00.000Z'},
      finalPreview: {status: 'pending', approvedBy: null, approvedAt: null},
    },
  });
  await writeJson('NarrationLock.json', {
    schemaVersion: 'autovideo-narration-lock/v1',
    projectId,
    frozenPath: 'input/narration.txt',
    sourceSha256: narrationSha,
    normalizedSha256: narrationSha,
  });
  await writeJson('template-lock.json', {
    schemaVersion: 'autovideo-template-lock/v1',
    projectId,
    narrationSha256: narrationSha,
    styleId: 'modern-ip-host-explainer',
    styleVersion: '1.0.0',
    paletteId: 'light-apricot',
    ratio: '16:9',
    resolution: '1920x1080',
    fps: 30,
  });
  await writeJson('input/content-approval.json', {
    schemaVersion: 'autovideo-content-approval/v2',
    projectId,
    status: 'approved',
    approvalScope: 'human-review',
    approvedNarration: {sha256: narrationSha},
  });
  await writeJson('qa/pronunciation-approval.json', {
    schemaVersion: 'autovideo-pronunciation-approval/v1',
    projectId,
    status: 'approved',
    approvalScope: 'human-listening',
    approvedBy: 'formal-project-listener',
  });
  await writeJson('audio/narration.final.recipe.json', {
    recipe: 'E14 candidate 14',
    model: 'CosyVoice-300M-SFT',
  });
  const finalAudioPath = await writeText('audio/narration.final.wav', 'formal-audio');
  const alignmentPath = await writeJson('audio/alignment.json', {
    schemaVersion: 'autovideo-alignment-locked/v1',
    projectId,
    cues: [{id: 'cue-001', text: narration, start: 0, end: 30}],
  });
  await writeJson('audio-handoff.json', {
    schemaVersion: 'autovideo-audio-handoff/v2',
    projectId,
    status: 'approved',
    audio: {path: relative(finalAudioPath), sha256: await hashFile(finalAudioPath)},
    alignment: {path: relative(alignmentPath), sha256: await hashFile(alignmentPath)},
  });
  await writeText('STYLE_REVIEW.md', '# Existing style review\n');
  await writeText('production/hyperframes/index.html', '<main>existing composition</main>\n');
  await writeJson('qa/final-preview.json', {projectId, status: 'approved'});
  await writeJson('qa/hyperframes-check.json', {projectId, status: 'passed'});

  const storyboardPath = await writeJson('plan/storyboard.json', {
    schemaVersion: 'autovideo-storyboard/v1',
    projectId,
    scenes: [{id: 'scene-01', cueIds: ['cue-001']}],
  });
  const graphIrPath = await writeJson('plan/graph-ir.json', {
    schemaVersion: 'autovideo-graph-ir/v1',
    projectId,
    graphs: [],
  });
  const shotManifestPath = await writeJson('plan/shot-manifest.json', {
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId,
    cueCount: 1,
    shots: [{cueId: 'cue-001', sceneId: 'scene-01', narration, start: 0, end: 30, duration: 30}],
  });
  const narrationLockPath = path.join(formalRoot, 'NarrationLock.json');
  const templateLockPath = path.join(formalRoot, 'template-lock.json');
  const formalAlignmentPath = path.join(formalRoot, 'audio', 'alignment.json');
  await writeJson('plan/production-manifest.json', {
    schemaVersion: 'autovideo-production-manifest/v1',
    projectId,
    format: {ratio: '16:9', width: 1920, height: 1080, fps: 30},
    bindings: {
      narrationLock: {path: relative(narrationLockPath), sha256: await hashFile(narrationLockPath)},
      templateLock: {path: relative(templateLockPath), sha256: await hashFile(templateLockPath)},
      alignment: {path: relative(formalAlignmentPath), sha256: await hashFile(formalAlignmentPath)},
      storyboard: {path: relative(storyboardPath), sha256: await hashFile(storyboardPath)},
      shotManifest: {path: relative(shotManifestPath), sha256: await hashFile(shotManifestPath)},
      graphIr: {path: relative(graphIrPath), sha256: await hashFile(graphIrPath)},
    },
  });
};

before(async () => {
  await fs.rm(formalRoot, {recursive: true, force: true});
  await fs.mkdir(testDataRoot, {recursive: true});
  await makeFormalProject();
});

after(async () => {
  await fs.rm(formalRoot, {recursive: true, force: true});
  await fs.rm(testDataRoot, {recursive: true, force: true});
});

test('existing formal project is adopted as evidence without inheriting human or release approvals', async () => {
  const relativeFormalPath = path.relative(workspaceRoot, formalRoot).replaceAll('\\', '/');
  const inspected = await store.inspectFormalProjectForWorkbench({formalProjectPath: relativeFormalPath});
  assert.equal(inspected.projectId, projectId);
  assert.equal(inspected.workbenchInput.route, 'script');
  assert.equal(inspected.workbenchInput.voiceRoute, 'preset14');
  assert.equal(inspected.workbenchInput.publicationRights, 'needs-review');
  assert.equal(inspected.formalEvidence.planningBundle.cueCount, 1);
  assert.equal(inspected.formalEvidence.audioHandoff.audio.sha256, await hashFile(path.join(formalRoot, 'audio', 'narration.final.wav')));

  const project = await store.adoptFormalProject({formalProjectPath: relativeFormalPath});
  assert.equal(project.id, projectId);
  assert.equal(project.formalProjectPath, relativeFormalPath);
  assert.equal(project.stages['source-register'].status, 'approved');
  assert.equal(project.stages['source-register'].approvalScope, 'machine');
  assert.equal(project.stages['script-review'].status, 'not-started');
  assert.equal(project.stages['content-approval'].status, 'needs-review');
  assert.equal(project.stages['pronunciation-review'].status, 'needs-review');
  assert.equal(project.stages['pronunciation-review'].approvedBy, null);
  assert.equal(project.stages['pronunciation-review'].approvalScope, null);
  assert.equal(project.stages['voice-final'].status, 'needs-review');
  assert.equal(project.stages['style-probe'].status, 'needs-review');
  assert.equal(project.stages['final-preview'].status, 'needs-review');
  assert.equal(project.stages['narration-lock'].status, 'stale');
  assert.equal(project.stages['visual-plan'].status, 'stale');
  assert.equal(project.stages['full-production'].status, 'stale');
  assert.equal(project.publicationRights, 'needs-review');
  assert.equal(project.events[0].type, 'formal-project-adopted');
  assert.ok(project.importReceiptPath);

  const planningArtifact = await store.readArtifact(projectId, 'visual-plan');
  assertPlanningBundle(JSON.parse(planningArtifact.content), projectId);
  const suitabilityResult = await generators.generateStage(projectId, 'material-suitability');
  const suitability = JSON.parse(await fs.readFile(store.resolveWorkspacePath(suitabilityResult.artifactPath), 'utf8'));
  assert.equal(suitability.projectId, projectId);
  assert.equal(suitability.status, 'suitable');
  assert.match(suitability.sourceRegister.sha256, /^[a-f0-9]{64}$/u);
  await store.markStageGenerated(projectId, 'material-suitability', suitabilityResult);
  const evidenceResult = await generators.generateStage(projectId, 'evidence-ledger');
  const evidence = JSON.parse(await fs.readFile(store.resolveWorkspacePath(evidenceResult.artifactPath), 'utf8'));
  assert.equal(evidence.schemaVersion, 'autovideo-evidence/v2');
  assert.ok(evidence.claims.length > 0);
  assert.ok(evidence.claims.every((claim) => claim.claimKind === 'creator-opinion'));
  assert.ok(evidence.claims.every((claim) => claim.citations[0].locator.scheme === 'line-range'));
  await store.markStageGenerated(projectId, 'evidence-ledger', evidenceResult);
  await store.approveStage(projectId, 'evidence-ledger', 'evidence-reviewer');

  const spokenResult = await generators.generateStage(projectId, 'spoken-rewrite');
  await store.markStageGenerated(projectId, 'spoken-rewrite', spokenResult);
  const spoken = JSON.parse(await fs.readFile(store.resolveWorkspacePath(spokenResult.artifactPath), 'utf8'));
  assert.equal(spoken.sections[0].kind, 'creator-opinion');
  assert.equal(spoken.sections[0].targetSeconds, 30);
  assert.equal(spoken.sections[0].narration, await fs.readFile(path.join(formalRoot, 'input', 'narration.txt'), 'utf8'));

  const durationResult = await generators.generateStage(projectId, 'content-duration-fit');
  await store.markStageGenerated(projectId, 'content-duration-fit', durationResult);
  const durationFit = JSON.parse(await fs.readFile(store.resolveWorkspacePath(durationResult.artifactPath), 'utf8'));
  assert.equal(durationFit.status, 'passed');
  assert.equal(durationFit.targetSeconds, 30);
  assert.equal(durationFit.budgetSeconds, 30);

  const claimReviewResult = await generators.generateStage(projectId, 'claim-source-review');
  await store.markStageGenerated(projectId, 'claim-source-review', claimReviewResult);
  const claimReview = JSON.parse(await fs.readFile(store.resolveWorkspacePath(claimReviewResult.artifactPath), 'utf8'));
  assert.equal(claimReview.status, 'passed');
  assert.equal(claimReview.bindings.durationFitSha256, canonicalJsonSha256(durationFit));

  const scriptReviewResult = await generators.generateStage(projectId, 'script-review');
  await store.markStageGenerated(projectId, 'script-review', scriptReviewResult);
  await store.approveStage(projectId, 'script-review', 'script-reviewer');
  const approvalDraftResult = await generators.generateStage(projectId, 'content-approval');
  await store.markStageGenerated(projectId, 'content-approval', approvalDraftResult);
  const approvalResult = await generators.approveWorkbenchContent(
    await store.getProject(projectId),
    'content-reviewer',
  );
  assert.equal(approvalResult.alreadyApproved, false);
  assert.ok(approvalResult.supersededApprovalPath);
  await store.approveStage(projectId, 'content-approval', 'content-reviewer');
  const frozenApproval = JSON.parse(await fs.readFile(path.join(formalRoot, 'input', 'content-approval.json'), 'utf8'));
  assert.equal(frozenApproval.bindings.evidenceSha256, approvalResult.approval.bindings.evidenceSha256);
  assert.equal(frozenApproval.approvedBy, 'content-reviewer');
  assert.equal((await store.getProject(projectId)).stages['content-approval'].status, 'approved');
  const narrationLockResult = await generators.generateStage(projectId, 'narration-lock');
  await store.markStageGenerated(projectId, 'narration-lock', narrationLockResult);
  assert.equal(narrationLockResult.narrationLockRefreshed, true);
  await assert.doesNotReject(() => fs.access(path.join(workspaceRoot, narrationLockResult.narrationLockHistoryPath, 'RECEIPT.json')));
  const refreshedLock = JSON.parse(await fs.readFile(store.resolveWorkspacePath(narrationLockResult.artifactPath), 'utf8'));
  assert.equal(refreshedLock.normalizedSha256, normalizedNarrationSha256(await fs.readFile(path.join(formalRoot, 'input', 'script.approved.txt'), 'utf8')));
  assert.equal((await store.getProject(projectId)).stages['narration-lock'].status, 'approved');
  const templateLockResult = await generators.generateStage(projectId, 'template-lock');
  await store.markStageGenerated(projectId, 'template-lock', templateLockResult);
  const activeTemplateLock = JSON.parse(await fs.readFile(store.resolveWorkspacePath(templateLockResult.artifactPath), 'utf8'));
  assert.equal(activeTemplateLock.styleId, 'modern-ip-host-explainer');
  assert.equal(activeTemplateLock.paletteId, 'light-apricot');
  const pronunciationResult = await generators.generateStage(projectId, 'pronunciation-review');
  assert.equal(pronunciationResult.autoApprove, true);
  assert.equal(pronunciationResult.approvalScope, 'machine-no-subjective-terms');
  await store.markStageGenerated(projectId, 'pronunciation-review', pronunciationResult);
  assert.equal((await store.getProject(projectId)).stages['pronunciation-review'].status, 'approved');
  assert.equal((await store.getProject(projectId)).stages['pronunciation-review'].approvalScope, 'machine-no-subjective-terms');
  const productionManifest = JSON.parse(await fs.readFile(path.join(formalRoot, 'plan', 'production-manifest.json'), 'utf8'));
  productionManifest.bindings.narrationLock.sha256 = await hashFile(path.join(formalRoot, 'NarrationLock.json'));
  productionManifest.bindings.templateLock.sha256 = await hashFile(path.join(formalRoot, 'template-lock.json'));
  await writeJson('plan/production-manifest.json', productionManifest);
  for (const stageId of ['content-approval', 'pronunciation-review', 'voice-final', 'style-probe', 'final-preview']) {
    if (['content-approval', 'pronunciation-review'].includes(stageId)) continue;
    assert.notEqual((await store.getProject(projectId)).stages[stageId].status, 'approved');
    assert.equal((await store.getProject(projectId)).stages[stageId].approvedBy, null);
  }
});

test('formal evidence refresh imports new machine receipts without overwriting human or local edits', async () => {
  let project;
  try {
    project = await store.getProject(projectId);
  } catch {
    project = await store.adoptFormalProject({formalProjectPath: path.relative(workspaceRoot, formalRoot).replaceAll('\\', '/')});
  }
  project = await store.updateProject(projectId, {title: 'Local title must survive refresh'});
  project = await store.markStageGenerated(projectId, 'content-approval', {
    artifactPath: `hyperframes-workflow-kit/projects/${projectId}/input/content-approval.json`,
    artifactKind: 'json',
    summary: 'Reconciled the imported content approval after a local project setting change.',
  });
  project = await store.approveStage(projectId, 'content-approval', 'refresh-human');
  assert.equal(project.stages['content-approval'].approvedArtifactSha256, await hashFile(path.join(formalRoot, 'input', 'content-approval.json')));
  const customIdsBefore = new Set(Object.keys(project.customStages));
  project = await store.addCustomStage(projectId, {
    title: 'Local delivery note',
    description: 'Must survive formal evidence refresh.',
    afterStageId: 'package-export',
    toolId: 'codex-cli',
    humanGate: false,
  });
  const customStageId = Object.keys(project.customStages).find((id) => !customIdsBefore.has(id));
  project = await store.updateStage(projectId, customStageId, {notes: 'Keep this local configuration.'});
  await store.saveManualArtifact(projectId, 'style-probe', '# Local style decision\n', 'Keep the local style review while syncing formal evidence.');

  const alignmentValidationPath = await writeJson('captions/alignment-validation.json', {projectId, status: 'passed'});
  const srtPath = await writeText('captions/narration.zh-CN.srt', '1\n00:00:00,000 --> 00:00:01,000\n测试\n');
  await writeJson('qa/subtitle-qa.json', {
    schemaVersion: 'autovideo-subtitle-qa/v1',
    projectId,
    machine: {
      status: 'passed',
      alignmentSha256: await hashFile(path.join(formalRoot, 'audio', 'alignment.json')),
      validationSha256: await hashFile(alignmentValidationPath),
      srtSha256: await hashFile(srtPath),
    },
  });
  await writeJson('qa/visual-variety-qa.json', {
    schemaVersion: 'autovideo-visual-variety-qa/v1',
    projectId,
    machine: {status: 'passed'},
    bindings: {
      shotManifest: {sha256: await hashFile(path.join(formalRoot, 'plan', 'shot-manifest.json'))},
      storyboard: {sha256: await hashFile(path.join(formalRoot, 'plan', 'storyboard.json'))},
      graphIr: {sha256: await hashFile(path.join(formalRoot, 'plan', 'graph-ir.json'))},
    },
  });
  await writeText('STYLE_REVIEW.md', '# Updated formal style evidence\n');

  const first = await store.refreshFormalProjectEvidence(projectId);
  assert.equal(first.project.title, 'Local title must survive refresh');
  assert.equal(first.project.stages['content-approval'].status, 'approved');
  assert.equal(first.project.stages['content-approval'].approvedBy, 'refresh-human');
  assert.equal(first.project.stages['subtitle-qa'].status, 'stale');
  assert.equal(first.project.stages['visual-variety-qa'].status, 'stale');
  assert.equal(first.project.stages['style-probe'].status, 'stale');
  assert.equal(first.project.stages['style-probe'].lastResult, 'Preserved the workbench artifact instead of overwriting a local edit.');
  assert.ok(first.refresh.summary.imported.includes('subtitle-qa'));
  assert.ok(first.refresh.summary.imported.includes('visual-variety-qa'));
  assert.ok(first.refresh.summary.preservedLocalEdits.includes('style-probe'));
  assert.ok(first.project.formalProjectRefreshReceiptPath);
  assert.equal(first.project.stages[customStageId].notes, 'Keep this local configuration.');
  assert.equal(first.project.stageOrder.at(-1), customStageId);

  const localStyleArtifact = first.project.stages['style-probe'].artifactPath;
  const contentRevision = first.project.stages['content-approval'].revision;
  const secondStyleRefresh = await store.refreshFormalProjectEvidence(projectId);
  assert.equal(secondStyleRefresh.project.stages['style-probe'].artifactPath, localStyleArtifact);
  assert.ok(secondStyleRefresh.refresh.summary.unchanged.includes('style-probe'));
  assert.equal(secondStyleRefresh.project.stages['content-approval'].revision, contentRevision);
  assert.equal(secondStyleRefresh.project.stages['content-approval'].approvedBy, 'refresh-human');

  const contentApproval = JSON.parse(await fs.readFile(path.join(formalRoot, 'input', 'content-approval.json'), 'utf8'));
  await writeJson('input/content-approval.json', {...contentApproval, formalEvidenceRevision: 2});
  const changed = await store.refreshFormalProjectEvidence(projectId);
  assert.equal(changed.project.stages['content-approval'].status, 'stale');
  assert.equal(changed.project.stages['content-approval'].approvedBy, null);
  assert.equal(changed.project.stages['content-approval'].approvedArtifactSha256, null);
  assert.ok(changed.refresh.summary.changed.includes('content-approval'));
  assert.equal(changed.project.stages['subtitle-qa'].status, 'stale');

  await writeText('captions/narration.zh-CN.srt', '1\n00:00:00,000 --> 00:00:01,000\n已变化\n');
  await assert.rejects(
    () => store.refreshFormalProjectEvidence(projectId),
    /Subtitle QA SRT binding is stale/i,
  );
});

test('adoption only accepts a direct formal-project child in the current workspace', async () => {
  await assert.rejects(
    () => store.inspectFormalProjectForWorkbench({formalProjectPath: 'hyperframes-workflow-kit'}),
    /direct child|formal project/i,
  );
});
