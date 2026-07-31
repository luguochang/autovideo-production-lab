import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.argv[2];
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/build-audio-qa.mjs <project-id>');
}
const projectRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);

const readJson = (relativePath) => fs.readFile(path.join(projectRoot, relativePath), 'utf8').then(JSON.parse);
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const numberFrom = (text, pattern) => {
  const matches = [...text.matchAll(pattern)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
};

const main = async () => {
  const [lock, recipe, alignment, validation, pronunciation] = await Promise.all([
    readJson('NarrationLock.json'),
    readJson('audio/voice.recipe.json'),
    readJson('audio/alignment.json'),
    readJson('captions/alignment-validation.json'),
    readJson('input/pronunciation.effective.json'),
  ]);
  const audioPath = path.join(projectRoot, 'audio', 'narration.final.wav');
  const audioSha256 = await sha256File(audioPath);
  const recipeMode = Array.isArray(recipe.parts) ? 'batch' : 'single';
  const recipeOutputSha256 = String(recipe.outputSha256 ?? recipe.output?.sha256 ?? '').toLowerCase();
  if (audioSha256 !== recipeOutputSha256 || alignment.sourceSha256 !== audioSha256) {
    throw new Error('Audio, recipe and alignment hashes do not match.');
  }
  if (lock.normalizedSha256 !== alignment.narrationSha256) {
    throw new Error('Audio recipe or alignment does not match NarrationLock.');
  }
  if (recipeMode === 'batch' && lock.normalizedSha256 !== recipe.narrationSha256) {
    throw new Error('Batch audio recipe does not match NarrationLock.');
  }
  if (recipeMode === 'single' && String(recipe.text_sha256 ?? '').toLowerCase() !== lock.sourceSha256) {
    throw new Error('Single-segment audio recipe text does not match the frozen narration source.');
  }

  const partResults = [];
  if (recipeMode === 'batch') {
    for (const part of recipe.parts) {
      const sourcePath = path.join(projectRoot, part.sourceTextPath);
      const ttsPath = path.join(projectRoot, part.ttsTextPath);
      const partAudioPath = path.join(projectRoot, part.audioPath);
      const receiptPath = path.join(projectRoot, part.receiptPath);
      const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
      const checks = {
        sourceText: (await sha256File(sourcePath)).toLowerCase() === part.sourceTextSha256.toLowerCase(),
        ttsText: (await sha256File(ttsPath)).toLowerCase() === part.ttsTextSha256.toLowerCase(),
        wav: (await sha256File(partAudioPath)).toLowerCase() === part.outputSha256.toLowerCase(),
        receiptText: String(receipt.text_sha256).toLowerCase() === part.ttsTextSha256.toLowerCase(),
        receiptOutput: String(receipt.output?.sha256).toLowerCase() === part.outputSha256.toLowerCase(),
        singleInternalUtterance: Number(receipt.frontend_preflight?.utterance_count) === 1
          && receipt.frontend_preflight?.policy === 'exactly-one-internal-utterance-required',
        singleOutputChunk: Number(receipt.output_chunks) === 1,
      };
      partResults.push({
        id: part.id,
        durationSeconds: part.durationSeconds,
        internalUtteranceCount: Number(receipt.frontend_preflight?.utterance_count),
        outputChunks: Number(receipt.output_chunks),
        checks,
      });
    }
  } else {
    const frozenNarrationPath = path.join(projectRoot, lock.frozenPath);
    const checks = {
      sourceText: (await sha256File(frozenNarrationPath)).toLowerCase() === lock.sourceSha256,
      wav: audioSha256 === recipeOutputSha256,
      receiptText: String(recipe.text_sha256).toLowerCase() === lock.sourceSha256,
      receiptOutput: String(recipe.output?.sha256).toLowerCase() === audioSha256,
    };
    partResults.push({
      id: recipe.segment_id || 'single',
      durationSeconds: Number(recipe.output?.duration_seconds),
      checks,
    });
  }
  const allPartChecks = partResults.every((part) => Object.values(part.checks).every(Boolean));
  if (!allPartChecks) throw new Error('One or more CosyVoice part hashes failed validation.');
  let batchManifestHashValid = true;
  if (recipeMode === 'batch') {
    const batchManifestPath = path.join(projectRoot, recipe.batch.manifestPath);
    batchManifestHashValid = (await sha256File(batchManifestPath)).toLowerCase() === recipe.batch.manifestSha256.toLowerCase();
    if (!batchManifestHashValid) throw new Error('CosyVoice batch manifest hash mismatch.');
  }
  let mergeValidation = {mode: 'single-part', valid: recipeMode === 'single' || partResults.length === 1, gaps: []};
  if (recipeMode === 'batch' && partResults.length > 1) {
    if (recipe.merge?.schemaVersion !== 'autovideo-breath-merge/v1') {
      throw new Error('Multi-part narration is missing the breath-aware merge receipt.');
    }
    const mergeManifestPath = path.join(projectRoot, recipe.merge.manifestPath);
    const mergeReceiptPath = path.join(projectRoot, recipe.merge.receiptPath);
    const [mergeManifestSha256, mergeReceiptSha256, mergeReceipt] = await Promise.all([
      sha256File(mergeManifestPath),
      sha256File(mergeReceiptPath),
      fs.readFile(mergeReceiptPath, 'utf8').then(JSON.parse),
    ]);
    const gaps = mergeReceipt.gaps ?? [];
    const gapPolicyValid = gaps.length === partResults.length - 1
      && gaps.every((gap) => Number(gap.actualActiveVoiceGapSeconds) >= 0.42
        && Number(gap.actualActiveVoiceGapSeconds) <= 0.65
        && Math.abs(Number(gap.actualActiveVoiceGapSeconds) - Number(gap.targetActiveVoiceGapSeconds)) <= 0.002);
    const valid = mergeManifestSha256 === String(recipe.merge.manifestSha256).toLowerCase()
      && mergeReceiptSha256 === String(recipe.merge.receiptSha256).toLowerCase()
      && String(mergeReceipt.output?.sha256).toLowerCase() === audioSha256
      && gapPolicyValid;
    if (!valid) throw new Error('Breath-aware merge receipt, output hash, or active-voice gaps are invalid.');
    mergeValidation = {
      mode: 'breath-aware',
      valid,
      manifestSha256: mergeManifestSha256,
      receiptSha256: mergeReceiptSha256,
      targetActiveVoiceGapSeconds: recipe.merge.targetActiveVoiceGapSeconds,
      gaps,
    };
  }

  const {stdout: probeStdout} = await run('ffprobe.exe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', audioPath,
  ], {cwd: root, timeout: 60_000, windowsHide: true});
  const ffprobe = JSON.parse(probeStdout);
  const audioStream = ffprobe.streams.find((stream) => stream.codec_type === 'audio');
  if (!audioStream || audioStream.codec_name !== 'pcm_s16le' || Number(audioStream.sample_rate) !== 48000 || Number(audioStream.channels) !== 1) {
    throw new Error('Final narration must remain 48kHz mono PCM s16le.');
  }
  const ffmpegOptions = {
    cwd: root,
    timeout: 10 * 60 * 1000,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  };
  await run('ffmpeg.exe', ['-v', 'error', '-i', audioPath, '-f', 'null', 'NUL'], ffmpegOptions);
  const [{stderr: loudnessLog}, {stderr: volumeLog}, {stderr: silenceLog}, {stderr: onsetLog}] = await Promise.all([
    run('ffmpeg.exe', ['-hide_banner', '-i', audioPath, '-filter_complex', 'ebur128=peak=true:framelog=verbose', '-f', 'null', 'NUL'], ffmpegOptions),
    run('ffmpeg.exe', ['-hide_banner', '-i', audioPath, '-af', 'volumedetect', '-f', 'null', 'NUL'], ffmpegOptions),
    run('ffmpeg.exe', ['-hide_banner', '-i', audioPath, '-af', 'silencedetect=noise=-50dB:d=0.8', '-f', 'null', 'NUL'], ffmpegOptions),
    run('ffmpeg.exe', ['-hide_banner', '-t', '2', '-i', audioPath, '-af', 'silencedetect=noise=-38dB:d=0.05', '-f', 'null', 'NUL'], {...ffmpegOptions, timeout: 60_000}),
  ]);
  const silenceSegments = [...silenceLog.matchAll(/silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match) => ({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])}));
  const durations = partResults.map((part) => part.durationSeconds);
  const leadingSilenceMatch = onsetLog.match(/silence_start:\s*0(?:\.0+)?[\s\S]*?silence_end:\s*([\d.]+)/);
  const leadingSilenceSeconds = leadingSilenceMatch ? Number(leadingSilenceMatch[1]) : 0;
  const introCueMetrics = alignment.cues
    .filter((cue) => Number(cue.start) < 15)
    .map((cue) => {
      const durationSeconds = Number(cue.end) - Number(cue.start);
      const characters = [...String(cue.text)].length;
      return {cueId: cue.id, durationSeconds, characters, cps: Number((characters / durationSeconds).toFixed(2))};
    });
  const fastIntroCues = introCueMetrics.filter((cue) => cue.cps > 7.5).map((cue) => cue.cueId);
  const pacingWarnings = [];
  if (leadingSilenceSeconds < 0.25) pacingWarnings.push('cold-open-has-less-than-250ms-leading-silence');
  if (fastIntroCues.length) pacingWarnings.push(`intro-cues-over-7.5-cps:${fastIntroCues.join(',')}`);
  const report = {
    schemaVersion: 'autovideo-audio-qa/v1',
    projectId,
    scope: 'internal-production-technical-approval',
    checkedAt: new Date().toISOString(),
    narrationSha256: lock.normalizedSha256,
    audio: {
      path: 'audio/narration.final.wav',
      sha256: audioSha256,
      durationSeconds: Number(ffprobe.format.duration),
      codec: audioStream.codec_name,
      sampleRate: Number(audioStream.sample_rate),
      channels: Number(audioStream.channels),
      bitsPerSample: Number(audioStream.bits_per_sample),
    },
    segmentation: {
      recipeMode,
      parts: partResults.length,
      minimumDurationSeconds: Math.min(...durations),
      maximumDurationSeconds: Math.max(...durations),
      singleModelLoad: recipeMode === 'single' || recipe.batch.singleModelLoad === true,
      seed: recipe.seed,
      sourceReconstructionMatchesNarrationLock: true,
      allPartHashesValid: allPartChecks,
      allPartsSingleInternalUtterance: partResults.every((part) => part.internalUtteranceCount === 1),
      allPartsSingleOutputChunk: partResults.every((part) => part.outputChunks === 1),
      batchManifestHashValid,
      merge: mergeValidation,
    },
    signal: {
      fullDecodePassed: true,
      integratedLufs: numberFrom(loudnessLog, /I:\s*(-?[\d.]+)\s*LUFS/g),
      truePeakDbfs: numberFrom(loudnessLog, /Peak:\s*(-?[\d.]+)\s*dBFS/g),
      meanVolumeDb: numberFrom(volumeLog, /mean_volume:\s*(-?[\d.]+)\s*dB/g),
      maxVolumeDb: numberFrom(volumeLog, /max_volume:\s*(-?[\d.]+)\s*dB/g),
      silenceSegmentsOver0_8Seconds: silenceSegments.length,
      silenceSegments,
    },
    pacing: {
      status: pacingWarnings.length ? 'needs-human-review' : 'passed-technical-targets',
      leadingSilenceSeconds,
      recommendedLeadingSilenceSeconds: {minimum: 0.25, target: 0.35},
      introWindowSeconds: 15,
      recommendedIntroMaximumCps: 7.5,
      introCueMetrics,
      fastIntroCues,
      warnings: pacingWarnings,
      remediation: 'If listening confirms a rushed opening, regenerate the affected CosyVoice part with punctuation/pause tuning, then rebuild final WAV, alignment, captions, planning, motion and renders.',
    },
    alignment: {
      status: validation.status === 'passed' ? 'passed-for-internal-subtitle-and-motion-timing' : 'failed',
      path: 'audio/alignment.json',
      sha256: await sha256File(path.join(projectRoot, 'audio', 'alignment.json')),
      asrEvidencePath: 'audio/alignment.asr.json',
      asrEvidenceSha256: await sha256File(path.join(projectRoot, 'audio', 'alignment.asr.json')),
      validationReport: 'captions/alignment-validation.json',
      validationReportSha256: await sha256File(path.join(projectRoot, 'captions', 'alignment-validation.json')),
      hashesBound: validation.checks.hashesBound,
      wordTimelineMonotonic: validation.checks.wordTimeline.monotonic,
      cueTimelineMonotonic: validation.checks.cueTimeline.monotonic,
      cueCount: validation.checks.cueTimeline.count,
      cueTextReconstructsNarrationLock: validation.checks.cueTextReconstructsNarrationLock,
      maximumCueCps: validation.checks.cueCps.maximumCps,
      maximumCueCpsThreshold: validation.checks.cueCps.thresholdCps,
      rawAsrTranscriptPolicy: 'evidence-only; downstream consumers must use alignment.cues',
      limitation: alignment.limitation,
    },
    subtitles: {
      status: 'generated-for-internal-review',
      path: 'captions/narration.zh-CN.srt',
      sha256: await sha256File(path.join(projectRoot, 'captions', 'narration.zh-CN.srt')),
      cueCount: alignment.cues.length,
      textSource: 'alignment.cues (NarrationLock exact text)',
      humanReviewRequiredBeforePublicRelease: true,
    },
    pronunciation: {
      autoApplied: pronunciation.entries.filter((entry) => entry.status === 'approved-default').map((entry) => entry.token),
      requiresListeningReview: pronunciation.entries.filter((entry) => entry.status !== 'approved-default').map((entry) => entry.token),
    },
    humanListening: {status: 'not-performed', requiredBeforePublicRelease: true},
    technicalApproval: {
      status: 'passed',
      approvedFor: 'internal composition, alignment, probe and review render',
      publicReleaseApproved: false,
      pacingReviewRequired: pacingWarnings.length > 0,
    },
  };
  if (validation.status !== 'passed') throw new Error('Alignment validation did not pass.');
  await fs.writeFile(path.join(projectRoot, 'audio', 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ok: true, projectId, durationSeconds: report.audio.durationSeconds, parts: report.segmentation.parts, cueCount: report.alignment.cueCount, integratedLufs: report.signal.integratedLufs, truePeakDbfs: report.signal.truePeakDbfs, pacing: report.pacing.status, pacingWarnings: report.pacing.warnings}, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
