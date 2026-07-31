# AutoVideo Process Log - demotext-standard-delivery-v3

## Run Identity

- Project ID: `demotext-standard-delivery-v3`
- Source: `content/demotext-standard-delivery-v3-narration.approved.txt`
- Source SHA-256: `1d2e145372944e0a77f1e730d5bcff1140b88fbc52c3face506110b15c10e0d0`
- Narration SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7
- Audio: 242.904042s / pcm_s16le / 48kHz mono / -16.2 LUFS / -1.5 dBFS
- Template: `modern-ip-host-explainer@1.0.0` / `light-apricot`
- HyperFrames: `0.7.62` / 1920x1080 / 30fps / 14 scenes / 46 cues
- Delivery SHA-256: `81fc1e8dfaff63e1cb09b32928b1c438b3ebe88bcbf2b1d2ef1697774cdd3829`
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
| 2026-07-19T06:20:48.562Z | project | project-created | Created workbench project. |
| 2026-07-19T06:26:51.846Z | source-register | stage-running | Started source-register. |
| 2026-07-19T06:26:51.857Z | source-register | stage-generated | Registered 1 source file(s) with SHA-256 receipts. |
| 2026-07-19T06:26:53.926Z | script-review | stage-running | Started script-review. |
| 2026-07-19T06:26:53.934Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-19T06:26:56.005Z | script-review | stage-approved | Approved script-review (user-provided-input). |
| 2026-07-19T06:26:56.036Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-19T06:26:56.126Z | narration-lock | stage-failed | Command failed with exit code 1: node scripts/video-workflow.mjs new --id demotext-standard-delivery-v3 --narration "E:\project\study\codex\autoVideo\content\demotext-standard-delivery-v3-narration.approved.txt" --ratio  |
| 2026-07-19T06:28:01.769Z | project | project-updated | Updated project settings and dependency state. |
| 2026-07-19T06:28:50.291Z | script-review | stage-running | Started script-review. |
| 2026-07-19T06:28:50.300Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-19T06:28:50.344Z | script-review | stage-approved | Approved script-review (user-provided-input). |
| 2026-07-19T06:28:50.375Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-19T06:28:50.482Z | narration-lock | stage-generated | Created formal video project and immutable NarrationLock. |
| 2026-07-19T06:28:52.467Z | template-lock | stage-running | Started template-lock. |
| 2026-07-19T06:28:52.569Z | template-lock | stage-generated | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 2026-07-19T06:28:54.569Z | voice-final | stage-running | Started voice-final. |
| 2026-07-19T06:32:23.412Z | voice-final | stage-generated | Generated the final narration WAV in 18 part(s). Human listening approval is required. |
| 2026-07-19T06:32:25.295Z | voice-final | stage-approved | Approved voice-final (technical-only). |
| 2026-07-19T06:32:25.335Z | audio-align | stage-running | Started audio-align. |
| 2026-07-19T06:33:12.580Z | audio-align | stage-generated | Mapped 1149 Whisper timestamps to 1378 exact NarrationLock characters and 46 caption cues; phoneme-level forced alignment remains a documented limitation. |
| 2026-07-19T06:33:14.054Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-19T06:33:14.064Z | rights-clearance | stage-generated | Prepared publication rights review with 7 item(s). |
| 2026-07-19T06:33:16.115Z | rights-clearance | stage-approved | Approved rights-clearance (internal-autonomous-review). |
| 2026-07-19T06:33:16.142Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-19T06:33:16.300Z | audio-handoff | stage-generated | Attached final audio (242.904042s) and alignment with rights=needs-review. |
| 2026-07-19T06:33:18.225Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T06:34:36.767Z | visual-plan | stage-failed | Command failed with exit code 1: codex.cmd exec --skip-git-repo-check --sandbox read-only --ephemeral --color never -C "E:\project\study\codex\autoVideo" --output-schema "E:\project\study\codex\autoVideo\workflow-console |
| 2026-07-19T06:43:07.845Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T06:43:07.867Z | visual-plan | stage-generated | Imported formal planning SSOT with 14 scene(s), 4 graph(s), and 46 shot(s). |
| 2026-07-19T06:43:09.934Z | visual-plan | stage-approved | Approved visual-plan (internal-autonomous-review). |
| 2026-07-19T06:43:09.967Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-19T06:43:10.168Z | diagram-assets | stage-generated | Computed ELK layouts for 4 canonical planning graph(s). |
| 2026-07-19T06:43:12.045Z | style-probe | stage-running | Started style-probe. |
| 2026-07-19T06:51:04.936Z | style-probe | stage-failed | Command failed with exit code 1: codex.cmd exec --skip-git-repo-check --sandbox workspace-write --ephemeral --color never -C "E:\project\study\codex\autoVideo" -o "E:\project\study\codex\autoVideo\workflow-console\data\r |
| 2026-07-19T06:55:28.155Z | style-probe | stage-running | Started style-probe. |
| 2026-07-19T06:55:28.211Z | style-probe | stage-generated | Imported the hash-bound 3.16s style probe for internal review. |
| 2026-07-19T06:55:30.412Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-19T06:55:30.444Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-19T06:55:30.567Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-19T06:55:32.546Z | full-production | stage-running | Started full-production. |
| 2026-07-19T06:55:32.553Z | full-production | stage-failed | ENOENT: no such file or directory, access 'E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projects\demotext-standard-delivery-v3\overrides\overrides.json' |
| 2026-07-19T07:09:55.170Z | full-production | stage-running | Started full-production. |
| 2026-07-19T07:09:56.689Z | full-production | stage-generated | Compiled 14 scenes and 46 locked cues into a 242.904042s HyperFrames composition. |
| 2026-07-19T07:09:57.268Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T07:11:07.787Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T07:11:08.251Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T07:11:08.261Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T07:11:11.885Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3595/ |
| 2026-07-19T07:11:12.037Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T07:11:12.068Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T07:16:40.386Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-19T07:16:42.374Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T07:17:01.844Z | delivery-qa | stage-failed | ENOENT: no such file or directory, open 'E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projects\demotext-standard-delivery-v3\captions\alignment-validation.json' |
| 2026-07-19T07:28:21.605Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T07:28:44.555Z | delivery-qa | stage-failed | ENOENT: no such file or directory, stat 'E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projects\demotext-standard-delivery-v3\pipeline-recipe.json' |
| 2026-07-19T07:36:28.336Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T07:36:56.418Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and a 24-file SHA-256 manifest. |
| 2026-07-19T07:36:56.842Z | retrospective | stage-running | Started retrospective. |
| 2026-07-19T07:36:57.566Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-19T07:36:58.919Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-19T07:57:47.893Z | full-production | stage-reopened | Regenerate composition after generic documentation/compiler contract fix. |
| 2026-07-19T08:05:45.355Z | full-production | stage-running | Started full-production. |
| 2026-07-19T08:05:46.832Z | full-production | stage-generated | Compiled 14 scenes and 46 locked cues into a 242.904042s HyperFrames composition. |
| 2026-07-19T08:05:47.443Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T08:06:58.663Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T08:07:00.397Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T08:07:00.408Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T08:07:02.507Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3595/ |
| 2026-07-19T08:07:02.656Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T08:07:02.683Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T08:12:26.757Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-19T08:12:26.960Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T08:12:55.449Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and a 24-file SHA-256 manifest. |
| 2026-07-19T08:12:57.491Z | retrospective | stage-running | Started retrospective. |
| 2026-07-19T08:12:58.161Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-19T08:12:59.585Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-19T08:21:50.363Z | delivery-qa | stage-reopened | Refresh delivery summary and final manifest documentation after generic SOP fix. |
| 2026-07-19T08:22:30.930Z | delivery-qa | stage-running | Started delivery-qa. |

## Failures And Recovery

- A content-specific planning fallback is recorded at `plan/planning-fallback-receipt.json` and is bound to this project's narration and audio hashes.
- 6 failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.
- Recovery always resumes the first non-approved active stage and preserves unchanged WAV, alignment, composition and render artifacts.

## Remaining Release Gates

- Full human listening, including: .
- Public rights evidence for all unresolved entries in the rights ledger.
- Human full-timeline review in HyperFrames Studio.
- OCR/full semantic subtitle review is not automated in this baseline.
- Unverified numeric claims remain creator opinion, not measured statistics.
