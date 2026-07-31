---
workflow: general-video
flow: automation
storyboard: no
message: "RAG 是一条可控、可测、可迭代的数据链，不是一次检索接口调用"
destination: bilibili
aspect: 1920x1080
language: zh-CN
audience: "技术面试官和有工程经验的 AI 开发者"
length: "audio-driven"
angle: "沿数据流讲生产选型与组合判断"
---

## Intent

把用户提供的完整 RAG 口播制作成一条内容质量优先的技术讲解，不为满足固定分钟数强制删减。观众应记住离线建库、在线检索、智能体式决策、生成引用、评测与生产工程是一条相互约束的数据链，选型重点是组合判断而不是工具清单。最终时长由冻结后的旁白 WAV 决定。

## Assets

- `demo/RAG全链路口播-选型生产实践与提升.md` - 用户提供的完整来源稿，原样保留并作为全部生产主张的唯一内容来源。
- `input/narration.production.draft.txt` - 从来源稿第 0-14 节机械清理出的完整口播基线，用于追溯，不直接锁稿。
- `input/narration.editorial.draft.txt` - 保留 15 节结构、完成口语化、事实边界和全文可朗读性处理的推荐锁稿候选，SHA-256 `0bd400ff29c30be0161c3a927926dc09cc25a4f448cfaa35d6a46afc854f9c97`。
- `review/alternates/narration-5m-summary.draft.txt` - 已弃用的五分钟摘要备选，不进入当前生产。
- `style-library/styles/project/modern-ip-host-explainer/` - 已通过首条样片验证的固定主持人风格包。

## Customizations

- 15 个章节级稳定画板，对应来源稿第 0-14 节；每章内部渐进构建，只在章节边界换画板。
- 主动画载体按主线路径、解析分层、分块窗口、上下文前缀、向量空间、索引拓扑、查询分支、多路汇流、排名堆栈、精排漏斗、Agentic 状态机、引用标注、评测 trace、生产检查链和全链路总结轮换。
- 全片固定同一人物和左侧人物区；只在少数章节边界更换语义姿态。

## Notes

- 原稿约 5,988 个汉字；机械清理稿为 5,599 个汉字。推荐审稿候选把高频英文通用词改成中文并补充事实边界，不能继续套用原汉字语速公式；真实时长只认正式 WAV。
- 缺少公开来源回执的提升百分比、项目效果数字和客户名称，在 NarrationLock 前必须补来源、改为明确的个人经验陈述，或删除；当前仅允许内部审片。
- 禁止 PPT 翻页、频繁整页切换、频繁换人物、透明叠影、装饰性旋转、粒子和连续缩放。
- 中间决策由 AutoVideo 自主审核；`review/narration-review.md`、`review/pronunciation-preview.md` 和 `review/production-prompt.md` 已合并文字、发音和视觉决策。未经用户确认推荐候选，不生成正式 TTS。
