import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
  humanReviewGateStatus,
  validateOneScreenFinalReview,
  verifyPackageRoot,
  verifyStandardDeliveryPackage,
} from './assemble-standard-delivery-package.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.argv[2] || 'demotext-standard-delivery-v3';
const packageRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId, 'delivery', 'standard-package');

const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-package-test-'));
try {
  assert.equal(humanReviewGateStatus({
    milestone: 'passed',
    approval: {status: 'approved', scope: 'human-review'},
    receipt: 'human.json',
  }).status, 'passed');
  const internalOnlyGate = humanReviewGateStatus({
    milestone: 'passed',
    approval: {status: 'approved-internal-only', scope: 'internal-autonomous-review'},
    receipt: 'internal.json',
  });
  assert.equal(internalOnlyGate.status, 'blocked');
  assert.equal(internalOnlyGate.internalReviewStatus, 'passed-internal-only');
  const reviewProjectRoot = path.join(fixtureRoot, 'one-screen-project');
  const writeReviewFixture = async (relativePath, value) => {
    const target = path.join(reviewProjectRoot, relativePath);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, value);
    const bytes = await fs.readFile(target);
    return {
      path: relativePath.replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  };
  const reviewVideo = await writeReviewFixture('renders/fixture-internal-review.mp4', 'review-video\n');
  const reviewStoryboard = await writeReviewFixture('review/one-screen-master-storyboard.png', 'storyboard\n');
  const reviewBuild = await writeReviewFixture('production/hyperframes/data/composition-build.json', '{}\n');
  const reviewCheck = await writeReviewFixture('qa/hyperframes-check.json', '{"ok":true}\n');
  const reviewFileQa = {
    schemaVersion: 'autovideo-file-only-media-qa/v1',
    projectId: 'fixture-review',
    status: 'passed',
    publicReleaseBlocked: true,
    source: reviewVideo,
  };
  const reviewFileQaBinding = await writeReviewFixture('qa/one-screen-mvp-file-qa.json', `${JSON.stringify(reviewFileQa, null, 2)}\n`);
  const reviewRenderReceipt = await writeReviewFixture('renders/fixture-internal-review.receipt.json', '{}\n');
  const reviewMvpQa = {
    schemaVersion: 'autovideo-one-screen-mvp-qa/v1',
    projectId: 'fixture-review',
    status: 'passed',
    checks: {hyperframesStrict: {status: 'passed'}, fileMediaQa: {status: 'passed'}},
    bindings: {
      build: reviewBuild,
      hyperframesCheck: reviewCheck,
      fileQa: reviewFileQaBinding,
      video: reviewVideo,
      storyboard: reviewStoryboard,
      renderReceipt: reviewRenderReceipt,
    },
  };
  const reviewQaBinding = await writeReviewFixture('qa/one-screen-mvp-report.json', `${JSON.stringify(reviewMvpQa, null, 2)}\n`);
  const reviewReceipt = {
    schemaVersion: 'autovideo-one-screen-final-review/v1',
    projectId: 'fixture-review',
    decision: 'approve',
    reviewedBy: 'user',
    reviewedAt: '2026-07-28T04:50:46.188Z',
    humanReviewPerformed: true,
    fullTimelineWatched: true,
    publicReleaseBlocked: true,
    bindings: {video: reviewVideo, storyboard: reviewStoryboard, qa: reviewQaBinding},
  };
  await writeReviewFixture('review/one-screen-final-review.json', `${JSON.stringify(reviewReceipt, null, 2)}\n`);
  const approvedReview = await validateOneScreenFinalReview({projectId: 'fixture-review', projectRoot: reviewProjectRoot});
  assert.equal(approvedReview.approved, true, approvedReview.issues.join('\n'));
  await fs.appendFile(path.join(reviewProjectRoot, reviewVideo.path), 'tampered\n');
  const staleReview = await validateOneScreenFinalReview({projectId: 'fixture-review', projectRoot: reviewProjectRoot});
  assert.equal(staleReview.approved, false);
  await fs.rm(reviewProjectRoot, {recursive: true, force: true});
  const writeFixture = async (relativePath, value) => {
    const target = path.join(fixtureRoot, relativePath);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, value);
    const bytes = await fs.readFile(target);
    return {path: relativePath.replaceAll('\\', '/'), size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  };
  const deliveryManifest = await writeFixture('project/delivery/delivery-manifest.json', '{"integrity":{"status":"verified"}}\n');
  const video = await writeFixture('project/renders/fixture-internal-review.mp4', 'fixture-video\n');
  const status = await writeFixture('PACKAGE_STATUS.json', '{"internalDeliveryReady":true,"publicReleaseBlocked":true}\n');
  const readme = await writeFixture('README.md', '# fixture\n');
  const manifest = {
    schemaVersion: 'autovideo-standard-delivery-package/v1',
    projectId: 'fixture',
    sourceDeliveryManifestSha256: deliveryManifest.sha256,
    files: [deliveryManifest, video, status, readme],
    integrity: {deliveryVideoSha256: video.sha256, totalBytes: deliveryManifest.size + video.size + status.size + readme.size},
  };
  await fs.writeFile(path.join(fixtureRoot, 'PACKAGE_MANIFEST.json'), JSON.stringify(manifest));
  const fixtureResult = await verifyPackageRoot(fixtureRoot);
  assert.equal(fixtureResult.ok, true);
  await fs.appendFile(path.join(fixtureRoot, 'README.md'), 'tampered\n');
  await assert.rejects(() => verifyPackageRoot(fixtureRoot), /hash verification/i);
  const result = await verifyStandardDeliveryPackage(projectId);
  assert.equal(result.ok, true);
  assert.equal(result.publicReleaseBlocked, true);
  assert.ok(result.fileCount > 0);
  console.log(JSON.stringify({passed: true, projectId, packageRoot, fileCount: result.fileCount}, null, 2));
} finally {
  await fs.rm(fixtureRoot, {recursive: true, force: true});
}
