# 苹果风格

> Generated snapshot from `demo/f1/HF_风格与动效库_分享包搭建说明 (1).md`, section A2.
> Provenance status: user-provided specification only. Referenced examples, images, components, and their licenses were not included.
> Refresh with `node scripts/sync-style-library.mjs`; do not edit this generated snapshot directly.
## A2. `apple-clean-product`：苹果风格

### 可直接调用的完整提示词

```text
Apple keynote product-page style, white-to-soft-silver background, floating glass cards, precise blue emphasis, SF Pro-like typography, generous whitespace, smooth push-in motion, clean UI workbench, premium and calm. No real Apple logo, no cyberpunk, no neon particles, no dark tech HUD, no PPT page flips.
```

### 预设规则

- 背景只使用 `#F5F5F7`、`#FFFFFF`、`#EEF1F5` 的白到柔银层次；边框为 `rgba(0,0,0,0.08)`。
- 主字 `#1D1D1F`，次字 `#6E6E73`，唯一主强调色为 `#0071E3`，必要时用 `#D7F1FF` 作为软青高光。
- 使用干净的浏览器/应用窗口、悬浮玻璃卡、产品工作台与大留白；字体使用 SF Pro 相近的 `Noto Sans JP` / `Segoe UI` / `Arial` 无衬线回退。
- 动作是缓慢推近、轻微横移、平静揭示和界面层级依次展开。对象、界面、功能层和结果必须跟随口播逐层出现、连接或收束。
- 禁止真实 Apple 标志、白页 PPT 翻页、重粒子、暗色 HUD、赛博霓虹、嘈杂装饰和快速旋转。

### 可粘贴的 `DESIGN.md` 块

```markdown
### 视觉方向
- 风格库：`apple-clean-product`
- 背景：白色到柔银灰渐层，留白充足，细边框和轻阴影建立层级。
- 主体：干净产品窗口、悬浮玻璃卡和简化 UI 工作台；每个功能随口播逐层揭示。
- 色彩：`#F5F5F7` / `#FFFFFF` / `#EEF1F5` 背景，`#1D1D1F` 主文字，`#6E6E73` 次文字，`#0071E3` 精确强调，`#D7F1FF` 软高光。
- 动效：轻推近、温和滑入、清晰聚焦、平静收束；不做 PPT 翻页。
- 不要做：真实 Apple 标志、暗色科技 HUD、霓虹粒子、赛博朋克、拥挤面板。
```
