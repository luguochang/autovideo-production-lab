---
workflow: general-video
flow: automation
storyboard: yes
message: "会搭工作流或做出 Demo，不等于具备构建和维护 AI 产品的工程能力"
destination: douyin-landscape
aspect: 1920x1080
language: zh-CN
audience: "AI 学习者、应届生，以及会使用低代码或工作流工具但尚未建立工程视角的人"
length: 239.909s
angle: engineering-explainer
voice: "CosyVoice preset 14, Chinese female, FP32, stream=false, speed=1.03, seed=7"
style_preset: modern-ip-host-explainer@1.0.0
---

## Intent

用固定 IP 主持人和现代流程动效解释：AI 降低了做出原型的门槛，但真正稀缺的是对边界、失败、数据、安全、成本和维护的系统理解。内部生产自主执行；成片在 HyperFrames Studio 完成最终审片。

## Assets

- `../../audio/narration.final.wav` - 唯一生产配音，时长和 SHA-256 由 production manifest 锁定。
- `../../plan/production-manifest.json` - 14 场景、46 cue 与全部输入哈希的生产入口。
- `../../plan/shot-manifest.json` - 精确字幕、主画面文字分类、姿势和时间源。
- `../../plan/graph-ir.json` - 四张流程图的稳定节点、边和状态合同。
- `../../../../../../demo/persondesign/persondesign/` - 用户提供的人物姿势源图，必须去背和归一化后使用。

## Customizations

- 固定底部精确字幕栏；主画面只呈现一个焦点关系。
- 使用 `viewport-change`、`svg-path-draw`、`card-morph-anchor`、`scale-swap-transition` 四条批准规则。
- 人工修改通过版本化 overrides 写回，重新编译只失效受影响的场景。

## Notes

- 只使用 `modern-ip-host-explainer@1.0.0` 与 `light-apricot`，不叠加第二套风格。
- 每个状态最多三个活跃流程节点，默认 replace before accumulate。
- `99%`、`90%`、`30K` 只能作为“创作者观点 / 未核验”原话，不得绘制为统计图或承诺。
- 公共发布在人物/声音权利和人工听审完成前保持阻塞；内部审片和技术交付允许继续。
