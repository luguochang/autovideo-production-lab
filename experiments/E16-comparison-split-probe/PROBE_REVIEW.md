# Comparison Split probe review

Status: `awaiting-human-visual-review`

Review the 6-second MP4 and contact sheet together. Technical checks can prove timing, layout,
determinism, and media integrity; they do not approve the visual recipe.

## Required decisions

- Do the two states read as one continuous comparison rather than two PPT pages?
- Is there exactly one `看起来` state and one `实际上` state, with no accidental third state?
- Are the two fixed footprints and text weights comparable despite the selected-state handoff?
- Is the mirrored 3D entry restrained enough for the fixed light-apricot brand shell?
- During `1.92-4.44s`, do both states remain readable while focus shifts?
- During `4.44-5.25s`, does the selected-state scale handoff feel continuous rather than like a cut?
- Is the final `5.25-6.00s` hold long enough to read `工程复杂度仍在`?
- Does the Q-version host remain fixed and stable in `host.left` throughout?
- Is the caption rail readable without competing with the two-state comparison?
- Are side glows, perpetual idle float, full-frame camera motion, and page flashes absent?

## Evidence

- Motion probe: `renders/comparison-split-probe.mp4`
- Contact sheet: `snapshots/contact-sheet.jpg`
- Transition stills: `snapshots/frame-04-at-4.44s.png`, `snapshots/frame-05-at-5.25s.png`
- Strict check: `check.capture.log`
- Render QA and frame observations: `RENDER_QA.json` and `review/render-qa/`
- Official reuse: `official-reuse-receipt.json`
- Brand invariant binding: `INVARIANT_AUDIT.json`

Do not run lifecycle `apply` or promote this recipe from this review file. After explicit approval,
record a separate lifecycle evidence receipt and assess the transition through the project lifecycle CLI.
