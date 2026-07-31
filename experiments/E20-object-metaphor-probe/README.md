# E20 Object Metaphor Probe

This is an internal 8-second candidate probe for `object-metaphor@1.0.0`. It adapts the official HyperFrames `spatial-pan-stations` blueprint and `svg-path-draw` rule inside the approved `modern-ip-host-explainer` shell.

## Fixed contract

- `1920x1080`, landscape `16:9`, `30fps`, root duration `8s`.
- Background is exactly `#F2DFC7`.
- One frozen Q-version `present` host stays in `host.left`.
- One registered `.media/images/system-layers.svg` object travels through entry, model, API, data, and orchestration stations.
- Only `#station-world` pans, within `x -1570..0` and `y -20..20`, inside `content.right`.
- The exact narration remains in the fixed caption rail; screen labels are generated summaries.
- Audio is referenced only from `.media/audio/voice/narration.wav`. No microphone, recording, autoplay, playback call, or external sound output is authorized.

## Motion phases

| Phase | Window | Behavior |
| --- | --- | --- |
| Establish | `0-1.04s` | Bring in the fixed shell, visible entry, and the one layers object. |
| Traverse | `1.04-5.12s` | Draw four route segments and pan the bounded world through model, API, data, and orchestration. |
| Resolve | `5.12-7.0s` | Settle the object at orchestration and reveal the four-layer conclusion. |
| Final hold | `7.0-8.0s` | Keep camera, object, station, conclusion, host, and caption stable for reading. |

## Technical verification status

```powershell
npm.cmd run lint
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
```

The technical verification pass is complete for internal use:

- HyperFrames `0.7.67` strict check passed with `0` errors and `0` warnings.
- Deterministic snapshots and contact sheets were generated.
- The internal MP4 rendered at `1920x1080`, `30fps`, `8s` and passed FFprobe, full decode,
  audio-level, black-frame, and sampled-frame checks.
- Audio validation decoded the imported frozen WAV to a null sink only. No microphone,
  recording API, autoplay, `audio.play()`, or external sound output was used.

Human visual review, lifecycle acceptance, and project approval are still required. The recipe
remains `candidate` and cannot be promoted from these machine checks.

## Review status

The composition and provenance contracts are authored and the technical evidence is recorded.
`PROBE_REVIEW.md` still requires real human visual approval before lifecycle apply or promotion.
