---
workflow: general-video
flow: automation
storyboard: yes
message: "会搭工作流或跑通 Demo，不等于具备构建和维护 AI 产品的能力。"
destination: douyin-landscape
aspect: 16:9
language: zh-CN
audience: "AI 学习者、应届生和低代码/工作流使用者"
length: 3.220s
style_preset: modern-ip-host-explainer
---

## Intent

验证固定 IP 主持人模板能否在 cue-010 的真实口播窗口内清楚解释“平台隐藏系统复杂性”，并为正式 14 场全片冻结项目级画面密度、字幕栏和动效节奏。

## Assets

- `assets/host-explain.png` — 已去背并归一化的主持人讲解姿势，放在 `host.left`。
- `.media/audio/voice/voice_001.wav` — 最终 CosyVoice 音轨 `49.340-52.560s` 的物理切片。
- `assets/gsap.min.js` — 本地冻结的 seek-safe GSAP 运行时。

## Customizations

- 使用 `svg-path-draw` 解释隐藏连接关系。
- 使用 `viewport-change` 在终态轻微聚焦三层系统节点。
- 平台按钮压缩为上下文锚点，再揭示系统层。

## Notes

- 固定 `1920x1080 / 30fps / light-apricot`。
- 字幕逐字使用 cue-010，不生成替代字幕。
- 不使用网络素材、统计图、卡片墙、纸纹或额外风格家族。
- 当前仅用于内部项目探针；声音和人物公开发布权仍未清。
