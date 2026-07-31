# Asset Manifest

Project: `demoText-a6-handdrawn-landscape`

This manifest records the provenance and license status for assets used by the
composition. Hashes are SHA-256 of the files currently in this project.

## Frozen local assets

| ID | Project path | Provenance / source | SHA-256 | License / status |
|---|---|---|---|---|
| A-SCRIPT | `assets/demoText.txt` | User-provided copy of `demo/demoText.txt`; CRLF bytes preserved | `ec1a51a269faf0344b2ba93abf21c4a75b8aac51d4a0996bd43ac2c66af33198` | User content; no separate license statement. Do not rewrite. |
| A-AUDIO | `assets/narration.wav` | Frozen copy of `experiments/E08-demo-candidates/shared/narration.wav`; Edge TTS `zh-CN-YunxiNeural`, rate `1.08` | `03756e4081e98703b1c14160de3e9aa97ecb6536ed371a3c210ca7b72e0c1071` | Project-generated audio. Provider/service terms and commercial voice rights must be confirmed before redistribution. Do not re-request for this render. |
| A-TIMING | `assets/narration.json` | Timing and word/caption metadata from the same frozen Edge TTS run; NarrationLock normalized-text hash is `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c` | `2bf4f1b0a46f9bb9c02496dd9de847b65042e71b446ff61c3101c333f3dd2808` | Project-derived metadata; no external media license. Machine source for cue timing. |
| A-GSAP | `assets/gsap.min.js` | Copied from `experiments/E08-demo-candidates/node_modules/gsap/dist/gsap.min.js`, GSAP `3.14.2` | `c174bfce53a729418d57a8ad8625e7247c793a22fef8e2851e3cfa3de9cd8280` | GreenSock standard license: <https://gsap.com/standard-license/>. This is not an OSI open-source license; review product/editor distribution terms before SaaS use. |
| A-BOARD | `board.json` | Project-authored machine-readable chapter/cue index derived from `assets/narration.json`; contains no rewritten narration | `eb56ee064e9a56fd2673fc07910846df99fe429e327457561f83d4ce2ba35260` | Project code/data; no third-party media. |
| A-DRAFT-RENDER | `renders/demoText-a6-draft.mp4` | HyperFrames `0.7.59` local draft render from this composition and frozen narration | `d18cf386f8a8eae66327ec244732bc77ac9ae2afa3ac404f0603e6b328b2e79b` | Project-generated preview; delivery rights follow the source voice and font terms. |
| A-FINAL-RENDER | `renders/demoText-a6-final.mp4` | HyperFrames `0.7.59` high-quality local render from this composition and frozen narration | `660a7131c094dc985516af0495ff83afbc089bd0e23fa9a4a26029df73a3cb77` | Project-generated delivery candidate; delivery rights follow the source voice and font terms. |

Audio technical receipt: PCM S16LE, 48 kHz, stereo, `274.394667s`, 52,683,854 bytes.

## Runtime and reference receipts

| Item | Use | Version / source | License / decision |
|---|---|---|---|
| HyperFrames CLI/runtime | Local check, preview and render commands | npm `hyperframes@0.7.59`; official repository snapshot in `vendor/hyperframes` | Apache-2.0. The package is a runtime dependency, not copied into the composition. |
| Motion references | Choreography guidance only: spatial pan, viewport change, SVG path draw, marker patterns | `vendor/hyperframes/skills/hyperframes-animation/` | Reference documentation from the Apache-2.0 HyperFrames source tree; no external media copied. |
| A6 style documents | Visual constraints and source-tag policy | `style-library/styles/f1/handdrawn-workflow-tutorial/` and user `demo/f1` documents | Spec-only / license unknown. Used as design specification, not as code, images, fonts or templates. |
| Chinese font stack | `Noto Sans SC` -> `Microsoft YaHei` -> `sans-serif` | System/project fallback; no font file bundled | License depends on the installed system font. Record an actual bundled font and its license before redistribution. |

## Composition-owned assets

The paper background, ink paths, cards, arrows, markers and other A6 elements
are authored as local HTML/CSS/SVG in this project. They must remain deterministic
and contain no remote image, font, texture, or runtime URL. When a separate file
or generated bitmap is added, append its path, SHA-256, generation/source record,
and license here before rendering a release candidate.

## Network and redistribution notes

- The composition should load local `assets/gsap.min.js` and local audio; no CDN
  dependency is allowed for a reproducible render.
- The Edge TTS audio is frozen for this project. Re-generating it can change
  word boundaries and duration, so a new audio run requires a new NarrationLock
  and a fresh manifest receipt.
- User-provided text and provider-generated voice are not automatically covered
  by the licenses of HyperFrames or GSAP.
