# A6 Validation Receipt: demoText Landscape

Project: `demoText-a6-handdrawn-landscape`
Validated: 2026-07-16
Reviewer: user approval plus production QA

## Retained Rules

- One persistent oversized paper board with a single virtual camera.
- Warm paper `#FBFAF4`, ink `#151515`, extracted information `#DDF4F5`, and one active red `#D81E45` conclusion.
- Station handoff keeps completed objects in the world and lowers their emphasis instead of clearing the screen.
- Route lines draw once, cards place with restrained 260-650ms motion, and the terminal lock holds through the audio tail.
- Captions are exact narration excerpts; generated screen summaries are source-tagged separately.

## Successful Sources

- `spatial-pan-stations` blueprint
- `viewport-change` camera rule
- `svg-path-draw` route rule
- `css-marker-patterns` limited emphasis rule

## Rejected Patterns

- Full-screen page transitions, black/white flashes, glitch, neon, particles, and independent looping motion.
- Dense UI or small code text that cannot be read at 1920x1080.
- Treating a camera handoff as a slide cut.

## QA Receipt

- HyperFrames check: runtime/layout/motion/contrast all passed.
- Final render: `projects/demoText-a6-handdrawn-landscape/renders/demoText-a6-final.mp4`.
- Final visual review: no black/page-flash transition; final red lock remains readable.

This is a project validation receipt. It does not promote the spec-only F1 style into a global skill or claim ownership of the user-provided reference package.
