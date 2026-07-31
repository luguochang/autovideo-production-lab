import path from 'node:path';
import {
  assertContract,
  readJson,
  validateEvidence,
  workspaceRoot,
} from '../../content-contract.mjs';
import {
  canonicalJsonSha256,
  evaluateContentRegressionCase,
  loadPromptChain,
} from '../../content-regression.mjs';
import {
  assertContentOutline,
  assertCurrentDurationFit,
  assertNarrationDraft,
  assertOralizedRewrite,
} from '../../content-prompt-chain.mjs';

const candidateFileName = (caseId, stage) => stage === 'oralizer'
  ? `${caseId}.candidate.json`
  : `${caseId}.${stage}.candidate.json`;

const insideWorkspace = (candidate) => {
  const absolute = path.resolve(workspaceRoot, candidate);
  const relative = path.relative(workspaceRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Promptfoo stage fixture leaves workspace.');
  return absolute;
};

export default async function stageContractAssertion(output, context = {}) {
  try {
    const casePath = insideWorkspace(context.vars?.casePath);
    const stageId = String(context.vars?.stage ?? '');
    const [caseRecord, chain] = await Promise.all([readJson(casePath), loadPromptChain()]);
    const fixtureRoot = path.dirname(casePath);
    const candidate = async (id) => (await readJson(path.join(fixtureRoot, candidateFileName(caseRecord.caseId, id)))).output;
    const stage = (id) => chain.stages.find((item) => item.id === id);
    const value = JSON.parse(output);
    let detail = '';

    if (stageId === 'evidence-extractor') {
      await validateEvidence(value);
      if (value.projectId !== caseRecord.caseId
        || value.prompt?.id !== stageId
        || value.prompt?.sha256 !== stage(stageId).promptSha256) {
        throw new Error('Evidence candidate is not bound to the current case and prompt.');
      }
      if (JSON.stringify(value.claims) !== JSON.stringify(caseRecord.evidence.claims)) {
        throw new Error('Evidence candidate changed the synthetic case claim ledger.');
      }
      detail = `${value.claims.length} claims preserved`;
    } else if (stageId === 'outline-planner') {
      const evidence = await candidate('evidence-extractor');
      await assertContentOutline({
        outline: value, projectId: caseRecord.caseId, evidence,
        stage: stage(stageId), targetSeconds: caseRecord.brief.targetSeconds,
      });
      detail = `${value.sections.length} outline sections bound`;
    } else if (stageId === 'narration-writer') {
      const [evidence, outline] = await Promise.all([candidate('evidence-extractor'), candidate('outline-planner')]);
      await assertNarrationDraft({draft: value, projectId: caseRecord.caseId, evidence, outline, stage: stage(stageId)});
      detail = `${value.sections.length} draft sections bound`;
    } else if (stageId === 'oralizer') {
      const [evidence, draft] = await Promise.all([candidate('evidence-extractor'), candidate('narration-writer')]);
      await assertOralizedRewrite({rewrite: value, projectId: caseRecord.caseId, evidence, draft, stage: stage(stageId)});
      const result = await evaluateContentRegressionCase({caseRecord, rewrite: value});
      if (!result.passed) throw new Error(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'));
      detail = `${result.metrics.coveredClaimCount} claims and screen compression passed`;
    } else if (stageId === 'duration-fitter') {
      const rewrite = await candidate('oralizer');
      await assertCurrentDurationFit({record: value, projectId: caseRecord.caseId, rewrite});
      if (value.modifiesWording !== false) throw new Error('Duration stage must not modify wording.');
      detail = `${value.targetSeconds}s text budget passed without rewriting`;
    } else if (stageId === 'claim-verifier') {
      const [evidence, rewrite, duration] = await Promise.all([
        candidate('evidence-extractor'), candidate('oralizer'), candidate('duration-fitter'),
      ]);
      await assertContract('claim-source-review.schema.json', value, 'claim verifier candidate');
      const expected = {
        evidenceSha256: canonicalJsonSha256(evidence),
        spokenRewriteSha256: canonicalJsonSha256(rewrite),
        durationFitSha256: canonicalJsonSha256(duration),
      };
      for (const [key, digest] of Object.entries(expected)) {
        if (value.bindings?.[key] !== digest) throw new Error(`Claim verifier has a stale ${key}.`);
      }
      if (value.status !== 'passed' || value.issues.length) throw new Error('Claim verifier synthetic fixture did not pass cleanly.');
      const result = await evaluateContentRegressionCase({caseRecord, rewrite});
      if (!result.passed) throw new Error('Claim verifier is bound to a rewrite that fails the content contract.');
      detail = 'final claim verification passed after duration assessment';
    } else {
      throw new Error(`Unknown Promptfoo stage ${stageId}.`);
    }

    return {
      pass: true,
      score: 1,
      reason: `${stageId}: ${detail}; synthetic fixture only, no human approval authority.`,
      metadata: {caseId: caseRecord.caseId, stage: stageId, datasetClass: caseRecord.datasetClass, humanGoldEligible: false},
    };
  } catch (error) {
    return {pass: false, score: 0, reason: error.message};
  }
}
