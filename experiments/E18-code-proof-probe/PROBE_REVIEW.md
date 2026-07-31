# E18 Probe Review

Status: `candidate` / `human review pending`

## Intent

The narration says a simple button hides an engineering chain. The screen therefore shows three
real calls from the workflow console rather than restating the narration as body copy:

`RUNNING -> generateStage() -> markStageGenerated()`

The complete narration remains in the persistent caption rail. `CodeProofIR.json` binds each visible
line to its source line and labels the one condensed argument list.

## Human checklist

- [ ] The Q-version host stays fixed in `host.left` with stable crop and eye line.
- [ ] The apricot stage and caption rail never flash or disappear.
- [ ] The focus band moves between the three code calls without clipping or page-cut behavior.
- [ ] The 25px monospace code remains readable at a phone-sized review crop.
- [ ] The project-source label and condensed-argument policy are clear enough to avoid fabricated-code claims.
- [ ] The final conclusion holds long enough to connect the code proof back to the narration.
- [ ] No SFX is implied or registered; narration remains the only audio layer.

## Decision

Automated strict check, rendered-frame inspection and decode QA may be recorded below, but this file
intentionally does not approve the recipe. Human visual approval is required before lifecycle apply.
