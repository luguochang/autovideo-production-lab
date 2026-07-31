import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertContract,
  evidenceClaimKind,
  evidenceQuotes,
  evidenceSourceIds,
  evidenceSupportStatus,
  readJson,
  sha256,
  sha256File,
  stableJson,
  validateEvidence,
  validateSpokenRewrite,
  workspaceRoot,
} from './content-contract.mjs';

const PROMPT_CHAIN_PATH = path.join(workspaceRoot, 'tools', 'content-pipeline', 'prompt-chain', 'manifest.json');
const PROTECTED_ATOM = /[A-Za-z][A-Za-z0-9]*(?:[-_.+][A-Za-z0-9]+)*|\d+(?:[.,]\d+)*(?:%|％)?/gu;
const URL_OR_MARKUP = /https?:\/\/|```|^\s{0,3}#{1,6}\s/mu;

export const canonicalJsonSha256 = (value) => sha256(stableJson(value));
export const graphemeLength = (value) => Array.from(String(value ?? '').normalize('NFC')).length;

const normalizeAtom = (value) => /[A-Za-z]/u.test(value) ? value.toLowerCase() : value;

export const extractProtectedAtoms = (value) => [...String(value ?? '').matchAll(PROTECTED_ATOM)]
  .map((match) => match[0]);

const sentenceLengths = (value) => String(value ?? '')
  .split(/[。！？!?；;\n]+/u)
  .map((item) => item.trim())
  .filter(Boolean)
  .map(graphemeLength);

const addIssue = (issues, code, message, context = {}) => issues.push({code, message, ...context});

export const loadPromptChain = async () => {
  const manifest = await readJson(PROMPT_CHAIN_PATH);
  if (manifest.schemaVersion !== 'autovideo-content-prompt-chain/v1') {
    throw new Error('Unsupported content prompt chain manifest.');
  }
  const expectedOrder = [
    'evidence-extractor', 'outline-planner', 'narration-writer',
    'oralizer', 'duration-fitter', 'claim-verifier',
  ];
  if (manifest.stages.map((stage) => stage.id).join('|') !== expectedOrder.join('|')) {
    throw new Error('Content prompt stages are missing or out of order. Claim verification must follow duration fitting.');
  }
  const stages = [];
  for (const stage of manifest.stages) {
    const promptPath = path.resolve(workspaceRoot, stage.promptPath);
    const relative = path.relative(workspaceRoot, promptPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Prompt path leaves workspace: ${stage.promptPath}`);
    stages.push({...stage, promptSha256: await sha256File(promptPath)});
  }
  return {...manifest, stages};
};

export const evaluateContentRegressionCase = async ({caseRecord, rewrite}) => {
  await assertContract('content-regression-case.schema.json', caseRecord, `content regression case ${caseRecord?.caseId ?? ''}`);
  await validateEvidence(caseRecord.evidence);
  await validateSpokenRewrite(rewrite);
  if (caseRecord.datasetClass === 'synthetic-contract' && caseRecord.humanGoldEligible) {
    throw new Error('Synthetic contract cases cannot be marked humanGoldEligible.');
  }

  const issues = [];
  const claimMap = new Map(caseRecord.evidence.claims.map((claim) => [claim.id, claim]));
  const coveredClaims = new Set();
  const narration = rewrite.sections.map((section) => section.narration).join('\n');
  const narrationGraphemes = graphemeLength(narration);
  const screenItems = rewrite.sections.flatMap((section) => section.onscreen.map((item) => ({section, item})));
  const screenGraphemes = screenItems.reduce((sum, {item}) => sum + graphemeLength(item.text), 0);
  const evidenceAtoms = caseRecord.evidence.schemaVersion === 'autovideo-evidence/v2'
    ? new Set([
      ...caseRecord.evidence.protectedAtoms.flatMap((atom) => [atom.sourceSurface, atom.canonicalValue, ...atom.allowedNarrationForms]),
      ...caseRecord.evidence.terms.flatMap((term) => [term.token, ...term.allowedWrittenForms]),
    ].map(normalizeAtom))
    : new Set(caseRecord.evidence.claims
      .flatMap((claim) => extractProtectedAtoms(`${claim.statement}\n${evidenceQuotes(claim).join('\n')}`))
      .map(normalizeAtom));
  const allowedAtoms = new Set([
    ...evidenceAtoms,
    ...caseRecord.expectations.allowedNewProtectedAtoms.map(normalizeAtom),
  ]);

  for (const section of rewrite.sections) {
    if (section.kind !== 'transition' && section.claimIds.length === 0) {
      addIssue(issues, 'section-claim-empty', `${section.id} must bind at least one claim.`, {sectionId: section.id});
    }
    if (section.kind === 'transition' && section.sourceIds.length) {
      addIssue(issues, 'transition-source-bound', `${section.id} transition cannot carry source IDs.`, {sectionId: section.id});
    }
    for (const claimId of section.claimIds) {
      const claim = claimMap.get(claimId);
      if (!claim) {
        addIssue(issues, 'unknown-claim', `${section.id} references unknown claim ${claimId}.`, {sectionId: section.id, claimId});
        continue;
      }
      coveredClaims.add(claimId);
      for (const sourceId of evidenceSourceIds(claim)) {
        if (!section.sourceIds.includes(sourceId)) {
          addIssue(issues, 'claim-source-unbound', `${section.id} does not bind source ${sourceId}.`, {sectionId: section.id, claimId});
        }
      }
      if (evidenceClaimKind(claim) === 'creator-opinion' && section.kind !== 'creator-opinion') {
        addIssue(issues, 'opinion-kind-mismatch', `${claimId} must remain a creator-opinion section.`, {sectionId: section.id, claimId});
      }
      if (evidenceClaimKind(claim) !== 'creator-opinion' && section.kind === 'creator-opinion') {
        addIssue(issues, 'opinion-kind-mismatch', `${claimId} cannot become a creator-opinion section.`, {sectionId: section.id, claimId});
      }
      if (evidenceClaimKind(claim) === 'source-opinion' && !section.framing.trim()) {
        addIssue(issues, 'source-opinion-unframed', `${claimId} requires source attribution framing.`, {sectionId: section.id, claimId});
      }
      if (evidenceSupportStatus(claim) === 'disputed' && !section.framing.trim()) {
        addIssue(issues, 'disputed-framing-missing', `${claimId} requires explicit disputed framing.`, {sectionId: section.id, claimId});
      }
    }
    for (const length of sentenceLengths(section.narration)) {
      if (length > caseRecord.expectations.maxSentenceGraphemes) {
        addIssue(issues, 'sentence-too-long', `${section.id} contains a ${length}-grapheme sentence.`, {sectionId: section.id});
      }
    }
    if (URL_OR_MARKUP.test(section.narration)) {
      addIssue(issues, 'non-spoken-markup', `${section.id} contains URL or Markdown syntax.`, {sectionId: section.id});
    }
    if (section.onscreen.length > caseRecord.expectations.maxScreenItemsPerSection) {
      addIssue(issues, 'screen-item-count', `${section.id} has too many screen items.`, {sectionId: section.id});
    }
    for (const item of section.onscreen) {
      if (graphemeLength(item.text) > caseRecord.expectations.maxScreenItemGraphemes) {
        addIssue(issues, 'screen-item-too-long', `${section.id} screen text is too long.`, {sectionId: section.id});
      }
      if (item.text.trim() === section.narration.trim()) {
        addIssue(issues, 'screen-copies-narration', `${section.id} screen text duplicates narration.`, {sectionId: section.id});
      }
      if (item.kind === 'exact_excerpt') {
        const quotes = section.claimIds.flatMap((claimId) => {
          const claim = claimMap.get(claimId);
          return claim ? evidenceQuotes(claim) : [];
        });
        if (!quotes.some((quote) => quote.includes(item.text)) && !section.narration.includes(item.text)) {
          addIssue(issues, 'exact-excerpt-unbound', `${section.id} exact excerpt is not present in a bound quote or narration.`, {sectionId: section.id});
        }
      }
      if (item.kind === 'generated_summary') {
        const boundClaims = section.claimIds.map((claimId) => claimMap.get(claimId)).filter(Boolean);
        const boundAtoms = caseRecord.evidence.schemaVersion === 'autovideo-evidence/v2'
          ? new Set([
            ...boundClaims.flatMap((claim) => claim.protectedAtomIds)
              .map((atomId) => caseRecord.evidence.protectedAtoms.find((atom) => atom.id === atomId))
              .filter(Boolean)
              .flatMap((atom) => [atom.sourceSurface, atom.canonicalValue, ...atom.allowedNarrationForms]),
            ...caseRecord.evidence.terms
              .filter((term) => boundClaims.some((claim) => [claim.statement, ...evidenceQuotes(claim)].join('\n').toLowerCase().includes(term.token.toLowerCase())))
              .flatMap((term) => [term.token, ...term.allowedWrittenForms]),
          ].map(normalizeAtom))
          : new Set(boundClaims
            .flatMap((claim) => extractProtectedAtoms(`${claim.statement}\n${evidenceQuotes(claim).join('\n')}`))
            .map(normalizeAtom));
        for (const atom of extractProtectedAtoms(item.text)) {
          if (!boundAtoms.has(normalizeAtom(atom)) && !caseRecord.expectations.allowedNewProtectedAtoms.map(normalizeAtom).includes(normalizeAtom(atom))) {
            addIssue(issues, 'screen-summary-new-atom', `${section.id} screen summary introduces ${atom}.`, {sectionId: section.id, atom});
          }
        }
      }
    }
  }

  for (const claimId of caseRecord.expectations.requiredClaimIds) {
    if (!coveredClaims.has(claimId)) addIssue(issues, 'required-claim-missing', `Required claim ${claimId} is not covered.`, {claimId});
  }
  for (const rule of caseRecord.expectations.claimSectionKinds) {
    const kinds = rewrite.sections.filter((section) => section.claimIds.includes(rule.claimId)).map((section) => section.kind);
    if (!kinds.length || kinds.some((kind) => !rule.allowedKinds.includes(kind))) {
      addIssue(issues, 'claim-section-kind', `${rule.claimId} is not in an allowed section kind.`, {claimId: rule.claimId});
    }
  }
  for (const token of caseRecord.expectations.requiredNarrationTokens) {
    if (!narration.includes(token)) addIssue(issues, 'required-token-missing', `Narration does not preserve ${token}.`, {token});
  }
  for (const token of caseRecord.expectations.forbiddenNarrationTokens) {
    if (narration.includes(token)) addIssue(issues, 'forbidden-token-present', `Narration contains forbidden token ${token}.`, {token});
  }
  for (const atom of extractProtectedAtoms(`${narration}\n${screenItems.map(({item}) => item.text).join('\n')}`)) {
    if (!allowedAtoms.has(normalizeAtom(atom))) {
      addIssue(issues, 'new-protected-atom', `Candidate introduces unregistered protected atom ${atom}.`, {atom});
    }
  }

  const durationBudgetSeconds = rewrite.sections.reduce((sum, section) => sum + section.targetSeconds, 0);
  if (Math.abs(durationBudgetSeconds - caseRecord.brief.targetSeconds) > caseRecord.brief.toleranceSeconds) {
    addIssue(issues, 'duration-budget-drift', `Section budget ${durationBudgetSeconds}s misses target ${caseRecord.brief.targetSeconds}s.`);
  }
  if (narrationGraphemes < caseRecord.expectations.minNarrationGraphemes
    || narrationGraphemes > caseRecord.expectations.maxNarrationGraphemes) {
    addIssue(issues, 'narration-length-band', `Narration length ${narrationGraphemes} is outside the fixture band.`);
  }
  const screenCoverageRatio = narrationGraphemes ? screenGraphemes / narrationGraphemes : 1;
  if (screenCoverageRatio > caseRecord.expectations.maxScreenCoverageRatio) {
    addIssue(issues, 'screen-coverage-ratio', `Screen copy ratio ${screenCoverageRatio.toFixed(3)} exceeds the fixture limit.`);
  }

  return {
    schemaVersion: 'autovideo-content-regression-result/v1',
    caseId: caseRecord.caseId,
    datasetClass: caseRecord.datasetClass,
    humanGoldEligible: caseRecord.humanGoldEligible,
    passed: issues.length === 0,
    metrics: {
      sectionCount: rewrite.sections.length,
      coveredClaimCount: coveredClaims.size,
      narrationGraphemes,
      screenGraphemes,
      screenCoverageRatio,
      durationBudgetSeconds,
      targetSeconds: caseRecord.brief.targetSeconds,
    },
    issues,
  };
};

export const verifyPrecomputedCandidate = async ({casePath, candidatePath}) => {
  const [caseRecord, candidate, chain] = await Promise.all([
    readJson(casePath),
    readJson(candidatePath),
    loadPromptChain(),
  ]);
  await assertContract('content-prompt-candidate.schema.json', candidate, 'content prompt candidate');
  const stage = chain.stages.find((item) => item.id === candidate.stage);
  if (!stage) throw new Error(`Unknown prompt stage ${candidate.stage}.`);
  const [caseSha256, candidateBytesSha256] = await Promise.all([sha256File(casePath), sha256File(candidatePath)]);
  if (candidate.caseId !== caseRecord.caseId || candidate.caseSha256 !== caseSha256) {
    throw new Error('Prompt candidate is not bound to the current regression case bytes.');
  }
  if (candidate.prompt.id !== stage.id || candidate.prompt.path !== stage.promptPath || candidate.prompt.sha256 !== stage.promptSha256) {
    throw new Error('Prompt candidate is stale for the current prompt bytes.');
  }
  if (candidate.outputSha256 !== canonicalJsonSha256(candidate.output)) {
    throw new Error('Prompt candidate output SHA-256 is invalid.');
  }
  return {caseRecord, candidate, stage, caseSha256, candidateBytesSha256};
};

export const evaluateContentRegressionCorpus = async ({corpusPath}) => {
  const corpus = await readJson(corpusPath);
  await assertContract('content-regression-corpus.schema.json', corpus, 'content regression corpus');
  const corpusRoot = path.dirname(corpusPath);
  const results = [];
  let syntheticContractCases = 0;
  let humanGoldCandidates = 0;
  let humanReviewedGoldCases = 0;
  for (const entry of corpus.cases) {
    const casePath = path.resolve(corpusRoot, entry.casePath);
    const candidatePath = path.resolve(corpusRoot, entry.candidatePath);
    const relativeCase = path.relative(corpusRoot, casePath);
    const relativeCandidate = path.relative(corpusRoot, candidatePath);
    if (relativeCase.startsWith('..') || relativeCandidate.startsWith('..')) throw new Error('Regression corpus paths must stay inside the corpus directory.');
    const verified = await verifyPrecomputedCandidate({casePath, candidatePath});
    if (entry.caseId !== verified.caseRecord.caseId
      || entry.caseSha256 !== verified.caseSha256
      || entry.candidateSha256 !== verified.candidateBytesSha256) {
      throw new Error(`Corpus entry ${entry.caseId} has stale file bindings.`);
    }
    const result = await evaluateContentRegressionCase({caseRecord: verified.caseRecord, rewrite: verified.candidate.output});
    results.push(result);
    if (verified.caseRecord.datasetClass === 'synthetic-contract') {
      syntheticContractCases += 1;
      if (entry.humanEvaluationPath || entry.humanEvaluationSha256) {
        throw new Error(`Synthetic case ${entry.caseId} cannot carry a human-gold evaluation receipt.`);
      }
      continue;
    }
    if (verified.caseRecord.datasetClass !== 'human-gold-candidate' || !verified.caseRecord.humanGoldEligible) {
      throw new Error(`Case ${entry.caseId} is not eligible for the human-gold corpus.`);
    }
    humanGoldCandidates += 1;
    const hasEvaluation = Boolean(entry.humanEvaluationPath || entry.humanEvaluationSha256);
    if (!hasEvaluation) continue;
    if (!entry.humanEvaluationPath || !entry.humanEvaluationSha256) {
      throw new Error(`Human evaluation path/SHA pair is incomplete for ${entry.caseId}.`);
    }
    const evaluationPath = path.resolve(corpusRoot, entry.humanEvaluationPath);
    const relativeEvaluation = path.relative(corpusRoot, evaluationPath);
    if (relativeEvaluation.startsWith('..') || path.isAbsolute(relativeEvaluation)) {
      throw new Error('Human evaluation path must stay inside the corpus directory.');
    }
    const [evaluation, evaluationSha256] = await Promise.all([readJson(evaluationPath), sha256File(evaluationPath)]);
    await assertContract('content-human-evaluation.schema.json', evaluation, `human evaluation ${entry.caseId}`);
    if (evaluationSha256 !== entry.humanEvaluationSha256
      || evaluation.caseId !== entry.caseId
      || evaluation.caseSha256 !== verified.caseSha256
      || evaluation.referenceOutputSha256 !== verified.candidate.outputSha256
      || evaluation.hardAssertionResultSha256 !== canonicalJsonSha256(result)) {
      throw new Error(`Human evaluation bindings are stale for ${entry.caseId}.`);
    }
    if (/test|fixture|synthetic|machine|bot|agent/i.test(evaluation.reviewer)) {
      throw new Error(`Non-human or test reviewer cannot count as human gold for ${entry.caseId}.`);
    }
    if (evaluation.decision === 'accepted' && result.passed) humanReviewedGoldCases += 1;
  }
  if (corpus.humanReviewedGoldCases !== humanReviewedGoldCases) {
    throw new Error(`Corpus declares ${corpus.humanReviewedGoldCases} human-reviewed gold case(s), but ${humanReviewedGoldCases} valid receipt(s) were found.`);
  }
  return {
    schemaVersion: 'autovideo-content-regression-report/v1',
    corpusId: corpus.corpusId,
    datasetClass: corpus.datasetClass,
    syntheticContractCases,
    humanGoldCandidates,
    humanReviewedGoldCases,
    passed: results.every((result) => result.passed),
    results,
  };
};
