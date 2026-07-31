# Motion Canvas continuous-canvas smoke test

This isolated experiment uses Motion Canvas's native `Camera` node and reads stable objects plus operations from `src/canvas.json`.

```powershell
npm.cmd install
npm.cmd run build
npm.cmd start -- --host 127.0.0.1 --port 9001
```

The official editor renders from its `RENDER` button. The undocumented-but-shipped `?render` URL hook can start that browser-side render automatically, but Motion Canvas has no supported headless render CLI as of 3.17.2. Issues `#415` and `#1218` remain open, so production automation needs a browser wrapper.

## Verified result and caveat

- TypeScript and Vite production build passed.
- A hidden Chrome visit to `http://127.0.0.1:9001/?render` produced `output/project.mp4` through the official FFmpeg plugin.
- Output: 1920x1080, 30 fps, 8.033 s, H.264 + AAC 48 kHz.
- The wrapper first crashed Vite because a Chrome profile inside the project was watched and locked. The profile must live outside the project.
- Semantic frame QA found the first part of this experimental output blank even though `blackdetect` passed. This artifact is not an accepted visual sample and is evidence that the browser wrapper still needs stronger lifecycle and frame-validity checks.
