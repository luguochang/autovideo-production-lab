# E10 demoText 三风格探针与验证记录

> 日期：2026-07-16  
> 实验：`experiments/E10-style-probes`  
> 状态：三条同口播风格探针已渲染并通过自动 QA；等待用户选定主风格或组合规则  
> 目的：先确认连续单画板的视觉语言，不在风格未确认前渲染完整口播

> 横屏扩展：三套原生 `1280x720` 版本及横竖屏审片切换见 `docs/06-E10横屏三风格探针与验证记录.md`。

## 1. 本轮交付

这次没有继续复用 E08 的统一章节卡片模板，而是针对同一个七秒口播窗口制作三套独立的视觉语法：

| 候选 | 风格 | 主要动作 | 成片 |
|---|---|---|---|
| A | 手绘连续画板 | 虚拟相机沿手绘路径巡讲，旧对象保留，终帧缩回总览 | `renders/A-handdrawn-board.mp4` |
| B | 杂志纸片拼贴 | 纸片拉出、胶带落定、荧光笔和证据框接力 | `renders/B-magazine-collage.mp4` |
| C | 编辑型数据简报 | 论点、层级条、数字证据和因果连线逐层建立 | `renders/C-editorial-data.mp4` |

三个版本都是同一张持续画板，没有卸载整屏、硬切下一页、闪白、闪黑或 glitch。它们不是换色皮肤：每版的空间布局、对象类型和动作语法分别实现。

本地审片页：`http://127.0.0.1:3301/review/`

审片页中的“全部播放”会把三条视频静音同步播放，避免浏览器的多媒体自动播放策略导致某一版启动失败。需要听口播时，单独播放任意一版并在原生视频控件中调整声音即可。

## 2. 输入锁定

| 项目 | 值 |
|---|---|
| 原文 | `demo/demoText.txt` |
| 原文规范化 SHA-256 | `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c` |
| 原始音频来源 | `experiments/E08-demo-candidates/shared/narration.wav` |
| 本次冻结音频 | `experiments/E10-style-probes/shared/narration-slice.wav` |
| 原音频时间窗 | `57.0486088s-64.2908627462s` |
| 精确口播 | `第一，平台把系统的复杂性给隐藏起来。低代码、无代码、AI平台、工作流工具，` |
| Voice | `zh-CN-YunxiNeural` |
| 规格 | `720x1280 / 30fps / 约 7.275s` |

本轮直接切取并复用已冻结的 Edge TTS 音频，没有重新请求 TTS，也没有调用大模型改写口播。画面中的 `模型调用`、`API连接`、`向量库`、`工具链`、`按钮 / 节点` 是基于原句的视觉标签，不替代口播原文。

## 3. 风格来源与组合方式

三版选择记录分别位于：

- `experiments/E10-style-probes/A-style-selection.json`
- `experiments/E10-style-probes/B-style-selection.json`
- `experiments/E10-style-probes/C-style-selection.json`

核心复用关系：

| 候选 | 本地风格规范 | HyperFrames 动效积木 |
|---|---|---|
| A | `handdrawn-workflow-tutorial` | `spatial-pan-stations`、`viewport-change`、`svg-path-draw`、`css-marker-patterns` |
| B | `magazine-collage-cards` | `card-morph-anchor`、`svg-path-draw`、`css-marker-patterns` |
| C | `editorial-data-report` | `stat-bars-and-fills`、`viewport-change`、`svg-path-draw` |

底层仍由 HTML/CSS/SVG/GSAP 构成，HyperFrames 负责可定位时间线、检查和渲染。这样后续可以把已审稿口播编译成结构化画板，也能保留用户修改文字、位置、图片与动效参数的入口。

## 4. 自动 QA 结果

三条成片均满足：

| 检查项 | 结果 |
|---|---|
| HyperFrames runtime / layout / motion | 通过 |
| HyperFrames keyframes | 通过；无 unresolved tween |
| WCAG 对比度 | A `83/83`、B `87/87`、C `79/79` |
| 视频 | H.264、`720x1280`、`30fps` |
| 音频 | AAC、`48kHz`、双声道 |
| 容器时长 | 三条均 `7.274667s` |
| FFmpeg 完整解码 | 通过 |
| 黑帧检测 | 三条均 `0` 个黑场区间 |
| 浏览器加载 | 桌面端三条均 `readyState=4` |
| 联播控件 | 三个 `play()` 请求均成功；采用静音同步预览以兼容自动播放策略 |
| 移动端审片页 | `390x844` 单列通过；无横向溢出，按钮、视频和文字均在容器内 |

机器可读报告：`experiments/E10-style-probes/qa/media-report.json`。

渲染关键帧和 contact sheet：`experiments/E10-style-probes/qa/rendered/`。

媒体 QA 可复跑：

```powershell
cd E:\project\study\codex\autoVideo\experiments\E10-style-probes
node .\scripts\verify-probes.mjs
```

单个候选的 HyperFrames 检查示例：

```powershell
cd E:\project\study\codex\autoVideo\experiments\E10-style-probes\variants\A-handdrawn-board
npx.cmd --yes hyperframes@0.7.59 check --snapshots --at 0,1.2,3,5.6,7.24 --json
npx.cmd --yes hyperframes@0.7.59 keyframes --json
```

## 5. 启动审片页

当前服务使用 `3301`，因为 `3300` 已被 E08 审片页占用。

```powershell
cd E:\project\study\codex\autoVideo\experiments\E10-style-probes
npx.cmd --yes http-server . -p 3301 -c-1
```

浏览器访问：`http://127.0.0.1:3301/review/`

## 6. 用户确认项

本轮只需要确认视觉语言，不需要确认口播内容。可以直接选择 A、B、C，也可以给出组合规则，例如：

- `A 为主，保留相机和手绘连线；不要终帧快速拉远。`
- `A 的持续画板 + B 的纸张和荧光笔；不要胶带抖动。`
- `A 的空间结构 + C 的数据条；字幕再小一点。`
- `三版都不对，保留某个具体动作，其余重做。`

确认时最好分别说明：主空间结构、喜欢的对象材质、相机速度、文字密度、字幕样式、需要删除的装饰动作、结尾是否必须展示全局画板。

## 7. 确认后的下一步

1. 将选定的 `baseStyle + allowed addons + rejected treatments` 写回 `STYLE_REVIEW.md` 和风格选择 receipt。
2. 用相邻的 20-30 秒口播窗口验证该风格能否承载连续多个信息点，而不先渲染全文。
3. 固化 `NarrationLock -> Visual Plan -> Board IR -> HTML/SVG/GSAP -> HyperFrames -> FFmpeg QA` 编译链。
4. 接入可编辑字段与用户锁：文字、位置、素材、动效预设和局部重生成。
5. 风格与编辑闭环确认后，再生成完整 `demoText.txt` 和 `1080x1920` 发布母版。

当前三版仍为 `draft`。在用户明确选择或组合前，不应把任何一版扩展为完整口播视频。
