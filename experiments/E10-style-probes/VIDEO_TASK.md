# E10 Style Probe Task

## Input Lock

- Project ID: `demoText-e10-style-probes`
- Narration source: `demo/demoText.txt`
- Narration source SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Shared source audio: `experiments/E08-demo-candidates/shared/narration.wav`
- Probe audio: `shared/narration-slice.wav`
- Exact source range: `57.0486088s-64.2908627462s`
- Spoken excerpt: `第一，平台把系统的复杂性给隐藏起来。低代码、无代码、AI平台、工作流工具，`
- Resolution / FPS: portrait `720x1280 / 30fps`; landscape adaptation `1280x720 / 30fps`
- Target duration: `7.242254s` (same audio window)
- Audience / platform: Chinese short-video knowledge teaching, vertical feed
- Forbidden treatments: black/white flash, hard slide swaps, glitch, full-screen distortion, unrelated chapter cards, tiny captions

## Style Selection

Three candidates are intentionally rendered as probes only. None is approved for full production yet.

| Candidate | Base style | Add-on / grammar | Official sources | Status |
|---|---|---|---|---|
| A | `handdrawn-workflow-tutorial` | continuous spatial board, ink routes, sticky cards | `spatial-pan-stations`, `viewport-change`, `svg-path-draw`, `css-marker-patterns` | `draft` |
| B | `magazine-collage-cards` | paper extraction, tape, highlight, evidence frame | `card-morph-anchor`, `svg-path-draw`, `css-marker-patterns` | `draft` |
| C | `editorial-data-report` | five-layer argument, bars, evidence rail, conclusion | `stat-bars-and-fills`, `viewport-change`, `svg-path-draw` | `draft` |

## Visual Thesis

One persistent teaching board explains that a friendly low-code surface hides several system layers. The spoken phrase becomes the causal sequence: visible button/node surface -> hidden model/API/vector/tool layers -> the viewer can inspect the underlying complexity. Completed objects remain on the board and are dimmed or receded rather than removed.

## Beat Plan

| Cue | Source time | Spoken intent | Visible operation | Handoff / terminal state |
|---|---:|---|---|---|
| `p05-hook` | 0.00-1.10 | “第一” announces the first reason | underline and red index mark settle | index stays visible |
| `surface` | 0.75-2.90 | platform hides complexity | low-code node/button card appears | card remains left/top |
| `layers` | 2.45-5.65 | name the hidden layers | model, API, vector DB, tools branch out / are exposed | all layers remain visible |
| `handoff` | 5.10-7.24 | workflow tools package it as buttons/nodes | camera or paper path connects the surface to layers | final board holds readable relationship |

## Screen Text

- Exact spoken caption: `第一，平台把系统的复杂性给隐藏起来。` (`exact-source`, 57.0486088-60.543979)
- Exact spoken caption: `低代码、无代码、AI平台、工作流工具，` (`exact-source`, 60.543979-64.2908627462)
- Labels such as `模型调用`, `API连接`, `向量库`, `工具链`, `按钮 / 节点` are `approved-summary` visual labels derived directly from the same sentence; they are not replacement narration.

## Implementation Contract

- One standalone composition per candidate; one paused seekable GSAP timeline.
- All media is a direct child of the composition root.
- No runtime clocks, random placement, network-critical assets, infinite loops, or layout-property tweens.
- Keep the whole board in one world; no white-out or black transition.
- Use local GSAP asset and local WAV; no fresh TTS or model call for this probe.
- Landscape variants must recompose the information for 16:9; stretching, letterboxing, or center-cropping portrait output is not allowed.

## Quality Gates

- `hyperframes check --snapshots`
- snapshots at `0.0, 1.2, 3.0, 5.6, 7.24`
- `hyperframes keyframes` focused proof for the main moving subject
- H.264 + AAC output, full decode, duration, audio-track, and black-frame checks
- user review before any full-length render
