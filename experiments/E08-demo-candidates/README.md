# E08 - demoText 三套连续画板成品候选

## 目标

完整使用 `demo/demoText.txt` 的口播，不改写正文。共享同一份 Edge TTS 音频和时间戳，分别生成三套 9:16、持续单画板的视觉候选：

- `A-system-map`：工程地图巡讲，沿知识路径移动并保留旧节点。
- `B-whiteboard-mindmap`：中心白板脑图，围绕核心论点展开分支。
- `C-diagnostic-console`：工程诊断台，用日志、测试和检查项解释五个原因。

开发确认版规格为 720x1280、30 fps、H.264 + AAC。选定风格后再输出 1080x1920 最终母版。

## 现有成品

- `renders/final/A-system-map.mp4`
- `renders/final/B-whiteboard-mindmap.mp4`
- `renders/final/C-diagnostic-console.mp4`
- `renders/previews/`：三条约 35.6 秒同时间窗快速对比版
- `qa/style-comparison.png`：同一时刻三版对比图
- `qa/report.json`：原文、轨道、帧数、黑帧、转场亮度和完整解码检查

这里的 `renders/final/` 表示 E08 实验内经过响度归一化的审片交付版，仍是 `720x1280`，不是未来的 `1080x1920` 发布母版。

本机审片页：`http://localhost:3300/review/`。若服务未启动，在本目录运行：

```powershell
npx.cmd --yes http-server . -p 3300 -c-1
```

## 重建 TTS、完整成片与核心 QA

前置条件：Node.js 22+、npm、PATH 中可用的 `ffmpeg`/`ffprobe`，以及 npm、HyperFrames 和 Edge Read Aloud 的网络访问。仅查看现有 MP4 和 QA 报告不需要联网。

```powershell
cd E:\project\study\codex\autoVideo\experiments\E08-demo-candidates
npm.cmd ci --ignore-scripts --no-audit --no-fund
$env:TTS_VOICE = 'zh-CN-YunxiNeural'
$env:TTS_RATE = '1.08'
npm.cmd run tts
npm.cmd run build

foreach ($variant in @('A-system-map', 'B-whiteboard-mindmap', 'C-diagnostic-console')) {
  Push-Location "variants\$variant"
  npm.cmd run check
  npm.cmd run render -- --output "..\..\renders\$variant.mp4" --quality standard --workers 2 --crf 22
  Pop-Location
}

npm.cmd run normalize
npm.cmd run verify
```

`npm run tts` 会访问在线服务，并可能得到与现有文件不同的音频字节或边界。只调视觉时应保留 `shared/narration.json`、`shared/audio.webm` 和 `shared/narration.wav`，从 `npm run build` 开始。

以上命令重建三条完整视频和 `qa/report.json`。当前 35 秒预览、poster、contact sheet、风格对比图和字幕边界抽帧尚未收敛成独立生成脚本，属于下一步需要补齐的可复现资产链。

`qa/report.json` 是媒体与原文 QA，不等于 HyperFrames 的布局/对比度检查。当前 A、C 的 `check` 通过；B 的 `check` 退出码为 0，但仍报告 5 个 WCAG 对比度 warning 和 24 个有意遮挡/安全区相关 info，选定 B 或混合风格后需要修正并重新渲染。

部分 `variants/*/snapshots/finding-*` 是早期检查遗留图，不能代表当前状态；以重新运行 `npm.cmd run check` 的输出为准，后续应将历史 findings 迁入单独的 QA history。

## 事实源

- 口播：`../../demo/demoText.txt`
- 视觉摘要：`src/chapters.json`
- 配音与时间戳：`shared/narration.json`
- 生成器：`scripts/build-variants.mjs`

模型 API 不是本实验的必要前置条件。屏幕摘要只服务画面，不替代或修改 TTS 的原始口播。

完整结果、SHA-256、限制和下一步见 `../../docs/03-demoText三套成品与验证.md`。
