import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const runtimeExtensions = new Set(['.js', '.json', '.md', '.mjs', '.py']);
const ignoredRuntimeDirectories = new Set([
  '.history', '.venv', '__pycache__', 'data', 'dist', 'examples', 'fixtures', 'gold',
  'node_modules', 'results', 'test', 'tests',
]);
const ignoredRuntimeFile = (filePath) => path.basename(filePath).startsWith('test-');
const ignoredPackageInputDirectories = new Set([
  '.cache', '.venv', '__pycache__', 'dist', 'node_modules', 'results',
]);

const collectRuntimeFiles = (target, files = []) => {
  if (!fs.existsSync(target)) return files;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (runtimeExtensions.has(path.extname(target).toLowerCase()) && !ignoredRuntimeFile(target)) files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target, {withFileTypes: true})) {
    if (entry.isDirectory() && ignoredRuntimeDirectories.has(entry.name)) continue;
    collectRuntimeFiles(path.join(target, entry.name), files);
  }
  return files;
};

const generatorRuntimeFiles = [
  path.join(workspaceRoot, 'workflow-console', 'lib'),
  path.join(workspaceRoot, 'workflow-console', 'schemas'),
  path.join(workspaceRoot, 'workflow-console', 'workflow-catalog.mjs'),
  path.join(workspaceRoot, 'scripts'),
  path.join(workspaceRoot, 'tools', 'content-pipeline', 'content-contract.mjs'),
  path.join(workspaceRoot, 'tools', 'content-pipeline', 'content-prompt-chain.mjs'),
  path.join(workspaceRoot, 'tools', 'content-pipeline', 'content-regression.mjs'),
  path.join(workspaceRoot, 'tools', 'content-pipeline', 'prompt-chain'),
  path.join(workspaceRoot, 'tools', 'hyperframes-production', 'lib'),
  path.join(workspaceRoot, 'tools', 'hyperframes-production', 'compile-production.mjs'),
  path.join(workspaceRoot, 'tools', 'voice-lab', 'merge_breath_audio.mjs'),
  path.join(workspaceRoot, 'tools', 'voice-lab', 'pronunciation-contract.mjs'),
  path.join(workspaceRoot, 'tools', 'voice-lab', 'lock_alignment_to_narration.py'),
  path.join(workspaceRoot, 'tools', 'voice-lab', 'transcribe_locked_audio.py'),
  path.join(workspaceRoot, 'tools', 'voice-lab', 'CosyVoice', 'run_zh_female_seed7.py'),
].flatMap((target) => collectRuntimeFiles(target))
  .map((filePath) => path.resolve(filePath))
  .filter((filePath, index, values) => values.indexOf(filePath) === index)
  .sort((left, right) => left.localeCompare(right));

export const GENERATOR_RUNTIME_SHA256 = (() => {
  const digest = createHash('sha256');
  for (const filePath of generatorRuntimeFiles) {
    digest.update(path.relative(workspaceRoot, filePath).replaceAll('\\', '/'));
    digest.update('\0');
    digest.update(fs.readFileSync(filePath));
    digest.update('\0');
  }
  return digest.digest('hex');
})();

const normalize = (value) => {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
};

const formalInputsByStage = {
  'visual-plan': [
    'NarrationLock.json',
    'audio/alignment.json',
    'template-lock.json',
    'plan/storyboard.json',
    'plan/graph-ir.json',
    'plan/shot-manifest.json',
    'plan/production-manifest.json',
    'plan/planning-bundle.json',
    'plan/planning-fallback-bundle.json',
  ],
  'style-probe': [
    'NarrationLock.json',
    'audio/narration.final.wav',
    'style-selection.json',
    'STYLE_REVIEW.md',
    'review/probe-review.json',
    'review/probe-check.json',
    'review/stills/style-probe-hidden-complexity.png',
    'review/probes/style-probe-hidden-complexity.mp4',
  ],
  'full-production': [
    'NarrationLock.json',
    'audio/alignment.json',
    'audio/narration.final.wav',
    'template-lock.json',
    'style-selection.json',
    'plan/storyboard.json',
    'plan/graph-ir.json',
    'plan/shot-manifest.json',
    'plan/production-manifest.json',
  ],
  'package-export': [
    'SOP_STATUS.json',
    'RETROSPECTIVE.md',
    'delivery/delivery-manifest.json',
    'qa/delivery-report.json',
    'qa/internal-review-delivery.json',
  ],
};

const packageWorkspaceInputPaths = [
  'AGENTS.md',
  'package.json',
  'package-lock.json',
  'docs',
  'hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md',
  'hyperframes-workflow-kit/VOICE_HANDOFF.md',
  'hyperframes-workflow-kit/prompts',
  'scripts',
  'style-library/MOTION_REGISTRY.md',
  'style-library/STYLE_REGISTRY.md',
  'style-library/motion-library',
  'style-library/styles/project/modern-ip-host-explainer',
  'style-library/templates',
  'tools/content-pipeline',
  'tools/hyperframes-production',
  'tools/motion-recipe-lifecycle',
  'tools/ocr',
  'tools/voice-lab/lock_alignment_to_narration.py',
  'tools/voice-lab/merge_breath_audio.mjs',
  'tools/voice-lab/pronunciation-contract.mjs',
  'tools/voice-lab/transcribe_locked_audio.py',
  'workflow-console/README.md',
  'workflow-console/index.html',
  'workflow-console/lib',
  'workflow-console/package.json',
  'workflow-console/package-lock.json',
  'workflow-console/schemas',
  'workflow-console/server.json',
  'workflow-console/server.mjs',
  'workflow-console/src',
  'workflow-console/tests',
  'workflow-console/vite.config.mjs',
  'workflow-console/workflow-catalog.mjs',
];

const collectPackageInputFiles = (target, files = []) => {
  if (!fs.existsSync(target)) return files;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target, {withFileTypes: true})) {
    if (entry.isDirectory() && ignoredPackageInputDirectories.has(entry.name)) continue;
    collectPackageInputFiles(path.join(target, entry.name), files);
  }
  return files;
};

const workspaceInputRecord = (relativePath) => {
  const target = path.resolve(workspaceRoot, relativePath);
  if (target !== workspaceRoot && !target.startsWith(`${workspaceRoot}${path.sep}`)) {
    return {path: relativePath, status: 'invalid-path', sha256: null, bytes: null, fileCount: null};
  }
  if (!fs.existsSync(target)) return {path: relativePath, status: 'missing', sha256: null, bytes: null, fileCount: null};
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    const bytes = fs.readFileSync(target);
    return {
      path: relativePath,
      status: 'current',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      fileCount: 1,
    };
  }
  const files = collectPackageInputFiles(target)
    .map((filePath) => path.resolve(filePath))
    .sort((left, right) => left.localeCompare(right));
  const digest = createHash('sha256');
  let bytes = 0;
  for (const filePath of files) {
    const content = fs.readFileSync(filePath);
    digest.update(path.relative(target, filePath).replaceAll('\\', '/'));
    digest.update('\0');
    digest.update(content);
    digest.update('\0');
    bytes += content.length;
  }
  return {
    path: relativePath,
    status: 'current',
    sha256: digest.digest('hex'),
    bytes,
    fileCount: files.length,
  };
};

const stageWorkspaceInputs = (stageId) => stageId === 'package-export'
  ? packageWorkspaceInputPaths.map(workspaceInputRecord)
  : [];

const stageFormalInputs = (project, stageId) => {
  const relativeRoot = project?.formalProjectPath;
  const relativePaths = [
    ...(formalInputsByStage[stageId] ?? []),
    ...(stageId === 'package-export' && project?.id
      ? [
        `renders/${project.id}-internal-review.mp4`,
        `renders/${project.id}-cover.png`,
      ]
      : []),
  ];
  if (!relativeRoot || !relativePaths.length) return [];
  const formalRoot = path.resolve(workspaceRoot, relativeRoot);
  if (formalRoot !== workspaceRoot && !formalRoot.startsWith(`${workspaceRoot}${path.sep}`)) {
    return [{path: relativeRoot, status: 'invalid-formal-project-path', sha256: null, bytes: null}];
  }
  return relativePaths.map((relativePath) => {
    const target = path.resolve(formalRoot, relativePath);
    if (target !== formalRoot && !target.startsWith(`${formalRoot}${path.sep}`)) {
      return {path: relativePath, status: 'invalid-path', sha256: null, bytes: null};
    }
    if (!fs.existsSync(target)) return {path: relativePath, status: 'missing', sha256: null, bytes: null};
    const bytes = fs.readFileSync(target);
    return {
      path: relativePath,
      status: 'current',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    };
  });
};

export const stableJson = (value) => JSON.stringify(normalize(value));

export const frozenSourceIdentity = (project) => {
  const intake = project?.contentIntake;
  const payloadSha256 = String(intake?.payload?.sha256 ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(payloadSha256)) {
    return {
      mode: 'legacy-unfrozen-path',
      intakeId: null,
      inputType: null,
      payloadSha256: null,
      payloadBytes: null,
      fileCount: null,
      pipelineIntakePath: null,
    };
  }
  return {
    mode: 'immutable-content-intake',
    intakeId: intake.id ?? null,
    inputType: intake.inputType ?? null,
    payloadSha256,
    payloadBytes: Number(intake.payload?.bytes ?? 0),
    fileCount: Number(intake.payload?.fileCount ?? 0),
    pipelineIntakePath: intake.pipelineIntakePath ?? null,
  };
};

export const hasFrozenSourceIdentity = (project) => frozenSourceIdentity(project).mode === 'immutable-content-intake';

export const buildStageInputSnapshot = (project, stageId, {generatorRuntimeSha256 = GENERATOR_RUNTIME_SHA256} = {}) => {
  const order = Array.isArray(project?.stageOrder) ? project.stageOrder : [];
  const index = order.indexOf(stageId);
  const stage = project?.stages?.[stageId] ?? null;
  const dependencies = (index < 0 ? [] : order.slice(0, index)).map((id) => {
    const dependency = project?.stages?.[id];
    return {
      id,
      status: dependency?.status ?? null,
      revision: Number(dependency?.revision ?? 0),
      artifactSha256: dependency?.artifactSha256 ?? null,
      approvedArtifactSha256: dependency?.approvedArtifactSha256 ?? null,
      enabled: dependency?.enabled !== false,
    };
  });
  return {
    schemaVersion: 'autovideo-job-input/v3',
    generatorRuntime: {
      sha256: generatorRuntimeSha256,
      fileCount: generatorRuntimeFiles.length,
    },
    project: {
      id: project?.id ?? null,
      title: project?.title ?? null,
      route: project?.route ?? null,
      sourcePath: project?.sourcePath ?? null,
      platform: project?.platform ?? null,
      targetDuration: project?.targetDuration ?? null,
      voiceRoute: project?.voiceRoute ?? null,
      audience: project?.audience ?? null,
      targetOutcome: project?.targetOutcome ?? null,
      automation: project?.automation ?? null,
      ratio: project?.ratio ?? null,
      resolution: project?.resolution ?? null,
      fps: project?.fps ?? null,
      publicationRights: project?.publicationRights ?? null,
      rightsNotes: project?.rightsNotes ?? null,
      formalProjectPath: project?.formalProjectPath ?? null,
      sourceIdentity: frozenSourceIdentity(project),
    },
    stage: {
      id: stageId,
      enabled: stage?.enabled !== false,
      mode: stage?.mode ?? null,
      toolId: stage?.toolId ?? null,
      promptOverride: stage?.promptOverride ?? '',
      overrides: (stage?.overrides ?? []).map((item) => ({
        id: item.id ?? null,
        action: item.action ?? null,
        reason: item.reason ?? null,
        revision: Number(item.revision ?? 0),
      })),
    },
    formalInputs: stageFormalInputs(project, stageId),
    workspaceInputs: stageWorkspaceInputs(stageId),
    dependencies,
  };
};

export const hashStageInput = (snapshot) => createHash('sha256').update(stableJson(snapshot)).digest('hex');

export const jobIdempotencyKey = ({projectId, stageId, inputSha256}) =>
  `stage:${projectId}:${stageId}:${inputSha256}`;

export const jobLogicalKey = (job) => job?.idempotencyKey
  ?? `stage:${job?.projectId ?? ''}:${job?.stageId ?? ''}:${job?.inputSha256 ?? 'legacy'}`;

export const latestJobsByLogicalKey = (jobs = []) => {
  const latest = new Map();
  for (const job of jobs) {
    const key = jobLogicalKey(job);
    const previous = latest.get(key);
    const attempt = Number(job.attempt ?? 1);
    const previousAttempt = Number(previous?.attempt ?? 1);
    const createdAt = String(job.createdAt ?? '');
    const previousCreatedAt = String(previous?.createdAt ?? '');
    if (!previous || attempt > previousAttempt || (attempt === previousAttempt && createdAt > previousCreatedAt)) {
      latest.set(key, job);
    }
  }
  return [...latest.values()];
};
