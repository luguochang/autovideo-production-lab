# AutoVideo 批量内容入口与创意配方 SOP

> 状态：工程基线 v1，2026-07-20  
> 最终编排：HyperFrames  
> 固定品牌壳：`modern-ip-host-explainer@1.0.0` + `light-apricot`  
> 配音：CosyVoice 预设 14 / 中文女 / `speed=1.03` / `seed=7`

## 1. 不可变基础

- 画幅固定为 `16:9 / 1920x1080 / 30fps`。
- 背景固定为 `#F2DFC7`，原 Q 版人物固定在 `host.left`。
- 内容只在 `content.right` 变化，镜头作用域只能是 `content-world-only`。
- 字幕轨固定，展示 NarrationLock 的精确口播；主画面只提炼关键词、关系、证据和界面状态。
- 动效配方、图片、图标、代码表面和 SFX 不能替换人物、背景或整套视觉主题。

## 2. 标准链路

```mermaid
flowchart LR
  A["素材登记"] --> B["适用性诊断"]
  B --> C["Evidence 人工批准"]
  C --> D["Outline Planner"]
  D --> E["Narration Writer"]
  E --> F["Oralizer"]
  F --> G["Duration 文本预算"]
  G --> H["final Claim / 来源核验"]
  H --> I["人工审稿批准"]
  I --> J["NarrationLock"]
  J --> K["CosyVoice + alignment"]
  K --> L["cue 级视觉计划"]
  L --> M["动效配方 + 本地素材 + 稀疏 SFX"]
  M --> N["3-8 秒短探针"]
  N --> O["工作台局部覆写"]
  O --> P["HyperFrames 全片编译"]
  P --> Q["strict check + Studio 五项终审"]
  Q --> R["内部审片或公开母版"]
  R --> S["参数、失败和反馈回写"]
```

## 3. 新内容的批量入口

工作台“新建项目”已经支持粘贴文字、单文件、目录、口播音频和 URL+本地快照五种不可变
入口。输入按内容寻址冻结到
`content/workbench-intakes/<project-id>/input/content-intake/submissions/<sha>/`，记录逐文件
SHA-256、来源、跳过项和自动路线。相同输入幂等复用，凭据文件、敏感 JSON、符号链接和
路径逃逸会被拒绝。

原始笔记不能直接传给 `video:new`。标准 CLI 与工作台使用同一条六阶段内容链：

```powershell
npm.cmd run content:register -- --id <intake-id> --materials <materials-dir>
npm.cmd run content:diagnose -- --intake content/intakes/<intake-id> --route materials
npm.cmd run content:extract -- --intake content/intakes/<intake-id> --draft <evidence.json>
npm.cmd run content:approve-evidence -- --intake content/intakes/<intake-id> --reviewer <human-name> --confirm-human
npm.cmd run content:outline -- --intake content/intakes/<intake-id> --target-seconds <seconds> --draft <content-outline.json>
npm.cmd run content:write -- --intake content/intakes/<intake-id> --draft <script.draft.json>
npm.cmd run content:oralize -- --intake content/intakes/<intake-id> --draft <spoken-rewrite.json>
npm.cmd run content:fit -- --intake content/intakes/<intake-id>
npm.cmd run content:verify -- --intake content/intakes/<intake-id>
npm.cmd run content:approve -- --intake content/intakes/<intake-id> --reviewer <human-name> --confirm-human
npm.cmd run content:lock -- --intake content/intakes/<intake-id> --duration <estimate>s --platform douyin --audience <audience> --outcome <outcome>
```

`extract / outline / write / oralize` 都可把 `--draft <json>` 替换为 `--run-codex`。模型输出始终只是候选；Evidence 必须先经独立人工批准，最终口播还必须再次人工批准。`fit` 只评估时长，不改字；`verify` 在它之后重验事实和观点边界。旧 `content:rewrite / content:review` 只为既有五件套 intake 保留兼容，不再作为新项目生产入口。批准后，文字、材料、任一中间 artifact、人工回执或 SHA-256 变化都会使链路失效。

提示词或模型升级前先运行锁定的本地回归：

```powershell
npm.cmd run content:regress
npm.cmd run content:promptfoo:offline
```

第一条执行确定性中文合同检查；第二条使用 Promptfoo `0.121.19` 分别读取六阶段本地 hash-bound 候选，不调用模型。工作台和独立 CLI 均已串联六阶段，CLI 还会冻结 Evidence 人工批准回执并支持按当前 artifact 恢复。当前六阶段共享同一条中文合成 seed，离线结果 `6/6`、模型调用 `0`，但 `humanReviewedGoldCases=0`；它不能证明真人口播质量已经成熟，也不能形成 NarrationLock 批准。

真人回归样本单独进入金标队列，不与生产批准混用：

```powershell
npm.cmd run content:gold -- register --case <human-gold-case.json> --candidate <candidate.json>
npm.cmd run content:gold -- review --case-id <id> --reviewer <真实姓名或审核编号> --decision accepted --naturalness 1-5 --meaning 1-5 --oral-delivery 1-5 --screen-compression 1-5 --confirm-human
npm.cmd run content:gold -- status
```

登记要求 `datasetClass=human-gold-candidate`、真实用户材料来源和模型候选回执；评分只证明提示词回归，不批准 NarrationLock、配音或公开发布。

正式项目在 `input/content-intake/` 冻结以下凭据：

- `sources.json`
- `material-suitability.json`
- `evidence.json`
- `evidence-approval.json`
- `content-outline.json`
- `script.draft.json`
- `spoken-rewrite.json`
- `content-duration-fit.json`
- `claim-source-review.json`
- `content-approval.json`

多个项目进入制作链时，在工作台“批次管理”中选择项目、目标步骤和优先级后创建批次。默认选择“自动运行到下一人工门”：各项目可以处于不同阶段，调度器只执行各自第一个未完成步骤，机器步骤和人工门所需的候选 artifact 可以连续生成；artifact 进入 `needs-review` 后批次停为 `waiting-human`。人工确认后再次运行同一批次继续。输入合同包含 content-intake payload SHA、项目配置、阶段执行设置和全部上游批准产物 SHA；同一冻结输入的活动任务或未变化完成产物可复用，未冻结旧路径的素材登记不复用。reservation 保证并发请求只创建一个逻辑任务，失败按 `retryLimit` 有界重试，job 输出 SHA 以实际落盘 artifact 为准。批次不会跳过项目自己的内容批准、NarrationLock、权利、动效探针或 Studio 审片门禁；运行、暂停和恢复都保留项目级任务与 `runHistory` 回执，运行中 `finishedAt` 为空。

## 4. cue 级创意合同

每个 cue 使用以下机器字段，不再只依赖 `visualVariant` 猜画面：

```json
{
  "visualType": "diagram",
  "motionRecipeRefs": [
    {
      "libraryId": "knowledge-explainer",
      "libraryVersion": "1.0.0",
      "recipeId": "diagram-build",
      "version": "1.0.0",
      "params": {
        "entrance": "wipe",
        "handoff": "compact-up",
        "enterSeconds": 0.7,
        "handoffSeconds": 0.5,
        "staggerSeconds": 0.09
      },
      "sourceCueIds": ["cue-004"]
    }
  ],
  "assetRefs": [],
  "carrierPayload": null,
  "sfxRefs": [],
  "provenanceRefs": ["motion-library:knowledge-explainer@1.0.0"]
}
```

新项目会把这些字段写入 shot manifest、Graph IR 的 `cueDirectives`、production manifest 的 `cueDirectives` 和 composition source-map。旧 V1-V5 项目仍可编译，但编译器会记录兼容默认值；后续正式修改应通过工作台覆写生成显式合同。

## 5. 工作台局部调整

在“HyperFrames 全片制作”或“Studio 最终预览”节点打开“画面微调”，选择 cue 或画面对象后可以修改：

- 主画面关键词
- 旧版细节版式 `visualVariant`
- 版本化高级动效配方
- 本地有界结构化主载体（数据、代码、界面状态）
- `.media/manifest.jsonl` 中已登记且有来源/许可的视觉素材
- `.media/manifest.jsonl` 中已登记的语义 SFX
- 人物姿态；人物位置仍固定在左侧

配方候选项会显示“需短探针”。保存后的失效范围：

| 修改 | 从哪里重新审核 |
|---|---|
| 文字、姿态、旧版细节版式 | `full-production` |
| 动效配方 | `style-probe` |
| 只改主载体数据 | `full-production` |
| 更换主载体 adapter | `style-probe` |
| 更换主载体证据回执 | `rights-clearance` |
| 图片、图标或 SFX | `rights-clearance` |

所有覆写保留版本、作者、原因、基线 SHA-256、失效目标和撤销历史。NarrationLock、字幕和 alignment 不允许在这里修改。

## 6. 本地素材和克制 SFX

工作台“画面微调”现在可以从中央素材库导入已登记的 SFX。导入会把文件复制到当前正式项目的 `.media/audio/sfx/`，写入项目自己的 `manifest.jsonl`，并校验 SHA-256、provider 和 license receipt；重复导入同一内容只复用已有 canonical asset ID，不复制第二份文件。中央目录和验证命令如下：

```powershell
npm.cmd run assets:validate
```

素材库当前只开放有明确语义的轻量音效：`sfx-click-soft`、`sfx-pop`、`sfx-chime`、`sfx-whoosh-short`、`sfx-error`。生成候选计划时，resolver 会依据 semantic role 和 motion recipe 兼容性确定性选择音色，并只把实际需要的文件导入项目 `.media`。这个“自动匹配”只解决找文件和绑定问题：计划仍是 `candidate`、默认静音，必须通过人工 SFX 审核；动效配方仍受 lifecycle gate 约束。

媒体统一使用 media-use，不在 `style-library/` 建第二套音频缓存：

```powershell
node C:/Users/90603/.agents/skills/media-use/scripts/resolve.mjs --doctor
node C:/Users/90603/.agents/skills/media-use/scripts/resolve.mjs --type sfx --intent "click-soft" --local-only --provider bundled.sfx --project hyperframes-workflow-kit/projects/<project-id> --json
```

正式规则：

- 静默是默认值，每个声音必须对应一个语义事件。
- 最多每分钟 6 次，任意两次至少相隔 2.4 秒，不允许重叠。
- 鼠标点击只用于真实界面状态提交，不用于每个字幕、人物姿态或 cue 边界。
- SFX 增益不得高于 `-10 dB`；当前工作台默认 `-18 dB`，不压低旁白。
- SFX 触发点必须落在对应 cue 内。
- 未登记、本地文件缺失、SHA-256 漂移、无 provider 或无 license receipt 时，编译必须失败。
- 同一 `type + sha256` 只能保留一个 canonical asset ID；不要把同一个音色复制成多个别名。

当前 30 秒样片重新生成后有 2 个候选事件：`connector-draw -> sfx-whoosh-short`、`state-change -> sfx-click-soft`。两个文件均已导入项目 `.media` 并具备 SHA、provider 和 license receipt；`plan/semantic-sfx-plan.json` 仍是 `candidate/defaultSilent`，两项人工决定均为 pending，因此不会进入 HyperFrames 时间线。

批量项目用以下命令提出候选音效；命令不会批准计划，也不会播放或写入 shot：

```powershell
npm.cmd run video:sfx-plan -- --project hyperframes-workflow-kit/projects/<project-id> --write
```

在工作台“HyperFrames 全片制作 → 画面微调 → 稀疏语义音效”逐项试听并选择“保留”或“静音”。只保存进度不会入轨；所有候选都有决定后，“批准选中音效”才可用。工作台会生成绑定候选计划 SHA 的 `plan/semantic-sfx-plan.review.json`，冻结原候选快照，并只把保留项写入 `approved` 计划；compiler 仍会再次核对 cue、asset ID、SHA、provider、license、时间间隔和每分钟密度。点击“退回重新审核”会恢复完整候选，所有声音重新静音。

端到端回归必须覆盖中央注册读取、项目导入、自动绑定、人工逐项决定、review receipt 和正式 compiler。删除 `semantic-sfx-plan.review.json`，或篡改其中任一 decision、候选快照或 SHA，编译必须失败；仅把计划字段手工改成 `approved` 不算人工批准。

## 7. 编译和验证

```powershell
npm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/<project-id>
cd hyperframes-workflow-kit/projects/<project-id>/production/hyperframes
npx.cmd --yes hyperframes@0.7.64 check . --strict --json
```

旁白使用完整媒体的 intrinsic duration；SFX 使用显式短时长。所有 `<audio>` 都是主 composition root 的直接子元素，由 HyperFrames 管理播放和 seek。

本轮兼容验证位于 `experiments/E05-batch-contract-probe/`：

- 旧 V5 计划成功编译为 18 scene / 46 cue。
- `experiments/E07-semantic-sfx-compile/` 证明候选计划的 6 个事件被逐条诊断为 `plan.not-approved`，成片 HTML 中 semantic SFX 数量仍为 0。
- `keyword-handoff`、`diagram-build`、`comparison-split` 已真实进入 DOM 和 source-map。
- HyperFrames `0.7.64` strict check 通过。
- lint、runtime、layout、motion 均为 0 错误 / 0 警告。
- 对比度检查 `63/63` 通过。

首条真实 recipe 探针位于 `experiments/E06-keyword-handoff-probe/`：

- 精确 8 秒同口播窗口，固定 Q 版人物、`#F2DFC7`、`host.left / content.right / caption`。
- 旧关键词只收拢为历史上下文，辅助信息先退出，新关键词从同一锚点进入；人物不横跳。
- 实际安装并适配官方 `caption-weight-shift`，素材、实现、still、MP4 和 check 全部哈希绑定。
- HyperFrames `0.7.64 check --strict --snapshots --at-transitions` 为 0 finding，MP4 为 1920x1080 / 30fps / 8 秒。
- lifecycle `assess` 只返回 `missing-visual-review`，所以 `keyword-handoff` 仍是 `candidate`，没有被技术检查自动晋级。

## 8. 发布门禁

`final-preview` 不再允许使用通用“批准”接口。人工公开终审只能走专用五项清单，并校验当前 preview receipt 与 composition digest。没有人完整观看 Studio 时间轴、没有人工听审或权利未清时，只能输出 internal review，不能生成公开母版。

专用五项终审现在可以从有效的 `needs-review` Studio 会话直接创建 hash-bound
`human-review` 回执；不再依赖预先存在的 autonomous final-preview 回执。`4/5` 项确认仍会
拒绝，通用批准接口仍会拒绝。

## 8.5 工作台文字入口实际实现（2026-07-20）

工作台的新建项目现在把粘贴文字默认标记为 `needs-oralization`，只有明确选择 `approved-script` 才会保留原文路线。资料包和待口播化文字会依次经过 `material-suitability`、`evidence-ledger`、`spoken-rewrite`、`claim-source-review`、`script-review` 和 `content-approval`；`NarrationLock` 只消费同一 `content/intakes/<id>/` 下的七份文件和 `content-approval/v2` 哈希回执。内容链由 `workflow-console/lib/content-approval-bridge.mjs` 原子冻结，重复批准幂等，口播文字与改写结果不一致时拒绝创建锁稿。

这条工作台链已经有隔离回归测试；音频输入仍使用现有 ASR/人工听审适配，尚未自动转换为同一套文字内容合同。

## 8.6 动效使用与反馈回写（2026-07-20）

`retrospective` 现在从实际编译的 `production/hyperframes/data/source-map.json` 提取 effective recipe，按 project ID 与 composition digest 幂等写入 `style-library/motion-library/usage-log.jsonl`，并在项目内保存 `review/motion-usage.json`。初始 shot manifest 与 override 后结果不一致时，以 composition source-map 为准。工作台“复盘与模板回写 -> 动效复盘”可以逐条记录 `reuse / tune / hold / retire-candidate`、适用主题、失败现象和备注，反馈按 revision 追加到 `feedback-log.jsonl`，项目内保存最新 `review/motion-feedback.json`。

反馈记录不直接修改 `knowledge-explainer.lifecycle.json`。即使选择“可直接复用”，仍需对应探针、项目审批和生命周期 apply；“建议进入退役评估”也只形成证据，不会自动让历史项目失效。

## 8.7 工作台探针审片（2026-07-20）

“风格探针 -> 探针审片”现在直接扫描本地 recipe 探针，播放 MP4、显示关键帧联系表、strict check、不变量审计和官方复用来源。人工结论必须覆盖排版、文字、seek、Q版人物、字幕、结尾可读、官方复用、`#F2DFC7` 背景和 `content-world-only` 九项检查。通过要求九项全真；退回必须留下问题说明。

回执追加写入 `style-library/motion-library/probe-review-log.jsonl`，并在每个探针目录保存 `review/probe-human-review.json`。回执绑定配方定义、MP4 和联系表哈希，所以重渲染不会继承旧通过结论。正式证据可回填视觉 gate，早期探针只保留独立回执；两者都不会自动执行生命周期 apply。

## 8.8 cue 级语义动效推荐（2026-07-21）

工作台“HyperFrames 全片制作 → 画面微调 → 高级动效配方”不再只提供无解释的下拉框。读取模型会对每个 cue 使用实际口播、屏幕摘要、scene role、Graph IR、claim、视觉素材 role 和最新 revision 的动效反馈进行确定性匹配，返回：

- 推荐 recipe、最多三个备选和命中的 semantic trigger；
- 推荐理由、显式 fallback 原因和缺失输入；
- `inputReady`、`lifecycleState`、`lifecycleBlocker` 与 `productionReady`；
- 固定 `modern-ip-host-explainer / light-apricot / #F2DFC7 / host.left / caption` 的品牌外壳策略。

“使用建议”只把 recipe 和原因预填到人工 override。输入不齐或 recipe 仍为 `candidate/probe-passed` 时按钮禁用；保存仍走原有 override 校验、revision、stale propagation 和 lifecycle gate。历史反馈只提供有界评分，不能把 recipe 自动晋级，也不能为了视觉多样性改选语义不匹配的配方。

## 8.9 正式视觉素材入库与载体防误用（2026-07-21）

内容登记中的 raster 图片现在会在 `video-init` 后进入正式项目 `.media/images/intake/`。桥接会验证 content-intake submission、逐文件 SHA/bytes、路径边界和项目身份，并将原 submission 回执冻结到正式项目；相同图片重复运行只复用 canonical asset ID。`.media/manifest.jsonl` 和 `.media/index.md` 同步写入，索引不再落后于机器清单。

渲染与 QA 新增主载体合同：

- `keyword/diagram` 的图标只能作为角标，Graph IR 不得被图标替换；
- `evidence/device/data/code/object` 必须有对应角色的真实主素材，图标不能让门禁通过；
- media comparison 要么使用 0 张图保留文字对比，要么恰好使用 2 张主图；
- 用户图片默认权利待核，不自动入画；候选 adopted 也只代表“导入并预填”，不是 override、compiled 或 retained。

官方 `data-chart/app-showcase/code-diff/code-highlight` 的视觉语法已适配为三个本地 bounded adapter；完整源 SHA、Apache-2.0 许可、本地字体和 adapter 版本进入编译回执。Graph IR/ELK 继续作为 diagram 主载体。技术探针均通过 strict check，但 mock 不会进入正式编排，真实 claim/code/device 仍需逐项目绑定证据和权利。

## 9. 仍未完成

当前目标不能标记为全部完成，剩余规模化缺口包括：

- 当前 30 秒样片的配音技术 QA 通过，但 CosyVoice 中文 frontend 删除换行、按约 80 字内部拆句并直接连接，导致自然段呼吸和“模型、接口”切点不自然。先实现内部 utterance preflight、按原始三个自然段生成、420-650ms 显式 gap 和独立 A/B；用户批准新版 WAV 后再全量重做 alignment、字幕、场景和渲染。详见 [`20-AutoVideo未完成项实施方案与开源复用调研.md`](20-AutoVideo未完成项实施方案与开源复用调研.md)。
- 中英混读仍缺生产级发音门禁。现有 `pronunciation/v1` 能扫描拉丁词、把全大写缩写改为空格分隔，并要求普通英文词听审，但没有区分 locale/IPA/CMU，也没有强制原句上下文探针。下一步实现 `pronunciation/v2 + context probe + fail-closed`：`API` 等缩写逐字母，`demo` 等普通英文词按完整英文发音；预设 14 仍不准时才评估独立的 CosyVoice 3 CMU 音素候选，不把该能力冒充成当前已完成。
- 20 项目批量回归、每分钟成本、主载体命中率和素材跨项目复用率看板；当前批次决策与有效 override 统计口径已修正，但还没有足够真实样本。
- OCR/字幕语义终审，以及标题、简介、标签的工作台编辑和真实平台发布回执录入。
- 对每一种候选动效配方分别完成 3-8 秒探针并晋级，不能因为合同存在就视为已批准。
- 由用户完成当前 2 项 semantic-sfx-plan 的真实听审选择，再做一次 approved 全片编译、试听和 Studio 回归；自动解析与防篡改回归已经通过，但没有代替用户批准。
- 用真实资料目录跑通第一批 `content.right` 图片/界面/物件入库并人工确认权利；桥接合同已完成，但当前 30 秒样片仍没有视觉主素材。
- 把项目内 bounded adapter 技术探针与 `experiments/E*-*probe` 正式 lifecycle 探针分轨展示；前者不得晋级配方，E17/E18 旧 evidence 仍需 canonical 化。
- 将 `verified evidence.receipt` 从格式校验升级为项目 claim/source/media 实体与 SHA 的强绑定；device 仍需第一组真实冻结界面状态。
- 将工作台的 cue 编辑进一步升级为 generated/effective/override 三栏差异视图。

这些缺口不影响当前内部审片技术闭环，但会阻止“无人值守批量公开发布”的完成声明。
