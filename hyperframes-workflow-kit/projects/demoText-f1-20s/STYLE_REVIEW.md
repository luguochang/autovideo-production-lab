# F1 七风格评审

## Shared Test Window

- Source: `demo/demoText.txt`
- Narration SHA-256: `30ca17f6327b947f1abb990162c65a81e07cf25421b8b74f33bf3c79bd9b0e4c`
- Audio range: `57.0486088s-77.0486088s`
- Exact audio: `input/narration-excerpt.wav`
- Ratio / FPS: `720x1280 / 30fps`
- Duration: `20.000s`

All candidates use the same audio, captions, beat boundaries, and conclusion. The requested 20-second duration replaces the standard 3-8 second probe only for this review.

## Candidates

| ID | Base style | Distinct object grammar | Primary motion | Known risk |
|---|---|---|---|---|
| A | `editorial-data-report` | Report chrome, evidence cards, ranked system layers | Bars and ordered evidence reveal | Can feel too formal |
| B | `apple-clean-product` | Product window, clean modules, layered system cards | Calm push-in and focus reveal | Can look like generic product UI |
| C | `pixel-card-platform-ui` | Quest menu, hard pixel cards, hidden engineering level | Stepped card arrival and meter fill | May feel playful for a critical topic |
| D | `magazine-collage-cards` | Paper notes, cut-outs, evidence strips, conclusion stamp | Paper placement and card handoff | Can become visually busy |
| E | `monochrome-cyber-editorial-cards` | Black editorial board, metrics, status rails | Line draw, green state activation, progress | Can over-index on technology aesthetics |
| F | `handdrawn-workflow-tutorial` | Browser source, extracted cards, drawn path, system base | SVG path draw and continuous board build | Hand-drawn assets are reconstructed, not original package assets |
| G | `data-hud-narration` | Signal core, HUD panels, hidden system diagnostics | Panel reveal and deterministic meters | No talking-head footage was supplied; uses an abstract signal core fallback |

## Review Artifacts

- Review page: `review/index.html`
- Final contact sheet: `review/stills/contact-final.png`
- Shared media QA: `qa/media-report.json`

| ID | MP4 | Poster |
|---|---|---|
| A | `review/probes/editorial-data-report.mp4` | `review/posters/editorial-data-report.png` |
| B | `review/probes/apple-clean-product.mp4` | `review/posters/apple-clean-product.png` |
| C | `review/probes/pixel-card-platform-ui.mp4` | `review/posters/pixel-card-platform-ui.png` |
| D | `review/probes/magazine-collage-cards.mp4` | `review/posters/magazine-collage-cards.png` |
| E | `review/probes/monochrome-cyber-editorial-cards.mp4` | `review/posters/monochrome-cyber-editorial-cards.png` |
| F | `review/probes/handdrawn-workflow-tutorial.mp4` | `review/posters/handdrawn-workflow-tutorial.png` |
| G | `review/probes/data-hud-narration.mp4` | `review/posters/data-hud-narration.png` |

## QA Status

- HyperFrames check: passed for all seven variants, including snapshot, runtime, layout, motion, and gating contrast checks.
- Media: passed for all seven MP4 files; H.264/AAC, 720x1280, 30fps, 20.010667s, full decode, no black-frame intervals.
- Browser: passed on desktop and 390x844 mobile; responsive layout has no horizontal overflow, all videos reached `readyState=4`, and synchronized muted playback succeeded.
- Detailed browser record: `qa/visual-browser-report.md`.

## Decision

- Selected base style: pending user review
- Allowed add-ons: pending
- Rejected treatments: flash white/black, RGB glitch, particle fields, static slide paging
- Approval status: `pending`
- Next action: user selects A-G (and optionally names up to two scoped add-on component families); only then may the project create the approved `style-selection.json` and enter full production.
