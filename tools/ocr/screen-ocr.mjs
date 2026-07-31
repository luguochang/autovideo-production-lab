import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const isSha256 = (value) => /^[a-f0-9]{64}$/iu.test(String(value ?? ''));
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const sha256File = async (filePath) => sha256(await fs.readFile(filePath));

const compositionExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.woff', '.woff2', '.ttf', '.otf', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.webm',
]);
const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'renders', 'qa', '.thumbnails', '.waveform-cache']);
const ignoredFiles = new Set(['meta.json', 'data/composition-build.json']);

export const hashComposition = async (root) => {
  const files = [];
  const walk = async (directory) => {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(target);
      } else if (entry.isFile() && compositionExtensions.has(path.extname(entry.name).toLowerCase())) {
        const relative = path.relative(root, target).replaceAll('\\', '/');
        if (ignoredFiles.has(relative)) continue;
        const stats = await fs.stat(target);
        files.push({path: relative, bytes: stats.size, sha256: await sha256File(target)});
      }
    }
  };
  await walk(root);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {digest: sha256(JSON.stringify(files)), files};
};

export const frameSetDigestFor = (frameSet) => sha256(JSON.stringify({
  projectId: frameSet.projectId,
  composition: frameSet.composition,
  hyperframesCheck: frameSet.hyperframesCheck,
  samplingPolicyVersion: frameSet.samplingPolicyVersion,
  frames: frameSet.frames,
}));

const resolveBoundPath = (formalRoot, relativeTarget) => {
  if (!relativeTarget || path.isAbsolute(relativeTarget)) throw new Error('OCR evidence paths must be project-relative.');
  const resolvedRoot = path.resolve(formalRoot);
  const resolvedTarget = path.resolve(formalRoot, relativeTarget);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('OCR evidence path leaves the formal project root.');
  }
  return resolvedTarget;
};

const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);
const pathExists = (target) => fs.access(target).then(() => true, () => false);

const archiveCurrent = async (target) => {
  if (!await pathExists(target)) return null;
  const history = path.join(path.dirname(target), 'history');
  await fs.mkdir(history, {recursive: true});
  const timestamp = new Date().toISOString().replace(/[.:]/gu, '-');
  const archived = path.join(history, `${timestamp}-${process.pid}-${path.basename(target)}`);
  await fs.copyFile(target, archived);
  return archived;
};

const atomicWriteJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const archived = await archiveCurrent(target);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, serialize(value), 'utf8');
    await fs.rm(target, {force: true});
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, {force: true});
    if (archived && !await pathExists(target)) await fs.copyFile(archived, target);
    throw error;
  }
};

const validateInputs = async ({formalRoot, projectId}) => {
  const frameSetPath = path.join(formalRoot, 'qa', 'screen-text-frame-set.json');
  const frameSet = await readJson(frameSetPath);
  if (frameSet.schemaVersion !== 'autovideo-screen-text-frame-set/v1'
      || frameSet.projectId !== projectId
      || frameSet.frameSetDigest !== frameSetDigestFor(frameSet)
      || !Array.isArray(frameSet.frames)
      || !frameSet.frames.length) {
    throw new Error('Screen-text frame-set is missing, stale, or malformed.');
  }
  if (new Set(frameSet.frames.map((frame) => frame.id)).size !== frameSet.frames.length) {
    throw new Error('Screen-text frame-set contains duplicate frame IDs.');
  }
  if (!frameSet.composition?.path || !isSha256(frameSet.composition.digest)
      || !Number.isInteger(frameSet.composition.fileCount)) {
    throw new Error('Screen-text frame-set has no valid composition binding.');
  }
  if (!frameSet.hyperframesCheck?.path || !isSha256(frameSet.hyperframesCheck.sha256)) {
    throw new Error('Screen-text frame-set has no valid HyperFrames check binding.');
  }

  const checkPath = resolveBoundPath(formalRoot, frameSet.hyperframesCheck.path);
  if (await sha256File(checkPath) !== frameSet.hyperframesCheck.sha256) {
    throw new Error('HyperFrames check changed after screen-text sampling.');
  }
  const compositionRoot = resolveBoundPath(formalRoot, frameSet.composition.path);
  const composition = await hashComposition(compositionRoot);
  if (composition.digest !== frameSet.composition.digest || composition.files.length !== frameSet.composition.fileCount) {
    throw new Error('HyperFrames composition changed after screen-text sampling.');
  }

  const frames = [];
  for (const frame of frameSet.frames) {
    if (!frame.id || !frame.path || !isSha256(frame.sha256)) throw new Error('Frame-set contains an invalid frame binding.');
    const inputPath = resolveBoundPath(formalRoot, frame.path);
    if (await sha256File(inputPath) !== frame.sha256) {
      throw new Error(`Screen-text frame changed after sampling: ${frame.id}`);
    }
    frames.push({...frame, inputPath});
  }
  return {
    frameSet,
    frameSetPath,
    frameSetSha256: await sha256File(frameSetPath),
    checkPath,
    frames,
  };
};

const defaultPython = async () => {
  const override = process.env.AUTOVIDEO_OCR_PYTHON;
  if (override) return override;
  const local = process.platform === 'win32'
    ? path.join(import.meta.dirname, '.venv', 'Scripts', 'python.exe')
    : path.join(import.meta.dirname, '.venv', 'bin', 'python');
  return await pathExists(local) ? local : (process.platform === 'win32' ? 'python.exe' : 'python3');
};

const adapterFor = async (adapterCommand) => {
  if (adapterCommand?.command) return {command: adapterCommand.command, args: adapterCommand.args ?? []};
  if (process.env.AUTOVIDEO_OCR_ADAPTER) {
    const adapter = path.resolve(process.env.AUTOVIDEO_OCR_ADAPTER);
    return path.extname(adapter).toLowerCase() === '.mjs'
      ? {command: process.execPath, args: [adapter]}
      : {command: await defaultPython(), args: [adapter]};
  }
  return {command: await defaultPython(), args: [path.join(import.meta.dirname, 'rapidocr_adapter.py')]};
};

const readAdapterPayload = (stdout) => {
  const source = String(stdout ?? '').trim();
  if (!source) throw new Error('OCR adapter returned no JSON payload.');
  try {
    return JSON.parse(source);
  } catch {
    const lastLine = source.split(/\r?\n/u).filter(Boolean).at(-1);
    try {
      return JSON.parse(lastLine);
    } catch {
      throw new Error('OCR adapter returned an unreadable JSON payload.');
    }
  }
};

const normalizePolygon = (polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 4) throw new Error('OCR detection polygon must contain at least four points.');
  return polygon.map((point) => {
    if (!Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite)) {
      throw new Error('OCR detection polygon contains an invalid point.');
    }
    return [Number(point[0]), Number(point[1])];
  });
};

const normalizeDetections = (detections) => (Array.isArray(detections) ? detections : []).map((detection) => {
  const confidence = Number(detection.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('OCR detection confidence must be between 0 and 1.');
  }
  return {
    text: String(detection.text ?? ''),
    confidence,
    polygon: normalizePolygon(detection.polygon),
  };
});

const unavailableReport = ({projectId, input, engine, issue, minConfidence}) => ({
  schemaVersion: 'autovideo-ocr-report/v1',
  projectId,
  status: 'unavailable',
  generatedAt: new Date().toISOString(),
  engine: engine ?? {name: 'RapidOCR ONNXRuntime', version: null, runtime: 'onnxruntime-cpu', license: 'Apache-2.0'},
  compositionDigest: input.frameSet.composition.digest,
  frameSetDigest: input.frameSet.frameSetDigest,
  hyperframesCheckSha256: input.frameSet.hyperframesCheck.sha256,
  bindings: {
    composition: input.frameSet.composition,
    frameSet: {path: 'qa/screen-text-frame-set.json', sha256: input.frameSetSha256, digest: input.frameSet.frameSetDigest},
    hyperframesCheck: input.frameSet.hyperframesCheck,
  },
  confidencePolicy: {minimum: minConfidence, lowConfidenceDisposition: 'unresolved'},
  unresolvedCount: input.frames.length,
  issues: [issue],
  frames: input.frames.map((frame) => ({
    id: frame.id,
    path: frame.path,
    sha256: frame.sha256,
    status: 'unavailable',
    recognizedText: '',
    detectionCount: 0,
    detections: [],
    issues: [issue],
  })),
});

export const runScreenOcr = async ({
  formalRoot,
  projectId,
  adapterCommand = null,
  minConfidence = 0.55,
  timeoutMs = 10 * 60 * 1000,
} = {}) => {
  if (!formalRoot || !projectId) throw new Error('formalRoot and projectId are required.');
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error('minConfidence must be between 0 and 1.');
  }
  const input = await validateInputs({formalRoot, projectId});
  const reportPath = path.join(formalRoot, 'qa', 'ocr-report.json');
  const requestRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-ocr-'));
  const requestPath = path.join(requestRoot, 'request.json');
  await fs.writeFile(requestPath, serialize({
    schemaVersion: 'autovideo-ocr-adapter-request/v1',
    projectId,
    frames: input.frames.map((frame) => ({id: frame.id, inputPath: frame.inputPath})),
  }), 'utf8');

  let payload;
  let executionIssue = null;
  try {
    const adapter = await adapterFor(adapterCommand);
    const {stdout} = await run(adapter.command, [...adapter.args, '--request', requestPath], {
      cwd: workspaceRoot,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        RAPIDOCR_HOME: path.join(import.meta.dirname, '.cache'),
        PADDLEOCR_HOME: path.join(import.meta.dirname, '.cache'),
      },
    });
    payload = readAdapterPayload(stdout);
  } catch (error) {
    executionIssue = {code: error?.code === 'ENOENT' ? 'engine-unavailable' : 'adapter-execution-failed', message: error.message};
  } finally {
    await fs.rm(requestRoot, {recursive: true, force: true});
  }

  if (executionIssue || payload?.unavailable === true) {
    const issue = executionIssue ?? payload.error ?? {code: 'engine-unavailable', message: 'OCR engine is unavailable.'};
    const report = unavailableReport({projectId, input, engine: payload?.engine, issue, minConfidence});
    await atomicWriteJson(reportPath, report);
    return {report, reportPath, sha256: await sha256File(reportPath)};
  }
  if (!payload?.engine?.name || !payload.engine.version) {
    throw new Error('OCR adapter did not identify a versioned engine.');
  }
  const adapterFrameList = Array.isArray(payload.frames) ? payload.frames : [];
  const adapterFrames = new Map(adapterFrameList.map((frame) => [frame.id, frame]));
  if (adapterFrameList.length !== input.frames.length
      || adapterFrames.size !== input.frames.length
      || input.frames.some((frame) => !adapterFrames.has(frame.id))) {
    throw new Error('OCR adapter did not return every current frame exactly once.');
  }

  const frames = input.frames.map((frame) => {
    const adapterFrame = adapterFrames.get(frame.id);
    const detections = normalizeDetections(adapterFrame.detections);
    const issues = [];
    if (adapterFrame.ok !== true) issues.push(adapterFrame.error ?? {code: 'recognition-failed', message: 'OCR adapter failed this frame.'});
    const lowConfidence = detections.filter((item) => item.confidence < minConfidence);
    if (lowConfidence.length) {
      issues.push({
        code: 'low-confidence-text',
        message: `${lowConfidence.length} detection(s) are below the ${minConfidence} confidence threshold.`,
      });
    }
    return {
      id: frame.id,
      path: frame.path,
      sha256: frame.sha256,
      status: issues.length ? 'unresolved' : 'passed',
      recognizedText: detections.map((item) => item.text).filter(Boolean).join('\n'),
      detectionCount: detections.length,
      minimumConfidence: detections.length ? Math.min(...detections.map((item) => item.confidence)) : null,
      elapsedMs: Number.isFinite(adapterFrame.elapsedMs) ? Number(adapterFrame.elapsedMs) : null,
      detections,
      issues,
    };
  });
  const unresolvedCount = frames.filter((frame) => frame.status !== 'passed').length;
  const report = {
    schemaVersion: 'autovideo-ocr-report/v1',
    projectId,
    status: unresolvedCount === 0 ? 'passed' : 'unresolved',
    generatedAt: new Date().toISOString(),
    engine: payload.engine,
    compositionDigest: input.frameSet.composition.digest,
    frameSetDigest: input.frameSet.frameSetDigest,
    hyperframesCheckSha256: input.frameSet.hyperframesCheck.sha256,
    bindings: {
      composition: input.frameSet.composition,
      frameSet: {path: 'qa/screen-text-frame-set.json', sha256: input.frameSetSha256, digest: input.frameSet.frameSetDigest},
      hyperframesCheck: input.frameSet.hyperframesCheck,
    },
    confidencePolicy: {minimum: minConfidence, lowConfidenceDisposition: 'unresolved'},
    unresolvedCount,
    issues: frames.flatMap((frame) => frame.issues.map((issue) => ({frameId: frame.id, ...issue}))),
    frames,
  };
  await atomicWriteJson(reportPath, report);
  return {report, reportPath, sha256: await sha256File(reportPath)};
};
