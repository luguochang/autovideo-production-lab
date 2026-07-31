# E18 Code Proof Probe

Internal 8-second candidate probe for `code-proof@1.0.0`. It adapts the official HyperFrames
`code-highlight` block inside the approved `modern-ip-host-explainer` shell and uses real project
source from `workflow-console/server.mjs` as the evidence surface.

## Fixed contract

- `1920x1080`, landscape `16:9`, `30fps`, root duration `8s`.
- Background remains exactly `#F2DFC7`.
- One frozen Q-version host stays in `host.left` for the entire probe.
- The editor stays in `content.right`; only `#editor-camera` receives the subtle content-camera move.
- The caption rail stays persistent in `caption` and contains the exact NarrationLock text.
- The audio window, narration text and NarrationLock hashes match the E06 lifecycle baseline.

## Reuse and evidence

- Official registry block: `code-highlight`, frozen verbatim under `references/official/`.
- Official motion rules: `discrete-text-sequence` and `viewport-change`.
- Project evidence: lines `281-293` of `workflow-console/server.mjs`, summarized by `CodeProofIR.json`.
- The official full-screen dark style is not imported; only its highlight-band behavior is adapted
  into the approved right-side content surface.

Exact source hashes and adaptation mapping are recorded in `SOURCE_RECEIPT.json`.

## Verify

```powershell
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
ffmpeg -v error -i renders/code-proof-probe.mp4 -f null NUL
```

The checked-in MP4 is for internal review only. `code-proof` remains `candidate`; no lifecycle apply
or recipe promotion is performed by this probe.
