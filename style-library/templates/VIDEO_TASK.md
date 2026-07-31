# HyperFrames Video Task

## Input Lock

- Project ID:
- Narration path:
- Narration normalized SHA-256:
- Ratio / resolution / FPS:
- Target duration and platform:
- Audience and remembered outcome:
- Forbidden content/treatments:

## Style Selection

- Base style ID:
- Optional frame preset:
- Add-on style families (maximum two):
- Official registry items:
- Scene blueprints:
- Motion rules:
- Source and license receipts:
- Status: `draft` / `approved` / `rejected`

The corresponding machine-readable decision must validate against `style-library/schema/style-selection.schema.json`.

## Visual Thesis

State what the viewer should understand from the visual progression. Describe the persistent world, recurring objects, and final accumulated state.

## Beat Plan

| Cue ID | Narration source range | Spoken intent | Visible operation | Existing object handoff | Registry/motion source | Terminal frame |
|---|---|---|---|---|---|---|

## Screen Text

For every text item, mark `exact-source`, `approved-summary`, or `generated-summary`, plus its source range or generation receipt.

## Asset Plan

| Asset ID | Purpose | Source/generator | License | Fallback | Status |
|---|---|---|---|---|---|

## Review Probes

- Still frames:
- 3-8 second motion probes:
- Same narration window used for every candidate:
- User feedback and chosen direction:

## Implementation Contract

- One paused seekable timeline per composition.
- Stable business IDs separate from DOM selectors.
- Reuse official registry items before custom equivalents.
- No random/wall-clock/infinite animation.
- No full production before style approval unless the user explicitly skips the gate.

## Quality Gates

- Narration and cue integrity.
- HyperFrames `check` including layout, motion, runtime, and contrast.
- Word/cue-exact screenshots at semantic moments.
- Mobile readability, Chinese line breaks, safe area, and accumulated final frame.
- Media codec, duration, loudness, full decode, and black-frame checks.
- Asset provenance and license completeness.
