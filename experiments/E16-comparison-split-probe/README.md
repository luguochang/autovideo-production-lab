# E16: Comparison Split recipe probe

This is a lifecycle-ready candidate probe for `comparison-split@1.0.0`.

It preserves the approved brand shell from E06 without modifying E06:

- `modern-ip-host-explainer@1.0.0`
- exact `#F2DFC7` light-apricot background
- one supplied Q-version `present` host image fixed in `host.left` for the full shot
- content fixed in `content.right`
- persistent caption rail at the bottom
- no full-frame camera; the only declared camera scope is `content-world-only`
- landscape `1920x1080`, `30fps`, exactly 6 seconds
- exact first six seconds of the same E06 narration window

The visual contains exactly two comparison states: `看起来 / 一个按钮 / 入口更简单` and
`实际上 / 模型 + API + 工具链 / 工程复杂度仍在`. They occupy matching fixed CSS footprints.
There is no third state and no page cut.

The implementation adapts the official `comparison-split` blueprint, `split-tilt-cards` signature,
and `scale-swap-transition` rule. Side glows, perpetual idle float, large tilt, and full replacement
were intentionally removed to comply with the approved base style. See `official-reuse-receipt.json`.

Timing is contract-bound:

- `0.00-1.92s`: mirrored entry
- `1.92-4.44s`: both readable with restrained focus shift
- `4.44-5.25s`: selected-state scale-swap handoff
- `5.25-6.00s`: readable final hold

The result remains `candidate` until explicit human visual review. A passing technical check does
not approve or promote the recipe.

## Verify

```powershell
npx.cmd hyperframes@latest upgrade --project . --check
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
```

Do not run lifecycle `apply` from this directory.
