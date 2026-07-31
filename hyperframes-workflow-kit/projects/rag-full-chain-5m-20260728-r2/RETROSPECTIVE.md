# RAG 全链路口播：选型、生产实践与提升 Retrospective

## Outcome

- Project: `rag-full-chain-5m-20260728-r2`
- Scope: `internal-only`; public release blocked: `true`
- HyperFrames: 0.7.77 / 71 scenes / 237 cues / 1880.218s
- Delivery: 1920x1080 / 30fps / H.264 + AAC
- Loudness: -17.8 LUFS; true peak: -3.7 dBFS
- Output SHA-256: `87b83ea59c300473cc869d1acffa94bde0a7abba871b392465fd74506691d7b6`

## What Worked

- NarrationLock, voice recipe, alignment, subtitles and production manifests are hash-bound.
- CosyVoice preset 14 generated a project-specific WAV in 18 hash-bound parts.
- The deterministic compiler produced editable scene compositions and stable cue/object IDs.
- HyperFrames strict check passed; 237 cue/transition review frames and 4 delivery frames were generated. Studio service loading was verified without media playback.
- The workbench preserved edits, revisions, reopen events, downstream stale propagation and failed job receipts.

## Failures And Fixes

- The structured visual-planning adapter timed out after upstream 502 responses. A documented structure-only fallback rebound all V2 timings and hashes.
- Explicit screen-text regeneration now archives and replaces a stale frame-set binding after a composition rebuild; ordinary reads still reject stale evidence.
- High-quality delivery rendering now uses one worker to prevent automatic worker overcommit on memory-constrained production hosts.
- Audio alignment emits locked SRT, alignment validation and technical audio QA before delivery QA starts.
- Delivery documentation and visual-review frames are generated before the delivery manifest; this retrospective finalizes manifest integrity and SOP status.

## Human Adjustments

- Workbench artifact overrides recorded: 1.
- Production object overrides: `0`.
- No automated record is presented as user listening or user final approval.

## Remaining Release Gates

- The current render is not an unblocked public-release master.
- Publication rights are not fully cleared by the current approved rights receipt.
- Pronunciation review was not completed through full listening or an acronym-only machine approval.
- Human subtitle and screen-text review approvals are required for public release.
- Human final review is missing or stale for the current preview and composition.
- OCR/full semantic subtitle review remains manual in this baseline.
- User full-timeline approval in HyperFrames Studio remains required.

## SOP Improvements Promoted

- Added deterministic planning fallback receipts, audio QA/SRT export, style-probe replay, complete HyperFrames scaffolding, visual-review receipts, process log generation and manifest finalization.
- Content-specific DemoText fallbacks remain project-local; they are not promoted as a global rule for unrelated scripts.
- Formal project state after media QA: `internal-delivery-ready`.
