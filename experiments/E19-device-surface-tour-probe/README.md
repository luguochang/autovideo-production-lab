# E19 Device Surface Tour Probe

Internal 8-second candidate probe for `device-surface-tour@1.0.0`. It adapts the official
HyperFrames `app-showcase` multi-surface relationship and `device-surface-showcase` sequencing
inside the approved `modern-ip-host-explainer@1.0.0` shell.

## Fixed contract

- `1920x1080`, landscape `16:9`, `30fps`, root duration `8s`.
- Background remains exactly `#F2DFC7`.
- One frozen Q-version `present` host remains fixed in `host.left`.
- The frozen real workbench screenshot is cropped into three traceable surfaces in `content.right`:
  project/input, workflow graph, and inspector/evidence.
- Only `#surface-camera`, a descendant of `#content-world`, receives camera transforms.
- The persistent caption rail remains outside the camera and contains the exact NarrationLock window.
- The only audio reference is `.media/audio/voice/narration.wav`; the node uses `preload="none"`.

## Motion phases

| Phase | Window | Behavior |
| --- | --- | --- |
| Project / input | `0-2.36s` | Establish all three related surfaces with project/input dominant. |
| Workflow graph | `2.36-5.34s` | Pan the bounded content camera to center the graph; dim the first surface instead of cutting it away. |
| Inspector / evidence | `5.34-8.00s` | Move focus to the inspector/evidence crop and hold the final traceable state. |

The composition uses one synchronous paused GSAP timeline. It has no iframe, fetch, remote font,
remote runtime, pointer event, runtime measurement, microphone API, recording API, autoplay,
`audio.play()`, `video.play()`, SFX, or external output-device call.

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

`PROBE_REVIEW.md` is still pending for the nine human visual checks. The technical evidence
does not approve the recipe, run lifecycle `apply`, or promote a template.

## Source receipts

- `SOURCE_RECEIPT.json` binds the official local `app-showcase` copy, official blueprint,
  `viewport-change` rule, composition hash, frozen workbench image, host, audio, and GSAP runtime.
- `AssetManifest.json` and `.media/manifest.jsonl` record every runtime media file and its rights
  boundary.
- The official reference itself includes remote assets, but it is not loaded by `index.html`; the
  E19 runtime is fully local.

No lifecycle apply or template promotion is authorized by these authored files.
