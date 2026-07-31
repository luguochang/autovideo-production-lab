# DemoText 标准交付 V2 Retrospective

## Outcome

- Project: `demotext-standard-delivery-v2`
- Scope: `internal-only`; public release blocked: `true`
- HyperFrames: 0.7.62 / 14 scenes / 46 cues / 239.328167s
- Delivery: 1920x1080 / 30fps / H.264 + AAC
- Loudness: -13.3 LUFS; true peak: -1 dBFS
- Output SHA-256: `e0c4ea6bc7c2c9d603dddc2c904355ebc95d3abb6f575cb5579bd51460bc48db`

## What Worked

- NarrationLock, voice recipe, alignment, subtitles and production manifests are hash-bound.
- CosyVoice preset 14 regenerated a fresh V2 WAV in 18 parts.
- The deterministic compiler produced editable scene compositions and stable cue/object IDs.
- HyperFrames strict check, 14-scene sample review, Studio timeline loading and final media QA passed.
- The workbench preserved edits, revisions, reopen events, downstream stale propagation and failed job receipts.

## Failures And Fixes

- The structured visual-planning adapter timed out after upstream 502 responses. A documented structure-only fallback rebound all V2 timings and hashes.
- The first full-production attempt exposed a missing HyperFrames project scaffold. The compiler now writes the complete project contract and installs the pinned font dependency.
- Studio discovery exposed `meta.id` and cold-load route issues. The compiler now aligns metadata with the composition directory; the workbench opens the Studio root before selecting `index.html`.
- Delivery QA previously depended on a retrospective that was scheduled later. The manifest is now finalized by this retrospective stage.

## Human Adjustments

- Workbench artifact overrides recorded: 1.
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
