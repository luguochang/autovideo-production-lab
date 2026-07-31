# DemoText Standard Delivery V1 Runbook

- Global SOP: `docs/10-讲解视频规模化SOP.md`
- Execution runbook: `docs/12-AutoVideo标准生产Runbook.md`
- Voice handoff: `hyperframes-workflow-kit/VOICE_HANDOFF.md`
- Video handoff: `hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md`
- Formal project: `hyperframes-workflow-kit/projects/demotext-standard-delivery-v1`

## Replay

```powershell
npm.cmd run video:status -- --project demotext-standard-delivery-v1
npm.cmd run video:template-status -- --project demotext-standard-delivery-v1
npm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/demotext-standard-delivery-v1
npm.cmd run video:sop-status -- --project demotext-standard-delivery-v1
```

The workbench is the control surface for generation, editing, regeneration, approval and stale propagation. HyperFrames Studio is the final composition review surface. This project is approved only for internal autonomous review; public release remains blocked until human listening and rights clearance are complete.

## Human Listening Gate

Use the workbench audio-review panel for this project:

1. Play the complete final track; use the per-segment players to investigate individual lines, not as a replacement for full playback.
2. Complete all five checks: full playback, terminology, pauses, clipping, and segment joins.
3. Review exactly these 10 unresolved terms: `Coze`, `Dify`, `Codex`, `Claude Code`, `Agent`, `Demo`, `Magic`, `Engineering`, `30K`, and `Token`. Mark each as accepted or retake.
4. Save the review. `audio/listening-review.json` must remain bound to the current NarrationLock and `audio/narration.final.wav` hashes.
5. `ready-for-approval` is not approval. Use the workbench human-listening approval action to create `audio/approval.json` with the review receipt hash.
6. Run `npm.cmd run video:sop-status -- --project demotext-standard-delivery-v1` and confirm `milestones.humanListening=passed` only after formal approval.

If NarrationLock and final WAV hashes are unchanged, human-listening approval refreshes only approval and delivery metadata: `audio/approval.json`, `audio-handoff.json`, `SOP_STATUS.json`, delivery QA/manifest, and retrospective. Do not regenerate TTS, alignment, captions, HyperFrames composition, or MP4. Any text or final-audio change invalidates the timing-dependent chain normally.

This project still remains `publicReleaseBlocked=true` after listening approval until CosyVoice publication rights and the remaining public-release evidence blockers are cleared.
