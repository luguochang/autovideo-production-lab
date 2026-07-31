# AutoVideo Style Registry

This is the required entry point for visual selection. A style is not one prompt or one CSS file. It is a versioned bundle of tokens, component grammar, motion rules, negative constraints, references, provenance, and validated examples.

## Four Layers

1. **Base style**: one visual identity for the whole video.
2. **Frame preset**: an optional official `frame.md` design system.
3. **Registry items**: reusable HyperFrames blocks/components for a specific information need.
4. **Motion rules**: 2-4 semantic animation recipes per beat.

The machine-readable knowledge-video combinations live in `motion-library/knowledge-explainer-v1.json`. For this project the library is a **content-layer plugin**, not a new base style: every recipe is mounted inside `modern-ip-host-explainer`, keeps palette `light-apricot` (`#F2DFC7`), keeps the supplied Q-version host assets, and scopes camera motion to `content-world` only. Its current status is `candidate`; a new template may use it for probes, but it is not promoted to a production default until representative probes are approved.

Do not choose four unrelated styles and average them. Select one base style, then add at most two component families with explicit jobs.

## Recommended Direction For This Project

For the fixed-host teaching video described by the user:

- Base: `modern-ip-host-explainer` (approved, immutable for this project).
- Required stage: `light-apricot` with background `#F2DFC7`; supplied Q-version host in `host.left`.
- Content add-ons: `flowchart`, `data-chart`, `app-showcase`, `code-diff`, `caption-weight-shift`, and `parallax-unzoom`, all constrained to `content.right`.
- Camera rule: `viewport-change` and `spatial-pan-stations` may only move a bounded content world. They must never transform the host zone or caption rail.
- Official motion rules to evaluate first: `svg-path-draw`, `card-morph-anchor`, `stat-bars-and-fills`, and `scale-swap-transition`.

This combination preserves the original host template while borrowing specific evidence, diagram, code, and data components. It does not introduce a second palette, replace the host, or turn the whole frame into a board/canvas style.

## User-Provided F1 Styles

These seven specifications come from `demo/f1/HF_风格与动效库_分享包搭建说明 (1).md`. The referenced source package, examples, reference images, and manifests are not present in this workspace. Status is therefore `spec-only` until reconstructed and visually approved.

| ID | Best for | Status |
|---|---|---|
| `editorial-data-report` | Data claims, rankings, evidence | `spec-only` |
| `apple-clean-product` | Product UI and calm tool explanation | `spec-only` |
| `pixel-card-platform-ui` | Gamified learning and retro UI | `spec-only` |
| `magazine-collage-cards` | Evidence, screenshots, creator education | `spec-only` |
| `monochrome-cyber-editorial-cards` | High-contrast technical editorial | `spec-only` |
| `handdrawn-workflow-tutorial` | Continuous board teaching and workflows | `spec-only`, primary candidate |
| `data-hud-narration` | Explicit dark HUD/talking-head requests only | `spec-only`, opt-in |

## Project-Local Approved Styles

These styles passed a static master-frame review and a same-narration motion probe. They are reusable project rules, not global Codex skills; each new video still requires NarrationLock, task setup and proportionate QA.

| ID | Intended use | Status | Entry point |
|---|---|---|---|
| `modern-ip-host-explainer` | Fixed anime host + modern motion-graphics knowledge video | `approved`, default palette `light-apricot` | `style-library/styles/project/modern-ip-host-explainer/` |

The style is based on the user-provided `demo/persondesign/persondesign` design document and pose materials. Load its `frame.md`, `STYLE_GUIDE.md`, `POSE_MANIFEST.json`, `LAYOUT_CONTRACT.md`, `PLANNING_CONTRACT.json`, and `PALETTE_VARIANTS.json` together; do not load only the color tokens and improvise the layout. For this production template, use `light-apricot` only; the saved `warm-peach` alternate is not enabled by the motion recipe library.

## Official HyperFrames Named Styles

These are pinned from the Apache-2.0 HyperFrames creative skill and can be adopted as token-based starters:

| ID | Mood | Best for |
|---|---|---|
| `swiss-pulse` | Precise, grid-led | SaaS, APIs, metrics |
| `velvet-standard` | Premium, architectural | Enterprise and keynote work |
| `deconstructed` | Raw, industrial | Security and aggressive launches |
| `maximalist-type` | Loud, kinetic | Announcements and typography-led work |
| `data-drift` | Immersive, futuristic | AI and ML products |
| `soft-signal` | Warm, intimate | Human stories and wellness |
| `folk-frequency` | Vivid, handcrafted | Consumer and community content |
| `shadow-cut` | Dark, cinematic | Investigative and dramatic content |

The official ready-made frame presets are indexed in `generated/hyperframes-frame-presets.json`. The official registry snapshot is in `generated/hyperframes-official-registry.json`, scene blueprints in `generated/hyperframes-blueprints.json`, and motion rules in `generated/hyperframes-motion-rules.json`.

## Selection Protocol

1. Lock ratio, platform, duration range, audience, narration, and forbidden treatments.
2. Select 2-4 base-style candidates using content and desired feeling.
3. For each candidate, bind actual tokens, components, registry items, and motion rules. Do not compare only color palettes.
4. Build one representative still and one 3-8 second motion probe from the same narration window.
5. Record the decision in a file that validates against `schema/style-selection.schema.json`.
6. After user approval, expand only the selected style into the full video.

## Refresh

Run from the repository root:

```powershell
node scripts/sync-style-library.mjs
node scripts/validate-style-library.mjs
```

The sync script pins user-provided style sections, official HyperFrames named styles, frame presets, registry items, and motion rules into `style-library/generated/` and `style-library/styles/`. Curated policy in this file and `registry.json` is never overwritten.
