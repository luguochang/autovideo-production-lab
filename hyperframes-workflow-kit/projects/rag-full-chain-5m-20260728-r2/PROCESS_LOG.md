# AutoVideo Process Log - rag-full-chain-5m-20260728-r2

## Run Identity

- Project ID: `rag-full-chain-5m-20260728-r2`
- Source: `content/intakes/rag-full-chain-5m-20260728-r2-101212ee31a7/script.approved.txt`
- Source SHA-256: `0bd400ff29c30be0161c3a927926dc09cc25a4f448cfaa35d6a46afc854f9c97`
- Narration SHA-256: `bdf2796e70774507b7ccfc50a66f925ae6b51917f188b976a8c6bb4691cfcf94`
- Voice: CosyVoice preset 14 / Chinese female / FP32 / stream=false / speed=1.03 / seed=7
- Audio: 1880.218458s / pcm_s16le / 48kHz mono / -16 LUFS / -1.5 dBFS
- Template: `modern-ip-host-explainer@1.0.0` / `light-apricot`
- HyperFrames: `0.7.77` / 1920x1080 / 30fps / 71 scenes / 237 cues
- Delivery SHA-256: `87b83ea59c300473cc869d1acffa94bde0a7abba871b392465fd74506691d7b6`
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
| 2026-07-28T08:58:58.901Z | project | project-created | Created workbench project. |
| 2026-07-28T08:58:58.937Z | source-register | content-intake-recorded | Registered immutable pasted-text input (1 file(s)). |
| 2026-07-28T09:01:03.172Z | source-register | stage-running | Started source-register. |
| 2026-07-28T09:01:03.247Z | source-register | stage-generated | Registered 1 source file(s) with SHA-256 receipts. |
| 2026-07-28T09:02:14.255Z | material-suitability | stage-running | Started material-suitability. |
| 2026-07-28T09:02:14.338Z | material-suitability | stage-generated | Registered sources can enter spoken rewriting after human review. |
| 2026-07-28T09:02:14.664Z | evidence-ledger | stage-running | Started evidence-ledger. |
| 2026-07-28T09:02:14.772Z | evidence-ledger | stage-generated | Extracted 83 source-bound claim(s) with prompt provenance. |
| 2026-07-28T09:02:30.970Z | evidence-ledger | stage-approved | Approved evidence-ledger (human-review). |
| 2026-07-28T09:02:44.458Z | spoken-rewrite | stage-running | Started spoken-rewrite. |
| 2026-07-28T09:02:44.545Z | spoken-rewrite | stage-failed | Target duration must contain a positive number of seconds: audio-driven |
| 2026-07-28T09:03:07.517Z | project | project-updated | Updated project settings and dependency state. |
| 2026-07-28T09:03:26.235Z | spoken-rewrite | stage-running | Started spoken-rewrite. |
| 2026-07-28T09:03:26.331Z | spoken-rewrite | stage-generated | Prepared 1 source-bound spoken section(s) for review. |
| 2026-07-28T09:04:02.896Z | content-duration-fit | stage-running | Started content-duration-fit. |
| 2026-07-28T09:04:02.990Z | content-duration-fit | stage-generated | Text duration budget passed at 6.26 graphemes/s; final WAV timing remains authoritative. |
| 2026-07-28T09:04:03.283Z | claim-source-review | stage-running | Started claim-source-review. |
| 2026-07-28T09:04:03.460Z | claim-source-review | stage-generated | passed: 0 claim/source issue(s). |
| 2026-07-28T09:04:03.649Z | script-review | stage-running | Started script-review. |
| 2026-07-28T09:04:03.730Z | script-review | stage-generated | Prepared narration for small manual edits and approval. |
| 2026-07-28T09:04:52.938Z | script-review | stage-approved | Approved script-review (human-review). |
| 2026-07-28T09:04:53.026Z | content-approval | stage-running | Started content-approval. |
| 2026-07-28T09:04:53.196Z | content-approval | stage-generated | Content chain is ready for explicit human wording approval. |
| 2026-07-28T09:04:53.487Z | content-approval | stage-approved | Approved content-approval (human-review). |
| 2026-07-28T09:05:10.728Z | narration-lock | stage-running | Started narration-lock. |
| 2026-07-28T09:05:11.098Z | narration-lock | stage-generated | Created formal video project and immutable NarrationLock. |
| 2026-07-28T09:06:38.980Z | template-lock | stage-running | Started template-lock. |
| 2026-07-28T09:06:39.169Z | template-lock | stage-generated | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 2026-07-28T09:07:46.757Z | pronunciation-review | stage-running | Started pronunciation-review. |
| 2026-07-28T09:19:10.927Z | pronunciation-review | stage-generated | Generated 82 in-context candidates for 41 pronunciation term(s); human listening is required. |
| 2026-07-28T11:53:12.989Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 1/41 term(s). |
| 2026-07-28T12:10:06.894Z | pronunciation-review | stage-reopened | Apply submitted pronunciation retake feedback: enforce approved letter-acronym forms in probe context and add project aliases. |
| 2026-07-28T12:10:06.994Z | pronunciation-review | stage-running | Started pronunciation-review. |
| 2026-07-28T12:22:17.954Z | pronunciation-review | stage-generated | Generated 89 in-context candidates for 41 pronunciation term(s); human listening is required. |
| 2026-07-28T12:24:39.900Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 1/41 term(s). |
| 2026-07-28T12:28:25.579Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 1/41 term(s). |
| 2026-07-28T12:47:47.318Z | pronunciation-review | stage-running | Started pronunciation-review. |
| 2026-07-28T13:00:26.580Z | pronunciation-review | stage-generated | Generated 82 in-context candidates for 41 pronunciation term(s); human listening is required. |
| 2026-07-28T13:02:54.291Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 1/41 term(s). |
| 2026-07-28T13:03:23.001Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 1/41 term(s). |
| 2026-07-28T13:14:55.689Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 3/41 term(s). |
| 2026-07-28T13:15:35.811Z | pronunciation-review | text-review-progress-saved | Saved pronunciation review progress for 3/41 term(s). |
| 2026-07-28T13:24:37.282Z | pronunciation-review | text-review-approved | Accepted the user-selected pronunciations without claiming the remaining candidates were heard. |
| 2026-07-28T13:25:19.383Z | pronunciation-review | stage-reopened | Correct the skip-reason wording so it does not hard-code an outdated remaining-candidate count. |
| 2026-07-28T13:25:19.803Z | pronunciation-review | text-review-approved | Accepted the user-selected pronunciations without claiming the remaining candidates were heard. |
| 2026-07-28T13:25:33.390Z | voice-final | stage-running | Started voice-final. |
| 2026-07-28T14:07:52.569Z | voice-final | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\tools\voice-lab\merge_breath_audio.mjs" --manifest "E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projec |
| 2026-07-28T14:14:36.767Z | voice-final | stage-running | Started voice-final. |
| 2026-07-28T14:16:37.449Z | voice-final | stage-generated | Generated candidate-001 in 237 part(s). The existing final WAV was not changed; complete the dedicated A/B file review to promote this candidate. |
| 2026-07-28T15:09:11.372Z | voice-final | voice-candidate-promoted | Promoted candidate-001 as narration.final.wav after dedicated file listening review. |
| 2026-07-28T15:09:48.773Z | audio-align | stage-running | Started audio-align. |
| 2026-07-28T15:15:43.981Z | audio-align | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\scripts\finalize-audio-delivery.mjs" --project rag-full-chain-5m-20260728-r2 Error: Command failed: E:\project\study |
| 2026-07-28T15:23:10.783Z | audio-align | stage-running | Started audio-align. |
| 2026-07-28T15:23:34.777Z | audio-align | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\scripts\finalize-audio-delivery.mjs" --project rag-full-chain-5m-20260728-r2 Error: Command failed: E:\project\study |
| 2026-07-28T15:26:54.675Z | audio-align | stage-running | Started audio-align. |
| 2026-07-28T15:27:18.292Z | audio-align | stage-failed | Command failed with exit code 1: "E:\software\system\nodejs\node.exe" "E:\project\study\codex\autoVideo\scripts\finalize-audio-delivery.mjs" --project rag-full-chain-5m-20260728-r2 Error: Command failed: E:\project\study |
| 2026-07-28T15:33:58.958Z | audio-align | stage-running | Started audio-align. |
| 2026-07-28T15:34:28.315Z | audio-align | stage-generated | Mapped 8083 Whisper timestamps (reused current ASR evidence) to 8976 exact NarrationLock characters and 237 caption cues; generated locked SRT and technical audio QA (-16 LUFS). Phoneme-level forced alignment remains a d |
| 2026-07-28T15:35:09.311Z | subtitle-qa | stage-running | Started subtitle-qa. |
| 2026-07-28T15:35:09.437Z | subtitle-qa | stage-generated | Subtitle machine QA passed for 237 cues; human semantic review and OCR remain separate gates. |
| 2026-07-28T15:35:09.873Z | subtitle-review | stage-running | Started subtitle-review. |
| 2026-07-28T15:35:09.984Z | subtitle-review | stage-generated | Prepared human subtitle review for 237 locked cue(s); no cue was accepted automatically. |
| 2026-07-28T15:48:56.078Z | subtitle-review | text-review-approved | Approved subtitle-review through its dedicated review endpoint. |
| 2026-07-28T15:49:37.719Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-28T15:49:38.259Z | rights-clearance | stage-generated | Prepared publication rights v2 review with 6 item(s) and 4 current inventory binding(s). |
| 2026-07-28T23:33:22.109Z | rights-clearance | stage-approved | Approved rights-clearance (human-review). |
| 2026-07-28T23:33:56.088Z | audio-handoff | stage-running | Started audio-handoff. |
| 2026-07-28T23:33:57.271Z | audio-handoff | stage-generated | Attached final audio (1880.218458s) and alignment with rights=needs-review. |
| 2026-07-28T23:35:19.397Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-28T23:35:19.689Z | visual-plan | stage-failed | Planning contract validation failed: - Alignment cue cue-003 is not contiguous with the previous cue. - Alignment cue cue-004 is not contiguous with the previous cue. - Alignment cue cue-008 is not contiguous with the pr |
| 2026-07-28T23:42:24.625Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-28T23:42:24.748Z | visual-plan | stage-generated | Imported formal planning SSOT with 107 scene(s), 15 graph(s), and 237 shot(s). |
| 2026-07-29T00:00:04.907Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-29T00:00:05.051Z | visual-plan | stage-generated | Imported formal planning SSOT with 107 scene(s), 15 graph(s), and 237 shot(s). |
| 2026-07-29T00:37:09.243Z | visual-plan | stage-running | Started visual-plan. |
| 2026-07-29T00:37:09.395Z | visual-plan | stage-generated | Imported formal planning SSOT with 71 scene(s), 13 graph(s), and 237 shot(s). |
| 2026-07-29T00:37:31.516Z | rights-clearance | stage-running | Started rights-clearance. |
| 2026-07-29T00:37:32.043Z | rights-clearance | stage-generated | Prepared publication rights v2 review with 6 item(s) and 4 current inventory binding(s). |
| 2026-07-29T00:56:10.783Z | visual-plan | stage-approved | Approved visual-plan (human-review). |
| 2026-07-29T00:56:17.813Z | diagram-assets | stage-running | Started diagram-assets. |
| 2026-07-29T00:56:18.373Z | diagram-assets | stage-generated | Computed ELK layouts for 13 canonical planning graph(s). |
| 2026-07-29T01:07:06.426Z | style-probe | stage-running | Started style-probe. |
| 2026-07-29T01:07:06.904Z | style-probe | stage-generated | Imported the hash-bound 5.16s style probe for internal review. |
| 2026-07-29T01:31:20.178Z | style-probe | stage-approved | Approved style-probe (human-review). |
| 2026-07-29T01:47:13.754Z | style-probe | stage-reopened | Structural plan approved; visual quality remains pending until the user reviews the rendered motion probe and keyframes. |
| 2026-07-29T01:52:50.801Z | style-probe | artifact-edited | Clarify structural and visual approval scope. |
| 2026-07-29T02:19:45.334Z | style-probe | stage-approved | Approved style-probe (human-review). |
| 2026-07-29T02:20:31.387Z | visual-variety-qa | stage-running | Started visual-variety-qa. |
| 2026-07-29T02:20:31.552Z | visual-variety-qa | stage-generated | Visual variety QA passed: 5 carriers and 5 recipes across 237 cues. |
| 2026-07-29T02:20:33.148Z | composition-readiness | stage-running | Started composition-readiness. |
| 2026-07-29T02:20:33.647Z | composition-readiness | stage-generated | Technical checks passed for internal-only composition; public release remains blocked. |
| 2026-07-29T02:20:35.034Z | full-production | stage-running | Started full-production. |
| 2026-07-29T02:20:36.302Z | full-production | stage-failed | Command failed with exit code 1: node tools/hyperframes-production/compile-production.mjs --project hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2 Error: Motion recipes are not authorized for full produc |
| 2026-07-29T02:24:00.725Z | full-production | stage-running | Started full-production. |
| 2026-07-29T02:24:02.611Z | full-production | stage-failed | Command failed with exit code 1: node tools/hyperframes-production/compile-production.mjs --project hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2 Error: One-screen MVP supports 1-6 cues; received 237. R |
| 2026-07-29T02:28:13.541Z | full-production | stage-running | Started full-production. |
| 2026-07-29T02:28:34.785Z | full-production | stage-failed | Command failed with exit code 1: npx.cmd --yes "hyperframes@0.7.77" snapshot --at "1.3,7,17.71,26.74,31.71,35.29,39.98,48.47,54.53,62.32,76.42,85.42,94.93,106.24,113.41,128.51,142.03,145.82,151,156.46,159.08,161.58,170.3 |
| 2026-07-29T02:44:21.758Z | full-production | stage-running | Started full-production. |
| 2026-07-29T02:48:56.966Z | full-production | stage-generated | Compiled 71 scenes and 237 locked cues into a 1880.218s HyperFrames composition. |
| 2026-07-29T02:48:57.500Z | qa-review | stage-running | Started qa-review. |
| 2026-07-29T02:49:19.043Z | qa-review | stage-failed | Command failed with exit code 1: npx.cmd --yes "hyperframes@0.7.77" check "E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projects\rag-full-chain-5m-20260728-r2\production\hyperframes" --strict --json { "ok":  |
| 2026-07-29T02:58:05.103Z | qa-review | stage-running | Started qa-review. |
| 2026-07-29T02:58:05.868Z | qa-review | stage-failed | The composition no longer matches the full-production receipt. Regenerate full production before QA. |
| 2026-07-29T02:58:45.350Z | full-production | stage-reopened | Regenerate after closing long-form selector and device tween QA fixes. |
| 2026-07-29T03:00:12.605Z | full-production | stage-running | Started full-production. |
| 2026-07-29T03:04:20.587Z | full-production | stage-generated | Compiled 71 scenes and 237 locked cues into a 1880.218s HyperFrames composition. |
| 2026-07-29T03:05:30.787Z | qa-review | stage-running | Started qa-review. |
| 2026-07-29T03:08:07.189Z | qa-review | stage-failed | Command failed with exit code 1: npx.cmd --yes "hyperframes@0.7.77" check "E:\project\study\codex\autoVideo\hyperframes-workflow-kit\projects\rag-full-chain-5m-20260728-r2\production\hyperframes" --strict --json { "ok":  |
| 2026-07-29T03:30:06.861Z | full-production | stage-reopened | Regenerate after selector, contrast, and occlusion QA fixes. |
| 2026-07-29T03:30:16.788Z | full-production | stage-running | Started full-production. |
| 2026-07-29T03:34:53.650Z | full-production | stage-generated | Compiled 71 scenes and 237 locked cues into a 1880.218s HyperFrames composition. |
| 2026-07-29T03:37:52.303Z | qa-review | stage-running | Started qa-review. |
| 2026-07-29T03:40:22.896Z | qa-review | stage-generated | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 2026-07-29T03:40:23.501Z | screen-text-review | stage-running | Started screen-text-review. |
| 2026-07-29T03:50:25.548Z | screen-text-review | stage-generated | Prepared screen-text review for 237 hash-bound cue snapshot(s); OCR=unavailable (RapidOCR ONNXRuntime), and human frame review remains required. |
| 2026-07-29T05:46:46.913Z | screen-text-review | text-review-approved | Accepted screen-text-review through its creator-delegated internal-only simulation endpoint. |
| 2026-07-29T05:48:34.366Z | final-preview | stage-running | Started final-preview. |
| 2026-07-29T05:48:34.499Z | final-preview | stage-generated | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 2026-07-29T05:52:20.348Z | final-preview | preview-started | Opened HyperFrames Studio at http://127.0.0.1:3526/ |
| 2026-07-29T05:54:43.683Z | final-preview | final-preview-internal-approved | Accepted final preview through creator-delegated internal-only simulation. |
| 2026-07-29T05:55:16.677Z | render-deliver | stage-running | Started render-deliver. |
| 2026-07-29T07:09:48.486Z | render-deliver | stage-generated | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 2026-07-29T07:09:50.791Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-29T07:13:10.747Z | delivery-qa | stage-failed | HyperFrames check is stale for the current composition or build receipt. |
| 2026-07-29T07:19:41.273Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-29T07:22:57.297Z | delivery-qa | stage-failed | HyperFrames check is stale for the current composition or build receipt. |
| 2026-07-29T07:25:32.552Z | delivery-qa | stage-running | Started delivery-qa. |
| 2026-07-29T07:30:38.221Z | delivery-qa | stage-failed | True peak exceeds the internal-review ceiling: 0.1 dBFS. |
| 2026-07-29T07:43:54.779Z | render-deliver | stage-generated | Repackaged the locked WAV at -1.8 dB with H.264 stream copy; full decode, video-stream identity and loudness checks passed. |
| 2026-07-29T07:44:46.036Z | delivery-qa | stage-running | Started delivery-qa. |

## Failures And Recovery

- A content-specific planning fallback is recorded at `plan/planning-fallback-receipt.json` and is bound to this project's narration and audio hashes.
- 15 failed workbench job(s) are retained for audit; no failed artifact was promoted as approval evidence.
- Recovery always resumes the first non-approved active stage and preserves unchanged WAV, alignment, composition and render artifacts.

## Remaining Release Gates

- Full human listening, including: .
- Public rights evidence for all unresolved entries in the rights ledger.
- Human full-timeline review in HyperFrames Studio.
- OCR/full semantic subtitle review is not automated in this baseline.
- Unverified numeric claims remain creator opinion, not measured statistics.
