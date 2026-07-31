# AutoVideo HyperFrames 工作流

本目录是 `demo/f1` 两份文档在本项目中的可执行落地层，不是第三份说明文档，也不保存原始素材。

跨智能体交接、固定人物模板复用、外部配音接入和完整命令见 [AutoVideo 标准化交接与复用手册](./AUTOVIDEO_HANDOFF.md)。

## 两份输入文档的分工

- `demo/f1/HyperFrames视频工作流分享手册.md`：定义生产顺序、人工审核闸门、任务单、分镜、质检和复盘。
- `demo/f1/HF_风格与动效库_分享包搭建说明 (1).md`：定义风格包、动效匹配、组件复用和分享包结构。
- `style-library/`：本仓库已经整理出的共享风格与动效索引。F1 提到但未随文档提供的源码、示例和素材仍标记为 `spec-only`，不能假装已经安装。

## 固定流程

```text
输入与 NarrationLock
-> 确认比例、时长、平台和风格候选
-> 创建 VIDEO_TASK.md
-> 创建 STYLE_REVIEW.md 并制作同窗口探针
-> 人工批准风格与任务
-> 创建 STORYBOARD.md
-> 建立独立 HyperFrames 项目
-> hyperframes check + 媒体 QA + 视觉 QA
-> 定点修改
-> RETROSPECTIVE.md
```

未获得批准时，不得进入完整视频制作。用户明确要求跳过时，必须在任务单记录 `review_gate: skipped-by-user` 和推断选择。

## 默认配音阶段

带中文旁白的视频默认使用 CosyVoice 预设 14：`中文女 / FP32 / stream=false / speed 1.03 / seed 7`。先锁定文字，再生成、试听并冻结唯一最终 WAV；字幕、镜头和动画时间只能从最终 WAV 重新转写得到。

另一个 Agent 接手前必须读 [VOICE_HANDOFF.md](./VOICE_HANDOFF.md)。完整人类教程见 [CosyVoice 预设 14 + HyperFrames 最终视频教程](../docs/11-CosyVoice14与HyperFrames最终视频教程.md)。

## 新任务怎么开始

在仓库根目录执行：

```powershell
npm.cmd run video:new -- --id my-video --narration demo/demoText.txt --ratio 16:9 --duration 60s --platform 抖音
npm.cmd run video:apply-template -- --project my-video --style modern-ip-host-explainer
npm.cmd run video:template-status -- --project my-video
```

带参考风格图时：

```powershell
npm.cmd run video:new -- --id my-video --narration demo/demoText.txt --reference-image references/style.png --ratio 16:9 --duration 60s --platform 抖音
```

命令会创建 `projects/<project-id>/`，复制并锁定口播与参考图，生成：

- `NarrationLock.json`
- `project-state.json`
- `VIDEO_TASK.md`
- `STYLE_ANALYSIS.md`
- `STYLE_REVIEW.md`
- `STORYBOARD.md`
- `AssetManifest.json`
- `review/stills/` 与 `review/probes/`
- `production/`

然后让具备图像理解能力的 Codex/Agent 读取该项目，执行 `prompts/01-开始规划.md`。普通 Node 命令不负责“看懂”图片；Agent 负责提取参考图特征，并把结果写入 `STYLE_ANALYSIS.md`。

## 风格阶段生成什么

不要一开始生成一大堆完整视频，也不要只看一张空泛的封面。

1. 从口播中选择一个最能暴露主要画面语法的 3-8 秒窗口。
2. 根据参考图和内容选择 2-4 个真正不同的候选风格。
3. 每个候选生成一张代表性静帧。首屏可以是其中之一，但内容帧通常比纯标题页更能检验卡片、图表、截图和层级。
4. 每个候选用同一口播窗口生成一条 3-8 秒 motion probe。
5. 用户只批准一个基础风格；最多再批准两个有明确职责的组件家族。
6. 任务和风格都批准后，才生成完整分镜并制作全片。

## 审批与状态

查看状态：

```powershell
npm.cmd run video:status -- --project my-video
```

任务文档确认后：

```powershell
npm.cmd run video:approve-task -- --project my-video --reviewer 用户名
```

静帧和 motion probe 确认后，批准的名称必须来自当前索引：

```powershell
npm.cmd run video:approve-style -- `
  --project my-video `
  --reviewer 用户名 `
  --base handdrawn-workflow-tutorial `
  --addons magazine-collage-cards `
  --registry-items flowchart-vertical,grain-overlay `
  --blueprints spatial-pan-stations `
  --motion-rules viewport-change,svg-path-draw,css-marker-patterns
```

`approve-style` 会先确认 `review/stills/` 和 `review/probes/` 中确实存在评审产物，再校验基础风格、附加风格、frame preset、registry items、blueprints 和 motion rules 是否真实存在。双重批准后，`project-state.json` 才进入 `storyboard-ready`。任务和风格审批命令必须顺序执行，不要并发修改同一个项目状态。

只有用户明确要求跳过风格评审时，才能使用：

```powershell
npm.cmd run video:approve-style -- --project my-video --reviewer 用户名 --base swiss-pulse --motion-rules viewport-change --skip-review --skip-reason "用户要求直接制作"
```

跳过记录会写入 `project-state.json` 和 `style-selection.json`，不会静默绕过。

## Agent 的检索顺序

1. 读取 `../style-library/STYLE_REGISTRY.md` 和 `registry.json`。
2. 读取候选风格的 `STYLE_GUIDE.md`，把 Prompt 拆成 token、组件、构图、动效和禁止项，不直接把整段 Prompt 当最终视频。
3. 搜索 `generated/hyperframes-frame-presets.json`、`hyperframes-official-registry.json`、`hyperframes-blueprints.json` 和 `hyperframes-motion-rules.json`。
4. 找到合适的官方项后，再通过 HyperFrames CLI 安装或引用；本地自定义只用于已证明的缺口。
5. 所有素材记录到 `AssetManifest.json`，参考图只证明风格意图，不自动授予其中品牌、图片或字体的复用权。

配置见 `CONFIG.md`，各阶段责任见 `01-画面导演规则.md` 至 `04-复盘规则.md`。
