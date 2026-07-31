# Imported batch-smoke-30s-20260720 Retrospective

## Outcome

- Project: `batch-smoke-30s-20260720`
- Scope: `internal-only`; public release blocked: `true`
- HyperFrames: 0.7.68 / 2 scenes / 6 cues / 31.808s
- Delivery: 1920x1080 / 30fps / H.264 + AAC
- Loudness: -13 LUFS; true peak: -1.3 dBFS
- Output SHA-256: `fdf6222d6d0aa256fcaec0bfe164767555768e057ab7f9305e3c31ed6726e29e`

## What Worked

- NarrationLock, voice recipe, alignment, subtitles and production manifests are hash-bound.
- CosyVoice preset 14 generated a project-specific WAV in 18 hash-bound parts.
- The deterministic compiler produced editable scene compositions and stable cue/object IDs.
- HyperFrames strict check passed; 12 cue/transition review frames and 4 delivery frames were generated. Studio service loading was verified without media playback.
- The workbench preserved edits, revisions, reopen events, downstream stale propagation and failed job receipts.

## Failures And Fixes

- The structured visual-planning adapter timed out after upstream 502 responses. No planning fallback receipt was found; the current deterministic formal planning bundle remained authoritative.
- Explicit screen-text regeneration now archives and replaces a stale frame-set binding after a composition rebuild; ordinary reads still reject stale evidence.
- High-quality delivery rendering now uses one worker to prevent automatic worker overcommit on memory-constrained production hosts.
- Audio alignment emits locked SRT, alignment validation and technical audio QA before delivery QA starts.
- Delivery documentation and visual-review frames are generated before the delivery manifest; this retrospective finalizes manifest integrity and SOP status.

## Human Adjustments

- Workbench artifact overrides recorded: 0.
- Production object overrides: `0`.
- No automated record is presented as user listening or user final approval.

## Remaining Release Gates

- The current render is not an unblocked public-release master.
- Publication rights are not fully cleared by the current approved rights receipt.
- Human listening approval is missing or stale for the current final audio.
- Human subtitle and screen-text review approvals are required for public release.
- Human final review is missing or stale for the current preview and composition.
- OCR/full semantic subtitle review remains manual in this baseline.
- User full-timeline approval in HyperFrames Studio remains required.

## SOP Improvements Promoted

- Added deterministic planning fallback receipts, audio QA/SRT export, style-probe replay, complete HyperFrames scaffolding, visual-review receipts, process log generation and manifest finalization.
- Content-specific DemoText fallbacks remain project-local; they are not promoted as a global rule for unrelated scripts.
- Formal project state after media QA: `internal-delivery-ready`.

## User Validation And Next-Run Feedback (2026-07-28)

- The user watched the complete 32.17-second one-screen render and approved it. The bound receipt is `review/one-screen-final-review.json`.
- Keep the fixed host region, cumulative board construction, restrained chapter changes, readable captions, and the absence of transparent history layers.
- The normal production target is now about five minutes, not 30 seconds.
- Do not stretch one board across five minutes. Use 6-10 stable chapter boards, each held for roughly 30-60 seconds and progressively built from 3-6 semantic nodes.
- Keep the same host character and region across the full video. Pose changes are allowed only sparingly at semantic chapter boundaries, never as a frequent visual refresh.
- Rotate the primary semantic carrier between diagram/path, comparison/morph, data/evidence, timeline/progress, product/code surface, and conclusion/annotation. Adjacent chapters should not repeat the same primary family, and no family may lead more than two consecutive chapters.
- Each chapter should compose 2-4 seek-safe atomic motion rules on one paused deterministic timeline. Do not add decorative spins, particles, random motion, infinite loops, or frequent camera zooms merely to appear varied.
- This feedback is project-level evidence for the next real-script trial. It is not promoted to a global Codex skill and does not authorize batch production, P1/P2 work, new frameworks, or more audit features.
