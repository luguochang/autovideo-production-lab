# demoText 主流横屏风格探索

这是针对参考视频 `demo/douyin_一颗小樱_7662366814240303323.mp4` 的第二轮风格探索。六个候选都使用同一段 20 秒锁定口播，统一输出 `1920x1080 / 16:9 / 30fps`。

## 直接查看

- 评审页：`http://127.0.0.1:3303/review/`
- 总览图：`review/stills/contact-final.png`
- MP4：`review/probes/`
- 候选说明：`STYLE_REVIEW.md`
- 参考片分析：`STYLE_ANALYSIS.md`
- 媒体报告：`qa/media-report.json`

服务器未运行时，在本项目目录执行：

```powershell
npx.cmd --yes http-server . -p 3303 -c-1
```

## 六个候选

- A `anime-sticker-explainer`：最接近参考片的原创二次元讲解者 + 标签路径
- B `manga-panel-pop`：漫画线框、对话气泡、冲击字和 punch-in
- C `chibi-desk-live`：Q 版桌面、应用对象和聊天气泡
- D `creator-cutout-pop`：创作者贴纸、粗描边、大字和标记线
- E `lofi-anime-night`：暖暗夜景、屏幕光和轻微景深
- F `motion-comic-depth`：前中后景、连续路径和空间漫画镜头

## 后续触发

对话中可以直接说：

```text
继续 demoText-mainstream-landscape，选择 A
```

或指定组合，例如：

```text
以 A 为基础，借用 D 的贴纸快切，但保持横屏
```

A 已由用户确认，项目级 `style-selection.json` 已写入并进入 `storyboard-ready`。高质量横屏交付位于 `production/final/demoText-mainstream-landscape.mp4`；后续修改仍从这个项目继续，不需要重新做风格探索。

## 约束和来源

- 横屏 `16:9` 是本工作区当前默认硬约束；此项目不接受竖屏或方形输出。
- 参考视频只用于节奏、构图、标签密度和讲解方式分析，不复制参考人物、Logo 或原画。
- 讲解者是项目内原创的确定性 SVG，便于后续统一换装、换姿态和换场景。
- 原始口播通过 `NarrationLock.json` 保持不变；前三组字幕是 `exact-source`，结论画面是 `generated-summary`。
- 官方 HyperFrames 技能刷新因当前环境连接 GitHub 超时，已按本地已安装版本继续并记录在 QA 中。
