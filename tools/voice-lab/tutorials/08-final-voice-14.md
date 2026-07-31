# 最终预设 14：CosyVoice 中文女 speed 1.03 seed 7

当前选定的本地配音预设是：

```text
model: CosyVoice-300M-SFT
speaker: 中文女
precision: FP32
stream: false
speed: 1.03
seed: 7
post: 两遍 loudnorm，-16 LUFS，48 kHz 单声道 PCM WAV
```

## 先说结论：只提供文字就可以

复现 `14` 不需要先录口播。它是 SFT 文本转语音：你提供确认后的文字，CosyVoice 用内置 `中文女` 重新朗读。

只有在你要求“保留我原来说话的停顿、语速、重音和情绪，只替换音色”时，才需要先录口播并改走 CosyVoice VC。那是另一条流程，不再是纯 `14` TTS。

| 目标 | 需要提供什么 | 使用路线 |
| --- | --- | --- |
| 使用 `14` 的中文女声重新配音 | 最终文字 | 本教程的 SFT 脚本 |
| 保留本人原口播节奏，只换成女声 | 口播录音 + 合法目标女声参考 | CosyVoice VC |
| 文字还会反复修改 | 每次提供最新确认文本 | 重新生成，画面时间轴随后更新 |

## 安装位置

全部位于 E 盘：

```text
E:\project\study\codex\autoVideo\tools\voice-lab\CosyVoice\
  .venv\Scripts\python.exe
  run_zh_female_seed7.py
  pretrained_models\CosyVoice-300M-SFT\
E:\project\study\codex\autoVideo\tools\voice-lab\.cache\modelscope\hub\
```

生成脚本不会调用云服务，也不会产生 API 费用。模型和 `wetext` 前端缓存继续使用当前 E 盘安装；脚本已固定 `MODELSCOPE_CACHE`，不会把这部分缓存写回 C 盘。

## 最快用法：直接给文字

在 `E:\project\study\codex\autoVideo` 打开 PowerShell：

```powershell
$CvRoot = Resolve-Path .\tools\voice-lab\CosyVoice
$CvPython = Join-Path $CvRoot '.venv\Scripts\python.exe'
$Runner = Join-Path $CvRoot 'run_zh_female_seed7.py'

& $CvPython $Runner `
  --text '我奉劝很多人对 AI 一定要有敬畏之心，也希望大家擦亮双眼。' `
  --output '.\projects\my-video\inputs\narration\part-01.wav'
```

不传 `--speaker`、`--speed` 和 `--seed` 时，脚本自动使用 `中文女 / 1.03 / 7`。输出包含：

```text
part-01.wav          最终可试听、可入片的 48 kHz 单声道 WAV
part-01.recipe.json  模型、参数、文字哈希、时长和输出哈希凭据
```

## 用文本文件

长一点的文案建议先保存为 UTF-8 文本文件，并保持它是已确认的最终原文：

```powershell
& $CvPython $Runner `
  --text-file '.\projects\my-video\inputs\narration\part-01.txt' `
  --output '.\projects\my-video\inputs\narration\part-01.wav'
```

先只检查参数、不加载模型、不写文件：

```powershell
& $CvPython $Runner `
  --text-file '.\projects\my-video\inputs\narration\part-01.txt' `
  --output '.\projects\my-video\inputs\narration\part-01.wav' `
  --dry-run
```

脚本默认拒绝覆盖已有 WAV 和凭据。确认要替换时显式加 `--overwrite`，旧文件仍建议先归档。

## 长口播怎么拆

不要把几分钟文案一次性塞给模型。按自然段拆成每段 1-3 句，通常是 8-25 秒，再分别生成：

```text
part-01.txt -> part-01.wav
part-02.txt -> part-02.wav
part-03.txt -> part-03.wav
```

这样更容易单独重做读错的句子，也能避免长段落后半段语速、气口或情绪漂移。分段位置优先选句号、问号、感叹号和明显的自然停顿，不要从词语中间硬切。

正式批量生成推荐使用 JSON batch manifest。runner 会先校验整个 manifest，只加载一次 `AutoModel`，然后为每段重新设置 `seed 7`，独立执行推理、两遍 loudnorm、WAV 校验和 receipt 写入。

将 manifest 放在项目根目录，例如 `voice.batch.json`：

```json
{
  "schemaVersion": "cosyvoice-zh-female-batch/v1",
  "segments": [
    {
      "id": "part-01",
      "textFile": "input/narration-parts/part-01.txt",
      "output": "audio/parts/part-01.wav"
    },
    {
      "id": "part-02",
      "textFile": "input/narration-parts/part-02.txt",
      "output": "audio/parts/part-02.wav",
      "receipt": "audio/parts/part-02.recipe.json"
    }
  ]
}
```

`textFile`、`output` 和 `receipt` 都相对 manifest 所在目录解析。禁止绝对路径、`..` 目录逃逸、重复 ID、重复输出路径，以及输出覆盖 manifest 或任一输入文本。未写 `receipt` 时默认使用 `<output-stem>.recipe.json`。

先验证整个批次，不加载模型、不写文件：

```powershell
& $CvPython $Runner `
  --batch-manifest '.\hyperframes-workflow-kit\projects\my-video\voice.batch.json' `
  --dry-run
```

确认所有路径、文本哈希和发音输入后再生成：

```powershell
& $CvPython $Runner `
  --batch-manifest '.\hyperframes-workflow-kit\projects\my-video\voice.batch.json'
```

批次执行不是事务：如果中途某段失败，已完成段会保留自己的 WAV 和 receipt，失败段及后续段不会被伪装为成功。修复后可为整个批次显式加 `--overwrite`，或使用单段 CLI 只重做失败段。

## 让中文听起来更自然

- 先人工校对文字。数字、英文缩写、产品名和多音字不要直接使用未经确认的 ASR 结果。
- 用中文逗号、句号、问号控制语义停顿；不要堆空格、重复逗号或大量省略号来强迫模型停顿。
- 一句过长时，从语义上改成两句。对 TTS 来说，清楚的句法通常比额外调速更自然。
- 同一段文字、同一环境和同一参数可复现 `seed 7` 的抽样；文字或标点变化后，音色身份仍相同，但停顿、音高和句尾表达会重新生成。
- 不要加 `--fp16`。本机 RTX 4060 Ti 上 CosyVoice FP16 曾生成全 NaN 音频；本脚本固定 FP32，并在非有限采样出现时直接失败。
- 不要改为流式生成。当前 CosyVoice 分支只有 `stream=False` 才会应用 `speed 1.03`。

## 如果要保留你的口播节奏

这时才需要录音。建议你正常口播，不要刻意模仿女声；你的录音负责内容、停顿、语速和重音，VC 负责向目标声线靠近。

1. 录制干净、单人、无背景音乐的口播。
2. 转成单声道 PCM WAV。
3. 准备 8-15 秒、有明确使用授权的普通话女性目标参考。
4. 用 [CosyVoice VC 教程](./06-cosyvoice.md) 转换并盲听。

需要注意：VC 可以接近目标音色，但不能保证与 SFT `14` 完全相同；男性源声转女性目标时，音域跨度越大，金属感、声调漂移和外语感风险越高。优先保证普通话和听觉舒适度，不要只看音高。

## 当前试听依据

`14` 是 `中文女 / speed 1.03` 在固定 `seed 7` 下的可复现抽样，试听时长约 5.11 秒，中位 F0 约 187 Hz。

![候选 14 波形](../../../experiments/E14-mature-female-voice-comparison/assets/waveforms/14-cosyvoice-sft-zh-female-speed103-seed7.png)

![E14 当前选择页](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page-lower.png)

原始试听文件：

```text
experiments\E14-mature-female-voice-comparison\outputs\listen\14-cosyvoice-sft-zh-female-speed103-seed7.wav
```

## 接入 HyperFrames

顺序必须跟随最终音频：

1. 先锁定最终文字，再生成所有分段 WAV。
2. 人工试听并修正读音、停顿和段落衔接。
3. 合并或冻结唯一最终 WAV，登记到目标视频项目的 `.media` 清单。
4. 对最终 WAV 重新转写，使用新时间戳安排字幕、镜头和动画。
5. 音频一旦重生成，即使文字相同，也要重新检查时长，不沿用旧 TTS 时间轴。

正式视频生产不要使用 WebUI 下载结果，必须使用本教程的 runner，以获得 NaN/Inf 失败保护、两遍响度归一化和 recipe 凭据。

- [CosyVoice 预设 14 + HyperFrames 最终视频教程](../../../docs/11-CosyVoice14与HyperFrames最终视频教程.md)
- [另一个智能体使用的配音交接契约](../../../hyperframes-workflow-kit/VOICE_HANDOFF.md)

正式发布前还要确认内置 `中文女` 的声音使用权边界。当前模型卡没有充分披露这个预置 speaker 对应声音提供者的授权链，因此本地制作和选型已通过，不等于商业发布授权已确认。
