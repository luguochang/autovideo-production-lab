import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {workspaceRoot} from '../content-contract.mjs';

const runFile = promisify(execFile);
const runNode = (script, args) => runFile(process.execPath, [script, ...args], {
  cwd: workspaceRoot, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
});
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

test('human-gold workflow keeps review independent and never authorizes NarrationLock', async () => {
  const projectId = `human-gold-test-${process.pid}`;
  const sourceCasePath = path.join(workspaceRoot, 'tools', 'content-pipeline', 'fixtures', 'contract', 'zh-ai-terms-001.case.json');
  const sourceCandidatePath = path.join(workspaceRoot, 'tools', 'content-pipeline', 'fixtures', 'contract', 'zh-ai-terms-001.candidate.json');
  const runRoot = path.join(workspaceRoot, 'content', 'test-runs', projectId);
  const casePath = path.join(runRoot, 'case.json');
  const candidatePath = path.join(runRoot, 'candidate.json');
  const goldRoot = path.join(workspaceRoot, 'tools', 'content-pipeline', 'gold');
  const corpusPath = path.join(goldRoot, 'corpus.json');
  const scriptPath = path.join(workspaceRoot, 'scripts', 'content-gold-workflow.mjs');
  const priorCorpus = await fs.readFile(corpusPath, 'utf8').catch(() => null);
  try {
    await fs.mkdir(runRoot, {recursive: true});
    const caseRecord = await readJson(sourceCasePath);
    caseRecord.caseId = projectId;
    caseRecord.datasetClass = 'human-gold-candidate';
    caseRecord.humanGoldEligible = true;
    caseRecord.provenance = {origin: 'user-material', createdBy: 'manual-review', rights: 'user-provided; review-only'};
    await writeJson(casePath, caseRecord);
    const candidate = await readJson(sourceCandidatePath);
    candidate.caseId = projectId;
    candidate.caseSha256 = sha256(await fs.readFile(casePath));
    candidate.generator = {...candidate.generator, provider: 'codex-cli', model: 'content-model-v1'};
    candidate.output = {...candidate.output, projectId};
    // The verifier recomputes the canonical output digest; use the project helper's actual stable representation.
    candidate.outputSha256 = sha256(`${JSON.stringify(candidate.output, null, 2)}\n`);
    await writeJson(candidatePath, candidate);
    await runNode(scriptPath, ['register', '--case', path.relative(workspaceRoot, casePath), '--candidate', path.relative(workspaceRoot, candidatePath)]);
    const pending = JSON.parse((await runNode(scriptPath, ['status'])).stdout);
    assert.equal(pending.humanGoldCandidates, 1);
    assert.equal(pending.humanReviewedGoldCases, 0);
    await runNode(scriptPath, [
      'review', '--case-id', projectId, '--reviewer', '张三', '--decision', 'accepted',
      '--naturalness', '5', '--meaning', '5', '--oral-delivery', '4', '--screen-compression', '4',
      '--notes', '独立人工复核。', '--confirm-human',
    ]);
    const reviewed = JSON.parse((await runNode(scriptPath, ['status'])).stdout);
    assert.equal(reviewed.humanGoldCandidates, 1);
    assert.equal(reviewed.humanReviewedGoldCases, 1);
    assert.equal(reviewed.authorizesNarrationLock, false);
  } finally {
    await fs.rm(runRoot, {recursive: true, force: true});
    await fs.rm(path.join(goldRoot, 'candidates', projectId), {recursive: true, force: true});
    if (priorCorpus == null) await fs.rm(corpusPath, {force: true});
    else await fs.writeFile(corpusPath, priorCorpus, 'utf8');
  }
});
