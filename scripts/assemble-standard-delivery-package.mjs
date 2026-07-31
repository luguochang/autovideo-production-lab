import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePublicationRightsRecord} from '../workflow-console/lib/rights-clearance.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects');
const workbenchRoot = path.join(workspaceRoot, 'workflow-console', 'data');
const packageName = 'standard-package';

const parseArgs = (values) => {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const validateProjectId = (projectId) => {
  if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
    throw new Error('Usage: node scripts/assemble-standard-delivery-package.mjs --project <project-id> [--check]');
  }
  return projectId;
};

const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const json = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const exists = async (filePath) => fs.access(filePath).then(() => true).catch(() => false);
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const relative = (root, target) => path.relative(root, target).replaceAll('\\', '/');

export const humanReviewGateStatus = ({milestone, approval, receipt}) => ({
  status: milestone === 'passed' && approval?.scope === 'human-review' ? 'passed' : 'blocked',
  approvalScope: approval?.scope ?? null,
  internalReviewStatus: approval?.status === 'approved-internal-only' ? 'passed-internal-only' : null,
  receipt,
});

const ensureInside = (root, target) => {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  if (targetPath !== rootPath && !targetPath.toLowerCase().startsWith(`${rootPath.toLowerCase()}${path.sep}`)) {
    throw new Error(`Path escaped expected root: ${target}`);
  }
  return targetPath;
};

const validateBoundFile = async ({projectRoot, label, binding, issues}) => {
  if (!binding?.path || !binding?.sha256) {
    issues.push(`${label} binding is missing a path or SHA-256.`);
    return null;
  }
  const target = ensureInside(projectRoot, path.join(projectRoot, binding.path));
  if (!await exists(target)) {
    issues.push(`${label} binding target is missing: ${binding.path}`);
    return null;
  }
  const [actualSha256, stats] = await Promise.all([sha256(target), fs.stat(target)]);
  if (actualSha256 !== binding.sha256) issues.push(`${label} binding SHA-256 does not match: ${binding.path}`);
  if (binding.bytes != null && Number(binding.bytes) !== stats.size) issues.push(`${label} binding byte size does not match: ${binding.path}`);
  return {path: binding.path, sha256: actualSha256, bytes: stats.size};
};

export const validateOneScreenFinalReview = async ({projectId, projectRoot}) => {
  const reviewPath = path.join(projectRoot, 'review', 'one-screen-final-review.json');
  const mvpQaPath = path.join(projectRoot, 'qa', 'one-screen-mvp-report.json');
  const fileQaPath = path.join(projectRoot, 'qa', 'one-screen-mvp-file-qa.json');
  const [review, mvpQa, fileQa] = await Promise.all([
    json(reviewPath).catch(() => null),
    json(mvpQaPath).catch(() => null),
    json(fileQaPath).catch(() => null),
  ]);
  const issues = [];
  if (!review) issues.push('The one-screen final review receipt is missing or invalid.');
  if (!mvpQa) issues.push('The one-screen MVP QA receipt is missing or invalid.');
  if (!fileQa) issues.push('The one-screen file QA receipt is missing or invalid.');
  if (!review || !mvpQa || !fileQa) {
    return {approved: false, receipt: 'review/one-screen-final-review.json', issues};
  }

  if (review.schemaVersion !== 'autovideo-one-screen-final-review/v1') issues.push('Unexpected one-screen final review schema.');
  if (review.projectId !== projectId) issues.push('One-screen final review project ID does not match.');
  if (review.decision !== 'approve') issues.push('One-screen final review decision is not approve.');
  if (review.humanReviewPerformed !== true) issues.push('One-screen final review does not record a human review.');
  if (review.fullTimelineWatched !== true) issues.push('One-screen final review does not record a complete timeline watch.');
  if (review.publicReleaseBlocked !== true) issues.push('One-screen final review must remain blocked for public release.');
  if (mvpQa.projectId !== projectId || mvpQa.status !== 'passed') issues.push('One-screen MVP QA did not pass for this project.');
  if (mvpQa.checks?.hyperframesStrict?.status !== 'passed') issues.push('One-screen HyperFrames strict QA did not pass.');
  if (mvpQa.checks?.fileMediaQa?.status !== 'passed') issues.push('One-screen media QA did not pass.');
  if (fileQa.projectId !== projectId || fileQa.status !== 'passed') issues.push('File-only media QA did not pass for this project.');
  if (fileQa.publicReleaseBlocked !== true) issues.push('File-only media QA must remain blocked for public release.');

  const reviewVideo = await validateBoundFile({projectRoot, label: 'review video', binding: review.bindings?.video, issues});
  const reviewStoryboard = await validateBoundFile({projectRoot, label: 'review storyboard', binding: review.bindings?.storyboard, issues});
  const reviewQa = await validateBoundFile({projectRoot, label: 'review QA', binding: review.bindings?.qa, issues});
  for (const [id, binding] of Object.entries(mvpQa.bindings || {})) {
    await validateBoundFile({projectRoot, label: `MVP QA ${id}`, binding, issues});
  }
  if (reviewVideo && fileQa.source?.sha256 !== reviewVideo.sha256) issues.push('File QA is not bound to the human-reviewed video.');
  if (reviewVideo && mvpQa.bindings?.video?.sha256 !== reviewVideo.sha256) issues.push('MVP QA is not bound to the human-reviewed video.');
  if (reviewStoryboard && mvpQa.bindings?.storyboard?.sha256 !== reviewStoryboard.sha256) issues.push('MVP QA is not bound to the human-reviewed storyboard.');
  if (reviewQa && reviewQa.sha256 !== await sha256(mvpQaPath)) issues.push('Human review is not bound to the current MVP QA receipt.');

  return {
    approved: issues.length === 0,
    receipt: 'review/one-screen-final-review.json',
    reviewedAt: review.reviewedAt ?? null,
    reviewedBy: review.reviewedBy ?? null,
    issues,
  };
};

const walkFiles = async (root, filter = () => true) => {
  const output = [];
  const visit = async (directory) => {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const rel = relative(root, target);
      if (entry.isDirectory()) {
        if (filter(rel, true)) await visit(target);
      } else if (entry.isFile() && filter(rel, false)) {
        output.push(target);
      }
    }
  };
  await visit(root);
  return output.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
};

const projectFileFilter = (rel, isDirectory) => {
  const normalized = rel.replaceAll('\\', '/');
  if (normalized === 'delivery/standard-package' || normalized.startsWith('delivery/standard-package/')) return false;
  if (normalized.startsWith('delivery/.standard-package-')) return false;
  if (normalized === 'production/hyperframes/node_modules' || normalized.startsWith('production/hyperframes/node_modules/')) return false;
  return true;
};

const editableFor = (packagePath) => {
  if (packagePath.startsWith('automation/')) return true;
  if (packagePath.startsWith('project/production/hyperframes/')) {
    return !packagePath.includes('/assets/audio/') && !packagePath.includes('/assets/host/');
  }
  if (packagePath.startsWith('project/plan/') || packagePath.startsWith('project/overrides/')) return true;
  if (packagePath.startsWith('project/input/')) return !packagePath.endsWith('content-approval.json');
  if (packagePath.startsWith('workbench/artifacts/')) return true;
  return packagePath.endsWith('.md') || packagePath.endsWith('.json') || packagePath.endsWith('.html');
};

const copyFile = async (sourceRoot, sourcePath, destinationRoot, destinationPath, records, kind) => {
  const destination = ensureInside(destinationRoot, path.join(destinationRoot, destinationPath));
  await fs.mkdir(path.dirname(destination), {recursive: true});
  await fs.copyFile(sourcePath, destination);
  records.push({
    path: destinationPath.replaceAll('\\', '/'),
    sourcePath: relative(workspaceRoot, sourcePath),
    kind,
    editable: editableFor(destinationPath.replaceAll('\\', '/')),
  });
};

const readProjectState = async (projectId) => {
  const dbPath = path.join(workbenchRoot, 'db.json');
  if (!await exists(dbPath)) return {project: null, jobs: []};
  const db = await json(dbPath);
  const project = db.projects?.[projectId] ?? null;
  const jobs = Object.values(db.jobs ?? {})
    .filter((job) => job.projectId === projectId)
    .map((job) => ({
      id: job.id,
      stageId: job.stageId,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error,
      result: job.result,
    }))
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  return {project, jobs};
};

const documentationSpecs = [
  'AGENTS.md',
  'docs/10-讲解视频规模化SOP.md',
  'docs/11-CosyVoice14与HyperFrames最终视频教程.md',
  'docs/12-AutoVideo标准生产Runbook.md',
  'docs/13-AutoVideo完整链路缺口与标准化矩阵.md',
  'docs/14-标准交付包装配与验证.md',
  'docs/15-工作台画面微调与Overrides.md',
  'docs/16-工作台快速操作手册.md',
  'docs/17-批量内容入口与创意配方SOP.md',
  'docs/20-AutoVideo未完成项实施方案与开源复用调研.md',
  'docs/22-单屏样片验收操作手册.md',
  'docs/23-Text-to-One-Screen-MVP收口目标.md',
  'hyperframes-workflow-kit/VOICE_HANDOFF.md',
  'hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md',
  'style-library/STYLE_REGISTRY.md',
  'style-library/MOTION_REGISTRY.md',
  'style-library/styles/project/modern-ip-host-explainer/frame.md',
  'style-library/styles/project/modern-ip-host-explainer/STYLE_GUIDE.md',
  'style-library/styles/project/modern-ip-host-explainer/POSE_MANIFEST.json',
  'style-library/styles/project/modern-ip-host-explainer/LAYOUT_CONTRACT.md',
  'style-library/styles/project/modern-ip-host-explainer/PALETTE_VARIANTS.json',
  'workflow-console/README.md',
  'workflow-console/workflow-catalog.mjs',
];

const automationFileSpecs = [
  'package.json',
  'package-lock.json',
  'scripts/video-workflow.mjs',
  'scripts/prepare-content-ledgers.mjs',
  'scripts/finalize-audio-delivery.mjs',
  'scripts/build-audio-qa.mjs',
  'scripts/run-standard-delivery.mjs',
  'scripts/audit-autovideo-maturity.mjs',
  'scripts/scale-evidence-workflow.mjs',
  'scripts/standard-run-policy.mjs',
  'scripts/standard-run-receipt.mjs',
  'scripts/standard-recovery-matrix.mjs',
  'scripts/sync-project-sop-status.mjs',
  'scripts/finalize-delivery-manifest.mjs',
  'scripts/assemble-standard-delivery-package.mjs',
  'scripts/build-delivery-docs.mjs',
  'scripts/generate-deterministic-planning.mjs',
  'scripts/prepare-planning-fallback.mjs',
  'scripts/prepare-style-probe.mjs',
  'scripts/build-host-pose-assets.py',
  'scripts/run-screen-ocr.mjs',
  'workflow-console/package.json',
  'workflow-console/package-lock.json',
  'workflow-console/server.mjs',
  'workflow-console/server.json',
  'workflow-console/vite.config.mjs',
  'workflow-console/index.html',
  'workflow-console/workflow-catalog.mjs',
  'tools/voice-lab/lock_alignment_to_narration.py',
  'tools/voice-lab/validate_alignment_and_export_srt.py',
  'tools/voice-lab/tests/test_alignment_delivery.py',
];

const automationDirectorySpecs = [
  {path: 'tools/hyperframes-production', filter: (rel) => !rel.includes('node_modules') && !rel.includes('__pycache__')},
  {path: 'tools/ocr', filter: (rel) => !rel.includes('.venv') && !rel.includes('.cache') && !rel.includes('__pycache__')},
  {path: 'tools/motion-recipe-lifecycle', filter: (rel) => !rel.includes('node_modules')},
  {path: 'style-library/motion-library', filter: () => true},
  {path: 'workflow-console/lib', filter: (rel) => !rel.includes('node_modules')},
  {path: 'workflow-console/src', filter: (rel) => !rel.includes('node_modules')},
  {path: 'workflow-console/schemas', filter: () => true},
  {path: 'workflow-console/tests', filter: (rel) => !rel.includes('node_modules')},
  {path: 'workflow-console/contracts', filter: () => true},
  {path: 'hyperframes-workflow-kit/prompts', filter: () => true},
  {path: 'style-library/templates', filter: () => true},
];

const makeStatus = async ({projectId, projectRoot, sop, qa, deliveryQa, rights, claims, build, alignmentValidation, workbenchProject, sourceManifestSha256, packageRoot}) => {
  const oneScreenFinalReview = await validateOneScreenFinalReview({projectId, projectRoot});
  const humanListening = sop.milestones?.humanListening === 'passed' || oneScreenFinalReview.approved;
  const humanFinalReview = sop.milestones?.humanFinalReview === 'passed' || oneScreenFinalReview.approved;
  const rightsValidation = await validatePublicationRightsRecord({
    formalRoot: projectRoot,
    workspaceRoot,
    projectId,
    declaration: rights.declaration,
    record: rights,
  });
  const publicRights = rightsValidation.publicEligible === true;
  const claimBlockers = (claims.claims || []).filter((claim) => claim.evidenceStatus === 'unverified');
  const alignmentMethod = alignmentValidation?.method
    || alignmentValidation?.metadata?.method
    || alignmentValidation?.inputs?.method
    || 'base-asr-narration-lock-map';
  const releaseBlockers = [...new Set([
    ...(sop.release?.blockers || []),
    ...(qa.releaseBlockers || []),
    ...(deliveryQa.releaseBlockers || []),
  ])];
  const route = workbenchProject?.route || 'unknown';
  const planningFallback = await json(path.join(projectRoot, 'plan', 'planning-fallback-receipt.json')).catch(() => null);
  const hasProjectLocalPlanningFallback = Boolean(
    planningFallback
      && planningFallback.schemaVersion !== 'autovideo-planning-fallback/v2'
      && planningFallback.reusableAcrossUnrelatedScripts !== true,
  );
  const allRoutes = ['script', 'materials', 'audio'];
  const unvalidatedRoutes = allRoutes.filter((item) => item !== route);
  const packageRel = relative(projectRoot, packageRoot);
  const internalDeliveryReady = (
    sop.readiness?.internalDeliveryReady === true
    && qa.okForInternalReview === true
  ) || oneScreenFinalReview.approved;
  return {
    schemaVersion: 'autovideo-standard-delivery-package-status/v1',
    projectId,
    packageId: `${projectId}-standard-delivery`,
    generatedBy: 'scripts/assemble-standard-delivery-package.mjs',
    generatedAt: new Date().toISOString(),
    releaseScope: sop.release?.scope || deliveryQa.releaseScope || 'internal-only',
    internalDeliveryReady,
    publicReleaseBlocked: sop.release?.publicReleaseBlocked !== false,
    packagePath: packageRel,
    sourceDeliveryManifestSha256: sourceManifestSha256,
    checks: {
      narrationLock: Boolean(sop.evidence?.narrationLock?.exists),
      voiceRecipe: Boolean(sop.evidence?.voiceRecipe?.exists),
      audioQa: Boolean(sop.evidence?.audioQa?.exists),
      alignmentAndSrt: Boolean(sop.evidence?.alignmentValidation?.exists && sop.evidence?.subtitles?.exists),
      planningContracts: Boolean(build?.sceneCount && build?.cueCount),
      hyperframesStrictCheck: sop.verification?.composition?.strictCheckPassed === true,
      mediaQa: deliveryQa.ok === true,
      manifestIntegrity: sop.verification?.delivery?.deliveryManifestIntegrityValid === true,
      oneScreenFinalReviewBindings: oneScreenFinalReview.approved,
      workbenchSnapshot: Boolean(workbenchProject),
      editableComposition: await exists(path.join(projectRoot, 'production', 'hyperframes', 'index.html')),
    },
    humanGates: {
      listening: {
        status: humanListening ? 'passed' : 'blocked',
        receipt: oneScreenFinalReview.approved
          ? oneScreenFinalReview.receipt
          : (sop.evidence?.listeningReview?.path || 'audio/listening-review.json'),
      },
      subtitleReview: humanReviewGateStatus({
        milestone: sop.milestones?.subtitleHumanReview,
        approval: sop.approvals?.subtitleHumanReview,
        receipt: sop.evidence?.subtitleHumanApproval?.path || 'qa/subtitle-human-approval.json',
      }),
      screenTextReview: humanReviewGateStatus({
        milestone: sop.milestones?.screenTextHumanReview,
        approval: sop.approvals?.screenTextHumanReview,
        receipt: sop.evidence?.screenTextHumanApproval?.path || 'qa/screen-text-human-approval.json',
      }),
      finalStudioReview: {
        status: humanFinalReview ? 'passed' : 'blocked',
        receipt: oneScreenFinalReview.approved
          ? oneScreenFinalReview.receipt
          : (sop.evidence?.humanFinalReview?.path || 'qa/human-final-review.json'),
        reviewMode: oneScreenFinalReview.approved ? 'rendered-full-timeline' : null,
      },
      oneScreenFinalReview: {
        status: oneScreenFinalReview.approved ? 'passed' : 'blocked',
        receipt: oneScreenFinalReview.receipt,
        reviewedAt: oneScreenFinalReview.reviewedAt ?? null,
        issues: oneScreenFinalReview.issues,
      },
      publicationRights: {status: publicRights ? 'passed' : 'blocked', receipt: 'receipts/rights/publication-rights.json'},
    },
    validatedInputRoute: route,
    unvalidatedInputRoutes: unvalidatedRoutes,
    standardizationGaps: [
      ...(unvalidatedRoutes.length ? [{id: 'input-route-regression', status: 'open', detail: `真实金标项目尚未覆盖：${unvalidatedRoutes.join(', ')}`} ] : []),
      {id: 'prompt-chain-regression', status: 'open', detail: 'Evidence -> Outline -> Writer -> Oralizer -> Duration Fitter -> final Verifier 尚未接入跨项目真人金标回归。'},
      ...(alignmentMethod !== 'whisperx' ? [{id: 'forced-alignment', status: 'open', detail: `当前对齐方法为 ${alignmentMethod}；WhisperX/MFA 精确对齐尚未标准化。`}] : []),
      {id: 'ocr-semantic-review', status: 'open', detail: 'RapidOCR 机器适配器已接入；当前片逐帧 OCR 辅助审校、完整字幕语义和发布前人工终审仍需真人完成。'},
      ...(!rightsValidation.valid || rightsValidation.legacy ? [{
        id: 'rights-evidence-binding',
        status: 'open',
        detail: rightsValidation.legacy
          ? '当前权利清单仍为 v1，仅兼容内部审片；公开发布必须重新生成 v2 并绑定每项资产与本地凭据 SHA。'
          : `权利清单绑定无效：${rightsValidation.issues.join(' ')}`,
      }] : []),
      {id: 'studio-direct-roundtrip', status: 'partial', detail: '工作台已支持 scene/cue/object 结构化 overrides、字段级替代/撤销和确定性重编译；Studio 内直接修改后的自动差异捕获与回写尚未完成。'},
      {id: 'batch-operations', status: 'partial', detail: '批次已具备冻结素材 payload SHA、阶段依赖与执行设置输入快照、原子 reservation、实际输出 SHA、运行计划、终态时间回执、失败有界重试、暂停/恢复、按逻辑任务去重和自动运行到下一人工门；20 个真实项目的资源、成本、人工修改率、素材复用率和返工率仍未形成基准。'},
      ...(hasProjectLocalPlanningFallback ? [{id: 'project-local-fallback', status: 'open', detail: '本项目规划 fallback 已绑定当前哈希，不能直接作为其他文稿的通用规则。'}] : []),
    ],
    releaseBlockers,
    claimsRequiringFraming: claimBlockers.map((claim) => ({id: claim.id, evidenceStatus: claim.evidenceStatus, kind: claim.kind})),
    publicMaster: {
      requiredPath: 'project/renders/master.mp4',
      exists: await exists(path.join(projectRoot, 'renders', 'master.mp4')),
      allowed: !sop.release?.publicReleaseBlocked,
    },
    nextAction: internalDeliveryReady && sop.release?.publicReleaseBlocked
      ? 'Internal package is ready. Public release remains blocked until its independent rights, subtitle, screen-text and release gates pass.'
      : sop.release?.publicReleaseBlocked
        ? 'Complete human listening, full-timeline review, publication rights and claim framing before public master render.'
      : 'Run the package verifier and platform-specific release checks.',
  };
};

export const verifyPackageRoot = async (packageRoot) => {
  const manifestPath = path.join(packageRoot, 'PACKAGE_MANIFEST.json');
  const statusPath = path.join(packageRoot, 'PACKAGE_STATUS.json');
  const manifest = await json(manifestPath);
  const status = await json(statusPath);
  if (!Array.isArray(manifest.files) || manifest.schemaVersion !== 'autovideo-standard-delivery-package/v1') {
    throw new Error('Invalid standard delivery package manifest.');
  }
  const expected = new Set([...manifest.files.map((item) => item.path), 'PACKAGE_MANIFEST.json']);
  const actualFiles = (await walkFiles(packageRoot)).map((filePath) => relative(packageRoot, filePath));
  const extras = actualFiles.filter((item) => !expected.has(item));
  const missing = [...expected].filter((item) => !actualFiles.includes(item));
  if (extras.length || missing.length) throw new Error(`Package file set mismatch. extras=${extras.join(',')} missing=${missing.join(',')}`);
  for (const item of manifest.files) {
    const target = path.join(packageRoot, item.path);
    const stats = await fs.stat(target);
    const actualSha256 = await sha256(target);
    if (stats.size !== item.size || actualSha256 !== item.sha256) throw new Error(`Package hash verification failed: ${item.path}`);
  }
  const video = manifest.files.find((item) => item.path.endsWith('internal-review.mp4') || item.path.endsWith('master.mp4'));
  if (!video || video.sha256 !== manifest.integrity.deliveryVideoSha256) throw new Error('Package video hash is not bound to package integrity.');
  const packagedDeliveryManifest = manifest.files.find((item) => item.path === 'project/delivery/delivery-manifest.json');
  if (!packagedDeliveryManifest || packagedDeliveryManifest.sha256 !== manifest.sourceDeliveryManifestSha256) throw new Error('Packaged delivery manifest hash is not bound.');
  if (status.publicReleaseBlocked && actualFiles.includes('project/renders/master.mp4')) throw new Error('A public master cannot be packaged while release is blocked.');
  return {
    ok: true,
    projectId: manifest.projectId,
    packageRoot,
    fileCount: manifest.files.length,
    totalBytes: manifest.integrity.totalBytes,
    deliveryVideoSha256: manifest.integrity.deliveryVideoSha256,
    internalDeliveryReady: status.internalDeliveryReady,
    publicReleaseBlocked: status.publicReleaseBlocked,
  };
};

export const verifyStandardDeliveryPackage = async (projectId) => {
  validateProjectId(projectId);
  const projectRoot = path.join(projectsRoot, projectId);
  const packageRoot = path.join(projectRoot, 'delivery', packageName);
  if (!await exists(packageRoot)) throw new Error(`Standard package does not exist: ${packageRoot}`);
  return verifyPackageRoot(packageRoot);
};

export const assembleStandardDeliveryPackage = async (projectId) => {
  validateProjectId(projectId);
  const projectRoot = ensureInside(projectsRoot, path.join(projectsRoot, projectId));
  const packageRoot = ensureInside(projectRoot, path.join(projectRoot, 'delivery', packageName));
  const manifestPath = path.join(projectRoot, 'delivery', 'delivery-manifest.json');
  const sopPath = path.join(projectRoot, 'SOP_STATUS.json');
  const qaPath = path.join(projectRoot, 'qa', 'report.json');
  const deliveryQaPath = path.join(projectRoot, 'qa', 'delivery-report.json');
  const rightsPath = path.join(projectRoot, 'receipts', 'rights', 'publication-rights.json');
  const claimsPath = path.join(projectRoot, 'input', 'claim-ledger.json');
  const buildPath = path.join(projectRoot, 'production', 'hyperframes', 'data', 'composition-build.json');
  const alignmentValidationPath = path.join(projectRoot, 'captions', 'alignment-validation.json');
  const required = [manifestPath, sopPath, qaPath, deliveryQaPath, rightsPath, claimsPath, buildPath];
  for (const filePath of required) if (!await exists(filePath)) throw new Error(`Cannot assemble package; missing ${relative(projectRoot, filePath)}`);

  const [sourceManifest, sop, qa, deliveryQa, rights, claims, build, alignmentValidation, workbench] = await Promise.all([
    json(manifestPath), json(sopPath), json(qaPath), json(deliveryQaPath), json(rightsPath), json(claimsPath), json(buildPath),
    exists(alignmentValidationPath).then((present) => present ? json(alignmentValidationPath) : null), readProjectState(projectId),
  ]);
  if (sourceManifest.integrity?.status !== 'verified') throw new Error('Source delivery manifest is not verified.');
  for (const item of sourceManifest.files || []) {
    const sourcePath = path.join(projectRoot, item.path);
    if (!await exists(sourcePath) || await sha256(sourcePath) !== item.sha256) throw new Error(`Source delivery manifest is stale: ${item.path}`);
  }
  const videoSha256 = deliveryQa.outputSha256;
  const videoItem = sourceManifest.files.find((item) => item.sha256 === videoSha256);
  if (!videoItem) throw new Error('Delivery QA video is not present in the source manifest.');

  const deliveryParent = path.dirname(packageRoot);
  await fs.mkdir(deliveryParent, {recursive: true});
  const tempRoot = ensureInside(projectRoot, path.join(deliveryParent, `.standard-package-${crypto.randomUUID()}`));
  await fs.mkdir(tempRoot, {recursive: true});
  const records = [];
  try {
    const projectFiles = await walkFiles(projectRoot, projectFileFilter);
    for (const sourcePath of projectFiles) {
      const rel = relative(projectRoot, sourcePath);
      await copyFile(projectRoot, sourcePath, tempRoot, path.join('project', rel), records, 'formal-project');
    }

    const workbenchProject = workbench.project;
    const workbenchSnapshot = {
      schemaVersion: 'autovideo-workbench-snapshot/v1',
      projectId,
      capturedAt: new Date().toISOString(),
      capturedBeforePackageStageCommit: true,
      policy: 'This is an audit snapshot. Reopen the project in the workbench before making edits; package files remain hash-bound copies.',
      project: workbenchProject,
      jobs: workbench.jobs,
    };
    const snapshotPath = path.join(tempRoot, 'workbench', 'PROJECT_SNAPSHOT.json');
    await fs.mkdir(path.dirname(snapshotPath), {recursive: true});
    await fs.writeFile(snapshotPath, stableJson(workbenchSnapshot), 'utf8');
    records.push({path: 'workbench/PROJECT_SNAPSHOT.json', sourcePath: 'workflow-console/data/db.json', kind: 'workbench-snapshot', editable: true});

    const workbenchArtifactsRoot = path.join(workbenchRoot, 'projects', projectId, 'artifacts');
    if (await exists(workbenchArtifactsRoot)) {
      const artifactFiles = await walkFiles(workbenchArtifactsRoot);
      for (const sourcePath of artifactFiles) {
        const rel = relative(workbenchArtifactsRoot, sourcePath);
        await copyFile(workbenchArtifactsRoot, sourcePath, tempRoot, path.join('workbench', 'artifacts', rel), records, 'workbench-artifact');
      }
    }

    for (const documentationPath of documentationSpecs) {
      const sourcePath = path.join(workspaceRoot, documentationPath);
      if (!await exists(sourcePath)) continue;
      await copyFile(workspaceRoot, sourcePath, tempRoot, path.join('documentation', documentationPath), records, 'workflow-documentation');
    }

    for (const automationPath of automationFileSpecs) {
      const sourcePath = path.join(workspaceRoot, automationPath);
      if (!await exists(sourcePath)) continue;
      await copyFile(workspaceRoot, sourcePath, tempRoot, path.join('automation', automationPath), records, 'automation-source');
    }
    for (const spec of automationDirectorySpecs) {
      const sourceRoot = path.join(workspaceRoot, spec.path);
      if (!await exists(sourceRoot)) continue;
      for (const sourcePath of await walkFiles(sourceRoot, spec.filter)) {
        const rel = relative(workspaceRoot, sourcePath);
        await copyFile(workspaceRoot, sourcePath, tempRoot, path.join('automation', rel), records, 'automation-source');
      }
    }

    const sourceManifestSha256 = await sha256(manifestPath);
    const status = await makeStatus({projectId, projectRoot, sop, qa, deliveryQa, rights, claims, build, alignmentValidation, workbenchProject, sourceManifestSha256, packageRoot});
    const statusPath = path.join(tempRoot, 'PACKAGE_STATUS.json');
    await fs.writeFile(statusPath, stableJson(status), 'utf8');
    records.push({path: 'PACKAGE_STATUS.json', sourcePath: relative(workspaceRoot, sopPath), kind: 'package-status', editable: false});

    const readme = `# ${projectId} 标准交付包\n\n` +
      `这是 AutoVideo 的可复核内部标准交付包，生成时间：${status.generatedAt}。\n\n` +
      `- 交付范围：**${status.releaseScope}**\n` +
      `- 内部交付：**${status.internalDeliveryReady ? 'ready' : 'blocked'}**\n` +
      `- 公开发布：**${status.publicReleaseBlocked ? 'blocked' : 'ready'}**\n` +
      `- 正式 MP4：\`${videoItem.path}\`\n` +
      `- MP4 SHA-256：\`${videoSha256}\`\n\n` +
      `## 包内结构\n\n` +
      `- \`project/\`：正式项目输入、音频、字幕、分镜、素材、HyperFrames 可编辑源码、QA 和内部审片 MP4。\n` +
      `- \`workbench/\`：工作台阶段快照、版本、审批作用域、失败回执和产物副本。\n` +
      `- \`automation/\`：本次流程使用的脚本、schema、提示词、工作台源码和 HyperFrames 编译器冻结版本。\n` +
      `- \`documentation/\`：声音交接、视频交接、风格合同、SOP 和本次运行规则。\n` +
      `- \`PACKAGE_STATUS.json\`：完成度、人工门禁和规模化缺口。\n` +
      `- \`PACKAGE_MANIFEST.json\`：逐文件 SHA-256 完整性清单。\n\n` +
      `## 复用和编辑\n\n` +
      `1. 在工作区重新打开工作台，继续编辑原项目；不要直接修改包内机器回执。\n` +
      `2. 屏幕文字、人物姿态和左右布局通过工作台“画面微调”写入 \`project/overrides/overrides.json\`，再重新生成全片；不要把直接修改编译后 HTML 当作正式覆盖。\n` +
      `3. 输入稿和规划产物也应通过工作台编辑，以保留 revision、人工原因和下游 stale 传播。\n` +
      `4. 任何 NarrationLock、最终 WAV 或 alignment 变化，都必须按 SOP 重新生成下游产物。\n` +
      `5. 验证本包：\`npm.cmd run video:verify-package -- --project ${projectId}\`。\n` +
      `6. 公开发布前必须完成 PACKAGE_STATUS 中的人工听审、Studio 全片审片、OCR/字幕终审和权利门禁。\n\n` +
      `## 当前未合成的公开母版\n\n` +
      `由于公开发布门禁仍未通过，包内只包含明确命名的 internal-review MP4，不包含 \`master.mp4\`。这不是遗漏，是发布安全门禁的结果。\n`;
    await fs.writeFile(path.join(tempRoot, 'README.md'), readme, 'utf8');
    records.push({path: 'README.md', sourcePath: null, kind: 'package-readme', editable: true});

    const fileSet = await walkFiles(tempRoot);
    const manifestFiles = [];
    for (const filePath of fileSet) {
      const packagePath = relative(tempRoot, filePath);
      const metadata = records.find((item) => item.path === packagePath) || {sourcePath: null, kind: 'formal-project', editable: editableFor(packagePath)};
      const stats = await fs.stat(filePath);
      manifestFiles.push({path: packagePath, sourcePath: metadata.sourcePath, kind: metadata.kind, editable: metadata.editable, size: stats.size, sha256: await sha256(filePath)});
    }
    manifestFiles.sort((left, right) => left.path.localeCompare(right.path));
    const packageManifest = {
      schemaVersion: 'autovideo-standard-delivery-package/v1',
      packageId: `${projectId}-standard-delivery`,
      projectId,
      generatedBy: 'scripts/assemble-standard-delivery-package.mjs',
      generatedAt: new Date().toISOString(),
      releaseScope: status.releaseScope,
      publicReleaseBlocked: status.publicReleaseBlocked,
      sourceDeliveryManifestSha256: sourceManifestSha256,
      files: manifestFiles,
      integrity: {
        status: 'verified',
        fileCount: manifestFiles.length,
        totalBytes: manifestFiles.reduce((sum, item) => sum + item.size, 0),
        deliveryVideoPath: `project/${videoItem.path}`,
        deliveryVideoSha256: videoSha256,
      },
    };
    await fs.writeFile(path.join(tempRoot, 'PACKAGE_MANIFEST.json'), stableJson(packageManifest), 'utf8');
    const verification = await verifyPackageRoot(tempRoot);

    let previousRoot = null;
    if (await exists(packageRoot)) {
      previousRoot = ensureInside(projectRoot, path.join(deliveryParent, `.standard-package-previous-${crypto.randomUUID()}`));
      await fs.rename(packageRoot, previousRoot);
    }
    try {
      await fs.rename(tempRoot, packageRoot);
    } catch (error) {
      if (previousRoot && await exists(previousRoot)) await fs.rename(previousRoot, packageRoot);
      throw error;
    }
    if (previousRoot && await exists(previousRoot)) await fs.rm(previousRoot, {recursive: true, force: true});
    return {...verification, packageRoot};
  } catch (error) {
    if (await exists(tempRoot)) await fs.rm(tempRoot, {recursive: true, force: true});
    throw error;
  }
};

export const refreshStandardDeliveryPackageMetadata = async (projectId) => {
  validateProjectId(projectId);
  const projectRoot = ensureInside(projectsRoot, path.join(projectsRoot, projectId));
  const packageRoot = ensureInside(projectRoot, path.join(projectRoot, 'delivery', packageName));
  if (!await exists(packageRoot)) throw new Error(`Standard package does not exist: ${packageRoot}`);
  const packageManifestPath = path.join(packageRoot, 'PACKAGE_MANIFEST.json');
  const sourceManifestPath = path.join(projectRoot, 'delivery', 'delivery-manifest.json');
  const [packageManifest, sourceManifest, sop, qa, deliveryQa, rights, claims, build, alignmentValidation, workbench] = await Promise.all([
    json(packageManifestPath), json(sourceManifestPath), json(path.join(projectRoot, 'SOP_STATUS.json')), json(path.join(projectRoot, 'qa', 'report.json')),
    json(path.join(projectRoot, 'qa', 'delivery-report.json')), json(path.join(projectRoot, 'receipts', 'rights', 'publication-rights.json')),
    json(path.join(projectRoot, 'input', 'claim-ledger.json')), json(path.join(projectRoot, 'production', 'hyperframes', 'data', 'composition-build.json')),
    exists(path.join(projectRoot, 'captions', 'alignment-validation.json')).then((present) => present ? json(path.join(projectRoot, 'captions', 'alignment-validation.json')) : null),
    readProjectState(projectId),
  ]);
  const workbenchProject = workbench.project;
  const status = await makeStatus({
    projectId,
    projectRoot,
    sop,
    qa,
    deliveryQa,
    rights,
    claims,
    build,
    alignmentValidation,
    workbenchProject,
    sourceManifestSha256: await sha256(sourceManifestPath),
    packageRoot,
  });
  const copyMutableProjectFiles = [
    'SOP_STATUS.json',
    'project-state.json',
    'PIPELINE_RUN_LOG.md',
    'RUN_EXECUTION_LOG.md',
    'RETROSPECTIVE.md',
    'PROCESS_LOG.md',
    'DELIVERY_CHECKLIST.md',
    'delivery/delivery-manifest.json',
  ];
  for (const projectPath of copyMutableProjectFiles) {
    const sourcePath = path.join(projectRoot, projectPath);
    const destinationPath = path.join(packageRoot, 'project', projectPath);
    if (await exists(sourcePath) && await exists(destinationPath)) await fs.copyFile(sourcePath, destinationPath);
  }
  // Refresh reusable documentation and automation sources in place as well.
  // This keeps an existing verified package current when Windows temporarily
  // holds the package directory open and prevents the normal atomic rename.
  for (const documentationPath of documentationSpecs) {
    const sourcePath = path.join(workspaceRoot, documentationPath);
    if (!await exists(sourcePath)) continue;
    const destinationPath = path.join(packageRoot, 'documentation', documentationPath);
    await fs.mkdir(path.dirname(destinationPath), {recursive: true});
    await fs.copyFile(sourcePath, destinationPath);
  }
  for (const automationPath of automationFileSpecs) {
    const sourcePath = path.join(workspaceRoot, automationPath);
    if (!await exists(sourcePath)) continue;
    const destinationPath = path.join(packageRoot, 'automation', automationPath);
    await fs.mkdir(path.dirname(destinationPath), {recursive: true});
    await fs.copyFile(sourcePath, destinationPath);
  }
  for (const spec of automationDirectorySpecs) {
    const sourceRoot = path.join(workspaceRoot, spec.path);
    if (!await exists(sourceRoot)) continue;
    for (const sourcePath of await walkFiles(sourceRoot, spec.filter)) {
      const destinationPath = path.join(packageRoot, 'automation', relative(workspaceRoot, sourcePath));
      await fs.mkdir(path.dirname(destinationPath), {recursive: true});
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
  const snapshot = {
    schemaVersion: 'autovideo-workbench-snapshot/v1',
    projectId,
    capturedAt: new Date().toISOString(),
    capturedBeforePackageStageCommit: false,
    policy: 'This is an audit snapshot. Reopen the project in the workbench before making edits; package files remain hash-bound copies.',
    project: workbenchProject,
    jobs: workbench.jobs,
  };
  await fs.writeFile(path.join(packageRoot, 'workbench', 'PROJECT_SNAPSHOT.json'), stableJson(snapshot), 'utf8');
  const workbenchStatusPath = path.join(workbenchRoot, 'projects', projectId, 'artifacts', 'package-export', 'PACKAGE_STATUS.json');
  await fs.mkdir(path.dirname(workbenchStatusPath), {recursive: true});
  await fs.writeFile(workbenchStatusPath, stableJson(status), 'utf8');
  const packagedWorkbenchStatusPath = path.join(packageRoot, 'workbench', 'artifacts', 'package-export', 'PACKAGE_STATUS.json');
  if (await exists(packagedWorkbenchStatusPath)) await fs.copyFile(workbenchStatusPath, packagedWorkbenchStatusPath);
  await fs.writeFile(path.join(packageRoot, 'PACKAGE_STATUS.json'), stableJson(status), 'utf8');

  const files = [];
  for (const filePath of await walkFiles(packageRoot, (rel) => rel !== 'PACKAGE_MANIFEST.json')) {
    const packagePath = relative(packageRoot, filePath);
    const previous = packageManifest.files.find((item) => item.path === packagePath);
    const stats = await fs.stat(filePath);
    files.push({
      path: packagePath,
      sourcePath: previous?.sourcePath || null,
      kind: previous?.kind || 'package-generated',
      editable: previous?.editable ?? editableFor(packagePath),
      size: stats.size,
      sha256: await sha256(filePath),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const video = files.find((item) => item.path.endsWith('internal-review.mp4') || item.path.endsWith('master.mp4'));
  if (!video) throw new Error('Standard package has no delivery video during metadata refresh.');
  packageManifest.generatedAt = new Date().toISOString();
  packageManifest.publicReleaseBlocked = status.publicReleaseBlocked;
  packageManifest.releaseScope = status.releaseScope;
  packageManifest.sourceDeliveryManifestSha256 = await sha256(sourceManifestPath);
  packageManifest.files = files;
  packageManifest.integrity = {
    status: 'verified',
    fileCount: files.length,
    totalBytes: files.reduce((sum, item) => sum + item.size, 0),
    deliveryVideoPath: video.path,
    deliveryVideoSha256: video.sha256,
  };
  await fs.writeFile(packageManifestPath, stableJson(packageManifest), 'utf8');
  return verifyPackageRoot(packageRoot);
};

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = validateProjectId(args.project);
  const operation = args.check
    ? verifyStandardDeliveryPackage(projectId)
    : args['refresh-metadata']
      ? refreshStandardDeliveryPackageMetadata(projectId)
      : assembleStandardDeliveryPackage(projectId);
  operation.then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
