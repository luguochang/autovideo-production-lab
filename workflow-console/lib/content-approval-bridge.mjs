import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertContentApprovalForNarration,
  assertContract,
  buildApprovedNarration,
  buildContentApproval,
  readJson,
  reviewClaimSources,
  sha256,
  validateEvidence,
  validateSpokenRewrite,
  writeJson,
} from '../../tools/content-pipeline/content-contract.mjs';
import {loadPromptChain} from '../../tools/content-pipeline/content-regression.mjs';
import {
  assertContentOutline,
  assertCurrentDurationFit,
  assertEvidenceArtifact,
  assertNarrationDraft,
  assertOralizedRewrite,
} from '../../tools/content-pipeline/content-prompt-chain.mjs';

const FILES = Object.freeze({
  sources: 'sources.json',
  suitability: 'material-suitability.json',
  evidence: 'evidence.json',
  contentOutline: 'content-outline.json',
  scriptDraft: 'script.draft.json',
  spokenRewrite: 'spoken-rewrite.json',
  durationFit: 'content-duration-fit.json',
  claimSourceReview: 'claim-source-review.json',
  approvedNarration: 'script.approved.txt',
  contentApproval: 'content-approval.json',
});

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const textBytes = (value) => Buffer.from(String(value), 'utf8');
const bindingFor = (value) => sha256(Buffer.isBuffer(value) ? value : Buffer.from(value));

const parseArtifactJson = (artifacts, key) => {
  const value = artifacts?.[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${FILES[key]} artifact.`);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${FILES[key]} is invalid JSON: ${error.message}`);
  }
};

const parseOptionalArtifactJson = (artifacts, key) => {
  const value = artifacts?.[key];
  if (value == null || value === '') return null;
  return parseArtifactJson(artifacts, key);
};

const currentBindings = (values) => ({
  sourcesSha256: bindingFor(jsonBytes(values.sources)),
  suitabilitySha256: bindingFor(jsonBytes(values.suitability)),
  evidenceSha256: bindingFor(jsonBytes(values.evidence)),
  ...(values.contentOutline ? {contentOutlineSha256: bindingFor(jsonBytes(values.contentOutline))} : {}),
  ...(values.scriptDraft ? {scriptDraftSha256: bindingFor(jsonBytes(values.scriptDraft))} : {}),
  spokenRewriteSha256: bindingFor(jsonBytes(values.spokenRewrite)),
  ...(values.durationFit ? {durationFitSha256: bindingFor(jsonBytes(values.durationFit))} : {}),
  claimSourceReviewSha256: bindingFor(jsonBytes(values.claimSourceReview)),
});

const assertBindings = (values, bindings) => {
  if (values.suitability.sourceRegister?.sha256 !== bindings.sourcesSha256) {
    throw new Error('material-suitability.json is not bound to the current sources.json. Regenerate the diagnosis.');
  }
  const rewriteBindings = {
    sourceRegisterSha256: bindings.sourcesSha256,
    suitabilitySha256: bindings.suitabilitySha256,
    evidenceSha256: bindings.evidenceSha256,
  };
  for (const [key, expected] of Object.entries(rewriteBindings)) {
    if (values.spokenRewrite[key] !== expected) {
      throw new Error(`spoken-rewrite.json has a stale ${key}. Regenerate the spoken rewrite.`);
    }
  }
  if (bindings.scriptDraftSha256 && values.spokenRewrite.scriptDraftSha256 !== bindings.scriptDraftSha256) {
    throw new Error('spoken-rewrite.json has a stale scriptDraftSha256. Regenerate oralization.');
  }
  const reviewBindings = {
    sourcesSha256: bindings.sourcesSha256,
    suitabilitySha256: bindings.suitabilitySha256,
    evidenceSha256: bindings.evidenceSha256,
    spokenRewriteSha256: bindings.spokenRewriteSha256,
    ...(bindings.durationFitSha256 ? {durationFitSha256: bindings.durationFitSha256} : {}),
  };
  for (const [key, expected] of Object.entries(reviewBindings)) {
    if (values.claimSourceReview.bindings?.[key] !== expected) {
      throw new Error(`claim-source-review.json has a stale ${key}. Regenerate claim review.`);
    }
  }
};

const loadExistingApproval = async ({intakeDir, projectId}) => {
  const approvalPath = path.join(intakeDir, FILES.contentApproval);
  try {
    const approval = await readJson(approvalPath);
    const narration = await fs.readFile(path.join(intakeDir, FILES.approvedNarration), 'utf8');
    return {approval, narration, approvalPath};
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const sameStringSet = (left = [], right = []) => left.length === right.length
  && [...left].sort().every((value, index) => value === [...right].sort()[index]);

const existingApprovalMatches = async ({existing, projectId, narration, bindings, warningCodes}) => {
  if (!existing) return false;
  try {
    await assertContentApprovalForNarration({approval: existing.approval, projectId, narrationText: narration});
  } catch {
    return false;
  }
  return Object.entries(bindings).every(([key, value]) => existing.approval.bindings?.[key] === value)
    && Object.keys(existing.approval.bindings ?? {}).every((key) => key in bindings)
    && sameStringSet(existing.approval.acceptedWarnings ?? [], warningCodes);
};

export const approveContentChain = async ({
  workspaceRoot,
  intakeDir,
  projectId,
  reviewer,
  artifacts,
  acceptedWarnings = [],
  allowExistingIntake = false,
  chainSubdirectory = null,
}) => {
  const values = {
    sources: parseArtifactJson(artifacts, 'sources'),
    suitability: parseArtifactJson(artifacts, 'suitability'),
    evidence: parseArtifactJson(artifacts, 'evidence'),
    contentOutline: parseOptionalArtifactJson(artifacts, 'contentOutline'),
    scriptDraft: parseOptionalArtifactJson(artifacts, 'scriptDraft'),
    spokenRewrite: parseArtifactJson(artifacts, 'spokenRewrite'),
    durationFit: parseOptionalArtifactJson(artifacts, 'durationFit'),
    claimSourceReview: parseArtifactJson(artifacts, 'claimSourceReview'),
  };
  await assertContract('sources.schema.json', values.sources);
  await assertContract('material-suitability.schema.json', values.suitability);
  await validateEvidence(values.evidence);
  await validateSpokenRewrite(values.spokenRewrite);
  await assertContract('claim-source-review.schema.json', values.claimSourceReview);
  if (Boolean(values.contentOutline) !== Boolean(values.scriptDraft)) {
    throw new Error('Prompt-chain approval requires content-outline.json and script.draft.json together.');
  }
  if (values.contentOutline && !values.durationFit) {
    throw new Error('Prompt-chain approval requires content-duration-fit.json after oralization.');
  }
  if (values.contentOutline) {
    const chain = await loadPromptChain();
    const stage = (id) => chain.stages.find((item) => item.id === id);
    await assertEvidenceArtifact({
      evidence: values.evidence,
      projectId,
      sources: values.sources,
      suitability: values.suitability,
      stage: stage('evidence-extractor'),
    });
    await assertContentOutline({
      outline: values.contentOutline,
      projectId,
      evidence: values.evidence,
      stage: stage('outline-planner'),
      targetSeconds: values.contentOutline.targetSeconds,
    });
    await assertNarrationDraft({
      draft: values.scriptDraft,
      projectId,
      evidence: values.evidence,
      outline: values.contentOutline,
      stage: stage('narration-writer'),
    });
    await assertOralizedRewrite({
      rewrite: values.spokenRewrite,
      projectId,
      evidence: values.evidence,
      draft: values.scriptDraft,
      stage: stage('oralizer'),
    });
    await assertCurrentDurationFit({record: values.durationFit, projectId, rewrite: values.spokenRewrite});
  } else if (values.durationFit) {
    await assertCurrentDurationFit({record: values.durationFit, projectId, rewrite: values.spokenRewrite});
  }
  if ([values.sources, values.suitability, values.spokenRewrite, values.claimSourceReview]
    .some((value) => value.projectId !== projectId)) {
    throw new Error('Content-chain artifacts do not belong to the current project.');
  }

  const bindings = currentBindings(values);
  assertBindings(values, bindings);
  const recomputedReview = await reviewClaimSources({
    workspaceRoot,
    sources: values.sources,
    suitability: values.suitability,
    evidence: values.evidence,
    rewrite: values.spokenRewrite,
    bindings: {
      sourcesSha256: bindings.sourcesSha256,
      suitabilitySha256: bindings.suitabilitySha256,
      evidenceSha256: bindings.evidenceSha256,
      spokenRewriteSha256: bindings.spokenRewriteSha256,
      ...(bindings.durationFitSha256 ? {durationFitSha256: bindings.durationFitSha256} : {}),
    },
  });
  if (recomputedReview.status === 'failed') throw new Error('Claim/source review failed against the current artifacts.');
  const warningCodes = recomputedReview.issues.filter((item) => item.severity === 'warning').map((item) => item.code);
  const accepted = new Set(acceptedWarnings);
  const unaccepted = warningCodes.filter((code) => !accepted.has(code));
  if (unaccepted.length) throw new Error(`Claim/source review still needs human decisions: ${unaccepted.join(', ')}.`);

  const narration = buildApprovedNarration(values.spokenRewrite);
  if (String(artifacts.approvedNarration ?? '').replace(/\r\n/g, '\n') !== narration) {
    throw new Error('The reviewed narration differs from spoken-rewrite.json. Edit the spoken rewrite and rerun claim review before approval.');
  }
  const built = await buildContentApproval({
    projectId,
    bindings,
    narrationText: narration,
    reviewer,
    acceptedWarnings: warningCodes,
  });

  const existing = await loadExistingApproval({intakeDir, projectId});
  if (await existingApprovalMatches({existing, projectId, narration, bindings, warningCodes})) {
    return {...existing, alreadyApproved: true};
  }

  const stagingDir = `${intakeDir}.tmp-${crypto.randomUUID()}`;
  await fs.mkdir(path.dirname(intakeDir), {recursive: true});
  let intakeExists = false;
  try {
    await fs.access(intakeDir);
    intakeExists = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (intakeExists && !allowExistingIntake) {
    throw new Error('The content intake directory already exists without a current chain approval. Start a new content intake revision.');
  }

  let backupDir = null;
  try {
    if (intakeExists) await fs.cp(intakeDir, stagingDir, {recursive: true, errorOnExist: true});
    else await fs.mkdir(stagingDir, {recursive: true});
    const chainDir = chainSubdirectory ? path.join(stagingDir, chainSubdirectory) : stagingDir;
    await fs.mkdir(chainDir, {recursive: true});
    await Promise.all([
      writeJson(path.join(chainDir, FILES.sources), values.sources),
      writeJson(path.join(chainDir, FILES.suitability), values.suitability),
      writeJson(path.join(chainDir, FILES.evidence), values.evidence),
      ...(values.contentOutline ? [writeJson(path.join(chainDir, FILES.contentOutline), values.contentOutline)] : []),
      ...(values.scriptDraft ? [writeJson(path.join(chainDir, FILES.scriptDraft), values.scriptDraft)] : []),
      writeJson(path.join(chainDir, FILES.spokenRewrite), values.spokenRewrite),
      ...(values.durationFit ? [writeJson(path.join(chainDir, FILES.durationFit), values.durationFit)] : []),
      writeJson(path.join(chainDir, FILES.claimSourceReview), values.claimSourceReview),
      fs.writeFile(path.join(stagingDir, FILES.approvedNarration), textBytes(built.narration)),
      writeJson(path.join(stagingDir, FILES.contentApproval), built.record),
    ]);
    if (intakeExists) {
      const timestamp = new Date().toISOString().replace(/[.:]/gu, '-');
      backupDir = path.join(path.dirname(intakeDir), '.history', 'content-approval', `${timestamp}-${crypto.randomUUID()}`);
      await fs.mkdir(path.dirname(backupDir), {recursive: true});
      await fs.rename(intakeDir, backupDir);
      try {
        await fs.rename(stagingDir, intakeDir);
      } catch (error) {
        await fs.rename(backupDir, intakeDir).catch(() => undefined);
        backupDir = null;
        throw error;
      }
    } else {
      await fs.rename(stagingDir, intakeDir);
    }
  } catch (error) {
    await fs.rm(stagingDir, {recursive: true, force: true});
    throw error;
  }
  return {
    approval: built.record,
    narration: built.narration,
    approvalPath: path.join(intakeDir, FILES.contentApproval),
    alreadyApproved: false,
    supersededApprovalPath: backupDir ? path.join(backupDir, FILES.contentApproval) : null,
  };
};

export const contentApprovalFiles = FILES;
