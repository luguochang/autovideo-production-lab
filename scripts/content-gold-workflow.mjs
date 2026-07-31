import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertContract,
  readJson,
  sha256File,
  stableJson,
  workspaceRoot,
  writeJson,
} from '../tools/content-pipeline/content-contract.mjs';
import {
  canonicalJsonSha256,
  evaluateContentRegressionCase,
  evaluateContentRegressionCorpus,
  verifyPrecomputedCandidate,
} from '../tools/content-pipeline/content-regression.mjs';

const goldRoot = path.join(workspaceRoot, 'tools', 'content-pipeline', 'gold');
const corpusPath = path.join(goldRoot, 'corpus.json');
const parseArgs = (values) => {
  const result = {_: []};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) { result._.push(value); continue; }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else { result[key] = next; index += 1; }
  }
  return result;
};
const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const resolveWorkspace = (value, label) => {
  if (!value) throw new Error(`Missing ${label}.`);
  const target = path.resolve(workspaceRoot, value);
  if (!isInside(workspaceRoot, target)) throw new Error(`${label} must stay inside the AutoVideo workspace.`);
  return target;
};
const readCorpus = async () => {
  try { return await readJson(corpusPath); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      schemaVersion: 'autovideo-content-regression-corpus/v1',
      corpusId: `human-gold-${new Date().toISOString().slice(0, 10)}`,
      datasetClass: 'mixed-content-regression',
      humanReviewedGoldCases: 0,
      cases: [],
      policy: {syntheticCasesAuthorizeProduction: false, humanEvaluationAuthorizesNarrationLock: false},
    };
  }
};
const score = (args, key) => {
  const value = Number(args[key]);
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`--${key} must be an integer from 1 to 5.`);
  return value;
};
const updateEntry = (corpus, entry) => {
  const index = corpus.cases.findIndex((item) => item.caseId === entry.caseId);
  if (index === -1) corpus.cases.push(entry);
  else corpus.cases[index] = entry;
  return corpus;
};
const countAcceptedEvaluations = async (corpus) => {
  let count = 0;
  for (const entry of corpus.cases) {
    if (!entry.humanEvaluationPath) continue;
    const evaluation = await readJson(path.resolve(goldRoot, entry.humanEvaluationPath));
    if (evaluation.decision === 'accepted') count += 1;
  }
  return count;
};

const register = async (args) => {
  const sourceCasePath = resolveWorkspace(args.case, 'Human-gold case');
  const sourceCandidatePath = resolveWorkspace(args.candidate, 'Human-gold candidate');
  const caseRecord = await readJson(sourceCasePath);
  await assertContract('content-regression-case.schema.json', caseRecord, 'human-gold case');
  if (caseRecord.datasetClass !== 'human-gold-candidate' || caseRecord.humanGoldEligible !== true) {
    throw new Error('Gold registration requires datasetClass=human-gold-candidate and humanGoldEligible=true.');
  }
  if (caseRecord.provenance.origin === 'synthetic' || /test|fixture|machine|synthetic/i.test(caseRecord.provenance.createdBy)) {
    throw new Error('Synthetic or machine-created cases cannot enter the human-gold queue.');
  }
  const caseSha256 = await sha256File(sourceCasePath);
  const candidateVerification = await verifyPrecomputedCandidate({casePath: sourceCasePath, candidatePath: sourceCandidatePath});
  if (candidateVerification.candidate.stage !== 'oralizer' || !candidateVerification.candidate.generator?.model) {
    throw new Error('Human-gold registration requires an Oralizer candidate with a model/provider receipt.');
  }
  if (/fixture|synthetic/i.test(`${candidateVerification.candidate.generator.provider} ${candidateVerification.candidate.generator.model}`)) {
    throw new Error('Fixture candidates cannot enter the human-gold queue.');
  }
  const result = await evaluateContentRegressionCase({caseRecord, rewrite: candidateVerification.candidate.output});
  if (!result.passed) throw new Error(`Hard assertions failed: ${result.issues.map((issue) => issue.code).join(', ')}`);
  const entryRoot = path.join(goldRoot, 'candidates', caseRecord.caseId);
  await fs.mkdir(entryRoot, {recursive: true});
  await fs.copyFile(sourceCasePath, path.join(entryRoot, 'case.json'));
  await fs.copyFile(sourceCandidatePath, path.join(entryRoot, 'candidate.json'));
  await writeJson(path.join(entryRoot, 'hard-result.json'), result);
  const corpus = await readCorpus();
  const entry = {
    caseId: caseRecord.caseId,
    casePath: `candidates/${caseRecord.caseId}/case.json`,
    caseSha256,
    candidatePath: `candidates/${caseRecord.caseId}/candidate.json`,
    candidateSha256: candidateVerification.candidateBytesSha256,
  };
  updateEntry(corpus, entry);
  await assertContract('content-regression-corpus.schema.json', corpus, 'human-gold corpus');
  await writeJson(corpusPath, corpus);
  return {ok: true, caseId: caseRecord.caseId, hardAssertions: result.issues.length === 0, humanReview: 'pending', corpus: path.relative(workspaceRoot, corpusPath).replaceAll('\\', '/')};
};

const review = async (args) => {
  if (!args['confirm-human']) throw new Error('Human-gold review requires --confirm-human after independently reading/listening to the candidate.');
  const caseId = args['case-id'];
  if (!caseId) throw new Error('Missing --case-id.');
  const corpus = await readCorpus();
  const entry = corpus.cases.find((item) => item.caseId === caseId);
  if (!entry) throw new Error(`No registered human-gold candidate for ${caseId}.`);
  const casePath = path.resolve(goldRoot, entry.casePath);
  const candidatePath = path.resolve(goldRoot, entry.candidatePath);
  const verified = await verifyPrecomputedCandidate({casePath, candidatePath});
  const caseRecord = await readJson(casePath);
  const result = await evaluateContentRegressionCase({caseRecord, rewrite: verified.candidate.output});
  if (!result.passed) throw new Error('Cannot review a candidate whose hard assertions fail.');
  const reviewer = String(args.reviewer ?? '').trim();
  if (!reviewer || /test|fixture|synthetic|machine|bot|agent/i.test(reviewer)) throw new Error('Provide a real human reviewer identity; test or machine identities are rejected.');
  const evaluation = {
    schemaVersion: 'autovideo-content-human-evaluation/v1',
    caseId,
    caseSha256: verified.caseSha256,
    referenceOutputSha256: verified.candidate.outputSha256,
    hardAssertionResultSha256: canonicalJsonSha256(result),
    evaluationScope: 'prompt-regression-only',
    authorizesNarrationLock: false,
    reviewerType: 'human',
    reviewer,
    reviewedAt: new Date().toISOString(),
    decision: args.decision === 'rejected' ? 'rejected' : 'accepted',
    scores: {
      naturalness: score(args, 'naturalness'), meaning: score(args, 'meaning'),
      oralDelivery: score(args, 'oral-delivery'), screenCompression: score(args, 'screen-compression'),
    },
    notes: String(args.notes ?? '').trim(),
  };
  await assertContract('content-human-evaluation.schema.json', evaluation, 'human evaluation');
  const entryRoot = path.dirname(path.resolve(goldRoot, entry.casePath));
  const evaluationPath = path.join(entryRoot, 'human-evaluation.json');
  await writeJson(evaluationPath, evaluation);
  const evaluationSha256 = await sha256File(evaluationPath);
  updateEntry(corpus, {...entry, humanEvaluationPath: `candidates/${caseId}/human-evaluation.json`, humanEvaluationSha256: evaluationSha256});
  corpus.humanReviewedGoldCases = await countAcceptedEvaluations(corpus);
  await assertContract('content-regression-corpus.schema.json', corpus, 'human-gold corpus');
  await writeJson(corpusPath, corpus);
  return {ok: true, caseId, decision: evaluation.decision, scores: evaluation.scores, authorizesNarrationLock: false};
};

const status = async () => {
  const corpus = await readCorpus();
  if (!corpus.cases.length) return {ok: true, humanGoldCandidates: 0, humanReviewedGoldCases: 0, next: 'register a user-material case; no human approval was created'};
  const report = await evaluateContentRegressionCorpus({corpusPath});
  return {
    ok: report.passed,
    humanGoldCandidates: report.humanGoldCandidates,
    humanReviewedGoldCases: report.humanReviewedGoldCases,
    syntheticContractCases: report.syntheticContractCases,
    authorizesNarrationLock: false,
  };
};

const usage = () => [
  'Usage:',
  '  node scripts/content-gold-workflow.mjs register --case <case.json> --candidate <candidate.json>',
  '  node scripts/content-gold-workflow.mjs review --case-id <id> --reviewer <name> --decision accepted|rejected --naturalness <1-5> --meaning <1-5> --oral-delivery <1-5> --screen-compression <1-5> --confirm-human',
  '  node scripts/content-gold-workflow.mjs status',
  '',
  'Human-gold receipts validate prompt regressions only; they never authorize NarrationLock or public release.',
].join('\n');

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const handlers = {register, review, status};
try {
  if (!handlers[command]) throw new Error(usage());
  console.log(JSON.stringify(await handlers[command](args), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
