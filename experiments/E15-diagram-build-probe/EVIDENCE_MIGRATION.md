# E15 Evidence Migration

`lifecycle-evidence.draft.json` was upgraded from the former probe-local draft
shape to `autovideo-motion-recipe-lifecycle-evidence/v1` on 2026-07-21.

The migration reuses the existing rendered MP4, strict-check log, invariant
audit, source receipt, and snapshots after verifying their SHA-256 values. The
old draft remains in `lifecycle-evidence.legacy.json` for audit history.

`probe.visualReview` intentionally remains `null`. This migration only makes
the technical evidence machine-readable; it does not create a human review,
apply a lifecycle transition, or promote the recipe.
