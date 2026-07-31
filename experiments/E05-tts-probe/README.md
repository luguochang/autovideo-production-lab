# E05 Edge TTS 完整口播探测

本实验验证 `demo/demoText.txt` 的完整中文口播能否在不调用大模型、不使用 API Key 的情况下生成：

- WebM/Opus 与 MP3 音频；
- 词级和句级时间戳；
- 适合成片的短语级 SRT/VTT、句级诊断 SRT；
- 可核验的原文 SHA-256、时长及分段清单。

脚本逐行请求 Edge 在线朗读接口，减少长请求中断概率，再由 FFmpeg 解码并拼接。输入文本只做 XML 转义，不改写口播内容。

## 复现

在仓库根目录运行：

```powershell
npm.cmd install
node experiments/E05-tts-probe/generate.mjs
```

指定声音、语速和输出目录：

```powershell
node experiments/E05-tts-probe/generate.mjs `
  --voice zh-CN-YunxiNeural `
  --rate 1.08 `
  --output experiments/E05-tts-probe/output/yunxi-108
```

前置条件：Node.js 20.11+、项目依赖中的 `msedge-tts`、PATH 中可执行的 `ffmpeg`/`ffprobe`，以及 Node.js 进程能连接 Microsoft Edge Read Aloud 服务的网络。FFmpeg 需要包含 `libopus` 和 `libmp3lame`。浏览器能走代理不代表 Node.js 一定能访问该服务，应以脚本实跑为准。无需 Docker、Python、大模型或 API Key。

## 验证结果

2026-07-16 本机实测：

| 项目 | 结果 |
| --- | --- |
| 输入 | `demo/demoText.txt`，1,563 个字符、1,536 个非空白字符、14 个非空行 |
| 声音 / 语速 | `zh-CN-XiaoxiaoNeural` / `1.05` |
| 完整音频时长 | 301.029 秒（约 5 分 01 秒，按实际解码采样数计算） |
| 词级 / 句级时间点 | 810 / 46 |
| 成片短语字幕 | 126 条，0.84–5.11 秒/条，无重叠、无孤立标点 |
| 服务逐句文本与锁定原文 | 去除空白后完全一致 |
| 音频解码 | WebM/Opus 与 MP3 均通过 FFmpeg 全量解码 |

离线复核已有产物：

```powershell
node experiments/E05-tts-probe/verify.mjs
```

输出位于 `output/xiaoxiao-105/`。`manifest.json` 是流水线入口；音频使用 `narration.webm` 或 `narration.mp3`，动画可读取 `words.json`，成片字幕使用 `captions.json`、`subtitles.srt` 或 `subtitles.vtt`。`sentences.json` 和 `sentences.srt` 保留服务端句级边界用于追溯。

原始音频实测综合响度约 `-19.69 LUFS`、真峰值 `-0.26 dBTP`，且在 `-45 dB / 1 秒` 条件下未发现异常长静音。最终与背景音乐混音时应统一到约 `-16 LUFS`、真峰值不高于 `-1.5 dBTP`，不需要为此重新请求 TTS。

这份口播约五分钟，对应 30 fps 时间线约 9,031 帧。若每个候选风格都全量渲染，会显著拉长调参周期；风格确认阶段宜共用此 TTS 时间轴先渲染 30–45 秒代表片段，确认后再渲染完整五分钟成品。代表片段只能裁切时间轴，不能改写原文。

## 与 E08 成品的关系

本目录保留的是首轮 `zh-CN-XiaoxiaoNeural / 1.05` 独立探测产物。三套完整候选实际使用的是 `experiments/E08-demo-candidates/shared/` 中的 `zh-CN-YunxiNeural / 1.08` 配音，时长 `274.394667` 秒。E08 已复用同一份锁定原文并通过成片级 QA；不要把两个 voice/rate 的时长混为同一条时间轴。

Edge Read Aloud 是在线公共服务，没有字节级可复现承诺。若只是继续审片或调动画，应复用已冻结音频和时间戳；只有明确更换 voice/rate 时才重新请求 TTS。
