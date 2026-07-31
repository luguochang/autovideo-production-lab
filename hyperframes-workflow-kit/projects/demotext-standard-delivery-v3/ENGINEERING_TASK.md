# 工程任务：DemoText 标准化完整交付 V3

## 目标

用 `demo/demoText.txt` 从零重放 AutoVideo 标准流程，生成一个可审计的内部交付包，并验证后续新文字稿只需要替换输入和内容规划，不需要重写工作台、配音或 HyperFrames 编译逻辑。

## 固定基线

- 输入路线：已审文字稿；文字内容不可静默改写。
- 配音：CosyVoice 预设 14，中文女、FP32、`stream=false`、`speed=1.03`、`seed=7`。
- 视频：HyperFrames `0.7.62`，`16:9 / 1920x1080 / 30fps`。
- 模板：`modern-ip-host-explainer@1.0.0`，默认 `light-apricot`。
- 发布范围：先做 `internal-only`；真人听审、Studio 全片终审和公开权利不得伪造。

## 必须验证

1. NarrationLock 与源文字稿哈希一致。
2. 最终 WAV、voice recipe、alignment、字幕和画面时间轴互相绑定。
3. 工作台每个阶段可生成、编辑、重新生成、退回修改，并传播 `stale`。
4. Graph IR、ELK 布局、storyboard 和 production manifest 可重放。
5. HyperFrames composition、strict check、视觉抽帧、MP4 QA 和 delivery manifest 哈希一致。
6. SOP 状态明确区分内部交付和公开发布。

## 缺口补充策略

- 资料包路线和音频路线本次不伪装成已验证；保留 schema/UI 状态，并记录为后续金标任务。
- 远程 Codex 结构化规划失败时，使用同项目输入的明确 fallback receipt，禁止静默采用其他项目内容。
- 公开权利未清时只输出带 `internal-review` 标记的 MP4，不生成 `renders/master.mp4`。
- 所有自动批准使用 `automation` 或 `codex-autonomous-internal-review`，不写成真人批准。

## 交付完成定义

`SOP_STATUS.json` 的 `readiness.internalDeliveryReady=true`，同时保留 `publicReleaseBlocked=true`，并且项目目录包含运行日志、SOP、交付 manifest、QA 回执、复盘和所有可复用中间产物。
