# HyperFrames 经验、风格库与 Codex 接入

> 日期：2026-07-16  
> 状态：第一版项目级风格库和 Codex 规则已落盘  
> 范围：评估 `demo/f1` 两份文档、核验官方/社区来源、建立可复用风格与动效索引

## 1. 先给结论

前面的 E08 确实走错了顺序：先写了一个统一章节组件和生成器，再换布局、配色与路径做三个版本。它证明了 HyperFrames 能稳定渲染，但没有证明三种成熟视觉风格，因此看起来仍像同一套卡片模板换皮。

正确做法不是放弃 HyperFrames，也不是继续手写更多模板，而是使用已有的四层积木：

```text
frame preset / named style
  + registry examples, blocks, components
  + semantic motion rules and blueprints
  + project-specific narration, assets and board plan
```

`demo/f1` 的核心价值是工作流和风格规范；HyperFrames 官方仓库与社区工程提供了真实可运行的代码。两者应该组合使用。

## 2. 对 F1 两份文档的判断

### 可以直接采用

1. 画面导演与视频工程分离：人类可读任务单 -> 用户审核 -> 执行分镜/IR -> HTML/CSS/GSAP -> check/render -> 复盘。
2. 风格是完整包：`STYLE_GUIDE + COMPONENT_CATALOG + HF_USAGE + PROMPTS + ANIMATION_RECIPES + references + manifest + example`。
3. 每个口播信息点必须有可解释的状态变化，画面不能提前演完后等待口播。
4. 先做静态终帧和信息层级，再添加动画；旧对象尽量成为下一段的上下文。
5. 风格选择必须是封闭菜单或明确的参考，不让模型自行猜“高级感”。
6. 人工确认风格和任务单后，才进入完整制作。

### 不能直接声称已拥有

F1 文档提到的以下目录和资产在当前工作区不存在：

- `HF_video_generation_archive/style-libraries/`
- `hyperframe-library/`
- `codex-hf-video-workflow-kit/`
- `style-motion-library-apple-3s/`
- `codex-motion-packaging-11s/`
- `animation-style-library-update-handdrawn-3p2s/`

因此我们拥有的是 7 套风格说明、配色、组件语义和时序规则，不是原作者的 HTML、参考图片、字体、素材和运行示例。文档的许可证也没有说明，这些条目必须标为 `spec-only / license unknown`。

第二份手册 frontmatter 明确是 `status: draft`，且仍使用旧命令 `inspect`。当前 HyperFrames 0.7.59 应使用 `check`。

## 3. 已沉淀的 F1 风格

| ID | 适用 | 当前可复用程度 |
|---|---|---|
| `editorial-data-report` | 数字、排行、论据 | 可复用规范和时序；组件需重建或从官方 registry 组合 |
| `apple-clean-product` | 产品与工具讲解 | 可复用设计令牌；优先对照官方 Apple/产品 blocks |
| `pixel-card-platform-ui` | 游戏化学习 | 可复用规范；商标和角色必须重新核查 |
| `magazine-collage-cards` | 截图、证据、创作者教程 | 适合作为手绘主风格的证据组件族 |
| `monochrome-cyber-editorial-cards` | 高密度技术主题 | 可复用规范；避免成为默认科技模板 |
| `handdrawn-workflow-tutorial` | 单画板知识讲解 | 当前主模板候选 |
| `data-hud-narration` | 明确要求的深色人物/HUD 口播 | 只显式调用，不作为默认 |

同步脚本已经把七个附录章节分别固定到 `style-library/styles/f1/<id>/STYLE_GUIDE.md`，每份都带有缺失资产和未知许可证提示。

## 4. HyperFrames 官方已有的风格库

### 4.1 Named visual styles

官方 `hyperframes-creative/references/visual-styles.md` 已定义八套 token-based 风格：Swiss Pulse、Velvet Standard、Deconstructed、Maximalist Type、Data Drift、Soft Signal、Folk Frequency、Shadow Cut。

本机来源：`vendor/hyperframes/skills/hyperframes-creative/references/visual-styles.md`。

### 4.2 Frame presets

官方 creative skill 当前包含 13 套可直接采用的 `FRAME.md`：

`biennale-yellow`、`blockframe`、`blue-professional`、`bold-poster`、`broadside`、`capsule`、`cartesian`、`claude`、`cobalt-grid`、`coral`、`creative-mode`、`daisy-days`、`editorial-forest`。

线上入口：[HyperFrames Design](https://www.hyperframes.dev/design)。本机索引：`style-library/generated/hyperframes-frame-presets.json`。

### 4.3 Official registry

2026-07-16 本机与在线 CLI 核验：

| 类型 | 数量 | 用途 |
|---|---:|---|
| examples | 8 | 可运行完整示例：warm-grain、swiss-grid、vignelli、kinetic-type、product-promo、nyt-graph 等 |
| blocks | 109 | data chart、flowchart、地图、lower third、代码、转场、VFX、产品展示等 |
| components | 25 | caption、grain、vignette、shimmer、motion blur、parallax 等 |

官方入口：[registry.json](https://github.com/heygen-com/hyperframes/blob/main/registry/registry.json)。本机可运行：

```powershell
npx.cmd --yes hyperframes@0.7.59 catalog --json
npx.cmd --yes hyperframes@0.7.59 add flowchart-vertical --dir <project>
npx.cmd --yes hyperframes@0.7.59 add caption-editorial-emphasis --dir <project>
```

这里的数量按 `registry.json` 中可安装项目计算。仓库里还有未进入 manifest 的 demo/example 目录，不能因为目录存在就声称 CLI 可安装。

当前优先复用：`data-chart`、`flowchart-vertical`、`caption-weight-shift`、`caption-editorial-emphasis`、`grain-overlay`。默认禁用 `flash-through-white`、RGB glitch、全屏 distortion 和高频粒子，它们与用户明确反感的闪烁风险冲突。

### 4.3.1 Frame adoption 与私有 registry 限制

官方产品工作流已有 `build-frame.mjs` 模式，把 preset 的 `FRAME.md` 采用为项目 `frame.md`，再复制字幕皮肤并冻结字体。AutoVideo 应复用“规范 + 资产 + 构建”方式，不为每套风格复制一份完整 HTML 生成器。

当前 `style-library/` 是规划与选择目录，不是 HyperFrames 私有 registry。以后建立私有 registry 时需要注意：

- CLI 通过 HTTP/HTTPS URL 获取 registry，不直接读取本地文件路径。
- `add` 会覆盖目标文件，没有 diff、备份或安装 lockfile；人工修改过的组件不能盲目重装。
- manifest 缓存会影响本地调试，应固定版本并保留安装 receipt。
- 自有 item 必须通过 JSON Schema、HTTP `catalog/add` 冒烟、独立 example 和 `check/snapshot`，不能只有一个 HTML 文件。

### 4.4 Scene blueprints and motion rules

官方 animation skill 当前提供 15 个成套 scene blueprint 和 37 条原子规则。最关键的是 `spatial-pan-stations`：它原生定义了“在一个超大画板预放站点，用单一虚拟相机横向/斜向连续巡航，每站揭示一个信息，最终停在终点”的结构，正好对应用户要的单画板讲解。

建议主骨架：`spatial-pan-stations`；再组合 `viewport-change`、`svg-path-draw`、`css-marker-patterns`、`stat-bars-and-fills`、`card-morph-anchor`。每个 beat 只组合 2-4 条，不应重新发明统一的“列表淡入”时间线。

本机索引：`style-library/generated/hyperframes-blueprints.json` 和 `style-library/generated/hyperframes-motion-rules.json`。

### 4.5 版本基线

当前实际渲染命令固定 `hyperframes@0.7.59`，但 `vendor/hyperframes` 的 CLI 与 plugin manifest 是 `0.7.58`。本次风格索引用 vendor 作为源码证据；开始依赖内部 API、复制 registry item 或制作正式探针前，必须把 vendor 更新到 0.7.59 对应提交，或明确对两版本做差异审计。不能默认两者完全一致。

## 5. 网上值得参考的社区项目

### HyperFrames Student Kit

- 地址：[nateherkai/hyperframes-student-kit](https://github.com/nateherkai/hyperframes-student-kit)
- 2026-07-16 检索快照：约 522 stars，MIT。
- 内容：12 个完成/接近完成的项目、`MOTION_PHILOSOPHY.md`、agent skills、storyboard/handoff、逐词抽帧验证方法。
- 许可边界：代码 MIT；AIS Logo、品牌规范、品牌 token 与部分内容明确不授权复用。

已稀疏克隆到 `vendor/hyperframes-student-kit/`，固定 commit `a89e704ffbad02ac71170755526e05432598be59`。只保留文档、Skills 和 `may-shorts-19` 的 HTML/compositions，不含品牌资产和成片。

可采用的经验：真实音频是事实源、场景本地时间、持续背景层、人物模式平滑切换、语义时刻逐帧抽图、视觉 payoff 留出阅读时间、短视频中间段优先使用“像信息的视觉”而非纯装饰。

需要谨慎采用：`每 100ms 都有动画`、`camera never sleeps` 和强制高能转场是短促营销片经验，不适合机械套到五分钟教学视频。

### Orkas VideoStudio

- 地址：[Orkas-AI/Orkas-VideoStudio](https://github.com/Orkas-AI/Orkas-VideoStudio)
- 检索快照：约 227 stars，MIT。
- 值得借鉴：可读可 diff 的 `plan.json`、Compose/Edit/Generate/Auto 四条生产线、单段可重渲染、delivery promise guard。
- 定位：更适合后续 IR/编排层对照，不是直接风格库。

### 其他项目

GitHub 上已有中文 Codex + HyperFrames 短视频 Skill，但部分仓库没有许可证。无许可证项目只记录工作流思想，不复制源码、素材或模板。低 star、没有可运行示例、只是 HyperFrames fork 的仓库不进入默认依赖。

可迁移但不需要更换主引擎的经验：

- [Motion Canvas examples](https://github.com/motion-canvas/examples)，MIT：借 `smooth-parallax` 的连续相机与生成器节奏。
- [Manim](https://github.com/ManimCommunity/manim) / [Manim Voiceover](https://github.com/ManimCommunity/manim-voiceover)，MIT：借 voiceover duration tracker、bookmark/词触发和教学镜头语义。
- [Rough.js](https://github.com/rough-stuff/rough) / [Rough Notation](https://github.com/rough-stuff/rough-notation)，MIT：为手绘主风格生成固定 seed 的 SVG，再由 seek-safe GSAP/WAAPI 控制描边。
- [Remotion templates](https://www.remotion.dev/templates)：只借字幕分组、长音频窗口和 spring 参数；其许可证不是 OSI 开源，不重新引入主线。

许可风险：HyperFrames 是 Apache-2.0，但 GSAP 使用自定义 no-charge license，不是开源许可证。商业生成视频通常可用，但“提供给用户的可视化动画编辑器”可能触及其产品限制；正式 SaaS 前应取得明确许可意见，或验证 HyperFrames 的 Anime.js/WAAPI adapter 作为可替换后端。官方 `hyperframes-launches` 展示仓库当前也没有 LICENSE，只能参考，不能直接复制源码和媒体。

## 6. 对 E08 的具体差距

1. 三版共享同一个 `headline + metric + items + tags` 章节组件和近似 reveal 时间线，主要只是布局、路径和配色不同。
2. 没有每套风格独立的 tokens、组件语法、负面规则、motion recipe、reference 和最小示例。
3. 只按 14 章做动作，长段落在开头 reveal 完成后留下大量语义动态空档。
4. 没有信息点级 cue、source range、visual intent、asset request 和 motion matching。
5. 没有真实截图、SVG 图标、流程组件、纸张/胶带/手绘资产与来源 manifest。
6. 没有任务单和 storyboard 风格审批，先渲染三条全文造成无效成本。
7. 媒体 QA 很强，但没有检查每个信息点是否有画面动作、中文语义断行、首秒主题、结尾全局总览和风格遵循。

这解释了为什么视频技术上通过、视觉上仍然不成立。

## 7. Codex 需要怎样配置

### 当前已经足够的配置

根目录新增的 `AGENTS.md` 会让后续 Codex 在这个项目中自动遵守：

- 先读 `style-library/STYLE_REGISTRY.md`；
- 先查官方 preset/example/block/component/motion rule；
- 先生成任务单和风格评审；
- 风格未确认时只做 3-8 秒探针；
- 用户确认后才扩展全文；
- 媒体 QA 与视觉 QA 分开；
- 把通过验收的经验写回风格库。

这一层是项目级配置，不污染其他仓库，当前最合适。

独立 Codex 前向测试已通过：在不提供本轮结论的情况下，新任务能自动发现根 `AGENTS.md`，先读取 style/motion registry，建立 `VIDEO_TASK.md` 与 `STYLE_REVIEW.md`，并在风格未 `approved` 时拒绝直接渲染全文。

### 为什么暂不创建全局 Skill

Codex 已经安装官方 `hyperframes`、`hyperframes-creative`、`hyperframes-animation`、`hyperframes-registry` 等 Skills。当前缺的是本项目经过用户验证的审美规则，不是另一个复制官方说明的 Skill。

F1 七套风格目前只有规范，E08 又没有通过视觉验收。现在创建全局 Skill 会把未验证规则带到所有视频项目。建议等 2-3 套风格用真实口播通过后，再用 `skill-creator` 创建：

```text
$CODEX_HOME/skills/autovideo-hyperframes-workflow/
  SKILL.md
  references/
  scripts/
  assets/
```

届时 Skill 只保留稳定工作流、选择路由和验证脚本；详细风格仍放在 references，组件与示例放 assets 或独立 registry。

## 8. 已落盘的风格库

```text
AGENTS.md
style-library/
  STYLE_REGISTRY.md
  MOTION_REGISTRY.md
  SOURCES.md
  registry.json
  schema/style-selection.schema.json
  templates/VIDEO_TASK.md
  templates/STYLE_REVIEW.md
  styles/f1/*/STYLE_GUIDE.md
  styles/official/*/STYLE_GUIDE.md
  generated/*.json               # 含 15 个 blueprint、37 条 motion rule
  qa/validation.json
scripts/
  sync-style-library.mjs
  validate-style-library.mjs
```

同步结果：7 套 F1 风格、8 套官方命名风格、13 套 frame preset、8 个官方示例、109 个 block、25 个 component、15 个 scene blueprint、37 条 motion rule；当前 81 项风格库验证全部通过。

## 9. 下一步怎么做

下一轮固定 `demoText.txt` 的同一 3-8 秒窗口，只做三个真正不同的风格探针：

1. 手绘流程教程：来源/步骤纸/手绘连接/对象传递。
2. 杂志证据板：截图框、便签、胶带、引用与荧光笔。
3. 编辑数据报告：数字、证据条、注释和结论，但保持同一画板，不做白场换页。

每个探针必须绑定不同组件和 motion recipe，而不是换色。用户确定主风格后，只扩展一个 30-45 秒样片；完成 Studio/IR 编辑闭环后才进入全文。
