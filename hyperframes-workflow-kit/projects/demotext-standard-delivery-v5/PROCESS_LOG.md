# AutoVideo Process Log - demotext-standard-delivery-v5

## Run Identity

- Project ID: `demotext-standard-delivery-v5`
- Source: `demo/demoText.txt`
- Source SHA-256: `ec1a51a269faf0344b2ba93abf21c4a75b8aac51d4a0996bd43ac2c66af33198`
- Narration SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7
- Audio: 239.328167s / pcm_s16le / 48kHz mono / -16.3 LUFS / -1.3 dBFS
- Template: `modern-ip-host-explainer@1.0.0` / `light-apricot`
- HyperFrames: `0.7.62` / 1920x1080 / 30fps / 18 scenes / 46 cues
- Delivery SHA-256: `63aba1a214450c6cfb8d56f8694280bc6447d32e8df46dc41a53966ecb971d8d`
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
| 2026-07-19T14:04:36.942Z | project | project-created | Created workbench project. |
| 2026-07-19T14:13:23.579Z | visual-plan | stage-configured | Updated 语义节拍与分镜. |
| 2026-07-19T14:13:42.398Z | source-register | stage-running | Started source-register. |
| 2026-07-19T14:13:42.416Z | source-register | stage-generated | Registered 1 source file(s) with SHA-256 receipts. |
| 2026-07-19T14:13:45.441Z | script-review | stage-running | Started script-review. |
| 2026-07-19T14:13:45.455Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-19T14:13:48.486Z | script-review | stage-approved | Approved script-review (user-provided-input). |
| 2026-07-19T14:13:48.530Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-19T14:13:48.636Z | narration-lock | stage-generated | Loaded the existing formal project NarrationLock. |
| 2026-07-19T14:13:51.579Z | template-lock | stage-running | Started template-lock. |
| 2026-07-19T14:13:51.704Z | template-lock | stage-generated | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 2026-07-19T14:13:54.635Z | voice-final | stage-running | Started voice-final. |
| 2026-07-19T14:17:14.391Z | voice-final | stage-generated | Generated the final narration WAV in 18 part(s). Human listening approval is required. |
| 2026-07-19T14:17:16.581Z | voice-final | stage-approved | Approved voice-final (technical-only). |
| 2026-07-19T14:17:16.625Z | audio-align | stage-running | Started audio-align. |
| 2026-07-19T14:17:48.929Z | audio-align | stage-generated | Mapped 1145 Whisper timestamps to 1378 exact NarrationLock characters and 46 caption cues; generated locked SRT and technical audio QA (-16.3 LUFS). Phoneme-level forced alignment remains a documented limitation. |
| 2026-07-19T14:17:49.793Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-19T14:17:49.809Z | rights-clearance | stage-generated | Prepared publication rights review with 7 item(s). |
| 2026-07-19T14:17:52.838Z | rights-clearance | stage-approved | Approved rights-clearance (internal-autonomous-review). |
| 2026-07-19T14:17:52.878Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-19T14:17:53.040Z | audio-handoff | stage-generated | Attached final audio (239.328167s) and alignment with rights=needs-review. |
| 2026-07-19T14:17:55.920Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-19T14:17:56.012Z | visual-plan | stage-generated | Generated the deterministic planning SSOT revision 1: 18 scene(s), 46 locked cue(s), and 7 conservative process graph(s). |
| 2026-07-19T14:17:58.954Z | visual-plan | stage-approved | Approved visual-plan (internal-autonomous-review). |
| 2026-07-19T14:17:58.996Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-19T14:17:59.218Z | diagram-assets | stage-generated | Computed ELK layouts for 7 canonical planning graph(s). |
| 2026-07-19T14:18:02.042Z | style-probe | stage-running | Started style-probe. |
| 2026-07-19T14:31:37.811Z | style-probe | stage-failed | Command failed with exit code 4294967295: codex.cmd exec --skip-git-repo-check --sandbox workspace-write --ephemeral --color never -C "E:\project\study\codex\autoVideo" -o "E:\project\study\codex\autoVideo\workflow-conso |
| 2026-07-19T14:33:15.513Z | style-probe | stage-running | Started style-probe. |
| 2026-07-19T14:33:15.567Z | style-probe | stage-generated | Imported the hash-bound 4.78s style probe for internal review. |
| 2026-07-19T14:33:18.739Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-19T14:33:18.777Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-19T14:33:18.908Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-19T14:33:21.847Z | full-production | stage-running | Started full-production. |
| 2026-07-19T14:33:23.447Z | full-production | stage-generated | Compiled 18 scenes and 46 locked cues into a 239.328s HyperFrames composition. |
| 2026-07-19T14:33:24.883Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T14:34:44.776Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T14:34:46.245Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T14:34:46.258Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T14:34:51.367Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3597/ |
| 2026-07-19T14:34:51.495Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T14:34:51.530Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T14:40:28.897Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-19T14:40:29.018Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-19T14:40:56.683Z | delivery-qa | stage-generated | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 2026-07-19T14:40:59.280Z | retrospective | stage-running | Started retrospective. |
| 2026-07-19T14:41:00.089Z | retrospective | stage-generated | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 2026-07-19T14:41:02.305Z | retrospective | stage-approved | Approved retrospective (internal-autonomous-review). |
| 2026-07-19T14:41:02.347Z | package-export | stage-running | Started package-export. |
| 2026-07-19T14:41:03.518Z | package-export | stage-generated | Assembled and verified the 329-file standard delivery package (internal-only; public release blocked=true). |
| 2026-07-19T14:53:18.521Z | style-probe | stage-reopened | Regenerated style probe after fixing reference-duration binding; previous still was black outside the 3.16s reference duration. |
| 2026-07-19T14:54:14.551Z | style-probe | stage-approved | Approved style-probe (internal-autonomous-review). |
| 2026-07-19T14:54:14.589Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-19T14:54:14.753Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-19T14:54:17.659Z | full-production | stage-running | Started full-production. |
| 2026-07-19T14:54:19.359Z | full-production | stage-generated | Compiled 18 scenes and 46 locked cues into a 239.328s HyperFrames composition. |
| 2026-07-19T14:54:20.714Z | qa-review | stage-running | Started qa-review. |
| 2026-07-19T14:55:32.488Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-19T14:55:33.036Z | final-preview | stage-running | Started final-preview. |
| 2026-07-19T14:55:33.052Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-19T14:55:36.075Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3597/ |
| 2026-07-19T14:55:36.197Z | final-preview | stage-approved | Approved final-preview (internal-autonomous-review). |
| 2026-07-19T14:55:36.230Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-19T15:01:18.523Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-19T15:01:19.851Z | delivery-qa | stage-running | Started delivery-qa. |

## Failures And Recovery

- A content-specific planning fallback is recorded at `plan/planning-fallback-receipt.json` and is bound to this project's narration and audio hashes.
- 1 failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.
- Recovery always resumes the first non-approved active stage and preserves unchanged WAV, alignment, composition and render artifacts.

## Remaining Release Gates

- Full human listening, including: `Coze`, `Dify`, `Codex`, `Claude Code`, `Agent`, `Demo`, `Magic`, `Engineering`, `30K`, `Token`.
- Public rights evidence for all unresolved entries in the rights ledger.
- Human full-timeline review in HyperFrames Studio.
- OCR/full semantic subtitle review is not automated in this baseline.
- Unverified numeric claims remain creator opinion, not measured statistics.
