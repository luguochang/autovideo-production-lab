# AutoVideo 标准生产 Runbook

> 版本：v1.1  
> 默认输出：`16:9 / 1920x1080 / 30fps`  
> 默认配音：CosyVoice 预设 14，中文女，`speed=1.03`，`seed=7`，FP32，`stream=false`  
> 最终合成：HyperFrames

## 1. 标准链路

```mermaid
flowchart LR
  A["素材登记 / 观点台账"] --> B["已审文字稿"]
  B --> C["NarrationLock"]
  C --> D["CosyVoice 最终 WAV"]
  D --> R["技术 QA + 工作台逐段/完整听审"]
  R --> U["human-listening 正式批准"]
  U --> E["alignment + 精确字幕"]
  E --> S["subtitle-qa 机器门"]
  S --> F["storyboard + shot manifest + Graph IR"]
  F --> G["风格探针"]
  G --> V["visual-variety-qa 机器门"]
  V --> X["semantic SFX 候选与审核"]
  X --> H["production manifest"]
  H --> I["确定性 HyperFrames 编译"]
  I --> J["strict check + Studio 预览"]
  J --> K{"用户终审和公开权利通过?"}
  K -->|"否"| K1["internal-only 审片版"]
  K -->|"是"| K2["公开母版"]
  K1 --> L["媒体 / 字幕 / 抽帧 QA"]
  K2 --> L
  L --> M["封面 + 哈希清单 + 复盘"]
```

三种入口分别是资料包、已审文字稿和口播音频。三条路线都必须在 `NarrationLock` 汇合；后续音频、字幕、分镜和画面只能消费锁稿与最终 WAV。

## 2. 工作台操作语义

| 动作 | 结果 | 下游处理 |
|---|---|---|
| 生成草案 | 执行当前步骤适配器并保存 rN 产物 | 已有下游自动标记 `stale` |
| 编辑产物 | 保存人工覆盖、校验 JSON、归档上一版 | 记录 override 回执并使下游失效 |
| 重新生成 | 归档旧产物并按当前输入/提示词/工具重跑 | 不能静默覆盖人工锁字段 |
| 批准 | 只允许 `needs-review` 且依赖已批准的步骤 | 记录批准人、时间和批准范围 |
| 退回修改 | 清除当前批准并重新开放编辑 | 受影响下游全部 `stale` |
| 新增步骤 | 在项目级插入自定义人工门或检查项 | 不修改全局目录；删除时保留事件回执 |

机器回执不可手工改绿；必须修输入并重新生成。`stale` 产物不能直接批准。

### 2.1 机器门与人工门的边界

| 门禁 | 自动检查什么 | 不自动替代什么 | 通过后的下游 |
|---|---|---|---|
| `subtitle-qa` | 当前 `audio/alignment.json` 与 `captions/narration.zh-CN.srt` 的 cue 数量、时间轴、逐字文本、CPS、重复/空字幕；输出 `qa/subtitle-qa.json` | 字幕语义、断句自然度、专名读法、画面上额外文字的 OCR/人工核对 | 可进入视觉规划；`humanSemanticReview` 仍为 `needs-review`、`ocrReview` 仍可能为 `unavailable` |
| `visual-variety-qa` | 当前 storyboard、shot manifest、Graph IR 的视觉载体/动效配方分布、连续重复、关键词占比、屏幕摘要压缩、图解绑定和资产引用；输出 `qa/visual-variety-qa.json` | 动效是否舒服、人物是否稳定、转场是否闪烁、素材审美、SFX 是否合适、探针和 Studio 全片审片 | 可进入正式编译前的规划门；`humanReview` 仍为 `needs-review`，动效生命周期批准仍单独控制 |
| `semantic-sfx-review` | 候选 cue、语义角色、时间、增益、最小间隔、每分钟上限、本地文件完整性、SHA、来源和许可 | 音效是否自然、是否抢旁白、耳机/扬声器听感和公开发布批准 | 真人批准可进入正式混音；creator-delegated 模拟只允许进入 `internal-only` composition，并固定阻断公开发布 |

这两个门禁的 `machine.status=passed` 只表示当前输入满足确定性合同，不表示成片已完成或可公开发布。机器报告必须与输入文件 SHA 绑定；任何输入变化都会让报告失效并传播 `stale`。

## 3. 正式执行顺序

1. 在工作台登记输入路径、平台、时长、声音路线和发布权利范围。
2. 完成素材/观点登记；资料路线必须先形成 Evidence Ledger。
3. 在“文稿确认”中编辑并批准，创建不可静默改字的 NarrationLock。
4. 生成预设 14 音频并通过技术 QA；在工作台播放完整终轨、按需逐段复核，完成五项清单和全部待审术语。
5. 听审回执达到 `ready-for-approval` 后仍须由真人正式批准；只有绑定当前文本、音频和回执哈希的 `audio/approval.json` 才能放行 human-listening 门。
6. 对最终 WAV 生成 alignment 和 SRT；字幕只能来自 NarrationLock 精确 cue。
7. 生成 visual plan、Graph IR 和 shot manifest；待视觉多样性门通过后再固化 production manifest。
8. 对同一口播窗口生成 3-8 秒探针；未批准不得进入全片。
9. 运行 `visual-variety-qa`；未通过或回执与 storyboard/shot/Graph IR SHA 不一致时，不得进入正式编译。
10. 生成 semantic SFX 候选计划；默认静音。真人逐项审核，或在已有 creator-delegation 时执行明确标记的内部模拟；任一方式都必须生成哈希绑定的候选快照和审核回执。
11. 运行确定性编译器，应用 `overrides/overrides.json` 和已审核 SFX plan 后生成 14 场景或项目记录的场景数。
12. 运行 HyperFrames strict check，检查片头、场景中点和片尾。
13. 在 Studio 完整预览；内部自主审片必须标为 `internal-autonomous-review`，不能写成用户批准。
14. 预览 digest 未变化时才允许高质量渲染。内部自主审片只能输出 `internal-review`；公开母版还要求真人全片审片、人工听审和权利清单通过。
15. 对 MP4 做完整解码、规格、响度、峰值、黑帧、静音、冻结和抽帧检查。
16. 生成封面、SRT、正式 QA、AssetManifest、delivery manifest 和 RETROSPECTIVE。

### 3.1 听审台操作

1. 播放完整最终音轨，并用分段播放器定位可疑句；分段试听不能替代完整播放。
2. 完成五项清单：完整播放、术语读法、停顿节奏、爆音/削波、分段衔接。
3. 对 pronunciation 中所有 `needs-listening-review` 项逐一选择接受或返工。必须先区分字母缩写和完整英文单词：`API` 应逐字母，`demo` 应作为完整英文单词 `/ˈdɛmoʊ/`（CMU `D EH1 M OW0`）试听，不能读成 `D E M O`。标准项目当前为 `Coze`、`Dify`、`Codex`、`Claude Code`、`Agent`、`Demo`、`Magic`、`Engineering`、`30K`、`Token` 共 10 项；普通英文词和品牌词应优先使用原句上下文探针，不只听孤立单词。
4. 保存后确认 `audio/listening-review.json` 的 `bindingStatus` 在 SOP 状态中为 `valid`。`in-progress` 和 `ready-for-approval` 都保持 `humanListening=blocked`。
5. 仅在五项与术语全部完成后点击 human-listening 正式批准。批准写入 `audio/approval.json` 并绑定听审回执哈希；不要手工修改批准文件。
6. 如果文本和 WAV 哈希未变，批准后只重跑 SOP 状态及 delivery QA/manifest/retrospective 元数据，不重新生成音频、alignment、字幕、composition 或 MP4。

## 4. 常用命令

```powershell
npm.cmd run video:new -- --id <project-id> --narration <path> --ratio 16:9 --duration <duration> --platform <platform>
npm.cmd run video:apply-template -- --project <project-id> --style modern-ip-host-explainer
npm.cmd run video:status -- --project <project-id>
npm.cmd run video:template-status -- --project <project-id>
npm.cmd run video:sfx-plan -- --project hyperframes-workflow-kit/projects/<project-id> --write
npm.cmd run video:sfx-review -- status --project <project-id>
npm.cmd run video:sfx-review -- simulate --project <project-id>
npm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/<project-id>
npm.cmd run video:file-qa -- --project <project-id> --video renders/<internal-review.mp4> --label <qa-label>
npm.cmd run video:sop-status -- --project <project-id>
npm.cmd run video:maturity-audit
npm.cmd run video:scale-evidence -- status --project <project-id>
npm.cmd run video:scale-evidence -- draft --project <project-id>
npm.cmd run video:scale-evidence -- simulate --project <project-id>
npm.cmd run console:build
npm.cmd run console:start
```

`draft` 只读取冻结回执并标注每个指标的来源；`simulate` 写入独立的 `receipts/scale/internal-simulation.json`，用于创作者委托的内部演练，不计入真人成熟度。正式 `recovery --confirm-human` 会复用可证明的自动值，只要求补充仍为 `unknown` 的真人时间或运行遥测。未知值不得按 `0` 处理。

`video:sfx-review -- simulate` 只用于已有项目绑定 creator-delegation 回执的内部审片。它不会调用播放器，并固定生成 `humanReviewPerformed=false / publicReleaseBlocked=true`；没有委托、文件校验失败或回执哈希漂移时必须失败关闭。`video:file-qa` 只读取已渲染文件，执行 FFprobe、完整视频/音频解码、`loudnorm`、静音和逐帧黑帧扫描，不请求麦克风或输出声音。

`npm run pipeline` 已阻断，因为它属于旧的 `9:16 + Edge TTS + Remotion` 原型。确需历史复现时显式使用 `npm run pipeline:legacy`。

## 5. 返工矩阵

| 修改项 | 必须重做 |
|---|---|
| 文稿任意字符 | 新 NarrationLock、TTS、alignment、字幕、分镜、composition、QA、render |
| speaker / speed / seed / 最终 WAV | 音频 QA、alignment、字幕、所有时间驱动画面、QA、render |
| alignment 或 SRT 任意内容/时间变化 | 重新生成 `subtitle-qa`，并重做受影响的视觉规划、`visual-variety-qa`、composition、QA、render；旧字幕门禁不可复用 |
| 仅新增 human-listening 批准，文本/WAV 未变 | 更新 `audio/approval.json`、`audio-handoff.json`、SOP 状态、delivery QA/manifest/retrospective；不重做音视频 |
| 只改风格或配色 | 项目探针、composition、strict check、Studio 预览、render |
| 只改 scene/cue/object、视觉载体、动效配方、Graph IR 或 supporting asset | 对应 override/规划产物、重新运行 `visual-variety-qa`、重新编译、strict check、定点抽帧、Studio 预览、render |
| 只改 SFX 文件、候选决策、时间或增益 | 重新生成/审核 semantic SFX plan、编译、strict check、Studio 预览、render 和文件级媒体 QA；NarrationLock/TTS 可保持 |
| 只改权利台账 | 权利门、发布决策和交付清单；不自动改画面 |

## 6. 放行标准

内部审片包需要：确定性编译成功、strict check 通过、Studio 内部预览有 digest、MP4 完整解码通过、SRT 精确重建通过、封面和逐文件哈希清单存在。

公开发布还必须额外满足：人工完整听审、`audio/approval.json` 的 human-listening 正式批准、声音与人物素材权利凭据、事实/观点边界、字幕/OCR 终审、用户最终审片批准。`listening-review.json.status=ready-for-approval` 本身不能放行。任何一项未完成都保持 `publicReleaseBlocked=true`。

`rights-clearance` 新生成的清单必须是 `autovideo-publication-rights/v2`。每个素材的 `assetBindings` 绑定实际文件，每个 `cleared` 项的 `evidence` 至少绑定一份本地冻结凭据，并声明 `kind=license-file / rights-attestation / terms-snapshot / source-receipt`。只改文字状态、填写网页链接或引用开源代码许可证都不足以公开放行；素材或凭据 SHA 变化后必须重新审权。旧 v1 只兼容内部审片，不具备公开发布资格。

`audio-align` 之后、`visual-plan` 之前执行 `subtitle-qa`。它复用锁定的 `alignment.cues` 和 `captions/narration.zh-CN.srt`，生成 `qa/subtitle-qa.json`，检查 cue 数量、时间轴、逐字文本、CPS、重复和空字幕。机器状态 `passed` 只代表这些确定性检查通过；回执中的 `humanSemanticReview=needs-review` 和 `ocrReview=unavailable` 仍必须分别完成，不能用机器通过替代人工字幕语义审校或屏幕文字 OCR。

屏幕文字 OCR 在 `qa-review` 之后、`screen-text-review` 内执行，不写回 `subtitle-qa`。工作台会先生成 `qa/screen-text-frame-set.json`，随后自动调用 RapidOCR；也可重跑：

```powershell
npm.cmd run video:ocr -- --project <project-id>
```

只有与当前 composition、HyperFrames check、frame-set 和逐帧 SHA 完全一致的 `qa/ocr-report.json`，且 `status=passed`、`unresolvedCount=0`，才能选择 `ocr-assisted`。`unavailable`、`unresolved` 或 `stale` 均必须显式走人工模式；两种模式都要求逐帧真人批准。

`style-probe` 之后、`production manifest` 之前执行 `visual-variety-qa`。它读取当前 `plan/storyboard.json`、`plan/shot-manifest.json` 和 `plan/graph-ir.json`，检查至少三类视觉载体（按镜头数调整最低值）、非关键词载体占比、同类/同配方连续重复、屏幕摘要是否压缩、diagram 是否绑定 Graph IR，以及 asset-backed 载体是否有冻结资产。机器通过后仍需逐配方探针批准和 Studio 全片人工审片；没有这两项，不能把 `candidate` 动效晋级为可生产。

正式样例 `batch-smoke-30s-20260720` 的两个机器回执均已生成并通过：

- [`qa/subtitle-qa.json`](../hyperframes-workflow-kit/projects/batch-smoke-30s-20260720/qa/subtitle-qa.json)：6/6 cue，文本和时间轴全部 exact，CPS 全部通过，`humanSemanticReview=needs-review`，`ocrReview=unavailable`，`publicReleaseEligible=false`。
- [`qa/visual-variety-qa.json`](../hyperframes-workflow-kit/projects/batch-smoke-30s-20260720/qa/visual-variety-qa.json)：6 个镜头，keyword 3 / diagram 2 / comparison 1，3 种配方，最大连续重复为 1；该规划期回执仍有“无冻结 supporting asset”警告，`humanReview=needs-review`。后置 semantic SFX 计划已单独完成内部模拟审核并进入 composition，不回写旧规划期机器回执。
- [`plan/semantic-sfx-plan.review.json`](../hyperframes-workflow-kit/projects/batch-smoke-30s-20260720/plan/semantic-sfx-plan.review.json)：2/2 本地冻结 cue 进入内部 composition，`approvalScope=internal-autonomous-review / humanReviewPerformed=false / publicReleaseBlocked=true`。
- [`qa/internal-review-sfx-simulated-20260723.json`](../hyperframes-workflow-kit/projects/batch-smoke-30s-20260720/qa/internal-review-sfx-simulated-20260723.json)：新内审 MP4 完整文件级 QA 通过，`-13.19 LUFS / -1.28 dBFS`、持续黑帧 `0`。

该样例仍不是完成成片：含两个稀疏音效的内部审片 MP4 已通过文件级解码、响度、峰值和黑帧 QA，但没有进行人工播放听审；当前口播的自然段呼吸和“模型、接口”语义切点仍需真人 A/B 判断。三个实际动效配方仍为 `candidate`，真人 Studio 全片预览、视觉审片、公开母版交付 QA 和公开权利均未完成。完整实施方案见 [`20-AutoVideo未完成项实施方案与开源复用调研.md`](20-AutoVideo未完成项实施方案与开源复用调研.md)。

## 7. 当前未完全标准化

- 资料包路线和口播音频路线仍缺真实金标项目。
- CosyVoice 内部 utterance preflight、420-650ms gap-aware 合并器和不覆盖正式 WAV 的 A/B 听审流尚未实现；现有 batch/逐段试听可以复用。
- WhisperX 异常/粗对齐和 MFA 锁稿精对齐尚未接入主适配器；MFA 必须先通过中文金标、OOV/术语词典和 TextGrid 转换验证。RapidOCR 屏幕文字适配器已接入，但当前片逐帧人工终审和跨项目 OCR 回归仍未完成。
- Studio 选择对象自动写回 overrides、局部重算、冲突合并和回滚仍待实现。
- `subtitle-qa`、RapidOCR screen receipt 与 `screen-text-review` 合同已接入，但 WhisperX/MFA 精确对齐、当前片字幕语义终审和屏幕文字逐帧人工结论仍未完成；`visual-variety-qa` 已接入，semantic SFX 的内部模拟入轨与文件级 QA 已完成，但 supporting asset 首批库存、SFX 真人听审选择和动效配方人工晋级仍未完成。
- 批量队列、失败续跑和基础指标已经接入；`reports/AUTOVIDEO_MATURITY.json` 现在统一计算 20 项目恢复、P50/P95、人工分钟、CPU/GPU、模型调用、重试、override、素材/recipe 复用和返工率。当前仍缺 20 个带真人 `receipts/scale/` 回执的真实项目，因此成熟度保持 `not-mature`。
- 规模化真人回执用 `video:scale-evidence` 生成。命令只负责读取项目、计算 SHA 和失败回滚；`--confirm-human` 只能在真人实际完成对应复核后使用，内部模拟和 Agent 输入不得代替。

这些缺口影响“无人值守批量公开发布”，不影响当前标准文字稿路线生成可复现的内部审片包。
