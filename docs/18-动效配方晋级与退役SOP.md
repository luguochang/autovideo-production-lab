# 动效配方晋级与退役 SOP

## 1. 目的

本 SOP 管理知识讲解视频动效配方从实验到模板复用的全过程。它只管理
`content-world` 动效，不改变基础视觉壳。

唯一合法的正向链路是：

```text
candidate -> probe-passed -> approved-project -> promoted-template
     |              |                |                    |
     +--------------+----------------+--------------------+-> retired
```

没有 `force`、跳级或自动批准。`retired` 对新选择是终态。

## 2. 不可变约束

每次探针、项目批准和模板晋级都必须保持：

- 基础风格：`modern-ip-host-explainer@1.0.0`
- 背景：`#F2DFC7`，调色板 `light-apricot`
- 布局：`host.left`、`content.right`、固定 `caption` rail
- 相机：只允许 `content-world-only`
- 主持人：只使用 `POSE_MANIFEST.json` 中已批准且有来源记录的 Q 版资产
- 画幅：横屏 `16:9`，标准制作尺寸 `1920x1080`

任何一项发生变化，都应创建新的基础风格候选，而不是修改配方状态。

## 3. 权威文件

| 文件 | 作用 |
|---|---|
| `knowledge-explainer-v1.json` | 不可变配方定义，配方自身保持 `candidate` |
| `knowledge-explainer.lifecycle.json` | 当前状态、版本哈希、批准项目和回执索引 |
| `motion-recipe-lifecycle-evidence.schema.json` | 晋级或退役证据格式 |
| `motion-recipe-lifecycle-receipt.schema.json` | 门禁评估结果格式 |
| `motion-recipe-lifecycle.schema.json` | 生命周期账本格式 |

配方定义、官方 Registry、Blueprint 和 motion-rule 索引都由 SHA-256 绑定。
定义或目录发生漂移时，旧状态不能自动继承。

## 4. 状态与使用范围

| 状态 | 允许用途 | 禁止用途 |
|---|---|---|
| `candidate` | 3-8 秒探针 | 项目生产、模板默认选择 |
| `probe-passed` | 后续探针、申请项目批准 | 未批准项目、模板默认选择 |
| `approved-project` | 已记录批准的具体项目 | 其他项目、全局模板 |
| `promoted-template` | 新项目模板选择 | 无 |
| `retired` | 已有项目精确版本锁重放 | 所有新选择和新探针 |

## 5. Candidate 到 Probe-passed

1. 从同一份已批准 NarrationLock 和最终 WAV 中选择 3-8 秒窗口。
2. 按以下顺序寻找实现：官方 Registry、官方 Blueprint、官方 motion rule、项目本地代码。
3. 只有前三层确实不适用时才能写项目本地实现，并在证据中解释缺口。
4. 生成至少一张静帧和一个 3-8 秒 MP4；记录路径和 SHA-256。
5. 运行严格检查并启用 snapshots。必须为零 finding。
6. 输出不可变约束审计，逐项确认画幅、背景、Q 版主持人、三区布局和相机范围。
7. 绑定实际使用的主持人资产 manifest，而不是只写资产名称。
8. 人工检查排版、文字适配、seek 行为、主持人稳定、字幕稳定、终帧可读和官方复用可见性。
9. 在 `officialReuseObserved` 中绑定实际实现文件。仅在配方 JSON 中声明名称不算复用。
10. 先运行 `assess`。全部通过后才允许运行 `apply`。

```powershell
npm.cmd run motion:lifecycle -- assess --recipe <recipe-id> --to probe-passed --evidence <evidence.json> --receipt-out <assessment.json>
npm.cmd run motion:lifecycle -- apply --recipe <recipe-id> --to probe-passed --evidence <evidence.json> --receipt-out <applied-receipt.json>
```

`apply` 会先落盘回执并计算哈希，再原子更新账本。阻断评估不会修改账本。

## 5.1 工作台探针审片

在工作台打开“风格探针 -> 探针审片”。该页面扫描 `experiments/E*-*probe`，但只展示 `knowledge-explainer-v1.json` 中已登记的配方；目录名相似但配方未知的实验不会进入审片目录。

每次审片按以下顺序执行：

1. 播放完整 MP4，并拖动时间轴复查中间状态和 seek 行为。
2. 打开关键帧联系表，检查起始、语义交接和结尾停留状态。
3. 确认自动门禁：3-8 秒、MP4 和 contact sheet 存在、HyperFrames strict check 通过、品牌壳不变量通过、至少一个官方复用来源已绑定。
4. 人工逐项确认九项视觉检查：排版、文字适配、seek 行为、人物稳定、字幕稳定、结尾可读、官方复用可见、背景精确为 `#F2DFC7`、相机仅作用于 `content-world`。
5. 选择“继续审片”“人工通过”或“退回重做”。人工通过要求九项全为真；退回重做必须填写可执行的问题说明。
6. 保存后检查 `style-library/motion-library/probe-review-log.jsonl` 和探针目录内的 `review/probe-human-review.json`。

审核记录同时绑定 recipe definition SHA-256、MP4 路径与 SHA-256、contact sheet 路径与 SHA-256。配方定义变化或探针重渲染后，旧结论自动显示为失效，必须重新完整审片。

正式 `autovideo-motion-recipe-lifecycle-evidence/v1` 会回填 `probe.visualReview` 和 `probe.visual-review` gate；早期探针格式只保存独立人工回执，不会被伪装成正式生命周期证据。两种格式保存时都明确记录 `lifecycleMutationApplied: false`，因此工作台审片不会运行 `assess` 或 `apply`，也不会自动把候选配方放入项目生产。

## 6. Probe-passed 到 Approved-project

证据必须同时包含：

- 项目 ID
- 已批准、格式完整且哈希绑定的 style selection
- 已应用的 `probe-passed` 回执
- `source=human`、`scope=project` 的人工批准

批准只授权该项目。第二个项目必须单独批准，不能复用第一个项目的项目授权。

```powershell
npm.cmd run motion:lifecycle -- apply --recipe <recipe-id> --to approved-project --evidence <project-evidence.json> --receipt-out <project-receipt.json>
```

## 7. Approved-project 到 Promoted-template

模板晋级必须满足：

- 账本中已有至少两个不同项目的有效批准
- 跨项目视觉与语义回归通过
- 向后兼容检查通过
- 回归报告有路径和 SHA-256
- 模板负责人以 `source=human`、`scope=template` 批准

不要为了凑足数量复制项目 ID，也不要把同一项目的多个版本当作多个项目。

## 8. 退役

退役原因只能来自 schema 枚举，例如视觉、语义、确定性、无障碍、授权、官方来源移除、
新版本替代或模板不兼容。退役必须由人工批准，并明确替代配方；已晋级模板退役时替代项
不可为空。

退役后：

- 新探针、新项目和模板选择全部拒绝
- 只有 definition SHA-256 完全一致的旧锁可重放
- 不删除旧定义、回执或来源记录
- 修复后的实现必须使用新版本重新从 `candidate` 开始

## 9. E05 的定位

`experiments/E05-batch-contract-probe` 只证明批量编译契约能运行，不是动效探针：

- 时长 `239.678s`，超出 3-8 秒
- 未启用 snapshots
- 没有静帧和短 MP4 探针绑定
- 没有人工视觉评审
- 没有不可变约束审计和主持人资产 manifest
- 没有观察到实际安装或实现的官方 Registry/Blueprint/rule

因此 E05 必须保留为 `blocked` 回执，`keyword-handoff` 继续为 `candidate`。

## 10. E06 的定位

`experiments/E06-keyword-handoff-probe` 是第一条达到技术审片条件的 recipe 级探针：

- 时长 8 秒，使用同一冻结口播的 0-8 秒窗口和精确 8 秒本地 WAV。
- 固定 `#F2DFC7`、Q 版人物、三区布局和 `content-world-only`。
- 已安装并绑定官方 `caption-weight-shift` 实现文件；不是只在 recipe JSON 中声明名称。
- still、contact sheet、MP4、host AssetManifest、invariant audit 和 strict check 均有 SHA-256。
- `check --strict --snapshots --at-transitions` 为 0 finding，MP4 为 1920x1080 / 30fps / 8 秒。

当前 `lifecycle-evidence.draft.json` 的 `visualReview` 为 `null`。正式 assess 的唯一 blocker 是
`missing-visual-review`，因此状态必须继续保持 `candidate`。人工审片通过后，先回填九项视觉
检查，再重新运行 `assess`；不要直接运行 `apply`。

## 10.1 E15-E18 候选探针索引

以下探针已经完成技术验收，但都仍等待用户人工视觉审核；它们不能因为 strict check 通过就进入全片生产：

| 探针目录 | 配方 | 技术结果 | 当前状态 |
|---|---|---|---|
| `experiments/E15-diagram-build-probe` | `diagram-build@1.0.0` | 官方 `flowchart` + `svg-path-draw`，strict check 0 findings，8 秒 MP4 | `candidate` |
| `experiments/E16-comparison-split-probe` | `comparison-split@1.0.0` | 官方 `comparison-split` + `split-tilt-cards` + `scale-swap-transition`，strict check 0 findings，6 秒 MP4 | `candidate` |
| `experiments/E17-evidence-pivot-click-probe` | `evidence-pivot@1.0.0` | 本地工作台截图 + `parallax-unzoom` + `cursor-click-ripple`，strict check 0 findings，8 秒 MP4 | `candidate` |
| `experiments/E17-data-proof-probe` | `data-proof@1.0.0` | 官方 `data-chart` + `stat-bars-and-fills`，strict check 0 findings，8 秒 MP4 | `candidate` |
| `experiments/E18-code-proof-probe` | `code-proof@1.0.0` | 官方 `code-highlight` + `discrete-text-sequence` + `viewport-change`，strict check 0 findings，8 秒 MP4；早期回执由工作台兼容扫描 | `candidate` |

两个 E17 目录分别代表不同配方探针；后续新增实验应使用新的唯一目录 ID，避免把不同视觉载体混在同一份回执里。

## 11. 发布前验证

```powershell
npm.cmd run motion:lifecycle -- validate
npm.cmd run test:motion-lifecycle
npm.cmd run styles:validate
node --test style-library/tests/semantic-sfx-contract.test.mjs
```

发布前还应运行：

```powershell
npm.cmd run motion:lifecycle -- status --json
```

## 12. Full-production 生命周期门禁（2026-07-21）

Planning 可以在 `shot-manifest.json` 中保留 `candidate` 配方，让同一份计划继续驱动受限的短探针；这不构成全片生产授权。`production-manifest.json` 现在必须包含确定性的 `motionLifecycleAccess` 回执，并绑定 lifecycle ledger SHA-256、实际使用的配方集合和每个配方定义。

HyperFrames production compiler 只接受两类正式授权：配方已是 `promoted-template`，或 `approved-project` 中存在当前项目 ID 的批准记录。Candidate A 只批准基础画面壳，不会自动晋级或批准任何动效配方；工作台中的 `reuse`、`tune` 等反馈只是观察证据，也不会改变生命周期状态。

只有显式传入 `--internal-motion-fallback <request.json>` 时才允许内部降级。请求必须绑定当前项目，recipe ID 集合必须与计划实际使用集合完全相同，只能覆盖 `candidate` 或 `probe-passed`，并固定为 `internal-only`、`publicReleaseBlocked: true`。`retired`、未知配方、版本不匹配或定义哈希不匹配均不能使用该降级。

编译器会把 lifecycle ledger 复制进 composition，并把当前 ledger 哈希和逐配方准入决定写入 `composition-build.json`；`SOP_STATUS.json` 会再次复验。ledger 变化、recipe 集合变化、回执缺失或任一配方被拒绝，都会使旧 composition 失去 `verified` 状态。

当前 `batch-smoke-30s-20260720` 使用的配方仍是 candidate，所以不能重新进入 full-production。E19 `device-surface-tour` 与 E20 `object-metaphor` 已完成 3-8 秒技术探针、内部渲染和静默导入音频 QA，但仍缺真人九项视觉审片、`probe-passed` lifecycle 接受和显式项目批准。本文不会替代该人工决策，也不会修改全局 ledger。

逐项确认状态变化符合人工决策。对尚未完成真实探针和人工审批的仓库，所有八个配方都应
保持 `candidate`。
