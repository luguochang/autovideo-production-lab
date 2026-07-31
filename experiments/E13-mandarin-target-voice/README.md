# E13 普通话目标声线测试

本轮针对上一轮“中文听起来像外语”的问题，使用普通话女性参考重新处理同一份用户口播。源音频的停顿、语速、重音和内容不变，只替换目标音色。

试听页面：<http://127.0.0.1:8770/>

![普通话目标声线试听页](./assets/comparison-page.png)

## 参考音色

参考文件：`references/xiaoxiao-mandarin-female.wav`，来自本机已有 E05 技术样本的 `zh-CN-XiaoxiaoNeural` 普通话女性声音，截取前 15 秒。它仅用于本地评估，不代表该商业声线的发布授权。

## 候选

| ID | 参数 | 目的 |
| --- | --- | --- |
| 00 | 原声基线 | 对照源口播 |
| 07 | Seed-VC，相似度 0.45 | 普通话参考影响较轻，优先保留本人咬字 |
| 08 | Seed-VC，相似度 0.55 | 普通话音色与本人节奏的平衡点 |
| 09 | Seed-VC，相似度 0.65 | 更靠近普通话女性参考，检查是否出现参考声线渗透 |

三个变声候选都使用：V2、30 steps、Length Adjust 1.0、Intelligibility 0.0、style/emotion/accent 关闭、Top-p 0.9、Temperature 1.0、Repetition 1.0。

试听时重点听：普通话四声是否仍稳定、`zh/ch/sh` 和 `j/q/x` 是否清楚、句尾是否自然、是否仍有“外国人说中文”的口音感。

## 启动

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\project\study\codex\autoVideo\experiments\E13-mandarin-target-voice\start-comparison.ps1
```

试听版位于 `outputs/listen/`，raw 模型输出位于 `outputs/raw/`。使用试听版比较，不要直接使用 raw 文件。

## 结果接入 HyperFrames

选中一个候选后，用 `media-use resolve --type voice --from <候选 WAV> --project <目标视频项目>` 登记到目标项目，再对最终 WAV 重新 `hyperframes transcribe`，让字幕、动画和画面节奏跟随最终音频。

上一轮 E12 的英文/非普通话参考结果保留在原目录，没有被覆盖。
