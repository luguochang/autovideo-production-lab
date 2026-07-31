# E17: Evidence Pivot + Click probe

This is a lifecycle-ready candidate probe for `evidence-pivot@1.0.0`. It tests one real local
workbench screenshot inside the already approved `modern-ip-host-explainer@1.0.0` brand shell.

## Locked shell

- exact `#F2DFC7` background;
- `1920x1080`, `30fps`, 8 seconds;
- one existing Q-version host fixed in `host.left`;
- evidence fixed in `content.right`;
- exact narration remains in the persistent caption rail;
- all evidence camera motion stays below `#content-world`;
- E06 `NarrationLock.json`, narration text, and 8-second WAV are byte-identical copies.

## Probe choreography

| Time | Operation |
| --- | --- |
| 0.00-2.56s | Establish the cropped V5 workbench evidence. |
| 2.56-3.10s | Move the precomputed cursor to the selected `素材登记` node. |
| 3.10s | Press and emit one restrained visual ring. No click SFX is registered. |
| 3.30-5.76s | Hold the evidence with exactly one source label and one conclusion callout. |
| 5.76-6.90s | Adapt official `parallax-unzoom`: contract the evidence and settle the callout. |
| 6.90-8.00s | Hold the terminal evidence/conclusion layout. |

The screenshot is a real local project UI capture, not an online asset or reconstructed mockup. The
click and camera coordinates are constants in `index.html`; there is no iframe, network fetch,
pointer-driven state, or tween-time DOM measurement.

## Reuse

- official registry component: `parallax-unzoom`, installed unchanged under
  `compositions/components/parallax-unzoom.html`;
- official animation rule: `cursor-click-ripple`, adapted to one ring and no SFX;
- local GSAP runtime copied from the checked E06 probe.

Exact source hashes and adaptation mapping are in `OFFICIAL_REUSE_RECEIPT.json`.

## Verify

```powershell
npx.cmd --yes hyperframes@latest upgrade --project . --check
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
ffmpeg -v error -i renders/evidence-pivot-click-probe.mp4 -f null NUL
```

The checked-in MP4 is `internal-review` only. `evidence-pivot` remains `candidate`; do not run
lifecycle `apply` until the human visual review is recorded.
