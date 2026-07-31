import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {finalizeDeliveryManifest} from './finalize-delivery-manifest.mjs';

const root = path.resolve(import.meta.dirname, '..');
const projectId = `delivery-manifest-test-${process.pid}`;
const projectRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
const workbenchRoot = path.join(root, 'workflow-console', 'data', 'projects', projectId);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = async (base, relativePath, value) => {
  const target = path.join(base, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
};
const writeJson = (base, relativePath, value) => write(base, relativePath, `${JSON.stringify(value, null, 2)}\n`);

try {
  const video = Buffer.from('delivery video');
  await write(projectRoot, 'renders/review.mp4', video);
  await writeJson(projectRoot, 'qa/delivery-report.json', {output: 'renders/review.mp4', outputSha256: sha256(video)});
  await writeJson(projectRoot, 'delivery/delivery-manifest.json', {
    schemaVersion: 'autovideo-delivery-manifest/v1',
    projectId,
    files: [{path: 'renders/review.mp4'}],
  });
  for (const relativePath of ['input/content-approval.json', 'input/claim-ledger.json', 'input/pronunciation.json', 'audio/approval.json']) {
    await writeJson(projectRoot, relativePath, {projectId, artifact: relativePath});
  }
  await writeJson(workbenchRoot, 'artifacts/source-register/sources.json', {projectId, sources: [{id: 'source-001'}]});
  await write(workbenchRoot, 'artifacts/script-review/script.approved.txt', 'approved narration\n');
  await writeJson(workbenchRoot, 'artifacts/rights-clearance/publication-rights.json', {projectId, status: 'internal-only'});

  const first = await finalizeDeliveryManifest(projectId);
  assert.equal(first.optionalPresent, 8);
  assert.equal(first.optionalMissing, 15);
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'delivery/delivery-manifest.json'), 'utf8'));
  const filePaths = manifest.files.map((item) => item.path);
  for (const expected of [
    'input/content-approval.json',
    'input/claim-ledger.json',
    'input/pronunciation.json',
    'audio/approval.json',
    'receipts/content/sources.json',
    'receipts/content/script.approved.txt',
    'receipts/rights/publication-rights.json',
    'receipts/workbench-artifacts.json',
  ]) assert.equal(filePaths.includes(expected), true, `Missing delivery file ${expected}`);
  for (const [id, expectedPath] of [
    ['standardDeliverySop', 'STANDARD_DELIVERY_SOP.md'],
    ['evidenceLedger', 'receipts/content/evidence.json'],
    ['contentOutline', 'receipts/content/content-outline.json'],
    ['scriptDraft', 'receipts/content/script.draft.json'],
    ['spokenRewrite', 'receipts/content/spoken-rewrite.json'],
    ['durationFit', 'receipts/content/content-duration-fit.json'],
    ['claimSourceReview', 'receipts/content/claim-source-review.json'],
    ['listeningReview', 'audio/listening-review.json'],
    ['humanFinalReview', 'qa/human-final-review.json'],
    ['oneScreenMvpQa', 'qa/one-screen-mvp-report.json'],
    ['oneScreenFileQa', 'qa/one-screen-mvp-file-qa.json'],
    ['oneScreenMasterStoryboard', 'review/one-screen-master-storyboard.png'],
    ['oneScreenReviewRequest', 'review/one-screen-review-request.json'],
    ['oneScreenFinalReview', 'review/one-screen-final-review.json'],
    ['internalReviewDelivery', 'qa/internal-review-delivery.json'],
  ]) {
    const record = manifest.optionalArtifacts.find((item) => item.id === id);
    assert.equal(record.status, 'missing');
    assert.equal(record.expectedPath, expectedPath);
    await assert.rejects(() => fs.stat(path.join(projectRoot, expectedPath)), {code: 'ENOENT'});
  }

  const stableFiles = manifest.files;
  const stableOptional = manifest.optionalArtifacts;
  await finalizeDeliveryManifest(projectId);
  const repeated = JSON.parse(await fs.readFile(path.join(projectRoot, 'delivery/delivery-manifest.json'), 'utf8'));
  assert.deepEqual(repeated.files, stableFiles);
  assert.deepEqual(repeated.optionalArtifacts, stableOptional);

  await writeJson(workbenchRoot, 'artifacts/source-register/sources.json', {projectId, sources: [{id: 'source-002'}]});
  await finalizeDeliveryManifest(projectId);
  const updated = JSON.parse(await fs.readFile(path.join(projectRoot, 'delivery/delivery-manifest.json'), 'utf8'));
  const updatedSource = updated.optionalArtifacts.find((item) => item.id === 'sourceRegistration');
  assert.notEqual(updatedSource.sha256, stableOptional.find((item) => item.id === 'sourceRegistration').sha256);
  assert.equal(
    updatedSource.sha256,
    sha256(await fs.readFile(path.join(projectRoot, 'receipts/content/sources.json'))),
  );

  await fs.rm(path.join(workbenchRoot, 'artifacts/source-register/sources.json'));
  await finalizeDeliveryManifest(projectId);
  const sourceUnavailable = JSON.parse(await fs.readFile(path.join(projectRoot, 'delivery/delivery-manifest.json'), 'utf8'));
  const frozenSource = sourceUnavailable.optionalArtifacts.find((item) => item.id === 'sourceRegistration');
  assert.equal(frozenSource.status, 'present');
  assert.equal(frozenSource.sourceAvailable, false);
  assert.equal(frozenSource.sha256, updatedSource.sha256);
  const receiptIndex = JSON.parse(await fs.readFile(path.join(projectRoot, 'receipts/workbench-artifacts.json'), 'utf8'));
  assert.equal(receiptIndex.artifacts.find((item) => item.id === 'sourceRegistration').status, 'frozen');
  console.log(JSON.stringify({passed: true, projectId, optionalPresent: first.optionalPresent, optionalMissing: first.optionalMissing}, null, 2));
} finally {
  for (const [base, target] of [[path.join(root, 'hyperframes-workflow-kit', 'projects'), projectRoot], [path.join(root, 'workflow-console', 'data', 'projects'), workbenchRoot]]) {
    const relative = path.relative(base, target);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) await fs.rm(target, {recursive: true, force: true});
  }
}
