---
id: modern-ip-host-explainer
version: 1.0.0
status: approved
ratio: "16:9"
resolution: "1920x1080"
fps: 30
palette_id: "light-apricot"
colors:
  background: "#F2DFC7"
  surface: "#FBF3E7"
  ink: "#2A211B"
  muted: "#675748"
  primary: "#496958"
  secondary: "#A94E36"
  warm_host: "#B85C42"
  line: "#DCC2A3"
typography:
  display: "Inter, Noto Sans SC, Microsoft YaHei, sans-serif"
  body: "Inter, Noto Sans SC, Microsoft YaHei, sans-serif"
  label: "SFMono-Regular, Consolas, monospace"
  display_weight: 800
  body_weight: 500
  label_weight: 700
spacing:
  safe_x: 96
  safe_top: 72
  safe_bottom: 136
  zone_gap: 64
  caption_height: 88
components:
  host:
    default_zone: "host.left"
    width_range: "520-640"
    height_range: "650-820"
  headline:
    max_lines: 2
    size_range: "72-104"
  keyword_cluster:
    max_items: 3
    max_lines: 1
  helper_callout:
    max_items: 1
  caption:
    fixed: true
    max_lines: 2
constraints:
  max_addon_styles: 0
  full_production_requires_approval: true
  landscape_only: true
  background_removal_required_for_pose_png: true
  replace_before_accumulate: true
  implicit_flow_layout_for_content: false
---

# Modern IP Host Explainer

这份 `frame.md` 是视频帧级别的规范。它只定义品牌令牌和稳定尺寸，不代替场景布局契约；布局区域、碰撞规则和元素上限见同目录的 `LAYOUT_CONTRACT.md`。

## Visual Thesis

温暖的固定二次元主持人负责建立亲和力，克制的产品化画面负责建立可信度。默认舞台使用干净的浅杏橙、深棕墨色和森林绿，砖红只承接人物或第二语义焦点。浅杏橙必须保持平整、现代、无纸张纹理，避免重新落入复古课件或米黄手账风。

## Brand Rules

- 默认使用 `light-apricot` 浅杏橙背景；明确指定“暖桃灰”时才切换 `warm-peach`，不得自行发明第三套背景。
- 每个场景只有一个主强调色命中；森林绿负责结构与主关系，砖红只用于人物呼应或第二语义焦点，不能铺满背景。
- 人物是一个有语义的主持人，不是装饰贴纸。人物视线、手势和关键词必须指向同一关系。
- 大标题、动态关键词和底部字幕是三层不同职责，不能把完整口播复制成多个文本块。
- 线条、圆角和阴影都克制：不使用纸张纹理、手绘涂鸦、厚重黑色偏移阴影、四角标签墙或卡片网格。

## Prompt Contract

后续生成必须先加载本目录的五个文件，再开始写分镜或 HTML。可用下面的稳定指令触发：

```text
style_id: modern-ip-host-explainer
format: landscape 16:9, 1920x1080, 30fps
role: fixed anime host + modern motion-graphics explainer
load: frame.md, STYLE_GUIDE.md, POSE_MANIFEST.json, LAYOUT_CONTRACT.md, PALETTE_VARIANTS.json
palette: light-apricot by default; warm-peach only when explicitly requested
hard_rules: one base style, one focal relationship per beat, replace before accumulate,
  fixed caption rail, no PPT pages, no repeated card grid, no overlapping zones
gate: static master frame and 3-8s probe before full production
```

未加载风格包时，不允许根据“高级感”“二次元”“互联网风”自行选择新的配色、人物位置或组件族。
