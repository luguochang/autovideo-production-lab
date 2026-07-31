# Motion Registry

Motion must explain the narration. It is selected by semantic trigger, not by decoration preference.

## Source Priority

1. Official rules in `generated/hyperframes-motion-rules.json`.
2. Official scene blueprints in `generated/hyperframes-blueprints.json`.
3. Official registry blocks/components in `generated/hyperframes-official-registry.json`.
4. Timing and semantic patterns extracted from the user-provided F1 guide.
5. Licensed community lessons in `vendor/hyperframes-student-kit/`.
6. Custom motion only when none of the above can express the required relationship.

The existing project is not a continuous-board restyle. Its default scene shape is the approved `modern-ip-host-explainer` shell: `#F2DFC7` stage, supplied Q-version host fixed in `host.left`, and a fixed caption rail. `spatial-pan-stations` is allowed only as a bounded `content-world` recipe when a process or evidence sequence genuinely needs it. The host, stage, and caption rail are never part of that camera.

## Machine Contract

`motion-library/knowledge-explainer-v1.json` is the machine-readable candidate library for knowledge videos. It does not contain copied block code. It records which official registry items, blueprints, motion rules, runtime adapters, SFX roles, fallbacks, and QA checks may be combined for one semantic job. Its `baseStyleId`, `paletteId`, `requiredBackground`, and `hostAssetPolicy` are normative: a recipe may change only the `content-world` layer.

> **Base-style lock:** recipes cannot change `modern-ip-host-explainer`, `light-apricot`, `#F2DFC7`, the supplied host asset manifest, the fixed host zone, or the caption rail. Host pose crossfades are allowed only at semantic handoffs and inside the shared host wrapper. A new palette, replacement character, or full-frame camera is a new style candidate and requires a separate review gate.

The compiler must select a `visualType` before selecting a motion recipe. It must not default every cue to `keyword` merely because no asset was supplied. A recipe may enter a production template only after a 3-8 second probe proves its seek behavior, visual density, text fit, license receipts, and compatibility with the persistent host/caption shell.

| Visual carrier | Use it for | Candidate recipe |
|---|---|---|
| `keyword` | One short concept or conclusion | `keyword-handoff` |
| `evidence-image` | Screenshot, article crop, product evidence | `evidence-pivot` |
| `device-surface` | App, browser, terminal, or editor states | `device-surface-tour` |
| `diagram` | Real process, dependency, hierarchy, or causal relation | `diagram-build` |
| `data-proof` | Sourced numeric claim | `data-proof` |
| `comparison` | Exactly two states | `comparison-split` |
| `code-surface` | Diff, log, test, terminal, or maintenance evidence | `code-proof` |
| `object-metaphor` | One reusable visual object with a later callback | `object-metaphor` |

## Default Teaching-Board Grammar

| Narration intent | Preferred visual operation | Existing source |
|---|---|---|
| Introduce a concept | Write/draw headline, then attach one visual object | `svg-path-draw`, `css-marker-patterns` |
| Explain a process | Add nodes, draw connectors, move an object through steps | `flowchart`, `viewport-change` |
| Compare two states | Keep both states visible, focus one, then morph or annotate | `card-morph-anchor`, `scale-swap-transition` |
| Present evidence | Grow a bar, count a number, attach a source note | `data-chart`, `stat-bars-and-fills` |
| Correct a misconception | Mark the old claim, cross/circle it, reveal the corrected relationship | `css-marker-patterns`, `reactive-displacement` |
| Preserve context | Shrink/reposition the completed group without deleting it | `viewport-change`, `card-morph-anchor` |
| Close the lesson | Pull back to the accumulated board and lock the conclusion | `multi-phase-camera`, `viewport-change` |

## F1 Timing Recipes

- Hand-drawn line or arrow: 280-650ms; arrow head trails by 60-100ms.
- Card/paper placement: 260-420ms from 16-36px with a restrained settle.
- Node arrival: 180-300ms.
- Paper extraction: 450-650ms, siblings stagger 70-120ms.
- Object transfer along a path: 500-800ms.
- Stable teaching hold: 350-800ms before the next semantic action.
- Editorial report: red rule 220ms, title 420ms, body 300ms, card 360ms, conclusion 400ms.
- HUD panel: 16-40px slide in 160-280ms; bars grow 400-800ms; focus scale ends at about 1.025.

These are starting ranges, not universal constants. The final timing comes from TTS boundaries and must leave enough time to read the terminal state.

## Continuity Rules

- Previous objects should hand off into the next beat when they remain relevant.
- One interval has one dominant focal relationship; dim secondary evidence instead of clearing the board.
- Avoid semantic dead zones longer than about one second. Ambient motion alone does not count as explanation.
- A paused beat is valid when it deliberately lets a conclusion land.
- Do not require an animation every 100ms. The community rule is a short-form engagement heuristic, not a universal teaching-video law.
- End with a readable accumulated state, not an unrelated CTA page.

## SFX Rules

- SFX are semantic punctuation, not a sound on every text swap.
- Allowed roles are `focus-hit`, `connector-draw`, `state-change`, `error`, and `chapter-resolve`.
- Default ceiling is six SFX per minute with at least 2.4 seconds between events.
- SFX may support a keyword landing, connector completion, state change, failure signal, or chapter resolution. Do not add a whoosh to every cue.
- Every SFX must be a frozen local asset with path, SHA-256, source, license, cue binding, duration, and semantic role. Narration remains the priority mix and is ducked only by an approved amount.

## Determinism

Use one paused seekable timeline, finite motion, explicit positions, and precomputed values. Do not use `Math.random()`, wall-clock time, infinite repeat, runtime DOM layout measurements during tweens, or critical online assets.
