# Engineering Task: DemoText Standard Delivery V4

## Objective

Run `demo/demoText.txt` through the AutoVideo workbench from a fresh project initialization and produce a reproducible, hash-bound internal delivery package. Preserve every stage input, output, approval scope, retry, fallback, QA receipt, and retrospective so a future narration can reuse the same pipeline without reimplementing it.

## Locked Baseline

- Input route: approved script (`demo/demoText.txt`)
- Voice: CosyVoice preset 14, Chinese female, FP32, stream=false, speed=1.03, seed=7
- Video template: `modern-ip-host-explainer@1.0.0`, palette `light-apricot`
- HyperFrames: pinned project version; landscape 16:9, 1920x1080, 30fps
- Platform metadata: Douyin / internal review first
- Release scope: `internal-only` until human listening, full Studio review, claims framing, and publication rights are explicitly approved

## Required Evidence

1. Fresh NarrationLock and source SHA-256.
2. Voice recipe, final WAV, technical audio QA, locked alignment and SRT.
3. Template lock, VIDEO_TASK, STYLE_REVIEW, style selection, storyboard, Graph IR, layout and asset provenance.
4. Editable HyperFrames composition with stable scene/cue/object IDs and overrides contract.
5. Strict check, preview receipt, internal MP4, media QA, cover, delivery manifest and standard package.
6. Append-only execution log, pipeline summary, retrospective and SOP status.

## Non-Negotiable Gates

- Never alter approved narration silently.
- Never present automated approval as human listening or user final review.
- Never publish a `master.mp4` while public rights or human gates are unresolved.
- Same-narration planning/style fallbacks are allowed only with explicit receipts and hash rebinding.

## Completion Definition

The run is complete when `internalDeliveryReady=true`, package integrity passes independently, all active stages are approved, and `publicReleaseBlocked=true` accurately records any unresolved human or rights gates.
