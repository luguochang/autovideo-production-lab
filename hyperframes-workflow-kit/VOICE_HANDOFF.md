# Agent Handoff: CosyVoice 14 -> HyperFrames

本文件是带中文旁白视频的执行契约。另一个智能体接手任务时，应先读根目录 `AGENTS.md`、本文件、`style-library/STYLE_REGISTRY.md` 和 `style-library/MOTION_REGISTRY.md`。

## 固定决策

```yaml
voice_route: text-to-speech
model: CosyVoice-300M-SFT
speaker: 中文女
precision: FP32
stream: false
speed: 1.03
seed: 7
postprocess: two-pass loudnorm, I=-16 LUFS, TP=-1.5 dB, 48kHz mono PCM
runtime: E:\project\study\codex\autoVideo\tools\voice-lab\CosyVoice\.venv\Scripts\python.exe
runner: E:\project\study\codex\autoVideo\tools\voice-lab\CosyVoice\run_zh_female_seed7.py
rights_status: needs-review
```

这是用户当前确认的文字配音默认值。只有用户明确覆盖时才能换 voice、speed、seed 或声音路线。

## 输入判断

```text
批准文字 / 文字口播稿
  -> 预设 14 TTS

录音，只保留内容
  -> ASR -> 人工校订 -> NarrationLock -> 预设 14 TTS

录音，必须保留本人停顿和重音
  -> 原声或合法授权 VC
  -> 不得声称是纯预设 14
```

不得把“录音转文字后重读”和“保留原节奏变声”混为一条路线。

## 必须执行的顺序

1. 若为新项目，先运行 `npm.cmd run video:new`，创建 `NarrationLock.json`。聊天文字先原样保存成 UTF-8 文件。
2. 校验项目比例；未明确覆盖时固定 `16:9 / 1920x1080 / 30fps`。
3. 扫描 NarrationLock 中所有拉丁 token，并在 `input/pronunciation.json` 区分字母缩写、完整英文单词、品牌/产品名、数字/版本混合词和代码标识符。未知普通英文词必须是 `needs-listening-review`，不能直接进入正式整段 TTS。
4. 从 NarrationLock 的冻结文字生成版本化配音候选；长文先按自然段拆成 8-25 秒、1-3 句的短段，再预检每个项目 part 只产生一个 CosyVoice 内部 utterance。中文 frontend 会删除换行并按约 80 个字符再次拆句，不能只按总时长判断。
5. 对每个候选完成格式、解码、响度、哈希、来源、发音和合并 receipt 技术 QA。生成器只写 `audio/voice-candidates/candidate-NNN/`，不得直接创建或覆盖正式 WAV。
6. 在工作台完成候选 A/B 人工听审：所有活动文件播放到结尾，选择一个 generated candidate，完成五项听感检查并明确接受。技术 QA、通用批准和批量 runner 均不能批准 `voice-final`。
7. 通过原子晋升冻结唯一 `audio/narration.final.wav`、正式 recipe、听审、批准、handoff 和项目状态。失败时恢复旧正式文件；进程中断后必须先完成事务恢复。
8. 只对已晋升最终 WAV 重新转写为 `audio/alignment.json`。原声/合法授权音频跳过 TTS 发音探针，但仍必须进入候选听审和正式晋升。
9. 用相同音频窗口创建 `VIDEO_TASK.md`、`STYLE_REVIEW.md`、静帧和 3-8 秒探针。
10. 任务和风格批准后才进入完整 HyperFrames 制作。
11. 让 scene duration、caption 和 motion cue 跟随最终 WAV/word timing。
12. `hyperframes check` 通过后打开 Studio。内部自主检查只允许渲染 `internal-review`；只有用户最终批准且公开权利清单通过后，才可渲染公开母版。

## 中英混读发音合同

- `AI / API / MCP / GPU` 等字母缩写逐字母读；`demo / agent / token / prompt` 等普通英文词按完整单词读，不得自动拆字母或替换成中文谐音。
- `demo` 的首选目标读法为 `/ˈdɛmoʊ/`，CMU 为 `D EH1 M OW0`；实际是否接受由原句上下文探针和用户听审决定。
- 品牌、产品、人名和数字混合词不得从拼写猜测，必须登记来源或人工批准的 spoken form。
- 当前 `autovideo-pronunciation/v2` 已覆盖 NarrationLock 中全部拉丁 token，并将生成词表、effective 词表、候选 manifest 和人工批准分开保存。`spokenAs` 与 `token` 相同只会进入听审，不会改变模型输入；`approved-default` 且两者不同时才按完整拉丁 token 边界替换并写入 recipe。
- 每个普通英文词/品牌词用原句上下文生成短探针。批准后才进入整段；ASR 拼写命中不能代替发音听审。
- 工作台的 `pronunciation-review` 是唯一批准入口：每个本地 WAV 候选必须手动播放到结尾、选择一个候选并明确接受。页面不得自动播放，不得调用麦克风或录音 API；自动化测试只允许导入音频文件、下载字节和校验哈希。麦克风测试必须等待用户明确授权。
- 工作台的 `voice-final` 也只读取导入/生成到项目的本地 WAV，控件使用 `preload=none` 且不自动播放。当前自动化测试不得调用麦克风、启动录音、调用浏览器播放或外放设备；只有用户后续明确授权，才能另行测试麦克风。
- 纯 `AI/API` 等字母缩写可生成 `machine-no-subjective-terms` 回执；出现任何普通英文词、品牌、版本或代码标识符时，标准批量路线必须停在人工门，不能调用通用批准接口。
- Fun-CosyVoice 3.0 的英文 CMU 音素 pronunciation inpainting 是后续独立候选，不属于当前 `CosyVoice-300M-SFT` 预设 14。采用时必须锁版本、按官方语法验证并重新检查声音身份、权利、确定性和全片时序。
- 不允许从另一位英文 speaker 单独生成一个词后硬剪接。若需换引擎，至少重生成包含该词的完整语义 part。

## 生产命令

正式生产从工作台运行 `voice-final` 生成步骤。工作台会创建下一个 `candidate-NNN`、调用下方 runner、写入候选 recipe/manifest 并执行技术 QA；不要直接把 runner 输出写到 `audio/narration.final.wav`。以下只展示低层 runner 的候选输出合同：

```powershell
$Root = 'E:\project\study\codex\autoVideo'
$ProjectId = '<project-id>'
$Project = Join-Path $Root "hyperframes-workflow-kit\projects\$ProjectId"
$CvPython = Join-Path $Root 'tools\voice-lab\CosyVoice\.venv\Scripts\python.exe'
$CvRunner = Join-Path $Root 'tools\voice-lab\CosyVoice\run_zh_female_seed7.py'
$Candidate = Join-Path $Project 'audio\voice-candidates\candidate-001'

& $CvPython $CvRunner `
  --text-file (Join-Path $Project 'input\narration.txt') `
  --output (Join-Path $Candidate 'narration.candidate.wav')
```

长口播拆段后使用一次加载模型的 batch 模式。`voice.batch.json` 内每段必须有唯一 ID、项目内相对 `textFile` 和 `output`，可选 `textSha256`、`receipt`：

```powershell
& $CvPython $CvRunner `
  --batch-manifest (Join-Path $Project 'voice.batch.json') `
  --dry-run

& $CvPython $CvRunner `
  --batch-manifest (Join-Path $Project 'voice.batch.json')
```

batch runner 只减少模型重复加载；它不取消逐段试听、独立 receipt、最终拼接 recipe 或 NarrationLock 对照。自然段之间不得直接无缝拼接：以有效语音边界计算 420-650ms 候选呼吸间隔，边缘只做 5-15ms 防点击 fade，禁止重叠语音音素。聚合 recipe 还必须记录内部 utterance 数、目标/实际间隔和 fade。

工作台生产分段默认上限已降为 70 字，并把自然段作为硬边界。runner 会在整批写文件前调用真实 CosyVoice frontend 做预检；任一项目 part 不是恰好 1 个内部 utterance，整批立即失败。多段合并已由 `tools/voice-lab/merge_breath_audio.mjs` 负责：测量有效语音边界，保留 60ms 头部和 100ms 尾部保护，插入静音使相邻有效语音间隔默认达到 560ms（允许 420-650ms），仅做 10ms 文件边缘 fade，再对完整合并结果做两遍 loudnorm。逐段 receipt、merge manifest、merge receipt 和最终 WAV 全部由 SHA-256 绑定，`build-audio-qa.mjs` 会拒绝旧式无间隔拼接或缺少单 utterance 证据的新版产物。

上述实现已经通过单元测试和三段真实 FFmpeg PCM 合并测试，但还没有替换当前样例的已冻结正式 WAV，也不能替代 A/B 人工听审。旧项目保留原音频和原时序；只有重新打开 `voice-final`、生成新候选、完成全候选听审并明确晋升后才采用新版正式 WAV。

WebUI `http://127.0.0.1:8772/` 用于试读；试听对比页是 `http://127.0.0.1:8771/`。**正式资产必须由 runner 生成**，因为 WebUI 下载不提供同一套 NaN/Inf 失败策略、两遍响度归一化和 recipe 凭据。

## 输出契约

最少必须存在：

```text
NarrationLock.json
input/narration.txt
audio/voice-candidates/index.json
audio/voice-candidates/review.json
audio/voice-candidates/candidate-NNN/candidate.json
audio/voice-candidates/candidate-NNN/narration.candidate.wav
audio/voice-candidates/candidate-NNN/voice.candidate.recipe.json
audio/narration.final.wav
audio/voice.recipe.json
audio/listening-review.json
audio/approval.json
audio/voice-promotion.json
audio-handoff.json
audio/alignment.json
.media/manifest.jsonl
.media/index.md
```

多段聚合 recipe 记录：part 顺序、每段 text SHA-256、每段 WAV SHA-256、模型参数、合并命令、最终 WAV SHA-256。

## 音频质量门

以下技术项任一失败都必须停止，不得进入 HyperFrames 全片；人工听审或公开权利未完成时，只能继续内部审片范围：

- 输出含 NaN/Inf、无法完整解码、全静音或明显削波。
- 不是 `48 kHz / mono / PCM`。
- 文字与 NarrationLock 不一致，或数字、英文缩写、产品名、多音字未人工确认。
- NarrationLock 中存在未登记的拉丁 token，或普通英文词/品牌词没有在原句上下文中试听接受。
- 试听未确认普通话、句尾、齿音、停顿和耐听度。
- 长口播的项目 part 被 CosyVoice 再拆成多个内部 utterance，或段间实际呼吸间隔没有进入聚合 recipe。
- 正式发布但 speaker 声音权利仍未完成审核。

参考基准：E14 候选 14 的已批准测试文本输出为 `5.1084s`，listening SHA-256 为：

```text
582031149997BA5814EFE6CE5BB90FD3FEEE8C1AB7D66C98C7B4C1511C028EAC
```

该哈希只验证相同测试文本、模型和环境；新文案不得要求命中此哈希。

## 转写契约

中文禁止使用 `.en` Whisper 模型：

```powershell
npx.cmd hyperframes transcribe `
  (Join-Path $Project 'audio\narration.final.wav') `
  --engine whisper --model small --language zh --json |
  Set-Content -Encoding utf8 (Join-Path $Project 'audio\alignment.json')
```

任何音频重生成都使 `alignment.json`、字幕 cue、scene duration 和 motion timing 失效。全部重新派生，不做手工平移补偿。

## HyperFrames 接入契约

- `<audio>` 必须是顶层 composition root 的直接子元素。
- 音频不得放入子 composition、`<template>` 或包装 `<div>`。
- 不得自行调用 `audio.play()`、`pause()` 或 seek；HyperFrames 管理播放。
- `data-duration` 使用 `ffprobe` 的真实时长。
- captions、scene boundaries 和 animation beats 来自 `alignment.json`。
- style probe 必须使用与正式项目相同的 WAV、比例、FPS 和同一时间窗口。
- 只用一个基础风格；附加组件家族最多两个。
- 优先复用官方 frame preset、registry block、blueprint 和 motion rule。
- 最终门禁使用 `hyperframes check`，不得使用已弃用的 `inspect`。
- `check` 通过后先交付 Studio 预览；用户批准前不得渲染公开母版。需要异步审片时，可生成带 `internal-review` 命名和 `internal-only` 回执的内部版本。

顶层音频示例：

```html
<div data-composition-id="main" data-duration="<seconds>" style="width:1920px;height:1080px">
  <audio
    id="narration"
    class="clip"
    src=".media/audio/voice/voice_001.wav"
    data-start="0"
    data-duration="<seconds>"
    data-track-index="10"
    data-volume="1"
  ></audio>
</div>
```

## 显存与服务

RTX 4060 Ti 只有 8GB。CosyVoice FP32 推理时，先暂停 Seed-VC `7861` 和 RVC `7862`；生成结束后再按需恢复。不要为省显存改用 FP16，本机 FP16 曾生成整段 NaN。

模型和缓存必须留在 E 盘。不得把新模型或 ModelScope/Hugging Face 大缓存默认写入 C 盘。

## 改动失效矩阵

| 改动 | 必须重做 |
| --- | --- |
| 改文字或标点 | NarrationLock 新版本、TTS、音频 QA、alignment、字幕、时间轴 |
| 改 speaker/speed/seed | TTS、音频 QA、alignment、字幕、时间轴 |
| 只改画面风格 | 风格探针、style approval、composition；音频不变 |
| 只改某个画面对象 | 对应 composition、check、snapshot、最终预览 |
| 改最终 WAV 文件 | alignment、字幕、所有依赖时长的 scene/motion |

## 继续项目

```powershell
npm.cmd run video:status -- --project <project-id>
```

读取项目 `project-state.json` 和 `hyperframes-workflow-kit/prompts/00-继续项目.md`，只执行下一个允许阶段。不要跳过 NarrationLock、任务审批、风格审批、音频 QA、媒体台账或最终预览。

完整人类教程见 [`docs/11-CosyVoice14与HyperFrames最终视频教程.md`](../docs/11-CosyVoice14与HyperFrames最终视频教程.md)。
