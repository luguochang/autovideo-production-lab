# License and dependency receipts

| Item | Version / source | License note | Use in experiment |
|---|---|---|---|
| Remotion | `4.0.489`, repository root `node_modules` | Package declares `SEE LICENSE IN LICENSE.md`; Remotion is not treated as OSI-open-source. Confirm the applicable Remotion license before commercial redistribution. | Offline generation of MP4 and PNG assets |
| React / React DOM | `19.1.1`, repository root `node_modules` | MIT | Remotion composition runtime |
| HyperFrames CLI | `0.7.64`, `npx` pinned command | Apache-2.0 | Final HTML timeline checks and short draft renders |
| GSAP | copied from `hyperframes-workflow-kit/projects/persondesign-modern-host-probe/assets/gsap.min.js` | Existing HyperFrames asset receipt; verify the source project receipt before redistribution. | Paused HyperFrames timelines |
| FFmpeg / FFprobe | local executable used by Remotion and HyperFrames | License depends on the local build (LGPL/GPL); record the concrete build for delivery. | Encoding and media verification |

No network asset, font CDN, model, or WebUI download is used by the composition. The only package lookup is the pinned HyperFrames CLI and the already-installed root Remotion toolchain.
