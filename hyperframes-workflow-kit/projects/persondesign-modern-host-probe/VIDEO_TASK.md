# HyperFrames Video Task

## Input Lock

- Project ID: `persondesign-modern-host-probe`
- Narration path: `input/narration.txt`
- Narration normalized SHA-256: `30ca17f6327b947f1abb990162c65a81e07cf25421b8b74f33bf3c79bd9b0e4c`
- Probe audio: `input/narration.wav`, source window `0.0-8.0s`
- Ratio / resolution / FPS: `16:9` / `1920x1080` / `30`
- Target duration and platform: `8s` / local landscape style review
- Audience: AI learners and knowledge-video viewers
- Viewer must remember: 平台把复杂性包装在简单按钮与节点后面。
- Forbidden treatments: PPT page flips, beige paper texture, tag carpets, repeated card grids, dashboard/HUD styling, portrait/square output, accumulated elements, host/content overlap.

## Style Selection

- Base style ID: `modern-ip-host-explainer`
- Optional frame preset: none; approved project `frame.md` v1.0.0 is normative.
- Add-on style families: none.
- Official registry items: `caption-weight-shift`, adapted into the fixed bottom caption rail.
- Scene blueprints: none; this probe is shorter than a full scene blueprint.
- Motion rules: `scale-swap-transition`, `svg-path-draw`, semantic pose handoff.
- Status: `approved`; the template is reusable, but full production still requires a separate user request.

## Visual Thesis

The warm fixed host remains readable in the left host zone while the right content zone carries one relationship at a time. The default stage is clean light-apricot with forest-green structure and a restrained brick-red secondary emphasis. `warm-peach` is saved as the only alternate. The first relationship states that complexity is hidden; it exits before two grouped platform labels replace each other. The host changes pose only at those semantic handoffs, at most twice in this 8-second probe. The final frame contains the host, one keyword state and the exact caption only.

## Beat Plan

| Cue ID | Narration source range | Spoken intent | Visible operation | Existing object handoff | Registry/motion source | Terminal frame |
|---|---|---|---|---|---|---|
| `cue-01` | exact source, `0.0-3.7s` | 平台隐藏系统复杂性 | Host enters; two-line generated summary and an accent path reveal | none | `svg-path-draw` | host + headline + caption |
| `cue-02` | exact source, `3.7-5.6s` | 低代码、无代码 | Headline exits; first keyword state enters in the same fixed footprint | headline exits before entry | `scale-swap-transition` | host + low/no-code state + caption |
| `cue-03` | exact source, `5.6-8.0s` | AI平台、工作流工具 | First state shrinks/fades completely; second state replaces it without simultaneous text | outgoing state is hard-killed before entry | `scale-swap-transition`, sequential adaptation | host + AI/workflow state + caption |

## Screen Text

| ID | Text | Classification | Receipt |
|---|---|---|---|
| `headline` | 平台把复杂性 / 藏在按钮后面 | `generated-summary` | derived from exact source sentence 1 |
| `context` | 复杂性，被包装了 | `generated-summary` | visual bridge between cue 1 and cue 2 |
| `state-a` | 低代码 · 无代码 | `exact-source` | exact terms from NarrationLock |
| `state-b` | AI 平台 · 工作流工具 | `exact-source` | exact terms from NarrationLock |
| `caption-1` | 第一，平台把系统的复杂性给隐藏起来。 | `exact-source` | NarrationLock |
| `caption-2` | 低代码、无代码、AI平台、工作流工具， | `exact-source` | NarrationLock |

## Asset Plan

| Asset ID | Purpose | Source/generator | License | Fallback | Status |
|---|---|---|---|---|---|
| `host-source` | canonical presenter pose | user-provided pose manifest `present` | user-provided; publication rights not implied | no host | locked |
| `host-transparent` | foreground cutout | local connected-background segmentation from `host-source` | derived from user-provided | source image inside a plain crop | ready |
| `host-emphasis-transparent` | single-finger emphasis pose | local connected-background segmentation from manifest `emphasis`; media-use ingested | derived from user-provided | canonical `host-transparent` | ready |
| `host-explain-transparent` | open-hand explanation pose | local connected-background segmentation from manifest `explain`; media-use ingested | derived from user-provided | canonical `host-transparent` | ready |
| `narration-audio` | exact probe audio | copied from approved project excerpt | project-local | silent review | ready |
| `caption-weight-shift` | caption behavior reference | official HyperFrames registry | Apache-2.0 | fixed opacity swap | selected |
| `gsap` | deterministic paused timeline | local HyperFrames project dependency | GSAP standard license | none | selected |

## Review Gate

- Task status: `approved` for one static frame and one 8-second probe only.
- Style status: `approved`; default palette `light-apricot`, saved alternate `warm-peach`.
- Approved by: `user-request`
- Approved at: `2026-07-18T10:45:29+08:00`
