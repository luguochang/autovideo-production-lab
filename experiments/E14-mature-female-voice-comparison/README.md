# E14 成熟普通话女声对比

本实验使用用户提供的 `录音.m4a` 做本地、免费、开源模型短样测试。没有调用付费 API，也没有复制名人或未授权真人音色。

试听页：<http://127.0.0.1:8771/>

![E14 试听页上半部分](./assets/comparison-page-top.png)

![E14 试听页下半部分](./assets/comparison-page-lower.png)

## 当前人工优选

- `14`：当前暂定最终使用。它采用 CosyVoice 内置 `中文女`、FP32、非流式生成、`speed 1.03` 和固定 `seed 7`；以后只提供确认后的文字即可生成。
- `10`：上一轮明确反馈“挺不错”的优选；与 `14` 使用同一 speaker 和速度，但没有固定抽样 seed，现保留为历史候选。
- `02`：VoxCPM2 Voice Design 的成熟中低音普通话女声；`06`：CosyVoice SFT 内置 `中文女` 的原始基线。两者都保留为历史候选。
- `14/10/02/06` 都是 **TTS 重生成**，不会保留原口播的停顿、语速和重音。若必须保留本人节奏，需要提供录音并改走 `17` 或原有 `03/05` CosyVoice VC 路线。
- `14` 的本地选型已确认，但不等于正式发布授权已确认；内置 speaker 的声音权利来源仍需在商业发布前核对。

## 先听哪些

| ID | 路线 | 时长 | 中位音高 | 关键判断 |
| --- | --- | ---: | ---: | --- |
| 00 | 原声 | 15.00s | 120 Hz | 本人停顿、重音和普通话基线 |
| 02 | VoxCPM2 成熟中低音女声 | 5.12s | 177 Hz | 直接生成是否自然、舒服、不过度播音腔 |
| 03 | 02 目标 + CosyVoice VC | 14.98s | 153 Hz | 保留本人节奏，但女性感可能偏低 |
| 05 | 04 目标 + CosyVoice VC | 14.98s | 211 Hz | 保留本人节奏且女性感更明确，优先盲听 |
| 06 | CosyVoice 内置 `中文女` | 4.39s | 193 Hz | 现成固定音色基线 |
| 07 | Qwen3-TTS Serena | 5.36s | 276 Hz | 温暖柔和，但官方定位偏年轻 |
| 08 | Qwen3-TTS Vivian | 6.48s | 238 Hz | 明亮略锐，同样偏年轻 |
| 09 | CosyVoice `中文女` · speed 0.94 | 4.66s | 193 Hz | 沿 06 做轻微节奏邻近测试 |
| 10 | CosyVoice `中文女` · speed 1.03 | 4.70s | 182 Hz | 上一轮优选；同音色、同速度但未固定 seed |
| 11 | VoxCPM2 成熟松弛女声 · seed 17 | 5.28s | 177 Hz | 沿 02 减少播音腔、放松句尾 |
| 12 | VoxCPM2 成熟松弛女声 · seed 73 | 6.56s | 169 Hz | 同一描述的更低、更慢种子候选 |
| 13 | Qwen3-TTS 1.7B VoiceDesign 成熟女声 | 5.76s | 193 Hz | 新模型：按中文提示设计成熟中低音虚拟女声 |
| 14 | CosyVoice `中文女` · speed 1.03 · seed 7 | 5.11s | 187 Hz | 当前暂定最终使用；可复现抽样 |
| 15 | CosyVoice `中文女` · speed 1.03 · seed 42 | 5.15s | 183 Hz | 与 10 同 speaker/速度，只比较抽样表达 |
| 16 | CosyVoice `中文女` · speed 1.03 · seed 73 | 4.89s | 191 Hz | 与 10 同 speaker/速度，只比较抽样表达 |
| 17 | 10 目标 + CosyVoice VC | 14.98s | 161 Hz | 尝试保留本人节奏并接近 10 的声线 |

`01` 仍使用上一轮 Xiaoxiao 合成参考，只保留为技术基线。`04` 是为组合 VC 准备的高音目标，它本身偏亮，不代表“成熟”的最终方向。

## 测试结论

- 要完整保留你原口播的停顿、语速和重音，优先比较 `03` 与 `05`。两者都是 CosyVoice VC；`05` 的女性音高更明确。
- 接受重新生成节奏时，当前直接使用 `14`；`10/02/06` 保留为历史对照。`09/10` 只沿 CosyVoice 内置中文女做小幅 `speed` 变化；`11/12` 沿 VoxCPM2 成熟中低音方向增加松弛交谈感、减弱播音腔；`13` 用 Qwen3 1.7B 从中文描述直接设计非特定真人声线。
- `02` 的目标描述是“成熟稳重、普通话、中低音、温暖克制、自然语速、不甜腻”；`04` 刻意改成“中音偏明亮”以观察 VC 后的女性感。
- CosyVoice 的 `speed` 不是简单的音频拉伸，生成过程也有采样波动，因此 `09/10` 的实测时长不必随参数单调变化。不要看参数猜好坏，直接盲听句尾、停顿和齿音。
- 当前 SFT 模型共有 7 个内置 speaker，但原生普通话女声只有 `中文女`。`粤语女/英文女/韩语女` 强行读普通话容易引入口音，因此没有加入本轮正式普通话候选。
- `14-16` 不是三种新音色，而是 `10` 同一音色的三种可复现抽样；人工最终选中了其中的 `14`。`17` 仍是历史上用“10 的声线”和“你的原口播节奏”做的组合验证，不因当前选择而改写生成事实。
- 自然度、AI 味和听觉舒适度不能仅凭音高判断，最终以页面盲听评分为准。

所有 TTS 候选使用同一段已交叉检查的明确文本：

> 我奉劝很多人对 AI 一定要有敬畏之心，也希望大家擦亮双眼。

完整 ASR 原稿和 21 个时间段见 `transcript.txt`、`transcript.json`。原录音的英文产品名有识别歧义，因此本轮没有擅自猜改后用于 TTS。

## 使用技巧

1. 先勾选“盲听”，只比较普通话、自然度、女性感和耐听度，不看模型名称。
2. 第一遍只听前两句的齿音、鼻音和句尾；第二遍重点听停顿是否像真人思考，而不是逐字念稿。
3. 对 `03/05` 重点听 8-12 秒的混合中英文段，检查是否保留原咬字且没有外语口音。
4. 不要直接比较音量。页面使用 `outputs/listen/` 中统一到目标 `-16 LUFS` 的版本。
5. 先选路线，再微调。若 `05` 节奏最好但声音太亮，下一轮只在 VoxCPM2 目标描述和种子上做 3-5 个短样，不重新跑全部工具。

## 安装与教程

- [VoxCPM2：成熟女声 Voice Design](../../tools/voice-lab/tutorials/05-voxcpm2.md)
- [CosyVoice：保留口播节奏的 VC 与内置中文女](../../tools/voice-lab/tutorials/06-cosyvoice.md)
- [Qwen3-TTS：Serena / Vivian 与 1.7B VoiceDesign](../../tools/voice-lab/tutorials/07-qwen3-tts.md)
- [最终预设 14：以后只给文字即可生成](../../tools/voice-lab/tutorials/08-final-voice-14.md)

安装位置：

- `tools/voice-lab/VoxCPM`
- `tools/voice-lab/CosyVoice`
- `tools/voice-lab/Qwen3-TTS`

## 接入 HyperFrames

十八个试听 WAV 已通过 `media-use resolve --from ... --type voice` 登记为本实验 `.media/audio/voice/voice_001.wav` 至 `voice_018.wav`。

当前选中的 `14` 对应 `voice_015`。目标视频项目仍应重新登记自己的最终成片 WAV，不要直接跨项目引用实验目录。

选中候选后的顺序：

1. 从 `outputs/listen/` 取最终 WAV，并登记到目标视频项目的 `.media` 清单。
2. 对最终 WAV 重新运行 `hyperframes transcribe`，不要复用旧 TTS 或原声时间戳。
3. 以最终音频时间戳驱动字幕、镜头切换和 GSAP 时间线；直接 TTS 候选和 VC 候选时长不同，不能只替换音频文件而不重排画面。
4. 正式制作前先用同一 10-15 秒窗口做画面节奏探针，确认字幕密度和停顿处动画，再生成完整 51.93 秒配音。

详细来源、参数和哈希见 [PROCESSING_RECEIPT.md](./PROCESSING_RECEIPT.md)。

## 启动

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\project\study\codex\autoVideo\experiments\E14-mature-female-voice-comparison\start-comparison.ps1
```
