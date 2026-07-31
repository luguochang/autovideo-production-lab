#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const projectsRoot = path.join(workspaceRoot, 'hyperframes-workflow-kit', 'projects');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const portable = (value) => value.replaceAll('\\', '/');
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const parseArgs = (values) => {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) throw new Error(`Invalid argument near ${key}.`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const safeProjectRoot = (projectId) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId ?? '')) throw new Error('Invalid project id.');
  const projectRoot = path.resolve(projectsRoot, projectId);
  if (!projectRoot.startsWith(`${projectsRoot}${path.sep}`)) throw new Error('Project path escaped the projects root.');
  return projectRoot;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args.project;
  const qaLabel = args['file-qa-label'] || 'one-screen-mvp-file-qa';
  if (!projectId) throw new Error('Usage: node scripts/finalize-one-screen-mvp.mjs --project <id> [--file-qa-label <label>]');

  const projectRoot = safeProjectRoot(projectId);
  const compositionRoot = path.join(projectRoot, 'production', 'hyperframes');
  const buildPath = path.join(compositionRoot, 'data', 'composition-build.json');
  const checkPath = path.join(projectRoot, 'qa', 'hyperframes-check.json');
  const fileQaPath = path.join(projectRoot, 'qa', `${qaLabel}.json`);
  const [build, check, fileQa] = await Promise.all([
    readJson(buildPath),
    readJson(checkPath),
    readJson(fileQaPath),
  ]);

  if (build.continuity?.mode !== 'one-screen-master-board') throw new Error('Current build is not a one-screen master board.');
  if (Number(build.continuity?.oneScreenStepCount) < 1 || Number(build.continuity?.oneScreenStepCount) > 6) {
    throw new Error('One-screen MVP must contain 1-6 visual steps.');
  }
  if (check.ok !== true || check.strict !== true) throw new Error('Current HyperFrames strict check did not pass.');
  if (check.autoVideo?.buildReceiptSha256 !== await sha256File(buildPath)) throw new Error('HyperFrames check is stale for the current build.');
  if (fileQa.status !== 'passed' || fileQa.humanReviewPerformed !== false) throw new Error('Current file-only media QA did not pass.');

  const videoPath = path.resolve(projectRoot, fileQa.source.path);
  if (!videoPath.startsWith(`${projectRoot}${path.sep}`)) throw new Error('QA video path escaped the project root.');
  if (await sha256File(videoPath) !== fileQa.source.sha256) throw new Error('Rendered video changed after file QA.');

  const snapshotsRoot = path.join(compositionRoot, 'snapshots');
  const snapshots = (await fs.readdir(snapshotsRoot))
    .filter((name) => /^frame-\d+.*\.png$/i.test(name))
    .sort();
  if (!snapshots.length) throw new Error('HyperFrames snapshots are missing.');
  const finalSnapshotPath = path.join(snapshotsRoot, snapshots.at(-1));
  const storyboardPath = path.join(projectRoot, 'review', 'one-screen-master-storyboard.png');
  const coverPath = path.join(projectRoot, 'renders', `${projectId}-cover.png`);
  await fs.mkdir(path.dirname(storyboardPath), {recursive: true});
  await fs.mkdir(path.dirname(coverPath), {recursive: true});
  await Promise.all([
    fs.copyFile(finalSnapshotPath, storyboardPath),
    fs.copyFile(finalSnapshotPath, coverPath),
  ]);

  const [buildSha256, checkSha256, fileQaSha256, videoSha256, storyboardSha256, coverSha256] = await Promise.all([
    sha256File(buildPath),
    sha256File(checkPath),
    sha256File(fileQaPath),
    sha256File(videoPath),
    sha256File(storyboardPath),
    sha256File(coverPath),
  ]);
  const generatedAt = new Date().toISOString();
  const renderReceiptPath = path.join(projectRoot, 'renders', `${projectId}-internal-review.receipt.json`);
  const renderReceipt = {
    schemaVersion: 'autovideo-internal-review-render/v1',
    projectId,
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    generatedAt,
    generatedBy: 'scripts/finalize-one-screen-mvp.mjs',
    video: {
      path: portable(path.relative(projectRoot, videoPath)),
      sha256: videoSha256,
      bytes: fileQa.source.bytes,
      durationSeconds: fileQa.media.durationSeconds,
      videoCodec: fileQa.media.videoCodec,
      audioCodec: fileQa.media.audioCodec,
      width: fileQa.media.width,
      height: fileQa.media.height,
      fps: fileQa.media.fps,
      frameCount: fileQa.media.frameCount,
      fullDecodePassed: fileQa.checks?.fullDecode === 'passed',
    },
    cover: {path: portable(path.relative(projectRoot, coverPath)), sha256: coverSha256},
    hyperframes: {
      version: check.autoVideo?.hyperframesVersion ?? null,
      checkReceipt: portable(path.relative(projectRoot, checkPath)),
      strictCheckPassed: true,
    },
    sourceBindings: {
      build: {path: portable(path.relative(projectRoot, buildPath)), sha256: buildSha256},
      fileQa: {path: portable(path.relative(projectRoot, fileQaPath)), sha256: fileQaSha256},
      storyboard: {path: portable(path.relative(projectRoot, storyboardPath)), sha256: storyboardSha256},
    },
    review: {
      machineMediaQa: 'passed',
      humanListening: 'pending',
      studioFinalReview: 'pending',
      publicationRights: 'pending',
    },
    notes: 'Internal review artifact only. No human listening, human approval, or public-release clearance is claimed.',
  };
  await fs.writeFile(renderReceiptPath, stableJson(renderReceipt), 'utf8');
  const renderReceiptSha256 = await sha256File(renderReceiptPath);

  const reportPath = path.join(projectRoot, 'qa', 'one-screen-mvp-report.json');
  const report = {
    schemaVersion: 'autovideo-one-screen-mvp-qa/v1',
    projectId,
    generatedAt,
    status: 'passed',
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    humanReviewPerformed: false,
    safety: {microphoneUsed: false, playbackUsed: false, soundOutputUsed: false},
    checks: {
      oneScreenContract: {
        status: 'passed',
        mode: build.continuity.mode,
        stepCount: build.continuity.oneScreenStepCount,
        fixedHostPose: build.continuity.fixedHostPose,
        transition: build.continuity.transition,
      },
      hyperframesStrict: {
        status: 'passed',
        version: check.autoVideo?.hyperframesVersion ?? null,
        lintErrors: check.lint?.errorCount ?? null,
        runtimeErrors: check.runtime?.errorCount ?? null,
        layoutErrors: check.layout?.errorCount ?? null,
        motionErrors: check.motion?.errorCount ?? null,
        contrastErrors: check.contrast?.errorCount ?? null,
        motionSamples: check.motion?.samples ?? null,
      },
      fileMediaQa: {
        status: 'passed',
        fullDecode: fileQa.checks?.fullDecode,
        blockingBlackFrameRuns: fileQa.checks?.blackFrames?.blockingRuns?.length ?? null,
        loudness: fileQa.checks?.loudness,
      },
      snapshotEvidence: {
        status: 'passed',
        snapshotCount: snapshots.length,
        finalSnapshot: portable(path.relative(projectRoot, finalSnapshotPath)),
        masterStoryboard: portable(path.relative(projectRoot, storyboardPath)),
      },
    },
    bindings: {
      build: {path: portable(path.relative(projectRoot, buildPath)), sha256: buildSha256},
      hyperframesCheck: {path: portable(path.relative(projectRoot, checkPath)), sha256: checkSha256},
      fileQa: {path: portable(path.relative(projectRoot, fileQaPath)), sha256: fileQaSha256},
      video: {path: portable(path.relative(projectRoot, videoPath)), sha256: videoSha256},
      storyboard: {path: portable(path.relative(projectRoot, storyboardPath)), sha256: storyboardSha256},
      renderReceipt: {path: portable(path.relative(projectRoot, renderReceiptPath)), sha256: renderReceiptSha256},
    },
    blockers: [],
    pendingHumanReview: ['full-timeline listening', 'full-picture acceptance'],
    notes: 'Machine self-test passed. This receipt deliberately does not claim human listening or final acceptance.',
  };
  await fs.writeFile(reportPath, stableJson(report), 'utf8');
  const reportSha256 = await sha256File(reportPath);
  const reviewRequestPath = path.join(projectRoot, 'review', 'one-screen-review-request.json');
  const reviewRequest = {
    schemaVersion: 'autovideo-one-screen-review-request/v1',
    projectId,
    generatedAt,
    status: 'ready-for-human-review',
    humanReviewPerformed: false,
    publicReleaseBlocked: true,
    requiredReview: ['full-timeline listening', 'full-picture acceptance'],
    bindings: {
      video: report.bindings.video,
      storyboard: report.bindings.storyboard,
      qa: {path: portable(path.relative(projectRoot, reportPath)), sha256: reportSha256},
    },
    notes: 'Pending user review. This request is not an approval receipt.',
  };
  await fs.writeFile(reviewRequestPath, stableJson(reviewRequest), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    status: report.status,
    video: report.bindings.video,
    storyboard: report.bindings.storyboard,
    qaReport: portable(path.relative(workspaceRoot, reportPath)),
    reviewRequest: portable(path.relative(workspaceRoot, reviewRequestPath)),
    renderReceipt: portable(path.relative(workspaceRoot, renderReceiptPath)),
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
