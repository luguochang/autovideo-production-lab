# AutoVideo V2 Runbook

## New Script Route

```powershell
npm.cmd run video:new -- --id <project-id> --narration <approved.txt> --ratio 16:9 --duration <estimate>s --platform <platform>
npm.cmd run video:apply-template -- --project <project-id> --style modern-ip-host-explainer --palette light-apricot
npm.cmd run video:prepare-inputs -- --project <project-id>
```

Continue from the workbench at `http://127.0.0.1:3339/`. Run one permitted stage at a time. Review or edit the artifact, approve it, and regenerate stale downstream stages.

## Reusable Technical Commands

```powershell
python scripts/build-host-pose-assets.py --project <project-id>
python tools/voice-lab/validate_alignment_and_export_srt.py --alignment <project>/audio/alignment.json --asr-alignment <project>/audio/alignment.asr.json --narration <project>/input/narration.txt --narration-lock <project>/NarrationLock.json --audio <project>/audio/narration.final.wav --output-srt <project>/captions/narration.zh-CN.srt --report <project>/captions/alignment-validation.json
node scripts/build-audio-qa.mjs <project-id>
npm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/<project-id>
npx.cmd --yes hyperframes@0.7.62 check hyperframes-workflow-kit/projects/<project-id>/production/hyperframes --strict --json
npm.cmd run video:sop-status -- --project <project-id>
```

## Project-Specific Fallbacks

`scripts/prepare-planning-fallback.mjs` and `scripts/prepare-style-probe.mjs` are valid for this unchanged DemoText narration family only. A different script must generate its own semantic planning and same-window probe; do not reuse these content-specific outputs silently.

## Human Listening

Use the workbench audio review panel. Play the whole track, then inspect segments and every unresolved pronunciation. Approval writes hash-bound receipts without regenerating unchanged audio or timing artifacts.

## Final Review

Open HyperFrames Studio from the workbench, select `index.html`, review the full 239.3-second timeline, record issues by scene/cue, and approve only after the current composition digest matches the review receipt.
