# DemoText 标准化完整交付 V3 Retrospective

## Outcome

- Project: `demotext-standard-delivery-v3`
- Scope: `internal-only`; public release blocked: `true`
- HyperFrames: 0.7.62 / 14 scenes / 46 cues / 242.904042s
- Delivery: 1920x1080 / 30fps / H.264 + AAC
- Loudness: -13.2 LUFS; true peak: -1.2 dBFS
- Output SHA-256: `81fc1e8dfaff63e1cb09b32928b1c438b3ebe88bcbf2b1d2ef1697774cdd3829`

## What Worked

- NarrationLock, voice recipe, alignment, subtitles and production manifests are hash-bound.
- CosyVoice preset 14 generated a project-specific WAV in 18 hash-bound parts.
- The deterministic compiler produced editable scene compositions and stable cue/object IDs.
- HyperFrames strict check, 14-scene sample review, Studio timeline loading and final media QA passed.
- The workbench preserved edits, revisions, reopen events, downstream stale propagation and failed job receipts.

## Failures And Fixes

- The structured visual-planning adapter timed out after upstream 502 responses. A documented content-specific fallback rebound the current project timing and input hashes.
- Full production now initializes content ledgers and the overrides contract before compiling, so a fresh project does not depend on hidden hand-created files.
- Audio alignment now emits locked SRT, alignment validation and technical audio QA before delivery QA starts.
- Delivery documentation and visual-review frames are generated before the delivery manifest; this retrospective finalizes manifest integrity and SOP status.

## Human Adjustments

- Workbench artifact overrides recorded: 0.
- Production object overrides: `0`.
- No automated record is presented as user listening or user final approval.

## Remaining Release Gates

- The current render is not an unblocked public-release master.
- Publication rights are not fully cleared by the current approved rights receipt.
- Human listening approval is missing or stale for the current final audio.
- Human final review is missing or stale for the current preview and composition.
- OCR/full semantic subtitle review remains manual in this baseline.
- User full-timeline approval in HyperFrames Studio remains required.

## SOP Improvements Promoted

- Added deterministic planning fallback receipts, audio QA/SRT export, style-probe replay, complete HyperFrames scaffolding, visual-review receipts, process log generation and manifest finalization.
- Content-specific DemoText fallbacks remain project-local; they are not promoted as a global rule for unrelated scripts.
- Formal project state after media QA: `internal-delivery-ready`.
