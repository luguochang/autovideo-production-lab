# 风格评审

## Shared Test Window

- Narration source SHA-256: `aed7f4d3133193b252e1aaa4c2b87afac9b40b7ce9ade8fed38b65d6cd046527`
- Mechanical production base SHA-256: `e683728ed36b654c79610fa63efbeb1267901b2af68ec03ebef75f84c5ad7b67`
- Recommended editorial candidate SHA-256: `0bd400ff29c30be0161c3a927926dc09cc25a4f448cfaa35d6a46afc854f9c97`
- Source range / time window: 复用首条已通过样片，不为本次长稿重复生成风格候选
- Ratio / FPS: 16:9 / 30

## Generation Rule

先分析参考图，再选择 2-4 个真正不同的候选。每个候选只生成：

- 一张代表性静帧；首屏可作为其中之一，但应优先选择能暴露主要组件语法的内容帧。
- 一条使用同一口播窗口的 3-8 秒 motion probe。

不得为了选风格生成多条完整视频。

## Candidates

| Candidate | Base style | Frame preset | Add-ons and jobs | Registry items | Motion rules | Still | Motion probe | Known risks |
|---|---|---|---|---|---|---|---|---|
| selected | `modern-ip-host-explainer@1.0.0` | `light-apricot` | 路径/状态图负责关系；数据卡/指标轨负责证据 | 项目风格包已登记组件 | `svg-path-draw`、`card-morph-anchor`、`scale-swap-transition`、`viewport-change` | 复用已通过样片 | 复用已通过样片 | 长时段重复、人物交叉淡化和历史帧残留 |

## Decision

- Selected base style: `modern-ip-host-explainer@1.0.0`
- Allowed add-ons: 路径/状态图；数据卡/指标轨
- Rejected treatments: 频繁换页、频繁换人物、透明叠影、PPT 翻页、装饰性旋转、粒子、连续缩放
- Required corrections: 十五章稳定画板；章内逐步构建；互斥人物时间窗；临时元素在转场前清理；动效载体按信息关系轮换
- Approval status: `approved-reuse`
- Reviewer: `user`
