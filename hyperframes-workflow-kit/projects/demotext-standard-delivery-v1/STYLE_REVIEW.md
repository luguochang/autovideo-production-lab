# 项目风格探针评审

## Review Scope

本项目不重新比较多个基础风格。`template-lock.json` 已锁定 `modern-ip-host-explainer@1.0.0` 与 `light-apricot`；本轮只验证该模板在本稿“隐藏复杂性”内容上的项目级适配。模板包与项目探针均已记录内部自主评审，但该 reviewer 不是用户，也不构成公共发布批准。

## Shared Test Window

- Narration path / SHA-256: `input/narration.txt` / `92334cb2a8231d77a5e7d138775d020d8427463fd1fd3b844c8ed0aa2b96620c`
- Exact audio: `audio/narration.final.wav`
- Audio SHA-256: `97eb104ae0155ffb66a431c3f7aa4101c51eda708b5a8e8da3150c893d048527`
- Alignment cue: `cue-010`
- Exact narration: “第一，平台把系统的复杂性给隐藏起来。”
- Exact time window: `49.340s-52.560s`
- Probe duration: `3.220s`
- Ratio / resolution / FPS: `16:9` / `1920x1080` / `30fps`

## Planned Probe

| Candidate | Base style | Palette | Layout | Registry reference | Motion rules | Still | Motion probe | Current state |
|---|---|---|---|---|---|---|---|---|
| project-probe-01 | `modern-ip-host-explainer@1.0.0` | `light-apricot` | `host.left` + `content.right` + fixed `caption` | `flowchart-vertical` connector/node pattern only | `svg-path-draw`, `viewport-change`, `card-morph-anchor` | `review/stills/style-probe-hidden-complexity.png` | `review/probes/style-probe-hidden-complexity.mp4` | rendered and internally reviewed |

### Intended Frame

- Host pose: `explain`，复用已去背并归一化的生产资产；右手朝向内容区，眼线、头顶、身高和裁切保持在标准 host wrapper 内。
- Main operation: “平台按钮”在前景；其后仅露出三个被隐藏的工程节点，当前状态不超过三个 active nodes。
- Caption: 底部栏显示 cue-010 精确口播，`exact-source`。
- Main screen text: “平台把系统的复杂性给隐藏起来”，`exact-source`，source `cue-010`。
- Terminal state: 前景按钮压缩为上下文锚点，连接器指向被隐藏的系统层，为 cue-011 承接。

## Review Questions

1. 人物与右侧内容是否像同一位主持人在讲解，而不是贴纸叠在幻灯片上？
2. 前景“按钮/节点”和后方“系统复杂性”的层级是否一眼可读？
3. 3.22 秒内的路径绘制、聚焦和 terminal hold 是否足够清楚，且没有抢字幕？
4. 浅杏橙、森林绿和砖红是否保持单一主焦点，没有米黄课件感或一色化？
5. 人物手、标题、节点与固定字幕栏是否完全无碰撞？

## Rejected Treatments

- 不做多个完整视频来选风格。
- 不新增第二套基础风格、暖桃灰变体或额外组件家族。
- 不直接使用竖屏 `flowchart-vertical` 画幅；只参考其节点与连接器语义。
- 不使用卡片墙、统计图、装饰性粒子、纸张纹理或快速人物换姿。

## Decision

- Selected base style: `modern-ip-host-explainer@1.0.0`（模板锁定；项目探针批准范围与 reviewer 见下方独立记录）
- Allowed add-ons: 无
- Required corrections completed: 第三节点改为稳定 ID 定位；标题从 78px 调整为 72px；路径在绘制前保持完全透明；虚拟镜头溢出声明为受控构图意图。
- HyperFrames evidence: pinned `0.7.62`, `check --strict --snapshots --at 0.4,1.4,2.4,3.0` passed with zero errors and zero warnings.
- Still rendered: `true`, SHA-256 `88871D748C7CB11876FE435F9A3CD8084A569732C67D05A9AF0C288164775FD7`
- Motion probe rendered: `true`, SHA-256 `D134A4A3A0C1893BCBDDD6688918A84BC962B2B5E1DFF9BFEC58BE78DC7AE4C2`
- Motion probe media: H.264 High / AAC LC / 1920x1080 / 30fps / 3.242667s container duration; 97 frames; full decode passed.
- Project probe approval status: `approved-internal-autonomous-review`
- Reviewer: `codex-autonomous-internal-review`，依据用户要求尽量一次性完成全链路；不冒充用户人工批准。
- Full production permitted: `true` for `internal-only`; public release remains blocked by voice and host rights.
