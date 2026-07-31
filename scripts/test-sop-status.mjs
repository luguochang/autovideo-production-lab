import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  evaluateFormalCompositionReadiness,
  isGenuineHumanReviewApproval,
  nextActionForSopStatus,
  syncProjectSopStatus,
  validateOverrides,
} from './sync-project-sop-status.mjs';


const root = path.resolve(import.meta.dirname, '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');
const projectId = `sop-status-test-${process.pid}`;
const projectDir = path.join(projectsRoot, projectId);
const writeJson = (relativePath, value) => fs.writeFile(
  path.join(projectDir, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8',
);
const write = (relativePath, value = relativePath) => fs.writeFile(path.join(projectDir, relativePath), value, 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');


try {
  assert.equal(isGenuineHumanReviewApproval({approvalScope: 'human-review'}), true);
  assert.equal(isGenuineHumanReviewApproval({approvalScope: 'human-review', humanReviewPerformed: false}), false);
  assert.equal(isGenuineHumanReviewApproval({approvalScope: 'internal-autonomous-review'}), false);
  assert.equal(nextActionForSopStatus({readiness: {technicalVideoGenerationReady: false}}, 'Keep planning.'), 'Keep planning.');
  assert.match(nextActionForSopStatus({readiness: {technicalVideoGenerationReady: true}}, 'stale'), /internal-review MP4/i);
  assert.equal(evaluateFormalCompositionReadiness({
    locksReady: true,
    gatesApproved: true,
    audioBindingsValid: true,
    humanListeningApproved: true,
    publicRightsApproved: true,
    planningContractsReady: true,
    motionLifecycleAuthorized: false,
  }), false);
  for (const dir of ['input', 'audio', 'captions', 'plan', 'qa', 'review/stills', 'review/probes']) {
    await fs.mkdir(path.join(projectDir, dir), {recursive: true});
  }
  const narrationHash = sha256('approved narration');
  await writeJson('NarrationLock.json', {schemaVersion: 'autovideo-narration-lock/v1', projectId, normalizedSha256: narrationHash});
  await writeJson('template-lock.json', {schemaVersion: 'autovideo-template-lock/v1', projectId});
  await writeJson('project-state.json', {
    schemaVersion: 'autovideo-project-state/v1',
    projectId,
    gates: {
      task: {status: 'approved', approvedBy: 'agent-internal-review', approvedAt: '2026-07-19T00:00:00Z'},
      style: {status: 'approved', approvedBy: 'agent-internal-review', approvedAt: '2026-07-19T00:01:00Z', reviewMode: 'probe'},
      finalPreview: {status: 'pending', approvedBy: null, approvedAt: null},
    },
  });
  await writeJson('input/content-approval.json', {
    approvedForInternalProduction: true,
    approvedForPublicRelease: false,
    approvedBy: 'user-request',
    approvedAt: '2026-07-19T00:00:00Z',
    publicReleaseBlockers: ['voice rights unresolved'],
  });
  await writeJson('input/pronunciation.json', {entries: [{token: 'Demo', status: 'needs-listening-review'}]});
  for (const file of ['input/claim-ledger.json', 'audio/voice.recipe.json', 'audio/qa-report.json', 'captions/alignment-validation.json', 'style-selection.json', 'plan/production-manifest.json', 'AssetManifest.json', 'review/probe-review.json']) {
    await writeJson(file, {projectId});
  }
  for (const file of ['VIDEO_TASK.md', 'STYLE_REVIEW.md', 'captions/narration.zh-CN.srt', 'review/stills/style-probe-hidden-complexity.png', 'review/probes/style-probe-hidden-complexity.mp4']) await write(file);
  await writeJson('plan/storyboard.json', {schemaVersion: 'autovideo-storyboard/v1', projectId, scenes: []});
  await writeJson('plan/shot-manifest.json', {schemaVersion: 'autovideo-shot-manifest/v1', projectId, shots: []});
  await writeJson('plan/graph-ir.json', {schemaVersion: 'autovideo-graph-ir/v1', projectId, graphs: []});
  await writeJson('audio/alignment.json', {schemaVersion: 'autovideo-alignment-locked/v1', narrationSha256: narrationHash});
  await write('audio/narration.final.wav', 'test wav');
  const alignmentSha = sha256(await fs.readFile(path.join(projectDir, 'audio/alignment.json')));
  const audioSha = sha256(await fs.readFile(path.join(projectDir, 'audio/narration.final.wav')));
  const recipeSha = sha256(await fs.readFile(path.join(projectDir, 'audio/voice.recipe.json')));
  const listeningChecklist = {
    fullPlayback: false,
    terminology: true,
    pauses: true,
    clipping: true,
    segmentJoins: true,
  };
  const listeningReview = {
    schemaVersion: 'autovideo-listening-review/v1',
    projectId,
    narrationSha256: narrationHash,
    audio: {path: 'audio/narration.final.wav', sha256: audioSha, durationSeconds: 1},
    reviewedBy: 'human:audio-reviewer',
    updatedAt: '2026-07-19T00:02:30Z',
    status: 'in-progress',
    checklist: listeningChecklist,
    terms: [{token: 'Demo', decision: 'accepted', note: 'Pronunciation is clear.'}],
    notes: '',
    playbackSeconds: 0.5,
  };
  await writeJson('audio/listening-review.json', listeningReview);
  await writeJson('audio/approval.json', {
    schemaVersion: 'autovideo-audio-approval/v3',
    projectId,
    approvalScope: 'technical-only',
    approvedBy: 'technical-reviewer',
    approvedAt: '2026-07-19T00:02:00Z',
    narrationSha256: narrationHash,
    audioSha256: audioSha,
    technicalApproval: {status: 'passed', reviewer: 'technical-reviewer', approvedAt: '2026-07-19T00:02:00Z'},
    humanListening: {status: 'not-performed', reviewer: null, approvedAt: null},
    publicReleaseApproved: false,
  });
  await writeJson('audio-handoff.json', {
    narrationSha256: narrationHash,
    status: 'approved',
    approvedBy: 'technical-reviewer',
    attachedAt: '2026-07-19T00:02:00Z',
    approvalScope: 'technical-only',
    humanListeningStatus: 'not-performed',
    rightsStatus: 'needs-review',
    publicReleaseBlocked: true,
    audio: {path: 'audio/narration.final.wav', sha256: audioSha},
    alignment: {path: 'audio/alignment.json', sha256: alignmentSha},
    recipe: {path: 'audio/voice.recipe.json', sha256: recipeSha},
  });

  const status = await syncProjectSopStatus(projectId);
  assert.equal(status.approvals.task.approvedBy, 'agent-internal-review');
  assert.equal(status.approvals.content.approvedBy, 'user-request');
  assert.equal(status.approvals.audio.approvedBy, 'technical-reviewer');
  assert.equal(status.evidence.listeningReview.status, 'in-progress');
  assert.equal(status.evidence.listeningReview.bindingStatus, 'valid');
  assert.deepEqual(status.evidence.listeningReview.acceptedTerms, ['Demo']);
  assert.equal(status.evidence.audioApproval.bindingStatus, 'valid');
  assert.equal(status.milestones.humanListening, 'blocked');
  assert.equal(status.release.blockers.some((blocker) => blocker.includes('Demo')), false);
  assert.equal(status.milestones.overridesContract, 'passed-empty');
  assert.equal(status.readiness.internalPlanningAndProbeReady, false);
  assert.equal(status.readiness.formalReadyForComposition, false);
  assert.equal(status.release.publicReleaseBlocked, true);

  const staleListeningReview = structuredClone(listeningReview);
  staleListeningReview.narrationSha256 = '0'.repeat(64);
  staleListeningReview.audio.sha256 = 'f'.repeat(64);
  await writeJson('audio/listening-review.json', staleListeningReview);
  const staleReviewStatus = await syncProjectSopStatus(projectId);
  assert.equal(staleReviewStatus.evidence.listeningReview.bindingStatus, 'invalid');
  assert.equal(staleReviewStatus.evidence.listeningReview.narrationSha256Matches, false);
  assert.equal(staleReviewStatus.evidence.listeningReview.audioSha256Matches, false);
  assert.equal(staleReviewStatus.release.blockers.some((blocker) => blocker.includes('Demo')), true);
  await writeJson('audio/listening-review.json', listeningReview);

  const readyListeningReview = structuredClone(listeningReview);
  readyListeningReview.status = 'ready-for-approval';
  readyListeningReview.checklist.fullPlayback = true;
  readyListeningReview.playbackSeconds = 1;
  readyListeningReview.updatedAt = '2026-07-19T00:03:00Z';
  await writeJson('audio/listening-review.json', readyListeningReview);
  const readyReviewStatus = await syncProjectSopStatus(projectId);
  assert.equal(readyReviewStatus.evidence.listeningReview.status, 'ready-for-approval');
  assert.equal(readyReviewStatus.milestones.humanListening, 'blocked');
  assert.equal(readyReviewStatus.readiness.formalReadyForComposition, false);

  const listeningReviewSha = sha256(await fs.readFile(path.join(projectDir, 'audio/listening-review.json')));
  await writeJson('audio/approval.json', {
    schemaVersion: 'autovideo-audio-approval/v3',
    projectId,
    approvalScope: 'human-listening',
    approvedBy: 'human:audio-reviewer',
    approvedAt: '2026-07-19T00:04:00Z',
    narrationSha256: narrationHash,
    audioSha256: audioSha,
    technicalApproval: {status: 'passed', reviewer: 'technical-reviewer', approvedAt: '2026-07-19T00:02:00Z'},
    humanListening: {
      status: 'approved',
      reviewer: 'human:audio-reviewer',
      approvedAt: '2026-07-19T00:04:00Z',
      reviewPath: 'audio/listening-review.json',
      reviewSha256: listeningReviewSha,
    },
    publicReleaseApproved: false,
  });
  const approvedListeningStatus = await syncProjectSopStatus(projectId);
  assert.equal(approvedListeningStatus.approvals.audio.approvedBy, 'human:audio-reviewer');
  assert.equal(approvedListeningStatus.approvals.audio.scope, 'human-listening');
  assert.equal(approvedListeningStatus.evidence.audioApproval.listeningReviewReceiptValid, true);
  assert.equal(approvedListeningStatus.milestones.humanListening, 'passed');
  assert.equal(approvedListeningStatus.release.publicReleaseBlocked, true);

  const promotedCandidateReview = {
    schemaVersion: 'autovideo-listening-review/v2',
    projectId,
    narrationSha256: narrationHash,
    status: 'ready-for-approval',
    decision: 'accepted',
    selectedCandidateId: 'candidate-002',
    playedCandidateIds: ['baseline-aaaaaaaaaaaa', 'candidate-001', 'candidate-002'],
    candidateChecklist: {
      naturalness: true,
      breathing: true,
      pronunciation: true,
      segmentJoins: true,
      noArtifacts: true,
    },
    checklist: {
      fullPlayback: true,
      terminology: true,
      pauses: true,
      clipping: true,
      segmentJoins: true,
    },
    terms: [{token: 'Demo', kind: 'english-word', spokenAs: 'demo', decision: 'accepted', note: 'Accepted in full candidate.'}],
    audio: {path: 'audio/narration.final.wav', sha256: audioSha, durationSeconds: 1},
    playbackSeconds: 1,
    reviewedBy: 'human:audio-reviewer',
    updatedAt: '2026-07-19T00:05:00Z',
    promotedAt: '2026-07-19T00:05:00Z',
  };
  await writeJson('audio/listening-review.json', promotedCandidateReview);
  const promotedCandidateReviewSha = sha256(await fs.readFile(path.join(projectDir, 'audio/listening-review.json')));
  await writeJson('audio/approval.json', {
    schemaVersion: 'autovideo-audio-approval/v4',
    projectId,
    approvalScope: 'human-listening',
    approvedBy: 'human:audio-reviewer',
    approvedAt: '2026-07-19T00:05:00Z',
    narrationSha256: narrationHash,
    selectedCandidateId: 'candidate-002',
    audioSha256: audioSha,
    recipeSha256: recipeSha,
    listeningReviewSha256: promotedCandidateReviewSha,
    candidateBindings: {index: {sha256: 'a'.repeat(64)}, candidates: []},
    technicalApproval: {status: 'passed', candidateManifestSha256: 'b'.repeat(64)},
    humanListening: {
      status: 'approved',
      reviewer: 'human:audio-reviewer',
      approvedAt: '2026-07-19T00:05:00Z',
      reviewPath: 'audio/listening-review.json',
      reviewSha256: promotedCandidateReviewSha,
    },
    publicReleaseApproved: false,
  });
  const promotedCandidateStatus = await syncProjectSopStatus(projectId);
  assert.equal(promotedCandidateStatus.evidence.listeningReview.bindingStatus, 'valid');
  assert.deepEqual(promotedCandidateStatus.evidence.listeningReview.acceptedTerms, ['Demo']);
  assert.equal(promotedCandidateStatus.evidence.audioApproval.bindingStatus, 'valid');
  assert.equal(promotedCandidateStatus.evidence.audioApproval.listeningReviewReceiptValid, true);
  assert.equal(promotedCandidateStatus.milestones.humanListening, 'passed');

  const stableRecipeBytes = await fs.readFile(path.join(projectDir, 'audio', 'voice.recipe.json'));
  await fs.appendFile(path.join(projectDir, 'audio', 'voice.recipe.json'), '\n');
  const stalePromotedRecipeStatus = await syncProjectSopStatus(projectId);
  assert.equal(stalePromotedRecipeStatus.evidence.audioApproval.bindingStatus, 'invalid');
  assert.equal(stalePromotedRecipeStatus.evidence.audioApproval.recipeSha256Matches, false);
  assert.equal(stalePromotedRecipeStatus.milestones.humanListening, 'blocked');
  await fs.writeFile(path.join(projectDir, 'audio', 'voice.recipe.json'), stableRecipeBytes);

  const stablePromotedReviewBytes = await fs.readFile(path.join(projectDir, 'audio', 'listening-review.json'));
  await fs.appendFile(path.join(projectDir, 'audio', 'listening-review.json'), '\n');
  const stalePromotedReviewStatus = await syncProjectSopStatus(projectId);
  assert.equal(stalePromotedReviewStatus.evidence.audioApproval.bindingStatus, 'invalid');
  assert.equal(stalePromotedReviewStatus.evidence.audioApproval.listeningReviewSha256Matches, false);
  assert.equal(stalePromotedReviewStatus.milestones.humanListening, 'blocked');
  await fs.writeFile(path.join(projectDir, 'audio', 'listening-review.json'), stablePromotedReviewBytes);

  const previewDigest = 'a'.repeat(64);
  const previewBeforeReview = {
    schemaVersion: 'autovideo-final-preview/v2',
    projectId,
    compositionDigest: previewDigest,
    fileCount: 1,
    approvalScope: 'internal-autonomous-review',
    publicReleaseBlocked: true,
  };
  await writeJson('qa/final-preview.json', previewBeforeReview);
  const previewBeforeReviewSha = sha256(await fs.readFile(path.join(projectDir, 'qa/final-preview.json')));
  const humanFinalReview = {
    schemaVersion: 'autovideo-human-final-review/v1',
    projectId,
    composition: {path: 'production/hyperframes', digest: previewDigest, fileCount: 1},
    previewReceipt: {path: 'qa/final-preview.json', sha256: previewBeforeReviewSha},
    status: 'ready-for-approval',
    checklist: {fullTimeline: true, audioVisualSync: true, captions: true, visuals: true, content: true},
    notes: 'Full timeline reviewed.',
    reviewedBy: 'human:video-reviewer',
    updatedAt: '2026-07-19T00:05:00Z',
  };
  await writeJson('qa/human-final-review.json', humanFinalReview);
  const humanFinalReviewSha = sha256(await fs.readFile(path.join(projectDir, 'qa/human-final-review.json')));
  await writeJson('qa/final-preview.json', {
    ...previewBeforeReview,
    approvalScope: 'human-review',
    approvedBy: 'human:video-reviewer',
    approvedAt: '2026-07-19T00:06:00Z',
    humanReview: {
      path: 'qa/human-final-review.json',
      sha256: humanFinalReviewSha,
      previewReceiptSha256: previewBeforeReviewSha,
    },
  });
  const stateWithHumanReview = JSON.parse(await fs.readFile(path.join(projectDir, 'project-state.json'), 'utf8'));
  stateWithHumanReview.gates.finalPreview = {
    status: 'approved-internal-only',
    approvalScope: 'human-review',
    approvedBy: 'human:video-reviewer',
    approvedAt: '2026-07-19T00:06:00Z',
  };
  await writeJson('project-state.json', stateWithHumanReview);
  const humanFinalReviewStatus = await syncProjectSopStatus(projectId);
  assert.equal(humanFinalReviewStatus.evidence.humanFinalReview.bindingStatus, 'valid');
  assert.equal(humanFinalReviewStatus.milestones.humanFinalReview, 'passed');
  assert.equal(humanFinalReviewStatus.approvals.finalPreview.scope, 'human-review');

  const overrides = JSON.parse(await fs.readFile(path.join(projectDir, 'overrides', 'overrides.json'), 'utf8'));
  assert.equal(overrides.createdBy, 'automation:sop-status-sync');
  assert.equal(overrides.approvalStatus, 'not-applicable-empty');
  assert.deepEqual(overrides.overrides, []);
  await assert.doesNotReject(() => syncProjectSopStatus(projectId, {checkOnly: true}));

  const emptyContractBeforeRebase = await fs.readFile(path.join(projectDir, 'overrides', 'overrides.json'), 'utf8');
  await writeJson('plan/storyboard.json', {schemaVersion: 'autovideo-storyboard/v1', projectId, scenes: [{id: 'scene-rebased'}]});
  await assert.rejects(() => syncProjectSopStatus(projectId, {checkOnly: true}), /Overrides base is stale/i);
  assert.equal(await fs.readFile(path.join(projectDir, 'overrides', 'overrides.json'), 'utf8'), emptyContractBeforeRebase);
  await assert.doesNotReject(() => syncProjectSopStatus(projectId));
  const rebasedEmptyOverrides = JSON.parse(await fs.readFile(path.join(projectDir, 'overrides', 'overrides.json'), 'utf8'));
  assert.equal(rebasedEmptyOverrides.revision, 0);
  assert.equal(rebasedEmptyOverrides.approvalStatus, 'not-applicable-empty');
  assert.deepEqual(rebasedEmptyOverrides.overrides, []);
  assert.equal(rebasedEmptyOverrides.base.storyboard.sha256, sha256(await fs.readFile(path.join(projectDir, 'plan/storyboard.json'))));
  assert.equal(rebasedEmptyOverrides.updatedBy, 'automation:sop-status-sync');

  rebasedEmptyOverrides.revision = 1;
  rebasedEmptyOverrides.approvalStatus = 'pending-human-review';
  rebasedEmptyOverrides.overrides = [{
    id: 'override-object-locks-001',
    revision: 1,
    status: 'active',
    target: {
      level: 'object',
      sceneId: 'scene-06',
      cueId: 'cue-012',
      objectId: 'node-error-source',
      sourcePath: 'plan/graph-ir.json',
    },
    operation: 'set',
    patch: {content: {displayText: '人工确认的错误来源'}},
    locks: {
      text: {value: '人工确认的错误来源'},
      hostPose: {value: 'point-right'},
      layout: {value: {hostZone: 'host.left', contentZone: 'content.right'}},
      timing: {value: {start: 52.1, end: 58.4, duration: 6.3}},
    },
    reason: 'Preserve the reviewed object treatment during regeneration.',
    authoredBy: 'human:workflow-editor',
    authoredAt: '2026-07-19T00:03:00Z',
    invalidateTargets: ['effective-ir:scene-06', 'composition:scene-06', 'qa:scene-06', 'render:master'],
    supersedes: null,
  }];
  await writeJson('overrides/overrides.json', rebasedEmptyOverrides);
  const activeStatus = await syncProjectSopStatus(projectId);
  assert.equal(activeStatus.milestones.overridesContract, 'active');
  const activeOverrides = JSON.parse(await fs.readFile(path.join(projectDir, 'overrides', 'overrides.json'), 'utf8'));
  assert.equal(activeOverrides.overrides[0].authoredBy, 'human:workflow-editor');
  assert.equal(activeOverrides.overrides[0].locks.hostPose.value, 'point-right');
  assert.deepEqual(activeOverrides.overrides[0].invalidateTargets, [
    'effective-ir:scene-06', 'composition:scene-06', 'qa:scene-06', 'render:master',
  ]);

  const legacyCompatible = structuredClone(rebasedEmptyOverrides);
  legacyCompatible.overrides[0].target = {kind: 'node', id: 'node-error-source', sourcePath: 'plan/graph-ir.json'};
  legacyCompatible.overrides[0].invalidates = legacyCompatible.overrides[0].invalidateTargets;
  delete legacyCompatible.overrides[0].invalidateTargets;
  assert.doesNotThrow(() => validateOverrides(legacyCompatible, projectId));

  const ambiguousInvalidation = structuredClone(rebasedEmptyOverrides);
  ambiguousInvalidation.overrides[0].invalidates = ['legacy:duplicate'];
  assert.throws(() => validateOverrides(ambiguousInvalidation, projectId), /exactly one/i);
  await assert.doesNotReject(() => syncProjectSopStatus(projectId, {checkOnly: true}));

  const storyboardBeforeActiveStaleProbe = await fs.readFile(path.join(projectDir, 'plan/storyboard.json'), 'utf8');
  await writeJson('plan/storyboard.json', {schemaVersion: 'autovideo-storyboard/v1', projectId, scenes: [{id: 'scene-active-stale'}]});
  await assert.rejects(() => syncProjectSopStatus(projectId), /Overrides base is stale/i);
  await fs.writeFile(path.join(projectDir, 'plan/storyboard.json'), storyboardBeforeActiveStaleProbe, 'utf8');
  await assert.doesNotReject(() => syncProjectSopStatus(projectId, {checkOnly: true}));

  await write('STYLE_REVIEW.md', 'changed after sync');
  await assert.rejects(() => syncProjectSopStatus(projectId, {checkOnly: true}), /stale/i);
  console.log(JSON.stringify({passed: true, projectId, publicReleaseBlocked: true}, null, 2));
} finally {
  const relative = path.relative(projectsRoot, projectDir);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) await fs.rm(projectDir, {recursive: true, force: true});
}
