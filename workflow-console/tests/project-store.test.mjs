import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(consoleRoot, '..');
const testDataRoot = path.join(consoleRoot, 'data', `test-${process.pid}`);
process.env.AUTOVIDEO_CONSOLE_DATA_ROOT = testDataRoot;

const store = await import('../lib/project-store.mjs');
const generators = await import('../lib/generators.mjs');
const finalReview = await import('../lib/final-review.mjs');
const {workflowStages} = await import('../workflow-catalog.mjs');

const input = (id) => ({
  id,
  title: `Test ${id}`,
  route: 'materials',
  sourcePath: 'demo/demoText.txt',
  platform: 'local-test',
  targetDuration: '60s',
  voiceRoute: 'preset14',
  audience: 'test audience',
  targetOutcome: 'test the state machine',
  automation: 'critical-gates',
  publicationRights: 'needs-review',
  rightsNotes: '',
});

before(async () => {
  await fs.mkdir(testDataRoot, {recursive: true});
});

after(async () => {
  const resolved = path.resolve(testDataRoot);
  assert.ok(resolved.startsWith(path.join(consoleRoot, 'data') + path.sep));
  await fs.rm(resolved, {recursive: true, force: true});
});

test('project input changes invalidate the correct dependency range', async () => {
  const projectId = 'invalidate-input';
  await store.createProject(input(projectId));
  const sourcePath = await store.saveArtifact(projectId, 'source-register', 'sources.json', {sources: []}, 'json');
  await store.markStageGenerated(projectId, 'source-register', {artifactPath: sourcePath, artifactKind: 'json'});
  assert.equal((await store.getProject(projectId)).stages['source-register'].status, 'approved');

  const changed = await store.updateProject(projectId, {sourcePath: 'demo'});
  assert.equal(changed.stages['source-register'].status, 'stale');
  assert.match(changed.stages['source-register'].lastError, /source changed/i);
});

test('switching back to preset14 invalidates pronunciation and voice candidate stages', async () => {
  const projectId = 'voice-route-pronunciation';
  await store.createProject({...input(projectId), route: 'audio', voiceRoute: 'original'});
  const pronunciationPath = await store.saveArtifact(projectId, 'pronunciation-review', 'approval.json', {ok: true}, 'json');
  await store.markStageGenerated(projectId, 'pronunciation-review', {
    artifactPath: pronunciationPath, artifactKind: 'json', autoApprove: true, approvalScope: 'machine-no-subjective-terms',
  });
  const voicePath = await store.saveArtifact(projectId, 'voice-final', 'candidate.json', {ok: true}, 'json');
  await store.markStageGenerated(projectId, 'voice-final', {artifactPath: voicePath, artifactKind: 'json', preserveFinalAudio: true});
  const changed = await store.updateProject(projectId, {voiceRoute: 'preset14'});
  assert.equal(changed.stages['pronunciation-review'].status, 'stale');
  assert.equal(changed.stages['voice-final'].status, 'stale');
});

test('execution setting changes invalidate the stage and generated downstream work', async () => {
  const projectId = 'invalidate-config';
  await store.createProject(input(projectId));
  const diagramPath = await store.saveArtifact(projectId, 'diagram-assets', 'graph-layout.json', {diagrams: []}, 'json');
  await store.markStageGenerated(projectId, 'diagram-assets', {artifactPath: diagramPath, artifactKind: 'json'});
  const stylePath = await store.saveArtifact(projectId, 'style-probe', 'STYLE_REVIEW.md', '# probe\n', 'text');
  await store.markStageGenerated(projectId, 'style-probe', {artifactPath: stylePath, artifactKind: 'text'});

  const changed = await store.updateStage(projectId, 'diagram-assets', {promptOverride: 'Use a clearer process layout.'});
  assert.equal(changed.stages['diagram-assets'].status, 'stale');
  assert.equal(changed.stages['style-probe'].status, 'stale');
});

test('a stale artifact cannot be approved without reconciliation', async () => {
  const projectId = 'stale-approval';
  await store.createProject(input(projectId));
  const evidencePath = await store.saveArtifact(projectId, 'evidence-ledger', 'evidence.json', {claims: []}, 'json');
  await store.markStageGenerated(projectId, 'evidence-ledger', {artifactPath: evidencePath, artifactKind: 'json'});
  const stylePath = await store.saveArtifact(projectId, 'style-probe', 'STYLE_REVIEW.md', '# probe\n', 'text');
  await store.markStageGenerated(projectId, 'style-probe', {artifactPath: stylePath, artifactKind: 'text'});
  await store.approveStage(projectId, 'style-probe', 'test-reviewer');

  await store.saveManualArtifact(projectId, 'evidence-ledger', '{"claims": []}\n', 'test override');
  assert.equal((await store.getProject(projectId)).stages['style-probe'].status, 'stale');
  await assert.rejects(() => store.approveStage(projectId, 'style-probe', 'test-reviewer'), /stale/i);
});

test('manual JSON edits are validated, keep their type, and archive the previous revision', async () => {
  const projectId = 'json-history';
  await store.createProject(input(projectId));
  const artifactPath = await store.saveArtifact(projectId, 'evidence-ledger', 'evidence.json', {claims: [{id: 'v1'}]}, 'json');
  await store.markStageGenerated(projectId, 'evidence-ledger', {artifactPath, artifactKind: 'json'});
  await assert.rejects(() => store.saveManualArtifact(projectId, 'evidence-ledger', '{broken', 'invalid edit'), /invalid/i);

  const project = await store.saveManualArtifact(projectId, 'evidence-ledger', '{"claims":[{"id":"v2"}]}\n', 'valid edit');
  assert.equal(project.stages['evidence-ledger'].artifactKind, 'json');
  assert.equal(project.stages['evidence-ledger'].status, 'needs-review');
  assert.equal(project.stages['evidence-ledger'].approvedAt, null);
  const historyDir = path.join(testDataRoot, 'projects', projectId, 'artifacts', 'evidence-ledger', '.history');
  assert.ok((await fs.readdir(historyDir)).length >= 1);
});

test('graph layout edits may change coordinates but cannot drift from Graph IR identities', async () => {
  const projectId = 'graph-layout-manual-validation';
  const formalRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
  const graphIr = {
    schemaVersion: 'autovideo-graph-ir/v1',
    projectId,
    graphs: [{
      id: 'graph-scene-01',
      nodes: [
        {id: 'node-a', label: 'A', sourceCueIds: ['cue-001']},
        {id: 'node-b', label: 'B', sourceCueIds: ['cue-001']},
      ],
      edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b'}],
    }],
  };
  const layout = {
    schemaVersion: 'autovideo-graph-layout/v1',
    projectId,
    generatedAt: '2026-07-21T00:00:00.000Z',
    planning: {workbenchRevision: 1},
    diagrams: [{
      graphId: 'graph-scene-01',
      beatId: 'graph-scene-01',
      source: 'graph-ir',
      layout: {
        id: 'graph-scene-01', x: 0, y: 0, width: 520, height: 120,
        children: [
          {id: 'node-a', x: 12, y: 12, width: 220, height: 96},
          {id: 'node-b', x: 288, y: 12, width: 220, height: 96},
        ],
        edges: [{id: 'edge-a-b', sources: ['node-a'], targets: ['node-b']}],
      },
    }],
  };

  try {
    await store.createProject(input(projectId));
    await fs.mkdir(path.join(formalRoot, 'plan'), {recursive: true});
    await fs.writeFile(path.join(formalRoot, 'plan', 'graph-ir.json'), `${JSON.stringify(graphIr, null, 2)}\n`, 'utf8');
    const artifactPath = await store.saveArtifact(projectId, 'diagram-assets', 'graph-layout.json', layout, 'json');
    await store.markStageGenerated(projectId, 'diagram-assets', {artifactPath, artifactKind: 'json'});

    const moved = structuredClone(layout);
    moved.diagrams[0].layout.children[1].x = 340;
    const project = await store.saveManualArtifact(projectId, 'diagram-assets', `${JSON.stringify(moved, null, 2)}\n`, 'move node-b');
    assert.equal(project.stages['diagram-assets'].status, 'needs-review');

    const invalid = structuredClone(moved);
    invalid.diagrams[0].layout.children[1].id = 'node-c';
    await assert.rejects(
      () => store.saveManualArtifact(projectId, 'diagram-assets', `${JSON.stringify(invalid, null, 2)}\n`, 'invalid node'),
      /missing Graph IR node node-b|unknown node node-c/i,
    );
  } finally {
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});

test('production object overrides invalidate full production and every generated downstream stage', async () => {
  const projectId = 'production-override-stale';
  await store.createProject(input(projectId));
  await store.markStageGenerated(projectId, 'full-production', {summary: 'compiled'});
  await store.markStageGenerated(projectId, 'qa-review', {summary: 'checked'});
  await store.markStageGenerated(projectId, 'final-preview', {summary: 'previewed'});
  await store.markStageGenerated(projectId, 'render-deliver', {summary: 'rendered'});

  const changed = await store.recordProductionOverrideChange(projectId, {
    overrideId: 'override-001-text',
    action: 'saved',
    reason: 'Adjust one screen label.',
  });
  assert.equal(changed.stages['full-production'].status, 'stale');
  assert.equal(changed.stages['qa-review'].status, 'stale');
  assert.equal(changed.stages['final-preview'].status, 'stale');
  assert.equal(changed.stages['render-deliver'].status, 'stale');
  assert.equal(changed.stages['visual-plan'].status, 'not-started');
  assert.equal(changed.stages['full-production'].overrides.at(-1).id, 'override-001-text');
  assert.match(changed.stages['full-production'].lastError, /saved production override/i);
});

test('required gates cannot be disabled', async () => {
  const projectId = 'required-gates';
  await store.createProject(input(projectId));
  for (const stageId of ['template-lock', 'rights-clearance', 'audio-handoff', 'composition-readiness', 'delivery-qa', 'package-export']) {
    await assert.rejects(() => store.updateStage(projectId, stageId, {enabled: false}), /required gate/i);
  }
});

test('persistent jobs can be listed, canceled before start, and requeued after restart', async () => {
  const projectId = 'persistent-jobs';
  await store.createProject(input(projectId));

  const canceledJob = {
    id: 'job-cancel-before-start',
    projectId,
    stageId: 'source-register',
    status: 'queued',
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
  };
  await store.createJobRecord(canceledJob);
  await store.markStageRunning(projectId, canceledJob.stageId, canceledJob.id);
  assert.equal((await store.listJobRecords({projectId, statuses: ['queued']}))[0].id, canceledJob.id);
  assert.equal((await store.requestJobCancellation(canceledJob.id)).status, 'canceled');
  assert.equal((await store.getProject(projectId)).stages[canceledJob.stageId].status, 'failed');

  const interruptedJob = {
    ...canceledJob,
    id: 'job-restart-resume',
    stageId: 'evidence-ledger',
    status: 'running',
    createdAt: '2026-01-02T00:00:00.000Z',
    startedAt: '2026-01-02T00:00:01.000Z',
  };
  await store.createJobRecord(interruptedJob);
  await store.markStageRunning(projectId, interruptedJob.stageId, interruptedJob.id);
  const recovery = await store.recoverInterruptedJobs();
  const resumed = recovery.jobs.find((job) => job.id === interruptedJob.id);
  assert.equal(resumed.status, 'queued');
  assert.equal(resumed.resumeCount, 1);
  assert.equal((await store.getProject(projectId)).stages[interruptedJob.stageId].jobId, interruptedJob.id);

  await store.updateJobRecord(interruptedJob.id, {status: 'failed', finishedAt: '2026-01-02T00:01:00.000Z'});
  await store.markStageFailed(projectId, interruptedJob.stageId, 'test cleanup');
});

test('production contract stages are ordered before full production', () => {
  const order = workflowStages.map((stage) => stage.id);
  const index = (stageId) => order.indexOf(stageId);
  assert.ok(index('evidence-ledger') < index('content-outline'));
  assert.ok(index('content-outline') < index('script-draft'));
  assert.ok(index('script-draft') < index('spoken-rewrite'));
  assert.ok(index('spoken-rewrite') < index('content-duration-fit'));
  assert.ok(index('content-duration-fit') < index('claim-source-review'));
  assert.ok(index('narration-lock') < index('template-lock'));
  assert.ok(index('audio-align') < index('rights-clearance'));
  assert.ok(index('audio-align') < index('subtitle-qa'));
  assert.ok(index('subtitle-qa') < index('rights-clearance'));
  assert.ok(index('rights-clearance') < index('audio-handoff'));
  assert.ok(index('audio-handoff') < index('visual-plan'));
  assert.ok(index('visual-plan') < index('diagram-assets'));
  assert.ok(index('diagram-assets') < index('style-probe'));
  assert.ok(index('style-probe') < index('visual-variety-qa'));
  assert.ok(index('visual-variety-qa') < index('composition-readiness'));
  assert.ok(index('audio-handoff') < index('composition-readiness'));
  assert.ok(index('style-probe') < index('composition-readiness'));
  assert.ok(index('composition-readiness') < index('full-production'));
  assert.ok(index('retrospective') < index('package-export'));
});

test('legacy project order migrates to the catalog contract without losing custom anchors', () => {
  const legacyOrder = workflowStages
    .map((stage) => stage.id)
    .filter((stageId) => ![
      'content-outline', 'script-draft', 'content-duration-fit',
      'template-lock', 'audio-handoff', 'composition-readiness', 'rights-clearance',
    ].includes(stageId));
  legacyOrder.splice(legacyOrder.indexOf('style-probe') + 1, 0, 'custom-review');
  legacyOrder.splice(legacyOrder.indexOf('qa-review') + 1, 0, 'rights-clearance');
  const migrated = store.mergeCatalogStageOrder({
    stageOrder: legacyOrder,
    customStages: {'custom-review': {id: 'custom-review'}},
  });
  assert.ok(migrated.indexOf('narration-lock') < migrated.indexOf('template-lock'));
  assert.ok(migrated.indexOf('evidence-ledger') < migrated.indexOf('content-outline'));
  assert.ok(migrated.indexOf('content-outline') < migrated.indexOf('script-draft'));
  assert.ok(migrated.indexOf('script-draft') < migrated.indexOf('spoken-rewrite'));
  assert.ok(migrated.indexOf('spoken-rewrite') < migrated.indexOf('content-duration-fit'));
  assert.ok(migrated.indexOf('content-duration-fit') < migrated.indexOf('claim-source-review'));
  assert.ok(migrated.indexOf('audio-align') < migrated.indexOf('rights-clearance'));
  assert.ok(migrated.indexOf('rights-clearance') < migrated.indexOf('audio-handoff'));
  assert.ok(migrated.indexOf('audio-handoff') < migrated.indexOf('visual-plan'));
  assert.ok(migrated.indexOf('style-probe') < migrated.indexOf('custom-review'));
  assert.ok(migrated.indexOf('composition-readiness') < migrated.indexOf('full-production'));
});

test('voice-final rejects generic technical and human-listening approvals', async () => {
  const projectId = 'voice-approval-scope';
  await store.createProject(input(projectId));
  const artifactPath = await store.saveArtifact(projectId, 'voice-final', 'voice.recipe.json', {ok: true}, 'json');
  await store.markStageGenerated(projectId, 'voice-final', {artifactPath, artifactKind: 'json'});
  await assert.rejects(() => store.approveStage(projectId, 'voice-final', 'reviewer'), /dedicated A\/B candidate/i);
  await assert.rejects(
    () => store.approveStage(projectId, 'voice-final', 'technical-reviewer', {approvalScope: 'technical-only'}),
    /dedicated A\/B candidate/i,
  );
  await assert.rejects(() => store.upgradeVoiceApproval(projectId, 'listener'), /dedicated A\/B candidate/i);
});

test('final review requires all five checks and rejects stale preview or composition digests', async () => {
  const projectId = 'final-review-contract';
  const formalRoot = path.join(store.workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
  const compositionRoot = path.join(formalRoot, 'production', 'hyperframes');
  const qaDir = path.join(formalRoot, 'qa');
  const previewPath = path.join(qaDir, 'final-preview.json');
  const project = {
    id: projectId,
    stages: {
      'qa-review': {
        status: 'approved',
      },
      'final-preview': {
        status: 'approved',
        approvalScope: 'internal-autonomous-review',
        approvedBy: 'autonomous-reviewer',
        approvedAt: '2026-01-01T00:00:00.000Z',
        previewStartedAt: '2026-01-01T00:00:00.000Z',
        previewUrl: 'http://127.0.0.1:3456/#project/hyperframes',
      },
    },
  };
  const completeChecklist = {
    fullTimeline: true,
    audioVisualSync: true,
    captions: true,
    visuals: true,
    content: true,
  };
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await fs.mkdir(compositionRoot, {recursive: true});
    await fs.mkdir(qaDir, {recursive: true});
    await fs.writeFile(path.join(compositionRoot, 'hyperframes.json'), '{"project":"test"}\n', 'utf8');
    await fs.writeFile(path.join(compositionRoot, 'index.html'), '<main>stable</main>\n', 'utf8');
    const composition = await store.hashDirectoryManifest(compositionRoot);
    const previewReceipt = {
      schemaVersion: 'autovideo-final-preview/v2',
      projectId,
      previewStartedAt: project.stages['final-preview'].previewStartedAt,
      compositionDigest: composition.digest,
      fileCount: composition.files.length,
      publicReleaseBlocked: true,
    };
    await fs.writeFile(previewPath, `${JSON.stringify(previewReceipt, null, 2)}\n`, 'utf8');

    assert.equal(finalReview.finalReviewIsReady({...completeChecklist, content: false}), false);
    const progress = await finalReview.saveFinalReview(project, {
      checklist: {...completeChecklist, content: false},
      notes: 'Content review remains.',
    }, 'test-reviewer');
    assert.equal(progress.status, 'in-progress');
    const ready = await finalReview.saveFinalReview(project, {
      checklist: completeChecklist,
      notes: 'Full timeline reviewed.',
    }, 'test-reviewer');
    assert.equal(ready.status, 'ready-for-approval');
    const view = await finalReview.buildFinalReview(project);
    assert.deepEqual(Object.keys(view), ['schemaVersion', 'projectId', 'composition', 'preview', 'approval', 'review']);
    assert.deepEqual(Object.keys(view.composition), ['digest', 'fileCount']);
    assert.deepEqual(Object.keys(view.preview), ['startedAt', 'url']);
    assert.deepEqual(Object.keys(view.approval), ['scope', 'approvedBy', 'approvedAt']);
    assert.deepEqual(Object.keys(view.review), [
      'status', 'checklist', 'notes', 'reviewedBy', 'updatedAt', 'readyForApproval',
    ]);
    assert.equal(view.review.readyForApproval, true);
    assert.equal(view.composition.digest, composition.digest);
    assert.equal(view.preview.url, project.stages['final-preview'].previewUrl);
    await assert.doesNotReject(() => finalReview.assertFinalReviewReady(project));

    await fs.writeFile(previewPath, `${JSON.stringify({...previewReceipt, notes: 'changed'}, null, 2)}\n`, 'utf8');
    await assert.rejects(() => finalReview.assertFinalReviewReady(project), /preview receipt changed/i);
    await finalReview.saveFinalReview(project, {checklist: completeChecklist, notes: ''}, 'test-reviewer');
    await fs.writeFile(path.join(compositionRoot, 'index.html'), '<main>changed</main>\n', 'utf8');
    await assert.rejects(() => finalReview.assertFinalReviewReady(project), /composition changed/i);

    project.stages['final-preview'].approvalScope = 'human-review';
    await assert.rejects(
      () => finalReview.saveFinalReview(project, {checklist: completeChecklist, notes: ''}, 'test-reviewer'),
      /approval is frozen/i,
    );
  } finally {
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});

test('human final-review upgrade preserves production and only refreshes delivery metadata', async () => {
  const projectId = 'final-review-upgrade';
  const formalRoot = path.join(store.workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
  const compositionRoot = path.join(formalRoot, 'production', 'hyperframes');
  await fs.rm(formalRoot, {recursive: true, force: true});
  try {
    await fs.mkdir(compositionRoot, {recursive: true});
    await fs.writeFile(path.join(compositionRoot, 'hyperframes.json'), '{"project":"test"}\n', 'utf8');
    await fs.writeFile(path.join(compositionRoot, 'index.html'), '<main>stable</main>\n', 'utf8');
    await store.createProject(input(projectId));

    for (const stageId of ['full-production', 'qa-review']) {
      const artifactPath = await store.saveArtifact(projectId, stageId, `${stageId}.json`, {ok: true}, 'json');
      await store.markStageGenerated(projectId, stageId, {artifactPath, artifactKind: 'json'});
    }
    const previewRequestPath = await store.saveArtifact(projectId, 'final-preview', 'preview-request.json', {ok: true}, 'json');
    await store.markStageGenerated(projectId, 'final-preview', {artifactPath: previewRequestPath, artifactKind: 'json'});
    await store.recordPreviewStarted(projectId, 'http://127.0.0.1:3456/#project/hyperframes');
    await store.approveStage(projectId, 'final-preview', 'codex-autonomous-internal-review');

    for (const stageId of ['render-deliver', 'delivery-qa']) {
      const artifactPath = await store.saveArtifact(projectId, stageId, `${stageId}.json`, {ok: true}, 'json');
      await store.markStageGenerated(projectId, stageId, {artifactPath, artifactKind: 'json'});
    }
    const retrospectivePath = await store.saveArtifact(projectId, 'retrospective', 'RETROSPECTIVE.md', '# review\n', 'text');
    await store.markStageGenerated(projectId, 'retrospective', {artifactPath: retrospectivePath, artifactKind: 'text'});
    await store.approveStage(projectId, 'retrospective', 'reviewer');

    const upgraded = await store.upgradeFinalPreviewApproval(projectId, 'human-reviewer');
    assert.equal(upgraded.stages['final-preview'].approvalScope, 'human-review');
    assert.equal(upgraded.stages['final-preview'].approvedBy, 'human-reviewer');
    assert.equal(upgraded.stages['full-production'].status, 'approved');
    assert.equal(upgraded.stages['qa-review'].status, 'approved');
    assert.equal(upgraded.stages['render-deliver'].status, 'approved');
    assert.equal(upgraded.stages['delivery-qa'].status, 'stale');
    assert.equal(upgraded.stages.retrospective.status, 'stale');
  } finally {
    await fs.rm(formalRoot, {recursive: true, force: true});
  }
});

test('candidate promotion approves voice and invalidates every generated timing-dependent downstream stage', async () => {
  const projectId = 'voice-candidate-promotion-state';
  await store.createProject(input(projectId));
  const voicePath = await store.saveArtifact(projectId, 'voice-final', 'voice-candidate.json', {ok: true}, 'json');
  await store.markStageGenerated(projectId, 'voice-final', {artifactPath: voicePath, artifactKind: 'json'});
  for (const stageId of ['audio-align', 'subtitle-qa', 'subtitle-review', 'visual-plan', 'full-production', 'qa-review', 'final-preview', 'render-deliver', 'delivery-qa', 'retrospective']) {
    const artifactPath = await store.saveArtifact(projectId, stageId, `${stageId}.json`, {ok: true}, 'json');
    await store.markStageGenerated(projectId, stageId, {artifactPath, artifactKind: 'json'});
  }
  const receiptPath = await store.saveArtifact(projectId, 'voice-final', 'voice-promotion.json', {selectedCandidateId: 'candidate-002'}, 'json');
  const receiptSha256 = await store.sha256File(store.resolveWorkspacePath(receiptPath));
  const promoted = await store.approveVoiceCandidatePromotion(projectId, 'listener', {
    artifactPath: receiptPath,
    artifactSha256: receiptSha256,
    selectedCandidateId: 'candidate-002',
  });
  assert.equal(promoted.stages['voice-final'].status, 'approved');
  assert.equal(promoted.stages['voice-final'].approvalScope, 'human-listening');
  assert.equal(promoted.stages['voice-final'].approvedBy, 'listener');
  for (const stageId of ['audio-align', 'subtitle-qa', 'subtitle-review', 'visual-plan', 'full-production', 'qa-review', 'final-preview', 'render-deliver', 'delivery-qa', 'retrospective']) {
    assert.equal(promoted.stages[stageId].status, 'stale', `${stageId} must become stale after final WAV promotion`);
  }
});

test('public audio requires human listening while internal-only accepts technical approval', () => {
  const technical = {approvedBy: 'technical-reviewer', approvalScope: 'technical-only'};
  const listened = {approvedBy: 'human-reviewer', approvalScope: 'human-listening'};
  assert.equal(generators.assertAudioApprovalForScope(technical, 'internal-only'), 'technical-only');
  assert.throws(() => generators.assertAudioApprovalForScope(technical, 'cleared'), /human-listening/i);
  assert.equal(generators.assertAudioApprovalForScope(listened, 'cleared'), 'human-listening');
  assert.equal(generators.resolveAudioApprovalScope({approvedBy: 'legacy'}), 'technical-only');
});

test('delivery release status keeps technical and autonomous evidence internal-only', () => {
  const result = generators.deriveDeliveryReleaseStatus({
    project: {
      publicationRights: 'internal-only',
      stages: {
        'voice-final': {status: 'approved', approvalScope: 'technical-only'},
        'final-preview': {status: 'approved', approvalScope: 'internal-autonomous-review'},
        'rights-clearance': {status: 'approved'},
      },
    },
    delivery: {releaseScope: 'internal-only', publicReleaseBlocked: true},
    mediaOk: true,
    subtitleValidationPassed: true,
    hyperframesCheckValid: true,
    visualReviewValid: true,
    audioApproval: {
      approvedBy: 'technical-reviewer',
      approvalScope: 'technical-only',
      technicalApproval: {status: 'passed'},
      humanListening: {status: 'not-performed'},
    },
    audioApprovalValid: true,
    previewReceipt: {approvedBy: 'codex-autonomous-internal-review', compositionDigest: 'stable'},
    previewReceiptValid: true,
    rightsReceipt: {declaration: 'internal-only', items: [{id: 'voice', status: 'needs-review'}]},
    rightsReceiptValid: true,
  });

  assert.equal(result.okForInternalReview, true);
  assert.equal(result.okForPublicRelease, false);
  assert.equal(result.publicReleaseBlocked, true);
  assert.equal(result.gates.humanListening.status, 'not-performed');
  assert.equal(result.gates.finalPreview.status, 'approved-internal-review');
  assert.ok(result.releaseBlockers.some((item) => /public-release master/i.test(item)));
  assert.ok(result.releaseBlockers.some((item) => /publication rights/i.test(item)));
});

test('delivery release status allows a current fully human-approved public master', () => {
  const result = generators.deriveDeliveryReleaseStatus({
    project: {
      publicationRights: 'cleared',
      stages: {
        'pronunciation-review': {status: 'approved', approvalScope: 'human-review'},
        'voice-final': {status: 'approved', approvalScope: 'human-listening'},
        'subtitle-review': {status: 'approved', approvalScope: 'human-review'},
        'screen-text-review': {status: 'approved', approvalScope: 'human-review'},
        'final-preview': {status: 'approved', approvalScope: 'human-review'},
        'rights-clearance': {status: 'approved'},
      },
    },
    delivery: {releaseScope: 'public-release', publicReleaseBlocked: false},
    mediaOk: true,
    subtitleValidationPassed: true,
    hyperframesCheckValid: true,
    visualReviewValid: true,
    audioApproval: {
      approvedBy: 'listener',
      approvalScope: 'human-listening',
      technicalApproval: {status: 'passed'},
      humanListening: {status: 'approved', reviewer: 'listener', reviewPath: 'audio/listening-review.json'},
    },
    audioApprovalValid: true,
    listeningReviewValid: true,
    previewReceipt: {approvedBy: 'final-reviewer', approvalScope: 'human-review', compositionDigest: 'stable'},
    previewReceiptValid: true,
    humanFinalReviewValid: true,
    rightsReceipt: {
      declaration: 'cleared',
      items: [
        {id: 'voice', status: 'cleared'},
        {id: 'runtime', status: 'not-applicable'},
      ],
    },
    rightsReceiptValid: true,
  });

  assert.equal(result.okForInternalReview, true);
  assert.equal(result.okForPublicRelease, true);
  assert.equal(result.publicReleaseBlocked, false);
  assert.deepEqual(result.releaseBlockers, []);
  assert.equal(result.gates.humanListening.status, 'approved');
  assert.equal(result.gates.finalPreview.status, 'approved-human-review');
  assert.equal(result.gates.publicationRights.status, 'cleared');
});

test('delivery release status keeps a user-directed pronunciation listening skip internal-only', () => {
  const result = generators.deriveDeliveryReleaseStatus({
    project: {
      publicationRights: 'cleared',
      stages: {
        'pronunciation-review': {status: 'approved', approvalScope: 'user-directed-selection-no-listening'},
        'voice-final': {status: 'approved', approvalScope: 'human-listening'},
        'subtitle-review': {status: 'approved', approvalScope: 'human-review'},
        'screen-text-review': {status: 'approved', approvalScope: 'human-review'},
        'final-preview': {status: 'approved', approvalScope: 'human-review'},
        'rights-clearance': {status: 'approved'},
      },
    },
    delivery: {releaseScope: 'public-release', publicReleaseBlocked: false},
    mediaOk: true,
    subtitleValidationPassed: true,
    hyperframesCheckValid: true,
    visualReviewValid: true,
    audioApproval: {
      approvedBy: 'listener',
      approvalScope: 'human-listening',
      technicalApproval: {status: 'passed'},
      humanListening: {status: 'approved', reviewer: 'listener', reviewPath: 'audio/listening-review.json'},
    },
    audioApprovalValid: true,
    listeningReviewValid: true,
    previewReceipt: {approvedBy: 'final-reviewer', approvalScope: 'human-review', compositionDigest: 'stable'},
    previewReceiptValid: true,
    humanFinalReviewValid: true,
    rightsReceipt: {declaration: 'cleared', items: [{id: 'voice', status: 'cleared'}]},
    rightsReceiptValid: true,
  });

  assert.equal(result.okForInternalReview, true);
  assert.equal(result.okForPublicRelease, false);
  assert.equal(result.publicReleaseBlocked, true);
  assert.equal(result.gates.pronunciationReview.publicReleaseEligible, false);
  assert.ok(result.releaseBlockers.some((item) => /Pronunciation review/i.test(item)));
});

test('delivery release status rejects a stale HyperFrames check receipt', () => {
  const result = generators.deriveDeliveryReleaseStatus({
    project: {
      publicationRights: 'internal-only',
      stages: {
        'voice-final': {status: 'approved', approvalScope: 'technical-only'},
        'final-preview': {status: 'approved', approvalScope: 'internal-autonomous-review'},
      },
    },
    delivery: {releaseScope: 'internal-only', publicReleaseBlocked: true},
    mediaOk: true,
    subtitleValidationPassed: true,
    hyperframesCheckValid: false,
    audioApproval: {approvedBy: 'technical-reviewer', technicalApproval: {status: 'passed'}},
    audioApprovalValid: true,
    previewReceipt: {approvedBy: 'internal-reviewer'},
    previewReceiptValid: true,
  });
  assert.equal(result.okForInternalReview, false);
  assert.equal(result.gates.hyperframesCheck.status, 'stale-or-invalid');
  assert.ok(result.releaseBlockers.some((item) => /strict-check receipt/i.test(item)));
});

test('composition digest ignores Studio caches and timestamped receipts', async () => {
  const root = path.join(testDataRoot, 'stable-composition-digest');
  await fs.mkdir(path.join(root, '.thumbnails'), {recursive: true});
  await fs.mkdir(path.join(root, '.waveform-cache'), {recursive: true});
  await fs.mkdir(path.join(root, 'data'), {recursive: true});
  await fs.writeFile(path.join(root, 'index.html'), '<main>stable</main>\n', 'utf8');
  await fs.writeFile(path.join(root, 'meta.json'), '{"createdAt":"first"}\n', 'utf8');
  await fs.writeFile(path.join(root, 'data', 'composition-build.json'), '{"generatedAt":"first"}\n', 'utf8');
  await fs.writeFile(path.join(root, '.thumbnails', 'preview.jpg'), 'first', 'utf8');
  await fs.writeFile(path.join(root, '.waveform-cache', 'audio.json'), '{"first":true}\n', 'utf8');
  const first = await store.hashDirectoryManifest(root);

  await fs.writeFile(path.join(root, 'meta.json'), '{"createdAt":"second"}\n', 'utf8');
  await fs.writeFile(path.join(root, 'data', 'composition-build.json'), '{"generatedAt":"second"}\n', 'utf8');
  await fs.writeFile(path.join(root, '.thumbnails', 'preview.jpg'), 'second', 'utf8');
  await fs.writeFile(path.join(root, '.waveform-cache', 'audio.json'), '{"second":true}\n', 'utf8');
  const second = await store.hashDirectoryManifest(root);
  assert.equal(second.digest, first.digest);
  assert.deepEqual(second.files.map((item) => item.path), ['index.html']);

  await fs.writeFile(path.join(root, 'index.html'), '<main>changed</main>\n', 'utf8');
  const changed = await store.hashDirectoryManifest(root);
  assert.notEqual(changed.digest, first.digest);
});

test('full production is blocked unless formal readiness is explicitly true', () => {
  const project = {
    publicationRights: 'cleared',
    stages: Object.fromEntries(
      ['style-probe', 'rights-clearance', 'audio-handoff', 'composition-readiness']
        .map((stageId) => [stageId, {status: 'approved'}]),
    ),
  };
  assert.throws(
    () => generators.assertFullProductionReadiness(project, {
      readiness: {readyForComposition: false},
      contracts: {audioHandoff: {valid: true, publicReleaseReady: false}},
    }),
    /readyForComposition must be true/,
  );
  assert.doesNotThrow(
    () => generators.assertFullProductionReadiness(project, {
      readiness: {readyForComposition: true},
      contracts: {audioHandoff: {valid: true, publicReleaseReady: true}},
    }),
  );
});

test('internal-only production requires technical readiness and keeps public release blocked', () => {
  const project = {
    publicationRights: 'internal-only',
    stages: Object.fromEntries(
      ['style-probe', 'rights-clearance', 'audio-handoff', 'composition-readiness']
        .map((stageId) => [stageId, {status: 'approved'}]),
    ),
  };
  const formalStatus = {
    readiness: {readyForComposition: false},
    checks: [
      {id: 'narration-lock', passed: true},
      {id: 'template-lock', passed: true},
      {id: 'project-gates', passed: true},
      {id: 'style-selection-match', passed: true},
      {id: 'audio-handoff', passed: false, detail: 'human-readable detail may change'},
      {id: 'final-preview', passed: false},
    ],
    contracts: {
      audioHandoff: {
        valid: true,
        filesValid: true,
        rightsStatus: 'needs-review',
        approvalScope: 'technical-only',
        publicReleaseReady: false,
      },
    },
  };
  const result = generators.assertFullProductionReadiness(project, formalStatus);
  assert.equal(result.workbenchReadiness.readyForComposition, true);
  assert.equal(result.workbenchReadiness.readyForPublicRelease, false);
  assert.equal(result.workbenchReadiness.formalReadyForComposition, false);
});

test('readiness never treats human-readable audio detail as a machine contract', () => {
  const status = {
    readiness: {readyForComposition: false},
    checks: [
      {id: 'narration-lock', passed: true},
      {id: 'template-lock', passed: true},
      {id: 'project-gates', passed: true},
      {id: 'style-selection-match', passed: true},
      {id: 'audio-handoff', passed: false, detail: 'files valid; rights=needs-review; listening=technical-only'},
    ],
  };
  assert.throws(() => generators.assertReadyForComposition(status, 'internal-only'), /readyForComposition must be true/i);
});

test('render readiness revalidates formal audio and public listening gates', () => {
  const checks = [
    {id: 'narration-lock', passed: true},
    {id: 'template-lock', passed: true},
    {id: 'project-gates', passed: true},
    {id: 'style-selection-match', passed: true},
  ];
  const internalProject = {publicationRights: 'internal-only'};
  const internalStatus = {
    readiness: {readyForComposition: false, readyForFinalRender: false},
    checks,
    contracts: {audioHandoff: {valid: true, publicReleaseReady: false}},
  };
  assert.doesNotThrow(() => generators.assertRenderReadiness(internalProject, internalStatus));
  assert.throws(
    () => generators.assertRenderReadiness(internalProject, {
      ...internalStatus,
      contracts: {audioHandoff: {valid: false, filesValid: false, publicReleaseReady: false}},
    }),
    /readyForComposition|stale or invalid/i,
  );

  const publicProject = {publicationRights: 'cleared'};
  const publicStatus = {
    readiness: {readyForComposition: true, readyForFinalRender: false},
    checks,
    contracts: {audioHandoff: {valid: true, publicReleaseReady: true}},
  };
  assert.throws(() => generators.assertRenderReadiness(publicProject, publicStatus), /human-listening|readyForFinalRender/i);
  assert.doesNotThrow(() => generators.assertRenderReadiness(publicProject, {
    ...publicStatus,
    readiness: {readyForComposition: true, readyForFinalRender: true},
  }));
});

test('internal-only rights approval preserves unresolved public rights', async () => {
  const projectId = 'internal-rights';
  await store.createProject({...input(projectId), publicationRights: 'internal-only'});
  const artifactPath = await store.saveArtifact(projectId, 'rights-clearance', 'publication-rights.json', {
    schemaVersion: 'autovideo-publication-rights/v1',
    projectId,
    declaration: 'internal-only',
    items: [{id: 'voice-speaker-rights', status: 'needs-review'}],
  }, 'json');
  await store.markStageGenerated(projectId, 'rights-clearance', {artifactPath, artifactKind: 'json'});
  const project = await store.approveStage(projectId, 'rights-clearance', 'test-reviewer');
  assert.equal(project.stages['rights-clearance'].status, 'approved');
  assert.equal(project.publicationRights, 'internal-only');
});

test('internal-only rights inventory refresh preserves scope and only invalidates release metadata', async () => {
  const projectId = 'internal-rights-refresh';
  await store.createProject({...input(projectId), publicationRights: 'internal-only'});
  const originalPath = await store.saveArtifact(projectId, 'rights-clearance', 'publication-rights.json', {
    schemaVersion: 'autovideo-publication-rights/v1',
    projectId,
    declaration: 'internal-only',
    items: [{id: 'voice-speaker-rights', status: 'needs-review'}],
  }, 'json');
  await store.markStageGenerated(projectId, 'rights-clearance', {artifactPath: originalPath, artifactKind: 'json'});
  const approved = await store.approveStage(projectId, 'rights-clearance', 'scope-owner');
  await store.markStageGenerated(projectId, 'full-production', {artifactPath: 'full.json', artifactKind: 'json'});
  await store.markStageGenerated(projectId, 'delivery-qa', {artifactPath: 'delivery.json', artifactKind: 'json'});

  await store.markStageRunning(projectId, 'rights-clearance', 'refresh-job');
  const refreshedPath = await store.saveArtifact(projectId, 'rights-clearance', 'publication-rights.json', {
    schemaVersion: 'autovideo-publication-rights/v1',
    projectId,
    declaration: 'internal-only',
    items: [
      {id: 'voice-speaker-rights', status: 'needs-review'},
      {id: 'host-artwork-rights', status: 'needs-review'},
    ],
  }, 'json');
  const refreshed = await store.markStageGenerated(projectId, 'rights-clearance', {
    artifactPath: refreshedPath,
    artifactKind: 'json',
    preserveInternalApproval: true,
  });
  assert.equal(refreshed.stages['rights-clearance'].status, 'approved');
  assert.equal(refreshed.stages['rights-clearance'].approvedBy, approved.stages['rights-clearance'].approvedBy);
  assert.equal(refreshed.stages['rights-clearance'].approvalScope, approved.stages['rights-clearance'].approvalScope);
  assert.equal(refreshed.stages['full-production'].status, 'approved');
  assert.equal(refreshed.stages['delivery-qa'].status, 'stale');
});

test('NarrationLock resume compares normalized text instead of raw trailing whitespace', () => {
  const original = '第一行\r\n第二行';
  const regenerated = '第一行\n第二行\n';
  const rawHash = (value) => createHash('sha256').update(value).digest('hex');
  assert.notEqual(rawHash(original), rawHash(regenerated));
  const lock = {normalizedSha256: generators.normalizedNarrationSha256(original)};
  assert.doesNotThrow(() => generators.assertNarrationMatchesLock(lock, regenerated));
  assert.throws(() => generators.assertNarrationMatchesLock(lock, '第一行\n内容已改变'), /different approved script/i);
});

test('TTS segmentation preserves narration wording and creates bounded chunks', () => {
  const narration = '第一句解释背景。第二句包含 AI、数字 2026 和产品名。第三句说明风险！第四句给出结论。';
  const parts = generators.splitNarrationForTts(narration, 28);
  assert.ok(parts.length >= 2);
  assert.equal(parts.join(''), narration);
  assert.ok(parts.every((part) => part.trim().length > 0));
});

test('TTS segmentation preserves normalized paragraph breaks from CRLF input', () => {
  const narration = '第一段。\r\n第二段包含 AI。\r\n第三段。';
  const parts = generators.splitNarrationForTts(narration, 12);
  assert.equal(parts.join(''), narration.replace(/\r\n/g, '\n'));
  assert.equal(generators.normalizedNarrationSha256(parts.join('')), generators.normalizedNarrationSha256(narration));
});

test('TTS segmentation keeps natural paragraphs as hard production parts', () => {
  const narration = '第一段很短。\n第二段也很短。\n第三段仍然很短。';
  const parts = generators.splitNarrationForTts(narration);
  assert.deepEqual(parts, ['第一段很短。\n', '第二段也很短。\n', '第三段仍然很短。']);
  assert.equal(parts.join(''), narration);
  assert.ok(parts.every((part) => Array.from(part).length <= 70));
});

test('TTS segmentation splits an oversized sentence only at semantic punctuation', () => {
  const narration = `${'这是一个需要保留语义的说明'.repeat(4)}，${'这里继续补充上下文'.repeat(4)}，最后收束。`;
  const parts = generators.splitNarrationForTts(narration);
  assert.equal(parts.join(''), narration);
  assert.ok(parts.length >= 2);
  assert.ok(parts.slice(0, -1).every((part) => /[，,、；;：:]$/u.test(part)));
});

test('pronunciation guide applies only approved entries and keeps source text immutable', () => {
  const source = 'AI 连接 API、MCP、Coze 和 666。';
  const result = generators.applyPronunciationGuide(source, {
    entries: [
      {token: 'AI', spokenAs: 'A I', status: 'approved-default'},
      {token: 'API', spokenAs: 'A P I', status: 'approved-default'},
      {token: 'MCP', spokenAs: 'M C P', status: 'approved-default'},
      {token: 'Coze', spokenAs: '扣子', status: 'needs-listening-review'},
      {token: '666', spokenAs: '六六六', status: 'approved-default'},
    ],
  });
  assert.equal(result.sourceText, source);
  assert.equal(result.ttsText, 'A I 连接 A P I、M C P、Coze 和 六六六。');
  assert.deepEqual(new Set(result.substitutions.map((item) => item.token)), new Set(['666', 'API', 'MCP', 'AI']));
});

test('pronunciation substitutions respect Latin token boundaries', () => {
  const source = 'AI 连接 RAIL、APIClient 和 API。';
  const result = generators.applyPronunciationGuide(source, {entries: [
    {token: 'AI', spokenAs: 'A I', status: 'approved-default'},
    {token: 'API', spokenAs: 'A P I', status: 'approved-default'},
  ]});
  assert.equal(result.ttsText, 'A I 连接 RAIL、APIClient 和 A P I。');
  assert.deepEqual(result.substitutions.map((item) => item.token), ['API', 'AI']);
});

test('source registration skips credential-like JSON without exposing its values', async () => {
  const projectId = 'credential-scan';
  await store.createProject({...input(projectId), route: 'materials', sourcePath: 'demo/persondesign/persondesign'});
  const result = await generators.generateStage(projectId, 'source-register');
  const receipt = JSON.parse(await fs.readFile(store.resolveWorkspacePath(result.artifactPath), 'utf8'));
  assert.ok(receipt.skipped.some((item) => item.path.endsWith('/EUR-OWH95A78QK_sub2.json')));
  assert.equal(JSON.stringify(receipt).includes('access_token'), false);
});

test('reset and delete only remove workbench state', async () => {
  const projectId = 'lifecycle';
  await store.createProject(input(projectId));
  const artifactPath = await store.saveArtifact(projectId, 'source-register', 'sources.json', {sources: []}, 'json');
  await store.markStageGenerated(projectId, 'source-register', {artifactPath, artifactKind: 'json'});
  const reset = await store.resetProject(projectId);
  assert.equal(reset.stages['source-register'].status, 'not-started');
  assert.equal(reset.events[0].type, 'project-reset');

  const deleted = await store.deleteProject(projectId);
  assert.equal(deleted.formalFilesPreserved, true);
  await assert.rejects(() => store.getProject(projectId), /Unknown project/);
});
