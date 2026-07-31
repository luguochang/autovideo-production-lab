# HyperFrames 视频生成任务

## Input Lock

- Project ID: `rag-full-chain-5m-20260728`（ID 中的 `5m` 为历史名称，不再代表时长要求）
- Source narration: `input/narration.md`
- Source narration normalized SHA-256: `aed7f4d3133193b252e1aaa4c2b87afac9b40b7ce9ade8fed38b65d6cd046527`
- Mechanical production base: `input/narration.production.draft.txt`
- Mechanical production base SHA-256: `e683728ed36b654c79610fa63efbeb1267901b2af68ec03ebef75f84c5ad7b67`
- Recommended production candidate: `input/narration.editorial.draft.txt`
- Recommended production candidate SHA-256: `0bd400ff29c30be0161c3a927926dc09cc25a4f448cfaa35d6a46afc854f9c97`
- Production candidate status: `editorial-draft-awaiting-user-confirmation`
- Ratio: `16:9 / 1920x1080`
- Target duration: `audio-driven`；不设五分钟硬上限，正式 WAV 冻结后记录真实时长
- Platform: bilibili
- Audience: 技术面试官和有工程经验的 AI 开发者
- Viewer must remember: RAG 是离线建库、在线检索、Agentic 决策、生成引用、评测和生产工程相互约束的数据链；生产选型依赖组合判断，不是工具清单。
- Forbidden treatments: 频繁整页切换、频繁换人物、透明叠影、PPT 翻页、装饰性旋转、粒子、连续缩放、为了时长强制删减正文
- Reference image: 无；复用已通过样片验证的项目风格包

## Style Selection

- Base style ID: `modern-ip-host-explainer@1.0.0`
- Frame preset: `light-apricot / #F2DFC7`
- Layout: `host.left + content.right + captions.bottom`
- Add-on families: 路径/状态机图形与数据卡/指标轨；仅承担关系表达和证据展示
- Motion rules: `svg-path-draw`、`card-morph-anchor`、`scale-swap-transition`、`viewport-change`
- Status: `selected-from-approved-sample; full-production-pending-narration-lock`

## Visual Thesis

观众始终看到同一位主持人和同一条 RAG 主链。每章先建立一个完整稳定画板，再让当前数据对象沿主链完成解析、分块、增强、索引、检索、决策、引用和评测；旧状态会降级或退出，不留下叠影。到结尾，十五章的局部对象重新汇成一张可回看的全链路地图。

## Beat Plan

| Cue | Source section | Spoken intent | Visible operation | Terminal frame |
| --- | --- | --- | --- | --- |
| 00 | 0 | 建立离线、在线与 Agentic 分水岭 | 主线路径逐段点亮 | 全链路地图 |
| 01 | 1 | 解析是质量上限，生产采用分层组合 | 三层解析归并 | 结构化文档 |
| 02 | 2 | 分块策略随文档类型变化 | 分块窗口和元数据绑定 | 可检索块 |
| 03 | 3 | 给块补文档级上下文 | 前缀与父窗口展开 | 增强块 |
| 04 | 4 | 按中文效果、边界和成本选 embedding | 向量空间聚焦 | 向量集合 |
| 05 | 5 | 按规模、事务和运维选库与索引 | 索引拓扑生长 | 可查询索引 |
| 06 | 6 | 简单查询直达，复杂查询按需改写 | 查询分支路由 | 选中查询路径 |
| 07 | 7 | 多路检索各管一类问题 | 四路并行召回 | 多路候选集 |
| 08 | 8 | 用排名而非异构分数做融合 | 排名堆栈重排 | 融合候选 |
| 09 | 9 | 粗召之后再用 cross-encoder 精排 | 漏斗收窄 | top-K 证据 |
| 10 | 10 | 评估、重试、拒答和生成构成有界闭环 | 状态机条件高亮 | 可生成/拒答决策 |
| 11 | 11 | 生成必须绑定并校验引用 | 答案句与来源连线 | 可追溯答案 |
| 12 | 12 | 用 golden QA 和 trace 定位坏点 | 指标轨回溯 | 评测闭环 |
| 13 | 13 | 缓存、安全、增量、版本和监控共同上线 | 生产检查链闭合 | 可运维系统 |
| 14 | 14 | 用三句话收束全链路 | 画面拉远归并 | 完整链路定格 |

## Screen Text

- 字幕仅使用冻结口播的 `exact-source`。
- 章节标题、节点名和对比标签使用 `generated-summary`，不得伪装成原文。
- 当前生产候选中的外部数字、客户名和效果陈述，在证据处理完成前不得升级为无条件屏幕结论。

## Asset Plan

| Asset ID | Purpose | Source/generator | License/provenance | Fallback | Status |
| --- | --- | --- | --- | --- | --- |
| narration-source | 内容来源 | 用户提供 Markdown | SHA-256 已登记 | 无 | registered |
| narration-mechanical-base | 完整机械清理稿 | 机械提取脚本 | 可重复生成，SHA-256 已登记 | 来源稿 | traceable-base |
| narration-candidate | 推荐锁稿候选 | 可重复的轻量顺稿脚本 | 逐项差异与 SHA-256 已登记 | 机械清理稿 | awaiting-user-confirmation |
| host-style | 主持人与布局 | 项目风格包 | 项目内已登记资产 | 同一角色静态姿态 | selected |
| five-minute-summary | 短版备选 | 早期改编稿 | 项目内部衍生 | 不使用 | superseded |

## Review Gate

- Scope status: `approved-by-user`（质量优先、时长不强制、保留十五节）
- Narration status: `editorial-and-evidence-review-complete; pending-user-confirmation`
- NarrationLock status: `not-frozen-for-production`
- Pronunciation preview: `59 unique Latin tokens / 41 require listening review`
- TTS status: `blocked-until-narration-lock`
- Full-production status: `blocked-until-narration-lock`
