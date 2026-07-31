# E15 Diagram Build Probe

This is an internal 8-second candidate probe for `diagram-build@1.0.0`. It adapts the official HyperFrames `flowchart` block and `svg-path-draw` rule inside the approved `modern-ip-host-explainer` shell.

## Fixed contract

- `1920x1080`, landscape `16:9`, `30fps`, root duration `8s`.
- Background is exactly `#F2DFC7`.
- One frozen Q-version `present` host stays in `host.left` for the whole probe.
- All diagram content stays in `content.right`; only `#diagram-camera` moves, and it is inside `content-world`.
- The caption rail stays persistent at `caption` and contains the exact NarrationLock text.
- The same E06 0-8 second WAV is used; no audio regeneration occurred.

## Motion phases

| Phase | Window | Behavior |
| --- | --- | --- |
| Establish | `0-2.72s` | Introduce the title, draw the first connector, arrive at node 2, draw the second connector, arrive at node 3. |
| Focus | `2.72-6.24s` | Dim secondary nodes, highlight model call, redraw the first relation, then hand focus through API connection to tool-chain orchestration. |
| Pull back | `6.24-7.1s` | Return the content-only camera to the complete three-node relation and reveal the conclusion rail. |
| Final hold | `7.1-8s` | Hold the complete relation, conclusion and caption for human reading. |

## Commands

```powershell
npm.cmd run lint
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
```

The authoritative strict gate is `strict-check.log`. `hyperframes keyframes` output and the focused strip are in `review/`. A high-quality MP4 is in `renders/`; `review/render-qa/DECODE_QA.json` binds ffprobe, audio decode and sampled frames from the actual MP4.

## Review status

Automated checks and render QA pass. The recipe remains `candidate`; review `PROBE_REVIEW.md` and do not run lifecycle apply or promote it without human visual approval.
