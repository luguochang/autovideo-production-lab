import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectId = projectFlag >= 0 ? args[projectFlag + 1] : args[0];
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/finalize-audio-delivery.mjs --project <project-id>');
}

const projectRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects', projectId);
const captionsRoot = path.join(projectRoot, 'captions');
const requiredInputs = [
  'NarrationLock.json',
  'input/pronunciation.json',
  'audio/narration.final.wav',
  'audio/voice.recipe.json',
  'audio/alignment.asr.json',
  'audio/alignment.json',
];

const firstExisting = async (candidates) => {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to the next frozen workspace runtime.
    }
  }
  return 'python.exe';
};

const readJson = (relativePath) => fs.readFile(path.join(projectRoot, relativePath), 'utf8').then(JSON.parse);

const main = async () => {
  await Promise.all(requiredInputs.map((relativePath) => fs.access(path.join(projectRoot, relativePath))));
  const narrationLock = await readJson('NarrationLock.json');
  const narrationPath = path.resolve(projectRoot, narrationLock.frozenPath);
  if (narrationPath !== projectRoot && !narrationPath.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error('NarrationLock frozenPath leaves the formal project.');
  }
  await fs.access(narrationPath);
  await fs.mkdir(captionsRoot, {recursive: true});

  const python = await firstExisting([
    path.join(workspaceRoot, 'tools', 'voice-lab', 'CosyVoice', '.venv', 'Scripts', 'python.exe'),
    path.join(workspaceRoot, 'tools', 'voice-lab', 'venv', 'Scripts', 'python.exe'),
  ]);
  const validationScript = path.join(workspaceRoot, 'tools', 'voice-lab', 'validate_alignment_and_export_srt.py');
  const validationPath = path.join(captionsRoot, 'alignment-validation.json');
  const subtitlePath = path.join(captionsRoot, 'narration.zh-CN.srt');

  await run(python, [
    validationScript,
    '--alignment', path.join(projectRoot, 'audio', 'alignment.json'),
    '--asr-alignment', path.join(projectRoot, 'audio', 'alignment.asr.json'),
    '--narration', narrationPath,
    '--narration-lock', path.join(projectRoot, 'NarrationLock.json'),
    '--audio', path.join(projectRoot, 'audio', 'narration.final.wav'),
    '--output-srt', subtitlePath,
    '--report', validationPath,
  ], {cwd: workspaceRoot, timeout: 10 * 60 * 1000, windowsHide: true, maxBuffer: 20 * 1024 * 1024});

  await run(process.execPath, [path.join(workspaceRoot, 'scripts', 'build-audio-qa.mjs'), projectId], {
    cwd: workspaceRoot,
    timeout: 30 * 60 * 1000,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });

  const [validation, audioQa] = await Promise.all([
    readJson('captions/alignment-validation.json'),
    readJson('audio/qa-report.json'),
  ]);
  if (validation.status !== 'passed' || audioQa.technicalApproval?.status !== 'passed') {
    throw new Error('Locked alignment or technical audio QA did not pass.');
  }

  console.log(JSON.stringify({
    ok: true,
    projectId,
    alignmentStatus: validation.status,
    words: validation.checks.wordTimeline.count,
    cues: validation.checks.cueTimeline.count,
    maximumCueCps: validation.checks.cueCps.maximumCps,
    audioDurationSeconds: audioQa.audio.durationSeconds,
    integratedLufs: audioQa.signal.integratedLufs,
    truePeakDbfs: audioQa.signal.truePeakDbfs,
    outputs: [
      'captions/alignment-validation.json',
      'captions/narration.zh-CN.srt',
      'audio/qa-report.json',
    ],
  }, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
