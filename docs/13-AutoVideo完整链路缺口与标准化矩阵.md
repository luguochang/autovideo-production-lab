# AutoVideo 完整链路缺口与标准化矩阵

> 适用项目：`demotext-standard-delivery-v2` 及后续讲解类视频
>
> 基线：16:9 / 1920x1080 / 30fps；CosyVoice 预设 14（中文女、FP32、stream=false、speed=1.03、seed=7）；当前验证 HyperFrames 0.7.66。
>
> 当前结论：历史 V2 基线已跑通过内部审片交付链路；当前 30 秒样片 `batch-smoke-30s-20260720` 也已跑通到机器验证的内部审片 MP4。实际使用的三个 `candidate` 动效配方通过显式、项目内、仅内审 fallback 授权进入本片，因此不得据此晋级全局模板或解除公开发布阻塞。`SOP_STATUS.json` 是机器状态的唯一依据，本文是缺口和执行规则的解释层。状态同步器会重新计算当前 composition 摘要，并校验 HyperFrames check、build receipt、motion lifecycle 和内审 MP4 QA 的哈希绑定；仅有文件存在不再算“完成”。
>
> 所有未完成项的实施步骤、验收、风险、优先级和开源复用边界见 [`20-AutoVideo未完成项实施方案与开源复用调研.md`](20-AutoVideo未完成项实施方案与开源复用调研.md)。

## 1. 标准总链路

```mermaid
flowchart LR
  A[素材登记] --> B[事实/观点台账]
  B --> C[大纲与口播稿]
  C --> D[人工审稿]
  D --> E[NarrationLock]
  E --> F[CosyVoice 14 或原声/授权 VC]
  F --> G[技术 QA + 人工听审]
  G --> H[最终 WAV 冻结]
  H --> I[ASR / WhisperX 对齐]
  I --> I2[字幕机器 QA + 逐 cue 人审]
  I2 --> J[Storyboard + Graph IR]
  J --> K[模板/风格探针]
  K --> L[权利清单]
  L --> M[HyperFrames 全片编译]
  M --> N[check / snapshot / 结构 QA]
  N --> N2[屏幕文字关键帧人审 / OCR 辅助]
  N2 --> O[Studio 全片审片]
  O --> P[渲染内部审片版]
  P --> Q[媒体 / 字幕 / OCR / 语义 QA]
  Q --> R[平台母版与交付包]
  R --> S[复盘与模板升级]
```

任何发生在 `NarrationLock` 或最终 WAV 之前的文字、读法、速度、seed 或 speaker 变化，都必须沿时间依赖链重新生成；只改变审批回执或交付说明时，不应重做时间相关产物。

### 1.1 新增机器门禁与人工边界

| 门禁 | 机器合同与绑定 | 人工仍必须确认 | 失效条件 |
|---|---|---|---|
| `subtitle-qa`（`audio-align` 后、`visual-plan` 前） | 读取锁定的 `audio/alignment.json`、`captions/alignment-validation.json`、`captions/narration.zh-CN.srt`；检查 cue 数量、时间轴、逐字一致、CPS、重复和空字幕；回执保存三份输入 SHA | 字幕语义、断句、专名和中英混读；画面文字 OCR/可读性。当前回执固定 `humanSemanticReview=needs-review`、`ocrReview=unavailable` | 任一 alignment、validation 或 SRT 改变；回执缺失、项目 ID 不符或 SHA 不符 |
| `subtitle-review`（`subtitle-qa` 后） | 专用工作台逐 cue 清单；批准回执绑定 NarrationLock、alignment、validation、SRT、subtitle QA 和审校稿 SHA；禁止通用批准和一键全选 | 每个 cue 的语义、术语、断句、标点和时间可读性 | 任一绑定 SHA、cue ID 集合或审校稿变化；人工退回后重开 |
| `visual-variety-qa`（`style-probe` 后、正式编译前） | 读取 `plan/storyboard.json`、`plan/shot-manifest.json`、`plan/graph-ir.json`；检查视觉类型/配方分布、关键词连续重复、屏幕摘要压缩、diagram Graph IR 绑定、asset-backed 载体引用；回执保存三份输入 SHA | 动效节奏、人物稳定、转场是否闪烁、素材审美、SFX 取舍、逐配方探针和 Studio 全片审片；当前回执固定 `humanReview=needs-review` | 任一 storyboard、shot manifest 或 Graph IR 改变；配方生命周期决策或 supporting asset 改变而未重跑；回执绑定不匹配 |
| `screen-text-review`（`qa-review` 后、`final-preview` 前） | 专用工作台逐帧清单；frame-set 记录 composition/check/图片哈希、时间点、cue/scene 和抽帧理由；默认 `manual`，只有完整工具回执才能使用 `ocr-assisted` | 字幕安全区、遮挡、屏幕文字准确、对比度、换行溢出、重复信息；Studio 仍需全时间线观看 | composition、check、字幕人审、frame-set、任一帧或 OCR 回执变化 |

两者的 `machine.status=passed` 只代表确定性检查通过。它们不会自动批准 `human-listening`、动效生命周期、Studio 全片审片、字幕语义审校、OCR 或公开发布权利；`SOP_STATUS.json` 只有在绑定有效时才把对应机器里程碑记为 `passed`。

## 2. 当前项目状态

| 环节 | 当前状态 | 已有证据 | 还差什么 |
| --- | --- | --- | --- |
| 素材登记 | 工作台入口已完成 | 粘贴文字、单文件、目录、口播音频、URL+本地快照均冻结 SHA-256 receipt | 在线网页抓取、PDF 语义抽取和长视频内容适配仍需单独接入 |
| 事实与观点台账 | 部分完成 | `claim-ledger.json`、`evidence.jsonl` 合同 | 真实资料包金标回归；数字 claim 的外部证据与“作者观点”标签 |
| 提示词链 | 工作台与独立 CLI 生产合同、六阶段回归基础层完成 | `Evidence → 人工批准 → Outline → Writer → Oralizer → Duration assessment → final Verifier` 独立 artifact/紧邻 SHA/九件中间证据归档；evidence v2 结构化行范围、claim/support、保护词和英文台账；六主题四类变异共 24 条合成失败矩阵；Promptfoo `0.121.19` 六阶段离线 `6/6`、模型调用 `0` | 20–30 条真人中文金标 |
| 审稿与 NarrationLock | 已完成 | approved script、`NarrationLock.json`、失效传播 | 新项目需要真实跑一条材料路线和一条音频路线 |
| CosyVoice 14 | 技术完成，当前样片自然度待返工 | 最终 WAV、recipe、音频 QA；已确认当前项目是单 WAV，但 CosyVoice 前端删除换行后按约 80 字内部拆句，runner 直接 `torch.cat`，会在“模型、接口”附近形成错误语义切点 | 先做按三个自然段预切、内部 utterance 预检、420-650ms 显式呼吸间隔的 A/B；用户批准新版后再替换最终 WAV并全量重做 alignment/字幕/时序；speaker 商业发布权利仍待核 |
| 音频对齐 | 部分完成 | 46 cue、alignment 哈希绑定 | WhisperX 词/字级对齐；中文专名、中英混读、数字误差指标 |
| 分镜与流程图 | Graph IR 与可编辑布局合同已接入全片编译 | scene/shot/Graph IR、ELK `graph-layout`、production manifest SHA 绑定、最多三个语义组的布局消费 | 还需内容无关的远程规划重试/降级、React Flow 图解编辑器和场景级快速预览 |
| 模板与风格 | 已完成（本项目） | template lock、still/probe、style review | 模板跨项目回归；人物姿态联系表人工确认 |
| 创意素材与 SFX | 自动解析、人工审核和编译回执链已完成，库存待扩充 | `.media` 强制 SHA/provider/license、同哈希去重；5 个真实 SFX、8 个 Lucide ISC 语义图标；`video:sfx-plan --write` 会按 semantic role 和 recipe 兼容性从中央注册库确定性匹配，仅导入实际需要的 SFX，并写入 resolved binding；计划仍保持 `candidate/defaultSilent`。工作台逐项保留/静音，批准回执绑定候选快照与 SHA；compiler 缺失或遇到篡改回执会失败 | `content.right` 的真实图片/UI/物件首批库存；用户真实 SFX 听审后的 approved 全片回归；media-use 在线目录或受控图片 ingest；用真实批次验证采用率、驳回原因与素材缺口是否有决策价值 |
| 动效库复盘 | 语义推荐和生命周期生产 gate 已接入，人工晋级待完成 | cue 级 matcher 消费 narration、scene role、Graph IR、asset role、claim 和最新反馈，返回推荐、备选、命中原因、缺失输入和 lifecycle blocker；工作台只能预填，不会自动保存或批准。matcher 对八类 recipe、fail-closed、确定性和语义多样性有回归；full-production 仍按 lifecycle ledger SHA 和逐 recipe access 强制阻断；`reuse/tune/hold/retire-candidate` 反馈不会自动晋级 | 用户完成 E06/E15/E16/E17 人工视觉结论；对实际使用的 `keyword-handoff`、`diagram-build`、`comparison-split` 完成逐 recipe 项目批准；更多候选探针；两项目批准后才可晋级模板 |
| 权利清单 | v2 机器合同完成，真实公开凭据阻塞 | `publication-rights/v2` 自动登记 source/voice/template/`.media`/`AssetManifest`，资产与本地凭据逐项 SHA 绑定；audio handoff、SOP 和标准包重复验证；v1 仅内部兼容 | speaker、人物姿态、字体/图片/音乐/SFX 的真实可发布凭据和权利所有者确认 |
| HyperFrames 全片 | 当前 30 秒样片已完成内审级验证 | 当前样片 31.37s、2 scenes、6 cues，strict check 与内审 MP4 收口均通过；`keyword-handoff`、`diagram-build`、`comparison-split` 仅获项目内 internal-only fallback | 用户完成 Studio 全片审片；三个配方经过跨项目验证后才可晋级全局模板 |
| 人工微调 | 工作台结构化覆盖、三值来源与原子保存已完成 | scene/cue/object 选择器、generated/override/effective 对照、字段来源、expectedRevision 并发拒绝、替代/撤销历史、确定性重编译和 stale 传播 | Studio 内直接拖动后的自动差异捕获与回写 |
| 正式证据同步 | 已完成安全刷新合同 | 工作台按钮先显示影响确认；刷新按前次正式回执 SHA 分类 unchanged/imported/changed/removed/conflict，保留项目设置、自定义步骤、本地编辑和 production overrides；新增/变化只进入 `stale/evidence-only`；批准绑定 artifact SHA；字幕与视觉 QA 会复验当前输入哈希；连续刷新幂等 | 不可变内容寻址 refresh receipt 和独立长期事件归档仍可增强；当前固定 current receipt 配合项目事件保留最近审计 |
| 文本人工复核 | 工程合同、RapidOCR 适配器与工作台已完成；当前样片待真人执行 | `subtitle-review` 逐 cue 清单、`screen-text-review` hash-bound frame-set、RapidOCR 逐帧文字/置信度/坐标、显式 `manual/ocr-assisted`、stale 失效和专用批准接口；未到达的屏幕复核返回字幕人审、HyperFrames QA 和 frame-set 三类结构化阻塞 | 当前样片逐条字幕审校和逐帧画面文字结论；OCR 机器通过仍不得替代人工，manual 回执不得显示成 OCR 通过 |
| 媒体 QA | 已完成（内部） | ffprobe、解码、黑帧、冻结、静音、响度、峰值；新增 `subtitle-qa` 机器字幕检查和 `visual-variety-qa` 机器视觉分布检查 | 全时间线人工审片、平台码率/封面规则；机器回执和关键帧人审均不等于 Studio 全片审片或发布批准 |
| 交付包 | 已完成（内部） | internal-review MP4、SRT、封面、manifest、复盘 | `master.mp4` 公开母版和发布前人工门禁 |
| 批量生产 | 批次 API 与视觉候选计数已接入，跨项目回归待补 | 持久化批次实体、项目选择、阶段、优先级、运行/暂停/恢复、任务指标 API 与工作台面板；批次返回视觉候选决策、采用和驳回计数 | 20 项目跨路线回归；成本/素材命中率、视觉候选采用率和 recipe 复用率仍需真实生产数据 |

工作台还提供发布中心，严格区分 `production`、`internal-review-package`、
`public-master-candidate` 和 `published`；只有与视频 SHA-256 绑定的发布回执才能显示为
“已发布”。`final-preview` 专用五项终审已支持从有效的 `needs-review` 会话直接产生
hash-bound `human-review` 回执，通用批准接口仍不能绕过该门禁。

### 2.1 正式样例机器结果（不得误读为成片完成）

`batch-smoke-30s-20260720` 当前已生成两个新增 QA 回执：

| 回执 | 机器结果 | 人工/发布边界 |
|---|---|---|
| `qa/subtitle-qa.json` | `passed`；6/6 cue 数量一致，逐字文本和时间轴 exact，CPS 全部通过，无机器错误/警告 | `humanSemanticReview=needs-review`；`ocrReview=unavailable`（PaddleOCR 未安装）；`publicReleaseEligible=false` |
| `qa/visual-variety-qa.json` | `passed`；6 镜头，keyword 3 / diagram 2 / comparison 1，3 种配方，最大连续同类/同配方/keyword-only 均为 1 | 有“无冻结 supporting asset”和“无 semantic SFX”警告；`humanReview=needs-review`，仍需逐配方探针与 Studio 全片审片 |

因此，当前样例已是可播放、机器可验证的内部审片包，但不是可公开交付成片：内部媒体 QA 已完成；人工配音听审与自然度返工、逐配方正式生命周期批准、字幕/屏幕文字人审、全片预览、公开交付 QA 和权利清单仍未完成，公开发布保持阻塞。

### 2.2 2026-07-21 工程验收记录

- 工作台全量测试 `122/122` 通过，planning contract（含 cue 级动效 matcher）`40/40`、production compiler（含 SFX 与视觉载体合同）`43/43`、风格库合同 `199/199`、素材库 `153/153` 通过；前端生产构建和 SOP 状态回归通过。
- 字幕/屏幕文字专用 API 已覆盖完整人工审校顺序；通用“标记批准”不能绕过逐条字幕和逐帧画面复核。
- OCR-assisted 批准绑定 OCR 回执文件 SHA；OCR 文件在批准后发生任何变化，旧批准立即失效。
- “重开审校”会先把正式批准复制到 `qa/history/`，再删除当前批准；项目 ID、批准范围或证据绑定被修改时，批准不会继续生效。
- 浏览器实机验收确认：先点 `Fit View` 后，人工节点可直接进入专用审校页；重复点击不会跳回配置页；未到达的屏幕文字复核显示三类结构化阻塞，控制台无错误。
- 工作台“高级动效配方”现在显示当前 cue 的推荐、备选、语义原因、缺失素材和生命周期阻断；“使用建议”只预填 override，仍需人工保存并重新经过探针、生命周期和全片失效链。
- SFX 集成回归真实执行中央注册、项目导入、自动绑定、人工逐项决定、hash-bound review receipt 和 compiler；删除或篡改审核回执都会失败。当前样片的 `connector-draw` 与 `state-change` 已解析到本地素材，但仍是静音候选。
- 当前 `batch-smoke-30s-20260720` 为 `fullComposition=verified`、`technicalVideoGenerationReady=true`、`releasePhase=internal-review-package`；同时仍为 `formalReadyForComposition=false`、`readyForFinalRender=false`、`publicReleaseBlocked=true`。本次工程验收没有生成公开母版或代替任何真人批准。

### 2.3 机器状态的最小证明链

`fullCompositionVerified` 必须同时满足：

```text
current composition digest/file count == HyperFrames check digest/file count
build receipt SHA-256 == HyperFrames check buildReceiptSha256
production manifest motion decision == current lifecycle ledger + exact recipe set
build receipt motion access == authorized for every effective recipe
internal-review: internal-review MP4 / render receipt / check / build / decode / ffprobe / cover / 8 sampled frames are hash-bound by qa/internal-review-delivery.json
public master: final-preview digest/file count == current composition
public master: visual-review digest == current composition，并且发布抽帧 SHA-256 当前有效
public master: master.mp4 SHA-256 == delivery QA outputSha256
public master: delivery manifest integrity == verified，且 manifest 中的视频 SHA 与 delivery QA 相等
```

内部审片证明链和公开母版证明链分开计算。缺少后一组时，工作台仍可显示 `internal-review-package`，但只能把公开状态标为 `pending` 或 `present-unverified`，不能显示为公开发布完成。

### 2.4 视觉素材入库与主载体合同（2026-07-21）

- 工作台登记的 `.png/.jpg/.jpeg/.webp` 会先留在不可变 content-intake submission；创建正式项目时再次校验 submission ID、逐文件 SHA、大小、路径边界和 content-addressed 目录，再复制到 `.media/images/intake/`。
- 正式项目保存 `input/content-intake/submission.json` 与 `visual-media-ingestion.json`。素材 ID 使用内容 SHA 派生，同一 `type + sha256` 只保留一个 canonical ID；默认 `rightsStatus=needs-review`，且 `autoAttachToShots=false`。
- `.media/manifest.jsonl` 与 `.media/index.md` 已使用同一个补偿写入入口。当前 30 秒样片的索引已从错误的 1 项修复为真实的 3 项：1 个 voice、2 个 SFX。
- 新增 `visualType x asset type x role x cardinality` 合同。Lucide icon 只能作为 supporting icon，不能满足 `evidence-image/device-surface/data-proof/code-surface/object-metaphor` 的主载体要求；diagram 加图标后仍优先渲染 Graph IR，不再把小图标放大为主画面。
- 正式 compiler 与 `visual-variety-qa` 都会复核该合同；comparison 使用媒体时必须恰好有两张主图，零主图时继续使用文字对比载体。
- 候选采用接口改为先完成媒体导入，再写 adopted feedback；导入失败不会留下虚假的“已采用”决定。采用仍只预填人工微调，不等于已绑定、已编译或最终保留。
- 动效使用记录改为读取实际编译的 `production/hyperframes/data/source-map.json`，而不是初始 shot manifest。当前样片已记录 `keyword-handoff / diagram-build / comparison-split` 的真实 cue 集，`humanReview` 仍为 `pending`。

### 2.5 本地有界主载体适配器（2026-07-21）

- 已新增 `data-chart-bounded / code-surface-bounded / device-surface-bounded@1.0.0`。三者只渲染在 `content.right`，保留 `#F2DFC7`、`host.left`、固定字幕轨和本地 GSAP；没有直接挂载官方全屏 block。
- 适配器记录官方 registry 源文件完整 SHA-256 和 Apache-2.0 许可证 SHA。官方块中的 Google Fonts、CDN GSAP、`document.fonts.ready` 和运行时 DOM 测量均未进入适配实现；等宽字体改为仓库内冻结 WOFF2。
- 载体合同现在区分冻结图片、`verified` 结构化载体和 `illustrative-mock`。mock 必须在画面中标注，并且不能满足正式 primary carrier 门禁；icon 仍只能辅助。
- 三类 6.35 秒技术探针位于 `review/carrier-adapter-probes/`，均通过 HyperFrames `0.7.64 check --strict --samples 18 --at-transitions`。探针只证明本地、seek、布局和三阶段 `build -> focus -> resolve` 技术可用，`humanReview=pending`、`publicationApproval=false`。
- 工作台的 cue / object 微调新增结构化主载体编辑：选择适配器后填写数据、代码或状态字段；保存为 versioned override，可清空、撤销，并与 primary image 互斥。数据变化从 `full-production` 失效，适配器变化从 `style-probe` 失效，证据变化从 `rights-clearance` 失效。
- 正式 compiler 升至 `1.8.0`，会在 source-map 与 build receipt 中写入 adapter ID、版本、来源和许可回执。

## 3. 尚未完成的 P0 门禁

以下项目完成前，交付等级只能是“内部审片交付包”：

1. **先修最终配音自然度**：当前 WAV 的技术 QA 通过，但人工反馈“不像正常换气”。先生成独立 A/B，不覆盖当前 WAV；推荐按原始三个自然段预切、保证每段不被 CosyVoice 再拆、显式插入 420-650ms 呼吸间隔。用户批准新版后，旧 alignment、字幕、场景、动效、check 和渲染全部失效并重做。
2. **中英混读发音门禁**：锁稿中的拉丁 token 必须 100% 进入发音台账，并区分字母缩写、完整英文单词、品牌词、数字混合词和代码标识符。`demo` 目标为完整英文单词 `/ˈdɛmoʊ/`（`D EH1 M OW0`），不能读成 `D E M O`。普通英文词必须在原句上下文中生成短探针并逐项听审；当前预设 14 读不准时，才评估独立的 CosyVoice 3 CMU 音素候选。
3. **执行字幕与画面文字人工终审**：工程门和 RapidOCR 已落地，但当前样片还未由真人逐 cue、逐帧作结论。`subtitle-qa` 机器门通过后，必须完成 `subtitle-review`；HyperFrames check 后必须完成 `screen-text-review`。OCR `unavailable/unresolved/stale` 时显式使用 `manual`，不能把机器 `passed` 或人工 fallback 写成 OCR 通过。
4. **视觉多样性与动效配方项目批准**：`visual-variety-qa` 机器门已通过，但 Candidate A 只批准固定人物、浅杏色舞台和内容区方向，不等于批准全部动效配方。当前样片使用的 `keyword-handoff`、`diagram-build`、`comparison-split` 必须分别完成绑定定义哈希的 3-8 秒探针和显式项目批准，才能重新进入 full-production。
5. **最终配音人工听审**：完整播放最终 WAV，五项听审清单全部完成，术语逐项接受；批准后冻结听审回执与 WAV/NarrationLock 哈希。
6. **Studio 全片人工审片**：从头到尾观看同一 composition，确认音画同步、字幕可读性、人物/图解/转场、观点边界和结尾信息；五项检查全部完成后才能升级 `final-preview` 为 `human-review`。
7. **公开发布权利**：CosyVoice speaker、人物姿态、字体、图片、音乐和第三方界面逐项有来源、许可证、用途范围和凭据；没有凭据就只能 `internal-only`。
8. **事实与观点边界**：`99%`、`90%`、`30K` 等内容必须有外部证据，或在口播、字幕和交付说明中明确标为作者观点，不能以统计事实呈现。
9. **适配器真实证据**：技术 probe 的示意数据、示意代码和示意工作台不得进入正式画面。数据图必须绑定有效 claim/source 回执；code/device 必须绑定项目内冻结的真实来源。当前 receipt 的实体/hash 交叉验证仍需继续加强。

## 4. 尚未标准化的 P1 能力

### 4.1 内容生产

- 把长资料导入、引用定位、事实抽取和观点标注拆成可重放的阶段，禁止一次提示词直接生成成稿。
- 为数字、日期、产品名、中英混读、停顿和免责声明建立 20-30 条中文金标集。
- 用 Promptfoo 在模型、提示词或模板升级时做回归；失败样例进入项目复盘，不能直接升级全局规则。

建议的提示词链：

```text
Evidence Extractor -> Outline Planner -> Narration Writer
-> Oralizer -> Claim Verifier -> Duration Fitter -> Human Script Review
```

### 4.2 音频与对齐

- 文本路线和录音路线都必须输出同一份 `NarrationLock`、最终音频哈希和 alignment 合同。
- 推荐先用 WhisperX 做 ASR 异常/粗词级时间，再以准确 NarrationLock 驱动 MFA 作为最终精对齐候选；MFA 必须先通过中文金标、OOV/术语词典和 TextGrid 转换验证。若验证未通过，保留现有锁稿映射。phone/viseme 场景优先使用 MFA。
- 把对齐误差、字幕超框率、专名错误率纳入项目指标，而不是只看“有无 alignment.json”。

### 4.3 流程图与 HyperFrames 编译

- Graph IR 使用稳定 `graphId/nodeId/edgeId`；`graph-layout` 只允许改变有限坐标和正尺寸，节点/边集合与端点必须严格匹配 Graph IR。
- 工作台批准的 `graph-layout.json` 会物化到正式项目，写入 `production-manifest.bindings.graphLayout`，并由 HyperFrames 编译器消费；布局文件、manifest、composition source map 和 build receipt 均有 SHA 绑定。
- 当前右侧流程画面把节点坐标映射为最多三个可读语义组，保持 Q 版人物、字幕轨和浅杏色舞台不动。React Flow 专用图解编辑器仍未接入，当前编辑入口是受合同校验的 JSON。
- 已有确定性的 `storyboard + Graph IR + graph-layout + asset manifest -> HyperFrames` 编译器；下一步是建立跨文稿、跨模板回归，避免把 DemoText 专用 planning fallback 误当通用输入。

### 4.4 人工微调

每个可编辑对象都应有：

```text
stableId / sourceRevision / generatedValue / overrideValue
/ overriddenBy / overriddenAt / reason / affectedStages
```

修改后必须显示影响范围：只影响对象、当前 scene、整条时间轴，还是需要回到 NarrationLock。任何自动重生成都不能覆盖已锁定的人工字段；冲突时应阻止写入并提供回滚。

当前工作台已接入稳定 scene/cue/object ID 的结构化编辑器，支持屏幕文字、人物姿态和场景左右布局。每个字段独立保存为 `locks`；同目标同字段的新记录会替代旧记录，不同字段继续生效；撤销保留 `reverted` 历史。保存或撤销只让 `full-production` 及其交付下游失效，不重做 NarrationLock、TTS 或 alignment。操作合同见 [`15-工作台画面微调与Overrides.md`](15-工作台画面微调与Overrides.md)。

尚未完成的是 HyperFrames Studio 内直接拖动或改字后的自动差异捕获。当前 Studio 用于预览和定位，正式修改必须回到工作台“画面微调”写入 overrides。

### 4.5 质量与交付

QA 必须分成四层：

1. 结构：HyperFrames `check --strict`、尺寸、fps、时长、资源哈希。
2. 媒体：ffprobe、解码、黑帧、冻结、长静音、响度、True Peak。
3. 文本：锁稿重建、SRT/CPS、两行限制、专名、OCR、字幕语义。
4. 人工：完整时间线、观点边界、视觉层级、封面、平台首屏和发布权利。

机器 QA 通过不等于人工发布批准；所有报告都必须记录 scope（internal / public）和 reviewer。

## 5. 开源复用优先级

| 能力 | 优先复用 | 当前定位 |
| --- | --- | --- |
| 资料库与引用 | [Open Notebook](https://github.com/lfnovo/open-notebook) | 先作为资料整理层，不替代 Evidence Ledger |
| 外部研究 | [STORM](https://github.com/stanford-oval/storm)、[GPT Researcher](https://github.com/assafelovic/gpt-researcher) | 只产研究包和引用，不直接产最终口播 |
| 大规模文档检索 | [RAGFlow](https://github.com/infiniflow/ragflow) | 资料规模变大后再接入 |
| 工作流编排 | [LangGraph](https://github.com/langchain-ai/langgraph) | 用于审批、重试、批量队列，不替代当前项目合同 |
| 提示词回归 | [Promptfoo](https://github.com/promptfoo/promptfoo) `0.121.19` | 六阶段本地候选与独立配置已接；扩展跨主题失败矩阵与真人金标后进入正式 CI |
| ASR/对齐 | [WhisperX](https://github.com/m-bain/whisperX) | 首选增强适配器 |
| 精细口型对齐 | [Montreal Forced Aligner](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner) | 仅在需要 phone/viseme 时启用 |
| 流程图布局/编辑 | [ELK.js](https://github.com/kieler/elkjs)、[React Flow](https://github.com/xyflow/xyflow) | ELK 布局，React Flow 人工编辑 |
| 字幕终审 | [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) | Windows 人工终审工具 |
| OCR | [RapidOCR](https://github.com/RapidAI/RapidOCR) + [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) models | 已接本地 CPU 适配器和哈希回执；`subtitle-qa` 不伪装成 OCR，逐帧人工结论仍是发布门 |
| 视频与媒体 QA | [FFmpeg](https://github.com/FFmpeg/FFmpeg)、[PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | 交付媒体检查和意外切镜头回归 |
| 渲染 | [HyperFrames](https://github.com/heygen-com/hyperframes) | 唯一主渲染内核，当前验证版本锁定 0.7.66 |

复用顺序固定为：官方 HyperFrames preset/example → 官方 registry block/component → 官方 motion blueprint/rule → 已固定许可的 `vendor/` → 项目自定义代码。

## 6. 交付等级定义

| 等级 | 必须满足 | 可对外发布 |
| --- | --- | --- |
| 内部规划/探针 | 锁稿、模板、探针和规划合同有效 | 否 |
| 内部审片交付包 | 全片 composition、strict check、内部 MP4、媒体 QA、封面和 manifest | 否 |
| 发布候选 | 配音听审、Studio 全片人工审片、OCR/字幕/语义 QA、权利清单通过 | 需最终发布人确认 |
| 公开母版 | 发布候选 + 平台规格、封面、标题/简介/标签、上传前校验和最终发布回执 | 是 |

当前 `demotext-standard-delivery-v2` 的准确等级是：**内部审片交付包**。

### 6.1 `batch-smoke-30s-20260720` 主链路实跑（2026-07-21）

已跑通的内部视频生成主链路：

```text
NarrationLock + CosyVoice14 final WAV
-> alignment / SRT / subtitle machine QA
-> Candidate A planning + project-bound internal motion fallback
-> deterministic HyperFrames composition
-> HyperFrames 0.7.66 strict check
-> standard internal-review MP4
-> video:internal-review-qa
-> ffprobe + full decode + black-frame/loudness QA + hashed multi-time visual frames
-> workbench release center
```

实跑结果：

- `2 scenes / 6 cues / 31.37s` 的 composition 已重新编译，固定 `host.left`、`#F2DFC7`、`content.right` 和字幕底轨。
- strict check 覆盖 `143` 个中点与 transition 时刻，lint、runtime、layout、motion、contrast 均为 `0 errors / 0 warnings`。
- 内部审片视频：`renders/batch-smoke-30s-20260720-internal-review.mp4`；`1920x1080 / 30fps / H.264 + AAC / 31.744s / 952 frames`，全文件解码通过。
- 渲染回执：`renders/batch-smoke-30s-20260720-internal-review.receipt.json`；工作台发布中心状态为 `internal-review-package`，`internalReviewReady=true`，`publicMasterReady=false`。
- 内审收口回执：`qa/internal-review-delivery.json`；绑定当前 composition digest、build receipt、HyperFrames check、render receipt、MP4、cover、ffprobe、整片解码日志和 8 张抽帧 SHA-256。
- SOP 状态已达到 `fullComposition=verified`、`internalCompositionReady=true`、`technicalVideoGenerationReady=true`；`video:status` 独立显示 `workflowStage=storyboard-ready` 与 `releasePhase=internal-review-package`，不再把旧规划阶段误读成未生成视频。

以后每次内部审片 MP4 生成后统一执行：

```powershell
npm.cmd run video:internal-review-qa -- --project <project-id>
npm.cmd run video:sop-status -- --project <project-id> --check
npm.cmd run video:status -- --project <project-id>
```

尚未完成且不得自动生成的发布门：人工配音听审、字幕逐 cue 人工审校、成片屏幕文字复核、HyperFrames Studio 全片终审、素材/声音发布权利、正式交付媒体 QA 与平台发布回执。因此该视频是可观看的内部审片版，不是可直接发布的公开母版。

## 7. 批量化完成定义

当前批次操作已统一为以下 API/工作台动作：

```text
POST /api/batches                  创建批次（项目 ID、目标阶段、优先级）
POST /api/batches/:id/run           按依赖门禁入队
POST /api/batches/:id/pause         暂停尚未开始的任务
POST /api/batches/:id/resume        恢复暂停任务
GET  /api/batches/:id               返回状态、任务计数、耗时、重试、人工覆盖和视觉候选决策指标
```

暂停不会中断正在执行的 HyperFrames/CosyVoice 进程；当前任务完成后，尚未开始的任务保持暂停，恢复时重新经过 batch priority 和依赖检查。批次状态仍不能替代项目级人工审批，失败项目会逐项返回原因。

视觉候选指标分成两个口径：中央素材库指标只统计每个候选的最新 revision，用于计算真实采用率和按素材的跨项目表现；批次指标优先读取项目当前 `visual-asset-feedback.json`，没有正式回执时才按 `candidateDigest + candidateId + revision` 对事件去重。采用后改为驳回只计一次最新决定。人工覆盖指标直接读取当前有效 `overrides.json`，分别统计配方、媒体和文字覆盖，不再把所有历史变更事件都误算成 recipe 复用。两类指标都不是质量门，不能据此自动挂载素材、批准动效或解除发布阻塞。

批次接口和工作台还返回每个项目的门禁摘要：

```text
projectReadiness[]
  -> nextStageId / nextStageStatus / nextAction
  -> readyForComposition
  -> readyForDelivery
  -> compositionBlocker / deliveryBlocker
```

该摘要使用项目当前启用步骤和状态计算，严格区分“可进入全片编排”“可内部交付”和“可公开发布”。它只提供导航和下一步建议，不代替人工批准，也不会把 `publicationRights=needs-review` 误报为公开可交付。

只有以下条件同时满足，才可把系统标记为“可大面积铺开”：

- 文本、录音、资料三条输入路线各有一条真实金标项目通过。
- 每个项目能从 `video:new` 或工作台创建开始，重放到交付包，且不依赖隐藏手工文件。
- 所有人工门禁都有明确状态、回执哈希、批准人、时间和作用域。
- 任一上游修改都能准确传播 stale，任一人工覆盖都不会被自动生成覆盖。
- `subtitle-qa`、`subtitle-review`、`visual-variety-qa`、`screen-text-review` 都会绑定当前输入 SHA；alignment/SRT 变化必须重跑字幕机器门和逐 cue 人审，composition/check/frame/OCR 变化必须重跑屏幕文字人审，storyboard/shot/Graph IR 或资产/配方变化必须重跑视觉多样性门，不能复用旧报告。
- 失败可重试、可从最近阶段续跑，并能统计耗时、成本、返工率和人工驳回原因。
- 公开发布和内部审片不会共用同一个模糊的“完成”状态。
