# RAG 全链路视频制作提示词

状态：`reviewed-preproduction-contract`  
执行范围：首条完整试片；不扩展批量项目、P1/P2、新框架或额外审计功能。

## 输入合同

```text
project_id: rag-full-chain-5m-20260728
narration_candidate: input/narration.editorial.draft.txt
narration_candidate_sha256: 0bd400ff29c30be0161c3a927926dc09cc25a4f448cfaa35d6a46afc854f9c97
narration_status: draft; do not synthesize or time visuals until NarrationLock approval
format: 16:9, 1920x1080, 30fps
duration: final narration WAV duration; never force a minute target
platform: bilibili
audience: technical interviewers and experienced AI developers
message: RAG is a measurable data chain; production choices are combinations, not a tool list
```

## 风格合同

```text
style_id: modern-ip-host-explainer@1.0.0
palette: light-apricot / #F2DFC7
load: frame.md, STYLE_GUIDE.md, POSE_MANIFEST.json, LAYOUT_CONTRACT.md,
  PLANNING_CONTRACT.json, PALETTE_VARIANTS.json
layout: host.left + content.right + captions.bottom
host: one persistent character, one pose visible at a time
content: one stable chapter board; 3-6 sequential semantic states inside that board
screen_text: narration is exact-source captions; headings and labels are generated-summary
spoken_structure: screen may retain short navigation labels, but narration must use the approved conversational transitions and never read category labels verbatim
screen_only_notes: load review/narration-editorial-report.json#screenOnlyTechnicalNotes; render as small source/parameter notes only, never merge into voiceover or exact-source captions
```

## 章节规划提示词

```text
Map narration sections 0-14 to exactly 15 chapter boards. Do not merge chapters to hit a duration.
For every chapter, derive timing only from final alignment cues and record:
1. viewer takeaway;
2. one stable terminal board containing every object needed in that chapter;
3. 3-6 semantic states that reveal, focus, connect, compact or replace those objects;
4. one persistent object handed into the next chapter;
5. exact-source captions and generated-summary screen labels;
6. 2-4 allowed motion rules selected by semantic relationship.

Use these carriers in order: main data path, parsing layers, chunk windows,
context prefix, vector space, index topology, query branches, multi-route merge,
ranking stack, rerank funnel, Agentic state machine, citation binding,
evaluation trace, production checklist, full-chain pullback.
```

## 单屏与防叠影提示词

```text
The chapter board is spatially stable. Precompute every object's final coordinates in content.right.
No normal document flow, runtime layout measurement or entrance that changes the board dimensions.
At most three active semantic nodes, one headline, one helper/evidence object and one connector.
Before a new group enters, the previous group must compact, replace or exit at an explicit cue.
Temporary connectors, glows and intermediate labels must be cleared before the chapter transition.

All host poses share one host wrapper and normalized eye line, scale, crop and anchor.
Outgoing and incoming pose windows are mutually controlled; never render two dominant figures.
Pose changes occur only at semantic handoffs and never more than two times in eight seconds.
Never use transparent history frames, duplicated host layers, decorative ghost trails,
PPT page flips, repeated equal cards, particles, infinite loops or continuous zoom.
```

## 动效选择提示词

```text
Use only the approved rules unless a demonstrated gap is recorded:
- svg-path-draw: real paths, connectors, state transitions;
- viewport-change: bounded content-world focus only, never host or caption rail;
- card-morph-anchor: one semantic container handoff;
- scale-swap-transition: one object/state replacement at the same anchor.

Each state must name its motion verbs. Motion explains a relationship; it is not decoration.
The rhythm within a chapter is: establish full space -> focus current state -> build relation
-> hold readable terminal state -> clear temporary state. Chapter boundaries may use a short,
non-overlapping content transition after both boards have valid hidden/visible terminal states.
```

## 音频与时序提示词

```text
Use only the promoted audio/narration.final.wav. Its ffprobe duration overrides every estimate.
Generate alignment, captions, scene boundaries and motion cues from that exact WAV.
Any text, punctuation, speaker, speed, seed or WAV change invalidates all downstream timing.
No microphone, autoplay, programmatic playback or audio-output tests. File-in/file-out QA only.
```

## 自动 QA 提示词

```text
Before user review, prove all of the following:
- HyperFrames lint/check pass on the final composition;
- 1920x1080 landscape, exact final WAV duration, top-level audio element;
- every scene midpoint and every transition boundary has a nonblank snapshot;
- zero host/content/caption collisions and no text clipping;
- one dominant host only, no pose double exposure, no stale intermediate element;
- animation map has no dead zones, infinite motion, runtime measurement or lifecycle warnings;
- captions match NarrationLock and remain readable within two lines;
- media, host and audio provenance receipts are current;
- internal-review MP4 fully decodes and its duration matches the composition.

Only after these checks pass, open the full Studio preview for the user's concentrated listening
and full-film acceptance. Do not render or label a public master before that approval.
```
