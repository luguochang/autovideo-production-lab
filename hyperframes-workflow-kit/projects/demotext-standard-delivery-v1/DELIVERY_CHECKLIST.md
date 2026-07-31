# Standard Delivery Checklist

Status values: `pending`, `passed`, `blocked`, `not-applicable`.

## Immutable Inputs And Locks

- [x] `input/narration.txt`
- [x] `NarrationLock.json`
- [x] `template-lock.json`
- [x] `input/content-approval.json` validated and approved for internal production
- [x] `input/claim-ledger.json` reviewed for screen presentation
- [ ] `input/pronunciation.json` fully approved or explicitly waived; approved defaults were consumed, 10 terms still require listening review

## Audio

- [x] `audio/parts/*.wav` and per-part recipes
- [x] `audio/narration.final.wav`, 48kHz mono PCM
- [x] `audio/voice.recipe.json` bound to NarrationLock and final WAV hashes
- [ ] Listening review: terminology, pauses, clipping, discontinuities and segment joins
- [x] `audio/alignment.json` bound to the final WAV, raw ASR evidence and NarrationLock; validation in `captions/alignment-validation.json`
- [x] `audio-handoff.json`; approval scope is `technical-only`, human listening is still pending
- [x] Voice publication rights status recorded as `needs-review`; public release remains blocked until `approved`

## Planning And Assets

- [x] `VIDEO_TASK.md`
- [x] `STYLE_REVIEW.md`; approval identity is `codex-autonomous-internal-review`, not user approval
- [x] `style-selection.json`; scope is internal autonomous review
- [x] `STORYBOARD.md`
- [x] `plan/shot-manifest.json`
- [x] `AssetManifest.json`
- [x] `production/hyperframes/.media/manifest.jsonl`
- [x] `production/hyperframes/.media/index.md`
- [x] `overrides/overrides.json`; revision 0 means no manual overrides have been recorded
- [x] `SOP_STATUS.json` generated from artifact hashes and recorded approval identities

## HyperFrames Production

- [x] Same-window static master frame
- [x] Same-window 3-8 second motion probe
- [x] Task and style gates approved for internal autonomous review by `codex-autonomous-internal-review`; not a user/public approval
- [x] Workbench internal readiness passed; formal public `readyForComposition` remains false until listening/rights clear
- [x] Full composition verified: 14 scenes, 46 cues, 239.909s, deterministic build receipt
- [x] `hyperframes check --strict` passes
- [x] Required scene midpoint snapshots and start/middle/end final MP4 frames inspected
- [x] Full timeline reviewed in HyperFrames Studio under `internal-autonomous-review`; this is not user approval
- [x] Internal-only final preview approval bound to the composition directory digest

## Delivery And QA

- [x] High-quality internal-review MP4, 1920x1080, 30fps, H.264/AAC; public master remains blocked
- [x] SRT subtitles from NarrationLock exact cues: `captions/narration.zh-CN.srt`
- [x] Cover PNG
- [x] Full decode and ffprobe pass
- [x] Loudness and true-peak profile pass: -13.3 LUFS / -1.1 dBFS
- [x] Black, silence and freeze machine review pass
- [x] Locked-cue reconstruction and subtitle CPS technical review passed; raw ASR CER is 8.2003% and evidence-only
- [ ] OCR full-pass and human semantic/readability review; internal sampled frames passed layout/readability inspection
- [x] `qa/report.json` and `qa/delivery-report.json`
- [x] Delivery manifest contains SHA-256 for every shipped file
- [x] `PROCESS_LOG.md` complete for the internal-delivery run
- [x] `RETROSPECTIVE.md` complete and approved for internal autonomous review

## Release Decision

- Internal review package: `ready`
- Public social-media package: `blocked` until voice and all asset rights are cleared
