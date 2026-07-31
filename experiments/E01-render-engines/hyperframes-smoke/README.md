# HyperFrames continuous-canvas smoke test

This isolated experiment proves that a stable-object canvas and camera timeline can be generated from structured JSON and rendered with HyperFrames. It does not modify the main Remotion prototype.

## Reproduce

```powershell
node generate.mjs
npx.cmd -y hyperframes@0.7.59 check
npx.cmd -y hyperframes@0.7.59 render --output ..\hyperframes-smoke.mp4 --workers 1 --crf 20
```

Source data is in `canvas.json`. The generated `index.html` remains directly editable in HyperFrames Studio, while regeneration provides a deterministic automation path.

## Verified result

- HyperFrames `0.7.59`, Windows, Node `24.18.0`.
- `lint --json`: 0 errors, 0 warnings after adding stable media IDs, local font declarations, and transform-only motion.
- Output: `../hyperframes-smoke.mp4`, 1920x1080, 30 fps, 8.000 s, H.264 + AAC 48 kHz.
- `blackdetect`: no black intervals.
- Contact sheet: `../hyperframes-smoke-contact.png`.
