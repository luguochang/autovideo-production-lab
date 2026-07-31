# HyperFrames 视频生成任务

## Input Lock

- Project ID: batch-smoke-30s-20260720
- Narration path: `input/narration.txt`
- Narration normalized SHA-256: `230fd3015b937e6dfc6de1aa4d442d2a0e9156dadf9a8eba5206847be65cbd97`
- Ratio: 16:9
- Target duration: 30s
- Platform: douyin
- Audience: AI learners and knowledge-video viewers
- Viewer must remember: 理解平台封装与系统架构之间的差异
- Forbidden treatments: PPT 翻页、页面左右闪切、人物跟随内容镜头漂移、整段口播原文铺满主画面、重复卡片墙、无语义的连续 whoosh
- Reference image: 无

## Style Selection

- Base style ID: `modern-ip-host-explainer@1.0.0`
- Frame preset: project-local fixed host shell; no alternate frame preset
- Add-on families: `diagram-build` for dependency relationships; `code-proof` grammar only when a real error state is shown
- Official registry items: `flowchart`, `code-highlight`
- Scene blueprints: `flowchart`, `multi-phase-camera`
- Motion rules: `svg-path-draw`, `viewport-change`, `discrete-text-sequence`, `card-morph-anchor`
- Source and license receipts: project-local host template plus official HyperFrames registry and animation skills (Apache-2.0); host rights remain internal-only
- Status: `approved`
- Task approval: `creator-confirmed`
- Style approval: `Candidate A / modern-ip-host-explainer@1.0.0`
- Approved at: `2026-07-20`

## Visual Thesis

观众应看到“按钮/节点”只是系统复杂性的外壳：画面先把抽象能力拆成模型、接口、权限、数据和状态几个关系，再把这些关系收拢成“需要定位问题层”的结论。Q版人物、浅杏色舞台和字幕轨贯穿全片；内容世界中的节点会先压缩成上下文，再交接给下一组，结尾保留一个简洁的分层诊断图。

## Beat Plan

| Cue ID | Narration source range | Spoken intent | Visible operation | Existing object handoff | Registry/motion source | Terminal frame |
|---|---|---|---|---|---|---|
| cue-001 | 0.00-3.26s | 提出“隐藏复杂性” | 右侧出现稳定标题和一个封装入口 | 标题保留为上方锚点 | `discrete-text-sequence` + anchored headline reveal | 标题与入口稳定可读 |
| cue-002 | 3.26-12.36s | 展开平台封装的能力 | 沿一条连接线依次写出模型、接口、向量库、工具调度；不超过三项同时活跃 | 入口缩成历史标记，连接线继续使用 | official `flowchart` + `svg-path-draw` | 三类能力节点和一条连接线 |
| cue-003 | 12.36-15.10s | 承认快速上手的好处 | 节点组整体向上收拢，留下“快速上手”短语 | 节点组变成小型上下文 rail | `card-morph-anchor` | 快速上手短语 |
| cue-004 | 15.10-20.40s | 纠正“会拖拽就懂架构” | “会拖拽”先落点，再通过收缩/划线转为“不等于懂架构” | 快速上手短语保留为淡化上下文 | `discrete-text-sequence` + `viewport-change` | “上手 ≠ 架构理解” |
| cue-005 | 20.40-29.16s | 展示报错定位的多个层次 | 建立模型→接口→权限→数据→上下游/状态的诊断路径；摄像机只作用于 content-world | 上一组结论压缩到历史轨，路径继续生长 | official `flowchart` + `svg-path-draw` + `viewport-change` | 诊断路径完整且无遮挡 |
| cue-006 | 29.16-31.37s | 收束观点 | 路径收拢成“先定位问题层”，结论停留至少 600ms | 所有相关对象收拢为一张结论板 | `card-morph-anchor` + terminal hold | 结论和人物同时可读 |

## Screen Text

主字幕使用 alignment 中的 `exact-source` NarrationLock 文本；主画面只使用 `generated-summary` 关键词：`复杂系统`、`按钮·节点`、`上手 ≠ 架构理解`、`问题层`。任何 claim 仍以底部字幕为准，不把屏幕摘要当成外部统计。

## Asset Plan

| Asset ID | Purpose | Source/generator | License | Fallback | Status |
|---|---|---|---|---|---|
| host-explain | 固定 Q 版主持人 | `production-assets/host/explain.png` | 项目模板，来源和 SHA 在 probe receipt | approved pose | locked |
| diagram-nodes | 模型/接口/权限/数据关系 | HyperFrames official flowchart adapted to content.right | Apache-2.0 + adaptation receipt | 关键词序列 | planned |
| semantic-sfx | 1-2 个状态落点音 | central bundled SFX, after human listening review | provider/license in project media manifest | silence | candidate |

## Review Gate

- Task status: `pending`
- Approved by:
- Approved at:
