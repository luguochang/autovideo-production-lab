# VoxCPM2：设计普通话女性声线

VoxCPM2 适合用文字描述生成一条新的普通话声线，例如“成熟、稳重、中低音、温暖克制”。它不是音色列表，也不是把原口播直接变声：每次都会根据文本重新生成语速、停顿和重音。要保留你的原口播节奏，应把 VoxCPM2 生成的短样本作为目标音色，再交给 CosyVoice VC 或 Seed-VC 转换。

## 安装位置

```text
tools/voice-lab/VoxCPM/
tools/voice-lab/VoxCPM/.venv/
tools/voice-lab/VoxCPM/pretrained_models/VoxCPM2/
tools/voice-lab/VoxCPM/outputs/
```

当前代码和模型均已安装到本地。生成过程不需要上传录音。

## 最小生成命令

在项目根目录打开 PowerShell：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\voice-lab\VoxCPM\run-mature-female.ps1
```

默认输出：

```text
tools/voice-lab/VoxCPM/outputs/voxcpm2-mature-female-seed42.wav
```

只检查模型和运行环境，不占用 GPU 推理：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\voice-lab\VoxCPM\run-mature-female.ps1 -CheckOnly
```

## Voice Design 控制词

当前默认控制词：

```text
成熟稳重的普通话女性，中低音，温暖克制，纪录片口播，语速自然，不甜腻，不夸张，口齿清楚
```

控制词应优先描述这些维度：

- 语言和口音：`普通话女性`、`无方言口音`。
- 年龄感和音域：`成熟稳重`、`中低音`。
- 音质：`温暖`、`有厚度`、`不尖锐`。
- 表达：`克制`、`自然交流感`、`纪录片口播`。
- 排除项：`不甜腻`、`不夸张`、`不使用播音腔`。

一次只改一个维度并保持文本和 seed 不变，否则无法判断听感变化来自哪里。不要用真人、明星或主播姓名作为控制词。

## 替换文本、seed 和音色描述

直接调用已安装环境中的生成脚本：

```powershell
& .\tools\voice-lab\VoxCPM\.venv\Scripts\python.exe `
  .\tools\voice-lab\VoxCPM\voice_design_mature_female.py `
  --text "我奉劝很多人，对 AI 一定要有敬畏之心，也希望大家擦亮双眼。" `
  --control "成熟稳重的普通话女性，中低音，温暖克制，自然口语，不甜腻，口齿清楚" `
  --seed 42 `
  --output .\tools\voice-lab\VoxCPM\outputs\candidate-seed42.wav
```

- `--text`：替换朗读文本。先用 1-2 句、10-20 秒以内的片段选声线。
- `--control`：替换声音和表达描述。固定 seed 后再比较不同描述。
- `--seed`：同一描述可测试 `42`、`77`、`123` 等种子；种子不同，声线细节、语速和停顿也可能变化。
- `--output`：每个候选使用不同文件名，避免覆盖。

## E14 实测样本

![E14 成熟普通话女声对比页](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page.png)

- [02 · 成熟中低音女声](../../../experiments/E14-mature-female-voice-comparison/outputs/listen/02-voxcpm2-mature-female.wav)：温暖克制的成熟声线设计样本，177 Hz，5.12 秒。
- [04 · 中音偏明亮女声](../../../experiments/E14-mature-female-voice-comparison/outputs/listen/04-voxcpm2-mature-female-mid.wav)：用于确认更明确的女性音高，271 Hz，4.48 秒。它是高亮声线测试，不等于成熟声线。

对比页中 `03` 和 `05` 才是把这两个目标音色用于 CosyVoice VC 后的结果，可以保留原始 15 秒口播的大部分停顿和语速。实际选型以人工盲听的自然度、普通话、女性感和耐听度评分为准。

## RTX 4060 Ti 8GB 注意事项

- 推理前先关闭 CosyVoice、Seed-VC、RVC、Qwen3-TTS 等其他 GPU 服务。
- 先生成短文本，确认声线后再分段生成长稿。
- 默认 `10` 个推理步数是 8GB 显存的保守起点；提高步数会增加耗时，不保证更自然。
- 遇到显存不足时先确认没有残留 Python 进程占用 GPU，再重试；不要同时启动多个模型。
- CPU 模式可以作为慢速回退，但不适合反复选音色。

## 使用技巧

- 先固定同一段文本和 seed，只比较三种声线描述；选中方向后再比较三个 seed。
- 成熟女声不等于单纯把音高压低。优先描述“温暖、克制、句尾自然、不过度播音”，不要堆很多互相冲突的形容词。
- 专有名词、英文缩写和数字先单独测试。普通话自然但英文词不稳定时，应改写读法或分句生成。
- 如果最在意你的节奏和情绪，用 VoxCPM2 生成 8-15 秒干净目标样本，再走 CosyVoice VC；不要直接用 VoxCPM2 重做整条口播。
- 最终候选先统一到相同响度再盲听。更响的文件通常会被误判为更饱满。

## 常见问题

### 输出每次听起来不一样

确认 `-Text`、`-Control`、`-Seed`、推理步数完全相同。种子或文字标点变化都可能改变节奏和声线细节。

### 声音像女性，但还是有明显 AI 味

缩短句子，减少控制词冲突，并把“自然口语、克制、句尾自然”写进控制词。如果仍不自然，改用“真人口播节奏 + CosyVoice/Seed-VC 音色转换”，不要继续只调 TTS 语速。

### 普通话像外语腔

明确写 `普通话女性、无方言口音`，并避免使用来源不明或非中文母语的参考声线。做音色转换时，目标参考必须是普通话母语录音。

### 加载时报 CUDA 显存不足

关闭其他语音服务和占用 GPU 的程序后重试。8GB 显存一次只运行一个生成或变声模型。

### `CheckOnly` 成功但生成失败

`CheckOnly` 只校验模型文件和依赖，不会把完整模型加载到显存。检查 GPU 可用性、剩余显存以及错误日志，再运行短文本测试。

## 许可证和声音权利

VoxCPM2 的本地代码和模型声明为 Apache-2.0，来源与校验信息记录在 `tools/voice-lab/VoxCPM/SOURCE_RECEIPT.md`。

Apache-2.0 说明代码和模型权重的使用条件，不等于自动获得任何真人音色的复制、人格或商业发布授权。Voice Design 应避免模仿可识别真人；Voice Cloning 只能使用本人或已明确授权用于音色克隆和发布的录音。正式交给 HyperFrames 前，还要在目标项目的媒体清单中记录模型、控制词、seed、源录音和声音授权。
