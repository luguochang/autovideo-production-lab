---
format: 1920x1080
message: "会搭工作流或跑通 Demo，不等于具备构建和维护 AI 产品的能力。"
arc: "警示 → 错觉 → 五个工程原因 → 成熟度路线 → 价值收束"
audience: "AI 学习者、应届生和低代码/工作流使用者"
mode: collaborative
fps: 30
audio: audio/narration.final.wav
audio_duration: 239.908667s
style: modern-ip-host-explainer@1.0.0
palette: light-apricot
---

# HyperFrames 执行分镜

以下 14 个 `src` 都是计划路径，当前文件不存在；因此所有 frame 保持 `status: outline`。底部 `caption` 始终显示对应 cue 的 NarrationLock 精确文本，主画面摘要另外标注来源类型。

## Frame 1 — 敬畏与辨别

- scene: 主持人先把“敬畏”作为全片判断起点。
- duration: 4.780s
- poster: 4.100s
- transition_in: cut
- status: outline
- voiceover: "我奉劝很多人，对AI技术一定要有敬畏之心，也希望大家擦亮双眼。"
- src: production/compositions/scenes/01-respect-warning.html
- cue_range: cue-001
- time_range: 0.000-4.780
- role: hook
- host_pose: emphasis
- zones: host.left, content.right, caption
- operation: enter → hold
- motion_rules: scale-swap-transition

主画面只保留“对AI技术一定要有敬畏之心”（`exact-source`, cue-001）和随后替换进入的“擦亮双眼”（`exact-source`, cue-001）。主持人的强调手势与主词同向，terminal frame 保持两个词组而不增加解释卡片。

## Frame 2 — 社群建议不是工程能力

- scene: 社群标签被压缩成一条讲述者观点引语。
- duration: 10.360s
- poster: 9.600s
- transition_in: cut
- status: outline
- voiceover: "这个市场上有无数所谓的AI、Coze、Dify社群，告诉你应该怎么做。但是这里面99%的人，他并不具备开发和维护AI的能力，他完全看不懂底层的代码。"
- src: production/compositions/scenes/02-community-claim.html
- cue_range: cue-002..cue-003
- time_range: 4.780-15.140
- role: concept
- host_pose: read
- zones: host.right, content.left, caption
- operation: replace → compact
- motion_rules: card-morph-anchor, scale-swap-transition

主画面依次显示“AI、Coze、Dify社群”（`exact-source`, cue-002）与“99%的人”（`exact-source`, cue-003）；旁注“讲述者观点，未核验”（`generated-summary`, claim-ledger `claim-99-percent`）。不得使用比例、人物阵列或统计图。terminal frame 只留下“开发 + 维护能力”语义锚点。

## Frame 3 — AI 信心幻觉

- scene: 工具熟练带来的信心被“懂系统？”打断。
- duration: 12.160s
- poster: 11.400s
- transition_in: cut
- status: outline
- voiceover: "AI也并不是你想的那么简单。我看到很多人用完Codex、Claude Code，都觉得自己是大神，就一下子支棱起来了，觉得自己是被掩埋的技术天才，强得可怕，会搭工作流，会写提示词，然后生成一个Agent。"
- src: production/compositions/scenes/03-confidence-illusion.html
- cue_range: cue-004..cue-005
- time_range: 15.140-27.300
- role: concept
- host_pose: think
- zones: host.left, content.right, caption
- operation: replace
- motion_rules: scale-swap-transition, viewport-change

“AI也并不是你想的那么简单”（`exact-source`, cue-004）先落定；随后“会搭工作流 ≠ 懂系统”（`generated-summary`, cues 004-005）替换工具名列表。人物保持思考姿势，不因 Codex、Claude Code、Agent 三个词连续换姿。

## Frame 4 — Demo 不是系统

- scene: “能演示”与“可维护”成为两种清晰且不等权的状态。
- duration: 17.440s
- poster: 16.600s
- transition_in: cut
- status: outline
- voiceover: "尤其是应届生，投了很多简历，说AI并不好找工作。我可以非常明确地告诉你，这个市场上90%的人，他对底层逻辑是完全不清晰的。他不是在构建一个可维护的系统，而是在拼接一个能演示的流程、一个Demo。"
- src: production/compositions/scenes/04-demo-not-system.html
- cue_range: cue-006..cue-008
- time_range: 27.300-44.740
- role: compare
- host_pose: present
- zones: host.right, content.left, caption
- operation: replace → compare → compact
- motion_rules: card-morph-anchor, scale-swap-transition

先用引语“AI并不好找工作”（`exact-source`, cue-006），再呈现“90%的人”（`exact-source`, cue-007）与“讲述者观点，未核验”（`generated-summary`, claim-ledger `claim-90-percent`），不得做统计图。terminal compare 为“可维护系统 ≠ 能演示的 Demo”（`generated-summary`, cue-008）。

## Frame 5 — 五个原因

- scene: 一个五点结构锚点建立后续路线，但不把五张卡片同时铺满。
- duration: 4.600s
- poster: 3.900s
- transition_in: cut
- status: outline
- voiceover: "五个原因，对照一下，自己能理解的，月薪都不会低于30K。"
- src: production/compositions/scenes/05-five-reasons.html
- cue_range: cue-009
- time_range: 44.740-49.340
- role: concept
- host_pose: emphasis
- zones: host.left, content.right, caption
- operation: enter → compact
- motion_rules: viewport-change, scale-swap-transition

主画面仅显示“五个原因”（`exact-source`, cue-009）。`30K` 只出现在精确字幕中并按讲述者未核验主张处理，不显示工资图、保证徽章或平台承诺。五点索引随后压缩为小型历史锚点。

## Frame 6 — 平台隐藏复杂性

- scene: 前景按钮被移开，露出背后的模型、接口、权限和状态链。
- duration: 25.560s
- poster: 24.700s
- transition_in: cut
- status: outline
- voiceover: "第一，平台把系统的复杂性给隐藏起来。低代码、无代码、AI平台、工作流工具，把模型调用、API连接、向量库、工具链调度流程包装成了按钮和节点。好处是普通人可以快速上手，坏处是很多人误以为会拖拽节点就等于懂系统架构。但一旦报错，你根本就不知道是模型问题、接口问题、权限问题、数据问题，还是上下游问题、状态管理问题。"
- src: production/compositions/scenes/06-hidden-complexity.html
- cue_range: cue-010..cue-013
- time_range: 49.340-74.900
- role: process
- host_pose: point-right
- zones: host.left, content.right, caption
- operation: replace → compact
- motion_rules: svg-path-draw, viewport-change, card-morph-anchor

依次显示“平台把系统的复杂性给隐藏起来”（`exact-source`, cue-010）、“包装成了按钮和节点”（`exact-source`, cue-011）、“快速上手 ≠ 懂系统架构”（`generated-summary`, cue-012）和“模型 / 接口 / 权限 / 数据 / 上下游 / 状态管理”（`generated-summary`, cue-013）。流程状态每次最多三个 active nodes；terminal frame 把错误来源压缩成“看不见的系统层”。

## Frame 7 — 原型能力与产品能力

- scene: 一次跑通的 Demo 被要求承受长期业务条件，形态从轻薄变为有底座的产品。
- duration: 26.840s
- poster: 26.000s
- transition_in: cut
- status: outline
- voiceover: "第二点，很多人把原型能力误判成是产品能力。AI最擅长帮你从0到1做一个Demo，每次帮你跑通一次，你就觉得自己做成了。但是真实的产品不是跑通一次就可以了，而是能够长期稳定地运行真实的业务，是有脏数据、异常输入、并发请求、成本控制、隐私安全等一系列的问题。当没有工程底座的时候，你的Demo越漂亮，后面塌得就越快。"
- src: production/compositions/scenes/07-prototype-vs-product.html
- cue_range: cue-014..cue-017
- time_range: 74.900-101.740
- role: compare
- host_pose: present
- zones: host.right, content.left, caption
- operation: replace → compare → compact
- motion_rules: card-morph-anchor, scale-swap-transition, viewport-change

主画面使用“原型能力 ≠ 产品能力”（`generated-summary`, cue-014）、“从0到1做一个Demo”（`exact-source`, cue-015）、“长期稳定地运行真实的业务”（`exact-source`, cue-016）和“Demo越漂亮，后面塌得就越快”（`exact-source`, cue-017）。异常条件逐组替换，不堆成五张卡片。

## Frame 8 — 结果与维护

- scene: 光鲜结果被翻到背面，露出失败排查、日志、测试与边界条件。
- duration: 22.220s
- poster: 21.400s
- transition_in: cut
- status: outline
- voiceover: "第三点，就是我觉得现在短视频它疯狂地在展示结果，没有去展示维护。一个智能体自动生成报告、自动回复客户、自动剪辑视频，它看起来很震惊，但是没有人展示它失败的时候怎么去排查，没人展示日志怎么读，没人展示测试怎么做，没人展示边界条件怎么处理。于是大家看到的是魔法，Magic，它不是Engineering。"
- src: production/compositions/scenes/08-results-vs-maintenance.html
- cue_range: cue-018..cue-020
- time_range: 101.740-123.960
- role: compare
- host_pose: explain
- zones: host.left, content.right, caption
- operation: replace → compare
- motion_rules: scale-swap-transition, viewport-change, card-morph-anchor

屏幕文字为“展示结果，没有去展示维护”（`exact-source`, cue-018）、“失败排查 / 日志 / 测试 / 边界条件”（`generated-summary`, cue-019）和“Magic ≠ Engineering”（`generated-summary`, cue-020）。terminal frame 保持 Engineering 一侧，不增加新的工具或品牌。

## Frame 9 — 捷径误解

- scene: “弯道超车”的想象先被承认一半，再被工程边界明确截断。
- duration: 23.320s
- poster: 22.500s
- transition_in: cut
- status: outline
- voiceover: "第四点，很多人有强烈的弯道超车的心理。AI给了所有非技术的人一个巨大的想象：我不懂代码也能做软件，我不会开发也能创业。这种心理有一部分是真的，因为AI确实降低了表达需求和生成原型的门槛。但危险在于，有些人进一步误解为，不需要懂代码、不需要懂系统、不需要懂工程就能够。不能，最后只是一种自欺欺人。"
- src: production/compositions/scenes/09-shortcut-misconception.html
- cue_range: cue-021..cue-025
- time_range: 123.960-147.280
- role: compare
- host_pose: think
- zones: host.right, content.left, caption
- operation: replace → compare → exit
- motion_rules: card-morph-anchor, scale-swap-transition

依次显示“弯道超车”（`exact-source`, cue-021）、“不懂代码也能做软件”（`exact-source`, cue-022）、“降低了表达需求和生成原型的门槛”（`exact-source`, cue-023）、“不需要懂代码 / 系统 / 工程”（`generated-summary`, cue-024）和“最后只是一种自欺欺人”（`exact-source`, cue-025）。

## Frame 10 — Agent 工程清单

- scene: 十个工程问题像审查窗口一样逐组进入，每一组最多三个 active nodes。
- duration: 23.080s
- poster: 22.300s
- transition_in: cut
- status: outline
- voiceover: "第五点，真正的智能体至少要能回答一些问题：它的任务边界是什么？它失败时应该怎么办？该如何保存和调用上下文？该怎么判断模型输出是否靠谱？它怎么处理工具调用失败？它的数据从哪里来，是否可信？它有没有权限控制和安全机制？有没有日志、监控、测试、回滚机制？它的成本是否可控？最后，它能不能被别人去维护？"
- src: production/compositions/scenes/10-agent-engineering-checklist.html
- cue_range: cue-026..cue-035
- time_range: 147.280-170.360
- role: process
- host_pose: read
- zones: host.left, content.right, caption
- operation: replace → compact
- motion_rules: viewport-change, svg-path-draw, card-morph-anchor

十个主文字都来自 cue-026 至 cue-035 的精确摘录，类型均为 `exact-source`：任务边界、失败处理、上下文、输出可靠性、工具失败、数据可信、权限安全、可观测/测试/回滚、成本、他人维护。每组三项以内，上一组先 compact 再进入下一组。terminal frame 只保留“能不能被别人去维护？”（`exact-source`, cue-035）。

## Frame 11 — 补丁扩大失真

- scene: 一个小缺口被 AI 补丁形变成大块遮盖，最终回到“产品还是演示”的判断。
- duration: 12.080s
- poster: 11.300s
- transition_in: cut
- status: outline
- voiceover: "很多人出了Bug以后，他用AI来去打这个补丁。我说实话，AI打补丁，这个补丁会打得非常大，而且一定是失真的。这些问题，有人回答得上来吗？你回答不上来，它就不是产品，它只是个演示。"
- src: production/compositions/scenes/11-patch-distortion.html
- cue_range: cue-036..cue-039
- time_range: 170.360-182.440
- role: concept
- host_pose: question
- zones: host.right, content.left, caption
- operation: replace → morph → compare
- motion_rules: card-morph-anchor, scale-swap-transition

主文字依次为“用AI来去打这个补丁”（`exact-source`, cue-036）、“补丁会打得非常大，而且一定是失真的”（`exact-source`, cue-037）、“这些问题，有人回答得上来吗？”（`exact-source`, cue-038）和“它就不是产品，它只是个演示”（`exact-source`, cue-039）。人物原图已有问号，不叠加第二个装饰问号。

## Frame 12 — 从玩具到基础设施

- scene: 成熟度沿一条路径滚动推进，当前窗口始终不超过三个节点。
- duration: 9.400s
- poster: 8.700s
- transition_in: cut
- status: outline
- voiceover: "今年，真正懂系统的人已经开始胜出了，因为他们把AI从玩具变成了工具，将工具变成了产品，从产品变成了业务的基础设施。"
- src: production/compositions/scenes/12-maturity-ladder.html
- cue_range: cue-040
- time_range: 182.440-191.840
- role: process
- host_pose: point-right
- zones: host.left, content.right, caption
- operation: replace → compact
- motion_rules: svg-path-draw, viewport-change

主画面为“玩具 → 工具 → 产品 → 业务基础设施”（`generated-summary`, cue-040）。路径用滚动三节点窗口表达，不在单一状态同时激活四个节点；terminal frame 只保留“业务基础设施”和压缩后的上游路径标记。

## Frame 13 — 系统学习路线

- scene: 从基础知识进入 Agent 集群、MCP 和项目实践，最后落到上线产品。
- duration: 23.420s
- poster: 22.600s
- transition_in: cut
- status: outline
- voiceover: "如果你也想把Agent真正地学起来，不只是随便玩一下，而是当作自己的工作，就能拿到一个还不错的薪资。666，拿着我这份耗时三周整理出来的路线和教程，里面就包含了Agent集群、MCP等基础的知识点，以及要去做什么项目。把这些东西都要系统地过一遍，这才是决定你做出来的东西不是Demo，而是能够上线的产品。"
- src: production/compositions/scenes/13-learning-route.html
- cue_range: cue-041..cue-043
- time_range: 191.840-215.260
- role: process
- host_pose: encourage
- zones: host.right, content.left, caption
- operation: replace → compact
- motion_rules: svg-path-draw, viewport-change, card-morph-anchor

屏幕文字为“把Agent真正地学起来”（`exact-source`, cue-041）、“Agent集群 / MCP / 项目”（`generated-summary`, cue-042）和“不是Demo，而是能够上线的产品”（`exact-source`, cue-043）。薪资相关内容只保留在精确字幕，不制作收益承诺视觉。

## Frame 14 — 创建廉价，负责珍贵

- scene: 全片对象退到背景，四个价值词成为唯一结论。
- duration: 24.649s
- poster: 23.800s
- transition_in: cut
- status: outline
- voiceover: "当创建变得廉价，理解、判断、维护、负责就会变得异常珍贵。就是你去做这个提示词，这个动作是很廉价的，只需要消耗一点Token。但是后面如何去理解你的这个Agent，如何去判断，如何去维护，如何去负责，让它从一个Demo变成一个真正的产品，让它能够跑通你的业务，这个过程是很复杂的，所以这个过程也是很珍贵的。"
- src: production/compositions/scenes/14-value-close.html
- cue_range: cue-044..cue-046
- time_range: 215.260-239.909
- role: close
- host_pose: close
- zones: host.left, content.right, caption
- operation: compact → hold
- motion_rules: card-morph-anchor, viewport-change, scale-swap-transition

先显示“理解、判断、维护、负责”（`exact-source`, cue-044），再用“提示词 / Token”（`generated-summary`, cue-045）作为廉价创建的短暂对照，最后落到“Demo → 真正的产品 → 跑通业务”（`generated-summary`, cue-046）。terminal frame 只保留四个价值词、成熟度上下文和主持人，至少 hold 600ms。

