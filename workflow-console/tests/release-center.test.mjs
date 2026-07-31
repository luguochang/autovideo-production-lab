import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {buildReleaseCenter} from '../lib/release-center.mjs';

const root = path.join(import.meta.dirname, '..', 'data', `release-center-test-${process.pid}`);

before(() => fs.mkdir(path.join(root, 'renders'), {recursive: true}));
after(() => fs.rm(root, {recursive: true, force: true}));

test('release center never calls an internal review render publicly complete', async () => {
  await fs.mkdir(path.join(root, 'qa'), {recursive: true});
  await fs.writeFile(path.join(root, 'renders', 'demo-internal-review.mp4'), 'video');
  await fs.writeFile(path.join(root, 'renders', 'demo-cover.png'), 'cover');
  await fs.writeFile(path.join(root, 'qa', 'report.json'), JSON.stringify({
    releaseScope: 'internal-only',
    okForInternalReview: true,
    okForPublicRelease: false,
    releaseBlockers: ['Human final review is missing.'],
  }));
  const center = await buildReleaseCenter({project: {id: 'demo', title: 'Demo', publicationRights: 'internal-only'}, formalRoot: root});
  assert.equal(center.phase, 'internal-review-package');
  assert.equal(center.publicMasterReady, false);
  assert.equal(center.published, false);
  assert.equal(center.publishingAssets.publicationReceipt.status, 'not-published');
  assert.ok(center.files.some((item) => item.kind === 'video'));
});

test('hash-bound internal render receipt exposes an internal review without synthesizing final QA', async () => {
  const videoPath = path.join(root, 'renders', 'demo-internal-review.mp4');
  await fs.writeFile(videoPath, 'internal-video');
  await fs.writeFile(path.join(root, 'renders', 'demo-internal-review.receipt.json'), JSON.stringify({
    schemaVersion: 'autovideo-internal-review-render/v1', projectId: 'demo', releaseScope: 'internal-only', publicReleaseBlocked: true,
    video: {path: 'renders/demo-internal-review.mp4', sha256: createHash('sha256').update('internal-video').digest('hex'), fullDecodePassed: true},
    hyperframes: {strictCheckPassed: true},
  }));
  await fs.rm(path.join(root, 'qa', 'report.json'), {force: true});
  const center = await buildReleaseCenter({project: {id: 'demo', title: 'Demo', publicationRights: 'needs-review'}, formalRoot: root});
  assert.equal(center.phase, 'internal-review-package');
  assert.equal(center.internalReviewReady, true);
  assert.equal(center.publicMasterReady, false);
  assert.equal(center.publicReleaseBlocked, true);
});

test('public QA produces a public master candidate until a hash-bound publication receipt exists', async () => {
  await fs.writeFile(path.join(root, 'qa', 'report.json'), JSON.stringify({
    releaseScope: 'public-release',
    okForInternalReview: true,
    okForPublicRelease: true,
    releaseBlockers: [],
  }));
  const candidate = await buildReleaseCenter({project: {id: 'demo', title: 'Demo', publicationRights: 'cleared'}, formalRoot: root});
  assert.equal(candidate.phase, 'public-master-candidate');
  assert.equal(candidate.published, false);

  await fs.mkdir(path.join(root, 'delivery'), {recursive: true});
  const outputSha256 = createHash('sha256').update('video').digest('hex');
  await fs.writeFile(path.join(root, 'delivery', 'delivery-manifest.json'), JSON.stringify({
    releaseScope: 'public-release',
    files: [{path: 'renders/demo-internal-review.mp4', sha256: outputSha256}],
    releaseBlockers: [],
  }));
  await fs.writeFile(path.join(root, 'delivery', 'publication-receipt.json'), JSON.stringify({
    status: 'published',
    platform: 'douyin',
    url: 'https://example.invalid/video',
    outputSha256,
    publishedAt: '2026-01-01T00:00:00.000Z',
  }));
  const published = await buildReleaseCenter({project: {id: 'demo', title: 'Demo', publicationRights: 'cleared'}, formalRoot: root});
  assert.equal(published.phase, 'published');
  assert.equal(published.published, true);
});
