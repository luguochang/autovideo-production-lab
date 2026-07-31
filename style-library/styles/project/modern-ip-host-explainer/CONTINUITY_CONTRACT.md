# Continuous Shell Contract

This contract fixes the presenter and information architecture for long-form explainer production.

## Persistent Layers

- `stage`, `host.left`, `content.right`, and `caption` remain mounted for the entire video.
- The host never moves between left and right during one video. The default is `host.left`.
- Pose changes crossfade inside the same normalized 600x730 host wrapper.
- The background, caption rail, and structural rules are not recreated at scene boundaries.
- Captions use one persistent rail and deterministic GSAP handoffs. They are not emitted as dozens of independently visible clip layers.
- The master timeline and every reusable sub-composition include an explicit duration anchor.
- The composition holds the first visual for `0.35s` before narration starts. Audio, captions and cue motion share that offset.

## Content Handoff

The current keyword group owns one stable content anchor. At a cue handoff:

```text
current keyword -> move up + scale to 54% + reduce opacity
next keyword    -> enter from the same anchor + settle at 100%
older context   -> fade out before another history item is added
```

At most two semantic groups are visible during the handoff: the incoming group and one compact history group. An empty content frame is a QA failure.

## Text Responsibility

- Captions contain the complete, exact NarrationLock text.
- The main stage displays one to four source-linked keywords, a contrast, or a real relationship.
- A narration sentence must not be duplicated as both a scene title and main body text.
- Process diagrams are used only for genuine ordered relationships. Other cues use typography, icon motifs, contrast, or a compact sequence.
- A manual visual override uses `主词｜辅助词｜辅助词` and is stored as `manual-keywords`; it never changes NarrationLock or captions.

## Editable Visual Variants

- `focus`: one dominant keyword with up to three supporting terms.
- `signal`: risk, failure, warning or a firm conclusion.
- `stack`: a real parallel checklist with up to three active rows.
- `route`: only for an ordered process or an explicit from-to relationship.
- `contrast`: exactly two states with one directional shift.
- `close`: collapse the chapter into a short conclusion.

Automatic selection is the baseline. The workbench may lock one variant for a cue or stable visual object, and that override invalidates only production and downstream QA/render stages.

## Motion QA

- Sample at least one frame before, on, and after every scene boundary.
- Fail if the persistent stage, host, or content anchor disappears at a boundary.
- Fail if a pose changes position, eye line, or dominant scale.
- Fail if the outgoing and incoming content both reach opacity zero in the same frame.
- Fail if a sub-composition timeline ends before its declared `data-duration`.

The inline motif icons used by the compiler come from `lucide-react@0.468.0` under the ISC license; the build receipt records this provenance.
