# Knowledge Explainer Motion Library

This directory contains versioned content-layer recipes for
`modern-ip-host-explainer`. It is not a second visual theme.

## Invariants

- Base style: `modern-ip-host-explainer` `1.0.0`.
- Palette: `light-apricot`; background: `#F2DFC7`.
- Layout: `host.left`, `content.right`, fixed `caption` rail.
- Camera scope: `content-world-only`.
- Host pose assets always come from the approved `POSE_MANIFEST.json`.
- Exact narration remains in the caption rail. Content recipes use source-linked
  keywords, evidence, diagrams, comparisons, code, or one object metaphor.

Any artifact that changes one of these invariants is a new base style, not a
motion-recipe revision.

## Versioning

The library and every recipe use semantic versions.

- Patch: wording, receipts, QA detail, or timing guidance with no visible
  behavior change.
- Minor: a backward-compatible trigger, phase option, registry item, SFX role,
  or optional input.
- Major: required-input changes, phase semantics, fallback behavior, or a
  contract change that invalidates existing projects.

Never overwrite an approved version in place. Candidate promotion is:

```text
candidate -> probe-passed -> approved-project -> promoted-template
       \-----------------------------------------------> retired
```

Lifecycle state is stored in `knowledge-explainer.lifecycle.json`, not in the
immutable recipe definition. Each transition writes a hash-bound receipt.
`retired` is terminal for new selection; an existing project may replay only
the exact definition hash it locked before retirement. Failed patterns are
retired, not deleted, so old project decisions remain explainable.

## Lifecycle Gates

- `candidate`: available only for a bounded probe; never for project or
  template selection.
- `probe-passed`: requires a 3-8 second same-narration motion probe, still and
  MP4 hashes, strict HyperFrames check with snapshots, invariant and host-asset
  audits, visual review, and observed official reuse in the implementation.
- `approved-project`: requires a hash-bound approved style selection, the
  applied probe receipt, and a human project approval. It authorizes only that
  project.
- `promoted-template`: requires two distinct approved projects, a hash-bound
  cross-project regression report, compatibility evidence, and human template
  owner approval.
- `retired`: requires a reason and human retirement approval. There is no
  transition out of this state.

Use the CLI without a force path:

```powershell
npm.cmd run motion:lifecycle -- validate
npm.cmd run motion:lifecycle -- status --json
npm.cmd run motion:lifecycle -- assess --recipe keyword-handoff --to probe-passed --evidence <evidence.json> --receipt-out <receipt.json>
npm.cmd run motion:lifecycle -- apply --recipe keyword-handoff --to probe-passed --evidence <evidence.json> --receipt-out <receipt.json>
npm.cmd run motion:lifecycle -- readiness --out style-library/motion-library/knowledge-explainer.readiness.json --templates-dir style-library/motion-library/review-templates --json
```

`assess` may write a blocked receipt but never mutates the ledger. `apply`
mutates it only after every gate passes. The complete operating procedure is
`docs/18-动效配方晋级与退役SOP.md`.

The readiness command always reconciles against all eight recipe definitions,
including recipes with no probe directory. It writes one fail-closed snapshot
and one non-authorizing review worksheet per recipe. Missing entries, stale
definition hashes, or invalid official catalog bindings set the contract to
invalid and zero every production-eligible result. Worksheets keep
`authorizesLifecycleTransition=false`; only workbench review and the separate
lifecycle action can write real evidence.

Current checked readiness is `8/8` canonical technical probes, `0/8` current
human reviews, `0/8` project approvals, `0/8` template promotions, and `0/8`
production-eligible recipes. E19 `device-surface-tour` and E20 `object-metaphor`
completed strict checks, internal renders, snapshots, and file decode QA, but
remain `candidate`. Machine checks, contact sheets, and null-sink audio decode
must never be substituted for a human visual or listening decision.

During the current test objective, audio validation is file-in/file-out only:
use an imported frozen WAV, hashes, FFprobe, and FFmpeg null-sink decode. Do not
open a microphone, start recording, autoplay media, call playback APIs, or send
sound to an external output device until the user explicitly authorizes it.

## Probe Human Review

Open `风格探针 -> 探针审片` in the workbench. It scans registered
`experiments/E*-*probe` directories and exposes the local MP4, contact sheet,
strict check, invariant audit, official reuse sources, and the nine manual
visual checks. A `passed` decision requires every manual check plus all
technical evidence; a `failed` decision requires an actionable note.

Reviews append to `probe-review-log.jsonl` and each probe keeps the latest
`review/probe-human-review.json` receipt. A review binds the recipe-definition,
video, and contact-sheet SHA-256 values. Regenerating the probe or changing the
recipe definition makes the prior review stale. Canonical evidence receives a
`probe.visualReview` update; legacy probe formats keep a separate receipt and
are never presented as canonical lifecycle evidence. Saving a review never
runs lifecycle `assess` or `apply`.

## Usage And Human Feedback

Only recipes that were actually compiled into a project's `shot-manifest.json`
are written to `usage-log.jsonl`. The record is keyed by project ID and the
hash of the assembled HyperFrames composition, so regenerating an unchanged
composition does not create duplicate usage evidence. Each project also keeps
the hash-bound receipt `review/motion-usage.json`.

Human review is append-only in `feedback-log.jsonl`. Open the workbench's
`复盘与模板回写 -> 动效复盘` tab to record, per recipe:

- `reuse`: visually stable and suitable for direct reuse in the stated topics;
- `tune`: useful, but timing, density, continuity, asset, or SFX behavior needs work;
- `hold`: evidence is still too weak for reuse;
- `retire-candidate`: failed badly enough to request a separate retirement assessment.

Feedback also records suitable topics, observed problems, reviewer, revision,
composition digest, and the source usage-record hash. Saving feedback never
changes `knowledge-explainer.lifecycle.json`. Promotion and retirement still
require the independent hash-bound gates in `docs/18-动效配方晋级与退役SOP.md`.

The central reusable media and official component catalog is
`style-library/assets/ASSET_REGISTRY.json`. Importing one of its media files
copies it into the selected project's `.media/manifest.jsonl`; the motion
library never renders from a remote URL or an unregistered file.

## Preferred Content-World Combinations

1. Keyword handoff: `morph-text` plus `scale-swap-transition` and
   `card-morph-anchor`. Use `focus-hit` only when a chapter idea lands, not on
   each word.
2. Relationship build: landscape `flowchart` plus `spatial-pan-stations` and
   `svg-path-draw`. Use `connector-draw` only on the relationship-completing
   connector.
3. Evidence pivot: `parallax-unzoom` plus `video-text-pivot` and
   `viewport-change`. The media surface moves inside `content.right`; the host
   and caption rail never join its camera wrapper.

## Sparse Semantic SFX

SFX plans validate against
`style-library/schema/semantic-sfx-plan.schema.json`. The checked example is
`style-library/examples/knowledge-explainer-sfx-plan.example.json`.

The example deliberately leaves bindings unresolved. A project resolves them
through media-use, which freezes the chosen file under `.media/audio/sfx/` and
records it in `.media/manifest.jsonl`. After resolution, replace the binding's
null fields with the manifest `id`, relative path, SHA-256, provider, and license
receipt. Do not place audio files or cache entries in `style-library/`.

SFX rules:

- One sound marks one semantic event; silence is the default.
- Maximum six cues per rolling minute, minimum 2.4 seconds between cues, and no
  overlapping semantic sounds.
- Never add sounds for host pose changes, caption changes, ambient camera drift,
  or every cue boundary.
- Narration is never ducked for SFX. Lower the SFX instead.
- Render uses frozen local paths only; remote URLs and unregistered files fail
  the contract.
