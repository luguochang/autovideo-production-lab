---
type: hyperframes-production-qa
status: complete
project_id: demoText-a6-handdrawn-landscape
updated_at: 2026-07-16
---

# demoText A6 横屏制作与媒体 QA

## Production Gate

- Style: `handdrawn-workflow-tutorial` (A6), approved by user on 2026-07-16.
- NarrationLock: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`.
- Composition: `1920x1080`, 30 fps, `274.394667s`.
- Audio: local frozen Edge TTS `assets/narration.wav`, `zh-CN-YunxiNeural`, rate `1.08`.
- Render approval: granted by the user's message `任务可以进入制作`.

## Pre-render Checks

Command:

```powershell
npx.cmd --yes hyperframes@0.7.59 check --snapshots --json
```

Required results:

- runtime: 0 errors
- layout: 0 errors
- motion: 0 errors, using `index.motion.json`
- contrast: 0 errors
- snapshots: generated at the semantic chapter checkpoints

The only accepted non-blocking finding is the composition-size warning for the single continuous-board HTML file. The three `pointer-events:none` findings are informational and intentional for the paper texture, routes, and caption overlay.

Machine-readable receipt: `projects/demoText-a6-handdrawn-landscape/check-final.json` (`ok: true`; snapshots enabled; 5 overview PNGs; no finding crops).

## Render Outputs

- Draft: `projects/demoText-a6-handdrawn-landscape/renders/demoText-a6-draft.mp4`
- Final: `projects/demoText-a6-handdrawn-landscape/renders/demoText-a6-final.mp4`

For each output, record:

- `ffprobe` duration, dimensions, frame rate, audio stream and codec
- full decode success
- black-frame scan at chapter boundaries and the final hold
- visual review of the continuous board, camera handoffs, captions and final red lock

## Review Notes

- This is one oversized persistent board with a single camera transform; it must not be interpreted as slide/page transitions.
- Generated screen summaries remain marked `generated-summary`; exact narration captions remain `exact-source`.
- The final station lock is `#s14-action` and is expected to appear by 273.0s, then hold through the audio tail.

## Draft Result

- Output: `renders/demoText-a6-draft.mp4` (18.2 MB).
- Container duration: `274.410667s`; logical composition duration: `274.394667s` (one 30fps frame of muxing tolerance).
- Video: H.264 Constrained Baseline, 1920x1080, 30 fps, progressive, yuv420p.
- Audio: AAC-LC, 48 kHz, stereo.
- Full decode: passed (`ffmpeg -v error -i ... -f null NUL`).
- Black-frame scan: no sustained black frame detected at `d=0.08`, `pix_th=0.10`.
- Visual review: chapter contact sheet and final lock frame show one continuous board, no page-flash transition, no black flash, and a readable final `珍贵` lock.

## Final Result

- Output: `renders/demoText-a6-final.mp4` (26,526,430 bytes).
- SHA-256: `660A7131C094DC985516AF0495FF83AFBC089BD0E23FA9A4A26029DF73A3CB77`.
- Container duration: `274.410667s`; logical composition duration: `274.394667s` (one 30fps frame of muxing tolerance).
- Video: H.264 High, 1920x1080, 30 fps, progressive, yuv420p, 16:9.
- Audio: AAC-LC, 48 kHz, stereo.
- Full decode: passed.
- Black-frame scan: no sustained black frame detected at `d=0.08`, `pix_th=0.10`.
- Integrated loudness: `-24.1 LUFS`; true peak: `-5.7 dBFS`; LRA: `4.5 LU`.
- Visual review: stable post-chapter frames and final hold show one continuous board, readable Chinese captions, camera handoffs, and the final red `珍贵` lock. No black/page-flash transition was observed.

Production QA complete. Draft remains available for quick review; final is the delivery master.
