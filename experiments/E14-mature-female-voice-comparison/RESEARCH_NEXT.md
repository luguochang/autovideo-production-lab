# E14 下一轮普通话成熟女声候选

调研日期：2026-07-18

## 范围与结论

本轮只考虑免费获取、可完全本地推理、明确支持中文，并且相对当前 VoxCPM2、CosyVoice-300M-SFT 有实际新增价值的模型。

执行更新：首选 `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` 已下载到 E 盘并完成本机 BF16 + SDPA 短句测试，新增为 E14 `13`。加载和生成均通过 8GB 显存门槛，峰值 reserved 约 4.24 GiB；最终听感仍需用户盲听，不因技术通过而自动替换 `02/06`。

推荐顺序：

1. `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`：唯一同时满足普通话、从零设计音色、可用自然语言明确指定成熟中低音女性、模型 Apache-2.0 的首选。
2. `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`：只在取得有明确授权的成熟普通话女性参考录音后测试。它是更强的零样本 TTS/克隆模型，不是无参考 Voice Design。
3. `SparkAudio/Spark-TTS-0.5B`：可直接按 female + low pitch + moderate speed 创建虚拟女声，8GB 风险较低，但模型仅允许非商业用途，不进入正式视频发布链路。
4. `IndexTeam/IndexTTS-2`：中文和情绪/时长控制有价值，但需要参考音频，权重更大且使用自定义 bilibili 许可；暂不作为下一轮安装目标。

## 候选对比

| 顺序 | 精确模型 ID | 成熟女声能力 | 中文能力 | 模型下载规模 | 许可证结论 | RTX 4060 Ti 8GB 判断 |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | 无需真人参考；自然语言设计音色、情绪和韵律，可明确要求成熟、稳重、中低音、温暖克制 | 官方支持 Chinese，Voice Design 模型支持 10 种语言 | 4,520,164,607 B，4.21 GiB | 模型卡和 ModelScope 元数据均为 Apache-2.0 | 边缘可行。BF16 权重本身约 4.21 GiB，运行还需 KV cache、激活和 CUDA 工作区；必须关闭其他语音服务。Windows SDPA 的余量小于官方推荐的 FlashAttention 2，短句可能可用，但必须先做只加载和 1 句探针，不能承诺稳定 |
| 2 | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` | 依赖目标 `prompt_wav` 决定音色；instruct 可控制情绪、速度、音量和语言，但不能凭描述从零造出成熟女性身份 | 官方支持中文、9 种常用语言和 18+ 中文方言/口音 | 完整快照 9,747,517,123 B，9.08 GiB，含 base/RL 和 ONNX 重复部署文件 | 代码仓库为 Apache-2.0；当前 ModelScope 模型元数据 License 为空，模型快照也无 LICENSE。正式发布前需先澄清权重许可 | 模型核心为 0.5B，单模型流式推理有希望；但本机旧 CosyVoice FP16 曾输出 NaN，若必须 FP32，8GB 风险上升。只建议独立环境、短句、单进程测试 |
| 3 | `SparkAudio/Spark-TTS-0.5B` | 无参考 Voice Creation 可控制 gender、pitch、speaking rate；可从 female + low pitch + moderate speed 起测 | 官方支持中文和英文 | 3,945,451,778 B，3.67 GiB | 模型卡明确为 CC-BY-NC-SA-4.0，仅非商业；代码仓库 Apache-2.0 不会覆盖模型限制 | 较可能可行。下载权重小于 Qwen 1.7B，但仍同时加载 LLM、BiCodec 和 wav2vec2；需实测峰值。仅研究试听 |
| 4 | `IndexTeam/IndexTTS-2` | 零样本克隆、情绪和时长控制强；需要授权女性参考，不是无参考成熟声线设计 | 模型卡支持中文和英文 | 5,895,819,486 B，5.49 GiB | 模型卡未声明标准许可证；仓库使用 bilibili Model Use License Agreement，包含规模阈值和用途限制 | 高风险。1.5B 主模型加声学模型接近显存上限，8GB Windows 环境不应排在 Qwen VoiceDesign 前面 |

## 为什么先测 Qwen3-TTS 1.7B VoiceDesign

当前安装的 `Qwen3-TTS-12Hz-0.6B-CustomVoice` 只有 Serena/Vivian 等固定 speaker，而且 0.6B 运行时代码会忽略 `instruct`。`1.7B-VoiceDesign` 是不同模型：调用 `generate_voice_design`，直接接收中文音色描述，不需要复制真人声音。

建议首轮控制词保持单一、可比较：

```text
成熟稳重的普通话女性，中低音，音色温暖有厚度，语气克制自然，像面对面讲解而不是播音，不甜腻，不尖锐，句尾自然收住
```

首轮只生成同一段审核后中文文本的 3 个 seed，统一响度后与 E14 的 `02 / 03 / 07 / 08` 盲听。它仍是 TTS 重生成，不保留用户原口播的停顿和时长；如果音色胜出但节奏不胜出，再把选中的短样本作为 CosyVoice VC 目标做第二阶段验证。

### 8GB 执行门槛

- GPU 总显存为 8,188 MiB；本次调研时空闲约 6,273 MiB，当前状态不足以给 1.7B 留出可靠余量。
- 测试前关闭 Qwen 0.6B、CosyVoice、Seed-VC、RVC、VoxCPM2 和其他占用 GPU 的 Python 进程。
- 先做完整模型加载，不生成音频；记录加载后的 `memory_allocated` 和 `memory_reserved`。
- 加载成功后只生成一条短句，禁用 batch，并使用 BF16。若 SDPA OOM，不在当前 Windows 环境强行编译 FlashAttention，也不直接进入全量下载之外的量化改造。
- 只有加载和一条短句都稳定，才把它加入 E14 新候选。

## CosyVoice3 的适用边界

CosyVoice3 官方模型卡声称相对 CosyVoice2 提升内容一致性、说话人相似度和韵律自然度；官方表中 `Fun-CosyVoice3-0.5B-2512` 的中文 CER 为 1.21%、speaker similarity 为 78.0%，旧 CosyVoice2 为 1.45% / 75.7%。这些是官方自报指标，只能证明值得做本机 A/B，不能替代人工听感。

它的 `inference_instruct2` 仍要求 `prompt_wav`。因此：

- 有授权成熟普通话女性参考：值得排第二，直接测试自然度和中文韵律是否优于当前 CosyVoice-300M VC。
- 只有 VoxCPM2/Qwen 合成参考：提升可能有限，因为目标参考的合成质感也会被迁移。
- 没有授权参考：不应为了“复制别人的成熟声音”从网络截取真人音频。
- 权重许可证未在当前模型元数据或快照内明确前，不进入正式 HyperFrames 发布资产。

## Spark-TTS 为什么只做研究候选

Spark-TTS 是少数不需要参考音频、能直接用 gender/pitch/speed 创建虚拟音色的 0.5B 中文模型。它对“成熟中低音女性”的控制形式比固定 Serena/Vivian 更匹配，也比 Qwen 1.7B 更容易适配 8GB。

但官方模型卡明确说明模型许可已经从 Apache-2.0 改为 CC-BY-NC-SA-4.0：只能非商业使用，衍生物需同许可发布并署名。代码仓库的 Apache-2.0 不能抵消模型权重的非商业限制。因此它最多用于个人研究盲听，不作为可复用的正式视频配音方案。

## 暂不进入下一轮的方案

- `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`：比 0.6B 可接受 instruct，但 Serena/Vivian 的基础身份仍是官方描述的年轻女声；不如直接测试 1.7B VoiceDesign。
- `IndexTeam/IndexTTS-2`：适合有授权参考的克隆、情绪与时长控制，但下载 5.49 GiB，8GB 风险高，且许可不是标准开源许可证。
- 来源不明的 RVC 女声、明星/主播模型：即使免费，也缺少真人声音授权，不进入正式选型。
- ChatTTS、F5-TTS 等旧方案：没有同时在成熟声线可控、普通话自然度、许可证清晰度和本机投入上超过上述前三项。

## 官方来源与核对方法

- Qwen3-TTS 仓库与模型说明：<https://github.com/QwenLM/Qwen3-TTS>，模型 `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`。
- CosyVoice 仓库与模型说明：<https://github.com/FunAudioLLM/CosyVoice>，模型 `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`。
- Spark-TTS 仓库与模型说明：<https://github.com/SparkAudio/Spark-TTS>，模型 `SparkAudio/Spark-TTS-0.5B`。
- IndexTTS2 仓库与模型说明：<https://github.com/index-tts/index-tts>，模型 `IndexTeam/IndexTTS-2`。
- 下载规模来自 2026-07-18 使用 ModelScope `HubApi.get_model_files(..., recursive=True)` 对当前 master 文件清单逐项求和；目录项按 0 B 计算。
- 许可证以模型卡/模型元数据优先，代码仓库许可证仅说明代码，不自动覆盖模型权重或真人声音权利。
