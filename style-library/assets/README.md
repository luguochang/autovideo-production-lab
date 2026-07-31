# AutoVideo Local Asset Library

`ASSET_REGISTRY.json` is the central index for reusable local media and official HyperFrames registry components.

The registry is deliberately smaller than the upstream HyperFrames catalog. It contains only assets that have a frozen workspace path, a SHA-256 receipt, a license receipt, and a declared semantic job. The Q-version host and the `#F2DFC7` stage are not assets that this file may replace; they remain the `modern-ip-host-explainer` style contract.

## Reuse rules

- SFX are semantic punctuation. The default is silent; use a registered SFX only when a real focus, connector, state change, error, or chapter-resolution event exists.
- Keep the library ceiling at six SFX per minute and at least 2.4 seconds between events. The narration remains the dominant mix.
- `click.mp3` and `click-soft.mp3` currently share the same bytes. The registry keeps `sfx-click-soft` as the canonical ID so project ledgers do not duplicate one audio file under two names.
- Motion components are references to the checked-in official registry. Their recipe remains blocked until its short probe and human visual review pass the lifecycle gate.
- Project production still copies selected media into that project's `.media/manifest.jsonl`; the central registry is a source catalog, not a remote render dependency.

Validate the catalog with:

```powershell
npm.cmd run assets:validate
```
