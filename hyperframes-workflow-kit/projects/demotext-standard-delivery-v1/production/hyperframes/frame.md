---
id: modern-ip-host-explainer
version: 1.0.0
status: approved
ratio: "16:9"
resolution: "1920x1080"
fps: 30
palette_id: light-apricot
colors:
  background: "#F2DFC7"
  surface: "#FBF3E7"
  ink: "#2A211B"
  muted: "#675748"
  primary: "#496958"
  secondary: "#A94E36"
  warm_host: "#B85C42"
  line: "#DCC2A3"
typography:
  display: "Inter, Noto Sans SC, Microsoft YaHei, sans-serif"
  body: "Inter, Noto Sans SC, Microsoft YaHei, sans-serif"
  label: "SFMono-Regular, Consolas, monospace"
  display_weight: 800
  body_weight: 500
  label_weight: 700
spacing:
  safe_x: 96
  safe_top: 72
  safe_bottom: 136
  zone_gap: 64
  caption_height: 88
constraints:
  max_addon_styles: 0
  landscape_only: true
  background_removal_required_for_pose_png: true
  replace_before_accumulate: true
  fixed_caption_rail: true
---

# Modern IP Host Explainer

This project-local design spec is pinned from
`style-library/styles/project/modern-ip-host-explainer/`.

## Layout

- `host.left`: `96,156,600,730`; `content.right`: `694,112,1130,760`.
- `host.right`: `1224,156,600,730`; `content.left`: `96,112,1030,760`.
- `caption`: `96,926,1728,88`.
- At most one host, one two-line headline, three keywords, one helper object and one connector are active at a time.

## Direction

Warm anime presenter for approachability; restrained modern motion graphics for credibility. Keep the light-apricot field flat and clean. Forest green carries structure and the primary relationship; brick red is reserved for warnings or a second semantic focus.

## Avoid

- No PPT pages, dashboards, repeated card grids, paper texture, sticker clouds or decorative tag carpets.
- No host/content/caption collisions and no implicit document-flow layout.
- No unapproved palette, runtime network media, random values, wall clocks or infinite animation.
- Do not duplicate the full narration as headline, body and caption.
