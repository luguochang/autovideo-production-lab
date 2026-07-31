# Qwen3-TTS：Serena / Vivian 与 1.7B VoiceDesign

本机同时安装了 `Qwen3-TTS-12Hz-0.6B-CustomVoice` 和 `Qwen3-TTS-12Hz-1.7B-VoiceDesign`。前者提供 Serena/Vivian 固定中文女声，后者能用自然语言从零设计成熟中低音虚拟女声。两者都是 TTS 重生成，不是 Voice Conversion（VC）：不会保留原口播的停顿、重音、语速和时长。

| 能力 | 本机 0.6B 模型 |
| --- | --- |
| 文本生成普通话配音 | 支持 |
| 内置女声 | `Serena`、`Vivian` |
| 保留原录音节奏 | 不支持，属于 TTS 重生成 |
| `instruct` 风格提示词 | 不支持，运行时代码会强制设为 `None` |
| 复制外部真人音色 | 不支持；需要另用 Base/克隆模型且必须有授权 |

| 能力 | 本机 1.7B VoiceDesign |
| --- | --- |
| 文本生成普通话配音 | 支持 |
| 成熟中低音女声 | 支持用中文 `instruct` 直接设计 |
| 保留原录音节奏 | 不支持，属于 TTS 重生成 |
| 复制外部真人音色 | 不需要，也不应在提示词中要求模仿可识别真人 |

## 本机安装位置

```text
tools/voice-lab/Qwen3-TTS/
  .venv/                                      Python 3.10 隔离环境
  run_custom_voice_sample.py                  Serena / Vivian 测试入口
  run_voice_design_sample.py                  1.7B VoiceDesign 测试入口
  README_LOCAL.md                             本机安装说明
  SOURCE_RECEIPT.md                           来源、许可证和哈希记录
  pretrained_models/
    Qwen3-TTS-12Hz-0.6B-CustomVoice/          官方 0.6B 模型
    Qwen3-TTS-12Hz-1.7B-VoiceDesign/           官方 1.7B VoiceDesign 模型
  outputs/                                    脚本生成的 WAV
```

- 官方源码提交：`022e286b98fbec7e1e916cb940cdf532cd9f488e`
- 模型文件：14 个，共 `2,498,389,167` 字节
- 本机运行时：Python `3.10.20`、PyTorch `2.3.1+cu121`、ONNX Runtime `1.18.0`、NumPy `1.26.4`
- 本机 GPU：RTX 4060 Ti 8 GB
- 详细文件哈希见 `tools/voice-lab/Qwen3-TTS/SOURCE_RECEIPT.md`

在项目根目录设置命令变量：

```powershell
$QwenRoot = Resolve-Path .\tools\voice-lab\Qwen3-TTS
$QwenPython = Join-Path $QwenRoot '.venv\Scripts\python.exe'
$QwenRunner = Join-Path $QwenRoot 'run_custom_voice_sample.py'
```

先做不加载模型、不占用显存的参数检查：

```powershell
& $QwenPython $QwenRunner --dry-run
```

输出中应明确出现：

```text
speaker=Serena
language=Chinese
instruct=<unsupported by 0.6B CustomVoice; omitted>
seed=42
```

## Serena 与 Vivian 怎么选

官方描述都明确偏年轻，并不是专门的“成熟中低音女声”：

| Speaker | 官方描述 | 本地用途 |
| --- | --- | --- |
| `Serena` | 温暖、柔和的年轻中文女声 | 先测舒适度、亲和感和长时间聆听疲劳 |
| `Vivian` | 明亮、略带锐度的年轻中文女声 | 测清晰度、穿透力和齿音是否过强 |

不要仅凭名字或描述预判实际音高。音高还会受到文本、标点、采样随机性和生成语气影响；“更高”也不等于“更女性”或“更自然”。

## 生成 Serena 样例

默认脚本使用约 10-15 秒设计长度的原创中文测试文本，并固定 `seed=42`：

```powershell
& $QwenPython $QwenRunner --speaker Serena
```

默认输出：

```text
tools/voice-lab/Qwen3-TTS/outputs/qwen3-tts-serena-sample.wav
```

## 生成 Vivian 样例

使用相同文本和 seed，只更换预设音色：

```powershell
& $QwenPython $QwenRunner --speaker Vivian
```

默认输出：

```text
tools/voice-lab/Qwen3-TTS/outputs/qwen3-tts-vivian-sample.wav
```

也可以传入自己的审核后文本：

```powershell
& $QwenPython $QwenRunner `
  --speaker Serena `
  --text '今天我们用更自然的方式，把这件事情慢慢讲清楚。'
```

选音色时，两版必须使用完全相同的文本和 seed。先统一响度，再比较普通话声调、句尾、齿音、自然度和耐听度。

## 0.6B 不支持 instruct

不要给当前脚本增加 `--instruct`，也不要声称它能通过“成熟、稳重、不播音腔”等提示词改变风格。

虽然部分模型卡文字和示例仍展示了 `instruct`，但当前官方运行时代码会在识别到 0.6B 模型时强制执行：

```python
if self.model.tts_model_size in "0b6":
    instruct = None
```

因此，0.6B 的可控项主要是固定 speaker、文本内容、标点和随机种子。想用自然语言真正设计年龄、音域和表达风格，应使用已安装的官方 `1.7B-VoiceDesign`；它仍然属于 TTS 重生成，不会继承用户原录音节奏。

## 1.7B VoiceDesign 成熟女声

先只加载模型并记录显存，不生成音频：

```powershell
$VoiceDesignRunner = Join-Path $QwenRoot 'run_voice_design_sample.py'
& $QwenPython $VoiceDesignRunner --load-only
```

本机实测加载后约为 `3985 MiB allocated / 4112 MiB reserved`。生成一条同文本短句：

```powershell
& $QwenPython $VoiceDesignRunner `
  --seed 42 `
  --output '.\voice-design-mature-female.wav'
```

默认中文控制词：

```text
成熟稳重的普通话女性，中低音，音色温暖有厚度，语气克制自然，像面对面讲解而不是播音，不甜腻，不尖锐，句尾自然收住
```

提示词只描述年龄感、音域、质感和表达方式，不写真人姓名、主播名或“像某某”。需要微调时一次只改一个维度，例如先改句尾松弛度，再改语速；不要同时堆叠十几个形容词。

## E14 实测结果

E14 页面将原声、VC、Voice Design 和固定 TTS 音色放在同一页面做响度接近的 A/B。页面顶部说明了源口播 15 秒、统一试听响度 `-16 LUFS`、源声中位音高 `120 Hz` 和 RTX 4060 Ti 8 GB 环境。

![E14 成熟普通话女声对比页顶部](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page-top.png)

Qwen3-TTS 两个候选位于页面下方：

![E14 Qwen3-TTS Serena 与 Vivian 候选](../../../experiments/E14-mature-female-voice-comparison/assets/comparison-page-lower.png)

| 编号 | 文件 | 中位 F0 | 时长 | 结论边界 |
| --- | --- | --- | --- | --- |
| `07` | `07-qwen3-serena.wav` | `276 Hz` | `5.36 秒` | 温暖柔和预设；官方仍描述为年轻女声 |
| `08` | `08-qwen3-vivian.wav` | `238 Hz` | `6.48 秒` | 明亮略锐预设；官方仍描述为年轻女声 |
| `13` | `13-qwen3-1.7b-voice-design-mature-female.wav` | `193 Hz` | `5.76 秒` | 中文提示设计的成熟中低音非特定真人声线 |

试听路径：

```text
experiments/E14-mature-female-voice-comparison/outputs/listen/
```

`07` 的本次 F0 高于 `08`，不代表 Serena 永远比 Vivian 音高更高。这里的 F0 是当前样本有声段的中位统计，只能解释这一次生成结果。两版时长也不同，说明 TTS 重新决定了停顿和语速；它们不能用于证明“保留了用户口播节奏”。

## 8 GB 显存使用建议

0.6B 与 1.7B 两个脚本都使用 PyTorch SDPA，不依赖 Windows 上难安装的 FlashAttention。1.7B 本机实测生成峰值约为 `4163 MiB allocated / 4242 MiB reserved`；这不包含桌面显示等非 PyTorch 占用，运行前仍应关闭其他 GPU 语音服务。

- 运行前关闭 Seed-VC、RVC、CosyVoice、VoxCPM2 等占用 GPU 的服务。
- 一次只生成一个 speaker，不要批量并发。
- 先用 10-15 秒文本选型，再处理正式长稿。
- 长稿按自然段分段生成；每段人工检查漏字、重复、数字和英文发音。
- 若出现 CUDA out of memory，先确认其他 Python 进程没有占用显存，再缩短文本；不要立即降低音频质量参数。

## 常见问题

### `flash-attn is not installed`

本机脚本使用 `attn_implementation="sdpa"`，这条提示不影响当前测试。不要为了消除提示而在 Windows 上盲目编译 FlashAttention。

### `c10.dll` 或 ONNX Runtime DLL 初始化失败

本机已验证组合是 PyTorch `2.3.1+cu121`、ONNX Runtime `1.18.0`、NumPy `1.26.4`。不要直接升级到另一套 Torch、ONNX Runtime 或 NumPy 后仍假设兼容。环境损坏时优先核对 `README_LOCAL.md` 的固定版本。

### 提示找不到 SoX

SoX `14.4.2` 已通过 WinGet 安装到当前用户目录。新 PowerShell 会自动获得路径；旧终端未刷新时，`run_custom_voice_sample.py` 也会尝试查找 WinGet 安装位置。

### 输出仍然有明显 AI 味

0.6B 不能靠 `instruct` 修成成熟声线。可做的只有：

1. 在 Serena / Vivian 中选更舒服的一版。
2. 把长句拆短，用正常中文标点控制可读性。
3. 避免堆叠感叹号、省略号和过度情绪化文案。
4. 若仍不满意，评估 1.7B VoiceDesign，或回到“本人录节奏 + CosyVoice VC + 已授权普通话女性参考”的路线。

### 为什么不能跟原口播对齐

Qwen3-TTS CustomVoice 根据文本重新朗读。若视频已经按原录音剪好，换成 Serena / Vivian 后必须重新转写并调整画面时间轴。需要保留原节奏时，应使用 CosyVoice VC，而不是当前 TTS 模型。

## 许可证与内置音色边界

- Qwen3-TTS 官方仓库使用 Apache-2.0；本机 ModelScope 模型元数据也标注 Apache-2.0。
- Apache-2.0 说明代码和模型权重的使用条件，不等于自动获得任何外部真人声音、姓名、人格或肖像的使用授权。
- Serena / Vivian 是官方内置 speaker ID。公开材料没有提供足以独立核验的声音提供者、训练数据和同意链详情。可以进行本地技术评估；正式商业发布前仍需核对最新版模型条款、平台规则和适用的声音权利要求。
- 不要宣称 Serena / Vivian 是某位真人，也不要通过文案或后处理刻意冒充公众人物、同事、客户或其他可识别个人。
- 若改用声音克隆模型，只能使用本人录音，或已书面授权用于音色克隆、生成衍生语音和公开发布的录音。仓库许可证不能替代这份授权。
- 对外发布 AI 生成语音时，按平台和适用规则进行标识，不得用于冒充、欺诈或虚假陈述。

## 接入 HyperFrames

先完成人工盲听，只选择一个最终 WAV。不要把 Serena 和 Vivian 同时塞进正式项目，也不要在画面已经定时后临时更换音色。

1. 对最终 WAV 做响度归一化和完整解码检查。
2. 把最终 WAV 注册为项目本地 voice 资产，而不是引用模型输出目录。
3. 重新转写最终 WAV，使用新词时间戳安排字幕、镜头和动画。
4. 在项目媒体记录中保存文本、speaker、language、seed、模型提交/权重哈希、输出哈希、人工选择理由和授权状态。

使用 `media-use` 冻结本地输出的示例：

```powershell
$MediaResolve = Join-Path $env:USERPROFILE '.codex\skills\media-use\scripts\resolve.mjs'
$FinalWav = Resolve-Path '.\tools\voice-lab\Qwen3-TTS\outputs\qwen3-tts-serena-sample.wav'
$VideoProject = Resolve-Path '.\projects\your-video-project'

node $MediaResolve --type voice --from $FinalWav --project $VideoProject
```

注册完成后，以 `.media` 返回的冻结路径作为 HyperFrames composition 的音频来源，并让 HyperFrames 管理播放和 seek。字幕和视觉节奏必须跟随这一个最终文件；不要沿用原口播、E14 试听文件或另一 speaker 的旧时间戳。

如果最终目标仍是“保留我的口播节奏，只换成自然普通话女声”，Qwen3-TTS 只能作为女声自然度对照。正式链路应改为原口播源文件加 CosyVoice VC，并使用有明确授权的普通话女性参考音频。
