# CosyVoice：普通话女声 VC 与内置中文女声

CosyVoice 在本机提供两种用途不同的模式：

## 内置 speaker 到底有几个

本机 `CosyVoice-300M-SFT` 的 `spk2info.pt` 实测包含 7 个 speaker：

| Speaker | 适合用途 |
| --- | --- |
| `中文女` | 唯一原生普通话女声；当前优先方向 |
| `中文男` | 普通话男声 |
| `粤语女` | 粤语女声；读普通话可能带粤语口音 |
| `英文女` | 英语女声；不作为标准普通话候选 |
| `韩语女` | 韩语女声；不作为标准普通话候选 |
| `日语男` | 日语男声 |
| `英文男` | 英语男声 |

所以“只有一个声音”需要分开理解：整个 SFT 模型不是只有一个 speaker，但原生普通话女性身份确实只有 `中文女`。改变 `speed`、seed 或标点可以改变节奏和抽样表达，不能把它变成另一个女性身份。需要更多普通话女性身份时，应使用有明确授权的女性参考做 CosyVoice VC/zero-shot，或使用 VoxCPM2、Qwen3 VoiceDesign 创建非特定真人声线。

| 模式 | 模型 | 输入 | 是否保留原口播节奏 | 适合用途 |
| --- | --- | --- | --- | --- |
| Voice Conversion（VC） | `CosyVoice-300M` | 源口播 WAV + 目标音色 WAV | 是 | 由本人控制停顿、重音和语速，只替换音色 |
| SFT 预置音色 | `CosyVoice-300M-SFT` | 文本 + `中文女` | 否 | 用内置普通话女声重新朗读，作为自然度基准 |

不要把两种结果直接当成同一种方案比较。VC 的内容和时长来自源录音；SFT 的节奏、停顿和时长由 TTS 模型重新决定。

## 本机安装位置

```text
tools/voice-lab/CosyVoice/
  .venv/                              Python 3.10、PyTorch 2.3.1+cu121
  run_local_test.py                   本地 SFT/VC 测试入口
  pretrained_models/
    CosyVoice-300M/                   Base 模型，负责 VC
    CosyVoice-300M-SFT/               SFT 模型，含“中文女”等预置音色
```

- 源码固定提交：`074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`
- Base 核心模型文件约 `2.14 GiB`
- SFT 核心模型文件约 `2.14 GiB`，另含 `spk2info.pt`
- 本机 GPU：RTX 4060 Ti 8 GB

在项目根目录设置命令变量：

```powershell
$CvRoot = Resolve-Path .\tools\voice-lab\CosyVoice
$CvPython = Join-Path $CvRoot '.venv\Scripts\python.exe'
```

查看当前脚本参数：

```powershell
& $CvPython (Join-Path $CvRoot 'run_local_test.py') --help
```

## 模式一：Base VC 保留本人节奏

VC 的源音频决定说了什么、在哪里停顿、重音和语速；目标参考音频主要决定音色。它对应官方接口：

```python
cosyvoice.inference_vc(source_wav, prompt_wav, stream=True)
```

### 准备源音频

`run_local_test.py` 最稳妥的输入是单声道 PCM WAV。原始文件是 M4A 时先转换，不要直接交给脚本；CosyVoice 内部使用 `soundfile` 后端，M4A 在 Windows 上不可靠。

```powershell
ffmpeg -y `
  -i 'C:\Users\90603\Documents\录音\录音.m4a' `
  -ac 1 -ar 24000 -c:a pcm_s16le `
  '.\experiments\my-voice-test\source.wav'
```

长口播先用 10-20 秒片段选音色。确定参考声线后，再按自然停顿分段转换整条音频，最后在停顿处拼接。

### 目标参考音频要求

- 8-15 秒连续普通话，单人、干净、无背景音乐、无混响。
- 采样率不低于 16 kHz；WAV 比有损压缩格式稳定。
- 音量正常，不削波，不要经过强降噪、电话滤波或变速。
- 包含自然陈述句，不要只给笑声、耳语、喊叫或极短词语。
- 目标说话人的语言应与正式内容匹配。普通话视频优先用普通话母语参考。
- 想要成熟舒服的女声，参考应是中低音、克制、稳定的正常口播，而不是单纯升高音高。
- 使用真人参考前，必须获得本人对“音色转换、生成衍生语音和公开发布”的明确授权。

### 运行 VC

```powershell
& $CvPython (Join-Path $CvRoot 'run_local_test.py') vc `
  --source '.\experiments\my-voice-test\source.wav' `
  --prompt '.\experiments\my-voice-test\target-female.wav' `
  --output '.\experiments\my-voice-test\cosyvoice-vc.wav'
```

脚本固定使用 `stream=True`，适合本机 8 GB 显存，也能降低整段非流式推理的峰值。`--speed` 默认 `1.0`；如果目标是保留本人节奏，不要用它修正说话速度。

## 模式二：SFT 内置 `中文女`

SFT 接收文本，不接收源口播。它适合回答“内置普通话女声能达到什么自然度”，不适合回答“能否保留我的语调和停顿”。官方没有把 `中文女` 定义为成熟声线。

```powershell
$Text = '我奉劝很多人对 AI 一定要有敬畏之心，也希望大家擦亮双眼。'

& $CvPython (Join-Path $CvRoot 'run_local_test.py') sft `
  --text $Text `
  --speaker '中文女' `
  --output '.\experiments\my-voice-test\cosyvoice-sft-zh-female.wav'
```

`中文女` 是脚本默认值，`--speaker` 可以省略。本机模型内还包含 `中文男`、`日语男`、`粤语女`、`英文女`、`英文男`、`韩语女`，但当前普通话女声实验只使用 `中文女`。

用于正式内容前，先人工校对文本。英文产品名、数字和缩写不要直接使用未经审核的 ASR 草稿，否则 TTS 会把识别错误稳定地朗读出来。

## 本机必须默认 FP32

不要在这台机器的正式测试中加 `--fp16`。

本机 RTX 4060 Ti / CUDA 12.1 实测 CosyVoice FP16 会让整段输出成为 `NaN` 非有限采样。文件保存函数虽然会用 `nan_to_num` 把这些值替换为零，避免写出损坏 WAV，但这只会得到静音或不可用候选，不能修复推理。

正确用法是保持默认 FP32：

```powershell
# 正确：不传 --fp16
& $CvPython (Join-Path $CvRoot 'run_local_test.py') vc `
  --source '.\source.wav' `
  --prompt '.\target.wav' `
  --output '.\vc-fp32.wav'
```

如果控制台出现以下提示，立即丢弃本次候选，并在新进程中去掉 `--fp16` 重跑：

```text
Replacing <非零数量> non-finite samples before saving
```

### 检查非有限采样

`run_local_test.py` 在写文件前执行：

```python
nonfinite = (~torch.isfinite(audio)).sum().item()
```

这是最关键的检查，因为 PCM WAV 保存前会把非法值清理掉。控制台只要报告非零数量，这次推理就判定失败，即使输出文件可以播放。

保存后还可以检查文件是否能正常解码，以及文件中是否仍有非有限采样：

```powershell
& $CvPython -c "import sys,torch,torchaudio; x,sr=torchaudio.load(sys.argv[1]); n=int((~torch.isfinite(x)).sum()); print(f'sr={sr} samples={x.numel()} nonfinite={n} peak={x.abs().max().item():.4f}'); raise SystemExit(1 if n else 0)" '.\vc-fp32.wav'
```

再用 FFmpeg 做一次完整解码：

```powershell
ffmpeg -v error -i '.\vc-fp32.wav' -f null -
```

## 配合 VoxCPM2 设计目标声线

没有已授权真人女声参考时，可以先让 VoxCPM2 Voice Design 生成一个不指向具体人物的成熟女声，再把它作为 CosyVoice VC 的 `--prompt`。这样由 VoxCPM2 设计音色，由你的原口播控制节奏。

先生成目标声线：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File '.\tools\voice-lab\VoxCPM\run-mature-female.ps1' `
  -Output '.\experiments\my-voice-test\voxcpm2-target.wav'
```

默认描述是：

```text
成熟稳重的普通话女性，中低音，温暖克制，纪录片口播，语速自然，不甜腻，不夸张，口齿清楚
```

再做 VC：

```powershell
& $CvPython (Join-Path $CvRoot 'run_local_test.py') vc `
  --source '.\experiments\my-voice-test\source.wav' `
  --prompt '.\experiments\my-voice-test\voxcpm2-target.wav' `
  --output '.\experiments\my-voice-test\cosyvoice-vc-voxcpm2.wav'
```

Voice Design 每次生成可能有差异。建议先生成 2-3 个短目标参考，只比较音色、齿音和长时间聆听舒适度，再把选中的一个用于整条 VC。VoxCPM2 目标本身仍是合成音频，CosyVoice 可能迁移部分合成质感；它不是消除“AI 味”的保证。

## E14 已有候选怎么听

E14 的 `outputs/raw` 保留模型原始采样率；`outputs/listen` 已统一为 48 kHz 单声道，适合直接做响度接近的 A/B。下面四个是 CosyVoice 候选：

![E14 成熟普通话女声对比页](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page.png)

| 编号 | 可试听文件 | 模式 | 说明 |
| --- | --- | --- | --- |
| `01` | `01-cosyvoice-vc-xiaoxiao-tech.wav` | Base VC | 用合成的 Xiaoxiao 普通话技术口播作目标参考；保留用户约 15 秒源口播节奏，作为常见神经女声基线 |
| `03` | `03-cosyvoice-vc-voxcpm2-target.wav` | Base VC | 用 `02-voxcpm2-mature-female.wav` 的 VoxCPM2 成熟女声设计结果作目标参考；保留用户节奏 |
| `05` | `05-cosyvoice-vc-voxcpm2-mid-target.wav` | Base VC | 用 `04-voxcpm2-mature-female-mid.wav` 的中音偏明亮目标作参考；保留用户节奏，重点比较女性音高和耐听度；它不等于成熟声线 |
| `06` | `06-cosyvoice-sft-zh-female.wav` | SFT `中文女` | 内置预置音色重新朗读文本；不保留用户节奏，只作为现成普通话女声对照 |

### 实测截图

截图中 `01`、`03`、`05` 是保留用户口播节奏的 CosyVoice VC，`06` 是不保留原节奏的 SFT 内置 `中文女` 对照。

![E14 对比页上半部分](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page-top.png)

![E14 对比页下半部分](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page-lower.png)

路径：

```text
experiments/E14-mature-female-voice-comparison/outputs/listen/
```

`01`、`03`、`05` 都约 14.98 秒，可以和 `00-original-15s.wav` 对齐比较；`06` 约 4.39 秒，内容和时长不同，只比较声线自然度、咬字和舒适度，不比较节奏保持。

推荐先盲听 `00 / 01 / 03 / 05`，选出最不疲劳且中文声调最稳的一版；再听 `06` 判断内置女声的自然度上限。不要因为某版更亮、更响就直接判为更自然。

## 授权边界

- CosyVoice 当前源码包含 Apache-2.0 许可证；模型卡也标注 Apache-2.0。许可证不等于任何具体真人音色的授权。
- `中文女` 是模型内置预置音色，但公开材料没有充分披露对应声音提供者及其发布授权链。可以本地评估，正式商业发布前仍需做权利确认。
- `01` 使用的 Xiaoxiao 属于云厂商预置神经声音，不是开源真人参考。它只适合作为本地对照，发布使用应遵守对应服务条款。
- VoxCPM2 的代码和模型卡标注 Apache-2.0，Voice Design 不需要复制具体真人，通常比来源不明的真人克隆模型风险低；仍不得通过描述刻意冒充公众人物或他人。
- 使用任何真人参考时，要保存授权人、录音来源、允许的用途、地域、期限和撤回方式。仓库许可证不能替代这份同意。
- 不要把来源不明的 RVC 模型、明星音色或网络截取语音作为正式目标参考。
- 对外发布的 AI 生成语音应按平台和适用规则进行标识，不得用于冒充、欺诈或虚假陈述。

## 最终接入 HyperFrames

人工确定唯一候选后，再进行响度归一化并重新转写。HyperFrames 的字幕、镜头和动画时间轴都应跟随最终 WAV，不要继续使用原录音或旧 TTS 的时间戳。

至少在项目媒体记录中保存：源录音哈希、目标参考来源、CosyVoice 模型、FP32、`speed=1.0`、输出哈希、人工选择理由和声音授权状态。
