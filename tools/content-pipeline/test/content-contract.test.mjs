import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const runFile = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..', '..', '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');
const contentScript = path.join(root, 'scripts', 'content-workflow.mjs');
const videoScript = path.join(root, 'scripts', 'video-workflow.mjs');
const prepareLedgersScript = path.join(root, 'scripts', 'prepare-content-ledgers.mjs');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const runNode = async (script, args) => runFile(process.execPath, [script, ...args], {
  cwd: root,
  windowsHide: true,
  maxBuffer: 10 * 1024 * 1024,
});

test('batch content intake binds human-approved wording into NarrationLock', async () => {
  const projectId = `content-contract-test-${process.pid}`;
  const runRoot = path.join(root, 'content', 'test-runs', projectId);
  const materialsDir = path.join(runRoot, 'materials');
  const intakeDir = path.join(runRoot, 'intake');
  const projectDir = path.join(projectsRoot, projectId);

  try {
    await fs.mkdir(materialsDir, {recursive: true});
    const materialText = [
      '# Workflow notes',
      'A repeatable workflow needs retries, permissions, monitoring, and rollback.',
      'Fast generation is useful, but human judgment remains part of delivery.',
      '',
    ].join('\n');
    await fs.writeFile(path.join(materialsDir, 'notes.md'), materialText, 'utf8');

    await runNode(contentScript, ['register', '--id', projectId, '--materials', materialsDir, '--out', intakeDir]);
    const sources = await readJson(path.join(intakeDir, 'sources.json'));
    assert.equal(sources.sources.length, 1);
    assert.equal(sources.sources[0].sha256, sha256(materialText));

    await runNode(contentScript, ['diagnose', '--intake', intakeDir, '--route', 'materials']);
    const suitability = await readJson(path.join(intakeDir, 'material-suitability.json'));
    assert.equal(suitability.status, 'suitable');

    const evidence = {
      schemaVersion: 'autovideo-evidence/v1',
      claims: [
        {
          id: 'claim-production-controls',
          statement: 'Repeatable workflows require production controls.',
          status: 'supported',
          sourceId: sources.sources[0].id,
          quote: 'A repeatable workflow needs retries, permissions, monitoring, and rollback.',
          locator: 'notes.md:2',
        },
        {
          id: 'claim-human-judgment',
          statement: 'Human judgment remains part of delivery.',
          status: 'opinion',
          sourceId: sources.sources[0].id,
          quote: 'Fast generation is useful, but human judgment remains part of delivery.',
          locator: 'notes.md:3',
        },
      ],
      gaps: [],
    };
    const evidencePath = path.join(runRoot, 'evidence.imported.json');
    await writeJson(evidencePath, evidence);

    await runNode(contentScript, ['extract', '--intake', intakeDir, '--draft', evidencePath, '--allow-legacy-v1']);
    const extractedEvidence = await readJson(path.join(intakeDir, 'evidence.json'));
    assert.equal(extractedEvidence.projectId, projectId);
    assert.equal(extractedEvidence.prompt.id, 'evidence-extractor');
    await assert.rejects(
      runNode(contentScript, ['outline', '--intake', intakeDir, '--target-seconds', '30', '--draft', evidencePath]),
      (error) => /requires evidence-approved/i.test(error.stderr),
    );
    await runNode(contentScript, [
      'approve-evidence', '--intake', intakeDir, '--reviewer', 'human:test-evidence-reviewer', '--confirm-human',
    ]);
    const evidenceApproval = await readJson(path.join(intakeDir, 'evidence-approval.json'));
    assert.equal(evidenceApproval.approvalScope, 'human-review');

    const outline = {
      schemaVersion: 'autovideo-content-outline/v1',
      projectId: 'placeholder',
      evidenceSha256: '0'.repeat(64),
      prompt: {id: 'outline-planner', sha256: '0'.repeat(64)},
      targetSeconds: 30,
      sections: [
        {
          id: 'section-01', purpose: 'Explain production controls', kind: 'sourced', targetSeconds: 12,
          claimIds: ['claim-production-controls'], sourceIds: [sources.sources[0].id], screenIntent: 'keyword stack',
        },
        {
          id: 'section-02', purpose: 'Frame the creator view', kind: 'creator-opinion', targetSeconds: 18,
          claimIds: ['claim-human-judgment'], sourceIds: [sources.sources[0].id], screenIntent: 'opinion emphasis',
        },
      ],
      reviewNotes: [],
      generatedAt: '2026-07-22T00:00:00.000Z',
    };
    const outlinePath = path.join(runRoot, 'content-outline.imported.json');
    await writeJson(outlinePath, outline);
    await runNode(contentScript, ['outline', '--intake', intakeDir, '--target-seconds', '30', '--draft', outlinePath]);

    const rewrite = {
      schemaVersion: 'autovideo-spoken-rewrite/v1',
      projectId: 'placeholder',
      sourceRegisterSha256: '0'.repeat(64),
      suitabilitySha256: '0'.repeat(64),
      evidenceSha256: '0'.repeat(64),
      title: 'From demo to delivery',
      language: 'zh-CN',
      sections: [
        {
          id: 'section-01',
          kind: 'sourced',
          targetSeconds: 12,
          narration: 'A repeatable workflow needs retries, permissions, monitoring, and rollback.',
          claimIds: ['claim-production-controls'],
          sourceIds: [sources.sources[0].id],
          framing: '',
          onscreen: [{text: 'Retries, permissions, monitoring, rollback', kind: 'generated_summary'}],
        },
        {
          id: 'section-02',
          kind: 'creator-opinion',
          targetSeconds: 18,
          narration: 'In my view, fast generation still needs human judgment before delivery.',
          claimIds: ['claim-human-judgment'],
          sourceIds: [sources.sources[0].id],
          framing: 'Explicitly presented as the creator view.',
          onscreen: [{text: 'Human judgment remains', kind: 'generated_summary'}],
        },
      ],
      reviewNotes: [],
      generatedAt: '2026-07-20T00:00:00.000Z',
    };
    const scriptDraft = {
      ...structuredClone(rewrite),
      schemaVersion: 'autovideo-script-draft/v2',
      evidenceSha256: '0'.repeat(64),
      outlineSha256: '0'.repeat(64),
      prompt: {id: 'narration-writer', sha256: '0'.repeat(64)},
    };
    delete scriptDraft.sourceRegisterSha256;
    delete scriptDraft.suitabilitySha256;
    const scriptDraftPath = path.join(runRoot, 'script.draft.imported.json');
    await writeJson(scriptDraftPath, scriptDraft);
    await runNode(contentScript, ['write', '--intake', intakeDir, '--draft', scriptDraftPath]);

    const rewritePath = path.join(runRoot, 'spoken-rewrite.imported.json');
    await writeJson(rewritePath, rewrite);

    await runNode(contentScript, ['oralize', '--intake', intakeDir, '--draft', rewritePath]);
    await runNode(contentScript, ['fit', '--intake', intakeDir]);
    const durationFit = await readJson(path.join(intakeDir, 'content-duration-fit.json'));
    assert.equal(durationFit.status, 'passed');
    assert.equal(durationFit.modifiesWording, false);
    await runNode(contentScript, ['verify', '--intake', intakeDir]);
    const claimReview = await readJson(path.join(intakeDir, 'claim-source-review.json'));
    assert.equal(claimReview.status, 'passed');
    assert.equal(claimReview.checks.exactQuotes, true);

    await runNode(contentScript, [
      'approve', '--intake', intakeDir, '--reviewer', 'human:test-reviewer', '--confirm-human',
    ]);
    const approvalPath = path.join(intakeDir, 'content-approval.json');
    const narrationPath = path.join(intakeDir, 'script.approved.txt');
    const originalApprovalBytes = await fs.readFile(approvalPath);
    const originalNarration = await fs.readFile(narrationPath, 'utf8');
    const approval = JSON.parse(originalApprovalBytes.toString('utf8'));
    assert.equal(approval.approvalScope, 'human-review');
    assert.equal(approval.approvedBy, 'human:test-reviewer');
    assert.equal(approval.approvedNarration.sha256, sha256(originalNarration.trim()));
    assert.equal(approval.bindings.evidenceApprovalSha256, sha256(await fs.readFile(path.join(intakeDir, 'evidence-approval.json'))));
    const intakeStatus = JSON.parse((await runNode(contentScript, ['status', '--intake', intakeDir])).stdout);
    assert.equal(intakeStatus.ok, true);
    assert.equal(intakeStatus.chainCurrent, true);

    const repeated = await runNode(contentScript, [
      'approve', '--intake', intakeDir, '--reviewer', 'another-reviewer', '--confirm-human',
    ]);
    assert.match(repeated.stdout, /"approvalAlreadyExists": true/);
    assert.deepEqual(await fs.readFile(approvalPath), originalApprovalBytes);

    await fs.writeFile(narrationPath, `${originalNarration.trim()} altered\n`, 'utf8');
    await assert.rejects(
      runNode(contentScript, ['approve', '--intake', intakeDir, '--reviewer', 'human:test-reviewer', '--confirm-human']),
      (error) => /differs from the human approval receipt/i.test(error.stderr),
    );
    await fs.writeFile(narrationPath, originalNarration, 'utf8');

    await fs.writeFile(narrationPath, `${originalNarration} `, 'utf8');
    await assert.rejects(
      runNode(contentScript, ['approve', '--intake', intakeDir, '--reviewer', 'human:test-reviewer', '--confirm-human']),
      (error) => /byte receipt is inconsistent/i.test(error.stderr),
    );
    await fs.writeFile(narrationPath, originalNarration, 'utf8');

    const originalReviewBytes = await fs.readFile(path.join(intakeDir, 'claim-source-review.json'));
    const changedReview = JSON.parse(originalReviewBytes.toString('utf8'));
    changedReview.reviewedAt = '2026-07-20T01:00:00.000Z';
    await writeJson(path.join(intakeDir, 'claim-source-review.json'), changedReview);
    const state = await readJson(path.join(intakeDir, 'intake-state.json'));
    state.artifacts.claimSourceReview.sha256 = sha256(await fs.readFile(path.join(intakeDir, 'claim-source-review.json')));
    await writeJson(path.join(intakeDir, 'intake-state.json'), state);
    await assert.rejects(
      runNode(contentScript, ['approve', '--intake', intakeDir, '--reviewer', 'human:test-reviewer', '--confirm-human']),
      (error) => /bindings are immutable/i.test(error.stderr),
    );
    await fs.writeFile(path.join(intakeDir, 'claim-source-review.json'), originalReviewBytes);
    state.artifacts.claimSourceReview.sha256 = sha256(originalReviewBytes);
    await writeJson(path.join(intakeDir, 'intake-state.json'), state);

    await runNode(videoScript, [
      'new', '--id', projectId, '--narration', narrationPath, '--content-approval', approvalPath,
      '--ratio', '16:9', '--duration', '30s', '--platform', 'test',
    ]);
    const lock = await readJson(path.join(projectDir, 'NarrationLock.json'));
    assert.equal(lock.approvalReceipt.approvedNarrationSha256, approval.approvedNarration.sha256);
    for (const fileName of [
      'sources.json', 'material-suitability.json', 'evidence.json', 'evidence-approval.json', 'content-outline.json',
      'script.draft.json', 'spoken-rewrite.json', 'content-duration-fit.json', 'claim-source-review.json',
    ]) {
      await assert.doesNotReject(() => fs.access(path.join(projectDir, 'input', 'content-intake', fileName)));
    }

    await runNode(prepareLedgersScript, ['--project', projectId]);
    assert.deepEqual(await fs.readFile(path.join(projectDir, 'input', 'content-approval.json')), originalApprovalBytes);
    const claimLedger = await readJson(path.join(projectDir, 'input', 'claim-ledger.json'));
    assert.deepEqual(claimLedger.claims.map((claim) => claim.id), evidence.claims.map((claim) => claim.id));
    assert.equal(claimLedger.claims[0].evidenceStatus, 'verified');

    await fs.appendFile(path.join(projectDir, 'input', 'content-intake', 'evidence.json'), ' ');
    await assert.rejects(
      runNode(contentScript, ['lock', '--intake', intakeDir]),
      (error) => /evidence\.json is stale/i.test(error.stderr),
    );
    const status = await runNode(videoScript, ['template-status', '--project', projectId]);
    assert.match(status.stdout, /evidence\.json does not match evidenceSha256/i);
    assert.match(status.stdout, /"narration-lock"[\s\S]*?"passed": false/);
  } finally {
    for (const [base, target] of [
      [path.join(root, 'content', 'test-runs'), runRoot],
      [projectsRoot, projectDir],
    ]) {
      const relative = path.relative(base, target);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) await fs.rm(target, {recursive: true, force: true});
    }
  }
});
