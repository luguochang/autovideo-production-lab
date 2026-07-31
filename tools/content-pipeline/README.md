# AutoVideo content intake

This is the batch entry before `video:new`. It extends the existing AutoVideo source, evidence, script-review, and NarrationLock artifacts.

```powershell
npm.cmd run content:register -- --id ai-notes-001 --materials tools/content-pipeline/examples/ai-workflow-notes/materials
npm.cmd run content:diagnose -- --intake content/intakes/ai-notes-001 --route materials
npm.cmd run content:rewrite -- --intake content/intakes/ai-notes-001 --evidence tools/content-pipeline/examples/ai-workflow-notes/evidence.json --draft tools/content-pipeline/examples/ai-workflow-notes/spoken-rewrite.draft.json
npm.cmd run content:review -- --intake content/intakes/ai-notes-001
npm.cmd run content:approve -- --intake content/intakes/ai-notes-001 --reviewer <human-name> --confirm-human
npm.cmd run content:lock -- --intake content/intakes/ai-notes-001 --duration 30s --platform douyin --audience "AI learners" --outcome "Understand prototype versus maintainable product"
```

Use `--run-codex` instead of `--draft` to generate the spoken rewrite with the local Codex CLI. If neither is supplied, the CLI writes `spoken-rewrite.prompt.txt` and stops.

`content:approve` never approves by itself. It requires a named reviewer and `--confirm-human`. Once approved, changing `script.approved.txt`, any bound source, or any upstream receipt makes the chain stale. `content:lock` delegates project creation to the existing `video:new` command and binds `input/content-approval.json` into `NarrationLock.json`.

The formal project also freezes the five approval inputs under `input/content-intake/`:

- `sources.json`
- `material-suitability.json`
- `evidence.json`
- `spoken-rewrite.json`
- `claim-source-review.json`

Their SHA-256 values must match the bindings in `input/content-approval.json`. NarrationLock validation fails if any archived intake receipt changes. Running `video:prepare-inputs` preserves a valid v2 content approval and derives the generic `input/claim-ledger.json` from the archived evidence; the older DemoText-specific ledger remains only as the compatibility path for projects without a v2 intake.

## Prompt chain and offline regression

The versioned chain under `prompt-chain/` is ordered as:

```text
Evidence Extractor -> Outline Planner -> Narration Writer -> Oralizer
-> Duration Fitter -> final Claim Verifier
```

Each stage names its input and output contract and records the current prompt SHA when a candidate is
generated. Duration fitting is before the final verifier; changing wording afterwards makes the verifier
receipt stale. `content:regress` runs the local, precomputed Chinese contract seed only. It checks claim
kind/source bindings, protected numbers and English tokens, screen compression, text duration budget and
prompt/candidate hashes. It never calls a model, plays audio, opens a microphone, or creates a
NarrationLock. The current seed is `synthetic-contract` and is deliberately not a human gold set or a
publication approval.

```powershell
npm.cmd run content:regress
npm.cmd run test:content-pipeline
```

Naturalness, meaning, pronunciation and publication rights remain human gates. A future Promptfoo run
may consume the same hash-bound candidates; it must not replace the deterministic checks or turn a
synthetic fixture into a human approval.
