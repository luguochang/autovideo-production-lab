# 风格分析 - batch-smoke-30s-20260720

## Input

- Reference image: none supplied
- Decision source: approved project-local `modern-ip-host-explainer@1.0.0`
- Palette: `light-apricot` / `#F2DFC7`
- Analysis status: `base-style-reused; Candidate A approved by creator`

## Fixed Visual Contract

- 16:9 / 1920x1080 / 30fps
- Q版主持人固定在 `host.left`
- 内容动效只在 `content.right`
- 字幕固定在 `caption` rail
- Camera transforms are restricted to `content-world`
- Main text is a concise generated summary; exact NarrationLock wording stays in captions

## Registry Matching

| Need | Reused source | Reason |
|---|---|---|
| Relationship/process | official `flowchart` registry block | the narration describes layered dependencies and failure routing |
| Connector reveal | official `svg-path-draw` motion rule | makes the relationship appear progressively without page cuts |
| Context handoff | official `card-morph-anchor` motion rule | compacts completed content instead of clearing the board |
| Content-only camera | official `viewport-change` motion rule | preserves the host and caption rail while focusing content |
| Short labels | official `discrete-text-sequence` motion rule | deterministic keyword/status changes on one paused timeline |

## Rejected Treatments

- New palette, replacement character or full-frame camera
- PPT page flips and left/right page cuts
- Continuous host drift or rapid pose swapping
- Full narration copied into the main content world
- Decorative SFX on every text replacement
