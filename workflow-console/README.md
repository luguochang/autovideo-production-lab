# AutoVideo 生产工作台

这是 AutoVideo 的本地 React + Express 控制台。它会真实执行已接入的 Codex、CosyVoice、HyperFrames 和 FFmpeg 适配器，并持久化项目、产物、人工覆盖、审批回执与下游失效状态。不能直接双击源码 `index.html` 使用。

完整链路的状态解释、未完成门禁和批量化标准见 [`docs/13-AutoVideo完整链路缺口与标准化矩阵.md`](../docs/13-AutoVideo完整链路缺口与标准化矩阵.md)。

## 启动

在仓库根目录运行：

```powershell
npm.cmd run console:build
npm.cmd run console:start
```

默认打开 <http://127.0.0.1:3338/>；如果端口已有服务，使用 `AUTOVIDEO_CONSOLE_PORT` 选择空闲端口。健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3338/api/health
```

开发模式使用两个终端：

```powershell
npm.cmd run console:start
npm.cmd run console:dev
```

开发页面为 <http://127.0.0.1:3337/>，`/api` 会代理到 `3338`。

## 工作方式

### 复用本地素材

工作台“画面微调”中的“从本地素材库导入”会读取 `style-library/assets/ASSET_REGISTRY.json`，只允许导入有本地路径、SHA-256、provider 和许可证回执的冻结媒体。导入后文件会复制到当前 HyperFrames 项目的 `.media`，并通过媒体 ledger 校验；素材不会因此自动进入时间线，仍需绑定到具体 cue 并通过语义 SFX 审核。

中央目录检查：

```powershell
npm.cmd run assets:validate
```

- “新建项目”支持粘贴文字、单文件、目录、口播音频和 URL+本地快照；输入按内容寻址冻结，路线与来源路径随后只读。
- 任务队列持久化 queued/running/failed/completed 状态，支持取消请求、失败重试、浏览器刷新恢复和服务重启重新入队；冻结素材 payload SHA、阶段依赖 SHA、执行设置和实际输出 SHA 进入幂等回执，并发同键请求只创建一个逻辑任务。
- 点击流程节点，在“配置”中调整提示词、备注和已接入执行器。
- 在“产物”中编辑允许人工覆盖的 JSON、Markdown 或文本；机器 QA、锁稿和渲染回执只读。
- “重新生成”会归档上一版产物，并把已产出的下游标为“需重算”。`stale` 不能直接批准。
- “HyperFrames 全片制作”和“Studio 最终预览”的“画面微调”可以按稳定 scene/cue/object ID 覆盖屏幕文字、人物姿态、高级动效配方、本地视觉素材和克制语义音效。Q 版人物仍固定在左侧，配方只改变右侧内容世界。
- 普通文字/姿态调整从全片制作重算；动效配方调整会退回短探针；图片或 SFX 调整会退回权利清单。所有媒体必须来自 `.media/manifest.jsonl` 并带 SHA、provider 与许可回执。
- cue 级媒体选择会显示图片缩略图或 SFX 原生试听、来源、许可、SHA、尺寸/时长；只有 rights + integrity 都通过的登记项可保存。预览文件接口只接受 asset ID，不接受路径或远程 URL。
- 批量生成的 `semantic-sfx-plan` 在同一“画面微调”页逐项试听和审核：每个候选必须明确选择“保留”或“静音”，仍有“待定”时整份计划保持静音且不能批准。审核回执绑定候选计划 SHA；批准只把保留项写入 approved 计划并使全片制作失效，退回则恢复完整候选且重新静音。
- “复盘与模板回写”的“动效复盘”只展示当前 composition 实际使用过的配方。每条可以记录可复用、需调优、暂缓或建议退役，以及适用主题、失败现象和备注。反馈按 revision 追加到 `style-library/motion-library/feedback-log.jsonl`，并在项目 `review/motion-feedback.json` 保存回执；反馈本身不会绕过生命周期门禁自动晋级或退役配方。
- “风格探针”的“探针审片”会直接播放本地 3-8 秒 MP4、显示关键帧联系表和自动技术门禁，并要求逐项完成人物、背景、字幕、文字、seek、结尾停留、官方复用和内容相机范围等九项人工检查。结论按 revision 写入 `style-library/motion-library/probe-review-log.jsonl`，同时绑定配方定义、MP4 和联系表哈希；任一文件重生成后旧结论自动失效。这里不会执行 lifecycle apply，早期探针也只保存独立回执。
- 同一页的“动效库生命周期”固定对账全部 8 个 recipe，显示技术就绪、真人审片、项目批准、生产资格和下一动作。API 在审片、探针验收和项目批准后立即刷新；recipe 漏项、定义漂移或官方绑定失效时合同失败关闭，不会显示为可生产。
- 左侧“批次管理”可以把多个项目加入同一目标阶段，设置优先级并运行、暂停或恢复；任务、失败、重试、人工覆盖和素材导入均保留持久化统计。
- “自动运行到下一人工门”只运行已接入适配器，生成到 `needs-review` 后停为 `waiting-human`；运行回执只在终态写 `finishedAt`，不会把 Open Notebook、WhisperX 等候选工具伪装成已执行。
- 全片制作前必须依次完成正式模板锁、风格探针审批、权利范围审批、正式音频交接和合成就绪检查。`cleared` 路径只接受正式 `readiness.readyForComposition === true`；`internal-only` 路径会保留 `rights=needs-review`，仅在其余技术检查全部通过时允许内部合成和 review 渲染。
- 最终预览必须先通过 HyperFrames check，再由工作台启动 Studio；专用五项终审可以从有效的 `needs-review` 会话原子生成 hash-bound `human-review` 回执，`4/5` 不能批准，通用阶段批准接口也不能绕过该门禁。
- 公开 master 要求发布权利清单全部清权，并复核 composition 全目录哈希与预览批准版本一致。`internal-only` 只生成带 `internal-review` 文件名和 `publicReleaseBlocked: true` 回执的内部文件，不能作为公开交付物。
- 发布中心分别显示生产中、内部审片包、公开母版候选和已发布；只有存在与视频 SHA-256 绑定的 `delivery/publication-receipt.json` 才显示“已发布”。

当前准确成熟度和剩余缺口见 [`../docs/10-讲解视频规模化SOP.md`](../docs/10-讲解视频规模化SOP.md)。批量内容入口、创意字段、素材/SFX 与失效规则见 [`../docs/17-批量内容入口与创意配方SOP.md`](../docs/17-批量内容入口与创意配方SOP.md)。画面对象级微调见 [`../docs/15-工作台画面微调与Overrides.md`](../docs/15-工作台画面微调与Overrides.md)。正式模板、音频与就绪契约见 [`../hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md`](../hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md)，配音细节见 [`../hyperframes-workflow-kit/VOICE_HANDOFF.md`](../hyperframes-workflow-kit/VOICE_HANDOFF.md)，完整教程见 [`../docs/11-CosyVoice14与HyperFrames最终视频教程.md`](../docs/11-CosyVoice14与HyperFrames最终视频教程.md)。

## 数据边界

工作台状态位于 `workflow-console/data/`。删除或重置工作台项目不会删除 `hyperframes-workflow-kit/projects/<id>/` 下的正式项目，也不会删除已批准的输入。素材扫描会跳过凭据样式的文件、敏感 JSON、符号链接和工作台自身数据。
