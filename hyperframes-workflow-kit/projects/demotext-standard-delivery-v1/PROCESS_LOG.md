# AutoVideo Process Log

## Run Identity

- Project ID: `demotext-standard-delivery-v1`
- Source: `demo/demoText.txt`
- Source SHA-256: `ec1a51a269faf0344b2ba93abf21c4a75b8aac51d4a0996bd43ac2c66af33198`
- Narration normalized SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Voice: CosyVoice preset 14, Chinese female, FP32, stream=false, speed=1.03, seed=7
- Template: `modern-ip-host-explainer@1.0.0`
- Palette: `light-apricot`
- Output: landscape 16:9, 1920x1080, 30fps
- Platform profile: Douyin landscape knowledge explainer
- Started at: `2026-07-19T00:54:07+08:00`

## Operating Rules

1. `NarrationLock.json` is immutable. Any wording change requires a new project revision.
2. The final WAV duration is the timing source of truth; `275s` is only the initialization estimate.
3. Full production is blocked until `video:template-status` returns `readyForComposition=true`.
4. HyperFrames is the only full-video composition, Studio review, and final render layer.
5. Every generated or reused asset requires a path, SHA-256, source, license status, and fallback.
6. Human edits are recorded as project overrides and must invalidate affected downstream artifacts.
7. Public delivery is blocked while voice or asset rights remain unresolved.

## Execution Record

| Time | Stage | Command or action | Result | Receipt |
|---|---|---|---|---|
| 2026-07-19 00:51 +08:00 | Project initialization | `npm.cmd run video:new -- --id demotext-standard-delivery-v1 --narration demo/demoText.txt --ratio 16:9 --duration 275s --platform 抖音 ...` | Passed; formal project and NarrationLock created | `NarrationLock.json`, `project-state.json` |
| 2026-07-19 00:51 +08:00 | Template lock | `npm.cmd run video:apply-template -- --project demotext-standard-delivery-v1 --style modern-ip-host-explainer` | Passed; approved template and default palette locked | `template-lock.json` |
| 2026-07-19 00:52 +08:00 | Readiness baseline | `npm.cmd run video:template-status -- --project demotext-standard-delivery-v1` | `readyForProjectProbe=true`; task/style/audio/final preview still pending | command output |
| 2026-07-19 00:54 +08:00 | Engineering records | Created delivery checklist, pipeline recipe, content approval, claim ledger, pronunciation ledger, and this log | In progress | project root and `input/` |
| 2026-07-19 00:59 +08:00 | Environment preflight | Checked CosyVoice venv/model/CUDA, GPU memory, E: free space, FFmpeg and media-use dependencies | Passed for local production; CosyVoice WebUI must stop before batch inference; HeyGen unavailable and not used | command output |
| 2026-07-19 01:10 +08:00 | Workbench registration | Created the matching workbench project with `publicationRights=internal-only` | Passed; public release remains blocked | `workflow-console/data/db.json` |
| 2026-07-19 01:13 +08:00 | Source registration | Generated source registry through the workbench | Passed; one source with SHA-256 | workbench `source-register` artifact and event |
| 2026-07-19 01:16 +08:00 | Script review | Generated and approved the workbench script artifact | Passed; normalized content equals NarrationLock hash | workbench `script-review` artifact and event |
| 2026-07-19 01:46 +08:00 | Voice attempt 1 | Triggered workbench `voice-final` | Safely failed before model load because old segmentation dropped CRLF paragraph breaks | failed workbench job `155a3440-e98a-48b2-b9a3-3ae044fb6142` |
| 2026-07-19 01:51 +08:00 | Voice attempt 2 | Ran CosyVoice preset 14 batch with 18 parts and one model load | Passed; final WAV is 239.908667s | `audio/voice.recipe.json`, `audio/parts/`, workbench job `12eb65be-2409-4c0c-9a2c-203f75e92db0` |
| 2026-07-19 01:58 +08:00 | Audio technical QA | Verified hashes, format, full decode, loudness, peak and silence | Passed for internal production; human listening and public rights remain blocked | `audio/qa-report.json` |
| 2026-07-19 02:22 +08:00 | Locked alignment | Preserved Whisper output as raw ASR evidence, then mapped its timing to NarrationLock characters and sentence cues | Passed with documented limitation: CER 8.2003%, 110 interpolated characters; not forced alignment | `audio/alignment.asr.json`, `audio/alignment.json` |
| 2026-07-19 02:54 +08:00 | Alignment and subtitle validation | Verified WAV/ASR/NarrationLock hashes, monotonic timing, full locked-text reconstruction and cue CPS; exported SRT only from locked cues | Passed; 46 contiguous cues, maximum 8.75 CPS; raw `transcriptText` is evidence-only and forbidden as a downstream text source | `captions/alignment-validation.json`, `captions/narration.zh-CN.srt` |
| 2026-07-19 02:54 +08:00 | Stale artifact isolation | Moved the pre-current-ASR test alignment out of the active audio directory | Passed; archived artifact remains for audit only and must not be consumed | `audio/archive/alignment.locked.test.stale.json` |
| 2026-07-19 03:22 +08:00 | Audio handoff | Bound the final WAV, alignment, recipe, NarrationLock and approval scope | Passed for technical/internal use; `codex-technical-review` did not perform human listening and public release remains blocked | `audio-handoff.json` |
| 2026-07-19 03:22 +08:00 | Planning contracts | Bound the 14-scene storyboard, 46-shot manifest and four Graph IR plans to locked narration/alignment hashes | Passed as planning evidence; this is not final composition approval | `plan/storyboard.json`, `plan/shot-manifest.json`, `plan/graph-ir.json`, `plan/production-manifest.json` |
| 2026-07-19 04:43 +08:00 | Task gate | Recorded internal autonomous task review | Approved by `codex-autonomous-internal-review`; this identity must not be represented as user approval | `project-state.json` |
| 2026-07-19 05:04 +08:00 | Project probe and style gate | Rendered and checked the same-window still/motion probe, then recorded internal autonomous review | Probe evidence passed; approved by `codex-autonomous-internal-review` for internal scope only | `review/probe-review.json`, `style-selection.json`, `STYLE_REVIEW.md` |
| 2026-07-19 05:14 +08:00 | SOP status synchronization | Created the replayable overrides contract and regenerated status from artifact hashes and recorded identities | Passed; overrides revision 0 records no manual overrides; full composition is present but unverified; formal composition/final-render readiness remain false | `overrides/overrides.json`, `SOP_STATUS.json` |
| 2026-07-19 06:12 +08:00 | Deterministic full production | Replaced the generic Codex full-production adapter with `tools/hyperframes-production/compile-production.mjs` and ran it through the workbench | Passed; 14 scenes, 46 locked cues, 239.909s, composition digest recorded | `production/hyperframes/data/composition-build.json`, workbench `full-production` receipt |
| 2026-07-19 06:13 +08:00 | HyperFrames strict QA | Ran the pinned HyperFrames 0.7.62 strict check against the formal composition | Passed; structure, runtime, layout, motion and contrast had no blockers | `qa/hyperframes-check.json`, workbench `qa-review` receipt |
| 2026-07-19 06:21 +08:00 | Studio internal preview | Inspected start, middle and end main-composition captures and bound the full directory digest | Approved only as `internal-autonomous-review`; not user approval | `qa/final-preview.json`, workbench `final-preview` receipt |
| 2026-07-19 06:29 +08:00 | High-quality render | Rendered with HyperFrames 0.7.62 at 1920x1080 / 30fps and performed full decode | Passed; 239.936s H.264/AAC internal-review MP4, SHA-256 `2a496992...` | `renders/demotext-standard-delivery-v1-internal-review.mp4` |
| 2026-07-19 06:46 +08:00 | Delivery QA and package | Ran ffprobe, full decode, loudness, peak, black, silence and freeze checks; extracted cover and review frames; updated assets and hashes | Passed for internal review; -13.3 LUFS, -1.1 dBFS, no black or long-silence warnings | `qa/report.json`, `qa/delivery-report.json`, `delivery/delivery-manifest.json` |
| 2026-07-19 06:47 +08:00 | Retrospective and state reconciliation | Generated project retrospective and synchronized formal/workbench status | Internal delivery ready; public release blocked | `RETROSPECTIVE.md`, `SOP_STATUS.json`, `project-state.json` |

## Remaining Public-Release And Scale Gates

- Human listening approval for terminology, pauses, clipping, discontinuities and segment joins
- Human timing review or forced alignment if word-highlight, lip-sync or phoneme-precise motion is selected
- Human/user confirmation of the internal autonomous task/style decisions if required for the release workflow
- Public voice/host rights clearance and evidence treatment for unverified numeric claims
- Full OCR/subtitle semantic review and user final watching approval
- Real materials-route and real spoken-audio-route benchmark projects
- Public `video:template-status` remains false until listening and rights are approved

## End State

- Internal planning, composition and delivery readiness: `true`
- Public release readiness: `false`
- Internal MP4, SRT, cover, QA reports, AssetManifest, delivery manifest, Runbook and retrospective: present and hashed
