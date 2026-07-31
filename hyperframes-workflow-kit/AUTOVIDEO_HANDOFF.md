# AutoVideo 标准化交接与复用手册

> 当前批准模板：`modern-ip-host-explainer@1.0.0`  
> 默认配色：`light-apricot`（浅杏橙）  
> 备选配色：`warm-peach`（暖桃灰）  
> 强制输出：`16:9 / 1920x1080 / 30fps`

## 1. 结论先说清楚

这套人物讲解风格已经保存成可复用的**规则模板包**，不是只留在对话或 Prompt 里。稳定入口是：

```text
style-library/styles/project/modern-ip-host-explainer/
```

已经固定的部分包括视觉令牌、配色、布局区域、元素数量上限、人物姿态清单、姿态切换策略、字幕职责、场景语法、动效边界和验证证据。

`hyperframes-workflow-kit/projects/persondesign-modern-host-probe/index.html` 仍只是模板可行性的样片。V2 已新增确定性的 production compiler，可以从已批准的 storyboard、shot manifest、Graph IR、asset manifest 和 overrides 生成全片；正式编译还会验证 Graph Layout 和逐配方 motion lifecycle 回执。但“任意新内容可靠地产生这些规划合同”尚未完成跨项目基准，因此仍不能声称只换文字就能无人审核批量出片。

Candidate A 的批准只锁定固定 Q 版人物、浅杏色舞台、右侧内容区和字幕轨，不会自动批准 `keyword-handoff`、`diagram-build` 等动效配方。当前 30 秒样片使用的三个配方仍为 `candidate`，所以 `SOP_STATUS.json` 将已有 composition 标为 `present-unverified`；完成逐配方短探针和项目级批准后，必须重新编译和运行 HyperFrames check。

当前能力边界如下：

| 能力 | 状态 | 说明 |
|---|---|---|
| 固定人物讲解风格包 | 已完成 | `modern-ip-host-explainer@1.0.0` |
| 浅杏橙默认、暖桃灰备选 | 已完成 | 配色和字幕颜色按语义角色绑定 |
| 人物表情/姿态复用规则 | 已完成 | 语义切换，8 秒最多两次 |
| 模板套用与哈希锁定 | 已完成 | `video:apply-template` |
| 外部配音与时间数据交接 | 已完成 | `video:attach-audio` |
| 复用状态与阻塞项检查 | 已完成 | `video:template-status` |
| 规划合同到完整 HyperFrames 全片 | 已完成（单模板 V2） | 确定性 compiler 已验证，跨模板回归待补 |
| 动效配方正式生产门禁 | 已完成 | planning 可保留 candidate 供探针；full-production 只接受项目批准或模板晋级的配方，并把 ledger SHA 与逐配方决定写入 build/SOP 回执 |
| 任意新文稿生成可靠分镜/Graph IR | 尚未通用化 | V2 的远程规划失败后使用同内容 fallback；不同文稿必须重新生成并审核 |
| 无人审核自动批量出片 | 明确禁止 | 任务、项目探针、最终预览和 QA 不能静默跳过 |

## 2. 整体协作链路

```text
文本智能体
  -> 已审 UTF-8 口播稿
  -> AutoVideo 项目初始化 + NarrationLock
  -> 固定模板套用 + template-lock

配音智能体
  -> 只朗读 NarrationLock，不改文案
  -> 版本化本地 WAV 候选 + 技术 QA
  -> 人工 A/B 选择 + 原子晋升唯一最终 WAV
  -> 只对已晋升 WAV 生成 alignment.json
  -> AutoVideo 校验并生成 audio-handoff

AutoVideo / HyperFrames 智能体
  -> 从口播语义和 alignment 生成 beat、字幕、场景与动效
  -> 使用固定人物、布局、配色和元素预算
  -> HyperFrames check + Studio 预览
  -> 用户最终审片批准
  -> 渲染、媒体 QA、交付
```

HyperFrames 负责最终音频、字幕、人物、信息动效、时间线和输出文件的合成。文本智能体和配音智能体提供上游批准产物，不直接修改最终 composition。

## 3. 职责边界

### 文本智能体

- 输出用户批准的 UTF-8 文稿。
- 数字、专名、观点边界和朗读方式在锁稿前确认。
- 锁稿后不得静默改字；任何改字都创建新项目或新 NarrationLock 版本，并使旧音频和时间线失效。

### 配音智能体

- 输入只能是项目 `NarrationLock.json` 指向的冻结文稿。
- 不得为了“更顺口”自行改文案。
- 生成器只输出版本化 `audio/voice-candidates/candidate-NNN/`，不得直接创建或覆盖正式 WAV；已有正式 WAV 只作为只读 baseline。
- 每个活动候选必须人工播放到结尾，选择一个 generated candidate，完成五项听感检查并明确接受；技术 QA、通用批准接口和批量 runner 都不能批准 `voice-final`。
- 原子晋升后才输出唯一最终 `48kHz / mono / PCM WAV`、正式 recipe、试听批准信息和 audio-handoff；失败或中断不得留下半套正式状态。
- 只有已晋升正式 WAV 才能生成 `alignment.json`。原声/合法授权音频可跳过 TTS 发音审核，但不能跳过候选听审与晋升。
- `alignment.json` 至少包含单调递增的 word 或 segment `start/end` 秒数，并覆盖最终 WAV。
- 声音授权未确认时必须标记 `rights-status=needs-review`。该状态允许生成明确标记的内部审片版，但阻止公开母版和对外发布。
- 自动化测试只允许导入本地音频、下载字节、校验哈希/格式/解码/时序和 API 合同，不得调用麦克风、录音、浏览器自动播放或外放设备。麦克风测试必须等待用户后续明确授权。

### AutoVideo / HyperFrames 智能体

- 校验 NarrationLock、模板锁、音频哈希和 alignment。
- 把口播拆成 `hook / concept / compare / process / proof / close` 场景语法。
- 字幕、场景边界和 motion cue 以最终 WAV 的 alignment 为准，不靠估算。
- 优先复用 HyperFrames 官方 frame preset、registry、blueprint 和 motion rule。
- 只在批准后制作全片；最终预览批准前不输出发布母版。

### 用户 / 审片人

- 批准任务范围和禁用样式。
- 批准同一口播窗口的静帧和 3-8 秒项目探针。
- 批准最终声音和声音权利状态。
- 在 Studio 中批准最终预览，再允许渲染发布母版。

## 4. 核心文件合同

```text
hyperframes-workflow-kit/projects/<project-id>/
  input/narration.txt           # 冻结的批准文稿
  NarrationLock.json            # 文稿哈希与不可变来源
  template-lock.json            # 风格版本、配色和六个源文件哈希
  VIDEO_TASK.md                 # 受众、目标、禁用项、beat 计划
  STYLE_REVIEW.md               # 同窗口静帧/探针和项目级批准
  style-selection.json          # 本项目批准的风格、组件和动效来源
  audio/voice-candidates/       # baseline、版本化候选、候选 manifest 与 A/B 审核
  audio/narration.final.wav     # 唯一最终音轨
  audio/voice.recipe.json       # 已晋升正式配音 recipe
  audio/listening-review.json   # 已晋升候选的人工听审
  audio/approval.json           # human-listening 批准回执
  audio/voice-promotion.json    # 原子晋升事务回执
  audio/alignment.json          # 最终音轨的词/句时间
  audio-handoff.json            # 音频、时间、权利和哈希交接锁
  STORYBOARD.md                 # 按最终音频生成的执行分镜
  AssetManifest.json            # 人物、图片、字体、声音来源台账
  index.html                    # 当前项目的 HyperFrames composition
  index.motion.json             # seek-safe 动效合同
  review/                       # 静帧、探针和预览证据
  qa/                           # 结构、媒体、视觉与文字 QA
```

机器合同 schema：

- `style-library/schema/template-lock.schema.json`
- `style-library/schema/audio-handoff.schema.json`
- `style-library/schema/style-selection.schema.json`

## 5. 新项目标准操作

以下命令都在仓库根目录执行。

### 第一步：文本稿批准后初始化

```powershell
npm.cmd run video:new -- `
  --id <project-id> `
  --narration <approved-narration.txt> `
  --ratio 16:9 `
  --duration <target-seconds> `
  --platform <platform>
```

初始化会复制文稿并创建 `NarrationLock.json`。不要先手工建 `index.html`。

### 第二步：套用固定模板

默认浅杏橙：

```powershell
npm.cmd run video:apply-template -- `
  --project <project-id> `
  --style modern-ip-host-explainer
```

明确使用暖桃灰时：

```powershell
npm.cmd run video:apply-template -- `
  --project <project-id> `
  --style modern-ip-host-explainer `
  --palette warm-peach
```

命令会生成 `template-lock.json`，记录版本、配色、横屏约束和风格源文件哈希。它不会自动批准任务、不会自动批准项目探针，也不会开始全片制作。

需要让机器从当前状态连续运行到下一道人工门时，可使用：

```powershell
npm.cmd run video:run-standard -- --project <project-id> --base-url http://127.0.0.1:<workbench-port> --fallback-reference demotext-standard-delivery-v5
```

该命令在任何普通人工门生成待审产物后返回 `waiting-for-human`，不会调用阶段批准接口、不会启动 Studio、不会播放音频，也不会合成人工听审或视觉审片结论。项目根目录 `STANDARD_RUN_RECEIPT.json` 保存最新运行回执，`receipts/standard-runs/<runId>.json` 保存历史；失败后重新运行会以新 run/attempt 恢复，并通过 `resumesRunId` 指向中断运行。当前 30 项恢复矩阵只覆盖编排合同，真实 CosyVoice、Codex 规划、HyperFrames 编译和渲染进程的中断实验仍需单独执行。

### 第三步：完成项目任务与探针门禁

1. 完成 `VIDEO_TASK.md`，明确受众、记忆点、禁用效果和屏幕文字来源。
2. 用新文稿中的同一 3-8 秒窗口生成一张内容静帧和一条 motion probe。
3. 检查人物区、内容区、字幕区不重叠，前一组元素先退出或收拢。
4. 用户批准任务和本项目探针。

```powershell
npm.cmd run video:approve-task -- --project <project-id> --reviewer <name>

npm.cmd run video:approve-style -- `
  --project <project-id> `
  --reviewer <name> `
  --base modern-ip-host-explainer `
  --registry-items caption-weight-shift `
  --motion-rules svg-path-draw,scale-swap-transition
```

已经批准的是风格语言，不是每一条新口播的具体排版。新项目仍需短探针验证内容密度和断句，不需要重新探索一堆风格。

### 第四步：接收外部配音

配音智能体交付最终 WAV 和 alignment 后执行：

```powershell
npm.cmd run video:attach-audio -- `
  --project <project-id> `
  --audio <narration.final.wav> `
  --alignment <alignment.json> `
  --recipe <voice.recipe.json> `
  --provider <voice-agent-or-model> `
  --approved-by <reviewer> `
  --rights-status approved
```

命令会拒绝以下输入：

- 不是 RIFF/WAVE；
- 不是 `48kHz / mono / integer PCM`；
- alignment 没有有效时间条目、时间倒退或没有覆盖最终音轨；
- alignment 声明的 narration hash 与 NarrationLock 不一致；
- 目标文件已存在但内容不同，且没有显式 `--replace`。

只有确实更换最终音频时才能使用 `--replace`。更换后字幕、场景时长、motion cue 和旧渲染 QA 全部失效，必须重新派生。

### 第五步：检查能否进入制作

```powershell
npm.cmd run video:template-status -- --project <project-id>
```

关注三个状态：

- `readyForProjectProbe`：文稿锁和模板锁有效，可以做项目探针。
- `readyForComposition`：公开制作要求任务/风格、最终音频、alignment、人工听审和声音权利均有效；`internal-only` 项目可在技术门通过后生成内部审片 composition。
- `readyForFinalRender`：要求人工听审、用户最终预览批准和公开权利清单均通过；没有批准时不得渲染发布母版。

### 第六步：制作、预览和交付

1. 从 `NarrationLock + audio/alignment.json` 生成 STORYBOARD。
2. 加载模板包六个文件，不从模糊词语重新猜风格。
3. 在 `1920x1080` composition 中接入顶层 `<audio class="clip">`。
4. 字幕、镜头、人物姿态和动效 cue 全部绑定 alignment。
5. 运行标准检查命令；它会执行 HyperFrames strict check，并把 composition digest、文件数量、build receipt 和顶层音频契约写入正式 JSON 回执：

```powershell
npm.cmd run video:check -- --project <project-id>
```

检查通过后必须存在 `qa/hyperframes-check.json`；只有终端日志、截图或旧的 `.log` 文件都不能替代该回执。
6. 在 Studio 中交付最终预览；用户批准后记录门禁：

```powershell
npm.cmd run video:approve-preview -- `
  --project <project-id> `
  --reviewer <name> `
  --check-evidence <qa/hyperframes-check.json>
```

7. 若人工听审或公开权利仍未完成，只能生成明确标记的 `internal-review`；全部发布门禁通过后才运行 HyperFrames render 生成公开母版。
8. 对 MP4 做完整解码、分辨率、编码、响度、黑帧、静音和字幕核验。

## 6. 固定项与可变项

| 固定，不得自行改变 | 每个视频可以变化 |
|---|---|
| 横屏 `16:9 / 1920x1080 / 30fps` | 文稿内容和视频总时长 |
| 人物区、内容区、字幕区合同 | `host.left` 或 `host.right` 完整换边 |
| 默认浅杏橙；暖桃灰只能显式选择 | 语义场景类型和关键词内容 |
| 字幕最多两行，底部固定轨道 | 标题、字幕的具体断句 |
| 每个 beat 一个主要关系 | 合法范围内的强调色角色 |
| 默认 replace，不累积元素 | 人物姿态按语义变化 |
| 8 秒最多两次姿态切换 | 具体时机由 alignment 决定 |
| 禁止 PPT 翻页、卡片墙、HUD 和贴纸堆 | 官方 registry/motion 的具体组合 |

字幕颜色不是随机多彩。它使用当前配色中的 `ink / muted / primary / secondary` 语义角色：正文用 `ink`，辅助信息用 `muted`，当前重点用 `primary`，少量第二焦点用 `secondary`。

## 7. 触发方式

以下表达会触发固定模板复用：

- `按固定人物讲解模板做`
- `使用 persondesign 人物模板`
- `按 modern-ip-host-explainer 做`
- 在项目任务中明确写 `style_id: modern-ip-host-explainer`

以下表达只触发通用 AutoVideo 流水线，不自动选这个人物模板：

- `按 AutoVideo 流水线做`
- `按 HyperFrames 视频流水线生成`
- `创建一个新视频项目`
- `用这段口播和参考图做视频`

继续已有项目：

```powershell
npm.cmd run video:status -- --project <project-id>
```

然后读取 `hyperframes-workflow-kit/prompts/00-继续项目.md`，只执行状态允许的下一阶段。

## 8. 失败和返工规则

| 变化或失败 | 处理方式 |
|---|---|
| 文稿改了一个字 | 新 NarrationLock；旧音频、alignment、字幕和时间线全部失效 |
| 更换声音、语速或最终 WAV | 重新试听、对齐、字幕、scene duration 和 motion cue |
| 只改背景配色 | 必须是已保存配色；重新做项目静帧/探针与对比度检查 |
| 人物与内容重叠 | 按 LAYOUT_CONTRACT 修 zone，不通过缩小所有元素掩盖问题 |
| 元素越积越多 | 前一组 `compact/exit` 后再进入下一组 |
| 风格包源文件哈希变化 | 旧 template-lock 检查失败；发布新模板版本，不原地冒充旧版本 |
| 音频权利未确认 | `rights-status=needs-review`，只允许内部审片版；公开母版和发布阻塞 |
| HyperFrames check 失败 | 修 composition 后重跑；不得改用已弃用的 `inspect` |
| 只想换一个局部画面 | 定点修改对应 scene，再做 check、定点截图和最终预览 |

## 9. 当前模板的验收证据

- 风格注册：`style-library/STYLE_REGISTRY.md`
- 模板入口：`style-library/styles/project/modern-ip-host-explainer/`
- 视觉与动效规范：`frame.md`、`STYLE_GUIDE.md`、`LAYOUT_CONTRACT.md`
- 人物姿态：`POSE_MANIFEST.json`
- 配色：`PALETTE_VARIANTS.json`
- 使用和触发：`USAGE.md`
- 验证记录：`VALIDATION-persondesign-modern-host-probe.md`
- 项目审批：`hyperframes-workflow-kit/projects/persondesign-modern-host-probe/style-selection.json`

风格库验证命令：

```powershell
npm.cmd run styles:validate
npm.cmd run test:video-workflow
```

当前批准结论是：模板规则可复用；样片 composition 仅作验证证据；后续每个项目通过 template-lock 和 audio-handoff 接入，再按新内容生成自己的 STORYBOARD 和 HyperFrames composition。

## 10. 接手智能体最短清单

1. 读根目录 `AGENTS.md` 和本文件。
2. 运行 `video:status` 与 `video:template-status`。
3. 校验 NarrationLock，不改批准文案。
4. 加载模板包全部六个文件。
5. 没有批准的最终音频和 alignment 时，不进入全片 composition。
6. 没有任务/项目探针批准时，只做静帧和 3-8 秒 probe。
7. 没有最终 Studio 预览批准时，不渲染发布母版。
8. 所有素材写入 AssetManifest，所有时间从最终 WAV 派生。
