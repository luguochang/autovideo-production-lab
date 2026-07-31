# HyperFrames 视频生成任务

## Input Lock

- Project ID: `demoText-f1-20s`
- Original source: `demo/demoText.txt`
- Original normalized SHA-256: `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Frozen excerpt: `input/narration.txt`
- Excerpt normalized SHA-256: `30ca17f6327b947f1abb990162c65a81e07cf25421b8b74f33bf3c79bd9b0e4c`
- Frozen audio: `input/narration-excerpt.wav`
- Original audio range: `57.0486088s-77.0486088s`
- Ratio / resolution / FPS: `9:16 / 720x1280 / 30fps`
- Target: seven F1 style-comparison videos, about 20 seconds each
- Audience: AI learners
- Remembered outcome: 会用工具不等于懂系统
- Forbidden: 闪白、闪黑、RGB glitch、粒子堆叠、静态 PPT 翻页

## Review Scope

The normal style probe is 3-8 seconds. The user explicitly requested about 20 seconds for every F1 style, so this task uses one shared 20-second narration window across all seven candidates. These are comparison probes, not seven full-narration productions.

## Visual Thesis

The viewer first sees the easy surface of low-code and workflow tools, then the interface opens to expose model calls, APIs, vector context, orchestration, state, failure, and maintenance. Every style ends on the same conclusion: a clean demo surface does not prove system understanding.

## Beat Plan

| Cue | Audio range | Spoken intent | Visible operation | Shared terminal state |
|---|---:|---|---|---|
| B1 | 0.0-3.7s | 平台隐藏复杂性 | Establish the style world and the thesis | `会拖节点 ≠ 懂系统` |
| B2 | 3.7-8.3s | 低代码、无代码、AI 平台、工作流 | Build the easy-entry surface | Four visible tool modules |
| B3 | 8.3-14.5s | 模型、API、向量库、工具链 | Expose the hidden system layers | Four engineering layers connected to the surface |
| B4 | 14.5-20.0s | 按钮节点造成误判 | Lock a concise conclusion | `会拖节点，不等于懂系统` |

## Screen Text

- Exact excerpts: the first three caption groups, sourced from the frozen narration window.
- Generated summary: `会拖节点，不等于懂系统。`
- Generated style-specific summaries include `界面很轻，系统并不轻` and `漂亮的 Demo，不等于可维护的产品`; they are visual summaries, not quotations.

## Official Reuse Evaluation

- Evaluated blocks: `flowchart-vertical`, `data-chart`.
- Evaluated components: `caption-editorial-emphasis`, `grain-overlay`.
- Reused motion rules: `viewport-change`, `svg-path-draw`, `css-marker-patterns`, `card-morph-anchor`, `stat-bars-and-fills`.
- The official blocks were not mounted because their authored content and dimensions do not match this shared portrait comparison.
- The official grain component was not pasted because it uses an infinite CSS animation, which conflicts with this project's deterministic-render rules.

## Quality Gates

- Run `hyperframes check --snapshots` for every variant.
- Inspect representative frames at `0, 3.5, 8.5, 14.5, 19.8` seconds.
- Verify H.264/AAC, 720x1280, 30fps, about 20 seconds, full decode, no black intervals, and readable Chinese captions.
- Keep style status `draft` until the user chooses a direction.

## Review Gate

- Task status: `approved-by-request`
- Style status: `pending`
- Approval receipt: user requested seven approximately 20-second style effects in this task.

