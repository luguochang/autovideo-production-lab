# AutoVideo Process Log - demotext-standard-delivery-v4

## Run Identity

- Project ID: `demotext-standard-delivery-v4`
- Source: `content/demotext-standard-delivery-v4-narration.approved.txt`
- Source SHA-256: `1d2e145372944e0a77f1e730d5bcff1140b88fbc52c3face506110b15c10e0d0`
- Narration SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7
- Audio: 239.328167s / pcm_s16le / 48kHz mono / -16.3 LUFS / -1.3 dBFS
- Template: `modern-ip-host-explainer@1.0.0` / `light-apricot`
- HyperFrames: `0.7.62` / 1920x1080 / 30fps / 14 scenes / 46 cues
- Delivery SHA-256: `2411fe1cbea8944c7ae9e41071963506b3260845e7f896a8b5aae46964d1537d`
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
| 2026-07-19T09:43:32.168Z | project | project-created | Created workbench project. |
| 2026-07-19T09:44:14.657Z | project | project-updated | Updated project settings and dependency state. |
| 2026-07-19T09:44:33.849Z | source-register | stage-running | Started source-register. |
| 2026-07-19T09:44:33.863Z | source-register | stage-generated | Registered 1 source file(s) with SHA-256 receipts. |
| 2026-07-19T09:44:35.931Z | script-review | stage-running | Started script-review. |
| 2026-07-19T09:44:35.942Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-19T09:44:38.001Z | script-review | stage-approved | Approved script-review (user-provided-input). |
| 2026-07-19T09:44:38.032Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-19T09:44:38.252Z | narration-lock | stage-generated | Created formal video project and immutable NarrationLock. |
| 2026-07-19T09:44:40.143Z | template-lock | stage-running | Started template-lock. |
| 2026-07-19T09:44:40.257Z | template-lock | stage-generated | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 2026-07-19T09:44:42.246Z | voice-final | stage-running | Started voice-final. |
| 2026-07-19T09:47:43.922Z | voice-final | stage-generated | Generated the final narration WAV in 18 part(s). Human listening approval is required. |
| 2026-07-19T09:47:44.658Z | voice-final | stage-approved | Approved voice-final (technical-only). |
| 2026-07-19T09:47:44.696Z | audio-align | stage-running | Started audio-align. |
| 2026-07-19T09:48:16.413Z | audio-align | stage-generated | Mapped 1145 Whisper timestamps to 1378 exact NarrationLock characters and 46 caption cues; generated locked SRT and technical audio QA (-16.3 LUFS). Phoneme-level forced alignment remains a documented limitation. |
| 2026-07-19T09:48:17.137Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-19T09:48:17.151Z | rights-clearance | stage-generated | Prepared publication rights review with 7 item(s). |
| 2026-07-19T09:48:19.217Z | rights-clearance | stage-approved | Approved rights-clearance (internal-autonomous-review). |
| 2026-07-19T09:48:19.247Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-19T09:48:19.399Z | audio-handoff | stage-generated | Attached final audio (239.328167s) and alignment with rights=needs-review. |
| 2026-07-19T09:48:21.330Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T09:49:38.671Z | visual-plan | stage-failed | Command failed with exit code 1: codex.cmd exec --skip-git-repo-check --sandbox read-only --ephemeral --color never -C "E:\project\study\codex\autoVideo" --output-schema "E:\project\study\codex\autoVideo\workflow-console |
| 2026-07-19T09:49:40.665Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T09:49:40.682Z | visual-plan | stage-generated | Imported formal planning SSOT with 14 scene(s), 4 graph(s), and 46 shot(s). |
| 2026-07-19T09:49:42.728Z | visual-plan | stage-approved | Approved visual-plan (internal-autonomous-review). |
| 2026-07-19T09:49:42.757Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-19T09:49:42.927Z | diagram-assets | stage-generated | Computed ELK layouts for 4 canonical planning graph(s). |
| 2026-07-19T09:49:44.849Z | style-probe | stage-running | Started style-probe. |
| 2026-07-19T10:06:19.839Z | style-probe | stage-failed | Command failed with exit code 4294967295: codex.cmd exec --skip-git-repo-check --sandbox workspace-write --ephemeral --color never -C "E:\project\study\codex\autoVideo" -o "E:\project\study\codex\autoVideo\workflow-conso |
| 2026-07-19T10:07:35.508Z | style-probe | stage-running | Started style-probe. |
| 2026-07-19T10:07:35.562Z | style-probe | stage-generated | Imported the hash-bound 3.22s style probe for internal review. |
| 2026-07-19T10:07:37.737Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-19T10:07:37.770Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-19T10:07:37.885Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-19T10:07:39.851Z | full-production | stage-running | Started full-production. |
| 2026-07-19T10:07:41.335Z | full-production | stage-generated | Compiled 14 scenes and 46 locked cues into a 239.328167s HyperFrames composition. |
| 2026-07-19T10:07:41.942Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T10:08:49.152Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T10:08:50.896Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T10:08:50.905Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T10:08:54.517Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3596/ |
| 2026-07-19T10:08:54.649Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T10:08:54.684Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T10:14:07.537Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-19T10:14:08.696Z | delivery-qa | stage-running | Started delivery-qa. |

## Failures And Recovery

- A content-specific planning fallback is recorded at `plan/planning-fallback-receipt.json` and is bound to this project's narration and audio hashes.
- 2 failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.
- Recovery always resumes the first non-approved active stage and preserves unchanged WAV, alignment, composition and render artifacts.

## Remaining Release Gates

- Full human listening, including: `Coze`, `Dify`, `Codex`, `Claude Code`, `Agent`, `Demo`, `Magic`, `Engineering`, `30K`, `Token`.
- Public rights evidence for all unresolved entries in the rights ledger.
- Human full-timeline review in HyperFrames Studio.
- OCR/full semantic subtitle review is not automated in this baseline.
- Unverified numeric claims remain creator opinion, not measured statistics.
