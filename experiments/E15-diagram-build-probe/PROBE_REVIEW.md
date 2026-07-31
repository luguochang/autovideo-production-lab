# E15 Probe Review

Status: `candidate` / `human review pending`

## Intent

The narration says that a simple button or node can hide a longer engineering chain. The screen therefore extracts a compact relationship rather than repeating the full narration:

`模型调用 -> API 连接 -> 工具链调度`

The exact narration stays in the persistent caption rail. The headline and node labels are generated summaries recorded in `GraphIR.json`; they are not NarrationLock replacements.

## Screen copy receipt {#screen-copy}

- Headline: `一个按钮背后，运行着整条工程链`
- Node 01: `模型调用 / 调用推理能力`
- Node 02: `API 连接 / 数据与向量检索`
- Node 03: `工具链调度 / 编排实际动作`
- Edge labels: `连接上下文`, `编排执行`
- Terminal conclusion: `你看到的是入口，系统运行的是整条链路`

## Evidence to inspect

- `snapshots/contact-sheet.jpg`: all eight planned proof frames in one sheet.
- `review/render-qa/frame-0.80.png`, `frame-2.72.png`, `frame-3.80.png`, `frame-5.20.png`, `frame-7.96.png`: frames extracted from the rendered MP4.
- `review/render-qa/DECODE_QA.json`: ffprobe, non-silent audio and decoded-frame receipt.
- `review/render-qa/diagram-camera-strip.png`: keyframe camera diagnostic; magenta/blue outlines are diagnostic overlays, not part of the MP4.
- `renders/diagram-build-probe.mp4`: 8-second high-quality candidate render.

## Human checklist

- [ ] The Q-version host remains the same person and never shifts from `host.left`.
- [ ] The first connector reads as a continuous draw, not a page cut or a floating dot.
- [ ] Focus moves in the narration order model -> API -> tool chain.
- [ ] The title, node labels and terminal conclusion remain readable on a phone-sized crop.
- [ ] The caption rail remains exact and does not compete with the diagram.
- [ ] The terminal hold is long enough to understand the full relation.
- [ ] No SFX is required for this probe; later production may attach an approved semantic click only at a real interaction cue.

## Decision

Automated strict check, keyframe diagnostics and rendered-frame inspection are complete. This document intentionally does not mark the recipe `approved`; a human must review the MP4 before any lifecycle apply or promotion.
