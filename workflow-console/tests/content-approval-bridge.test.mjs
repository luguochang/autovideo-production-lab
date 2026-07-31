import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {
  buildApprovedNarration,
  reviewClaimSources,
  sha256,
} from '../../tools/content-pipeline/content-contract.mjs';
import {approveContentChain} from '../lib/content-approval-bridge.mjs';
import {loadPromptChain} from '../../tools/content-pipeline/content-regression.mjs';
import {assessContentDuration} from '../../tools/content-pipeline/content-prompt-chain.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const testRoot = path.join(workspaceRoot, 'content', 'test-runs', `bridge-${process.pid}`);
const projectId = `bridge-${process.pid}`;
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

before(async () => {
  await fs.mkdir(testRoot, {recursive: true});
});

after(async () => {
  await fs.rm(testRoot, {recursive: true, force: true});
});

test('content approval bridge freezes a hash-bound chain atomically and is idempotent', async () => {
  const sourcePath = path.join(testRoot, 'notes.md');
  const sourceText = 'A reliable workflow needs review and rollback.\n';
  await fs.writeFile(sourcePath, sourceText, 'utf8');
  const source = {
    id: 'source-001',
    path: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
    type: 'md',
    bytes: Buffer.byteLength(sourceText),
    modifiedAt: new Date().toISOString(),
    sha256: crypto.createHash('sha256').update(sourceText).digest('hex'),
    source: 'user-provided',
    license: 'user-provided; publication rights not implied',
    status: 'registered',
  };
  const sources = {schemaVersion: 'autovideo-sources/v1', projectId, root: path.relative(workspaceRoot, testRoot).replaceAll('\\', '/'), generatedAt: new Date().toISOString(), sources: [source], skipped: [], warnings: []};
  const sourcesSha256 = sha256(Buffer.from(canonical(sources)));
  const suitability = {
    schemaVersion: 'autovideo-material-suitability/v1', projectId,
    sourceRegister: {path: 'sources.json', sha256: sourcesSha256},
    assessmentScope: 'technical-baseline', status: 'suitable', recommendedRoute: 'materials',
    usableSourceIds: [source.id], preparationActions: [{sourceId: source.id, action: 'none', reason: 'Text can enter claim extraction directly.'}],
    blockers: [], humanReviewRequired: true,
    rewritePolicy: {allowNewFacts: false, requireClaimMapping: true, preserveApprovedWording: true}, generatedAt: new Date().toISOString(),
  };
  const suitabilitySha256 = sha256(Buffer.from(canonical(suitability)));
  const evidence = {
    schemaVersion: 'autovideo-evidence/v1',
    claims: [{id: 'claim-001', statement: 'Reliable workflows need review and rollback.', status: 'supported', sourceId: source.id, quote: sourceText.trim(), locator: 'notes.md:1'}],
    gaps: [],
  };
  const evidenceSha256 = sha256(Buffer.from(canonical(evidence)));
  const spokenRewrite = {
    schemaVersion: 'autovideo-spoken-rewrite/v1', projectId,
    sourceRegisterSha256: sourcesSha256, suitabilitySha256, evidenceSha256,
    title: 'Review', language: 'zh-CN',
    sections: [{id: 'section-01', kind: 'sourced', targetSeconds: 4, narration: '可靠的流程，需要复核，也需要回滚。', claimIds: ['claim-001'], sourceIds: [source.id], framing: '', onscreen: [{text: '复核 + 回滚', kind: 'generated_summary'}]}],
    reviewNotes: [], generatedAt: new Date().toISOString(),
  };
  const rewriteSha256 = sha256(Buffer.from(canonical(spokenRewrite)));
  const claimSourceReview = await reviewClaimSources({
    workspaceRoot, sources, suitability, evidence, rewrite: spokenRewrite,
    bindings: {sourcesSha256, suitabilitySha256, evidenceSha256, spokenRewriteSha256: rewriteSha256},
  });
  assert.equal(claimSourceReview.status, 'passed');
  const policyEvidence = structuredClone(evidence);
  policyEvidence.claims[0].status = 'opinion';
  const policyEvidenceSha256 = sha256(Buffer.from(canonical(policyEvidence)));
  const policyRewrite = structuredClone(spokenRewrite);
  policyRewrite.evidenceSha256 = policyEvidenceSha256;
  policyRewrite.sections[0].narration += ' GPT-5。';
  policyRewrite.sections[0].onscreen = [{text: '不存在的逐字引句', kind: 'exact_excerpt'}];
  const policyReview = await reviewClaimSources({
    workspaceRoot, sources, suitability, evidence: policyEvidence, rewrite: policyRewrite,
    bindings: {
      sourcesSha256, suitabilitySha256, evidenceSha256: policyEvidenceSha256,
      spokenRewriteSha256: sha256(Buffer.from(canonical(policyRewrite))),
    },
  });
  const policyCodes = new Set(policyReview.issues.map((issue) => issue.code));
  assert.equal(policyReview.status, 'failed');
  assert.equal(policyCodes.has('opinion-kind-mismatch'), true);
  assert.equal(policyCodes.has('unregistered-protected-atom'), true);
  assert.equal(policyCodes.has('exact-excerpt-unbound'), true);
  const claimReviewSha256 = sha256(Buffer.from(canonical(claimSourceReview)));
  const narration = buildApprovedNarration(spokenRewrite);
  const intakeDir = path.join(testRoot, 'intake');
  const first = await approveContentChain({
    workspaceRoot, intakeDir, projectId, reviewer: 'human:test',
    artifacts: {
      sources: canonical(sources), suitability: canonical(suitability), evidence: canonical(evidence),
      spokenRewrite: canonical(spokenRewrite), claimSourceReview: canonical(claimSourceReview), approvedNarration: narration,
    },
  });
  assert.equal(first.approval.schemaVersion, 'autovideo-content-approval/v2');
  assert.equal(first.approval.bindings.claimSourceReviewSha256, claimReviewSha256);
  for (const fileName of ['sources.json', 'material-suitability.json', 'evidence.json', 'spoken-rewrite.json', 'claim-source-review.json', 'script.approved.txt', 'content-approval.json']) {
    await assert.doesNotReject(() => fs.access(path.join(intakeDir, fileName)));
  }
  const repeated = await approveContentChain({
    workspaceRoot, intakeDir, projectId, reviewer: 'another-reviewer',
    artifacts: {
      sources: canonical(sources), suitability: canonical(suitability), evidence: canonical(evidence),
      spokenRewrite: canonical(spokenRewrite), claimSourceReview: canonical(claimSourceReview), approvedNarration: narration,
    },
  });
  assert.equal(repeated.alreadyApproved, true);
  assert.equal(repeated.approval.approvedBy, 'human:test');

  const staleApprovalPath = path.join(intakeDir, 'content-approval.json');
  const staleApproval = JSON.parse(await fs.readFile(staleApprovalPath, 'utf8'));
  staleApproval.bindings.evidenceSha256 = '0'.repeat(64);
  await fs.writeFile(staleApprovalPath, canonical(staleApproval), 'utf8');
  const refreshed = await approveContentChain({
    workspaceRoot, intakeDir, projectId, reviewer: 'human:refresh', allowExistingIntake: true,
    artifacts: {
      sources: canonical(sources), suitability: canonical(suitability), evidence: canonical(evidence),
      spokenRewrite: canonical(spokenRewrite), claimSourceReview: canonical(claimSourceReview), approvedNarration: narration,
    },
  });
  assert.equal(refreshed.alreadyApproved, false);
  assert.equal(refreshed.approval.approvedBy, 'human:refresh');
  assert.equal(refreshed.approval.bindings.evidenceSha256, evidenceSha256);
  assert.ok(refreshed.supersededApprovalPath);
  assert.equal(JSON.parse(await fs.readFile(refreshed.supersededApprovalPath, 'utf8')).bindings.evidenceSha256, '0'.repeat(64));

  const chain = await loadPromptChain();
  const promptStage = (id) => chain.stages.find((item) => item.id === id);
  const chainedEvidence = {
    ...evidence,
    projectId,
    sourceRegisterSha256: sourcesSha256,
    suitabilitySha256,
    prompt: {id: 'evidence-extractor', sha256: promptStage('evidence-extractor').promptSha256},
    generatedAt: '2026-07-22T00:00:00.000Z',
  };
  const chainedEvidenceSha256 = sha256(Buffer.from(canonical(chainedEvidence)));
  const contentOutline = {
    schemaVersion: 'autovideo-content-outline/v1', projectId, evidenceSha256: chainedEvidenceSha256,
    prompt: {id: 'outline-planner', sha256: promptStage('outline-planner').promptSha256},
    targetSeconds: 4,
    sections: [{
      id: 'section-01', purpose: 'Explain review and rollback', kind: 'sourced', targetSeconds: 4,
      claimIds: ['claim-001'], sourceIds: [source.id], screenIntent: 'two keywords',
    }],
    reviewNotes: [], generatedAt: '2026-07-22T00:00:00.000Z',
  };
  const contentOutlineSha256 = sha256(Buffer.from(canonical(contentOutline)));
  const scriptDraft = {
    schemaVersion: 'autovideo-script-draft/v2', projectId, evidenceSha256: chainedEvidenceSha256,
    outlineSha256: contentOutlineSha256,
    prompt: {id: 'narration-writer', sha256: promptStage('narration-writer').promptSha256},
    title: 'Review', language: 'zh-CN', sections: structuredClone(spokenRewrite.sections),
    reviewNotes: [], generatedAt: '2026-07-22T00:00:00.000Z',
  };
  const scriptDraftSha256 = sha256(Buffer.from(canonical(scriptDraft)));
  const chainedRewrite = {
    ...spokenRewrite,
    evidenceSha256: chainedEvidenceSha256,
    scriptDraftSha256,
    prompt: {id: 'oralizer', sha256: promptStage('oralizer').promptSha256},
  };
  const chainedRewriteSha256 = sha256(Buffer.from(canonical(chainedRewrite)));
  const durationFit = await assessContentDuration({projectId, rewrite: chainedRewrite, targetSeconds: 4});
  assert.equal(durationFit.status, 'passed');
  const durationFitSha256 = sha256(Buffer.from(canonical(durationFit)));
  const chainedReview = await reviewClaimSources({
    workspaceRoot, sources, suitability, evidence: chainedEvidence, rewrite: chainedRewrite,
    bindings: {
      sourcesSha256, suitabilitySha256, evidenceSha256: chainedEvidenceSha256,
      spokenRewriteSha256: chainedRewriteSha256, durationFitSha256,
    },
  });
  const chainedNarration = buildApprovedNarration(chainedRewrite);
  const chained = await approveContentChain({
    workspaceRoot, intakeDir: path.join(testRoot, 'intake-chain'), projectId, reviewer: 'human:chain-test',
    artifacts: {
      sources: canonical(sources), suitability: canonical(suitability), evidence: canonical(chainedEvidence),
      contentOutline: canonical(contentOutline), scriptDraft: canonical(scriptDraft),
      spokenRewrite: canonical(chainedRewrite), durationFit: canonical(durationFit),
      claimSourceReview: canonical(chainedReview), approvedNarration: chainedNarration,
    },
  });
  assert.equal(chained.approval.bindings.contentOutlineSha256, contentOutlineSha256);
  assert.equal(chained.approval.bindings.scriptDraftSha256, scriptDraftSha256);
  assert.equal(chained.approval.bindings.durationFitSha256, durationFitSha256);
  for (const fileName of ['content-outline.json', 'script.draft.json', 'content-duration-fit.json']) {
    await assert.doesNotReject(() => fs.access(path.join(testRoot, 'intake-chain', fileName)));
  }
  await assert.rejects(
    approveContentChain({
      workspaceRoot, intakeDir: path.join(testRoot, 'intake-mismatch'), projectId, reviewer: 'human:test',
      artifacts: {
        sources: canonical(sources), suitability: canonical(suitability), evidence: canonical(evidence),
        spokenRewrite: canonical(spokenRewrite), claimSourceReview: canonical(claimSourceReview), approvedNarration: `${narration}altered\n`,
      },
    }),
    /differs from spoken-rewrite/i,
  );
});
