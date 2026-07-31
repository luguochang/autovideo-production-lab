import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const portable = (value) => value.replaceAll('\\', '/');

const readJson = async (filePath) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const fileInfo = async (formalRoot, relativePath, manifestMap) => {
  const target = path.join(formalRoot, relativePath);
  try {
    const stats = await fs.stat(target);
    if (!stats.isFile()) return null;
    const receipt = manifestMap.get(portable(relativePath));
    return {
      path: portable(relativePath),
      bytes: stats.size,
      sha256: receipt?.sha256 ?? null,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const listRenderFiles = async (formalRoot, manifestMap) => {
  const renderRoot = path.join(formalRoot, 'renders');
  let entries = [];
  try {
    entries = await fs.readdir(renderRoot, {withFileTypes: true});
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !['.mp4', '.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(entry.name).toLowerCase())) continue;
    const info = await fileInfo(formalRoot, path.join('renders', entry.name), manifestMap);
    if (info) files.push(info);
  }
  return files;
};

const kindFor = (relativePath) => {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === '.mp4') return 'video';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'cover-or-still';
  if (extension === '.srt') return 'captions';
  if (relativePath.includes('PACKAGE_STATUS')) return 'standard-package';
  if (relativePath.includes('/qa/') || relativePath.startsWith('qa/')) return 'qa-receipt';
  return 'receipt';
};

export const buildReleaseCenter = async ({project, formalRoot}) => {
  const [qaReport, deliveryManifest, packageStatus, publicationReceipt, internalReviewReceipt] = await Promise.all([
    readJson(path.join(formalRoot, 'qa', 'report.json')),
    readJson(path.join(formalRoot, 'delivery', 'delivery-manifest.json')),
    readJson(path.join(formalRoot, 'delivery', 'standard-package', 'PACKAGE_STATUS.json')),
    readJson(path.join(formalRoot, 'delivery', 'publication-receipt.json')),
    readJson(path.join(formalRoot, 'renders', `${project.id}-internal-review.receipt.json`)),
  ]);
  const manifestMap = new Map((deliveryManifest?.files || []).map((entry) => [portable(entry.path), entry]));
  const fixedFiles = await Promise.all([
    'captions/narration.zh-CN.srt',
    'qa/report.json',
    'qa/delivery-report.json',
    'delivery/delivery-manifest.json',
    'delivery/standard-package/PACKAGE_STATUS.json',
  ].map((relativePath) => fileInfo(formalRoot, relativePath, manifestMap)));
  const files = [...await listRenderFiles(formalRoot, manifestMap), ...fixedFiles.filter(Boolean)]
    .map((item) => ({...item, kind: kindFor(item.path)}));
  const video = files.find((item) => item.kind === 'video') ?? null;
  const internalVideo = internalReviewReceipt?.video?.path
    ? files.find((item) => item.path === portable(internalReviewReceipt.video.path)) ?? null
    : null;
  const internalReceiptValid = Boolean(
    internalReviewReceipt?.schemaVersion === 'autovideo-internal-review-render/v1'
      && internalReviewReceipt.projectId === project.id
      && internalReviewReceipt.releaseScope === 'internal-only'
      && internalReviewReceipt.publicReleaseBlocked === true
      && internalReviewReceipt.video?.fullDecodePassed === true
      && internalReviewReceipt.hyperframes?.strictCheckPassed === true
      && internalVideo
      && internalReviewReceipt.video.sha256 === await sha256File(path.join(formalRoot, internalVideo.path)),
  );
  const cover = files.find((item) => item.kind === 'cover-or-still' && /cover/i.test(item.path))
    ?? files.find((item) => item.kind === 'cover-or-still')
    ?? null;
  const publicMasterReady = Boolean(qaReport?.okForPublicRelease && video && packageStatus?.ok !== false);
  const internalReviewReady = Boolean((qaReport?.okForInternalReview && video) || internalReceiptValid);
  const published = Boolean(publicationReceipt?.status === 'published'
    && publicationReceipt?.outputSha256
    && publicationReceipt.outputSha256 === video?.sha256);
  const phase = published
    ? 'published'
    : publicMasterReady
      ? 'public-master-candidate'
      : internalReviewReady
        ? 'internal-review-package'
        : 'production';
  const blockers = [...new Set([
    ...(qaReport?.releaseBlockers || deliveryManifest?.releaseBlockers || []),
    ...(!video ? ['No rendered MP4 is available.'] : []),
    ...(!cover ? ['A delivery cover is missing.'] : []),
    ...(!publicationReceipt ? ['No platform publication receipt is recorded.'] : []),
  ])];
  const publication = publicationReceipt
    ? {status: publicationReceipt.status, platform: publicationReceipt.platform ?? null, url: publicationReceipt.url ?? null, publishedAt: publicationReceipt.publishedAt ?? null}
    : {status: 'not-published', platform: null, url: null, publishedAt: null};

  return {
    schemaVersion: 'autovideo-release-center/v1',
    projectId: project.id,
    phase,
    internalReviewReady,
    publicMasterReady,
    published,
    releaseScope: qaReport?.releaseScope ?? deliveryManifest?.releaseScope ?? project.publicationRights,
    publicReleaseBlocked: !publicMasterReady,
    blockers,
    publishingAssets: {
      title: {status: project.title ? 'draft' : 'missing', value: project.title || ''},
      description: {status: 'missing', value: ''},
      tags: {status: 'missing', values: []},
      cover: {status: cover ? 'ready' : 'missing', path: cover?.path ?? null},
      publicationReceipt: publication,
    },
    files,
  };
};
