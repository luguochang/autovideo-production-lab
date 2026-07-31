# 本地配音工具使用手册

这套工具的目标不是重新生成一段“标准播音”，而是保留你的原始口播节奏、停顿、重音和情绪，只在确有需要时清理噪声或调整音色。

## 应该选哪个

| 需求 | 首选 | 不建议 |
| --- | --- | --- |
| 原录音已经清楚自然 | 直接使用原录音 | 为了“处理过”而额外变音 |
| 稳定底噪、风扇声、轻微嘶声 | [DeepFilterNet](./04-deepfilternet.md) | 同时再叠一层强降噪 |
| 复杂噪声、混响、多人或混合音频 | [ClearerVoice](./03-clearervoice.md) | 把 VAD 当成默认必选项 |
| 保留本人节奏，只换音色 | [Seed-VC V2](./01-seed-vc.md) | 勾选风格转换后还要求节奏完全不变 |
| 训练一个长期固定的个人音色 | [RVC WebUI](./02-rvc-webui.md) | 没有个人模型就直接期待推理结果 |
| 设计不对应真人的成熟普通话女声 | [VoxCPM2](./05-voxcpm2.md) | 用真人姓名作为 Voice Design 控制词 |
| 用目标女声保留本人节奏，或试听内置中文女声 | [CosyVoice](./06-cosyvoice.md) | 把 VC 和重新朗读当成同一种方案 |
| 试听现成、稳定的普通话年轻女声预置 | [Qwen3-TTS](./07-qwen3-tts.md) | 把 Serena / Vivian 误称为成熟声线或节奏保持方案 |
| 使用当前选定的 `14` 中文女声生成正式口播 | [最终预设 14](./08-final-voice-14.md) | 先录口播；这条 SFT 路线只需要确认后的文字 |

## 推荐链路

```text
原始口播（永久保留）
  -> DeepFilterNet 或 ClearerVoice（二选一，可跳过）
  -> CosyVoice VC、Seed-VC 或 RVC（三选一，可跳过）
  -> 响度归一化、转写和字幕时间轴
  -> 冻结为 HyperFrames 本地音频资产
```

不要默认把四个工具串起来。连续两次降噪容易丢失呼吸和齿音，连续两次变音容易产生金属感和音高漂移。

## 快速启动

在项目根目录打开 PowerShell：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\start-seed-vc.ps1 -OpenBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\start-rvc.ps1 -OpenBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\start-clearervoice.ps1 -OpenBrowser
```

固定地址：

- Seed-VC: <http://127.0.0.1:7861>
- RVC: <http://127.0.0.1:7862>
- ClearerVoice: <http://127.0.0.1:8501>

DeepFilterNet 是命令行工具，见独立教程。

## 统一测试素材

第一次测试不要直接处理整条视频。准备三段 10-20 秒 WAV：

1. 正常语速，包含自然停顿和轻重音。
2. 快速连续表达，包含数字、英文和专有名词。
3. 低声、句尾、呼吸和齿音较多的片段。

建议命名：

```text
narration-original.wav
narration-deepfilter.wav
narration-clearervoice.wav
narration-seedvc.wav
narration-rvc.wav
```

## A/B 听感检查

- 先把候选文件响度调到接近，再比较；更响的版本常被误判为更好。
- 重点听停顿长度、句尾衰减、气口、`s/sh/x` 齿音和数字发音。
- 音色相似度不是唯一指标。节奏、清晰度和听久后的疲劳感更重要。
- 保留原文件，任何处理结果都写到新文件。
- 使用他人音色前需要得到明确授权。代码仓库许可证不等于声音使用授权。

## 交给 HyperFrames

最终只选择一个 WAV，复制或注册到目标视频项目的本地媒体目录，并在媒体清单中记录：原始录音、处理工具、模型、关键参数和人工选择理由。画面节奏应跟随最终音频重新转写得到的时间轴，不要继续沿用旧 TTS 的时长。
