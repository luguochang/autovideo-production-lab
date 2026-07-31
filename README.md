# AutoVideo Production Lab

一个面向中文知识讲解视频的实验与生产工作区，沉淀从文字稿、配音、字幕、视觉规划、程序化动效到媒体 QA 和交付复盘的完整工程证据。

仓库的目标不是宣称已经实现“无人审核、一键稳定出片”，而是保存已经实跑的代码、合同、文档、选型结论和失败经验，让新环境可以快速恢复并在现有基础上继续开发。

## 当前结论

- 文稿冻结、发音台账、CosyVoice 配音、alignment、字幕、HyperFrames 编译、FFmpeg QA 和标准包链路已经实跑。
- Remotion 实际生成过早期程序化动效样片；当前正式 RAG 长片使用 HyperFrames + GSAP 作为最终时间轴。
- RAG V1 和 Semantic V2 的机器 QA 已通过，但用户人工观感未通过，不能作为成熟视觉模板。
- 当前最重要的生产原则是：先做 30-60 秒代表性音画样片，人工通过后才扩展全片。
- 模型权重、虚拟环境、缓存、原始音视频、渲染成片和重复标准包不进入 Git；恢复方法见下文。

详细事实、选型、失败复盘和迁移边界见：

- [AutoVideo 全链路技术复盘与迁移复用手册](docs/24-AutoVideo全链路技术复盘与迁移复用手册.md)
- [GitHub 归档与新环境恢复手册](docs/25-GitHub归档与新环境恢复手册.md)

## 仓库包含什么

| 目录 | 内容 |
| --- | --- |
| `docs/` | 架构决策、生产 SOP、操作手册、技术复盘和恢复说明 |
| `scripts/` | 项目初始化、内容流程、QA、交付包装配和恢复脚本 |
| `tools/` | 自研内容、规划、OCR、配音交接和 HyperFrames 编译工具 |
| `workflow-console/` | React/Vite + Express 本地生产工作台 |
| `hyperframes-workflow-kit/` | 项目合同、提示词、真实项目元数据和 composition 源码 |
| `style-library/` | 风格、动效、素材来源和 schema |
| `experiments/` | E01-E20 的代码、配置、报告和小型图像证据 |
| `src/` | 早期 Remotion Composition 源码 |
| `tools/voice-lab/project-overlays/` | 从外部语音仓库中抽出的项目自有 runner、测试和本地适配 |

## 快速开始

### 1. 克隆和安装主工程

```powershell
git clone https://github.com/luguochang/autovideo-production-lab.git
cd autovideo-production-lab
npm.cmd ci
npm.cmd run console:build
```

### 2. 启动生产工作台

```powershell
npm.cmd run console:start
```

浏览器打开命令输出的本地地址。默认通常是 `http://127.0.0.1:3338/`；端口占用时以实际输出为准。

### 3. 恢复第三方源码

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\restore-third-party.ps1
```

该脚本只恢复已记录的上游源码版本，并安装项目自有 overlay；它不会下载几十 GB 的模型，也不会覆盖已经存在的目录。

### 4. 恢复配音环境和模型

先阅读：

- [新环境恢复手册](docs/25-GitHub归档与新环境恢复手册.md)
- [Voice Lab 入口](tools/voice-lab/README.md)
- [正式配音交接规则](hyperframes-workflow-kit/VOICE_HANDOFF.md)
- [CosyVoice 预设 14 教程](tools/voice-lab/tutorials/08-final-voice-14.md)

当前默认生产声线是：

```yaml
model: CosyVoice-300M-SFT
speaker: 中文女
precision: FP32
stream: false
speed: 1.03
seed: 7
postprocess: two-pass loudnorm, -16 LUFS, 48 kHz mono PCM WAV
```

模型文件必须从官方来源重新下载或从本地离线备份恢复。代码许可证不自动解决声音商业授权，公开发布前仍需独立确认。

## 新视频项目

聊天文字应先原样保存为 UTF-8 文件，再初始化项目：

```powershell
npm.cmd run video:new -- `
  --id <project-id> `
  --narration <path-to-narration.md> `
  --ratio 16:9 `
  --platform internal
```

恢复已有项目：

```powershell
npm.cmd run video:status -- --project <project-id>
```

之后读取 `hyperframes-workflow-kit/prompts/00-继续项目.md`，只执行下一个允许阶段。任何 narrated video 在生成音频或视觉时序前，都必须先读取 `hyperframes-workflow-kit/VOICE_HANDOFF.md`。

## 关键文档

### 首先阅读

- [全链路技术复盘与迁移复用手册](docs/24-AutoVideo全链路技术复盘与迁移复用手册.md)
- [标准生产 Runbook](docs/12-AutoVideo标准生产Runbook.md)
- [完整链路缺口与标准化矩阵](docs/13-AutoVideo完整链路缺口与标准化矩阵.md)
- [工作台用户操作手册](docs/21-AutoVideo工作台用户操作手册.md)
- [单屏样片验收操作手册](docs/22-单屏样片验收操作手册.md)
- [Text-to-One-Screen MVP 收口目标](docs/23-Text-to-One-Screen-MVP收口目标.md)

### 视频与风格

- [AutoVideo 标准化交接与复用手册](hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md)
- [风格注册表](style-library/STYLE_REGISTRY.md)
- [动效注册表](style-library/MOTION_REGISTRY.md)
- [高级动效库与开源组合路线](docs/16-高级动效库与开源组合路线.md)

### 真实 RAG 长片

- [RAG 初版复盘](hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2/RETROSPECTIVE.md)
- [30 阶段实跑记录](hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2/PIPELINE_RUN_LOG.md)
- [Semantic V2 重构任务](hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2/SEMANTIC_V2_TASK.md)
- [Semantic V2 编译器](hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2/production/semantic-v2/scripts/build-semantic-v2.mjs)
- [最终机器 QA](hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2/qa/semantic-v2/final-render-qa.json)

注意：Git 中保存的是项目合同、源码、报告和状态，不包含正式 WAV、MP4、`delivery/` 或 `archive/`。因此能完整复盘“做过什么、为什么这样选、哪里失败”，但不能仅靠 Git checkout 播放全部历史成片。

## Remotion 与 HyperFrames

Remotion 并非没有使用。`src/` 中保留了四个实际渲染过的 Composition：

- `KnowledgeVideo`
- `ReferenceStyleVideo`
- `CanvasStyleDemo`
- `FlowMotionDemo`

当前职责划分：

```text
早期 Demo 和程序化动效探针：Remotion
当前正式长片时间轴：HyperFrames + GSAP
媒体处理和最终文件 QA：FFmpeg / ffprobe
```

后续可用 Remotion 预渲染复杂局部动效，再由 HyperFrames 合成；不要在同一个全片中长期维护两套主时间轴。

## 测试和检查

主工程可按改动范围运行：

```powershell
npm.cmd run styles:validate
npm.cmd run test:content-pipeline
npm.cmd run test:production-compiler
npm.cmd run test:video-workflow
npm.cmd run console:build
```

音频自动测试必须保持 file-in/file-out，不得调用麦克风、自动播放音频或选择输出设备。

## 未进入 Git 的本地资产

当前原工作区约 80GB，主要大项包括：

- `tools/`：约 74GB，主要是模型、Python 环境和缓存；
- `hyperframes-workflow-kit/`：约 5.5GB，主要是 WAV、MP4、archive 和 delivery 副本；
- `experiments/`：约 2GB，主要是样片、依赖和浏览器缓存；
- `vendor/`：约 1GB，均可从精确上游 commit 恢复。

这些文件必须另做磁盘或对象存储备份。详细清单、上游 commit 和恢复顺序见 [新环境恢复手册](docs/25-GitHub归档与新环境恢复手册.md)。

## 发布边界

- 当前 RAG Semantic V2：`humanReviewPerformed=false`。
- 新增上下集衔接口播：`humanListeningPerformed=false`。
- 当前交付状态：`publicReleaseBlocked=true`。
- 机器 QA 通过只能证明技术文件合格，不能替代人工观看体验。
- 外部素材、声音和模型均需保留来源和许可证回执。

## License

本仓库暂未声明统一开源许可证。第三方项目、模型、素材和声音分别遵循各自许可证与授权条件，详见 `style-library/SOURCES.md`、`tools/voice-lab/SOURCE_RECEIPTS.md` 及各项目 receipt。

