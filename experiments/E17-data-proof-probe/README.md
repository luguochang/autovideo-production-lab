# E17 Data Proof Probe

Internal 8-second candidate probe for `data-proof@1.0.0`. It adapts the official HyperFrames `data-chart` block and `stat-bars-and-fills` rule inside the approved `modern-ip-host-explainer` shell.

## Fixed contract

- `1920x1080`, landscape `16:9`, `30fps`, root duration `8s`.
- Background remains exactly `#F2DFC7`.
- One frozen Q-version `present` host stays in `host.left` for the whole probe.
- Data proof content stays in `content.right`; only `#chart-camera` moves.
- The caption rail stays persistent in `caption` and contains the exact NarrationLock text.
- The chart is a structural explanation (`1 -> 2 -> 3` layers), not an external performance claim.

## Motion phases

| Phase | Window | Behavior |
| --- | --- | --- |
| Establish | `0-2.72s` | Reveal title, bottom-anchored bars and values in order, then draw the measured trend path. |
| Focus | `2.72-6.24s` | Dim earlier layers, move a beacon through the relation, and outline the tool-chain layer without enlarging the bar. |
| Pull back | `6.24-7.1s` | Return to the complete three-layer relation and reveal the evidence conclusion band. |
| Final hold | `7.1-8s` | Hold the complete relation, source note, conclusion and caption for reading. |

## Commands

```powershell
npm.cmd run lint
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
```

The authoritative strict gate is `strict-check.log`. Keyframe diagnostics and the focused camera strip are in `review/`. The high-quality MP4 is in `renders/`; `review/render-qa/DECODE_QA.json` binds ffprobe, audio decode and sampled frames from that actual MP4.

## Review status

Automated checks, keyframe diagnostics and render QA pass. This recipe remains `candidate`; review `PROBE_REVIEW.md` and do not run lifecycle apply or promote it without human visual approval.
