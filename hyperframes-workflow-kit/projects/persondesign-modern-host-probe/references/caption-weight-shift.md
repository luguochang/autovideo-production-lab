# caption-weight-shift receipt

- Source: `vendor/hyperframes/registry/components/caption-weight-shift/`
- License: Apache-2.0
- Role in this probe: behavior reference only; the registry component is not mounted as a sub-composition.
- Adaptation: three fixed caption groups reuse one bottom rail. At each narration handoff, the active exact-source phrase becomes bold and accent-colored while the previous group exits before the next group enters.
- Local implementation: `index.html` selectors `#caption-first`, `#caption-low-code`, and `#caption-ai`.

The original registry HTML was removed from `compositions/` after QA showed that HyperFrames loads discoverable component pages independently during checks. Its remote font and script requests were unrelated to the main composition and violated the project's no-network render rule.
