# E12 口播处理与变声对比

输入是用户提供的 `录音.m4a`：51.925 秒、48 kHz、单声道 AAC。全程使用本地开源工具，没有调用付费 API 或云端配音服务。

试听地址：<http://127.0.0.1:8766/>

![口播处理对比页](./assets/comparison-page.png)

所有试听文件都经过 FFmpeg 两遍 `loudnorm`，目标为 -16 LUFS。这样比较时不会因为某一份更响而误判为更好。

## 七个候选

| ID | 候选 | 用途 | 发布状态 |
| --- | --- | --- | --- |
| 00 | 原声基线 | 只统一响度 | 用户自有录音 |
| 01 | DeepFilterNet3 | 降噪，保留原音色和节奏 | 可作为正式候选 |
| 02 | ClearerVoice FRCRN | 较强语音增强，保留原音色和节奏 | 可作为正式候选 |
| 03 | Seed-VC 女性参考 | 零样本男声转女性音色 | 仅本地评估，参考声线来源不完整 |
| 04 | Seed-VC 匿名音色 | 不使用目标参考的匿名化实验 | 仅本地评估 |
| 05 | RVC Female_1，+6 半音 | 较温和的男声转女声 | 仅本地评估，训练声线来源不完整 |
| 06 | RVC Female_1，+12 半音 | 更明显的男声转女声 | 仅本地评估，训练声线来源不完整 |

模型直接输出位于 `outputs/raw/`，用于公平比较的响度统一版位于 `outputs/listen/`。人工试听应使用 `outputs/listen/`；Seed-VC 的两份 raw 文件峰值接近或略超 0 dBFS，不应直接入片。

## 推荐试听方法

1. 先打开“盲听模式”。候选会随机排序，并同时隐藏文字和辅助阅读中的真实身份。
2. 第一遍只评自然度、清晰度和耐听度，不看工具名称。
3. 对 00/01/02 判断是否真的需要降噪；原声够自然时，00 可能就是最佳结果。
4. 对 03/05/06 判断男声转女声。通常 +6 更稳、更耐听，+12 更女性化但更容易尖、薄或出现电音。
5. 04 是匿名化实验，不代表指定女性音色。
6. 点击“显示身份”后会恢复正常顺序；“导出评分”会下载 JSON 记录。

评分保存在当前浏览器本地。本页已实测筛选、随机盲听、评分持久化、JSON 导出和音频互斥播放。

## 图文教程

- [Seed-VC：保留口播节奏，只转换音色](../../tools/voice-lab/tutorials/01-seed-vc.md)
- [RVC：测试女性模型或训练长期个人音色](../../tools/voice-lab/tutorials/02-rvc-webui.md)
- [ClearerVoice：复杂噪声和混响清理](../../tools/voice-lab/tutorials/03-clearervoice.md)
- [DeepFilterNet：快速、温和的口播降噪](../../tools/voice-lab/tutorials/04-deepfilternet.md)
- [工具选择与完整推荐链路](../../tools/voice-lab/tutorials/README.md)

## 启动页面

在任意目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\project\study\codex\autoVideo\experiments\E12-voice-tool-comparison\start-comparison.ps1
```

脚本发现端口已经运行时不会重复启动。当前固定地址为 <http://127.0.0.1:8766/>。

## 接入 HyperFrames

人工选中一份 `outputs/listen/*.wav` 后：

1. 使用 `media-use resolve --type voice --from <选中的 WAV> --project <目标视频项目>` 冻结并登记到目标项目的 `.media` 清单。
2. 对最终音频重新运行 `hyperframes transcribe`，生成新的字幕和词级时间轴。
3. 让画面节奏、字幕和动画跟随这份最终音频，不要复用旧 TTS 或原录音的时间戳。
4. HyperFrames composition 只引用目标项目内冻结后的 `.media/audio/voice/...` 路径。

本实验的原录音和七份试听版已经登记为 `.media/audio/voice/voice_001` 至 `voice_008`。完整模型来源、参数、哈希和权利限制见 [PROCESSING_RECEIPT.md](./PROCESSING_RECEIPT.md)。
