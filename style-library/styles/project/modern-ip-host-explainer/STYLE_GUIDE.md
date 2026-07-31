# Modern IP Host Explainer

Status: `approved`  
Version: `1.0.0`  
Default output: landscape `16:9`, `1920x1080`, `30fps`

## What This Style Is

这是固定人物主持的现代知识短视频模板：人物负责“说、指、想、强调”，信息负责“被提取、被比较、被连接、被总结”。它借鉴现代产品宣传视频的留白、层级和锐利信息焦点，但不复制网页长页、产品仪表盘或 PPT 卡片墙。

## Base Style

- Stage: clean light-apricot field with one forest-green structural rule or localized shape; no paper texture or default blue cast.
- Host: the supplied warm anime character, cropped at chest or waist, head and hands readable.
- Content: one large headline plus one semantic keyword operation at a time.
- Caption: a fixed, quiet bottom rail; exact narration stays here and never becomes the main headline by default.
- Palette: `light-apricot` is the default; `warm-peach` is the only saved alternate and requires an explicit request.
- Motion: short, legible reveals, focus shifts, connector draws and compacting handoffs.

## Scene Grammar

| Scene type | Host action | Main visual operation | Active content limit |
|---|---|---|---:|
| `hook` | question / look-to-side | one headline + one prompt mark | 2 semantic objects |
| `concept` | open palm / single finger | one keyword highlighted inside a short phrase | 2 semantic objects |
| `compare` | both hands open | exactly two states with one contrast rule | 2 states |
| `process` | pointer / guiding hand | up to three nodes on one connector | 3 nodes |
| `proof` | explain / read | one number, quote or source note | 1 evidence object |
| `close` | clasp / calm smile | previous objects collapse into one conclusion | 1 conclusion |

The default operation is `replace`, not `accumulate`. A previous keyword group must fade, morph into a smaller context mark, or move to a reserved history rail before the next group enters.

## Typography

- Display: `Inter` with `Noto Sans SC` / `Microsoft YaHei` fallback, weight 800, 72-104px.
- Body: same family, weight 500, 28-34px.
- Captions: 24-28px, two lines maximum, fixed bottom rail.
- Labels: monospace 18-22px, used for source or status only.
- Left-align information blocks. Do not center every element or turn each sentence into a rounded text box.

## Motion Vocabulary

Use the official semantic rules where they fit: `viewport-change`, `svg-path-draw`, `card-morph-anchor`, and `stat-bars-and-fills`. A beat normally uses two to four operations, not a decorative effect on every object.

- Headline: reveal from its anchored edge, 420-620ms.
- Keyword: one short slide/focus, 260-420ms.
- Connector: draw 280-650ms; arrow head follows by 60-100ms.
- Pose change: only at a semantic handoff, using a short normalized opacity handoff; never rapid image swapping.
- Pose frequency: no more than two changes in an 8-second window; a hold is preferred when the narration has no semantic turn.
- Pose normalization: keep eye line, head scale, host-zone anchor and crop stable across every source PNG.
- Pose motion: animate the shared host wrapper only; do not give each pose an independent drift, bounce or zoom.
- Handoff: exit or compact the previous group before the next group claims the zone.
- Close: hold the readable conclusion for at least 600ms.

## Negative Constraints

- No portrait or square output.
- No full-screen beige paper, grain-heavy scrapbook texture or retro classroom palette.
- No PPT page flips, dashboard grids, repeated equal cards, floating sticker clouds or decorative tag carpets.
- No simultaneous headline + four tags + four nodes + conclusion.
- No unpositioned content, implicit document flow, `overflow: visible` on viewport-critical groups, or elements whose `left/top` are declared on the wrong class.
- No use of the supplied PNGs without background removal and a stable crop/anchor pass.

## Asset and Provenance Rules

The supplied design document, character sheet and pose images are `user-provided` references. They are not proof of an external license and must remain in the project receipt. The credential export `EUR-OWH95A78QK_sub2.json` is not an asset and must never enter the media manifest or prompt context.

Canonical poses are listed in `POSE_MANIFEST.json`. All other poses remain reserve material until a later probe proves consistent head scale, crop and eye-line.
