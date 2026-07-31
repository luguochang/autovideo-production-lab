# Shadow Cut

> Generated snapshot from HyperFrames `visual-styles.md`, section 8.
> Source license: Apache-2.0. Refresh with `node scripts/sync-style-library.mjs`.
## 8. Shadow Cut — Hans Hillmann

**Mood:** Dark, cinematic | **Best for:** Security products, dramatic reveals, investigative content, intense launches

```yaml
name: Shadow Cut
colors:
  primary: "#0a0a0a"
  on-primary: "#f0f0f0"
  surface: "#3a3a3a"
  accent: "#C1121F"
typography:
  headline:
    fontFamily: Oswald
    fontSize: 4rem
    fontWeight: 700
    textTransform: uppercase
  body:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
rounded:
  none: 0px
  sm: 2px
spacing:
  sm: 8px
  md: 16px
  lg: 48px
motion:
  energy: moderate
  easing:
    entry: "power3.out"
    exit: "power4.in"
    ambient: "sine.inOut"
  duration:
    entrance: 0.8
    hold: 2.5
    transition: 1.2
  atmosphere:
    - deep-shadow
    - vignette
    - grain-overlay
  transition: domain-warp
```

Near-monochrome: deep blacks, cold greys, stark white + one blood accent. Sharp angular text like film noir title cards. Heavy contrast, no softness. Elements emerge from darkness — reveal is the narrative. Slow creeping push-ins, dramatic scale reveals. The pause before the hit matters. Domain Warp dissolves reality before the next scene.

---

## Mood → Style Guide

| If the content feels...            | Use...          |
| ---------------------------------- | --------------- |
| Data-driven, analytical, technical | Swiss Pulse     |
| Premium, enterprise, luxury        | Velvet Standard |
| Raw, punk, aggressive, rebellious  | Deconstructed   |
| Hype, loud, high-energy launch     | Maximalist Type |
| AI, ML, speculative, futuristic    | Data Drift      |
| Human, warm, personal, wellness    | Soft Signal     |
| Cultural, fun, consumer, festive   | Folk Frequency  |
| Dark, dramatic, intense, cinematic | Shadow Cut      |

---

## Creating Custom Styles

These 8 styles are starters — not constraints. Create your own:

1. **Name it** after a designer, art movement, or cultural reference
2. **Write YAML tokens** — `colors` (2–5 tokens), `typography` (2–3 scales), `rounded`, `spacing`, `motion` (energy + easing + duration + atmosphere + transition)
3. **Add prose** — one paragraph describing the feel, what to do, what to avoid
4. **Token references** — use `{colors.accent}`, `{typography.headline}` in component definitions

The pattern: **YAML tokens (what) → prose rationale (why) → components (how they combine).**
