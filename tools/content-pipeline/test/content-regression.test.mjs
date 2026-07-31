import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJsonSha256,
  evaluateContentRegressionCase,
  evaluateContentRegressionCorpus,
  loadPromptChain,
  verifyPrecomputedCandidate,
} from '../content-regression.mjs';
import {readJson} from '../content-contract.mjs';
import {
  assessContentDuration,
  assertContentOutline,
  assertNarrationDraft,
  assertOralizedRewrite,
} from '../content-prompt-chain.mjs';
import {buildStageCandidateBytes} from '../fixtures/contract/build-stage-candidates.mjs';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const fixtureRoot = path.join(root, 'tools', 'content-pipeline', 'fixtures', 'contract');
const corpusPath = path.join(fixtureRoot, 'corpus.json');

test('content prompt chain is versioned, hashed, and verifies duration before claims', async () => {
  const chain = await loadPromptChain();
  assert.deepEqual(chain.stages.map((stage) => stage.id), [
    'evidence-extractor', 'outline-planner', 'narration-writer',
    'oralizer', 'duration-fitter', 'claim-verifier',
  ]);
  assert.equal(chain.stages.every((stage) => /^[a-f0-9]{64}$/u.test(stage.promptSha256)), true);
  assert.equal(chain.stages[4].mayModifyWording, false);
  assert.equal(chain.stages[5].mayModifyWording, false);
});

test('duration assessment is deterministic and never rewrites the candidate', async () => {
  const candidate = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.candidate.json'));
  const before = JSON.stringify(candidate.output);
  const report = await assessContentDuration({projectId: candidate.output.projectId, rewrite: candidate.output, targetSeconds: 30});
  assert.equal(report.status, 'passed');
  assert.equal(report.modifiesWording, false);
  assert.equal(JSON.stringify(candidate.output), before);
  assert.equal(report.spokenRewriteSha256, canonicalJsonSha256(candidate.output));
});

test('outline, writer, and oralizer consume the immediately bound upstream artifact', async () => {
  const chain = await loadPromptChain();
  const stage = (id) => chain.stages.find((item) => item.id === id);
  const caseRecord = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.case.json'));
  const candidate = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.candidate.json'));
  const evidence = caseRecord.evidence;
  const outline = {
    schemaVersion: 'autovideo-content-outline/v1', projectId: candidate.output.projectId,
    evidenceSha256: canonicalJsonSha256(evidence),
    prompt: {id: 'outline-planner', sha256: stage('outline-planner').promptSha256},
    targetSeconds: 30,
    sections: candidate.output.sections.map((section) => ({
      id: section.id, purpose: 'Contract fixture', kind: section.kind, targetSeconds: section.targetSeconds,
      claimIds: section.claimIds, sourceIds: section.sourceIds, screenIntent: 'keywords',
    })),
    reviewNotes: [], generatedAt: '2026-07-22T00:00:00.000Z',
  };
  await assertContentOutline({
    outline, projectId: candidate.output.projectId, evidence, stage: stage('outline-planner'), targetSeconds: 30,
  });
  const draft = {
    schemaVersion: 'autovideo-script-draft/v2', projectId: candidate.output.projectId,
    evidenceSha256: canonicalJsonSha256(evidence), outlineSha256: canonicalJsonSha256(outline),
    prompt: {id: 'narration-writer', sha256: stage('narration-writer').promptSha256},
    title: candidate.output.title, language: 'zh-CN', sections: structuredClone(candidate.output.sections),
    reviewNotes: [], generatedAt: '2026-07-22T00:00:00.000Z',
  };
  await assertNarrationDraft({draft, projectId: candidate.output.projectId, evidence, outline, stage: stage('narration-writer')});
  const rewrite = {
    ...structuredClone(candidate.output),
    evidenceSha256: canonicalJsonSha256(evidence),
    scriptDraftSha256: canonicalJsonSha256(draft),
    prompt: {id: 'oralizer', sha256: stage('oralizer').promptSha256},
  };
  await assertOralizedRewrite({rewrite, projectId: candidate.output.projectId, evidence, draft, stage: stage('oralizer')});
  const changed = structuredClone(rewrite);
  changed.sections[0].claimIds = ['claim-terms-need-review'];
  await assert.rejects(
    () => assertOralizedRewrite({rewrite: changed, projectId: candidate.output.projectId, evidence, draft, stage: stage('oralizer')}),
    /changed kind, claim IDs, or source IDs/i,
  );
});

test('synthetic Chinese contract corpus passes without authorizing production', async () => {
  const report = await evaluateContentRegressionCorpus({corpusPath});
  assert.equal(report.passed, true);
  assert.equal(report.syntheticContractCases, 1);
  assert.equal(report.humanReviewedGoldCases, 0);
});

test('content regression catches opinion laundering, new protected atoms, and screen overload', async () => {
  const caseRecord = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.case.json'));
  const candidate = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.candidate.json'));
  const rewrite = structuredClone(candidate.output);
  rewrite.sections[1].kind = 'sourced';
  rewrite.sections[1].narration += ' 100% 可靠。';
  rewrite.sections[1].onscreen = [
    {text: '这是一段过长的屏幕摘要，不能代替字幕并且会让画面拥挤', kind: 'generated_summary'},
    {text: '第二个摘要', kind: 'generated_summary'},
    {text: '第三个摘要', kind: 'generated_summary'},
  ];
  const result = await evaluateContentRegressionCase({caseRecord, rewrite});
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert.equal(result.passed, false);
  assert.equal(codes.has('opinion-kind-mismatch'), true);
  assert.equal(codes.has('new-protected-atom'), true);
  assert.equal(codes.has('screen-item-count'), true);
  assert.equal(codes.has('screen-item-too-long'), true);
});

test('precomputed candidate rejects a changed output digest', async () => {
  const casePath = path.join(fixtureRoot, 'zh-ai-terms-001.case.json');
  const candidatePath = path.join(fixtureRoot, 'zh-ai-terms-001.candidate.json');
  const verified = await verifyPrecomputedCandidate({casePath, candidatePath});
  assert.equal(verified.candidate.outputSha256, canonicalJsonSha256(verified.candidate.output));
  const changed = structuredClone(verified.candidate);
  changed.output.sections[0].narration += ' 改动';
  const tempPath = path.join(fixtureRoot, `.candidate-${process.pid}.json`);
  await fs.writeFile(tempPath, `${JSON.stringify(changed, null, 2)}\n`, 'utf8');
  try {
    await assert.rejects(() => verifyPrecomputedCandidate({casePath, candidatePath: tempPath}), /output SHA-256 is invalid/i);
  } finally {
    await fs.rm(tempPath, {force: true});
  }
});

test('all six prompt stages have current hash-bound precomputed candidates', async () => {
  const expected = await buildStageCandidateBytes();
  const stageFiles = [...expected.keys()].filter((name) => name.endsWith('.candidate.json'));
  assert.equal(stageFiles.length, 6);
  const stages = [];
  for (const fileName of stageFiles) {
    const filePath = path.join(fixtureRoot, fileName);
    assert.equal(await fs.readFile(filePath, 'utf8'), expected.get(fileName));
    stages.push((await verifyPrecomputedCandidate({
      casePath: path.join(fixtureRoot, 'zh-ai-terms-001.case.json'),
      candidatePath: filePath,
    })).candidate.stage);
  }
  assert.deepEqual(stages, [
    'evidence-extractor', 'outline-planner', 'narration-writer',
    'oralizer', 'duration-fitter', 'claim-verifier',
  ]);
});
