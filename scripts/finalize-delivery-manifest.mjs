import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');
const workbenchProjectsRoot = path.join(root, 'workflow-console', 'data', 'projects');
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const workbenchReceiptSpecs = [
  {id: 'sourceRegistration', stage: 'source-register', sourceName: 'sources.json', receiptPath: 'receipts/content/sources.json'},
  {id: 'evidenceLedger', stage: 'evidence-ledger', sourceName: 'evidence.json', receiptPath: 'receipts/content/evidence.json'},
  {id: 'contentOutline', stage: 'content-outline', sourceName: 'content-outline.json', receiptPath: 'receipts/content/content-outline.json'},
  {id: 'scriptDraft', stage: 'script-draft', sourceName: 'script.draft.json', receiptPath: 'receipts/content/script.draft.json'},
  {id: 'spokenRewrite', stage: 'spoken-rewrite', sourceName: 'spoken-rewrite.json', receiptPath: 'receipts/content/spoken-rewrite.json'},
  {id: 'durationFit', stage: 'content-duration-fit', sourceName: 'content-duration-fit.json', receiptPath: 'receipts/content/content-duration-fit.json'},
  {id: 'claimSourceReview', stage: 'claim-source-review', sourceName: 'claim-source-review.json', receiptPath: 'receipts/content/claim-source-review.json'},
  {id: 'scriptApproval', stage: 'script-review', sourceName: 'script.approved.txt', receiptPath: 'receipts/content/script.approved.txt'},
  {id: 'publicationRights', stage: 'rights-clearance', sourceName: 'publication-rights.json', receiptPath: 'receipts/rights/publication-rights.json'},
];

const formalOptionalSpecs = [
  {id: 'standardDeliverySop', path: 'STANDARD_DELIVERY_SOP.md'},
  {id: 'contentApproval', path: 'input/content-approval.json'},
  {id: 'claimLedger', path: 'input/claim-ledger.json'},
  {id: 'pronunciation', path: 'input/pronunciation.json'},
  {id: 'audioApproval', path: 'audio/approval.json'},
  {id: 'listeningReview', path: 'audio/listening-review.json'},
  {id: 'humanFinalReview', path: 'qa/human-final-review.json'},
  {id: 'oneScreenMvpQa', path: 'qa/one-screen-mvp-report.json'},
  {id: 'oneScreenFileQa', path: 'qa/one-screen-mvp-file-qa.json'},
  {id: 'oneScreenMasterStoryboard', path: 'review/one-screen-master-storyboard.png'},
  {id: 'oneScreenReviewRequest', path: 'review/one-screen-review-request.json'},
  {id: 'oneScreenFinalReview', path: 'review/one-screen-final-review.json'},
  {id: 'oneScreenMotionFeedback', path: 'review/one-screen-motion-feedback.json'},
  {id: 'internalReviewDelivery', path: 'qa/internal-review-delivery.json'},
];

const validateProjectId = (projectId) => {
  if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
    throw new Error('Usage: node scripts/finalize-delivery-manifest.mjs <project-id>');
  }
  return projectId;
};

const fileStatus = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const projectFile = (projectRoot, relativePath) => {
  const target = path.resolve(projectRoot, relativePath);
  if (target !== projectRoot && !target.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`Delivery path escaped project: ${relativePath}`);
  }
  return target;
};

const freezeWorkbenchReceipts = async (projectId, projectRoot) => {
  const records = [];
  for (const spec of workbenchReceiptSpecs) {
    const sourcePath = path.join(workbenchProjectsRoot, projectId, 'artifacts', spec.stage, spec.sourceName);
    const receiptPath = projectFile(projectRoot, spec.receiptPath);
    const sourceStats = await fileStatus(sourcePath);
    const receiptStats = await fileStatus(receiptPath);
    if (sourceStats) {
      const sourceBytes = await fs.readFile(sourcePath);
      const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
      const receiptSha256 = receiptStats ? await sha256File(receiptPath) : null;
      if (receiptSha256 !== sourceSha256) {
        await fs.mkdir(path.dirname(receiptPath), {recursive: true});
        await fs.writeFile(receiptPath, sourceBytes);
      }
      records.push({
        id: spec.id,
        status: 'present',
        sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'),
        sourceAvailable: true,
        receiptPath: spec.receiptPath,
        size: sourceStats.size,
        sha256: sourceSha256,
      });
    } else if (receiptStats) {
      records.push({
        id: spec.id,
        status: 'frozen',
        sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'),
        sourceAvailable: false,
        receiptPath: spec.receiptPath,
        size: receiptStats.size,
        sha256: await sha256File(receiptPath),
      });
    } else {
      records.push({
        id: spec.id,
        status: 'missing',
        sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'),
        sourceAvailable: false,
        receiptPath: spec.receiptPath,
      });
    }
  }
  const indexPath = 'receipts/workbench-artifacts.json';
  const index = {
    schemaVersion: 'autovideo-workbench-receipts/v1',
    projectId,
    generatedBy: 'scripts/finalize-delivery-manifest.mjs',
    policy: 'Present artifacts are byte-for-byte snapshots. Missing artifacts are recorded but never synthesized.',
    artifacts: records,
  };
  await fs.mkdir(path.dirname(projectFile(projectRoot, indexPath)), {recursive: true});
  await fs.writeFile(projectFile(projectRoot, indexPath), stableJson(index), 'utf8');
  return {records, indexPath};
};

const optionalArtifactRecords = async (projectRoot, frozen) => {
  const records = [];
  for (const record of frozen.records) {
    records.push(record.status === 'missing'
      ? {id: record.id, status: 'missing', expectedPath: record.receiptPath, sourcePath: record.sourcePath}
      : {
        id: record.id,
        status: 'present',
        path: record.receiptPath,
        size: record.size,
        sha256: record.sha256,
        sourceAvailable: record.sourceAvailable,
      });
  }
  for (const spec of formalOptionalSpecs) {
    const target = projectFile(projectRoot, spec.path);
    const stats = await fileStatus(target);
    records.push(stats
      ? {id: spec.id, status: 'present', path: spec.path, size: stats.size, sha256: await sha256File(target)}
      : {id: spec.id, status: 'missing', expectedPath: spec.path});
  }
  const indexStats = await fs.stat(projectFile(projectRoot, frozen.indexPath));
  records.push({
    id: 'workbenchReceiptIndex',
    status: 'present',
    path: frozen.indexPath,
    size: indexStats.size,
    sha256: await sha256File(projectFile(projectRoot, frozen.indexPath)),
  });
  return records;
};

export const finalizeDeliveryManifest = async (projectId) => {
  validateProjectId(projectId);
  const projectRoot = path.join(projectsRoot, projectId);
  const manifestPath = path.join(projectRoot, 'delivery', 'delivery-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.projectId !== projectId || !Array.isArray(manifest.files)) throw new Error('Invalid delivery manifest.');

  const frozen = await freezeWorkbenchReceipts(projectId, projectRoot);
  const optionalArtifacts = await optionalArtifactRecords(projectRoot, frozen);
  const managedPaths = new Set([
    ...workbenchReceiptSpecs.map((spec) => spec.receiptPath),
    ...formalOptionalSpecs.map((spec) => spec.path),
    frozen.indexPath,
  ]);
  const requestedPaths = [
    ...manifest.files.map((item) => item.path).filter((relativePath) => !managedPaths.has(relativePath)),
    ...optionalArtifacts.filter((item) => item.status === 'present').map((item) => item.path),
  ];
  const seen = new Set();
  const files = [];
  for (const relativePath of requestedPaths) {
    if (!relativePath || seen.has(relativePath)) throw new Error(`Duplicate or invalid delivery path: ${relativePath}`);
    seen.add(relativePath);
    const target = projectFile(projectRoot, relativePath);
    const stats = await fs.stat(target);
    if (!stats.isFile()) throw new Error(`Delivery entry is not a file: ${relativePath}`);
    files.push({path: relativePath, size: stats.size, sha256: await sha256File(target)});
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  optionalArtifacts.sort((a, b) => a.id.localeCompare(b.id));

  const qa = JSON.parse(await fs.readFile(path.join(projectRoot, 'qa', 'delivery-report.json'), 'utf8'));
  const videoEntry = files.find((item) => item.path === qa.output.replace(/^.*?renders\//, 'renders/'))
    || files.find((item) => item.sha256 === qa.outputSha256);
  if (!videoEntry || videoEntry.sha256 !== qa.outputSha256) throw new Error('Delivery video no longer matches media QA.');
  manifest.files = files;
  manifest.optionalArtifacts = optionalArtifacts;
  manifest.generatedAt = new Date().toISOString();
  manifest.finalizedBy = 'scripts/finalize-delivery-manifest.mjs';
  manifest.integrity = {
    status: 'verified',
    fileCount: files.length,
    optionalPresent: optionalArtifacts.filter((item) => item.status === 'present').length,
    optionalMissing: optionalArtifacts.filter((item) => item.status === 'missing').length,
    deliveryVideoSha256: qa.outputSha256,
  };
  await fs.writeFile(manifestPath, stableJson(manifest), 'utf8');

  const verification = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  for (const item of verification.files) {
    const actual = await sha256File(path.join(projectRoot, item.path));
    if (actual !== item.sha256) throw new Error(`Post-write hash verification failed: ${item.path}`);
  }
  return {
    ok: true,
    projectId,
    fileCount: files.length,
    optionalPresent: manifest.integrity.optionalPresent,
    optionalMissing: manifest.integrity.optionalMissing,
    manifestSha256: await sha256File(manifestPath),
    deliveryVideoSha256: qa.outputSha256,
  };
};

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  finalizeDeliveryManifest(process.argv[2])
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
