# AutoVideo Runbook - batch-smoke-30s-20260720

## New Script Route

```powershell
npm.cmd run video:new -- --id <project-id> --narration <approved.txt> --ratio 16:9 --duration <estimate>s --platform <platform>
npm.cmd run video:apply-template -- --project <project-id> --style modern-ip-host-explainer --palette light-apricot
npm.cmd run video:prepare-inputs -- --project <project-id>
npm.cmd run video:finalize-audio -- --project <project-id>
```

Continue from the workbench at `http://127.0.0.1:3339/`, or use `npm.cmd run video:run-standard -- --project <project-id>` for the internal autonomous route. Every generated artifact remains editable or regenerable through its owning stage.

## Reusable Technical Commands

```powershell
python scripts/build-host-pose-assets.py --project <project-id>
npm.cmd run video:finalize-audio -- --project <project-id>
npm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/<project-id>
npx.cmd --yes hyperframes@0.7.68 check hyperframes-workflow-kit/projects/<project-id>/production/hyperframes --strict --json
npm.cmd run video:sop-status -- --project <project-id>
```

## Project-Specific Fallbacks

A planning or style fallback is valid only when its receipt proves the same NarrationLock and audio hashes. A different script must generate its own semantic planning and same-window probe.

## Human Listening

Use the workbench audio review panel. Play the whole track, then inspect segments and every unresolved pronunciation. Approval writes hash-bound receipts without regenerating unchanged audio or timing artifacts.

## Final Review

Open HyperFrames Studio from the workbench and review the full 31.808-second timeline. Approve only after the current composition digest matches the review receipt.
