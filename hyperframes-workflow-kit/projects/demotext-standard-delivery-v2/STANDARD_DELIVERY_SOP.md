# AutoVideo 标准交付 SOP：DemoText V2

> 这份文档是本项目的可复用执行合同。它记录输入、产物、门禁、哈希绑定、人工动作和失败恢复方式；后续新文稿只替换项目输入和内容规划，不复制本项目的内容专用 JSON。

## 1. 固定基线

- 输出：`16:9 / 1920x1080 / 30fps`。
- 最终合成和渲染层：HyperFrames `0.7.62`，禁止静默升级。
- 模板：`modern-ip-host-explainer@1.0.0`，配色 `light-apricot`。
- 配音：CosyVoice preset 14，中文女、FP32、`stream=false`、`speed=1.03`、`seed=7`。
- 时间唯一来源：最终 WAV 和 `alignment.json`；目标时长只用于初始化估算。
- 公开发布和内部审片是两个独立 scope。自动化回执不能代替人听、人审或权利清理。

## 2. 标准输入路线

| 路线 | 输入 | 当前验证状态 | 必须补的通用能力 |
|---|---|---|---|
| 已审文字稿 | UTF-8 approved narration | V2 已真实跑通 | 新项目只需重新锁稿和规划 |
| 资料包 | 文档、网页、图片、长视频 | 只有 schema/UI | sources -> evidence -> outline/script 金标项目 |
| 口播音频 | WAV/M4A/MP3 | 有 ASR 适配器，未完成金标 | ASR -> 人工校订 -> NarrationLock |

资料路线的提示词链固定为：

```text
Evidence Extractor -> Outline Planner -> Narration Writer
-> Oralizer -> Claim Verifier -> Duration Fitter -> Human Script Review
```

每一步都写入独立 artifact；不得一次提示词直接生成未经证据审查的最终口播稿。

## 3. 执行顺序

| 阶段 | 输入 | 主要产物 | 门禁/回滚 |
|---|---|---|---|
| 1. source-register | 原始素材 | `sources.json`、SHA-256、来源和 license | 素材变更使下游 stale |
| 2. script-review | 用户稿或 script-draft | `script.approved.txt` | 人工批准；不能静默改字 |
| 3. narration-lock | approved script | `NarrationLock.json` | 文稿哈希锁定 |
| 4. template-lock | 风格选择 | `template-lock.json` | 版本、比例、源文件哈希固定 |
| 5. voice-final | NarrationLock、voice recipe | 18 段 WAV、最终 WAV、QA、recipe | 先技术 QA，再人工听审 |
| 6. audio-align | 最终 WAV、NarrationLock | `alignment.json`、46 cue、SRT | 当前为 Whisper 映射，非 phoneme forced alignment |
| 7. rights-clearance | sources、模板、资产 | 7 项 publication-rights receipt | internal-only 可保留 needs-review |
| 8. audio-handoff | WAV、alignment、recipe | `audio-handoff.json` | 绑定音频/文稿/权利哈希 |
| 9. visual-plan | alignment、内容台账 | storyboard、shot manifest、Graph IR | 场景/cue/node/edge ID 稳定 |
| 10. diagram-assets | Graph IR | ELK layout | 布局不是语义事实 |
| 11. style-probe | 同一 narration 窗口 | still、3-8 秒 probe、STYLE_REVIEW | 先探针，后全片 |
| 12. composition-readiness | audio、template、rights、probe | readiness receipt | internal/public 分开判断 |
| 13. full-production | storyboard、Graph IR、assets、overrides | HyperFrames composition、build receipt | 14 scenes / 46 cues / 239.328167s |
| 14. qa-review | composition | strict-check receipt | digest、file count、build hash 必须相等 |
| 15. final-preview | current composition | Studio preview receipt | 自动化只能批准 internal scope |
| 16. visual-review | 14 个场景中点帧 | visual review、每帧 SHA-256 | 必须绑定当前 composition digest |
| 17. render-deliver | 已批准 preview | internal MP4 或 public master | public master 需要真人门禁 |
| 18. delivery-qa | MP4、字幕、回执 | media QA、report、cover、review frames | 解码、分辨率、响度、黑帧、静音、冻结帧 |
| 19. retrospective | 全部回执 | PROCESS_LOG、RUNBOOK、manifest、SOP_STATUS | finalizer 冻结自包含交付包 |

## 4. 可编辑边界

- 文稿只在 `script-review` 编辑；批准后任何改字都创建新 NarrationLock 版本。
- 事实/观点编辑 evidence/claim ledger，不把观点数字渲染成统计事实。
- 分镜编辑 storyboard/shot/Graph IR 的稳定 ID 和语义字段。
- 画面微调使用 `overrides/overrides.json`，记录 stable ID、来源 revision、override 值、操作者、时间、原因和影响阶段。
- 工作台可以编辑 artifact、重新生成、重新打开和退回修改；上游变化必须传播 stale。
- HyperFrames Studio 用于最终时间线预览和对象级人工微调；任何 Studio 改动都必须重新取得 composition digest。
- 自动重新生成不能覆盖已批准的人工作品；冲突时停止并要求回滚或明确重审。

## 5. 稳定摘要合同

composition digest 只包含影响渲染的 HTML、CSS/JS、媒体、字体、稳定数据和 motion sidecar。以下内容不进入摘要：

- `node_modules/`
- `.thumbnails/`
- `.waveform-cache/`
- `meta.json`
- `data/composition-build.json`
- `qa/` 和 `renders/`

编译器预先写入稳定 `data-hf-id`，避免 HyperFrames check 注入随机 ID。QA 必须验证：

```text
full-production digest == current composition digest
qa/hyperframes-check digest == current composition digest
final-preview digest == current composition digest
render-deliver preview digest == current composition digest
```

当前 V2 composition digest：`511dabbb70c3a7cff499b9084e3726fb47859fb254c1d7a197c2d8acac8c6b75`，稳定文件数：`50`。

`scripts/sync-project-sop-status.mjs` 会在每次同步时重新计算这份摘要，并验证：HyperFrames strict check 的摘要/文件数和 build receipt SHA、final preview 的摘要/文件数、14 个 visual review 抽帧哈希、内部 MP4 与 delivery QA 的 SHA，以及 delivery manifest 的逐文件哈希和视频 SHA。只检查路径存在不再足以把阶段标记为完成。

## 6. 交付包合同

`finalize-delivery-manifest.mjs` 是唯一正式冻结入口。它会：

1. 从工作台冻结 source、approved script、rights 和 receipt index。
2. 登记已有的 content approval、claim ledger、pronunciation、audio approval、visual review 等正式产物。
3. 缺失项记录为 `missing`，不生成伪造占位文件。
4. 校验交付视频 SHA-256 与媒体 QA 一致。
5. 写入 34 文件的自包含 manifest，并把 manifest 哈希写回 SOP 状态。

本 V2 当前是 `internalDeliveryReady=true`、`publicReleaseBlocked=true`。

## 7. 人工发布门禁

下列动作不能由自动化代替：

- 完整播放最终 WAV，并决定 10 个术语读法：`Coze`、`Dify`、`Codex`、`Claude Code`、`Agent`、`Demo`、`Magic`、`Engineering`、`30K`、`Token`。
- 在 HyperFrames Studio 从头到尾看完整时间线，确认音画同步、字幕、人物、流程图和结尾。
- 清理 CosyVoice speaker、主持人源图、输入素材、GSAP/FFmpeg 等公开权利凭据。
- OCR 和完整字幕语义终审。
- 为 `99%`、`90%`、`30K` 提供外部证据，或保持创作者观点标注。

这些门禁完成前，只能交付明确标记的内部审片包，不能生成或上传公开母版。

## 8. 新项目最短命令

```powershell
npm.cmd run video:new -- --id <project-id> --narration <approved.txt> --ratio 16:9 --duration <estimate>s --platform <platform>
npm.cmd run video:apply-template -- --project <project-id> --style modern-ip-host-explainer --palette light-apricot
npm.cmd run video:prepare-inputs -- --project <project-id>
# 按工作台 stageOrder 逐步生成、审阅、批准或编辑
npm.cmd run video:compile -- --project hyperframes-workflow-kit/projects/<project-id>
npx.cmd --yes hyperframes@0.7.62 check <project>/production/hyperframes --strict --json
node scripts/build-delivery-docs.mjs <project-id>
npm.cmd run video:sop-status -- --project <project-id>
node scripts/finalize-delivery-manifest.mjs <project-id>
```

失败恢复：读取 `SOP_STATUS.json` 和工作台 job/event 记录，从最后一个未 stale 的阶段继续；不要重复生成未变化的 WAV，也不要跳过 NarrationLock、provenance、QA 或人工门禁。

## 9. 本次运行追踪

- 原始输入：`demo/demoText.txt`。
- 正式项目：`demotext-standard-delivery-v2`。
- 音频：239.328167s，18 parts，WAV SHA-256 `d9596e2129b1b5312bb0403a6740fa36430ce8756751fc760d00fd21d75aeb9f`。
- 画面：14 scenes、46 cues、4 Graph IR graphs。
- 内部 MP4 SHA-256：`e0c4ea6bc7c2c9d603dddc2c904355ebc95d3abb6f575cb5579bd51460bc48db`。
- 交付 manifest：34 files，9 present optional artifacts，4 missing optional artifacts。
- 完整事件、失败 job 和恢复过程：`PROCESS_LOG.md`。
- 可执行命令和人工操作：`RUNBOOK.md`。
