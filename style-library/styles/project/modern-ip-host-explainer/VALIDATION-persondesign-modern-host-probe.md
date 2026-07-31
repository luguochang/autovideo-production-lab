# Validation: persondesign-modern-host-probe

Status: `approved`  
Style version: `1.0.0`  
Default palette: `light-apricot`  
Saved alternate: `warm-peach`

## Evidence

- Approved static master: `hyperframes-workflow-kit/projects/persondesign-modern-host-probe/review/stills/light-apricot-master.png`.
- Structural motion probe: `hyperframes-workflow-kit/projects/persondesign-modern-host-probe/review/probes/approved-structure-motion-probe.mp4`.
- HyperFrames `0.7.62` strict check passed with zero lint, runtime, layout, motion and contrast findings across 15 samples plus transition boundaries.
- Landscape contract: `1920x1080`, `16:9`, `30fps`.

## Successful Rules

- Fixed host/content/caption zones prevent overlap and PPT-like accumulation.
- Present, emphasis and explain poses share a normalized eye line, head scale and host anchor.
- Semantic text exits before the next state enters the same footprint.
- Caption surface and text colors follow the selected palette.
- Role-based text colors (`ink`, `muted`, `primary`, `secondary`) support different narration structures without arbitrary color assignment.

## Rejected Patterns

- Cool blue/purple technology background as the default.
- Simultaneous semantic text during scale-swap transitions.
- Pure-white caption rail that ignores the scene palette.
- Full orange as a persistent background because it competes with the host.
- Paper texture, retro beige treatment, repeated cards, dashboard grids and tag carpets.

## User Decision

- Save `warm-peach` and `light-apricot`.
- Use `light-apricot` as the current and future default.
- Do not start full production as part of palette approval.
