# Keyword Handoff probe review

Status: `awaiting-human-visual-review`

Review the 8-second MP4 and the contact sheet together. Technical checks are already green, but
that does not approve the recipe.

## Required decisions

- Does the old keyword visibly compact into context instead of disappearing as a page cut?
- During both handoffs, is there no flash, empty content frame, or double full-page exposure?
- Does the host remain fixed and visually stable in `host.left`?
- Is the exact narration readable in the fixed caption rail without competing with the main keyword?
- Is the official caption emphasis adaptation visible but restrained?
- Is the terminal frame readable long enough?

## Evidence

- Motion probe: `renders/keyword-handoff-probe.mp4`
- Contact sheet: `snapshots/contact-sheet.jpg`
- Transition frames: `snapshots/frame-02-at-3.18s.png`, `snapshots/frame-03-at-3.7s.png`,
  `snapshots/frame-04-at-5.34s.png`, `snapshots/frame-05-at-5.9s.png`
- Strict check: `check.capture.log`

Do not edit the lifecycle ledger from this file. After review, record the decision in the lifecycle
evidence and run `motion:lifecycle assess` before any state change.
