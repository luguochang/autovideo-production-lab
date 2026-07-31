# Layout Contract

This contract is a hard preflight for every composition using `modern-ip-host-explainer`.

## Canvas and Zones

All coordinates are for `1920x1080`. Every content object is absolutely positioned inside a sized wrapper. No content object may rely on normal document flow.

| Zone | Rect (x, y, w, h) | Purpose |
|---|---:|---|
| `stage` | `0, 0, 1920, 1080` | full frame, clipped at the viewport |
| `host.left` | `96, 156, 600, 730` | presenter when information is on the right |
| `host.right` | `1224, 156, 600, 730` | mirrored presenter when information is on the left |
| `content.left` | `96, 112, 1030, 760` | title and keyword content when host is right |
| `content.right` | `694, 112, 1130, 760` | title and keyword content when host is left |
| `caption` | `96, 926, 1728, 88` | fixed exact narration rail |
| `brand` | `96, 56, 360, 44` | optional logo/status, never a headline |

`host.*` and `content.*` are mutually exclusive occupancy zones. A scene may swap left/right as a complete layout mode, but may not place the host across both zones.

## Active Element Budget

At any semantic moment, the maximum active set is:

- one host pose;
- one headline block, maximum two lines;
- one keyword cluster, maximum three items;
- one helper callout or one evidence object;
- one connector/path;
- one fixed caption rail;
- two ambient decoratives behind all content.

The budget is about visible semantic objects, not DOM nodes. Four spans inside one headline count as one object; four independent tags count as four objects and are not allowed in the default scene.

## Collision Matrix

The following pairs must never overlap in rendered bounding boxes, including entrance and exit states:

- `host` vs `headline`, `keyword`, `evidence`, `caption`;
- `headline` vs `keyword`, `evidence`, `caption`;
- `keyword` vs `evidence`, `caption`;
- any foreground object vs `caption`;
- any text object vs a background decorative with opacity above `0.12`.

Allowed overlap is limited to a deliberate `connector` passing behind its nodes and a deliberate `host` silhouette passing in front of a headline. Such exceptions must be named in the scene task and use a dedicated wrapper/z-index pair.

## State Handoff

Every semantic group receives a stable business ID and one of `enter`, `hold`, `replace`, `compact`, or `exit` states. The default sequence is:

```text
enter current group -> hold for reading -> compact or exit -> enter next group
```

No element is allowed to remain visible only because it was created earlier in the timeline. The final frame must contain the conclusion and its supporting context, not every intermediate keyword.

## Pose Continuity

- Pose changes are semantic state changes, not ambient decoration. Change at a narration cue, comparison turn, evidence reveal or close only.
- An 8-second window may contain at most two pose changes. Longer videos reuse this density instead of changing on every sentence.
- All pose layers share the same `host.*` wrapper. Normalize head top, eye line, head scale, bottom crop and gesture direction before animation.
- Fade the outgoing pose down before the incoming pose becomes dominant. Never hold two full-opacity figures or animate pose PNGs independently.
- Keep the host wrapper's ambient motion continuous across the handoff so the presenter reads as one person, not separate stickers.

## DOM and CSS Requirements

- Every moving wrapper has `position:absolute`, an explicit width/height, `data-role`, and `data-zone`.
- Every scene parent has a resolved width/height and `overflow:hidden`.
- `left/top` are declared on the element that owns `position:absolute`; helper classes cannot silently miss the positioned element.
- Captions are a separate layer with a fixed z-index and no semantic content behind them.
- Pose PNGs are background-removed before use; their crop box is normalized to the head and eye-line, not to raw image pixels.
- No `Math.random()`, wall-clock timing, infinite repeat or runtime DOM measurement is allowed in the render timeline.

## Preflight Gates

Before a style can enter full production:

1. Static master frame: verify all zone rectangles and the active-element budget.
2. Same narration window, 3-8s probe: inspect start, mid-beat, handoff and terminal frames.
3. `hyperframes check --snapshots`: zero layout, runtime, motion and contrast findings.
4. Manual visual review: no overlap, no text occlusion, readable Chinese line breaks, host hands/face visible.
5. Only after approval: freeze the style recipe and use it for batch generation.
