# E06: Keyword Handoff recipe probe

This is the first lifecycle-ready probe for `keyword-handoff@1.0.0`.

It preserves the approved base shell:

- `modern-ip-host-explainer@1.0.0`
- exact `#F2DFC7` light-apricot background
- supplied Q-version host fixed in `host.left`
- content fixed in `content.right`
- caption rail fixed at the bottom
- all content motion scoped to `content-world-only`
- landscape `1920x1080`, `30fps`, 8 seconds

The probe tests a continuous handoff instead of page cuts. The outgoing keyword compacts into a
small context state before the incoming keyword reaches full visibility, so the content area never
flashes empty. The host changes pose once at a semantic handoff and never changes zone.

The official HyperFrames `caption-weight-shift` component is installed unchanged at
`compositions/components/caption-weight-shift.html`. The probe adapts its visible weight-change idea
to the fixed caption rail using deterministic opacity crossfades, because layout/font-weight tweens
are not part of the project animation allowlist.

The checked-in result remains a lifecycle `candidate` until the stills and MP4 receive explicit
visual review. A passing technical check is not approval.

## Verify

```powershell
npm.cmd run check
npm.cmd run snapshot
npm.cmd run render:probe
```
