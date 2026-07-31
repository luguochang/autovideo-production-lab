import fs from 'node:fs/promises';
import path from 'node:path';
import {assessContentDuration} from '../../content-prompt-chain.mjs';
import {canonicalJsonSha256, loadPromptChain} from '../../content-regression.mjs';
import {readJson, sha256, sha256File, stableJson, workspaceRoot} from '../../content-contract.mjs';

const fixtureRoot = path.resolve(import.meta.dirname);
const casePath = path.join(fixtureRoot, 'zh-ai-terms-001.case.json');
const corpusPath = path.join(fixtureRoot, 'corpus.json');
const stableTime = '2026-07-22T00:00:00.000Z';
const generatorConfigSha256 = sha256('autovideo-synthetic-six-stage-fixture-v1');
const fixed = {sources: 'a'.repeat(64), suitability: 'b'.repeat(64)};

const candidateFileName = (stage) => stage === 'oralizer'
  ? 'zh-ai-terms-001.candidate.json'
  : `zh-ai-terms-001.${stage}.candidate.json`;

const candidateFor = ({caseRecord, caseSha256, stage, output}) => ({
  schemaVersion: 'autovideo-content-prompt-candidate/v1',
  caseId: caseRecord.caseId,
  stage: stage.id,
  caseSha256,
  prompt: {id: stage.id, path: stage.promptPath, sha256: stage.promptSha256},
  generator: {
    provider: 'precomputed-fixture',
    model: 'fixture-output',
    configSha256: generatorConfigSha256,
  },
  outputCanonicalization: 'stable-json-v1',
  output,
  outputSha256: canonicalJsonSha256(output),
});

export const buildStageCandidateBytes = async () => {
  const [caseRecord, caseSha256, chain] = await Promise.all([
    readJson(casePath),
    sha256File(casePath),
    loadPromptChain(),
  ]);
  const stage = (id) => chain.stages.find((item) => item.id === id);
  const baseSections = [
    {
      id: 'section-01', kind: 'sourced', targetSeconds: 14,
      narration: '截至2026年7月，这个测试记录了30次 API 调用。它说明流程有可复核的样本，但不代表所有场景都已经准备好。',
      claimIds: ['claim-sample-run'], sourceIds: ['source-001'], framing: '这是对登记材料中样本记录的事实转述。',
      onscreen: [
        {text: '30次 API 调用', kind: 'generated_summary'},
        {text: '可复核样本', kind: 'generated_summary'},
      ],
    },
    {
      id: 'section-02', kind: 'creator-opinion', targetSeconds: 16,
      narration: '我的看法是，demo 只是起点。Codex、GPT-4o 和 camelCase 这类技术词，仍要单独检查文字形式和实际发音。',
      claimIds: ['claim-terms-need-review'], sourceIds: ['source-001'], framing: '明确标记为创作者判断，不把发音建议包装成外部统计事实。',
      onscreen: [
        {text: 'demo 只是起点', kind: 'generated_summary'},
        {text: '文字与发音分开审', kind: 'generated_summary'},
      ],
    },
  ];
  const evidence = {
    ...caseRecord.evidence,
    projectId: caseRecord.caseId,
    sourceRegisterSha256: fixed.sources,
    suitabilitySha256: fixed.suitability,
    prompt: {id: 'evidence-extractor', sha256: stage('evidence-extractor').promptSha256},
    generatedAt: stableTime,
  };
  const outline = {
    schemaVersion: 'autovideo-content-outline/v1', projectId: caseRecord.caseId,
    evidenceSha256: canonicalJsonSha256(evidence),
    prompt: {id: 'outline-planner', sha256: stage('outline-planner').promptSha256},
    targetSeconds: caseRecord.brief.targetSeconds,
    sections: baseSections.map((section) => ({
      id: section.id, purpose: section.kind === 'sourced' ? '解释样本事实' : '明确创作者判断',
      kind: section.kind, targetSeconds: section.targetSeconds, claimIds: section.claimIds,
      sourceIds: section.sourceIds, screenIntent: '短关键词与事实锚点',
    })),
    reviewNotes: ['Synthetic contract fixture only.'], generatedAt: stableTime,
  };
  const draft = {
    schemaVersion: 'autovideo-script-draft/v2', projectId: caseRecord.caseId,
    evidenceSha256: canonicalJsonSha256(evidence), outlineSha256: canonicalJsonSha256(outline),
    prompt: {id: 'narration-writer', sha256: stage('narration-writer').promptSha256},
    title: '先核对技术词，再判断流程是否成熟', language: 'zh-CN', sections: structuredClone(baseSections),
    reviewNotes: ['Synthetic contract fixture only.'], generatedAt: stableTime,
  };
  const rewrite = {
    schemaVersion: 'autovideo-spoken-rewrite/v1', projectId: caseRecord.caseId,
    sourceRegisterSha256: fixed.sources, suitabilitySha256: fixed.suitability,
    evidenceSha256: canonicalJsonSha256(evidence), scriptDraftSha256: canonicalJsonSha256(draft),
    prompt: {id: 'oralizer', sha256: stage('oralizer').promptSha256},
    title: draft.title, language: 'zh-CN', sections: structuredClone(baseSections),
    reviewNotes: ['Synthetic contract fixture only; no human gold or NarrationLock authority.'], generatedAt: stableTime,
  };
  const duration = await assessContentDuration({
    projectId: caseRecord.caseId, rewrite, targetSeconds: caseRecord.brief.targetSeconds,
  });
  duration.assessedAt = stableTime;
  const verifier = {
    schemaVersion: 'autovideo-claim-source-review/v1', projectId: caseRecord.caseId,
    bindings: {
      sourcesSha256: fixed.sources, suitabilitySha256: fixed.suitability,
      evidenceSha256: canonicalJsonSha256(evidence), spokenRewriteSha256: canonicalJsonSha256(rewrite),
      durationFitSha256: canonicalJsonSha256(duration),
    },
    status: 'passed',
    checks: {registeredSources: true, knownClaims: true, sourceBindings: true, exactQuotes: true, sectionPolicies: true},
    issues: [], reviewedAt: stableTime, reviewerType: 'machine-contract',
  };
  const outputs = new Map([
    ['evidence-extractor', evidence],
    ['outline-planner', outline],
    ['narration-writer', draft],
    ['oralizer', rewrite],
    ['duration-fitter', duration],
    ['claim-verifier', verifier],
  ]);
  const files = new Map();
  for (const chainStage of chain.stages) {
    files.set(candidateFileName(chainStage.id), stableJson(candidateFor({
      caseRecord, caseSha256, stage: chainStage, output: outputs.get(chainStage.id),
    })));
  }
  const oralizerFileName = candidateFileName('oralizer');
  const oralizerCandidateSha256 = sha256(Buffer.from(files.get(oralizerFileName), 'utf8'));
  const corpus = await readJson(corpusPath);
  corpus.cases[0] = {
    ...corpus.cases[0],
    caseSha256,
    candidatePath: oralizerFileName,
    candidateSha256: oralizerCandidateSha256,
  };
  files.set('corpus.json', stableJson(corpus));
  return files;
};

const main = async () => {
  const files = await buildStageCandidateBytes();
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [fileName, bytes] of files) {
    const target = path.join(fixtureRoot, fileName);
    if (check) {
      const current = await fs.readFile(target, 'utf8').catch(() => null);
      if (current !== bytes) stale.push(fileName);
    } else {
      await fs.writeFile(target, bytes, 'utf8');
    }
  }
  if (stale.length) throw new Error(`Six-stage prompt candidates are stale: ${stale.join(', ')}`);
  console.log(JSON.stringify({ok: true, mode: check ? 'check' : 'write', files: [...files.keys()]}, null, 2));
};

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

