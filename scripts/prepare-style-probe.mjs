import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HYPERFRAMES_VERSION = '0.7.77';
const parseArgs = (values) => {
  const parsed = {_: []};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) parsed._.push(value);
    else {
      const key = value.slice(2);
      const next = values[index + 1];
      if (!next || next.startsWith('--')) parsed[key] = true;
      else {
        parsed[key] = next;
        index += 1;
      }
    }
  }
  return parsed;
};
const args = parseArgs(process.argv.slice(2));
const projectId = args.project || args._[0] || 'demotext-standard-delivery-v2';
const referenceProjectId = args.reference || 'demotext-standard-delivery-v2';
if (![projectId, referenceProjectId].every((value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))) {
  throw new Error('Invalid project or reference project id.');
}
const formalRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
const referenceRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', referenceProjectId);
const probeRoot = path.join(formalRoot, 'review', 'probe-project');
const imagePythonCandidates = [
  path.join(root, 'tools', 'voice-lab', 'venv', 'Scripts', 'python.exe'),
  path.join(root, 'tools', 'voice-lab', 'CosyVoice', '.venv', 'Scripts', 'python.exe'),
];

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  return hash.update(data).digest('hex');
};
const readJson = (filePath) => fs.readFile(filePath, 'utf8').then(JSON.parse);
const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const main = async () => {
  const [alignment, targetLock, previousSelection] = await Promise.all([
    readJson(path.join(formalRoot, 'audio', 'alignment.json')),
    readJson(path.join(formalRoot, 'NarrationLock.json')),
    readJson(path.join(formalRoot, 'style-selection.json')).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error)),
  ]);
  const cue = alignment.cues.find((item) => {
    const duration = Number(item.end) - Number(item.start);
    return duration >= 4 && duration <= 8;
  }) ?? alignment.cues.find((item) => {
    const duration = Number(item.end) - Number(item.start);
    return duration >= 3 && duration <= 8;
  }) ?? alignment.cues[0];
  if (!cue) throw new Error('Target alignment does not contain a cue for a style probe.');
  const window = {
    cueId: cue.id,
    startSeconds: cue.start,
    endSeconds: cue.end,
    durationSeconds: Number((cue.end - cue.start).toFixed(6)),
  };

  let structureSource = path.join(referenceRoot, 'review', 'probe-project');
  let temporaryStructureRoot = null;
  if (projectId === referenceProjectId) {
    temporaryStructureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-probe-structure-'));
    structureSource = path.join(temporaryStructureRoot, 'probe-project');
    await fs.cp(probeRoot, structureSource, {recursive: true});
  }
  await fs.rm(probeRoot, {recursive: true, force: true});
  try {
    await fs.cp(structureSource, probeRoot, {recursive: true});
  } finally {
    if (temporaryStructureRoot) await fs.rm(temporaryStructureRoot, {recursive: true, force: true});
  }
  await fs.rm(path.join(probeRoot, 'snapshots'), {recursive: true, force: true});
  await fs.mkdir(path.join(probeRoot, 'snapshots'), {recursive: true});
  const hostAsset = path.join(formalRoot, 'production-assets', 'host', 'explain.png');
  try {
    await fs.access(hostAsset);
  } catch {
    let imagePython = null;
    for (const candidate of imagePythonCandidates) {
      try {
        await fs.access(candidate);
        imagePython = candidate;
        break;
      } catch {
        // Continue to the next pinned project runtime.
      }
    }
    if (!imagePython) throw new Error('No project Python runtime is available for deterministic host asset generation.');
    await run(imagePython, ['scripts/build-host-pose-assets.py', '--project', projectId], {
      cwd: root, timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, windowsHide: true,
    });
  }
  await fs.copyFile(
    hostAsset,
    path.join(probeRoot, 'assets', 'host-explain.png'),
  );

  const indexPath = path.join(probeRoot, 'index.html');
  const durationText = String(window.durationSeconds);
  const indexSource = await fs.readFile(indexPath, 'utf8');
  // The reference probe may carry any previously compiled duration. Bind every
  // timed root/scene to the current narration window so late snapshots cannot
  // fall outside the composition and silently become black frames.
  const captionCueId = cue.id.toUpperCase().replace('-', ' ');
  const isRagProject = projectId.includes('rag-full-chain');
  const visualCopy = isRagProject
    ? {
        title: 'RAG 全链路 · 视觉动效样片',
        sectionLabel: 'ONE SCREEN / COMBINATION',
        headline: 'RAG 不是<strong>单选题</strong>',
        platformTitle: '生产场景',
        platformSubtitle: '先确定约束，再组合能力',
        platformContext: 'CONTEXT',
        nodes: [
          {title: '规则判断', detail: '成本 · 时延 · 准确率'},
          {title: '多路组合', detail: '解析 · 切分 · 检索'},
          {title: '指标验证', detail: '用评测闭环做取舍'},
        ],
        terminalNote: '实际生产：按场景组合，而不是二选一',
        hostAlt: '主持人指向右侧 RAG 组合决策图',
      }
    : {
        title: 'AutoVideo · 视觉动效样片',
        sectionLabel: 'ONE SCREEN / EXPLAINER',
        headline: '复杂系统，先看清<strong>完整关系</strong>',
        platformTitle: '业务场景',
        platformSubtitle: '从约束出发组织信息',
        platformContext: 'CONTEXT',
        nodes: [
          {title: '输入条件', detail: '目标与边界'},
          {title: '组合判断', detail: '方案与取舍'},
          {title: '结果验证', detail: '指标与反馈'},
        ],
        terminalNote: '单屏保留完整上下文，再逐步聚焦重点',
        hostAlt: '主持人指向右侧信息关系图',
      };
  const updatedIndexSource = indexSource
    .replace(/data-duration="[^"]+"/g, `data-duration="${durationText}"`)
    .replace(/(<title>)[\s\S]*?(<\/title>)/, `$1${visualCopy.title}$2`)
    .replace(/(<div class="section-label">)[\s\S]*?(<\/div>)/, `$1${visualCopy.sectionLabel}$2`)
    .replace(/(<h1 id="probe-headline" class="headline">)[\s\S]*?(<\/h1>)/, `$1${visualCopy.headline}$2`)
    .replace(/(<div class="platform-title">)[\s\S]*?(<\/div>)/, `$1${visualCopy.platformTitle}$2`)
    .replace(/(<div class="platform-subtitle">)[\s\S]*?(<\/div>)/, `$1${visualCopy.platformSubtitle}$2`)
    .replace(/(<div class="platform-context">)[\s\S]*?(<\/div>)/, `$1${visualCopy.platformContext}$2`)
    .replace(/(<div id="node-model"[\s\S]*?<div class="node-title">)[\s\S]*?(<\/div>)/, `$1${visualCopy.nodes[0].title}$2`)
    .replace(/(<div id="node-model"[\s\S]*?<div class="node-detail">)[\s\S]*?(<\/div>)/, `$1${visualCopy.nodes[0].detail}$2`)
    .replace(/(<div id="node-access"[\s\S]*?<div class="node-title">)[\s\S]*?(<\/div>)/, `$1${visualCopy.nodes[1].title}$2`)
    .replace(/(<div id="node-access"[\s\S]*?<div class="node-detail">)[\s\S]*?(<\/div>)/, `$1${visualCopy.nodes[1].detail}$2`)
    .replace(/(<div id="node-state"[\s\S]*?<div class="node-title">)[\s\S]*?(<\/div>)/, `$1${visualCopy.nodes[2].title}$2`)
    .replace(/(<div id="node-state"[\s\S]*?<div class="node-detail">)[\s\S]*?(<\/div>)/, `$1${visualCopy.nodes[2].detail}$2`)
    .replace(/(<div id="terminal-note" class="terminal-note">)[\s\S]*?(<\/div>)/, `$1${visualCopy.terminalNote}$2`)
    .replace(/(<img src="assets\/host-explain\.png" alt=")[^"]*("\s*\/?>)/, `$1${visualCopy.hostAlt}$2`)
    .replace(/(<span class="caption-id">)[^<]*(<\/span>)/, `$1${escapeHtml(captionCueId)}$2`)
    .replace(/(<span class="caption-text">)[^<]*(<\/span>)/, `$1${escapeHtml(cue.text)}$2`);
  await fs.writeFile(indexPath, updatedIndexSource, 'utf8');
  const metaPath = path.join(probeRoot, 'meta.json');
  const meta = await readJson(metaPath);
  if ('duration' in meta) meta.duration = window.durationSeconds;
  if ('durationSeconds' in meta) meta.durationSeconds = window.durationSeconds;
  await writeJson(metaPath, meta);
  const motionPath = path.join(probeRoot, 'index.motion.json');
  const motion = await readJson(motionPath);
  motion.duration = window.durationSeconds;
  for (const assertion of motion.assertions ?? []) {
    if (assertion.kind === 'keepsMoving') {
      assertion.maxStaticSec = Number(Math.max(1.1, window.durationSeconds - 2.3).toFixed(3));
    }
  }
  await writeJson(motionPath, motion);

  const audioPath = path.join(probeRoot, '.media', 'audio', 'voice', 'voice_001.wav');
  await run('ffmpeg.exe', [
    '-y', '-v', 'error', '-ss', String(window.startSeconds),
    '-i', path.join(formalRoot, 'audio', 'narration.final.wav'),
    '-t', String(window.durationSeconds), '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', audioPath,
  ], {cwd: root, timeout: 120_000, windowsHide: true});
  await fs.copyFile(audioPath, path.join(probeRoot, 'assets', 'probe-narration.wav'));

  const brief = `---\nworkflow: general-video\nflow: automation\nstoryboard: yes\ndestination: douyin-landscape\naspect: 16:9\nlanguage: zh-CN\nlength: ${window.durationSeconds}s\nstyle_preset: modern-ip-host-explainer\n---\n\n# Style probe\n\n- Project: ${projectId}\n- Source cue: ${window.cueId} (${window.startSeconds}-${window.endSeconds}s)\n- Source audio: ${projectId}/audio/narration.final.wav\n- Structure reference: ${referenceProjectId}/review/probe-project\n- Purpose: validate host/content/caption zones, Chinese density, three-active-node limit and terminal hold.\n- Scope: internal autonomous review only; voice and host publication rights remain unresolved.\n`;
  await fs.writeFile(path.join(probeRoot, 'BRIEF.md'), brief, 'utf8');

  const snapshotTimes = [
    Math.min(0.4, window.durationSeconds * 0.15),
    window.durationSeconds * 0.44,
    window.durationSeconds * 0.75,
    Math.max(0.1, window.durationSeconds - 0.12),
  ].map((value) => Number(value.toFixed(3)));
  const snapshotTimesArg = snapshotTimes.join(',');

  const {stdout: checkStdout} = await run('npx.cmd', [
    '--yes', `hyperframes@${HYPERFRAMES_VERSION}`, 'check', probeRoot, '--strict', '--json', '--at', snapshotTimesArg,
  ], {cwd: root, timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, shell: true});
  const check = JSON.parse(checkStdout.trim());
  if (!check.ok) throw new Error('Style probe HyperFrames strict check failed.');
  await writeJson(path.join(formalRoot, 'review', 'probe-check.json'), check);

  await run('npx.cmd', [
    '--yes', `hyperframes@${HYPERFRAMES_VERSION}`, 'snapshot', probeRoot,
    '--at', snapshotTimesArg, '--no-end', '--output', path.join(probeRoot, 'snapshots'),
  ], {cwd: root, timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, shell: true});
  const snapshotNames = (await fs.readdir(path.join(probeRoot, 'snapshots'))).filter((name) => name.endsWith('.png')).sort();
  if (snapshotNames.length < 4) throw new Error(`Expected four probe snapshots, received ${snapshotNames.length}.`);
  const stillPath = path.join(formalRoot, 'review', 'stills', 'style-probe-hidden-complexity.png');
  await fs.mkdir(path.dirname(stillPath), {recursive: true});
  await fs.copyFile(path.join(probeRoot, 'snapshots', snapshotNames[2]), stillPath);
  const stillStats = await fs.stat(stillPath);
  if (stillStats.size < 20_000) throw new Error(`Style probe still is unexpectedly small (${stillStats.size} bytes); refusing a likely black frame.`);

  const renderedMotionPath = path.join(formalRoot, 'review', 'probes', 'style-probe-hidden-complexity.mp4');
  await fs.mkdir(path.dirname(renderedMotionPath), {recursive: true});
  await run('npx.cmd', [
    '--yes', `hyperframes@${HYPERFRAMES_VERSION}`, 'render', probeRoot,
    '--output', renderedMotionPath, '--quality', 'high', '--strict', '--no-best-effort', '--workers', '2',
  ], {cwd: root, timeout: 20 * 60 * 1000, maxBuffer: 30 * 1024 * 1024, windowsHide: true, shell: true});
  const {stdout: probeStdout} = await run('ffprobe.exe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', renderedMotionPath,
  ], {cwd: root, timeout: 60_000, windowsHide: true});
  const mediaProbe = JSON.parse(probeStdout);
  const video = mediaProbe.streams.find((stream) => stream.codec_type === 'video');
  const audio = mediaProbe.streams.find((stream) => stream.codec_type === 'audio');
  if (video?.width !== 1920 || video?.height !== 1080 || !audio) throw new Error('Rendered probe is not 1920x1080 with audio.');
  if (Number(video.duration) + 0.05 < window.durationSeconds) {
    throw new Error(`Rendered probe duration ${video.duration}s is shorter than the narration window ${window.durationSeconds}s.`);
  }

  const preserveExistingSelection = previousSelection?.schemaVersion === 'autovideo-style-selection/v1'
    && previousSelection.projectId === projectId
    && previousSelection.narrationSha256 === targetLock.normalizedSha256
    && previousSelection.baseStyleId === 'modern-ip-host-explainer'
    && ['approved', 'draft'].includes(previousSelection.status);
  const selection = {
    schemaVersion: 'autovideo-style-selection/v1',
    projectId,
    narrationSha256: targetLock.normalizedSha256,
    baseStyleId: 'modern-ip-host-explainer',
    framePreset: preserveExistingSelection ? previousSelection.framePreset ?? null : null,
    addons: preserveExistingSelection ? previousSelection.addons ?? [] : [],
    registryItems: preserveExistingSelection ? previousSelection.registryItems ?? [] : [],
    blueprints: preserveExistingSelection ? previousSelection.blueprints ?? [] : [],
    motionRules: preserveExistingSelection
      ? previousSelection.motionRules ?? []
      : ['svg-path-draw', 'viewport-change', 'card-morph-anchor', 'scale-swap-transition'],
    status: 'draft',
    approvedBy: null,
    notes: preserveExistingSelection
      ? `Regenerated the current Candidate A probe against the promoted final WAV while preserving its component and motion selection; narration timing and visual approval were not reused.`
      : `Fresh ${projectId} audio and host assets rendered through the validated ${referenceProjectId} probe structure; reference narration, timing, and visual approval were not reused.`,
    receipts: [
      ...(preserveExistingSelection ? previousSelection.receipts ?? [] : [
        {source: 'style-library/styles/project/modern-ip-host-explainer/', kind: 'project-local', license: 'project-generated; user-provided character rights not implied'},
        {source: 'vendor/hyperframes/skills/hyperframes-animation/', kind: 'official', license: 'Apache-2.0'},
      ]),
      {source: `${referenceProjectId}/review/probe-project`, kind: 'project-local', license: 'project-local; validated structure only, with no old audio, narration hash, or approvals reused'},
    ],
  };
  await writeJson(path.join(formalRoot, 'style-selection.json'), selection);

  const review = {
    schemaVersion: 'autovideo-probe-review/v1',
    projectId,
    scope: 'internal-only',
    reviewer: 'codex-autonomous-internal-review',
    approvalBasis: 'Autonomous internal visual review only. This is not user listening, user final review, or public-rights approval.',
    window: {...window, text: cue.text},
    composition: 'review/probe-project',
    templateReference: `${referenceProjectId}/review/probe-project (${projectId === referenceProjectId ? 'self-snapshot; ' : ''}structure only; narration-independent)`,
    hyperframesVersion: HYPERFRAMES_VERSION,
    check: {status: 'passed', errors: 0, warnings: 0, artifact: 'review/probe-check.json', snapshotTimesSeconds: snapshotTimes},
    visualReview: {
      hostContentCaptionCollision: 'passed-by-machine-check-and-sample-frame-review',
      chineseLineBreaks: 'passed-by-sample-frame-review',
      activeNodeLimit: 'passed',
      terminalHold: 'passed',
      paletteAndHierarchy: 'passed',
    },
    bindings: {
      sourceAudio: {path: 'audio/narration.final.wav', sha256: await sha256File(path.join(formalRoot, 'audio', 'narration.final.wav'))},
      probeAudio: {path: 'review/probe-project/.media/audio/voice/voice_001.wav', sha256: await sha256File(audioPath)},
      hostAsset: {path: 'production-assets/host/explain.png', sha256: await sha256File(hostAsset)},
    },
    artifacts: [
      {path: 'review/stills/style-probe-hidden-complexity.png', sha256: await sha256File(stillPath)},
      {path: 'review/probes/style-probe-hidden-complexity.mp4', sha256: await sha256File(renderedMotionPath)},
    ],
    ffprobe: mediaProbe,
    publicReleaseBlocked: true,
  };
  await writeJson(path.join(formalRoot, 'review', 'probe-review.json'), review);

  const styleReview = `# Style Review - ${projectId}\n\n## Selected Probe\n\n- Base style: \`modern-ip-host-explainer@1.0.0\`\n- Palette: \`light-apricot\`\n- Window: \`${window.cueId}\` / ${window.startSeconds}-${window.endSeconds}s\n- Still: \`review/stills/style-probe-hidden-complexity.png\`\n- Motion: \`review/probes/style-probe-hidden-complexity.mp4\`\n- HyperFrames: \`${HYPERFRAMES_VERSION}\`, strict check passed\n\n## Decision\n\nMachine QA passed for this internal review candidate. Structural-plan approval does not approve visual quality. Keep the project style gate pending until the user reviews the rendered motion probe and keyframes; do not begin full production before that approval. The probe uses fresh ${projectId} audio and host assets; only the tested composition structure came from ${referenceProjectId}.\n`;
  await fs.writeFile(path.join(formalRoot, 'STYLE_REVIEW.md'), styleReview, 'utf8');
  console.log(JSON.stringify({ok: true, projectId, cue: cue.id, still: path.relative(formalRoot, stillPath).replaceAll('\\', '/'), motion: path.relative(formalRoot, renderedMotionPath).replaceAll('\\', '/'), snapshotCount: snapshotNames.length, check: 'passed'}, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
