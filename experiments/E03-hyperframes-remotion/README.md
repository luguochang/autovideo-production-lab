# E03: Remotion -> HyperFrames bridge experiment

This isolated experiment tests two supported asset handoffs at `1920x1080`, `16:9`, `30fps`, and six seconds:

- **A / MP4:** Remotion renders one local H.264 MP4. HyperFrames consumes it as a direct-root `<video>` asset.
- **B / PNG stills:** Remotion exports frames 0, 60, and 120 as 1920x1080 PNGs. HyperFrames consumes them as three timed `<img>` clips.
- **C / runtime embedding:** analysis only. The Remotion React runtime is not embedded in HyperFrames because its frame state is not a HyperFrames-owned, synchronously registered paused timeline and would add bundling/runtime coupling.

The experiment intentionally uses a short, silent visual composition. It does not touch formal projects, the workbench, root dependencies, or production MP4s.

## Run

From the repository root:

```powershell
Set-Location E:\project\study\codex\autoVideo\experiments\E03-hyperframes-remotion
npm.cmd run remotion:render
npm.cmd run remotion:still:0
npm.cmd run remotion:still:60
npm.cmd run remotion:still:120
npm.cmd run hf:check:a
npm.cmd run hf:check:b
npm.cmd run hf:render:a
npm.cmd run hf:render:b
```

Checks must pass before either HyperFrames render. Outputs are intentionally short:

```text
hyperframes/a-video/assets/remotion-bridge.mp4
hyperframes/b-stills/assets/remotion-frame-000.png
hyperframes/b-stills/assets/remotion-frame-060.png
hyperframes/b-stills/assets/remotion-frame-120.png
hyperframes/a-video/renders/a-video.mp4
hyperframes/b-stills/renders/b-stills.mp4
```

## Expected result and adoption decision

The recommended production boundary is **Remotion as an offline asset pre-renderer, HyperFrames as the final timeline/render owner**. A works for footage-like or complex React visuals that do not need Studio object editing. B works for deterministic illustrations, diagrams, and keyframes where HyperFrames should own timing and transitions. Keep source frame metadata and hashes in the project asset receipt.

C should not be adopted for the production path. Direct runtime embedding would require the Remotion runtime to be made seek-safe under HyperFrames, to register synchronously, to avoid React/event/time state, and to render consistently offline in the HyperFrames browser. This experiment does not claim those conditions are satisfied.

### C feasibility analysis

Remotion components can be deterministic when every pixel derives from `useCurrentFrame()`, but that alone does not satisfy the HyperFrames runtime contract. A direct bridge would need all of the following before implementation is acceptable:

1. A HyperFrames runtime adapter that maps every out-of-order `hf-seek` to an exact Remotion frame and waits for the React commit before capture.
2. A positive, static duration and one synchronously registered seek driver. A playing Remotion `<Player>`, requestAnimationFrame loop, or event-driven seek is not sufficient.
3. Offline bundling of React, Remotion, fonts, and every asset with no render-time network request.
4. Repeated snapshot equality at the same timestamp, randomized seek-order tests, and multi-worker render equality.
5. A clear audio owner. HyperFrames must remain the final owner of audio playback and extraction; an embedded Remotion runtime must not play or seek audio itself.
6. A licensing decision for shipping the Remotion runtime rather than merely shipping pixels produced by it.

No existing adapter in this repository proves those six conditions. Building it would duplicate responsibilities already covered by the MP4/PNG handoff and would make Studio edits stop at the embedded surface boundary.

## Verification notes

The experiment was run on 2026-07-20 with Node `v24.18.0`, Remotion `4.0.489`, and HyperFrames `0.7.64`.

- Remotion MP4: `1920x1080`, `30fps`, `180` frames, `6.000s` video. The first Remotion output also contained a `6.0587s` silent AAC stream; HyperFrames A renders only the muted video and produces a video-only output.
- A check: passed with zero lint/runtime/layout/motion findings, `8/8` WCAG AA checks, and four snapshots at `0.5, 2.5, 4.5, 5.8s`.
- B check: passed with zero lint/runtime/layout/motion findings, `8/8` WCAG AA checks, and four snapshots at `0.5, 2.5, 4.5, 5.8s`.
- A draft render: `hyperframes/a-video/renders/a-video.mp4`, `1920x1080`, `30fps`, `6.000s`, H.264, video-only; full FFmpeg decode passed.
- B draft render: `hyperframes/b-stills/renders/b-stills.mp4`, `1920x1080`, `30fps`, `6.000s`, H.264, video-only; full FFmpeg decode passed.
- A second run of all four current Remotion commands reproduced the exact same four asset SHA-256 values recorded in `ASSET_RECEIPTS.json`.
- The first Remotion render downloaded the Remotion Chrome Headless Shell into the user cache. No root dependency, package manifest, or formal project was modified.

One HyperFrames 0.7.64 A-run stderr line is reproducible: `StaticGuard` reports that the `<video>` uses generated `data-end` without `data-duration`, even though the source HTML contains `data-duration="6"`. The command exit code remains `0`, the JSON check is `ok: true`, and the render extracts all `180` video frames. This is recorded as a toolchain warning to watch on upgrades, not suppressed in the composition.

## Adoption decision

Adopt **A** for self-contained complex React/Remotion scenes that do not need HyperFrames Studio to edit internal objects. Treat the rendered MP4 as a frozen, hash-addressed asset; keep the source Remotion project and its license receipt alongside it.

Adopt **B** for diagrams, illustrations, and other deterministic frames where HyperFrames should own the timing, transitions, captions, and final render. For a long sequence, prefer a true image sequence or a compact set of timed stills only when the visual cadence permits it; do not replace continuous motion with dozens of large PNGs without measuring storage and render cost.

Do **not** adopt C as a production bridge yet. A direct Remotion runtime would need a synchronously registered, paused, frame-seekable adapter with no React event state, render-time clocks, network dependencies, or hidden hydration order. The current experiment intentionally proves the safer asset boundary instead.
