# AutoVideo Process Log - V2

## Run Identity

- Project ID: `demotext-standard-delivery-v2`
- Source: `demo/demoText.txt`
- Source SHA-256: `ec1a51a269faf0344b2ba93abf21c4a75b8aac51d4a0996bd43ac2c66af33198`
- Narration SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7
- Audio: 239.328167s / pcm_s16le / 48kHz mono / -16.3 LUFS / -1.3 dBFS
- Template: `modern-ip-host-explainer@1.0.0` / `light-apricot`
- HyperFrames: `0.7.62` / 1920x1080 / 30fps / 14 scenes / 46 cues
- Delivery SHA-256: `e0c4ea6bc7c2c9d603dddc2c904355ebc95d3abb6f575cb5579bd51460bc48db`
- Scope: `internal-only`; public release blocked

## Immutable Rules

1. NarrationLock wording is immutable. Any text change creates a new project revision.
2. Final WAV and alignment are the only timing sources; target duration is an estimate.
3. Exact narration and generated summaries stay separately labeled.
4. Manual changes use workbench artifacts or versioned overrides, then propagate downstream stale state.
5. HyperFrames is the only full-composition, Studio and render layer.
6. Human listening, human final review and public rights cannot be replaced by automation.

## Execution Events

| Time | Stage | Event | Result |
|---|---|---|---|
| 2026-07-19T00:12:23.770Z | project | project-created | Created workbench project. |
| 2026-07-19T00:12:57.106Z | source-register | stage-running | Started source-register. |
| 2026-07-19T00:12:57.114Z | source-register | stage-generated | Registered 1 source file(s) with SHA-256 receipts. |
| 2026-07-19T00:12:58.166Z | script-review | stage-running | Started script-review. |
| 2026-07-19T00:12:58.173Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-19T00:12:59.199Z | script-review | stage-approved | Approved script-review (human-review). |
| 2026-07-19T00:13:11.348Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-19T00:13:11.355Z | narration-lock | stage-generated | Loaded the existing formal project NarrationLock. |
| 2026-07-19T00:13:12.402Z | template-lock | stage-running | Started template-lock. |
| 2026-07-19T00:13:12.509Z | template-lock | stage-generated | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 2026-07-19T00:15:30.155Z | voice-final | stage-running | Started voice-final. |
| 2026-07-19T00:18:41.852Z | voice-final | stage-generated | Generated the final narration WAV in 18 part(s). Human listening approval is required. |
| 2026-07-19T00:18:59.755Z | voice-final | stage-approved | Approved voice-final (technical-only). |
| 2026-07-19T00:19:12.488Z | audio-align | stage-running | Started audio-align. |
| 2026-07-19T00:19:46.835Z | audio-align | stage-generated | Mapped 1145 Whisper timestamps to 1378 exact NarrationLock characters and 46 caption cues; phoneme-level forced alignment remains a documented limitation. |
| 2026-07-19T00:20:01.740Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-19T00:20:01.751Z | rights-clearance | stage-generated | Prepared publication rights review with 4 item(s). |
| 2026-07-19T00:20:28.058Z | rights-clearance | stage-approved | Approved rights-clearance (human-review). |
| 2026-07-19T00:20:39.694Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-19T00:20:39.847Z | audio-handoff | stage-generated | Attached final audio (239.328167s) and alignment with rights=needs-review. |
| 2026-07-19T00:20:55.677Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T00:38:52.516Z | visual-plan | stage-failed | Command timed out after 900000 milliseconds: codex.cmd exec --skip-git-repo-check --sandbox read-only --ephemeral --color never -C "E:\project\study\codex\autoVideo" --output-schema "E:\project\study\codex\autoVideo\work |
| 2026-07-19T01:29:09.858Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T01:29:09.871Z | visual-plan | stage-generated | Imported formal planning SSOT with 14 scene(s), 4 graph(s), and 46 shot(s). |
| 2026-07-19T01:29:22.688Z | visual-plan | stage-approved | Approved visual-plan (internal-autonomous-review). |
| 2026-07-19T01:29:22.733Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-19T01:29:22.920Z | diagram-assets | stage-generated | Computed ELK layouts for 4 canonical planning graph(s). |
| 2026-07-19T01:34:46.261Z | style-probe | artifact-edited | Fresh V2 probe rendered and strict-checked; deterministic template reference fallback. |
| 2026-07-19T01:34:46.466Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-19T01:35:01.305Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-19T01:35:01.422Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-19T01:39:16.595Z | full-production | stage-running | Started full-production. |
| 2026-07-19T01:39:16.820Z | full-production | stage-failed | No HyperFrames composition exists yet. |
| 2026-07-19T01:43:50.068Z | full-production | stage-running | Started full-production. |
| 2026-07-19T01:43:51.414Z | full-production | stage-generated | Compiled 14 scenes and 46 locked cues into a 239.328167s HyperFrames composition. |
| 2026-07-19T01:44:05.031Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T01:45:07.391Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T01:49:26.234Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T01:49:26.241Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T01:49:28.395Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3594/#project/hyperframes |
| 2026-07-19T01:51:49.286Z | full-production | stage-reopened | Fix HyperFrames meta.id to match the composition directory so Studio can discover index.html. |
| 2026-07-19T01:51:49.298Z | full-production | stage-running | Started full-production. |
| 2026-07-19T01:51:50.354Z | full-production | stage-generated | Compiled 14 scenes and 46 locked cues into a 239.328167s HyperFrames composition. |
| 2026-07-19T01:52:26.141Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T01:53:27.676Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T01:53:27.826Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T01:53:27.833Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T01:53:28.371Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3594/#project/hyperframes |
| 2026-07-19T02:00:59.317Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T02:01:52.155Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T02:07:20.057Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-19T02:13:44.683Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T02:14:03.444Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and a 24-file SHA-256 manifest. |
| 2026-07-19T02:16:01.652Z | retrospective | stage-running | Started retrospective. |
| 2026-07-19T02:16:01.855Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-19T02:16:02.240Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-19T02:19:16.565Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3594/ |
| 2026-07-19T02:41:53.728Z | project | metadata-encoding-repaired | Repaired workbench display metadata from the already-approved formal project state. No content or timing contract changed. |
| 2026-07-19T03:01:11.557Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T03:01:31.835Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and a 24-file SHA-256 manifest. |
| 2026-07-19T03:03:01.569Z | retrospective | stage-running | Started retrospective. |
| 2026-07-19T03:03:01.768Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-19T03:04:01.534Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-19T04:18:39.316Z | full-production | stage-running | Started full-production. |
| 2026-07-19T04:18:40.328Z | full-production | stage-generated | Compiled 14 scenes and 46 locked cues into a 239.328167s HyperFrames composition. |
| 2026-07-19T04:19:20.020Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T04:20:26.425Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T04:29:52.964Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-19T04:29:52.976Z | rights-clearance | stage-generated | Prepared publication rights review with 7 item(s). |
| 2026-07-19T04:36:42.853Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T04:36:42.861Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T04:36:43.461Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3594/ |
| 2026-07-19T04:36:43.629Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T05:13:25.343Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T05:18:56.922Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |

## Failures And Recovery

- Structured visual planning failed with upstream 502 and a 900-second timeout. The failed job remains in the workbench. V2 planning then used `plan/planning-fallback-receipt.json`: V1 semantic structure only, rebound to V2 hashes and timings.
- The first deterministic full-production run exposed a missing HyperFrames project scaffold. The compiler now emits `hyperframes.json`, package metadata, pinned fonts, frame spec and brief.
- Studio cold-load discovery exposed a metadata mismatch and a hash-route race. The compiler now uses directory-aligned `meta.id`; the workbench now opens the Studio project root.
- 2 failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.

## Remaining Release Gates

- Full human listening, including: `Coze`, `Dify`, `Codex`, `Claude Code`, `Agent`, `Demo`, `Magic`, `Engineering`, `30K`, `Token`.
- Public rights evidence for the CosyVoice speaker and user-provided host artwork.
- Human full-timeline review in HyperFrames Studio.
- OCR/full semantic subtitle review is not automated in this baseline.
- 99%, 90% and 30K remain creator opinion, not verified statistics.
