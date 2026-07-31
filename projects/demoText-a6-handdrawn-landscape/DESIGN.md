# Design Spec — A6 Handdrawn Workflow Tutorial

## Visual Direction

- Base style: handdrawn-workflow-tutorial
- Canvas: warm paper #FBFAF4 with restrained local paper texture and warm vignette
- Ink: #151515, 2–4px, round caps and joins
- Extracted information: #DDF4F5
- Action/confirmation accent: #D81E45; one active red focus at a time
- Typography: Noto Sans SC, then Microsoft YaHei, then sans-serif; video-scale headings and readable Chinese labels
- Composition: one persistent oversized board, one virtual camera, chapter stations connected by ink routes

## Component Grammar

- sketch-browser: source/surface window
- info-card: short extracted concept, maximum four active cards
- step-rail: reasons and checklist nodes, three to six visible nodes per local cluster
- step-paper: route, checklist, or learning cards, one to three active papers
- ink-arrow: semantic handoff, maximum two active heavy arrows
- tool-window: one simplified system/agent window
- response-bubble: maximum three at a time
- action-pill: one red conclusion/confirmation label
- pin-sticker: maximum four small locating marks

## Motion Direction

- Primary camera: spatial-pan-stations / viewport-change
- Drawn relationships: svg-path-draw
- Marker emphasis: css-marker-patterns
- Entrances: restrained 260–650ms placement, no elastic or bouncy settling
- Handoffs: outgoing station shrinks and recedes over 0.4–0.7s while the camera moves toward the next station
- End: final connection complete by approximately 272.4s, then hold the accumulated board through the audio tail

## Avoid

No dark HUD, no neon, no particles, no synthetic data, no full-screen page transitions, no independent wall-clock animation, no random layout, no text that is not tied to a narration source range.

## Provenance

- User-provided specification: demo/f1/HF_风格与动效库_分享包搭建说明 (1).md, A6
- Workflow specification: demo/f1/HyperFrames视频工作流分享手册.md
- Local style snapshot: style-library/styles/f1/handdrawn-workflow-tutorial/STYLE_GUIDE.md
- Motion references: vendor/hyperframes/skills/hyperframes-animation/
- Frozen narration/audio: assets/narration.json and assets/narration.wav
