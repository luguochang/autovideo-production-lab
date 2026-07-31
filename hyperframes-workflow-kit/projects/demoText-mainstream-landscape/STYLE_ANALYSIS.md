# 参考视频风格分析

- Reference video: `input/reference-style.mp4`
- Original source: `demo/douyin_一颗小樱_7662366814240303323.mp4`
- Source metadata: `1280x720`, `16:9`, `30fps`, `230.781678s`, H.264 + AAC
- Analysis status: `complete`

## What Makes The Reference Work

1. One stable illustrated presenter acts as a visual anchor instead of a sequence of cards.
2. The background is a warm, lightly textured canvas with large empty breathing room.
3. Main claims appear as short colored labels, not paragraphs or dashboard widgets.
4. The scene accumulates: old labels stay visible while new labels attach to the current thought.
5. Motion is frequent but small: label pop, short slide, connector draw, presenter pose/breath, and occasional punch-in.
6. Bottom captions are compact and separate from the illustrated argument layer.
7. The new project uses an original vector host and does not copy the reference character, logo, or exact artwork.

## Rejected Legacy Traits

- Repeated equal-size card grids
- Report chrome, page numbers, and slide-like top bars
- Full-screen scene resets between beats
- Dark HUD dashboards and decorative data panels
- Large blocks of body copy that only change as subtitles

## Candidate Direction

All candidates use the same locked 20-second narration and 16:9 frame. They differ in visual grammar, not merely the palette.

| ID | Candidate | Grammar | Why it is mainstream-short-video oriented |
|---|---|---|---|
| A | `anime-sticker-explainer` | Original host + keyword stickers + hand-drawn connectors | Closest to the supplied reference, sparse and immediately legible |
| B | `manga-panel-pop` | Manga gutters + speed lines + speech bubbles + impact words | Uses comic timing and punch-ins instead of slide paging |
| C | `chibi-desk-live` | Chibi host at a desk + floating app objects + chat bubbles | Feels like a creator talking through a live setup |
| D | `creator-cutout-pop` | Cutout host + marker scribbles + oversized type + sticker bursts | Social-first, high-energy, designed for replayable hooks |
| E | `lofi-anime-night` | Anime host in a warm night workspace + screen glow + soft parallax | More emotional and atmospheric without becoming a HUD |
| F | `motion-comic-depth` | Wide illustrated room + foreground/midground/background depth + camera drift | Uses cinematic depth and object handoff rather than cards |

## Registry Matching

The official blocks and rules were evaluated before custom authoring. `caption-editorial-emphasis` supplies caption hierarchy; `svg-path-draw` and `css-marker-patterns` supply connector/marker grammar; `viewport-change` and `card-morph-anchor` supply focus and handoff. The final variants remain custom because the reference's core syntax is an illustrated continuous world, not a registry card or slide.
