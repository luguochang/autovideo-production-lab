# Revideo headless-render smoke test

This directory is copied from the official Revideo `0.11.0` template at commit `b5de67a009a55aa2768a1e178b0446b2479a0b4e`.

```powershell
npm.cmd install
$env:DISABLE_TELEMETRY='true'
npm.cmd run render
```

Installation and TypeScript compilation pass on Windows with Node `24.18.0`. Two render attempts failed in Puppeteer's `page.goto()` with `Error: Navigating frame was detached`, so no MP4 is claimed from this machine. Revideo's source does provide a real `renderVideo()` headless API, parallel workers, variables, and a React player; it remains a Linux/Docker retest candidate rather than the Windows production default.
