# GitHub 归档与新环境恢复手册

> 仓库：`https://github.com/luguochang/autovideo-production-lab`  
> 归档日期：2026-07-31  
> 目标：Git 保存代码、文档、合同和小型证据；大模型、依赖环境、缓存和成片通过来源与恢复清单管理。

## 1. 归档边界

本地工作区约 80GB，不能也不应该原样推送 GitHub。本次归档按以下规则划分：

| 类型 | GitHub | 原因 |
| --- | --- | --- |
| 自研源码、脚本、测试 | 提交 | 后续开发的核心 |
| Markdown、JSON schema、配置和合同 | 提交 | 能恢复决策与项目状态 |
| 小型截图、流程图和 QA 图像 | 提交 | 能支持复盘 |
| 第三方源码 | 不直接复制 | 用 URL + 精确 commit 恢复，避免仓库膨胀和许可证混淆 |
| 第三方代码上的项目修改 | 提交到 `project-overlays/` | 防止本地修改丢失 |
| 模型权重、索引、Python 环境 | 不提交 | 数十 GB，可重建且超过 GitHub 限制 |
| WAV、MP4 和其他音视频 | 不提交 | 大、重复、常含内部素材或授权边界 |
| `delivery/`、`archive/` | 不提交 | 含大量重复项目和媒体副本 |
| 缓存、浏览器目录、日志 | 不提交 | 可重建且可能包含会话信息 |
| `.env`、密钥和凭据 | 禁止提交 | 安全边界 |

GitHub 归档保证的是：能够知道做过什么、恢复工程代码、重建依赖并继续开发。它不是全部历史成片和模型的唯一备份。

## 2. 原工作区体积基线

2026-07-31 的顶层盘点：

| 目录 | 约占用 | 主要内容 |
| --- | ---: | --- |
| `tools/` | 74GB | TTS/VC/ASR 模型、多个 `.venv`、pip/uv/ModelScope 缓存 |
| `hyperframes-workflow-kit/` | 5.5GB | 项目音频、成片、archive、delivery 和 QA |
| `experiments/` | 2.0GB | E01-E20 源码、依赖、样片和探针输出 |
| `vendor/` | 1.0GB | HyperFrames、Motion Canvas、Revideo 等源码与依赖 |
| `demo/` | 217MB | 用户输入、规范和参考文件 |
| `projects/` | 172MB | 早期项目及媒体 |
| `workflow-console/` | 112MB | 工作台源码、依赖和运行数据 |
| `renders/` | 31MB | 早期 Remotion 成片 |

`.gitignore` 会过滤其中可重建或不宜上传的部分。任何本地清理操作都应在远端推送成功和离线资产备份完成后再进行；本次归档不会删除这些本地文件。

## 3. 新环境恢复顺序

### 3.1 克隆主仓库

```powershell
git clone https://github.com/luguochang/autovideo-production-lab.git
cd autovideo-production-lab
```

推荐环境：

- Windows 11；
- PowerShell 7 或 Windows PowerShell 5.1；
- Node.js 24.x；
- npm 11.x；
- Python 3.10/3.12，具体由语音工具决定；
- FFmpeg 与 ffprobe；
- Chrome/Chromium；
- NVIDIA GPU 和 CUDA 仅在本地 TTS/VC 推理时需要。

### 3.2 安装 Node.js 依赖

```powershell
npm.cmd ci
npm.cmd run console:build
```

不要把旧机器的 `node_modules/` 复制到新环境。使用锁文件重建。

### 3.3 恢复第三方源码

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\restore-third-party.ps1
```

默认恢复生产相关的四个语音源码仓库；加入研究用渲染仓库：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\restore-third-party.ps1 `
  -IncludeResearchVendors
```

脚本遵守以下安全规则：

- 目标目录已存在时不覆盖；
- 每个仓库 checkout 到归档记录的精确 commit；
- clone 完成后才复制项目 overlay；
- 不下载模型；
- 不创建 Python 虚拟环境；
- 不删除任何现有目录。

### 3.4 恢复正式 CosyVoice 预设 14

首先阅读：

- `hyperframes-workflow-kit/VOICE_HANDOFF.md`
- `tools/voice-lab/tutorials/08-final-voice-14.md`
- `tools/voice-lab/project-overlays/CosyVoice/README_OVERLAY.md`

必须恢复：

```text
tools/voice-lab/CosyVoice/
  .venv/
  pretrained_models/CosyVoice-300M-SFT/
  third_party/Matcha-TTS/
```

生产 runner：

```text
tools/voice-lab/CosyVoice/run_zh_female_seed7.py
```

固定参数：

```text
CosyVoice-300M-SFT
中文女
FP32
stream=false
speed=1.03
seed=7
两遍 loudnorm到 -16 LUFS
48kHz 单声道 PCM WAV
```

不要从旧 WebUI 下载文件充当正式资产。正式输出必须由 deterministic runner 生成，并保存逐段 receipt、merge manifest 和最终 WAV hash。

### 3.5 恢复可选语音工具

来源总表位于 `tools/voice-lab/SOURCE_RECEIPTS.md`。主要工具：

| 工具 | 上游 | 归档版本/证据 | 是否主链 |
| --- | --- | --- | --- |
| CosyVoice | `FunAudioLLM/CosyVoice` | `074ca6dc...31cc` | 当前 TTS 主链 |
| ClearerVoice-Studio | `modelscope/ClearerVoice-Studio` | `6b3774dc...5c61` | 可选增强 |
| Qwen3-TTS | `QwenLM/Qwen3-TTS` | `022e286b...488e` | 选型候选 |
| VoxCPM | `OpenBMB/VoxCPM` | `616d3d3e...d5fa` | 选型候选 |
| DeepFilterNet | `Rikorose/DeepFilterNet` | ZIP SHA 见 receipt | 可选降噪 |
| Seed-VC | `Plachtaa/seed-vc` | ZIP SHA 见 receipt | 可选 VC |
| RVC WebUI | `RVC-Project/...WebUI` | ZIP SHA 见 receipt | 可选 VC |

模型权重必须按各工具教程重新下载。不要把来源不明的 RVC 模型、真人参考声音或网络音频恢复为正式发布资产。

## 4. 精确第三方源码版本

| 本地目标 | 上游仓库 | Commit |
| --- | --- | --- |
| `tools/voice-lab/ClearerVoice-Studio` | `https://github.com/modelscope/ClearerVoice-Studio.git` | `6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61` |
| `tools/voice-lab/CosyVoice` | `https://github.com/FunAudioLLM/CosyVoice.git` | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc` |
| `tools/voice-lab/Qwen3-TTS` | `https://github.com/QwenLM/Qwen3-TTS.git` | `022e286b98fbec7e1e916cb940cdf532cd9f488e` |
| `tools/voice-lab/VoxCPM` | `https://github.com/OpenBMB/VoxCPM.git` | `616d3d3e630a9c96c2853250eef91b0f39dcd5fa` |
| `vendor/hyperframes` | `https://github.com/heygen-com/hyperframes.git` | `10b3351974766b0effd99dce6be356787c6af89c` |
| `vendor/hyperframes-student-kit` | `https://github.com/nateherkai/hyperframes-student-kit.git` | `a89e704ffbad02ac71170755526e05432598be59` |
| `vendor/motion-canvas` | `https://github.com/motion-canvas/motion-canvas.git` | `7b91435c301d530351dcf5ebb91dd139c002e405` |
| `vendor/revideo` | `https://github.com/midrender/revideo.git` | `b5de67a009a55aa2768a1e178b0446b2479a0b4e` |

这些目录不作为 Git submodule 提交，原因是主仓库需要保持轻量，且生产不依赖同时拉取全部研究仓库。

## 5. 项目 overlay

嵌套第三方仓库中的本项目文件已复制到：

```text
tools/voice-lab/project-overlays/
  CosyVoice/
  Qwen3-TTS/
  VoxCPM/
  ClearerVoice-Studio-experimental/
```

其中：

- CosyVoice overlay 包含正式 deterministic runner、Windows requirements、模型下载辅助、dry-run fixture 和测试；恢复脚本自动安装。
- Qwen3-TTS overlay 包含本地 README、来源回执和两个选型 sample runner；恢复脚本自动安装。
- VoxCPM overlay 包含来源回执、Voice Design runner 和 PowerShell 包装；恢复脚本自动安装。
- ClearerVoice overlay 保存旧机器上发现的四个修改文件，仅用于复盘，**默认不自动应用**。这些修改没有成为生产主链，其中部分 NumPy 调用看起来可能有问题，必须逐项评审和测试后才能使用。

## 6. 历史项目如何恢复

Git 中保留了项目的：

- NarrationLock 和输入文本；
- pronunciation、alignment、caption 等 JSON/Markdown 证据；
- storyboard、shot、Graph IR、layout 和 manifest；
- HyperFrames HTML/JS/CSS composition 源码；
- QA 报告、状态和人工门记录；
- 编译、打包和修复脚本。

Git 中不保留：

- `audio/**/*.wav`；
- `renders/**/*.mp4`；
- `delivery/`；
- `archive/`；
- 模型与 Python 环境。

因此在新环境执行：

```powershell
npm.cmd run video:status -- --project <project-id>
```

状态文件可能仍引用未恢复媒体。不要把“元数据存在”理解为“媒体已恢复”。若要重新渲染，必须先恢复或重新生成 hash 匹配的正式 WAV，再同步项目状态。

## 7. RAG 项目的特殊说明

项目：

```text
hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2
```

已保留代码和证据：

- 71 scenes / 237 cues / 1880.218s 初版记录；
- Semantic V2 上下集任务、编译器和 QA；
- 上下集分割点 `794.88s`；
- production manifest、状态和回执；
- 机器 QA 与最终文件 SHA。

未进入 Git 的主要媒体：

- 主体和分段 WAV；
- 上下集内部审片 MP4；
- raw render；
- standard package；
- archive 副本。

最终状态必须如实解释：机器 QA 通过，但用户人工观看体验未通过；`humanReviewPerformed=false`、`humanListeningPerformed=false`、`publicReleaseBlocked=true`。

## 8. 本地离线备份建议

GitHub 之外至少保留一份离线备份，优先级如下：

1. 用户原始输入和已批准 NarrationLock；
2. 无法重新获得的参考图片、录音和授权回执；
3. 唯一正式 WAV 和其逐段 recipe/receipt；
4. 最终内部审片 MP4；
5. 自训练或有合法授权的私有声音模型；
6. 下载成本很高但可公开重建的模型权重；
7. 可重建缓存和虚拟环境。

推荐备份到加密移动硬盘或对象存储，并为重要文件生成 SHA-256。不要把私有声音、凭据或用户资料上传到公开仓库。

## 9. 恢复后的最小验证

```powershell
npm.cmd ci
npm.cmd run styles:validate
npm.cmd run test:content-pipeline
npm.cmd run test:production-compiler
npm.cmd run test:video-workflow
npm.cmd run console:build
```

恢复 CosyVoice 后：

```powershell
& .\tools\voice-lab\CosyVoice\.venv\Scripts\python.exe `
  .\tools\voice-lab\CosyVoice\run_zh_female_seed7.py `
  --help
```

只做 file-in/file-out 测试，不调用麦克风、不自动播放音频、不选择输出设备。

## 10. 从仓库继续开发的顺序

1. 先读 `docs/24-AutoVideo全链路技术复盘与迁移复用手册.md`。
2. 不继续新增 P1/P2、更多框架或 20 项目规模审计。
3. 选择一段 30-60 秒高难代表窗口。
4. 用正式配音、字幕、人物和视觉规则做真实样片。
5. 人工观看通过后才扩展到一章和全片。
6. 成功规则在第二、第三个项目验证后，才晋升为全局模板。

恢复工程的目标不是复刻已经失败的长片页面，而是复用已经成熟的音频、合同、编译和 QA 基础设施，重新把视觉样片做对。

