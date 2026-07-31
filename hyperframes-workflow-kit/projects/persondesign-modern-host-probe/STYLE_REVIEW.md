# Style Review

## Shared Test Window

- Narration SHA-256: `30ca17f6327b947f1abb990162c65a81e07cf25421b8b74f33bf3c79bd9b0e4c`
- Source range / time window: exact audio `0.0-8.0s`
- Exact audio file: `input/narration.wav`
- Ratio / FPS: `16:9` / `30`

The user selected and approved the project-local direction after motion, pose and palette review.

## Candidates

| Candidate | Base style | Frame preset | Add-ons | Registry items | Motion rules | Still | Motion probe | Known risks |
|---|---|---|---|---|---|---|---|---|
| `A` | `modern-ip-host-explainer` | project `frame.md` | none | `caption-weight-shift` | `svg-path-draw`, `scale-swap-transition` | `review/master-frame.png` | `review/modern-ip-host-explainer-probe.mp4` | local cutout edge quality; pose is static; style remains draft |
| `A-v2` | `modern-ip-host-explainer` | project `frame.md` v0.2 | none | `caption-weight-shift` | `svg-path-draw`, sequential semantic pose handoff | `review/v2-natural-multipose-snapshots/frame-00-at-1.2s.png` | `review/v2-natural-multipose-probe.mp4` | pose edge quality and palette still require user approval |
| `A-v3` | `modern-ip-host-explainer` | project `frame.md` v1.0 | none | `caption-weight-shift` | approved sequential semantic pose handoff | `review/stills/light-apricot-master.png` | `review/probes/approved-structure-motion-probe.mp4` | approved; motion probe retains the prior palette because no new MP4 was requested |

## Decision

- Selected base style: `modern-ip-host-explainer` for this probe.
- Allowed add-ons: none.
- Rejected treatments: retro paper, sticker clouds, card grids, dashboards, dense tags, overlapping accumulation.
- Required corrections before freeze: completed.
- Approval status: `approved`
- Reviewer: user

## Color Study Round

- Static-only review source: `review/color-study/index.html`; no video render or production template mutation was performed.
- Contact sheet: `review/color-study/contact-sheet.png`.
- Candidates: `01-neutral-sage`, `02-warm-peach`, `03-light-apricot`, `04-pale-sage`, `05-muted-orange`, `06-deep-forest`.
- Approved default: study candidate `03-light-apricot`, stable palette ID `light-apricot`.
- Saved alternate: study candidate `02-warm-peach`, stable palette ID `warm-peach`.
- Rejected for automatic use: `01-neutral-sage`, `04-pale-sage`, `05-muted-orange`, and `06-deep-forest`; they remain review evidence only.
- Caption study: every candidate uses a palette-bound `surface`, `muted` and `primary` instead of keeping a fixed pure-white rail across all backgrounds.
- Text colors remain semantic roles (`ink`, `muted`, `primary`, `secondary`) rather than arbitrary per-sentence colors.
- Selection status: `approved`; project and stable style `frame.md` now use `light-apricot` v1.0.0.

## Probe QA

- V1 comparison: `review/v1-blue-singlepose-master.png` and `review/v1-blue-singlepose-probe.mp4`.
- V2 stills: `review/v2-natural-multipose-snapshots/frame-00-at-1.2s.png`, `frame-01-at-3.52s.png`, `frame-02-at-5.6s.png`, `frame-03-at-7.8s.png`.
- V2 motion probe: `review/v2-natural-multipose-probe.mp4`.
- HyperFrames `0.7.62` strict check: zero lint, runtime, layout, motion and contrast findings across 15 timeline samples plus every tween transition boundary.
- Approved palette master: `review/stills/light-apricot-master.png`.
- No new MP4 was rendered for the palette decision. `review/probes/approved-structure-motion-probe.mp4` is the previously validated multi-pose structural probe.
- Media QA: `1920x1080`, `30fps`, `8.000s`, H.264 + AAC, 240 frames decoded, no black-frame interval; audio max `-7.6 dB`.
- Rejected during probe QA: the stock `scale-swap-transition` overlap window produced double-exposed semantic text at `5.6s`.
- Retained adaptation: outgoing semantic text is fully faded and hard-killed before the incoming state enters the same footprint.
- The approved recipe is stored at `style-library/styles/project/modern-ip-host-explainer/`; it is project-local and is not promoted to a global Codex skill.
