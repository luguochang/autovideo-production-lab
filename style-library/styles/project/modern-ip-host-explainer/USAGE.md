# Usage and Trigger Contract

## Trigger Phrases

Use this approved style when the request contains one of these meanings:

- `按固定人物讲解模板做`
- `使用 persondesign 人物模板`
- `按 modern-ip-host-explainer 做`
- a project brief explicitly names `modern-ip-host-explainer`

Do not trigger it from vague words such as “高级感”“二次元”“互联网风” alone. Those still require style selection.

## First Action After Trigger

Load all six planning and design files in this folder:

1. `frame.md`
2. `STYLE_GUIDE.md`
3. `POSE_MANIFEST.json`
4. `LAYOUT_CONTRACT.md`
5. `PLANNING_CONTRACT.json`
6. `PALETTE_VARIANTS.json`

Then lock the project to landscape `16:9`, preserve the approved narration in `NarrationLock`, and create the normal `VIDEO_TASK.md` and `STYLE_REVIEW.md` records. The approved style is not a replacement for those project gates.

For a newly initialized AutoVideo project, create the machine-readable lock with:

```powershell
npm.cmd run video:apply-template -- --project <project-id> --style modern-ip-host-explainer
npm.cmd run video:template-status -- --project <project-id>
```

Use `--palette warm-peach` only when the request explicitly selects 暖桃灰. The command defaults to `light-apricot` and refuses a non-landscape project.

## Stage Rules

| Stage | Allowed output | Required gate |
|---|---|---|
| Understand | asset inventory, pose mapping, wireframe notes | no video generation |
| Master frame | one static `1920x1080` frame | user reviews zones and density |
| Probe | one `3-8s` clip from the same narration window | manual overlap/readability review + `hyperframes check` |
| Approved template | reusable frame/scene skeleton and recipe | explicit approval |
| Full production | complete video or batch | only after approved template |

## Generation Order

```text
narration lock
  -> sentence intent and screen-text classification
  -> scene type selection (hook/concept/compare/process/proof/close)
  -> pose selection from POSE_MANIFEST
  -> zone allocation from LAYOUT_CONTRACT
  -> static master frame
  -> same-window motion probe
  -> approval
  -> full production
```

The generator may fill wording, keyword text and timing inside the contract. It uses `light-apricot` unless the request explicitly selects `warm-peach`. It may not invent a new palette, move the host into the content zone, add a fourth keyword, or introduce another component family without a new style review.

## Existing Projects

The approved style does not silently migrate `demoText-mainstream-landscape` or any older project. A new run must name the style, or the project must explicitly adopt it in its task document. Old A-style outputs remain evidence of failed patterns, not reusable templates.
