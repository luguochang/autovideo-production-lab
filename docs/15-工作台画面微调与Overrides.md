# 工作台画面微调与 Overrides

本契约用于解决“全片已经生成，但只想修改一个场景、一个节拍或一个画面对象”的问题。人工修改不直接写入 HyperFrames HTML，而是记录到正式项目的 `overrides/overrides.json`，再由确定性编译器重新生成全片。

## 使用入口

1. 在工作台选择“HyperFrames 全片制作”或“Studio 最终预览”。
2. 打开“画面微调”。
3. 选择目标层级：场景、节拍或画面对象。
4. 只填写需要覆盖的字段，并记录修改原因。
5. 保存后从“HyperFrames 全片制作”重新生成，再依次重跑结构 QA、Studio 审片、渲染、交付 QA、复盘和标准包。

当前支持：

- 场景：标题、人物姿态、模板合同允许的布局 preset；Candidate A 固定为 `host.left / content.right`，不能把人物移到右侧。
- 节拍：屏幕摘要、人物姿态、动效版式、版本化 motion recipe、结构化主载体、本地视觉素材和语义 SFX。
- 画面对象：屏幕摘要、动效版式、版本化 motion recipe、结构化主载体、本地视觉素材和语义 SFX。
- 流程图布局：在“流程图与素材计划”中修改 Graph Layout 坐标；批准后由全片编译器消费并绑定 SHA。

GET 读取模型还会为每个 cue 返回 `motionRecommendations`：推荐、备选、语义 trigger、原因、缺失输入和 lifecycle blocker。它只用于工作台预填，不是 override，也不是批准回执；POST 保存路径不会消费或信任推荐结果。

## 自动值、人工值与最终值

工作台按字段显示三类值，不能把它们当成三个可同时编辑的真值：

| 列 | 含义 | 是否可直接编辑 |
| --- | --- | --- |
| 自动生成 | 当前 planning/shot 产物给出的 immutable generated value | 否；只能回到上游重新生成 |
| 人工覆盖 | 当前目标上仍为 `active` 的最新 override value | 是；通过画面微调保存或撤销 |
| 当前有效 | `generated + active override` 确定性解析出的下一次编译输入 | 否；由服务端计算 |

每个字段同时返回 `fieldSources`。若来自人工覆盖，来源中包含 override ID、revision、作者、时间和原因；否则明确标记为 `generated`。后端还返回 `states.compiled` 和 `changedFields.compiledToEffective`，用于判断当前已编译 composition 与“下一次编译有效值”是否一致。当前界面用“当前成片已包含 / 等待重新生成全片”展示这一状态；三值表里的“当前有效”不表示旧 MP4 已经变化。

场景标题、人物姿态、布局、文字、视觉类型/版式、motion recipe、媒体、结构化载体和 SFX 都使用同一来源模型。自动重生成只更新 generated；仍为 active 的人工覆盖不会被静默抹掉。

当前禁止：

- 修改 NarrationLock、口播字幕或最终音频。
- 手工移动音频时间戳、场景边界或 cue 时长。
- 直接编辑已编译的 `production/hyperframes/*.html` 作为正式修改。
- 在 Graph Layout 中改写 Graph IR 的节点/边 ID、语义文字或端点。

如果需要改口播内容或时间，必须回到口播稿/NarrationLock 和最终音频阶段，重新生成全部时间依赖产物。

## 结构化主载体

在 cue 或画面对象中选择“结构化主载体”：

1. `data-chart-bounded`：填写标题、单位、2-6 个非负数据项和本地证据回执。
2. `code-surface-bounded`：填写语言、`highlight/diff` 模式、2-10 行真实代码/日志及本地证据回执。
3. `device-surface-bounded`：填写产品标识、2-3 个真实界面状态及本地证据回执。

工作台不允许编辑 adapter 版本和官方 source receipt；服务端从本地 registry 固定值补全。选择结构化主载体会清除 primary image，只保留 supporting icon；选择新的 primary image 会清除结构化载体。选择“恢复为自动主载体”会保存 `carrierPayload=null`，撤销仍保留完整历史。

`illustrative-mock` 只允许技术探针使用，不得作为正式内容提交。工作台生产入口要求 `verified`，但“verified”仍不等于公开权利批准；正式发布还要经过 rights-clearance。

## 状态传播

保存或撤销画面微调后，工作台保留音频、对齐、分镜和风格批准，但把以下阶段标记为 `stale`：

```text
full-production
-> qa-review
-> final-preview
-> render-deliver
-> delivery-qa
-> retrospective
-> package-export
```

这意味着修改一条屏幕摘要不会重做 TTS 或 alignment，但旧视频、旧 QA 和旧交付包不能继续批准或发布。

## 数据合同

正式文件：

```text
hyperframes-workflow-kit/projects/<project-id>/overrides/overrides.json
```

每个生效覆盖至少包含：

```json
{
  "id": "override-001-abcd1234-text",
  "revision": 1,
  "status": "active",
  "operation": "set",
  "target": {
    "level": "cue",
    "sceneId": "scene-06",
    "cueId": "cue-012"
  },
  "sourceValue": {},
  "locks": {
    "text": {"value": "人工调整后的屏幕摘要"}
  },
  "authoredBy": "user",
  "authoredAt": "<ISO-8601>",
  "reason": "减少画面文字密度",
  "invalidateTargets": [
    "full-production",
    "qa-review",
    "final-preview",
    "render-deliver",
    "delivery-qa",
    "retrospective",
    "package-export"
  ]
}
```

`target` 必须使用 planning contract 和 composition source map 中的稳定 ID。编译器拒绝未知 ID、未知人物姿态、失效的上游哈希和任何时间轴漂移。

## 版本、冲突与撤销

- 每次保存都会增加 overrides 文档 revision。
- GET 返回当前顶层 `revision`；POST 和 DELETE 都必须回传 `expectedRevision`。旧页面或并发编辑器提交旧 revision 时，服务端拒绝写入并要求重新加载，不能以后写覆盖先写。
- 同一目标的同一字段再次保存时，旧字段记录变为 `superseded`，新记录变为 `active`。
- 同一次调整中的不同字段分别记录，修改文字不会意外丢失此前的人物姿态覆盖。
- “撤销”将记录标为 `reverted`，保留作者、时间、原因和完整历史，不删除审计证据。
- 重新生成只消费 `active` 记录，并在 `composition-build.json` 写入 `appliedOverrideIds`。

## API

```text
GET    /api/projects/<id>/production-overrides
POST   /api/projects/<id>/production-overrides
DELETE /api/projects/<id>/production-overrides/<override-id>
```

服务端能力声明包含 `production-overrides-v1`。写入时会校验正式项目哈希，并通过工作台状态机传播下游失效。

当前服务端还声明 `production-override-provenance-v1`。写入和撤销请求的最小并发控制字段为：

```json
{"expectedRevision": 3}
```

POST 还要携带目标、锁字段、作者和原因；DELETE 仍保留历史，只把指定记录变为 `reverted`。

motion recipe 保存前还必须通过项目级生命周期授权；`candidate` 和 `probe-passed` 可以出现在推荐与探针中，但不能进入正式 override。视觉素材和 SFX 必须来自当前项目 `.media`，并具备可复验的 SHA、provider 和 license receipt。SFX 计划的人工审核回执与 cue/object override 是两条独立证据链，不能互相替代。

保存和撤销都使用同一套补偿事务：先保存 `overrides.json` 的原始字节快照，再原子写入新文件并提交工作台 DB 事件。如果 DB 回调或持久化失败，系统会恢复原文件、DB 内存快照和阶段状态；原文件此前不存在时会删除本次新文件。若补偿本身也失败，接口返回聚合错误并停止后续生产，不会把半完成状态显示为成功。

## 验证

```powershell
npm.cmd test --prefix workflow-console
npm.cmd run console:build
node tools/hyperframes-production/compile-production.mjs --project hyperframes-workflow-kit/projects/<project-id>
```

测试覆盖稳定目标枚举、三值与字段来源、保存、字段级替代、撤销、旧 revision 拒绝、未知姿态拒绝、上游哈希失效拒绝、编译器应用和工作台 stale 传播；故障注入还会验证 save/revert 在 DB 失败后保持 `overrides.json` 与 `db.json` 原始字节、事件列表和上下游阶段状态不变。

## 当前边界

工作台已经支持结构化对象覆盖、语义动效建议、冻结媒体选择、稀疏 SFX 和确定性重编译。HyperFrames Studio 内直接拖动对象后自动捕获差异、同步回写和可视化冲突合并仍未接入；在该能力完成前，Studio 用于预览和定位，正式修改通过工作台“画面微调”完成。

## 视觉素材角色合同

工作台中的素材分成“主载体”和“辅助图标”，两者不能混用：

| visualType | 可接受的主载体 | 辅助素材 |
| --- | --- | --- |
| `keyword` | 内置关键词 DOM | 最多 2 个 `role=icon` 图标 |
| `diagram` | Graph IR + graph-layout | 最多 2 个 `role=icon` 图标；不得替换流程图 |
| `comparison` | 0 张时为文字对比；媒体对比必须恰好 2 张 image | 最多 2 个图标 |
| `evidence-image` | 1 张 `image/evidence` 或 `image/illustration` | 图标不算证据图 |
| `device-surface` | 1 张 `image/interface` | 图标不算界面状态 |
| `data-proof` | 1 张有来源的 chart/evidence image，直到正式 data-chart adapter 接通 | 图标不算数据证明 |
| `code-surface` | 1 张 `image/code` | 代码图标不算真实代码/终端表面 |
| `object-metaphor` | 1 张 `image/logo/brand` 且 `role=metaphor` | CPU/分层图标只作辅助 |

只更换素材、不更换 recipe 时，服务端会沿用当前有效 recipe 的 visualType 推导 `interface/code/metaphor` role，不再退化为通用 evidence。compiler 和视觉 QA 会再次复核，避免一个图标让错误的主载体通过。
