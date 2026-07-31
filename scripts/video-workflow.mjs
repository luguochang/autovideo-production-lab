import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertContentApprovalForNarration} from '../tools/content-pipeline/content-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');

const parseArgs = (values) => {
  const result = {_: []};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
};

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const exists = async (filePath) => fs.access(filePath).then(() => true).catch(() => false);
const splitList = (value) => value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
const normalizedText = (value) => value.replace(/\r\n/g, '\n').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const projectPath = (projectDir, filePath) => path.relative(projectDir, filePath).replaceAll('\\', '/');
const contentIntakeArtifacts = [
  {fileName: 'sources.json', binding: 'sourcesSha256'},
  {fileName: 'material-suitability.json', binding: 'suitabilitySha256'},
  {fileName: 'evidence.json', binding: 'evidenceSha256'},
  {fileName: 'evidence-approval.json', binding: 'evidenceApprovalSha256', optional: true},
  {fileName: 'content-outline.json', binding: 'contentOutlineSha256', optional: true},
  {fileName: 'script.draft.json', binding: 'scriptDraftSha256', optional: true},
  {fileName: 'spoken-rewrite.json', binding: 'spokenRewriteSha256'},
  {fileName: 'content-duration-fit.json', binding: 'durationFitSha256', optional: true},
  {fileName: 'claim-source-review.json', binding: 'claimSourceReviewSha256'},
];
const rootPath = (filePath) => {
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') || path.isAbsolute(relative) ? filePath : relative.replaceAll('\\', '/');
};

const readContentIntakeArtifacts = async (approval, sourceDirectory) => {
  const artifacts = [];
  for (const item of contentIntakeArtifacts) {
    if (item.optional && !approval.bindings[item.binding]) continue;
    const sourcePath = path.join(sourceDirectory, item.fileName);
    const bytes = await fs.readFile(sourcePath).catch((error) => {
      if (error?.code === 'ENOENT') {
        throw new Error(`Content approval requires sibling artifact ${item.fileName}. Preserve the complete approved intake chain.`);
      }
      throw error;
    });
    const digest = sha256(bytes);
    if (digest !== approval.bindings[item.binding]) {
      throw new Error(`${item.fileName} does not match ${item.binding} in content-approval.json.`);
    }
    artifacts.push({...item, bytes, sha256: digest});
  }
  return artifacts;
};

const assertNarrationLock = async (projectDir) => {
  const lock = await readJson(path.join(projectDir, 'NarrationLock.json'));
  const frozenPath = path.join(projectDir, lock.frozenPath);
  const currentText = await fs.readFile(frozenPath, 'utf8');
  const currentHash = sha256(normalizedText(currentText));
  if (currentHash !== lock.normalizedSha256) {
    throw new Error(`NarrationLock mismatch: ${lock.frozenPath} no longer matches ${lock.normalizedSha256}.`);
  }
  if (lock.approvalReceipt) {
    const approvalPath = path.resolve(projectDir, lock.approvalReceipt.path);
    const relativeApprovalPath = path.relative(projectDir, approvalPath);
    if (relativeApprovalPath.startsWith('..') || path.isAbsolute(relativeApprovalPath)) {
      throw new Error('NarrationLock approval receipt leaves the formal project.');
    }
    if (await sha256File(approvalPath) !== lock.approvalReceipt.sha256) {
      throw new Error('NarrationLock approval receipt hash no longer matches the locked receipt.');
    }
    const approval = await readJson(approvalPath);
    await assertContentApprovalForNarration({approval, projectId: lock.projectId, narrationText: currentText});
    if (approval.approvedNarration.sha256 !== lock.approvalReceipt.approvedNarrationSha256) {
      throw new Error('NarrationLock approval receipt declares a different approved narration hash.');
    }
    await readContentIntakeArtifacts(approval, path.join(projectDir, 'input', 'content-intake'));
  }
  return lock;
};

const readWavMetadata = async (filePath) => {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Final audio must be a valid RIFF/WAVE file.');
  }

  let format = null;
  let dataBytes = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkSize > bytes.length) throw new Error(`Invalid WAV chunk length for ${chunkId}.`);
    if (chunkId === 'fmt ' && chunkSize >= 16) {
      format = {
        audioFormat: bytes.readUInt16LE(chunkStart),
        channels: bytes.readUInt16LE(chunkStart + 2),
        sampleRate: bytes.readUInt32LE(chunkStart + 4),
        byteRate: bytes.readUInt32LE(chunkStart + 8),
        bitsPerSample: bytes.readUInt16LE(chunkStart + 14),
      };
    }
    if (chunkId === 'data') dataBytes = chunkSize;
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!format || dataBytes === null || !format.byteRate) throw new Error('WAV is missing a valid fmt or data chunk.');
  if (format.audioFormat !== 1) throw new Error('Final WAV must use integer PCM encoding.');
  return {
    ...format,
    codec: `pcm_s${format.bitsPerSample}le`,
    durationSeconds: dataBytes / format.byteRate,
  };
};

const timingFrom = (item) => {
  if (!item || typeof item !== 'object') return null;
  const start = item.start ?? item.startTime ?? item.start_time ?? item.timestamp?.[0];
  const end = item.end ?? item.endTime ?? item.end_time ?? item.timestamp?.[1];
  return Number.isFinite(Number(start)) && Number.isFinite(Number(end))
    ? {start: Number(start), end: Number(end)}
    : null;
};

const extractTimingEntries = (alignment) => {
  const wordGroups = [
    alignment?.words,
    alignment?.result?.words,
    alignment?.segments?.flatMap((segment) => segment.words ?? []),
    alignment?.result?.segments?.flatMap((segment) => segment.words ?? []),
  ];
  for (const group of wordGroups) {
    if (!Array.isArray(group)) continue;
    const entries = group.map(timingFrom).filter(Boolean);
    if (entries.length) return entries;
  }

  const segmentGroups = [alignment, alignment?.segments, alignment?.result?.segments, alignment?.chunks];
  for (const group of segmentGroups) {
    if (!Array.isArray(group)) continue;
    const entries = group.map(timingFrom).filter(Boolean);
    if (entries.length) return entries;
  }
  return [];
};

const validateAlignment = (alignment, durationSeconds, narrationSha256) => {
  const declaredHash = alignment.narrationSha256 ?? alignment.narration_sha256 ?? null;
  if (declaredHash && declaredHash !== narrationSha256) {
    throw new Error('alignment.json declares a narration hash that does not match NarrationLock.');
  }
  const entries = extractTimingEntries(alignment);
  if (!entries.length) throw new Error('alignment.json must contain timed words or segments.');
  let lastStart = -1;
  for (const [index, entry] of entries.entries()) {
    if (entry.start < 0 || entry.end < entry.start || entry.start < lastStart) {
      throw new Error(`alignment.json has an invalid or non-monotonic timing entry at index ${index}.`);
    }
    lastStart = entry.start;
  }
  const first = entries[0].start;
  const last = entries.at(-1).end;
  const edgeTolerance = Math.max(1.5, durationSeconds * 0.05);
  if (first > edgeTolerance || last > durationSeconds + 0.25 || durationSeconds - last > edgeTolerance) {
    throw new Error(`alignment.json does not cover the final WAV duration (${durationSeconds.toFixed(3)}s).`);
  }
  return {entryCount: entries.length, firstStartSeconds: first, lastEndSeconds: last};
};

const copyLockedFile = async (source, target, replace) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  const samePath = path.resolve(source) === path.resolve(target);
  if (samePath) return;
  if (await exists(target)) {
    const [sourceHash, targetHash] = await Promise.all([sha256File(source), sha256File(target)]);
    if (sourceHash === targetHash) return;
    if (!replace) throw new Error(`Target already exists with different content: ${target}. Use --replace to invalidate timing-dependent outputs.`);
  }
  await fs.copyFile(source, target);
};

const resolveProject = (value) => {
  if (!value) throw new Error('Missing --project <project-id-or-path>.');
  const candidate = path.resolve(root, value);
  return value.includes('/') || value.includes('\\') ? candidate : path.join(projectsRoot, value);
};

const refreshStage = (state) => {
  if (state.gates.task.status === 'approved' && state.gates.style.status === 'approved') return 'storyboard-ready';
  if (state.gates.task.status === 'approved') return 'style-review';
  return 'planning';
};

const newProject = async (args) => {
  const projectId = args.id;
  const narrationInput = args.narration;
  const ratio = args.ratio ?? '16:9';
  if (!projectId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(projectId)) {
    throw new Error('Use --id with letters, numbers, dot, underscore, or hyphen.');
  }
  if (!narrationInput) throw new Error('Missing --narration <path>.');

  const projectDir = path.join(projectsRoot, projectId);
  if (await exists(projectDir)) {
    if (await exists(path.join(projectDir, 'project-state.json'))) {
      throw new Error(`Project already exists: ${projectDir}`);
    }
    const allowedPreInitFiles = new Set([
      'ENGINEERING_TASK.md',
      'PIPELINE_RUN_LOG.md',
      'RUN_EXECUTION_LOG.md',
      'WORKBENCH_PROJECT_INPUT.json',
    ]);
    const unexpected = (await fs.readdir(projectDir, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory() || !allowedPreInitFiles.has(entry.name))
      .map((entry) => entry.name);
    if (unexpected.length) {
      throw new Error(`Project directory exists with non-initialization files: ${unexpected.join(', ')}`);
    }
  }

  const narrationSource = path.resolve(root, narrationInput);
  const narrationBytes = await fs.readFile(narrationSource);
  const narrationText = narrationBytes.toString('utf8');
  const normalizedNarration = normalizedText(narrationText);
  if (!normalizedNarration) throw new Error('Narration file is empty.');

  let contentApproval = null;
  let contentApprovalBytes = null;
  let contentIntake = [];
  if (args['content-approval']) {
    const approvalSource = path.resolve(root, args['content-approval']);
    contentApprovalBytes = await fs.readFile(approvalSource);
    contentApproval = JSON.parse(contentApprovalBytes.toString('utf8'));
    await assertContentApprovalForNarration({approval: contentApproval, projectId, narrationText});
    contentIntake = await readContentIntakeArtifacts(contentApproval, path.dirname(approvalSource));
  }

  await fs.mkdir(path.join(projectDir, 'input'), {recursive: true});
  await fs.mkdir(path.join(projectDir, 'review', 'stills'), {recursive: true});
  await fs.mkdir(path.join(projectDir, 'review', 'probes'), {recursive: true});
  await fs.mkdir(path.join(projectDir, 'production'), {recursive: true});

  const narrationExtension = path.extname(narrationSource) || '.txt';
  const narrationTarget = path.join(projectDir, 'input', `narration${narrationExtension}`);
  await fs.writeFile(narrationTarget, narrationBytes);
  if (contentApprovalBytes) {
    await fs.writeFile(path.join(projectDir, 'input', 'content-approval.json'), contentApprovalBytes);
    const intakeTarget = path.join(projectDir, 'input', 'content-intake');
    await fs.mkdir(intakeTarget, {recursive: true});
    for (const artifact of contentIntake) {
      await fs.writeFile(path.join(intakeTarget, artifact.fileName), artifact.bytes);
    }
  }

  let referenceImage = null;
  if (args['reference-image']) {
    const referenceSource = path.resolve(root, args['reference-image']);
    const extension = path.extname(referenceSource).toLowerCase();
    const supportedImages = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);
    if (!supportedImages.has(extension)) throw new Error(`Reference image must be one of: ${[...supportedImages].join(', ')}`);
    const referenceTarget = path.join(projectDir, 'input', `style-reference${extension}`);
    await fs.copyFile(referenceSource, referenceTarget);
    referenceImage = path.relative(projectDir, referenceTarget).replaceAll('\\', '/');
  }

  const createdAt = new Date().toISOString();
  const narrationLock = {
    schemaVersion: 'autovideo-narration-lock/v1',
    projectId,
    sourcePath: path.relative(root, narrationSource).replaceAll('\\', '/'),
    frozenPath: path.relative(projectDir, narrationTarget).replaceAll('\\', '/'),
    sourceSha256: sha256(narrationBytes),
    normalizedSha256: sha256(normalizedNarration),
    normalization: 'UTF-8 text; CRLF converted to LF; surrounding whitespace trimmed',
    createdAt,
    immutable: true,
    ...(contentApproval ? {
      approvalReceipt: {
        path: 'input/content-approval.json',
        sha256: sha256(contentApprovalBytes),
        schemaVersion: contentApproval.schemaVersion,
        approvedNarrationSha256: contentApproval.approvedNarration.sha256,
      },
    } : {}),
  };
  await writeJson(path.join(projectDir, 'NarrationLock.json'), narrationLock);

  const state = {
    schemaVersion: 'autovideo-project-state/v1',
    projectId,
    stage: 'planning',
    createdAt,
    updatedAt: createdAt,
    inputs: {
      narration: narrationLock.frozenPath,
      referenceImage,
      ratio,
      targetDuration: args.duration ?? null,
      platform: args.platform ?? null,
      audience: args.audience ?? null,
      rememberedOutcome: args.outcome ?? null,
      forbiddenTreatments: args.forbidden ?? null,
    },
    gates: {
      task: {status: 'pending', approvedBy: null, approvedAt: null},
      style: {status: 'pending', approvedBy: null, approvedAt: null},
      finalPreview: {status: 'pending', approvedBy: null, approvedAt: null},
    },
    nextAction: 'Complete VIDEO_TASK.md, analyze any reference image, and prepare 2-4 style candidates.',
  };
  await writeJson(path.join(projectDir, 'project-state.json'), state);

  const videoTask = `# HyperFrames 视频生成任务\n\n## Input Lock\n\n- Project ID: ${projectId}\n- Narration path: \`${narrationLock.frozenPath}\`\n- Narration normalized SHA-256: \`${narrationLock.normalizedSha256}\`\n- Ratio: ${ratio}\n- Target duration: ${args.duration ?? '待确认'}\n- Platform: ${args.platform ?? '待确认'}\n- Audience: ${args.audience ?? '待确认'}\n- Viewer must remember: ${args.outcome ?? '待确认'}\n- Forbidden treatments: ${args.forbidden ?? '待确认'}\n- Reference image: ${referenceImage ? `\`${referenceImage}\`` : '无'}\n\n## Style Selection\n\n- Base style ID: 待评审\n- Frame preset: 待评审\n- Add-on families: 待评审，最多两个且必须写明职责\n- Official registry items: 待检索\n- Scene blueprints: 待检索\n- Motion rules: 待检索\n- Status: \`draft\`\n\n## Visual Thesis\n\n说明观众通过画面变化应该理解什么，以及哪些对象会持续保留到最后。\n\n## Beat Plan\n\n| Cue ID | Narration source range | Spoken intent | Visible operation | Existing object handoff | Registry/motion source | Terminal frame |\n|---|---|---|---|---|---|---|\n\n## Screen Text\n\n每条文字标记 \`exact-source\`、\`approved-summary\` 或 \`generated-summary\`。\n\n## Asset Plan\n\n| Asset ID | Purpose | Source/generator | License | Fallback | Status |\n|---|---|---|---|---|---|\n\n## Review Gate\n\n- Task status: \`pending\`\n- Approved by:\n- Approved at:\n`;
  await fs.writeFile(path.join(projectDir, 'VIDEO_TASK.md'), videoTask, 'utf8');

  const analysis = `# 参考图风格分析\n\n- Reference image: ${referenceImage ? `\`${referenceImage}\`` : '未提供'}\n- Analysis status: \`pending\`\n\n## Required Extraction\n\n1. 色板、对比度、背景材质和强调色。\n2. 字体类别、层级、字重、密度和对齐方式。\n3. 组件语法：卡片、边框、图表、纸张、网格、截图框等。\n4. 空间结构：连续画板、页面切换、海报、UI、拼贴或其他。\n5. 动效线索：镜头、入场、聚焦、路径、转场和节奏。\n6. 必须保留的特征、可替代特征和禁止直接复制的品牌/内容素材。\n\n## Registry Matching\n\n把视觉特征映射到 \`style-library/registry.json\`、官方 frame presets、registry items、blueprints 和 motion rules。每个命中项都记录来源；不得仅凭相似名称判断。\n`;
  await fs.writeFile(path.join(projectDir, 'STYLE_ANALYSIS.md'), analysis, 'utf8');

  const styleReview = `# 风格评审\n\n## Shared Test Window\n\n- Narration SHA-256: \`${narrationLock.normalizedSha256}\`\n- Source range / time window: 待选择一个具有代表性的 3-8 秒窗口\n- Ratio / FPS: ${ratio} / 30\n\n## Generation Rule\n\n先分析参考图，再选择 2-4 个真正不同的候选。每个候选只生成：\n\n- 一张代表性静帧；首屏可作为其中之一，但应优先选择能暴露主要组件语法的内容帧。\n- 一条使用同一口播窗口的 3-8 秒 motion probe。\n\n不得为了选风格生成多条完整视频。\n\n## Candidates\n\n| Candidate | Base style | Frame preset | Add-ons and jobs | Registry items | Motion rules | Still | Motion probe | Known risks |\n|---|---|---|---|---|---|---|---|---|\n\n## Decision\n\n- Selected base style:\n- Allowed add-ons:\n- Rejected treatments:\n- Required corrections:\n- Approval status: \`pending\`\n- Reviewer:\n`;
  await fs.writeFile(path.join(projectDir, 'STYLE_REVIEW.md'), styleReview, 'utf8');

  await fs.writeFile(path.join(projectDir, 'STORYBOARD.md'), '# HyperFrames 执行分镜\n\n> 任务和风格双重批准后填写。\n', 'utf8');
  await fs.writeFile(path.join(projectDir, 'AssetManifest.json'), `${JSON.stringify({schemaVersion: 'autovideo-asset-manifest/v1', projectId, assets: referenceImage ? [{id: 'style-reference', path: referenceImage, source: 'user-provided', license: 'user-provided; publication rights not implied', purpose: 'style analysis only'}] : []}, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({created: projectDir, stage: state.stage, nextAction: state.nextAction}, null, 2));
};

const approveTask = async (args) => {
  const projectDir = resolveProject(args.project);
  if (!args.reviewer) throw new Error('Missing --reviewer <name>.');
  const statePath = path.join(projectDir, 'project-state.json');
  const state = await readJson(statePath);
  state.gates.task = {status: 'approved', approvedBy: args.reviewer, approvedAt: new Date().toISOString()};
  state.stage = refreshStage(state);
  state.updatedAt = new Date().toISOString();
  state.nextAction = state.stage === 'storyboard-ready' ? 'Create STORYBOARD.md and begin production.' : 'Complete style probes and approve one style selection.';
  await writeJson(statePath, state);
  console.log(JSON.stringify({projectId: state.projectId, gate: 'task', status: 'approved', stage: state.stage}, null, 2));
};

const approveStyle = async (args) => {
  const projectDir = resolveProject(args.project);
  if (!args.base || !args.reviewer) throw new Error('Missing --base <style-id> or --reviewer <name>.');

  const templateLockPath = path.join(projectDir, 'template-lock.json');
  if (await exists(templateLockPath)) {
    const templateLock = await readJson(templateLockPath);
    if (templateLock.styleId !== args.base) {
      throw new Error(`Style approval must match template-lock.json (${templateLock.styleId}); received ${args.base}.`);
    }
  }

  const stillFiles = await fs.readdir(path.join(projectDir, 'review', 'stills'));
  const probeFiles = await fs.readdir(path.join(projectDir, 'review', 'probes'));
  const skipReview = Boolean(args['skip-review']);
  if (skipReview && !args['skip-reason']) throw new Error('Using --skip-review requires --skip-reason <reason>.');
  if (!skipReview && (!stillFiles.length || !probeFiles.length)) {
    throw new Error('Style approval requires at least one review still and one motion probe. Add files under review/stills and review/probes, or explicitly use --skip-review with --skip-reason.');
  }

  const styleRegistry = await readJson(path.join(root, 'style-library', 'registry.json'));
  const projectStyleRegistryPath = path.join(projectDir, 'STYLE_CANDIDATES.json');
  const projectStyleRegistry = await exists(projectStyleRegistryPath) ? await readJson(projectStyleRegistryPath) : {styles: []};
  const officialRegistry = await readJson(path.join(root, 'style-library', 'generated', 'hyperframes-official-registry.json'));
  const blueprints = await readJson(path.join(root, 'style-library', 'generated', 'hyperframes-blueprints.json'));
  const motionRules = await readJson(path.join(root, 'style-library', 'generated', 'hyperframes-motion-rules.json'));
  const framePresets = await readJson(path.join(root, 'style-library', 'generated', 'hyperframes-frame-presets.json'));

  const allStyles = [...styleRegistry.styles, ...(projectStyleRegistry.styles ?? [])];
  const styleIds = new Set(allStyles.map((item) => item.id));
  const officialItems = new Set(officialRegistry.map((item) => item.name));
  const blueprintIds = new Set(blueprints.map((item) => item.id));
  const motionRuleIds = new Set(motionRules.map((item) => item.id));
  const framePresetIds = new Set(framePresets.map((item) => item.id));
  const addons = splitList(args.addons);
  const registryItems = splitList(args['registry-items']);
  const selectedBlueprints = splitList(args.blueprints);
  const selectedMotionRules = splitList(args['motion-rules']);

  if (!styleIds.has(args.base)) throw new Error(`Unknown base style: ${args.base}`);
  if (addons.length > 2 || addons.some((id) => !styleIds.has(id))) throw new Error('Add-ons must contain at most two known style IDs.');
  if (registryItems.some((id) => !officialItems.has(id))) throw new Error('One or more registry items do not exist in the official index.');
  if (selectedBlueprints.some((id) => !blueprintIds.has(id))) throw new Error('One or more blueprints do not exist in the official index.');
  if (!selectedMotionRules.length || selectedMotionRules.some((id) => !motionRuleIds.has(id))) throw new Error('Provide at least one known motion rule with --motion-rules.');
  if (args.frame && !framePresetIds.has(args.frame)) throw new Error(`Unknown frame preset: ${args.frame}`);

  const narrationLock = await readJson(path.join(projectDir, 'NarrationLock.json'));
  const baseRecord = allStyles.find((item) => item.id === args.base);
  const selection = {
    schemaVersion: 'autovideo-style-selection/v1',
    projectId: narrationLock.projectId,
    narrationSha256: narrationLock.normalizedSha256,
    baseStyleId: args.base,
    framePreset: args.frame ?? null,
    addons,
    registryItems,
    blueprints: selectedBlueprints,
    motionRules: selectedMotionRules,
    status: 'approved',
    approvedBy: args.reviewer,
    notes: args.notes ?? (skipReview ? `Review gate skipped by user: ${args['skip-reason']}` : 'Approved after still and motion-probe review.'),
    receipts: [
      {source: baseRecord.sourcePath, kind: baseRecord.family === 'hyperframes-official' ? 'official' : baseRecord.family === 'project-local' ? 'project-local' : 'user-provided', license: baseRecord.license},
      ...(registryItems.length ? [{source: 'vendor/hyperframes/registry/registry.json', kind: 'official', license: 'Apache-2.0'}] : []),
      ...(selectedMotionRules.length || selectedBlueprints.length ? [{source: 'vendor/hyperframes/skills/hyperframes-animation/', kind: 'official', license: 'Apache-2.0'}] : []),
    ],
  };
  await writeJson(path.join(projectDir, 'style-selection.json'), selection);

  const statePath = path.join(projectDir, 'project-state.json');
  const state = await readJson(statePath);
  state.gates.style = {
    status: 'approved',
    approvedBy: args.reviewer,
    approvedAt: new Date().toISOString(),
    reviewMode: skipReview ? 'skipped-by-user' : 'still-and-motion-probe',
    skippedReason: skipReview ? args['skip-reason'] : null,
  };
  state.stage = refreshStage(state);
  state.updatedAt = new Date().toISOString();
  state.nextAction = state.stage === 'storyboard-ready' ? 'Create STORYBOARD.md and begin production.' : 'Finish and approve VIDEO_TASK.md.';
  await writeJson(statePath, state);
  console.log(JSON.stringify({projectId: state.projectId, gate: 'style', status: 'approved', stage: state.stage, selection}, null, 2));
};

const applyTemplate = async (args) => {
  const projectDir = resolveProject(args.project);
  if (!args.style) throw new Error('Missing --style <approved-project-style-id>.');

  const statePath = path.join(projectDir, 'project-state.json');
  const [state, narrationLock, registry] = await Promise.all([
    readJson(statePath),
    assertNarrationLock(projectDir),
    readJson(path.join(root, 'style-library', 'registry.json')),
  ]);
  const styleRecord = registry.styles.find((item) => item.id === args.style);
  if (!styleRecord || styleRecord.family !== 'project-local' || !styleRecord.status.startsWith('approved')) {
    throw new Error(`Template must be an approved project-local style: ${args.style}`);
  }

  const styleDir = path.resolve(root, styleRecord.sourcePath);
  const projectStylesRoot = path.resolve(root, 'style-library', 'styles', 'project');
  const relativeStyleDir = path.relative(projectStylesRoot, styleDir);
  if (relativeStyleDir.startsWith('..') || path.isAbsolute(relativeStyleDir)) {
    throw new Error(`Template source is outside style-library/styles/project: ${styleRecord.sourcePath}`);
  }

  const requiredFiles = ['frame.md', 'STYLE_GUIDE.md', 'POSE_MANIFEST.json', 'LAYOUT_CONTRACT.md', 'PLANNING_CONTRACT.json', 'PALETTE_VARIANTS.json', 'USAGE.md'];
  for (const file of requiredFiles) {
    if (!await exists(path.join(styleDir, file))) throw new Error(`Template is incomplete; missing ${file}.`);
  }
  const paletteContract = await readJson(path.join(styleDir, 'PALETTE_VARIANTS.json'));
  if (paletteContract.styleId !== args.style || paletteContract.status !== 'approved') {
    throw new Error('Template palette contract is not approved or belongs to another style.');
  }
  const paletteId = args.palette ?? paletteContract.defaultPaletteId;
  const palette = paletteContract.variants.find((item) => item.id === paletteId && item.status.startsWith('approved'));
  if (!palette) throw new Error(`Unknown or unapproved palette for ${args.style}: ${paletteId}`);

  if (state.inputs.ratio && state.inputs.ratio !== '16:9') {
    throw new Error(`${args.style} is landscape-only; project ratio is ${state.inputs.ratio}.`);
  }

  const sourceFiles = await Promise.all(requiredFiles.map(async (file) => ({
    path: rootPath(path.join(styleDir, file)),
    sha256: await sha256File(path.join(styleDir, file)),
  })));
  const lock = {
    schemaVersion: 'autovideo-template-lock/v1',
    projectId: state.projectId,
    narrationSha256: narrationLock.normalizedSha256,
    styleId: args.style,
    styleVersion: paletteContract.version,
    paletteId,
    ratio: '16:9',
    resolution: '1920x1080',
    fps: 30,
    sourcePath: rootPath(styleDir),
    sourceFiles,
    appliedAt: new Date().toISOString(),
    immutable: true,
    reviewGate: 'project task approval plus same-window still and 3-8s motion probe',
  };

  const lockPath = path.join(projectDir, 'template-lock.json');
  if (await exists(lockPath)) {
    const existing = await readJson(lockPath);
    const sameSelection = existing.styleId === lock.styleId
      && existing.styleVersion === lock.styleVersion
      && existing.paletteId === lock.paletteId
      && existing.narrationSha256 === lock.narrationSha256;
    if (!sameSelection) throw new Error('template-lock.json is immutable. Create a new project to change style, version, palette, or narration.');
    lock.appliedAt = existing.appliedAt;
  }
  await writeJson(lockPath, lock);

  state.inputs.ratio = '16:9';
  state.inputs.template = {
    id: lock.styleId,
    version: lock.styleVersion,
    palette: lock.paletteId,
    lock: 'template-lock.json',
  };
  state.gates.finalPreview ??= {status: 'pending', approvedBy: null, approvedAt: null};
  state.updatedAt = new Date().toISOString();
  if (state.gates.task.status === 'approved' && state.gates.style.status === 'approved') {
    state.nextAction = 'Template is locked. Attach approved final audio and alignment before full composition work; wait for an explicit production request.';
  } else {
    state.nextAction = 'Use the locked template for a static master frame and same-window 3-8s probe, then complete the normal task and style gates.';
  }
  await writeJson(statePath, state);
  console.log(JSON.stringify({projectId: state.projectId, templateLock: projectPath(projectDir, lockPath), styleId: lock.styleId, version: lock.styleVersion, paletteId: lock.paletteId, stage: state.stage, gates: state.gates}, null, 2));
};

const attachAudio = async (args) => {
  const projectDir = resolveProject(args.project);
  if (!args.audio || !args.alignment || !args['approved-by']) {
    throw new Error('Missing --audio <final.wav>, --alignment <alignment.json>, or --approved-by <name>.');
  }
  const rightsStatus = args['rights-status'] ?? 'needs-review';
  if (!['approved', 'needs-review'].includes(rightsStatus)) {
    throw new Error('--rights-status must be approved or needs-review.');
  }
  const approvalScope = args['approval-scope'] ?? 'technical-only';
  if (!['technical-only', 'human-listening'].includes(approvalScope)) {
    throw new Error('--approval-scope must be technical-only or human-listening.');
  }
  if (rightsStatus === 'approved' && approvalScope !== 'human-listening') {
    throw new Error('Public-release audio requires --approval-scope human-listening.');
  }

  const audioSource = path.resolve(root, args.audio);
  const alignmentSource = path.resolve(root, args.alignment);
  const recipeSource = args.recipe ? path.resolve(root, args.recipe) : null;
  if (path.extname(audioSource).toLowerCase() !== '.wav') throw new Error('Final audio must be a WAV file.');
  const [narrationLock, wav, alignment, state] = await Promise.all([
    assertNarrationLock(projectDir),
    readWavMetadata(audioSource),
    readJson(alignmentSource),
    readJson(path.join(projectDir, 'project-state.json')),
  ]);
  if (wav.sampleRate !== 48000 || wav.channels !== 1) {
    throw new Error(`Final WAV must be 48kHz mono PCM; received ${wav.sampleRate}Hz, ${wav.channels} channel(s).`);
  }
  const timing = validateAlignment(alignment, wav.durationSeconds, narrationLock.normalizedSha256);

  const audioTarget = path.join(projectDir, 'audio', 'narration.final.wav');
  const alignmentTarget = path.join(projectDir, 'audio', 'alignment.json');
  const recipeTarget = recipeSource ? path.join(projectDir, 'audio', 'voice.recipe.json') : null;
  const replace = Boolean(args.replace);
  const sourceAudioHash = await sha256File(audioSource);
  const sourceAlignmentHash = await sha256File(alignmentSource);
  const existingHandoffPath = path.join(projectDir, 'audio-handoff.json');
  const existingHandoff = await exists(existingHandoffPath) ? await readJson(existingHandoffPath) : null;
  const audioChanged = !existingHandoff
    || existingHandoff.audio.sha256 !== sourceAudioHash
    || existingHandoff.alignment.sha256 !== sourceAlignmentHash;
  const transfers = [[audioSource, audioTarget], [alignmentSource, alignmentTarget], ...(recipeSource ? [[recipeSource, recipeTarget]] : [])];
  for (const [source, target] of transfers) {
    if (path.resolve(source) === path.resolve(target) || !await exists(target)) continue;
    const [sourceHash, targetHash] = await Promise.all([sha256File(source), sha256File(target)]);
    if (sourceHash !== targetHash && !replace) {
      throw new Error(`Target already exists with different content: ${target}. Use --replace to invalidate timing-dependent outputs.`);
    }
  }
  await copyLockedFile(audioSource, audioTarget, replace);
  await copyLockedFile(alignmentSource, alignmentTarget, replace);
  if (recipeSource) await copyLockedFile(recipeSource, recipeTarget, replace);

  const handoff = {
    schemaVersion: 'autovideo-audio-handoff/v2',
    projectId: state.projectId,
    narrationSha256: narrationLock.normalizedSha256,
    status: 'approved',
    approvedBy: args['approved-by'],
    approvalScope,
    humanListeningStatus: approvalScope === 'human-listening' ? 'approved' : 'not-performed',
    attachedAt: new Date().toISOString(),
    provider: args.provider ?? 'external-voice-agent',
    rightsStatus,
    publicReleaseBlocked: rightsStatus !== 'approved' || approvalScope !== 'human-listening',
    audio: {
      path: projectPath(projectDir, audioTarget),
      source: rootPath(audioSource),
      sha256: await sha256File(audioTarget),
      codec: wav.codec,
      sampleRate: wav.sampleRate,
      channels: wav.channels,
      durationSeconds: Number(wav.durationSeconds.toFixed(6)),
    },
    alignment: {
      path: projectPath(projectDir, alignmentTarget),
      source: rootPath(alignmentSource),
      sha256: await sha256File(alignmentTarget),
      ...timing,
    },
    recipe: recipeTarget ? {
      path: projectPath(projectDir, recipeTarget),
      source: rootPath(recipeSource),
      sha256: await sha256File(recipeTarget),
    } : null,
    immutable: true,
  };
  await writeJson(path.join(projectDir, 'audio-handoff.json'), handoff);

  state.handoffs ??= {};
  state.handoffs.audio = {
    status: handoff.status,
    rightsStatus,
    approvalScope,
    humanListeningStatus: handoff.humanListeningStatus,
    publicReleaseBlocked: handoff.publicReleaseBlocked,
    lock: 'audio-handoff.json',
    durationSeconds: handoff.audio.durationSeconds,
  };
  state.gates.finalPreview ??= {status: 'pending', approvedBy: null, approvedAt: null};
  if (audioChanged) {
    state.gates.finalPreview = {status: 'pending', approvedBy: null, approvedAt: null, invalidatedBy: 'audio-handoff'};
  }
  state.updatedAt = new Date().toISOString();
  state.nextAction = rightsStatus === 'approved'
    ? 'Derive captions, scene boundaries, and motion cues from audio/alignment.json; do not reuse timing from another WAV.'
    : 'Internal composition may continue with this locked audio; public release stays blocked until voice rights and human listening are approved.';
  if (replace && audioChanged) {
    state.invalidations ??= [];
    state.invalidations.push({at: state.updatedAt, reason: 'Final audio or alignment replaced', invalidates: ['captions', 'scene durations', 'motion cues', 'render QA']});
  }
  await writeJson(path.join(projectDir, 'project-state.json'), state);
  console.log(JSON.stringify({projectId: state.projectId, audioHandoff: 'audio-handoff.json', durationSeconds: handoff.audio.durationSeconds, timingEntries: timing.entryCount, rightsStatus, approvalScope, publicReleaseBlocked: handoff.publicReleaseBlocked, nextAction: state.nextAction}, null, 2));
};

const approvePreview = async (args) => {
  const projectDir = resolveProject(args.project);
  if (!args.reviewer || !args['check-evidence']) {
    throw new Error('Missing --reviewer <name> or --check-evidence <path>.');
  }
  const checkEvidence = path.resolve(root, args['check-evidence']);
  if (!await exists(checkEvidence)) throw new Error(`HyperFrames check evidence does not exist: ${checkEvidence}`);

  const statePath = path.join(projectDir, 'project-state.json');
  const state = await readJson(statePath);
  const templateReport = [];
  for (const required of ['template-lock.json', 'audio-handoff.json', 'style-selection.json']) {
    templateReport.push({required, exists: await exists(path.join(projectDir, required))});
  }
  if (state.gates.task.status !== 'approved' || state.gates.style.status !== 'approved' || templateReport.some((item) => !item.exists)) {
    throw new Error('Final preview approval requires approved task/style gates plus template-lock.json, audio-handoff.json, and style-selection.json.');
  }
  const handoff = await readJson(path.join(projectDir, 'audio-handoff.json'));
  const humanListeningApproved = handoff.approvalScope === 'human-listening'
    && handoff.humanListeningStatus === 'approved';
  if (handoff.status !== 'approved'
    || handoff.rightsStatus !== 'approved'
    || !humanListeningApproved
    || handoff.publicReleaseBlocked !== false) {
    throw new Error('Public final preview approval requires valid final audio, approved voice rights, and explicit human-listening approval.');
  }

  state.gates.finalPreview = {
    status: 'approved',
    approvedBy: args.reviewer,
    approvedAt: new Date().toISOString(),
    checkEvidence: rootPath(checkEvidence),
    notes: args.notes ?? 'Approved in HyperFrames Studio after check passed.',
  };
  state.updatedAt = state.gates.finalPreview.approvedAt;
  state.nextAction = 'Render the final master, run media/text/visual QA, and archive delivery receipts.';
  await writeJson(statePath, state);
  console.log(JSON.stringify({projectId: state.projectId, gate: 'finalPreview', status: 'approved', reviewer: args.reviewer, checkEvidence: rootPath(checkEvidence), nextAction: state.nextAction}, null, 2));
};

const templateStatus = async (args) => {
  const projectDir = resolveProject(args.project);
  const state = await readJson(path.join(projectDir, 'project-state.json'));
  const checks = [];
  const addCheck = (id, passed, detail) => checks.push({id, passed, detail});

  let narrationValid = false;
  let narrationSha256 = null;
  try {
    const narrationLock = await assertNarrationLock(projectDir);
    narrationValid = true;
    narrationSha256 = narrationLock.normalizedSha256;
    addCheck('narration-lock', true, narrationLock.normalizedSha256);
  } catch (error) {
    addCheck('narration-lock', false, error.message);
  }

  let templateValid = false;
  let templateLock = null;
  const templateLockPath = path.join(projectDir, 'template-lock.json');
  if (!await exists(templateLockPath)) {
    addCheck('template-lock', false, 'Missing template-lock.json. Run video:apply-template.');
  } else {
    try {
      templateLock = await readJson(templateLockPath);
      const results = await Promise.all(templateLock.sourceFiles.map(async (item) => {
        const source = path.resolve(root, item.path);
        return await exists(source) && await sha256File(source) === item.sha256;
      }));
      templateValid = results.every(Boolean)
        && state.inputs.ratio === templateLock.ratio
        && templateLock.narrationSha256 === narrationSha256;
      addCheck('template-lock', templateValid, templateValid
        ? `${templateLock.styleId}@${templateLock.styleVersion} / ${templateLock.paletteId}`
        : 'Template source hash, project ratio, or narration hash no longer matches the lock.');
    } catch (error) {
      addCheck('template-lock', false, error.message);
    }
  }

  const taskApproved = state.gates.task.status === 'approved';
  const styleApproved = state.gates.style.status === 'approved';
  addCheck('project-gates', taskApproved && styleApproved, `task=${state.gates.task.status}, style=${state.gates.style.status}`);

  let styleMatchesTemplate = false;
  const styleSelectionPath = path.join(projectDir, 'style-selection.json');
  if (templateLock && await exists(styleSelectionPath)) {
    const selection = await readJson(styleSelectionPath);
    styleMatchesTemplate = selection.status === 'approved'
      && selection.baseStyleId === templateLock.styleId
      && selection.narrationSha256 === templateLock.narrationSha256;
    addCheck('style-selection-match', styleMatchesTemplate, styleMatchesTemplate
      ? `${selection.baseStyleId} matches the template and narration locks.`
      : 'Approved style-selection.json does not match the template or narration lock.');
  } else {
    addCheck('style-selection-match', false, 'Missing template lock or style-selection.json.');
  }

  let audioValid = false;
  let audioRightsApproved = false;
  let audioHumanListeningApproved = false;
  let audioPublicReleaseReady = false;
  let audioHandoffContract = {
    exists: false,
    status: 'missing',
    filesValid: false,
    narrationMatches: false,
    valid: false,
    rightsStatus: null,
    rightsApproved: false,
    approvalScope: null,
    humanListeningStatus: null,
    humanListeningApproved: false,
    publicReleaseBlocked: true,
    publicReleaseReady: false,
  };
  const audioHandoffPath = path.join(projectDir, 'audio-handoff.json');
  if (!await exists(audioHandoffPath)) {
    addCheck('audio-handoff', false, 'Not attached yet; required before full composition production.');
  } else {
    try {
      const handoff = await readJson(audioHandoffPath);
      const audioPath = path.join(projectDir, handoff.audio.path);
      const alignmentPath = path.join(projectDir, handoff.alignment.path);
      const filesMatch = await exists(audioPath)
        && await exists(alignmentPath)
        && await sha256File(audioPath) === handoff.audio.sha256
        && await sha256File(alignmentPath) === handoff.alignment.sha256;
      const narrationMatches = handoff.narrationSha256 === narrationSha256;
      audioValid = handoff.status === 'approved' && filesMatch && narrationMatches;
      audioRightsApproved = handoff.rightsStatus === 'approved';
      const listeningScope = handoff.approvalScope ?? 'technical-only';
      audioHumanListeningApproved = listeningScope === 'human-listening'
        && handoff.humanListeningStatus === 'approved';
      audioPublicReleaseReady = audioValid
        && audioRightsApproved
        && audioHumanListeningApproved
        && handoff.publicReleaseBlocked === false;
      audioHandoffContract = {
        exists: true,
        status: handoff.status ?? null,
        filesValid: filesMatch,
        narrationMatches,
        valid: audioValid,
        rightsStatus: handoff.rightsStatus ?? null,
        rightsApproved: audioRightsApproved,
        approvalScope: listeningScope,
        humanListeningStatus: handoff.humanListeningStatus ?? null,
        humanListeningApproved: audioHumanListeningApproved,
        publicReleaseBlocked: handoff.publicReleaseBlocked !== false,
        publicReleaseReady: audioPublicReleaseReady,
      };
      addCheck('audio-handoff', audioPublicReleaseReady, audioValid
        ? `files valid; rights=${handoff.rightsStatus}; listening=${listeningScope}`
        : 'Audio or alignment is missing, changed, or not approved.');
    } catch (error) {
      audioHandoffContract = {...audioHandoffContract, exists: true, status: 'invalid', error: error.message};
      addCheck('audio-handoff', false, error.message);
    }
  }

  const previewApproved = state.gates.finalPreview?.status === 'approved';
  addCheck('final-preview', previewApproved, previewApproved
    ? `approved by ${state.gates.finalPreview.approvedBy}`
    : 'Pending; run video:approve-preview only after HyperFrames check and Studio review.');
  const readiness = {
    readyForProjectProbe: narrationValid && templateValid,
    readyForComposition: narrationValid && templateValid && taskApproved && styleApproved && styleMatchesTemplate && audioPublicReleaseReady,
    readyForFinalRender: narrationValid && templateValid && taskApproved && styleApproved && styleMatchesTemplate && audioPublicReleaseReady && previewApproved,
  };
  const contracts = {audioHandoff: audioHandoffContract};
  console.log(JSON.stringify({projectDir, projectId: state.projectId, stage: state.stage, checks, contracts, readiness, nextAction: state.nextAction}, null, 2));
};

const status = async (args) => {
  const projectDir = resolveProject(args.project);
  const state = await readJson(path.join(projectDir, 'project-state.json'));
  const sopPath = path.join(projectDir, 'SOP_STATUS.json');
  const sop = await exists(sopPath) ? await readJson(sopPath) : null;
  const artifacts = {};
  for (const file of ['NarrationLock.json', 'template-lock.json', 'audio-handoff.json', 'VIDEO_TASK.md', 'STYLE_ANALYSIS.md', 'STYLE_REVIEW.md', 'style-selection.json', 'STORYBOARD.md', 'AssetManifest.json']) {
    artifacts[file] = await exists(path.join(projectDir, file));
  }
  const release = state.release ?? {
    phase: sop?.release?.phase ?? 'production',
    technicalVideoGenerationReady: sop?.readiness?.technicalVideoGenerationReady === true,
    internalReviewReady: sop?.readiness?.technicalVideoGenerationReady === true,
    publicMasterReady: false,
    publicReleaseBlocked: sop?.release?.publicReleaseBlocked !== false,
  };
  console.log(JSON.stringify({
    projectDir,
    ...state,
    workflowStage: state.stage,
    releasePhase: release.phase,
    technicalVideoGenerationReady: release.technicalVideoGenerationReady,
    release,
    artifacts,
  }, null, 2));
};

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

try {
  if (command === 'new') await newProject(args);
  else if (command === 'approve-task') await approveTask(args);
  else if (command === 'approve-style') await approveStyle(args);
  else if (command === 'apply-template') await applyTemplate(args);
  else if (command === 'attach-audio') await attachAudio(args);
  else if (command === 'approve-preview') await approvePreview(args);
  else if (command === 'template-status') await templateStatus(args);
  else if (command === 'status') await status(args);
  else fail('Usage: node scripts/video-workflow.mjs <new|status|approve-task|approve-style|apply-template|attach-audio|approve-preview|template-status> [options]');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
