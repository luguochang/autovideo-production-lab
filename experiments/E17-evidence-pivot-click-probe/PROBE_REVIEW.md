# Evidence Pivot + Click probe review

Status: `awaiting-human-visual-review`

Review the 8-second MP4 and contact sheet together. Technical checks are green; that does not
approve or promote the recipe.

## Required decisions

- Does the real workbench image read as evidence rather than a decorative screenshot?
- Does the click land unmistakably on `素材登记` without looking noisy or exaggerated?
- Is a single ring restrained enough, and is silence preferable to a candidate click SFX here?
- From 3.30-5.76s, are the one source label and one callout sufficient and uncluttered?
- From 5.76-6.90s, does the evidence unzoom feel continuous rather than like a page cut?
- Does the host remain fixed in `host.left`, with no camera motion or pose jump?
- Is the 6.90-8.00s terminal state readable long enough?

## Evidence

- MP4: `renders/evidence-pivot-click-probe.mp4`
- Contact sheet: `snapshots/contact-sheet.jpg`
- Click still: `snapshots/frame-02-at-3.1s.png`
- Unzoom stills: `snapshots/frame-04-at-5.76s.png`, `snapshots/frame-05-at-6.4s.png`,
  `snapshots/frame-06-at-6.9s.png`
- Terminal still: `snapshots/frame-07-at-7.7s.png`
- Render extracts: `review/render-qa/`
- Strict check: `check.strict.log`
- Invariant audit: `INVARIANT_AUDIT.json`
- Official reuse: `OFFICIAL_REUSE_RECEIPT.json`

Do not run lifecycle `apply` from this review file. Record an explicit visual decision first, then
run `motion:lifecycle assess`; promotion requires a separate authorized action.
