# HyperFrames 视频生成任务

## Input Lock

- Project ID: demoText-mainstream-landscape
- Narration path: `input/narration.txt`
- Narration normalized SHA-256: `30ca17f6327b947f1abb990162c65a81e07cf25421b8b74f33bf3c79bd9b0e4c`
- Ratio: 16:9
- Target duration: 20s
- Platform: 本地横屏主流风格探索
- Audience: AI 学习者和短视频知识内容观众
- Viewer must remember: 会拖节点，不等于懂系统
- Forbidden treatments: PPT 页面翻页、重复卡片网格、企业仪表盘、霓虹 HUD、闪白/闪黑、RGB glitch、粒子堆叠
- Reference video: `input/reference-style.mp4` (user-provided, style reference only)
- Hard output constraint: landscape `16:9`, `1920x1080`, 30fps

## Style Selection

- Base style ID: pending user selection from six mainstream landscape candidates
- Frame preset: none; the reference uses an authored illustrated canvas rather than a slide preset
- Add-on families: pending, maximum two scoped families
- Official registry items: `caption-editorial-emphasis`, `flowchart-vertical`, and `svg-path-draw` were evaluated as motion grammar only
- Scene blueprints: `spatial-pan-stations` was evaluated; candidates use one continuous illustrated world instead of page swaps
- Motion rules: `viewport-change`, `svg-path-draw`, `css-marker-patterns`, `card-morph-anchor`, and finite `stat-bars-and-fills`
- Status: `draft`

## Visual Thesis

参考片的视觉 thesis 是：一个持续存在的二次元讲解者把抽象系统拆成逐步出现的标签和关系，画面状态不断累积，但不切成 PPT 页面。观众先看到平台入口，再看到隐藏的模型调用、API、向量库和调度层，最后落到“会操作表面，不等于理解系统”。讲解者、底色和底部字幕轨持续保留到最后。

## Beat Plan

| Cue ID | Narration source range | Spoken intent | Visible operation | Existing object handoff | Registry/motion source | Terminal frame |
|---|---|---|---|---|---|---|
| B1 | 0.0-3.7s | 平台把系统复杂性隐藏起来 | 讲解者入场，标题像手写贴纸落位，背景保持连续 | 讲解者和画布保留 | `viewport-change`, `css-marker-patterns` | 讲解者 + 第一条论点 |
| B2 | 3.7-8.3s | 低代码、无代码、AI 平台、工作流 | 关键词沿手绘/漫画动线依次出现，主对象不清空 | B1 标签变成背景证据 | `svg-path-draw`, `card-morph-anchor` | 四个入口词形成关系 |
| B3 | 8.3-14.5s | 模型、API、向量库、工具链调度 | 由入口词拉出隐藏层，线条和小对象连续接入 | 入口和讲解者仍可见 | `svg-path-draw`, `viewport-change` | 四层工程底座连回入口 |
| B4 | 14.5-20.0s | 会拖节点，不等于懂系统 | 结论做一次有节奏的 punch-in，字幕与角色共同停住 | 全部关键关系保留 | `card-morph-anchor`, finite focus pulse | 结论落在连续画布上 |

## Screen Text

每条文字标记 `exact-source`、`approved-summary` 或 `generated-summary`。前三组字幕沿用冻结口播的 `exact-source`，结论画面文字 `会拖节点，不等于懂系统。` 标为 `generated-summary`。

## Asset Plan

| Asset ID | Purpose | Source/generator | License | Fallback | Status |
|---|---|---|---|---|---|
| `reference-style-video` | 抽取节奏、构图和字幕密度 | `demo/douyin_一颗小樱_7662366814240303323.mp4` | user-provided; style reference only | `experiments/reference-analysis/douyin-xiaoying/contact-10s.jpg` | frozen in `.media/video/video_001.mp4` |
| `original-vector-host` | 避免复制参考片人物，提供原创二次元讲解者 | project-local SVG illustration | project-generated | none | deterministic and reusable |
| `voice-excerpt` | 六个样片共用同一口播窗口 | existing project-generated Edge TTS excerpt | project-generated | `input/narration.txt` | copied and frozen |

## Review Gate

- Task status: `approved-by-request`
- Style status: `approved`
- Approved by: `user-request`
- Approved at: 2026-07-17
