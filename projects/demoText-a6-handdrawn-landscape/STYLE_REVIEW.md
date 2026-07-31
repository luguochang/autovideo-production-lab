# Style Review

## Shared Test Window

- Narration path and SHA-256: assets/narration.json / 92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c
- Source range / time window: full narration, 0.100–274.424526s
- Exact audio file: assets/narration.wav
- Ratio / FPS: 1920x1080 / 30fps

This is a full-production approval receipt, not a new style comparison pass. The user explicitly approved the A6 base style and the task document on 2026-07-16.

## Candidates

| Candidate | Base style | Frame preset | Add-ons | Registry items / rules | Still | Motion probe | Known risks |
|---|---|---|---|---|---|---|---|
| Selected | handdrawn-workflow-tutorial | none | none in first production pass | spatial-pan-stations, viewport-change, svg-path-draw, css-marker-patterns | E10 A handdrawn probe | E10 A 7.24s probe | F1 source package is spec-only; local components must carry receipts |
| Rejected | magazine-collage-cards | none | full alternate base style | E10 B probe | present in E10 | present in E10 | Would change the base visual grammar |
| Rejected | editorial-data-report | none | full alternate base style | E10 C probe | present in E10 | present in E10 | Its data/report grammar and color rules do not match the approved A6 direction |

## Official Reuse Audit

| Source | Decision | Reason |
|---|---|---|
| vendor/hyperframes/skills/hyperframes-animation/blueprints/spatial-pan-stations.md | Reuse as choreography reference | Matches one oversized world and a virtual camera between stations |
| vendor/hyperframes/skills/hyperframes-animation/rules/viewport-change.md | Reuse | Single world transform is the camera source of truth |
| vendor/hyperframes/skills/hyperframes-animation/rules/svg-path-draw.md | Reuse | Matches ink routes, connectors and hand-drawn annotations |
| vendor/hyperframes/skills/hyperframes-animation/rules/css-marker-patterns.md | Reuse | Matches limited marker/highlight treatment |
| vendor/hyperframes/registry/blocks/flowchart-vertical | Do not install | Portrait, multi-color, and unrelated cursor/typing demo |
| vendor/hyperframes/registry/blocks/data-chart | Do not install | Its example creates unrelated synthetic data and a different editorial palette |
| vendor/hyperframes/registry/components/caption-editorial-emphasis | Do not install | Serif editorial caption system conflicts with A6 Chinese handdrawn type |
| vendor/hyperframes/registry/components/grain-overlay | Do not install | Reference implementation uses online texture and non-seek-safe CSS looping; paper texture will be deterministic local CSS |

## Decision

- Selected base style: handdrawn-workflow-tutorial
- Allowed add-ons: none for the first full production pass
- Rejected treatments: page flips, black/white flashes, glitch, neon, particles, full-screen slides, multi-red emphasis, dense code/UI, synthetic numbers
- Required corrections: keep every screen summary source-tagged; never reveal a later narration term early; preserve all completed stations on the board
- Approval status and reviewer: approved / user / 2026-07-16
