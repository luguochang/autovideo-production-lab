# HyperFrames 视频生成任务

## Input Lock

- Project ID: `demotext-standard-delivery-v1`
- Narration path: `input/narration.txt`
- Narration normalized SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Final audio: `audio/narration.final.wav`
- Final audio SHA-256: `97eb104ae0155ffb66a431c3f7aa4101c51eda708b5a8e8da3150c893d048527`
- Final audio duration: `239.908667s`
- Alignment: `audio/alignment.json`, 46 个 NarrationLock cue，最后边界 `239.909s`
- Voice receipt: CosyVoice preset 14，中文女，FP32，`stream=false`，`speed=1.03`，`seed=7`
- Ratio / resolution / FPS: `16:9` / `1920x1080` / `30fps`
- Platform: 抖音横屏知识讲解
- Audience: AI 学习者、应届生、使用低代码/工作流工具但尚未建立工程视角的人
- Viewer must remember: 会搭工作流、写提示词或跑通 Demo，不等于具备构建和维护 AI 产品的能力。

## Style Selection

- Base style: `modern-ip-host-explainer@1.0.0`
- Palette: `light-apricot`
- Template lock: `template-lock.json`
- Frame preset: 项目模板自带固定主持人 + 单一内容关系 + 底部字幕栏；不叠加其他 frame preset
- Add-on style families: 无；模板契约 `max_addon_styles: 0`
- Official registry reference: `flowchart-vertical` 仅作为连接器与节点编排参考；原块为竖屏，不能直接作为本项目画幅资产
- Motion rules: `viewport-change`、`svg-path-draw`、`scale-swap-transition`、`card-morph-anchor`
- Motion source: `style-library/generated/hyperframes-motion-rules.json`，Apache-2.0
- Template package status: `approved`
- Project task/style gate status: `approved` for internal autonomous review by `codex-autonomous-internal-review`; not user/public approval
- Machine-readable `style-selection.json`: 已创建；status `approved`，reviewer `codex-autonomous-internal-review`，scope `internal-only`

## Visual Thesis

这支视频告诉观众：AI 把“做出一个可演示结果”的门槛压低了，但真正稀缺的是对边界、失败、数据、安全、成本与维护的系统理解。画面从一个醒目的警告出发，依次拆开“社群信心”“Demo 幻觉”“五个工程原因”，最后把 Demo 压缩成成熟度链路中的起点，并收束到“理解、判断、维护、负责”的价值结论。

全片保留三个持久区域：固定主持人区、单一主内容区、固定底部精确字幕栏。默认操作是 `replace`；只有用于承接下一结论的对象才 `compact` 到上下文标记，不把全片信息堆积在同一画面。

## Beat Plan

| Scene | Cue range | Time | Spoken intent | Visible operation | Terminal frame | Motion source |
|---|---|---:|---|---|---|---|
| 01 敬畏与辨别 | 001 | 0.000-4.780 | 先建立风险意识 | 警示词进入，主持人强调 | “敬畏 AI / 擦亮双眼”保持 | `scale-swap-transition` |
| 02 社群与 99% 判断 | 002-003 | 4.780-15.140 | 社群建议不等于工程能力 | 社群标签压缩成讲述者观点引语 | 数值只作未核验原话，不作统计图 | `card-morph-anchor` |
| 03 AI 信心幻觉 | 004-005 | 15.140-27.300 | 工具熟练容易制造过度自信 | “会搭工作流”替换为“懂系统？” | 能力错觉被问号打断 | `scale-swap-transition` |
| 04 Demo 不是系统 | 006-008 | 27.300-44.740 | 就业焦虑背后是工程底层不清晰 | 演示流程与可维护系统两态比较 | Demo 被限定为“能演示” | `card-morph-anchor` |
| 05 五个原因 | 009 | 44.740-49.340 | 建立后续五点结构 | 五点索引出现后压缩到历史标记 | “五个原因”成为导航锚点 | `viewport-change` |
| 06 隐藏复杂性 | 010-013 | 49.340-74.900 | 平台按钮隐藏了模型、接口、权限和状态 | 三节点窗口逐组替换，错误路径被画出 | “拖拽节点 ≠ 懂架构” | `svg-path-draw`, `viewport-change` |
| 07 原型与产品 | 014-017 | 74.900-101.740 | 0 到 1 Demo 与长期业务运行不同 | Demo 卡片形变为产品底座并承受异常条件 | “Demo 越漂亮，塌得越快” | `card-morph-anchor`, `scale-swap-transition` |
| 08 结果与维护 | 018-020 | 101.740-123.960 | 短视频展示结果，却省略失败与维护 | 结果面板被维护检查清单替换 | “Magic ≠ Engineering” | `scale-swap-transition`, `viewport-change` |
| 09 捷径误解 | 021-025 | 123.960-147.280 | AI 降低原型门槛，但没有取消工程要求 | 捷径想象与工程现实两态比较 | “不懂代码/系统/工程”被否定 | `card-morph-anchor`, `scale-swap-transition` |
| 10 Agent 工程清单 | 026-035 | 147.280-170.360 | 真正智能体要回答十个工程问题 | 每次最多三个问题节点，逐组 replace | 十项压缩为“可维护”结论 | `viewport-change`, `svg-path-draw` |
| 11 补丁失真 | 036-039 | 170.360-182.440 | 用 AI 盲补 Bug 会扩大失真 | 小缺口形变为大补丁，再回到产品判断 | “回答不上来，只是演示” | `card-morph-anchor`, `scale-swap-transition` |
| 12 成熟度链路 | 040 | 182.440-191.840 | 玩具经工程化成为业务基础设施 | 三节点滚动窗口沿路径推进 | 业务基础设施成为终点 | `svg-path-draw`, `viewport-change` |
| 13 学习路线 | 041-043 | 191.840-215.260 | 系统学习 Agent、MCP 与项目实践 | 知识、项目、上线三阶段推进 | “不是 Demo，而是上线产品” | `svg-path-draw`, `viewport-change` |
| 14 价值收束 | 044-046 | 215.260-239.909 | 创建廉价，理解与负责珍贵 | 旧对象压缩，四个价值词逐一落定 | “理解 / 判断 / 维护 / 负责”保持 | `card-morph-anchor`, `viewport-change` |

## Screen Text Provenance

- 底部字幕栏逐 cue 使用 `audio/alignment.json` 中的 NarrationLock 精确文本，类型为 `exact-source`。
- 主画面引用原句时标记 `exact-source`；重排原词、比较符号或压缩列表标记 `generated-summary`。
- 当前没有用户另行批准的屏幕摘要，因此本轮不使用 `approved-summary`。
- `99%`、`90%`、`30K` 必须标记为讲述者观点/未核验主张；禁止柱状图、饼图、人数图标阵列、工资保证徽章或平台背书。
- “五个原因”和最终工程结论可视为作者框架，但不能补写原稿没有的证据、调查或因果。

## Forbidden Treatments

- 禁止竖屏、方形、PPT 翻页、仪表盘网格、等权卡片墙、贴纸云和装饰性标签地毯。
- 禁止把精确口播同时复制为大标题、正文和字幕三份；主画面只保留一个焦点关系。
- 禁止使用统计图呈现 `99%`、`90%`、`30K`，禁止暗示已验证或承诺薪资。
- 禁止同时展示超过三个流程节点；完成组必须 `replace`、`compact` 或 `exit`。
- 禁止主持人与标题、关键词、证据或字幕栏相撞；人物 PNG 未去背和归一化前不能进入正式构图。
- 禁止随机数、墙钟、无限循环、运行时网络素材和不可 seek 的独立时间线。

## Asset Plan

| Asset ID | Purpose | Source / provenance | Rights | Status |
|---|---|---|---|---|
| narration-final | 唯一生产配音 | `audio/narration.final.wav`, deterministic CosyVoice receipt | 内置 speaker 商用权链待人工确认 | ready, rights-review |
| alignment-lock | 46 cue 视觉时序 | `audio/alignment.json` + `NarrationLock.json` | 项目自有文本 | ready |
| host-canonical | 10 个标准人物姿势来源 | `POSE_MANIFEST.json`, user-provided | 发布权待人工确认 | source-ready |
| host-normalized | 去背、统一眼线/头部比例后的生产人物 | 从 canonical poses 派生 | 继承人物权利状态 | planned, not created |
| probe-still | 隐藏复杂性项目静帧 | `review/stills/style-probe-hidden-complexity.png` | 项目派生 | planned, not rendered |
| probe-motion | 同窗口 3.22s 动效探针 | `review/probes/style-probe-hidden-complexity.mp4` | 项目派生 | planned, not rendered |
| scene-compositions | 14 个 HyperFrames 场景 | `production/compositions/scenes/*.html` | 项目自制 + Apache-2.0 motion refs | planned, not created |

完整台账见 `AssetManifest.json`。

## Review Gates

- Content / NarrationLock: 已冻结，不允许静默改写。
- Final voice asset and timing: 已生成并对齐；任何重生成都会使下游时间失效。
- Voice publication rights: `needs-review`。
- Task review: `approved-internal-autonomous-review` by `codex-autonomous-internal-review`；不冒充用户人工批准。
- Same-window still + motion probe: 已渲染并通过内部探针检查，证据见 `review/probe-review.json`。
- Project style approval: `approved-internal-autonomous-review`；公共发布权利与最终人工审片未批准。
- Full production: internal composition may exist for continued QA, but `video:template-status` remains `readyForComposition=false`; it is not release-ready.
- Final Studio preview: `pending`。

## Implementation Contract

- 一个主 composition 使用一条 paused、seek-safe、deterministic timeline。
- 14 个场景使用稳定业务 ID；DOM selector 与业务 ID 分离。
- 正式生产前先完成静态 master frame 与 3.22s 同窗口探针。
- 使用 `npx hyperframes check`，不使用 deprecated `inspect`。
- 媒体 QA 与布局/对比度 QA 分开记录；最终渲染必须核对实际时长 `239.908667s`。
