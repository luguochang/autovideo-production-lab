# 主流横屏六风格评审

## Shared Test Window

- Narration SHA-256: `30ca17f6327b947f1abb990162c65a81e07cf25421b8b74f33bf3c79bd9b0e4c`
- Source range / time window: shared 57.0486088s-77.0486088s narration excerpt
- Ratio / FPS: `1920x1080 / 30fps`
- Duration: `20.000s`
- Reference style: `input/reference-style.mp4`, user-provided style reference only

## Generation Rule

The reference video was analyzed before authoring. The user explicitly requested several visible explorations, so each candidate is a roughly 20-second landscape comparison sample using the same narration window. These are style probes, not a full-narration production.

## Candidates

| Candidate | Base style | Distinct grammar | Primary motion | Known risks |
|---|---|---|---|---|
| A | `anime-sticker-explainer` | Original host, floating labels, doodle arrows | Sticker pop, tag handoff, small host breath | Closest to reference; can become too sparse |
| B | `manga-panel-pop` | Comic gutters, speech bubbles, impact words | Punch-in, speed-line draw, bubble pop | Can become noisy if every beat shouts |
| C | `chibi-desk-live` | Chibi host, desk, app objects, chat bubbles | Parallax drift, object pop, reply timing | Can soften the critique too much |
| D | `creator-cutout-pop` | Cutout host, marker scribbles, oversized hook type | Jump-cut scale, sticker burst, underline sweep | High energy may compete with narration |
| E | `lofi-anime-night` | Warm night workspace, screen glow, soft parallax | Camera drift, glow pulse, focus reveal | Atmosphere can lower information density |
| F | `motion-comic-depth` | Wide illustrated world, depth layers, camera drift | Camera push, depth handoff, path draw | More custom art direction and layout work |

## Decision

- Selected base style: `anime-sticker-explainer`
- Allowed add-ons: none selected
- Rejected treatments: PPT page flips, repeated equal-size card grids, report chrome, HUD dashboards, flash white/black, RGB glitch, particle fields
- Required corrections: none requested at approval
- Approval status: `approved`
- Reviewer: `user-request`

## Review Artifacts

- Review page: `review/index.html`
- Contact sheet: `review/stills/contact-final.png`
- Machine QA: `qa/media-report.json`

## Approved Delivery

- Final high-quality MP4: `production/final/demoText-mainstream-landscape.mp4`
- Final media QA: `qa/final-media-report.json`

## Media Paths

| Candidate | MP4 | Poster |
|---|---|---|
| A | `review/probes/anime-sticker-explainer.mp4` | `review/posters/anime-sticker-explainer.png` |
| B | `review/probes/manga-panel-pop.mp4` | `review/posters/manga-panel-pop.png` |
| C | `review/probes/chibi-desk-live.mp4` | `review/posters/chibi-desk-live.png` |
| D | `review/probes/creator-cutout-pop.mp4` | `review/posters/creator-cutout-pop.png` |
| E | `review/probes/lofi-anime-night.mp4` | `review/posters/lofi-anime-night.png` |
| F | `review/probes/motion-comic-depth.mp4` | `review/posters/motion-comic-depth.png` |

## QA Status

- All six variants pass `hyperframes check --snapshots`.
- All six MP4 files pass the landscape media verifier at `1920x1080 / 30fps / H.264 + AAC / about 20s`.
- Browser and responsive notes are recorded in `qa/visual-browser-report.md`.
