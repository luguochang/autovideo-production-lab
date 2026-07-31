import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';

import {
  buildPronunciationGuide,
  scanPronunciationEntries,
  validatePronunciationGuide,
} from '../../tools/voice-lab/pronunciation-contract.mjs';
import {
  approvePronunciationAutomatically,
  approvePronunciationReview,
  approvePronunciationSelectionWithoutFullListening,
  buildPronunciationReview,
  reopenPronunciationReview,
  savePronunciationReview,
} from '../lib/pronunciation-review.mjs';

const testRoot = path.resolve(import.meta.dirname, '..', 'data', `pronunciation-test-${process.pid}`);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, serialize(value), 'utf8');
};

const prepareEvidence = async ({projectId, narration, acronymOnly = false}) => {
  const formalRoot = path.join(testRoot, projectId);
  const narrationPath = path.join(formalRoot, 'input', 'narration.approved.txt');
  const narrationSha256 = sha256(narration);
  await fs.mkdir(path.dirname(narrationPath), {recursive: true});
  await fs.writeFile(narrationPath, narration, 'utf8');
  await writeJson(path.join(formalRoot, 'NarrationLock.json'), {
    projectId,
    frozenPath: 'input/narration.approved.txt',
    normalizedSha256: narrationSha256,
  });
  const guide = buildPronunciationGuide({projectId, narrationSha256, narration});
  const guidePath = path.join(formalRoot, 'input', 'pronunciation.json');
  await writeJson(guidePath, guide);

  const probes = [];
  if (!acronymOnly) {
    for (const [index, entry] of guide.entries.filter((item) => item.kind !== 'letter-acronym').entries()) {
      const candidates = [];
      for (const suffix of ['a', 'b']) {
        const id = `term-${String(index + 1).padStart(3, '0')}-${suffix}`;
        const spokenAs = suffix === 'a' ? entry.token : `${entry.token} word`;
        const ttsText = entry.occurrences[0].contextText.replace(entry.token, spokenAs);
        const audioPath = path.join(formalRoot, 'audio', 'pronunciation-probes', `${id}.wav`);
        const recipePath = path.join(formalRoot, 'audio', 'pronunciation-probes', `${id}.recipe.json`);
        await fs.mkdir(path.dirname(audioPath), {recursive: true});
        await fs.writeFile(audioPath, `RIFF-${id}`, 'utf8');
        const audioSha256 = sha256(`RIFF-${id}`);
        await writeJson(recipePath, {
          text_sha256: sha256(ttsText),
          frontend_preflight: {policy: 'exactly-one-internal-utterance-required', utterance_count: 1},
          output_chunks: 1,
          output: {sha256: audioSha256},
        });
        const recipeSha256 = sha256(await fs.readFile(recipePath));
        candidates.push({
          id,
          label: suffix === 'a' ? 'original' : 'word-boundary',
          spokenAs,
          ttsText,
          ttsTextSha256: sha256(ttsText),
          audio: {path: path.relative(formalRoot, audioPath).replaceAll('\\', '/'), sha256: audioSha256},
          recipe: {path: path.relative(formalRoot, recipePath).replaceAll('\\', '/'), sha256: recipeSha256},
          durationSeconds: 1,
        });
      }
      probes.push({
        id: `pronunciation-${String(index + 1).padStart(3, '0')}`,
        token: entry.token,
        kind: entry.kind,
        locale: entry.locale,
        targetIpa: entry.targetIpa,
        targetCmu: entry.targetCmu,
        contextText: entry.occurrences[0].contextText,
        contextSha256: entry.occurrences[0].contextSha256,
        candidates,
      });
    }
  }
  await writeJson(path.join(formalRoot, 'audio', 'pronunciation-probes', 'probe-manifest.json'), {
    schemaVersion: 'autovideo-pronunciation-probes/v1',
    projectId,
    narrationSha256,
    generatedGuideSha256: sha256(await fs.readFile(guidePath)),
    probes,
  });
  return {formalRoot, guide, probes, narrationSha256};
};

before(async () => fs.mkdir(testRoot, {recursive: true}));
after(async () => fs.rm(testRoot, {recursive: true, force: true}));

test('pronunciation v2 scans every Latin token and classifies technical English', () => {
  const narration = '这个 demo 会调用 API，再由 Codex 解析 GPT-4o 与 camelCase。';
  const entries = scanPronunciationEntries(narration);
  assert.deepEqual(entries.map((entry) => entry.token), ['demo', 'API', 'Codex', 'GPT-4o', 'camelCase']);
  const byToken = new Map(entries.map((entry) => [entry.token, entry]));
  assert.equal(byToken.get('demo').kind, 'english-word');
  assert.equal(byToken.get('demo').targetIpa, '/ˈdɛmoʊ/');
  assert.equal(byToken.get('demo').targetCmu, 'D EH1 M OW0');
  assert.equal(byToken.get('API').kind, 'letter-acronym');
  assert.equal(byToken.get('API').spokenAs, 'A P I');
  assert.equal(byToken.get('Codex').kind, 'brand-product');
  assert.equal(byToken.get('GPT-4o').kind, 'numeric-version');
  assert.equal(byToken.get('camelCase').kind, 'code-identifier');
});

test('a changed pronunciation context invalidates an earlier probe decision', () => {
  const projectId = 'context-drift';
  const original = '先运行 demo，再检查结果。';
  const narrationSha256 = sha256(original);
  const previous = buildPronunciationGuide({projectId, narrationSha256, narration: original});
  previous.entries[0].status = 'approved-default';
  previous.entries[0].spokenAs = 'demo';
  previous.entries[0].contextProbeReceipt = {path: 'audio/probe.wav', sha256: 'a'.repeat(64)};
  const changed = '请在完整项目里运行 demo，然后检查结果。';
  const next = buildPronunciationGuide({projectId, narrationSha256: sha256(changed), narration: changed, previous});
  assert.equal(next.entries[0].status, 'needs-listening-review');
  assert.equal(next.entries[0].contextProbeReceipt, null);
  assert.doesNotThrow(() => validatePronunciationGuide({
    guide: next,
    projectId,
    narrationSha256: sha256(changed),
    narration: changed,
  }));
});

test('subjective pronunciation requires every candidate to be imported, selected and accepted', async () => {
  const projectId = 'subjective-review';
  const evidence = await prepareEvidence({projectId, narration: '请运行 demo。'});
  const [probe] = evidence.probes;
  const stage = {status: 'needs-review'};
  const baseTerm = {
    token: probe.token,
    decision: 'accepted',
    selectedCandidateId: probe.candidates[0].id,
    playedCandidateIds: [probe.candidates[0].id],
    note: '',
  };
  const partial = await savePronunciationReview({
    formalRoot: evidence.formalRoot,
    projectId,
    stage,
    rawInput: {terms: [baseTerm], notes: ''},
    reviewer: 'tester',
  });
  assert.equal(partial.status, 'in-progress');
  await assert.rejects(() => approvePronunciationReview({
    formalRoot: evidence.formalRoot,
    projectId,
    stage,
    reviewer: 'tester',
  }), /every current pronunciation probe/i);
  await assert.rejects(() => savePronunciationReview({
    formalRoot: evidence.formalRoot,
    projectId,
    stage,
    rawInput: {terms: [{...baseTerm, decision: 'retake', note: ''}], notes: ''},
    reviewer: 'tester',
  }), /Retake notes are required/i);

  const accepted = {
    ...baseTerm,
    playedCandidateIds: probe.candidates.map((candidate) => candidate.id),
  };
  const ready = await savePronunciationReview({
    formalRoot: evidence.formalRoot,
    projectId,
    stage,
    rawInput: {terms: [accepted], notes: 'File-import review complete.'},
    reviewer: 'tester',
  });
  assert.equal(ready.status, 'ready-for-approval');
  const receipt = await approvePronunciationReview({
    formalRoot: evidence.formalRoot,
    projectId,
    stage,
    reviewer: 'tester',
  });
  assert.equal(receipt.approval.approvalScope, 'human-listening');
  const effective = JSON.parse(await fs.readFile(path.join(evidence.formalRoot, 'input', 'pronunciation.effective.json'), 'utf8'));
  assert.equal(effective.entries[0].status, 'approved-default');
  assert.equal(effective.entries[0].contextProbeReceipt.candidateId, accepted.selectedCandidateId);
  assert.equal((await buildPronunciationReview({formalRoot: evidence.formalRoot, projectId})).review.status, 'approved');

  await fs.writeFile(path.join(evidence.formalRoot, probe.candidates[0].audio.path), 'changed', 'utf8');
  await assert.rejects(
    () => buildPronunciationReview({formalRoot: evidence.formalRoot, projectId}),
    /bytes or CosyVoice receipt are stale/i,
  );
});

test('explicit user direction can advance complete selections without falsifying listening progress', async () => {
  const projectId = 'selection-with-listening-skipped';
  const evidence = await prepareEvidence({projectId, narration: '请运行 demo。'});
  const [probe] = evidence.probes;
  const selectedCandidateId = probe.candidates[0].id;
  const receipt = await approvePronunciationSelectionWithoutFullListening({
    formalRoot: evidence.formalRoot,
    projectId,
    stage: {status: 'needs-review'},
    rawInput: {
      terms: [{
        token: probe.token,
        decision: 'pending',
        selectedCandidateId,
        playedCandidateIds: [selectedCandidateId],
        note: '',
      }],
      notes: '',
      skipReason: 'User explicitly directed the workflow to advance without hearing the remaining candidate.',
      userDirective: '按当前选择进入下一步。',
    },
    reviewer: 'user',
  });
  assert.equal(receipt.approval.approvalScope, 'user-directed-selection-no-listening');
  assert.equal(receipt.approval.humanListening.completed, false);
  assert.equal(receipt.approval.humanListening.playedCandidateCount, 1);
  assert.equal(receipt.approval.humanListening.candidateCount, 2);
  assert.equal(receipt.approval.selectionOverride.skippedCandidateIds.length, 1);
  assert.equal(receipt.approval.publicReleaseBlocked, true);
  const effective = JSON.parse(await fs.readFile(path.join(evidence.formalRoot, 'input', 'pronunciation.effective.json'), 'utf8'));
  assert.equal(effective.entries[0].spokenAs, probe.candidates[0].spokenAs);
  assert.equal(effective.entries[0].contextProbeReceipt.listeningCompleted, false);
  const view = await buildPronunciationReview({formalRoot: evidence.formalRoot, projectId});
  assert.equal(view.review.status, 'approved');
  assert.equal(view.review.terms[0].decision, 'accepted');
  assert.deepEqual(view.review.terms[0].playedCandidateIds, [selectedCandidateId]);
});

test('subjective probes cannot auto-approve while acronym-only projects can', async () => {
  const subjective = await prepareEvidence({projectId: 'no-auto-subjective', narration: '运行 demo。'});
  await assert.rejects(
    () => approvePronunciationAutomatically({formalRoot: subjective.formalRoot, projectId: 'no-auto-subjective'}),
    /cannot be machine-approved/i,
  );

  const acronym = await prepareEvidence({projectId: 'auto-acronym', narration: '连接 API。', acronymOnly: true});
  const receipt = await approvePronunciationAutomatically({formalRoot: acronym.formalRoot, projectId: 'auto-acronym'});
  assert.equal(receipt.approval.approvalScope, 'machine-no-subjective-terms');
  const effective = JSON.parse(await fs.readFile(path.join(acronym.formalRoot, 'input', 'pronunciation.effective.json'), 'utf8'));
  assert.equal(effective.entries[0].spokenAs, 'A P I');
  assert.equal(effective.entries[0].status, 'approved-default');
});

test('reopening pronunciation removes effective approval and archives both receipts', async () => {
  const projectId = 'reopen-acronym';
  const evidence = await prepareEvidence({projectId, narration: '连接 API。', acronymOnly: true});
  await approvePronunciationAutomatically({formalRoot: evidence.formalRoot, projectId});
  await reopenPronunciationReview({formalRoot: evidence.formalRoot});
  await assert.rejects(() => fs.access(path.join(evidence.formalRoot, 'qa', 'pronunciation-approval.json')));
  await assert.rejects(() => fs.access(path.join(evidence.formalRoot, 'input', 'pronunciation.effective.json')));
  const qaHistory = await fs.readdir(path.join(evidence.formalRoot, 'qa', 'history'));
  const inputHistory = await fs.readdir(path.join(evidence.formalRoot, 'input', 'history'));
  assert.equal(qaHistory.some((name) => name.startsWith('pronunciation-approval-')), true);
  assert.equal(inputHistory.some((name) => name.startsWith('pronunciation.effective-')), true);
});
