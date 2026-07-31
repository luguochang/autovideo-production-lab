# DemoText 标准交付 V1 复盘

- Project ID: `demotext-standard-delivery-v1`
- Generated at: 2026-07-18T22:53:52.995Z
- Delivery scope: `internal-only`; public release blocked: `true`

## 成功组件

- CosyVoice 预设 14 以 speed=1.03、seed=7 生成 48kHz mono PCM 最终音轨，并绑定 NarrationLock。
- 确定性编译器生成 14 个场景、46 个字幕 cue，总时长 239.909s。
- HyperFrames 0.7.62 严格检查通过；主 composition 的片头、中段、片尾捕获帧和最终 MP4 抽帧均可读。
- 最终 MP4 为 1920x1080 / 30fps / H.264 + AAC，响度 -13.3 LUFS，真峰值 -1.1 dBFS。
- 工作台支持生成、重新生成、产物编辑、版本归档、退回修改和下游 stale 传播。

## 失败模式与诊断

- 第一次 TTS 分段因 CRLF 规范化缺陷改变锁稿，已修复并保留失败 job 回执。
- HyperFrames Studio 的缩放画布截图偶尔未刷新场景内容；同一时间点的主 composition 捕获接口和最终 MP4 抽帧均正常。
- HyperFrames 0.7.62/0.7.64 对顶层音频出现 data-end 静态诊断，但源文件使用正确 data-duration，严格检查仍为 ok；保留为框架诊断。
- Whisper 基础 ASR CER 为 8.2003%，当前用 NarrationLock 映射得到 46 个精确 cue；这不等价于 phoneme 级 forced alignment。

## 人工修改与覆盖

- 工作台人工覆盖总数：0。
- composition 对象级 overrides revision 为 0，本次没有人工画面覆盖。

## 用户反馈

- 工作台必须显式提供“修改、重新生成、退回修改”，不能只显示“确认完成、详情”。
- 整条链路需要覆盖素材/观点台账、人工微调、HyperFrames 最终确认和规模化 SOP。

## 仍未解除的门禁

- 最终配音尚未完成人工完整听审，10 个中英术语仍待确认。
- CosyVoice 内置 speaker 与人物姿态的公开发布权利未完成凭据清理。
- 99%、90%、30K 只能作为创作者观点呈现，不能标为已核验事实。
- WhisperX/MFA、OCR 逐帧终审、真实资料包路线和真实口播音频路线仍需基准项目验证。

## 模板与 SOP 回写

- 回写：确定性 Graph IR/shot manifest -> HyperFrames 编译器、对象级 overrides 合同、正式交付 QA 与哈希清单。
- 暂不回写为全局风格规则：point-right/close 的人物头部比例，等待人工确认后再升级模板。
- 正式项目状态：`internal-delivery-ready`；本复盘不改变公开发布阻塞。

