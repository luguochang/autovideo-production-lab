import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';

export const CONTENT_INPUT_ROUTES = Object.freeze({
  'pasted-text': 'materials',
  'material-file': 'materials',
  'material-directory': 'materials',
  'narration-audio': 'audio',
  'url-snapshot': 'materials',
});

export const contentRouteForInput = (input) => {
  if (!input || !Object.hasOwn(CONTENT_INPUT_ROUTES, input.type)) return null;
  if (input.type === 'pasted-text' && input.textReadiness === 'approved-script') return 'script';
  return CONTENT_INPUT_ROUTES[input.type];
};

export const CONTENT_PIPELINE_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.jsonl', '.csv', '.tsv', '.html', '.htm', '.pdf', '.docx', '.pptx', '.xlsx',
  '.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.mov', '.webm',
]);

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac']);
const IGNORED_DIRECTORIES = new Set(['.git', '.codex', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build']);
const SENSITIVE_NAME = /(^|[._-])(credential|credentials|secret|secrets|token|tokens|api[-_]?key|oauth|service[-_]?account|private[-_]?key)([._-]|$)/i;
const SENSITIVE_JSON_KEY = /(password|passwd|secret|token|authorization|api.?key|access.?key|private.?key|client.?secret|refresh.?token)/i;
const DEFAULT_WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..', '..');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const sha256File = async (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const portablePath = (value) => value.replaceAll('\\', '/');
const workspacePath = (workspaceRoot, target) => portablePath(path.relative(workspaceRoot, target));

const normalizeUserPath = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Input path must be a non-empty string.');
  if (path.sep === '/' && !path.isAbsolute(value)) return value.replaceAll('\\', '/');
  return value;
};

const resolveInsideWorkspace = (workspaceRoot, value, label) => {
  const target = path.resolve(workspaceRoot, normalizeUserPath(value));
  if (!isInside(workspaceRoot, target)) throw new Error(`${label} must stay inside the allowed workspace.`);
  return target;
};

const resolveExistingInsideWorkspace = async (workspaceRoot, value, label) => {
  const target = resolveInsideWorkspace(workspaceRoot, value, label);
  const [realRoot, realTarget] = await Promise.all([fs.realpath(workspaceRoot), fs.realpath(target)]);
  if (!isInside(realRoot, realTarget)) throw new Error(`${label} resolves outside the allowed workspace.`);
  return realTarget;
};

const assertProjectId = (projectId) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId ?? '')) {
    throw new Error('Content intake projectId must use letters, numbers, dot, underscore, or hyphen.');
  }
};

const assertSafeFileName = (filePath) => {
  const name = path.basename(filePath);
  if (/^\.env(?:\.|$)/i.test(name) || SENSITIVE_NAME.test(name)) {
    throw new Error(`Sensitive source file is not allowed: ${name}`);
  }
};

const containsSensitiveJsonKeys = (value, depth = 0) => {
  if (depth > 8 || value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveJsonKeys(item, depth + 1));
  return Object.entries(value).some(([key, child]) => (
    SENSITIVE_JSON_KEY.test(key) || containsSensitiveJsonKeys(child, depth + 1)
  ));
};

const sourceFileSafety = async (filePath, stats) => {
  const name = path.basename(filePath);
  if (/^\.env(?:\.|$)/i.test(name) || SENSITIVE_NAME.test(name)) return {safe: false, reason: 'sensitive filename'};
  if (path.extname(filePath).toLowerCase() !== '.json' || stats.size > 2_000_000) return {safe: true};
  try {
    if (containsSensitiveJsonKeys(JSON.parse(await fs.readFile(filePath, 'utf8')))) {
      return {safe: false, reason: 'credential-like JSON keys'};
    }
  } catch {
    // Malformed JSON remains source material; evidence extraction owns its diagnostics.
  }
  return {safe: true};
};

const assertSupportedFile = (filePath, inputType) => {
  assertSafeFileName(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (!CONTENT_PIPELINE_EXTENSIONS.has(extension)) {
    throw new Error(`${inputType} is not supported by the existing content pipeline: ${path.basename(filePath)}`);
  }
  if (inputType === 'narration-audio' && !AUDIO_EXTENSIONS.has(extension)) {
    throw new Error(`Narration audio must use one of: ${[...AUDIO_EXTENSIONS].join(', ')}`);
  }
  return extension;
};

const collectDirectory = async (sourceRoot) => {
  const files = [];
  const skipped = [];

  const visit = async (entryPath) => {
    const stats = await fs.lstat(entryPath);
    const relativePath = portablePath(path.relative(sourceRoot, entryPath));
    if (stats.isSymbolicLink()) throw new Error(`Material directory cannot contain symbolic links or junctions: ${relativePath}`);
    if (stats.isFile()) {
      const extension = path.extname(entryPath).toLowerCase();
      const safety = await sourceFileSafety(entryPath, stats);
      if (!safety.safe) {
        skipped.push({relativePath, reason: safety.reason});
        return;
      }
      if (!CONTENT_PIPELINE_EXTENSIONS.has(extension)) {
        skipped.push({relativePath, reason: 'unsupported extension'});
        return;
      }
      files.push({
        sourcePath: entryPath,
        relativePath,
        bytes: stats.size,
        sha256: await sha256File(entryPath),
      });
      return;
    }
    if (!stats.isDirectory()) throw new Error(`Unsupported material-directory entry: ${relativePath}`);
    const entries = (await fs.readdir(entryPath, {withFileTypes: true})).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = path.join(entryPath, entry.name);
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        skipped.push({relativePath: portablePath(path.relative(sourceRoot, child)), reason: 'ignored directory'});
        continue;
      }
      await visit(child);
    }
  };

  await visit(sourceRoot);
  if (!files.length) throw new Error('Material directory contains no files supported by the existing content pipeline.');
  return {files, skipped};
};

const directoryDigest = (files) => sha256(files
  .map((file) => `${file.relativePath}\0${file.sha256}\0${file.bytes}`)
  .join('\n'));

const sourceFor = ({input, sourcePath, workspaceRoot}) => {
  if (input.type === 'pasted-text') {
    return {
      kind: 'pasted-text',
      label: String(input.label || 'workbench-paste').trim(),
      license: 'user-provided; publication rights not implied',
    };
  }
  if (input.type === 'url-snapshot') {
    return {
      kind: 'url-snapshot',
      url: input.url,
      snapshotPath: workspacePath(workspaceRoot, sourcePath),
      license: 'snapshot provenance recorded; publication rights require review',
    };
  }
  return {
    kind: input.type,
    path: workspacePath(workspaceRoot, sourcePath),
    provenance: 'user-provided',
    license: 'user-provided; publication rights not implied',
  };
};

const pipelineRegistration = ({workspaceRoot, projectId, route, submissionId, frozenSourcePath}) => {
  const materialsPath = workspacePath(workspaceRoot, frozenSourcePath);
  const pipelineIntakePath = portablePath(path.join('content', 'intakes', `${projectId}-${submissionId.slice(0, 12)}`));
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return {
    schemaVersion: 'autovideo-content-pipeline-registration/v1',
    projectId,
    route,
    workbenchInput: {route, sourcePath: materialsPath},
    pipelineIntakePath,
    commands: {
      register: {
        executable,
        args: ['run', 'content:register', '--', '--id', projectId, '--materials', materialsPath, '--out', pipelineIntakePath],
      },
      diagnose: {
        executable,
        args: ['run', 'content:diagnose', '--', '--intake', pipelineIntakePath, '--route', route],
      },
    },
  };
};

const validateExistingReceipt = async ({receipt, expected, workspaceRoot, submissionDir}) => {
  if (receipt.schemaVersion !== 'autovideo-content-intake-submission/v1'
    || receipt.id !== expected.id
    || receipt.projectId !== expected.projectId
    || receipt.inputType !== expected.inputType
    || receipt.route !== expected.route
    || receipt.payload.sha256 !== expected.payload.sha256
    || receipt.payload.bytes !== expected.payload.bytes
    || receipt.payload.fileCount !== expected.payload.fileCount
    || JSON.stringify(receipt.source) !== JSON.stringify(expected.source)) {
    throw new Error('Existing content intake receipt conflicts with the submitted content. Refusing to overwrite it.');
  }
  for (const file of receipt.payload.files) {
    const frozenPath = resolveInsideWorkspace(workspaceRoot, file.path, 'Frozen intake file');
    if (!isInside(submissionDir, frozenPath)) throw new Error('Existing content intake receipt points outside its immutable submission directory.');
    const stats = await fs.stat(frozenPath);
    if (!stats.isFile() || stats.size !== file.bytes || await sha256File(frozenPath) !== file.sha256) {
      throw new Error(`Frozen content intake file is stale: ${file.path}`);
    }
  }
  return receipt;
};

const loadExisting = async ({submissionDir, expected, workspaceRoot}) => {
  const receiptPath = path.join(submissionDir, 'submission.json');
  let receipt;
  try {
    receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('Content-addressed intake directory exists without a receipt. Refusing to overwrite it.');
    throw error;
  }
  await validateExistingReceipt({receipt, expected, workspaceRoot, submissionDir});
  return {receipt, idempotent: true};
};

export const freezeContentIntake = async ({
  workspaceRoot = DEFAULT_WORKSPACE_ROOT,
  projectRoot,
  projectId,
  input,
}) => {
  assertProjectId(projectId);
  if (!input || !Object.hasOwn(CONTENT_INPUT_ROUTES, input.type)) throw new Error('Unsupported content intake type.');

  const resolvedWorkspaceRoot = await fs.realpath(path.resolve(workspaceRoot));
  const resolvedProjectRoot = resolveInsideWorkspace(resolvedWorkspaceRoot, projectRoot, 'Project root');
  const route = contentRouteForInput(input);
  const intakeRoot = path.join(resolvedProjectRoot, 'input', 'content-intake');
  let sourcePath = null;
  let source = null;
  let extension = '';
  let sourceFiles = [];
  let skipped = [];
  let textBytes = null;
  let payloadSha256;
  let payloadBytes;
  let payloadHashAlgorithm = 'sha256-bytes';

  if (input.type === 'pasted-text') {
    if (typeof input.text !== 'string' || !input.text.trim()) throw new Error('Pasted text must contain non-whitespace content.');
    textBytes = Buffer.from(input.text, 'utf8');
    payloadSha256 = sha256(textBytes);
    payloadBytes = textBytes.length;
    source = sourceFor({input, sourcePath, workspaceRoot: resolvedWorkspaceRoot});
  } else {
    if (input.type === 'url-snapshot') {
      let parsed;
      try {
        parsed = new URL(input.url);
      } catch {
        throw new Error('URL snapshot requires a valid HTTP or HTTPS URL.');
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL snapshot requires a valid HTTP or HTTPS URL.');
      input = {...input, url: parsed.toString()};
    }
    const pathValue = input.type === 'url-snapshot' ? input.snapshotPath : input.path;
    sourcePath = await resolveExistingInsideWorkspace(resolvedWorkspaceRoot, pathValue, 'Content source');
    if (isInside(intakeRoot, sourcePath)) throw new Error('Content intake cannot use its own frozen output as a new source.');
    const stats = await fs.lstat(sourcePath);
    if (stats.isSymbolicLink()) throw new Error('Content source cannot be a symbolic link or junction.');

    if (input.type === 'material-directory') {
      if (!stats.isDirectory()) throw new Error('material-directory requires a directory source.');
      if (isInside(sourcePath, resolvedProjectRoot)) throw new Error('Material directory cannot contain the destination project root.');
      const collected = await collectDirectory(sourcePath);
      sourceFiles = collected.files;
      skipped = collected.skipped;
      payloadSha256 = directoryDigest(sourceFiles);
      payloadBytes = sourceFiles.reduce((total, file) => total + file.bytes, 0);
      payloadHashAlgorithm = 'sha256-manifest-v1';
    } else {
      if (!stats.isFile()) throw new Error(`${input.type} requires a file source.`);
      extension = assertSupportedFile(sourcePath, input.type);
      const safety = await sourceFileSafety(sourcePath, stats);
      if (!safety.safe) throw new Error(`Sensitive source file is not allowed: ${path.basename(sourcePath)} (${safety.reason})`);
      payloadSha256 = await sha256File(sourcePath);
      payloadBytes = stats.size;
      sourceFiles = [{sourcePath, relativePath: path.basename(sourcePath), bytes: stats.size, sha256: payloadSha256}];
    }
    source = sourceFor({input, sourcePath, workspaceRoot: resolvedWorkspaceRoot});
  }

  const identity = JSON.stringify({type: input.type, route, source, extension, payloadSha256});
  const submissionId = sha256(identity);
  const submissionDir = path.join(intakeRoot, 'submissions', submissionId);
  const payloadRelativeRoot = input.type === 'material-directory'
    ? path.join('payload', 'materials')
    : 'payload';
  const frozenRelativePath = input.type === 'pasted-text'
    ? path.join(payloadRelativeRoot, 'pasted.txt')
    : input.type === 'material-file'
      ? path.join(payloadRelativeRoot, `material${extension}`)
      : input.type === 'narration-audio'
        ? path.join(payloadRelativeRoot, `narration${extension}`)
        : input.type === 'url-snapshot'
          ? path.join(payloadRelativeRoot, `snapshot${extension}`)
          : payloadRelativeRoot;
  const frozenSourcePath = path.join(submissionDir, frozenRelativePath);
  const frozenFiles = input.type === 'material-directory'
    ? sourceFiles.map((file) => ({
      relativePath: file.relativePath,
      path: workspacePath(resolvedWorkspaceRoot, path.join(submissionDir, payloadRelativeRoot, file.relativePath)),
      sha256: file.sha256,
      bytes: file.bytes,
    }))
    : [{
      relativePath: path.basename(frozenRelativePath),
      path: workspacePath(resolvedWorkspaceRoot, frozenSourcePath),
      sha256: payloadSha256,
      bytes: payloadBytes,
    }];
  const registration = pipelineRegistration({
    workspaceRoot: resolvedWorkspaceRoot,
    projectId,
    route,
    submissionId,
    frozenSourcePath,
  });
  const expected = {
    schemaVersion: 'autovideo-content-intake-submission/v1',
    id: submissionId,
    projectId,
    inputType: input.type,
    route,
    createdAt: new Date().toISOString(),
    source,
    payload: {
      path: workspacePath(resolvedWorkspaceRoot, frozenSourcePath),
      sha256: payloadSha256,
      bytes: payloadBytes,
      fileCount: frozenFiles.length,
      hashAlgorithm: payloadHashAlgorithm,
      files: frozenFiles,
      skipped,
    },
    registration,
  };

  try {
    await fs.access(submissionDir);
    return loadExisting({submissionDir, expected, workspaceRoot: resolvedWorkspaceRoot});
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const submissionsRoot = path.dirname(submissionDir);
  await fs.mkdir(submissionsRoot, {recursive: true});
  const stagingDir = path.join(submissionsRoot, `.${submissionId}.${crypto.randomUUID()}.tmp`);
  try {
    if (input.type === 'pasted-text') {
      const target = path.join(stagingDir, frozenRelativePath);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.writeFile(target, textBytes);
    } else if (input.type === 'material-directory') {
      for (const file of sourceFiles) {
        const target = path.join(stagingDir, payloadRelativeRoot, file.relativePath);
        await fs.mkdir(path.dirname(target), {recursive: true});
        await fs.copyFile(file.sourcePath, target);
        if (await sha256File(target) !== file.sha256) throw new Error(`Source changed while freezing material directory: ${file.relativePath}`);
      }
    } else {
      const target = path.join(stagingDir, frozenRelativePath);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.copyFile(sourcePath, target);
      if (await sha256File(target) !== payloadSha256) throw new Error('Source changed while freezing content intake.');
    }
    await fs.writeFile(path.join(stagingDir, 'submission.json'), `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    try {
      await fs.rename(stagingDir, submissionDir);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
      await fs.rm(stagingDir, {recursive: true, force: true});
      return loadExisting({submissionDir, expected, workspaceRoot: resolvedWorkspaceRoot});
    }
  } catch (error) {
    await fs.rm(stagingDir, {recursive: true, force: true});
    throw error;
  }
  return {receipt: expected, idempotent: false};
};
