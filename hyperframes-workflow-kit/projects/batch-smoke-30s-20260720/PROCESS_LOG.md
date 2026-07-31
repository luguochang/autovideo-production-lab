# AutoVideo Process Log - batch-smoke-30s-20260720

## Run Identity

- Project ID: `batch-smoke-30s-20260720`
- Source: `hyperframes-workflow-kit/projects/batch-smoke-30s-20260720/input/script.approved.txt`
- Source SHA-256: `61c1763700a77ffa654c910e5f88f1b2a981529561befeb8fdbe70f01e1eecb1`
- Narration SHA-256: `230fd3015b937e6dfc6de1aa4d442d2a0e9156dadf9a8eba5206847be65cbd97`
- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7
- Audio: 31.807896s / pcm_s16le / 48kHz mono / -16 LUFS / -1.5 dBFS
- Template: `modern-ip-host-explainer@1.0.0` / `light-apricot`
- HyperFrames: `0.7.68` / 1920x1080 / 30fps / 2 scenes / 6 cues
- Delivery SHA-256: `fdf6222d6d0aa256fcaec0bfe164767555768e057ab7f9305e3c31ed6726e29e`
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
| 2026-07-21T01:24:59.263Z | project | formal-project-adopted | Imported formal project evidence from hyperframes-workflow-kit/projects/batch-smoke-30s-20260720; human approvals and publication clearance were intentionally not inherited. |
| 2026-07-21T05:20:38.350Z | project | formal-project-evidence-refreshed | Refreshed formal evidence for 4 stage(s); human approvals were not synthesized. |
| 2026-07-21T05:20:59.515Z | project | formal-project-evidence-refreshed | Formal evidence is already current; no workbench stage changed. |
| 2026-07-21T07:54:10.314Z | project | media-asset-imported | Reused registered media asset sfx-whoosh-short; no duplicate bytes were added. |
| 2026-07-21T07:54:11.555Z | project | media-asset-imported | Reused registered media asset sfx-click-soft; no duplicate bytes were added. |
| 2026-07-21T13:39:19.106Z | project | formal-project-evidence-refreshed | Refreshed formal evidence for 3 stage(s); human approvals were not synthesized. |
| 2026-07-22T07:25:43.937Z | material-suitability | stage-running | Started material-suitability. |
| 2026-07-22T07:25:43.969Z | material-suitability | stage-failed | Unexpected token '第', "第一，平台会把系统的"... is not valid JSON |
| 2026-07-22T08:05:08.804Z | material-suitability | stage-running | Started material-suitability. |
| 2026-07-22T08:05:08.841Z | material-suitability | stage-generated | Registered sources can enter spoken rewriting after human review. |
| 2026-07-22T08:05:09.434Z | evidence-ledger | stage-running | Started evidence-ledger. |
| 2026-07-22T08:05:41.166Z | evidence-ledger | stage-failed | Command failed with exit code 1: codex.cmd exec --skip-git-repo-check --sandbox read-only --ephemeral --color never -C "E:\project\study\codex\autoVideo" --output-schema "E:\project\study\codex\autoVideo\workflow-console |
| 2026-07-22T08:08:37.592Z | evidence-ledger | stage-running | Started evidence-ledger. |
| 2026-07-22T08:08:37.631Z | evidence-ledger | stage-generated | Extracted 3 source-bound claim(s) with prompt provenance. |
| 2026-07-22T08:54:23.041Z | evidence-ledger | stage-approved | Approved evidence-ledger (human-review). |
| 2026-07-22T08:54:46.390Z | spoken-rewrite | stage-running | Started spoken-rewrite. |
| 2026-07-22T08:54:46.434Z | spoken-rewrite | stage-generated | Prepared 1 source-bound spoken section(s) for review. |
| 2026-07-22T08:54:48.520Z | claim-source-review | stage-running | Started claim-source-review. |
| 2026-07-22T08:54:48.561Z | claim-source-review | stage-generated | passed: 0 claim/source issue(s). |
| 2026-07-22T08:54:50.622Z | script-review | stage-running | Started script-review. |
| 2026-07-22T08:54:50.650Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-22T09:02:13.536Z | spoken-rewrite | stage-reopened | Bind approved-script section timing to the project targetDuration and add deterministic duration assessment before claim review. |
| 2026-07-22T09:06:33.984Z | spoken-rewrite | stage-running | Started spoken-rewrite. |
| 2026-07-22T09:06:34.037Z | spoken-rewrite | stage-generated | Prepared 1 source-bound spoken section(s) for review. |
| 2026-07-22T09:06:48.085Z | content-duration-fit | stage-running | Started content-duration-fit. |
| 2026-07-22T09:06:48.125Z | content-duration-fit | stage-generated | Text duration budget passed at 6.23 graphemes/s; final WAV timing remains authoritative. |
| 2026-07-22T09:06:50.217Z | claim-source-review | stage-running | Started claim-source-review. |
| 2026-07-22T09:06:50.270Z | claim-source-review | stage-generated | passed: 0 claim/source issue(s). |
| 2026-07-22T09:06:52.358Z | script-review | stage-running | Started script-review. |
| 2026-07-22T09:06:52.393Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-22T09:18:28.222Z | script-review | stage-approved | Approved script-review (human-review). |
| 2026-07-22T09:18:38.271Z | content-approval | stage-running | Started content-approval. |
| 2026-07-22T09:18:38.326Z | content-approval | stage-generated | Content chain is ready for explicit human wording approval. |
| 2026-07-22T09:18:51.192Z | content-approval | stage-approved | Approved content-approval (human-review). |
| 2026-07-22T09:19:24.783Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-22T09:19:24.939Z | narration-lock | stage-generated | Rebound the unchanged narration to the current content approval and archived the prior lock revision. |
| 2026-07-22T09:19:26.928Z | template-lock | stage-running | Started template-lock. |
| 2026-07-22T09:19:27.075Z | template-lock | stage-generated | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 2026-07-22T09:19:29.095Z | pronunciation-review | stage-running | Started pronunciation-review. |
| 2026-07-22T09:19:29.139Z | pronunciation-review | stage-generated | No subjective Latin terms required probes; generated a hash-bound machine approval for explicit letter acronyms only. |
| 2026-07-22T09:19:31.234Z | voice-final | stage-running | Started voice-final. |
| 2026-07-22T09:20:51.843Z | voice-final | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\tools\voice-lab\merge_breath_audio.mjs" --manifest "E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projec |
| 2026-07-22T09:22:49.611Z | voice-final | stage-running | Started voice-final. |
| 2026-07-22T09:23:42.968Z | voice-final | stage-failed | Voice candidate part evidence is stale for part-001. |
| 2026-07-22T09:27:59.372Z | voice-final | stage-running | Started voice-final. |
| 2026-07-22T09:28:46.534Z | voice-final | stage-generated | Generated candidate-003 in 4 part(s). The existing final WAV was not changed; complete the dedicated A/B file review to promote this candidate. |
| 2026-07-22T09:34:05.719Z | voice-final | voice-candidate-promoted | Promoted candidate-003 as narration.final.wav for internal-only simulation without human listening. |
| 2026-07-22T09:34:42.806Z | audio-align | stage-running | Started audio-align. |
| 2026-07-22T09:34:56.662Z | audio-align | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\scripts\finalize-audio-delivery.mjs" --project batch-smoke-30s-20260720 Error: Command failed: E:\project\study\code |
| 2026-07-22T10:07:55.803Z | audio-align | stage-running | Started audio-align. |
| 2026-07-22T10:08:12.278Z | audio-align | stage-generated | Mapped 140 Whisper timestamps to 158 exact NarrationLock characters and 6 caption cues; generated locked SRT and technical audio QA (-16 LUFS). Phoneme-level forced alignment remains a documented limitation. |
| 2026-07-22T10:09:36.970Z | subtitle-qa | stage-running | Started subtitle-qa. |
| 2026-07-22T10:09:37.017Z | subtitle-qa | stage-generated | Subtitle machine QA passed for 6 cues; human semantic review and OCR remain separate gates. |
| 2026-07-22T10:09:39.114Z | subtitle-review | stage-running | Started subtitle-review. |
| 2026-07-22T10:09:39.152Z | subtitle-review | stage-generated | Prepared human subtitle review for 6 locked cue(s); no cue was accepted automatically. |
| 2026-07-22T10:10:44.925Z | project | project-updated | Updated project settings and dependency state. |
| 2026-07-22T10:10:58.977Z | subtitle-review | text-review-approved | Accepted subtitle-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-22T10:11:10.195Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-22T10:11:10.256Z | rights-clearance | stage-generated | Prepared publication rights v2 review with 9 item(s) and 5 current inventory binding(s). |
| 2026-07-22T10:12:01.519Z | rights-clearance | stage-approved | Approved rights-clearance (internal-autonomous-review). |
| 2026-07-22T10:12:23.725Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-22T10:12:23.903Z | audio-handoff | stage-generated | Attached final audio (31.807896s) and alignment with rights=needs-review. |
| 2026-07-22T10:12:25.862Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-22T10:12:25.908Z | visual-plan | stage-generated | Imported formal planning SSOT with 2 scene(s), 2 graph(s), and 6 shot(s). |
| 2026-07-22T10:52:14.010Z | visual-plan | stage-reopened | Imported shot timings were bound to the previous final WAV; regenerate every cue against the current alignment. |
| 2026-07-22T10:52:31.224Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-22T10:52:31.270Z | visual-plan | stage-failed | Formal shot cue-001 timing is stale for the current alignment. |
| 2026-07-22T10:56:56.996Z | audio-align | stage-reopened | Alignment narration path must bind to NarrationLock.frozenPath before planning. |
| 2026-07-22T10:57:12.789Z | audio-align | stage-running | Started audio-align. |
| 2026-07-22T10:57:30.142Z | audio-align | stage-generated | Mapped 140 Whisper timestamps to 158 exact NarrationLock characters and 6 caption cues; generated locked SRT and technical audio QA (-16 LUFS). Phoneme-level forced alignment remains a documented limitation. |
| 2026-07-22T10:58:11.800Z | subtitle-qa | stage-running | Started subtitle-qa. |
| 2026-07-22T10:58:11.848Z | subtitle-qa | stage-generated | Subtitle machine QA passed for 6 cues; human semantic review and OCR remain separate gates. |
| 2026-07-22T10:58:13.940Z | subtitle-review | stage-running | Started subtitle-review. |
| 2026-07-22T10:58:13.987Z | subtitle-review | stage-generated | Prepared human subtitle review for 6 locked cue(s); no cue was accepted automatically. |
| 2026-07-22T10:58:45.583Z | subtitle-review | text-review-approved | Accepted subtitle-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-22T10:58:56.985Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-22T10:58:57.060Z | rights-clearance | stage-generated | Prepared publication rights v2 review with 9 item(s) and 5 current inventory binding(s). |
| 2026-07-22T10:59:13.352Z | rights-clearance | stage-approved | Approved rights-clearance (internal-autonomous-review). |
| 2026-07-22T10:59:51.839Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-22T10:59:52.019Z | audio-handoff | stage-generated | Attached final audio (31.807896s) and alignment with rights=needs-review. |
| 2026-07-22T10:59:53.974Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-22T10:59:54.010Z | visual-plan | stage-failed | Formal shot cue-001 timing is stale for the current alignment. |
| 2026-07-22T10:59:56.243Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-22T10:59:56.309Z | visual-plan | stage-generated | Imported formal planning SSOT with 2 scene(s), 0 graph(s), and 6 shot(s). |
| 2026-07-22T11:09:57.908Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-22T11:09:57.976Z | visual-plan | stage-generated | Imported formal planning SSOT with 2 scene(s), 2 graph(s), and 6 shot(s). |
| 2026-07-22T11:10:38.171Z | visual-plan | stage-approved | Approved visual-plan (internal-autonomous-review). |
| 2026-07-22T11:10:57.176Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-22T11:10:57.367Z | diagram-assets | stage-generated | Computed ELK layouts for 2 canonical planning graph(s). |
| 2026-07-22T11:10:59.320Z | style-probe | stage-running | Started style-probe. |
| 2026-07-22T11:10:59.384Z | style-probe | stage-generated | Imported the hash-bound 3.98s style probe for internal review. |
| 2026-07-22T11:11:54.203Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-22T11:18:22.654Z | style-probe | stage-reopened | Rebind the approved Candidate A component selection and regenerated current-audio probe after approval writeback drift. |
| 2026-07-22T11:18:37.903Z | style-probe | stage-running | Started style-probe. |
| 2026-07-22T11:18:37.959Z | style-probe | stage-generated | Imported the hash-bound 3.98s style probe for internal review. |
| 2026-07-22T11:22:49.656Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-22T11:23:33.879Z | visual-variety-qa | stage-running | Started visual-variety-qa. |
| 2026-07-22T11:23:33.936Z | visual-variety-qa | stage-generated | Visual variety QA passed: 3 carriers and 3 recipes across 6 cues. |
| 2026-07-22T11:23:36.027Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-22T11:23:36.220Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-22T11:23:38.193Z | full-production | stage-running | Started full-production. |
| 2026-07-22T11:23:38.431Z | full-production | stage-failed | Command failed with exit code 1: node scripts/sync-project-sop-status.mjs --project batch-smoke-30s-20260720 Overrides base is stale. Reconcile or supersede overrides before syncing status. |
| 2026-07-22T11:27:32.001Z | full-production | stage-running | Started full-production. |
| 2026-07-22T11:27:32.447Z | full-production | stage-failed | Command failed with exit code 1: node tools/hyperframes-production/compile-production.mjs --project hyperframes-workflow-kit/projects/batch-smoke-30s-20260720 Error: Motion recipes are not authorized for full production: |
| 2026-07-22T11:31:55.956Z | full-production | stage-running | Started full-production. |
| 2026-07-22T11:32:05.332Z | full-production | stage-generated | Compiled 2 scenes and 6 locked cues into a 31.808s HyperFrames composition. |
| 2026-07-22T11:32:06.205Z | qa-review | stage-running | Started qa-review. |
| 2026-07-22T11:33:08.057Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-22T11:33:09.197Z | screen-text-review | stage-running | Started screen-text-review. |
| 2026-07-22T11:33:23.965Z | screen-text-review | stage-generated | Prepared screen-text review for 7 hash-bound cue snapshot(s); OCR=passed (RapidOCR ONNXRuntime), and human frame review remains required. |
| 2026-07-22T11:36:47.969Z | screen-text-review | text-review-approved | Accepted screen-text-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-22T11:37:37.063Z | final-preview | stage-running | Started final-preview. |
| 2026-07-22T11:37:37.108Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-22T11:40:03.474Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3409/ |
| 2026-07-22T11:40:03.584Z | final-preview | final-preview-internal-approved | Accepted final preview through creator-delegated internal-only simulation. |
| 2026-07-22T11:40:39.744Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-22T11:41:30.168Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-22T11:41:30.618Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-22T11:41:36.063Z | delivery-qa | stage-failed | ENOENT: no such file or directory, stat 'E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projects\batch-smoke-30s-20260720\qa\stills\delivery-middle.png' |
| 2026-07-22T11:47:17.910Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-22T11:47:23.450Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 2026-07-22T11:47:24.118Z | retrospective | stage-running | Started retrospective. |
| 2026-07-22T11:47:24.534Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-22T11:50:57.773Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-22T11:51:18.269Z | package-export | stage-running | Started package-export. |
| 2026-07-22T11:51:19.887Z | package-export | stage-generated | Assembled and verified the 600-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T11:58:49.758Z | delivery-qa | stage-reopened | Regenerate current internal-review render receipt and sampled-frame bindings after delivery receipt staleness was detected. |
| 2026-07-22T12:00:13.850Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-22T12:00:23.483Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 2026-07-22T12:16:23.500Z | subtitle-qa | stage-reopened | Rebind subtitle QA to the current deterministic alignment-validation artifact after delivery QA idempotency fix. |
| 2026-07-22T12:17:10.015Z | subtitle-qa | stage-running | Started subtitle-qa. |
| 2026-07-22T12:17:10.073Z | subtitle-qa | stage-generated | Subtitle machine QA passed for 6 cues; human semantic review and OCR remain separate gates. |
| 2026-07-22T12:18:06.782Z | subtitle-review | stage-running | Started subtitle-review. |
| 2026-07-22T12:18:06.833Z | subtitle-review | stage-generated | Prepared human subtitle review for 6 locked cue(s); no cue was accepted automatically. |
| 2026-07-22T12:18:52.072Z | subtitle-review | text-review-approved | Accepted subtitle-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-22T12:20:20.617Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-22T12:20:20.732Z | rights-clearance | stage-generated | Prepared publication rights v2 review with 18 item(s) and 5 current inventory binding(s). |
| 2026-07-22T12:20:41.544Z | rights-clearance | stage-approved | Approved rights-clearance (internal-autonomous-review). |
| 2026-07-22T12:25:37.125Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-22T12:25:37.364Z | audio-handoff | stage-generated | Attached final audio (31.807896s) and alignment with rights=needs-review. |
| 2026-07-22T12:25:39.285Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-22T12:25:39.354Z | visual-plan | stage-generated | Imported formal planning SSOT with 2 scene(s), 2 graph(s), and 6 shot(s). |
| 2026-07-22T12:26:50.420Z | visual-plan | stage-approved | Approved visual-plan (internal-autonomous-review). |
| 2026-07-22T12:27:05.932Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-22T12:27:06.123Z | diagram-assets | stage-generated | Computed ELK layouts for 2 canonical planning graph(s). |
| 2026-07-22T12:27:08.144Z | style-probe | stage-running | Started style-probe. |
| 2026-07-22T12:27:08.226Z | style-probe | stage-generated | Imported the hash-bound 3.98s style probe for internal review. |
| 2026-07-22T12:27:39.842Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-22T12:27:53.014Z | visual-variety-qa | stage-running | Started visual-variety-qa. |
| 2026-07-22T12:27:53.127Z | visual-variety-qa | stage-generated | Visual variety QA passed: 3 carriers and 3 recipes across 6 cues. |
| 2026-07-22T12:27:55.201Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-22T12:27:55.363Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-22T12:27:57.529Z | full-production | stage-running | Started full-production. |
| 2026-07-22T12:28:10.351Z | full-production | stage-generated | Compiled 2 scenes and 6 locked cues into a 31.808s HyperFrames composition. |
| 2026-07-22T12:28:11.891Z | qa-review | stage-running | Started qa-review. |
| 2026-07-22T12:29:14.449Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-22T12:29:14.937Z | screen-text-review | stage-running | Started screen-text-review. |
| 2026-07-22T12:29:15.041Z | screen-text-review | stage-failed | Screen-text frame-set manifest is missing, stale, or malformed. |
| 2026-07-22T12:33:08.598Z | screen-text-review | stage-running | Started screen-text-review. |
| 2026-07-22T12:33:22.668Z | screen-text-review | stage-generated | Prepared screen-text review for 7 hash-bound cue snapshot(s); OCR=passed (RapidOCR ONNXRuntime), and human frame review remains required. |
| 2026-07-22T12:35:42.063Z | screen-text-review | text-review-approved | Accepted screen-text-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-22T12:36:03.552Z | final-preview | stage-running | Started final-preview. |
| 2026-07-22T12:36:03.611Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-22T12:38:17.060Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3409/ |
| 2026-07-22T12:38:50.809Z | final-preview | final-preview-internal-approved | Accepted final preview through creator-delegated internal-only simulation. |
| 2026-07-22T12:40:21.262Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-22T12:40:21.503Z | render-deliver | stage-failed | Command failed with exit code 134: node scripts/video-workflow.mjs template-status --project batch-smoke-30s-20260720 \r <--- Last few GCs --->\r \r FATAL ERROR: Zone Allocation failed - process out of memory\r ----- Nat |
| 2026-07-22T14:03:14.266Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-22T14:04:35.687Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-22T14:04:37.634Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-22T14:04:45.360Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 2026-07-22T14:04:45.953Z | retrospective | stage-running | Started retrospective. |
| 2026-07-22T14:04:46.610Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-22T14:11:16.348Z | retrospective | stage-running | Started retrospective. |
| 2026-07-22T14:11:16.796Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-22T14:13:13.285Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-22T14:13:49.540Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:13:51.203Z | package-export | stage-generated | Assembled and verified the 632-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T14:30:57.765Z | package-export | stage-reopened | Rebuild the standard package after correcting human-review versus internal-autonomous review status semantics. |
| 2026-07-22T14:31:20.636Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:31:21.987Z | package-export | stage-generated | Assembled and verified the 633-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T14:36:30.686Z | package-export | stage-reopened | Refresh the standard package with the final implementation and verification record in docs/20. |
| 2026-07-22T14:37:16.375Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:37:17.797Z | package-export | stage-generated | Assembled and verified the 635-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T14:38:48.405Z | package-export | stage-reopened | Refresh the package after removing self-referential package file counts from docs/20. |
| 2026-07-22T14:45:38.025Z | package-export | stage-reopened | Rebuild with package-export v3 workspace and formal-input hash bindings. |
| 2026-07-22T14:45:38.168Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:45:39.610Z | package-export | stage-generated | Assembled and verified the 636-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T14:48:36.242Z | package-export | stage-reopened | Refresh the package with the final 195/195 regression count. |
| 2026-07-22T14:48:36.410Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:48:37.812Z | package-export | stage-generated | Assembled and verified the 638-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T14:54:14.781Z | package-export | stage-reopened | Refresh the package after synchronizing the final internal-review next action. |
| 2026-07-22T14:54:14.953Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:54:16.479Z | package-export | stage-generated | Assembled and verified the 640-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-22T14:59:26.897Z | package-export | stage-reopened | Rebuild with pre-package SOP and next-action synchronization. |
| 2026-07-22T14:59:27.080Z | package-export | stage-running | Started package-export. |
| 2026-07-22T14:59:28.890Z | package-export | stage-generated | Assembled and verified the 642-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-23T01:55:38.571Z | full-production | stage-running | Started full-production. |
| 2026-07-23T01:55:47.640Z | full-production | stage-generated | Compiled 2 scenes and 6 locked cues into a 31.808s HyperFrames composition. |
| 2026-07-23T01:57:28.095Z | qa-review | stage-running | Started qa-review. |
| 2026-07-23T01:58:29.742Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-23T02:01:54.615Z | screen-text-review | stage-running | Started screen-text-review. |
| 2026-07-23T02:02:09.758Z | screen-text-review | stage-generated | Prepared screen-text review for 7 hash-bound cue snapshot(s); OCR=passed (RapidOCR ONNXRuntime), and human frame review remains required. |
| 2026-07-23T02:03:44.949Z | screen-text-review | text-review-approved | Accepted screen-text-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-23T02:05:05.954Z | final-preview | stage-running | Started final-preview. |
| 2026-07-23T02:05:06.024Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-23T02:05:28.369Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3409/ |
| 2026-07-23T02:06:20.863Z | final-preview | final-preview-internal-approved | Accepted final preview through creator-delegated internal-only simulation. |
| 2026-07-23T05:02:26.712Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-23T05:02:26.965Z | render-deliver | stage-failed | The HyperFrames composition changed after final preview approval. Regenerate and approve the preview again. |
| 2026-07-23T05:03:16.050Z | final-preview | stage-running | Started final-preview. |
| 2026-07-23T05:03:16.119Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-23T05:03:48.919Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3409/ |
| 2026-07-23T05:03:49.057Z | final-preview | final-preview-internal-approved | Accepted final preview through creator-delegated internal-only simulation. |
| 2026-07-23T05:04:06.881Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-23T05:05:36.493Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-23T05:06:36.331Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-23T05:06:36.611Z | delivery-qa | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\scripts\build-delivery-docs.mjs" batch-smoke-30s-20260720 Error: Visual review cannot be regenerated from a stale Hy |
| 2026-07-23T05:08:42.273Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-23T05:08:49.823Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 2026-07-23T05:10:46.358Z | retrospective | stage-running | Started retrospective. |
| 2026-07-23T05:10:46.963Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-23T05:18:52.745Z | screen-text-review | stage-running | Started screen-text-review. |
| 2026-07-23T05:19:14.120Z | screen-text-review | stage-generated | Prepared screen-text review for 12 hash-bound cue snapshot(s); OCR=passed (RapidOCR ONNXRuntime), and human frame review remains required. |
| 2026-07-23T05:20:27.872Z | screen-text-review | text-review-approved | Accepted screen-text-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-23T05:21:05.319Z | final-preview | stage-running | Started final-preview. |
| 2026-07-23T05:21:05.393Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-23T05:21:05.968Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3409/ |
| 2026-07-23T05:21:06.057Z | final-preview | final-preview-internal-approved | Accepted final preview through creator-delegated internal-only simulation. |
| 2026-07-23T05:21:26.152Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-23T05:22:53.835Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-23T05:23:21.813Z | delivery-qa | stage-running | Started delivery-qa. |

## Failures And Recovery

- No planning fallback was used for this project.
- 14 failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.
- Recovery always resumes the first non-approved active stage and preserves unchanged WAV, alignment, composition and render artifacts.

## Remaining Release Gates

- Full human listening, including: .
- Public rights evidence for all unresolved entries in the rights ledger.
- Human full-timeline review in HyperFrames Studio.
- OCR/full semantic subtitle review is not automated in this baseline.
- Unverified numeric claims remain creator opinion, not measured statistics.
