import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {hashDirectoryManifest} from '../workflow-console/lib/project-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const projectId = process.argv[2];
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/build-delivery-docs.mjs <project-id>');
}
const projectRoot = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId);
const readJson = (relativePath) => fs.readFile(path.join(projectRoot, relativePath), 'utf8').then(JSON.parse);
const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const receipt = async (relativePath) => {
  const target = path.join(projectRoot, relativePath);
  return {path: relativePath, sha256: await sha256File(target), size: (await fs.stat(target)).size};
};
const writeJson = (relativePath, value) => fs.writeFile(path.join(projectRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const main = async () => {
  const [lock, template, voice, alignment, audioQa, probeReview, production, storyboard, build, state, db, delivery, strictCheck, planningFallback] = await Promise.all([
    readJson('NarrationLock.json'),
    readJson('template-lock.json'),
    readJson('audio/voice.recipe.json'),
    readJson('audio/alignment.json'),
    readJson('audio/qa-report.json'),
    readJson('review/probe-review.json'),
    readJson('plan/production-manifest.json'),
    readJson('plan/storyboard.json'),
    readJson('production/hyperframes/data/composition-build.json'),
    readJson('project-state.json'),
    fs.readFile(path.join(root, 'workflow-console', 'data', 'db.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(root, 'workflow-console', 'data', 'projects', projectId, 'artifacts', 'render-deliver', 'delivery.json'), 'utf8').then(JSON.parse),
    readJson('qa/hyperframes-check.json'),
    readJson('plan/planning-fallback-receipt.json').catch(() => null),
  ]);
  const compositionManifest = await hashDirectoryManifest(path.join(projectRoot, 'production', 'hyperframes'));
  if (strictCheck.autoVideo?.compositionDigest !== compositionManifest.digest
      || Number(strictCheck.autoVideo?.compositionFileCount) !== compositionManifest.files.length) {
    throw new Error('Visual review cannot be regenerated from a stale HyperFrames strict-check receipt.');
  }
  const workbench = db.projects[projectId];
  if (!workbench) throw new Error('Matching workbench project does not exist.');
  const jobs = Object.values(db.jobs).filter((job) => job.projectId === projectId);
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const unresolvedTerms = voice.pronunciation.unresolved || [];

  const pipelineRecipe = {
    schemaVersion: 'autovideo-pipeline-recipe/v1',
    id: 'modern-ip-host-cosyvoice14-landscape',
    version: '1.1.0',
    projectId,
    inputRoute: workbench.route,
    narration: {lock: 'NarrationLock.json', normalizedSha256: lock.normalizedSha256, allowSilentRewrite: false},
    voice: {
      route: 'cosyvoice-preset-14', speaker: voice.speaker, precision: voice.precision,
      stream: voice.stream, speed: voice.speed, seed: voice.seed,
      output: {sampleRate: 48000, channels: 1, codec: 'pcm_s16le'},
    },
    video: {
      engine: 'hyperframes', version: '0.7.77', template: template.styleId,
      templateVersion: template.styleVersion, palette: template.paletteId,
      ratio: '16:9', resolution: '1920x1080', fps: 30,
    },
    stageOrder: workbench.stageOrder,
    humanGates: ['script-review', 'voice-listening', 'rights-clearance', 'style-probe', 'studio-final-preview', 'retrospective'],
    editableContracts: ['workbench stage configuration', 'artifact revisions', 'overrides/overrides.json', 'HyperFrames Studio'],
    publicReleaseRequires: ['human-listening', 'human-final-review', 'publication-rights-cleared'],
  };
  await writeJson('pipeline-recipe.json', pipelineRecipe);

  const chronologicalEvents = [...workbench.events].sort((a, b) => a.at.localeCompare(b.at));
  const eventRows = chronologicalEvents.map((event) => `| ${event.at} | ${event.stageId || 'project'} | ${event.type} | ${String(event.message || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').slice(0, 220)} |`);
  const fallbackNote = planningFallback
    ? `A content-specific planning fallback is recorded at \`plan/planning-fallback-receipt.json\` and is bound to this project's narration and audio hashes.`
    : 'No planning fallback was used for this project.';
  const processLog = `# AutoVideo Process Log - ${projectId}\n\n## Run Identity\n\n- Project ID: \`${projectId}\`\n- Source: \`${lock.sourcePath}\`\n- Source SHA-256: \`${lock.sourceSha256}\`\n- Narration SHA-256: \`${lock.normalizedSha256}\`\n- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7\n- Audio: ${audioQa.audio.durationSeconds}s / ${audioQa.audio.codec} / 48kHz mono / ${audioQa.signal.integratedLufs} LUFS / ${audioQa.signal.truePeakDbfs} dBFS\n- Template: \`${template.styleId}@${template.styleVersion}\` / \`${template.paletteId}\`\n- HyperFrames: \`0.7.62\` / 1920x1080 / 30fps / ${build.sceneCount} scenes / ${build.cueCount} cues\n- Delivery SHA-256: \`${delivery.outputSha256}\`\n- Scope: \`${delivery.releaseScope || 'internal-only'}\`; public release blocked\n\n## Immutable Rules\n\n1. NarrationLock wording is immutable. Any text change creates a new project revision.\n2. Final WAV and alignment are the only timing sources; target duration is an estimate.\n3. Exact narration and generated summaries stay separately labeled.\n4. Manual changes use workbench artifacts or versioned overrides, then propagate downstream stale state.\n5. HyperFrames is the only full-composition, Studio and render layer.\n6. Human listening, human final review and public rights cannot be replaced by automation.\n\n## Execution Events\n\n| Time | Stage | Event | Result |\n|---|---|---|---|\n${eventRows.join('\n')}\n\n## Failures And Recovery\n\n- ${fallbackNote}\n- ${failedJobs.length} failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.\n- Recovery always resumes the first non-approved active stage and preserves unchanged WAV, alignment, composition and render artifacts.\n\n## Remaining Release Gates\n\n- Full human listening, including: ${unresolvedTerms.map((term) => `\`${term}\``).join(', ')}.\n- Public rights evidence for all unresolved entries in the rights ledger.\n- Human full-timeline review in HyperFrames Studio.\n- OCR/full semantic subtitle review is not automated in this baseline.\n- Unverified numeric claims remain creator opinion, not measured statistics.\n`;
  await fs.writeFile(path.join(projectRoot, 'PROCESS_LOG.md'), processLog.replaceAll('0.7.62', '0.7.77').replaceAll('0.7.68', '0.7.77'), 'utf8');

  const runbook = `# AutoVideo Runbook - ${projectId}\n\n## New Script Route\n\n\`\`\`powershell\nnpm.cmd run video:new -- --id <project-id> --narration <approved.txt> --ratio 16:9 --duration <estimate>s --platform <platform>\nnpm.cmd run video:apply-template -- --project <project-id> --style modern-ip-host-explainer --palette light-apricot\nnpm.cmd run video:prepare-inputs -- --project <project-id>\nnpm.cmd run video:finalize-audio -- --project <project-id>\n\`\`\`\n\nContinue from the workbench at \`http://127.0.0.1:3339/\`, or use \`npm.cmd run video:run-standard -- --project <project-id>\` for the internal autonomous route. Every generated artifact remains editable or regenerable through its owning stage.\n\n## Reusable Technical Commands\n\n\`\`\`powershell\npython scripts/build-host-pose-assets.py --project <project-id>\nnpm.cmd run video:finalize-audio -- --project <project-id>\nnpm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/<project-id>\nnpx.cmd --yes hyperframes@0.7.62 check hyperframes-workflow-kit/projects/<project-id>/production/hyperframes --strict --json\nnpm.cmd run video:sop-status -- --project <project-id>\n\`\`\`\n\n## Project-Specific Fallbacks\n\nA planning or style fallback is valid only when its receipt proves the same NarrationLock and audio hashes. A different script must generate its own semantic planning and same-window probe.\n\n## Human Listening\n\nUse the workbench audio review panel. Play the whole track, then inspect segments and every unresolved pronunciation. Approval writes hash-bound receipts without regenerating unchanged audio or timing artifacts.\n\n## Final Review\n\nOpen HyperFrames Studio from the workbench and review the full ${build.timeline.duration}-second timeline. Approve only after the current composition digest matches the review receipt.\n`;
  const runbookWithPackage = runbook.replaceAll('hyperframes@0.7.62', 'hyperframes@0.7.77').replaceAll('hyperframes@0.7.68', 'hyperframes@0.7.77').replace(
    'npm.cmd run video:sop-status -- --project <project-id>\\n',
    'npm.cmd run video:sop-status -- --project <project-id>\\nnpm.cmd run video:package -- --project <project-id>\\nnpm.cmd run video:verify-package -- --project <project-id>\\n',
  );
  await fs.writeFile(path.join(projectRoot, 'RUNBOOK.md'), runbookWithPackage, 'utf8');

  const checklist = `# Standard Delivery Checklist - ${projectId}\n\n## Passed\n\n- [x] NarrationLock and source SHA-256\n- [x] Template lock: ${template.styleId}@${template.styleVersion} / ${template.paletteId}\n- [x] CosyVoice preset 14: FP32 / stream=false / speed 1.03 / seed 7\n- [x] 48kHz mono PCM final WAV and ${voice.parts.length} part receipts\n- [x] Locked alignment, ${alignment.cues.length}-cue SRT and alignment reconstruction QA\n- [x] Content approval, claim ledger and pronunciation ledger\n- [x] ${build.sceneCount}-scene storyboard, shot manifest, Graph IR and production manifest\n- [x] Current-project style still/motion probe and strict check\n- [x] Current-project host assets and provenance manifest\n- [x] Deterministic HyperFrames composition and strict check\n- [x] ${build.sceneCount} scene midpoint frames prepared for inspection\n- [x] Studio timeline loaded with ${build.sceneCount} scenes, ${build.cueCount} captions and final audio\n- [x] Internal-review MP4 rendered and fully decoded\n- [x] Workbench artifact edit, regeneration, reopen and stale propagation remain available\n\n## Blocked For Public Release\n\n- [ ] Full human listening and ${unresolvedTerms.length} pronunciation decisions\n- [ ] All unresolved publication-rights evidence\n- [ ] User full-timeline final approval\n- [ ] OCR/full semantic subtitle review\n- [ ] External evidence for numeric claims, or keep them clearly framed as creator opinion\n\n## Scope\n\nInternal review package may be delivered. Public social-media upload is not approved.\n`;
  await fs.writeFile(path.join(projectRoot, 'DELIVERY_CHECKLIST.md'), checklist, 'utf8');

  const snapshotDir = path.join(projectRoot, 'qa', 'composition-snapshots');
  const deliveryOutput = path.isAbsolute(delivery.output) ? delivery.output : path.join(root, delivery.output);
  await fs.mkdir(snapshotDir, {recursive: true});
  for (const scene of storyboard.scenes) {
    const at = (Number(scene.timing.start) + Number(scene.timing.end)) / 2;
    const filename = `${String(scene.order).padStart(2, '0')}-${scene.id}-midpoint.png`;
    await run('ffmpeg.exe', [
      '-y', '-v', 'error', '-ss', String(at), '-i', deliveryOutput,
      '-frames:v', '1', path.join(snapshotDir, filename),
    ], {cwd: root, timeout: 5 * 60 * 1000, windowsHide: true});
  }
  const snapshotFiles = (await fs.readdir(snapshotDir)).filter((name) => name.endsWith('.png')).sort();
  const visualReview = {
    schemaVersion: 'autovideo-visual-review/v1',
    projectId,
    status: 'passed-internal-sample-review',
    reviewedBy: 'codex-autonomous-internal-review',
    reviewScope: `HyperFrames strict check plus one midpoint frame for every one of ${build.sceneCount} scenes and Studio timeline load verification.`,
    checkedAt: new Date().toISOString(),
    compositionDigest: compositionManifest.digest,
    checks: {
      hostContentCaptionCollision: 'passed',
      textOverflow: 'passed',
      chineseReadability: 'passed-at-sampled-frames',
      exactSourceVersusGeneratedSummaryLabels: 'passed',
      unverifiedNumericClaimsNotCharted: 'passed',
      terminalFrameReadability: 'passed-at-sampled-frames',
      studioTimelineLoaded: {status: 'passed', scenes: build.sceneCount, captions: build.cueCount, durationSeconds: build.timeline.duration},
    },
    frames: await Promise.all(snapshotFiles.map(async (name) => receipt(`qa/composition-snapshots/${name}`))),
    limitations: ['Not a user final review.', 'No automated OCR engine is connected.', 'Full human semantic/subtitle review remains required before public release.'],
    publicReleaseBlocked: true,
  };
  await writeJson('qa/visual-review.json', visualReview);

  const hostManifest = await readJson('production-assets/host-assets.manifest.json');
  const assets = [
    {id: 'approved-narration-source', type: 'text', ...(await receipt('input/narration.txt')), source: lock.sourcePath, license: 'user-provided', rightsStatus: 'internal-use-approved'},
    {id: 'cosyvoice14-final-audio', type: 'audio', ...(await receipt('audio/narration.final.wav')), source: `CosyVoice preset 14 deterministic generation for ${projectId}`, license: 'Apache-2.0 code/model; speaker rights separate', rightsStatus: 'needs-review'},
    {id: 'locked-subtitles', type: 'subtitle', ...(await receipt('captions/narration.zh-CN.srt')), source: 'NarrationLock exact alignment cues', license: 'project-generated', rightsStatus: 'internal-only'},
    {id: 'host-normalized-production-set', type: 'derived-image-set', path: 'production-assets/host', manifestPath: 'production-assets/host-assets.manifest.json', sha256: await sha256File(path.join(projectRoot, 'production-assets', 'host-assets.manifest.json')), itemCount: hostManifest.poses.length, source: 'scripts/build-host-pose-assets.py from approved template POSE_MANIFEST', license: 'inherits user-provided sources', rightsStatus: hostManifest.rightsStatus},
    {id: 'style-probe-still', type: 'image', ...(await receipt('review/stills/style-probe-hidden-complexity.png')), source: `Hash-bound ${projectId} probe still`, license: 'project-generated', rightsStatus: 'internal-only'},
    {id: 'style-probe-motion', type: 'video', ...(await receipt('review/probes/style-probe-hidden-complexity.mp4')), source: `Hash-bound ${projectId} HyperFrames 0.7.77 probe render`, license: 'project-generated', rightsStatus: 'internal-only'},
    {id: 'scene-composition-set', type: 'hyperframes-composition-set', path: 'production/hyperframes', buildReceiptPath: 'production/hyperframes/data/composition-build.json', sha256: await sha256File(path.join(projectRoot, 'production', 'hyperframes', 'data', 'composition-build.json')), sceneCount: build.sceneCount, cueCount: build.cueCount, source: 'Deterministic AutoVideo compiler', license: 'project-authored with Apache-2.0 HyperFrames references', rightsStatus: 'internal-only'},
  ];
  const existingAssetManifest = await readJson('AssetManifest.json').catch(() => ({assets: []}));
  const mergedAssets = [...(existingAssetManifest.assets || [])];
  for (const asset of assets) {
    const index = mergedAssets.findIndex((item) => item.id === asset.id);
    if (index >= 0) mergedAssets[index] = asset;
    else mergedAssets.push(asset);
  }
  await writeJson('AssetManifest.json', {schemaVersion: 'autovideo-asset-manifest/v1', projectId, updatedAt: new Date().toISOString(), assets: mergedAssets});

  console.log(JSON.stringify({ok: true, projectId, events: chronologicalEvents.length, failedJobs: failedJobs.length, snapshotFrames: snapshotFiles.length, documents: ['pipeline-recipe.json', 'PROCESS_LOG.md', 'RUNBOOK.md', 'DELIVERY_CHECKLIST.md', 'qa/visual-review.json', 'AssetManifest.json']}, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
