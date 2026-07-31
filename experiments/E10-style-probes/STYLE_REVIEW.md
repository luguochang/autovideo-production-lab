# E10 Style Review

## Shared Test Window

- Narration source: `demo/demoText.txt`
- Narration SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Exact source range: `57.0486088s-64.2908627462s`
- Shared audio: `shared/narration-slice.wav`
- Formats: portrait `720x1280 / 30fps`; landscape `1280x720 / 30fps`

## Candidates

| Candidate | Intended read | Motion identity | Main risk | Portrait render | Landscape render |
|---|---|---|---|---|---|
| A | teach on one evolving board | virtual camera pan + hand-drawn routes | too much camera travel can reduce reading time | `renders/A-handdrawn-board.mp4` | `renders/A-handdrawn-board-landscape.mp4` |
| B | scrapbook evidence extraction | paper pull, tape settle, marker sweep | collage can become decoration without causal layout | `renders/B-magazine-collage.mp4` | `renders/B-magazine-collage-landscape.mp4` |
| C | editorial argument / data proof | number and bars build a visible claim | can feel like a report page if hierarchy is too static | `renders/C-editorial-data.mp4` | `renders/C-editorial-data-landscape.mp4` |

## Review Questions

1. Which candidate feels like one board being taught, rather than slides changing?
2. Which movement makes “隐藏起来” easiest to understand?
3. Which final state remains readable on a phone without captions doing all the work?
4. Which effects are explanatory, and which are merely decorative?
5. What should be removed before extending this style to the full script?

## Decision

- Selected base style: pending user review
- Allowed add-ons: pending user review
- Rejected treatments: black/white flash, glitch, hard scene swap, excessive camera speed
- Required corrections: pending user review
- Approval status: `draft`

## Verification

- All three compositions passed HyperFrames runtime, layout, motion, keyframe, and WCAG checks.
- All renders are H.264 + AAC at `30fps`, approximately `7.275s`; dimensions match their declared portrait or landscape format.
- FFmpeg full decode passed; black-frame detector found zero black intervals.
- Machine-readable report: `qa/media-report.json`.
- Local review page: `http://127.0.0.1:3301/review/`.
- Direct landscape review: `http://127.0.0.1:3301/review/?format=landscape`.
