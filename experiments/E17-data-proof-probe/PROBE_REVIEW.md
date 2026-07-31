# E17 Probe Review

Status: `candidate` / `human review pending`

## Intent

The narration explains that a simple visible entry can hide several engineering layers. The screen therefore summarizes the structure as three layers rather than repeating the narration word-for-word:

`入口 = 1` -> `上下文 = 2` -> `工具链 = 3`

`DataProofIR.json` records the values as structural, derived evidence. The exact narration remains in the persistent caption rail and in `NarrationLock.json`.

## Screen copy receipt

- Headline: `一个入口，展开成三层工程关系`
- Metrics: `1 / 入口`, `2 / 上下文`, `3 / 工具链`
- Focus label: `CURRENT FOCUS / 工具链调度`
- Source note: `Source: DataProofIR.json / Graph IR structure`
- Disclaimer: `结构示意，不是业务指标`
- Conclusion: `复杂性不是消失，而是被分层包装`

## Evidence to inspect

- `snapshots/contact-sheet.jpg`: all eight planned proof frames in one sheet.
- `review/render-qa/frame-0.80.png`, `frame-2.72.png`, `frame-3.80.png`, `frame-5.20.png`, `frame-7.10.png`, `frame-7.96.png`: frames extracted from the rendered MP4.
- `review/render-qa/DECODE_QA.json`: ffprobe, non-silent audio and decoded-frame receipt.
- `review/render-qa/chart-camera-strip.png`: keyframe camera diagnostic; diagnostic overlays are not part of the MP4.
- `renders/data-proof-probe.mp4`: 8-second high-quality candidate render.

## Human checklist

- [ ] The Q-version host remains the same person and never shifts from `host.left`.
- [ ] Bars grow from the shared baseline and do not flash or cover their value labels.
- [ ] The trend path reads as a continuous relation, not a page cut.
- [ ] Focus moves in narration order and the ring/beacon feel intentional.
- [ ] Title, metric labels, source note and conclusion remain readable on a phone-sized crop.
- [ ] The caption rail remains exact and does not compete with the chart.
- [ ] The terminal hold is long enough to understand the complete relation.
- [ ] No SFX is required for this probe; later production may attach an approved semantic click only at a real interaction cue.

## Decision

Automated strict check, keyframe diagnostics and rendered-frame inspection are complete. This document intentionally does not mark the recipe `approved`; a human must review the MP4 before lifecycle apply or promotion.
