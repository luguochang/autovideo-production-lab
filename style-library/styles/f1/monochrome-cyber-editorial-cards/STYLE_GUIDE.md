# 黑白赛博编辑风 UI 卡片系统

> Generated snapshot from `demo/f1/HF_风格与动效库_分享包搭建说明 (1).md`, section A5.
> Provenance status: user-provided specification only. Referenced examples, images, components, and their licenses were not included.
> Refresh with `node scripts/sync-style-library.mjs`; do not edit this generated snapshot directly.
## A5. `monochrome-cyber-editorial-cards`：黑白赛博编辑风 UI 卡片系统

### 可直接调用的完整提示词

```text
高级黑白赛博编辑风 UI 卡片系统，整体像 editorial portfolio、motion graphics board、cyber interface、3D poster design 的综合色觉系统。纯黑或极深灰背景，超粗白色大标题，灰色小字层级，模块化深灰黑卡片，1px 细白线和灰色描边，清晰网格和留白。卡片里有十字准星、圆形瞄准线、编号角标、状态点、时间码、进度条、细线图表和技术标签。图片全部黑白或灰阶，包括未来感时尚人物、黑色皮衣、墨镜、机械配件、黑白未来建筑、视频预览缩略图和 chrome / liquid metal / abstract sculpture 金属 3D 物体。只用少量荧光绿 `#A7FF3C` / `#B6FF45` 做按钮、箭头、状态点、节点、进度条和选中状态。整体冷峻、专业、克制、高级，像 motion design 工作室为短视频创作者做的视频视觉系统。
```

负面提示词：

```text
不要蓝紫霓虹赛博朋克，不要彩色霓虹，不要游戏 UI，不要卡通风，不要普通 SaaS 官网，不要塑料 3D，不要过度发光，不要大量粒子，不要廉价 glitch，不要背景复杂，不要文字太密，不要大面积绿色，不要普通 PPT 流程图，不要柔和可爱风，不要低级科技感，不要把荧光绿铺满画面。
```

### 视觉令牌、版式与动效

| 项目 | 规则 |
|---|---|
| 背景 | `#030303` / `#080808` / `#0D0D0D`，极弱暗角和低对比网格 |
| 卡片 | `#111111` / `#171717` / `#1E1E1E`，1px `rgba(255,255,255,.22)` 细描边、6–8px 圆角 |
| 文字 | 主字 `#FFFFFF` / `#F2F2F2`；说明 `#8A8A8A` / `#B0B0B0`；标题占画面 20–35% |
| 强调 | 荧光绿仅作状态信号，画面可见彩色面积低于 8%；每组局部卡片最多一处 |
| 竖版 | 顶部大标题+版本状态；中部 Hero/媒体/流程卡；底部组件、标签、指标、进度轨 |
| 横版 | 左标题论点，右灰阶人物/金属物，中部时间线，下方四步流程和指标模块 |

动效：卡片从黑场以 12–36px 轻滑+淡入出现；细线和箭头从左向右/中心向外绘制；绿节点逐 beat 点亮；数值从 0 确定性增长；进度轨平滑增长后停住；灰阶图可轻推近 2–4%；金属物慢转或扫光；标题快速干净切入/水平揭示。允许极弱扫描线、噪点和一帧文字闪动，不允许抢叙事的 glitch。

### 完整组件库

| 组件 | 用途与内容 |
|---|---|
| Hero Visual | 左侧 `FUTURE FRAMES` 等超粗标题，右灰阶时尚人物；`FEATURED`、`/001`、十字准星、绿圆箭头 |
| Media Preview | 黑白缩略图、播放键、`MEDIA PREVIEW`、timecode、`4K`、`16:9`、细进度轨 |
| Metrics | 三列如 `PROJECTS 82 / VIEWS 2.4M / ENGAGEMENT 18.7%`，绿微折线与点标记 |
| Creator Card | 圆头像、名称、角色、绿 `FOLLOW` 标签和统计 |
| Chrome Asset | 中心 chrome/liquid-metal 资产、构造圆线、目标框、`/3D/ABSTRACT` 标签 |
| Component Kit | 白主按钮、黑 ghost、绿 pill、播放/收藏/分享、开关、滑条、进度条 |
| Workflow Step | `01 TOPIC` 至 `04 EDIT`：编号、图标、三条 bullet、灰阶缩略图 |
| Timeline Rail | 白节点与一个绿活跃节点、短标签、时长与细箭头 |
| Status Checklist | `IDEA / PREP / PRODUCTION / POST` 状态行、勾环和绿活跃点 |
| Quote / Thesis | 大号短论点、细强调线、可选金属/人物裁切 |
| Tag Library | `CINEMATIC / CYBER / MOTION` 等标签，最后才填充活跃绿标签 |
| Export Preset | `YOUTUBE 4K / 16:9`、`TIKTOK 1080x1920` 等交付规格卡 |

### 组件提示词片段

```text
Hero：黑白赛博时尚杂志封面式 UI hero card，左侧超粗大标题 `FUTURE FRAMES`，右侧黑白未来感时尚人物，卡片内有十字准星、`/001`、细横线、绿色圆形箭头按钮。

Metrics：深灰黑横向指标卡，三列 `PROJECTS 82`、`VIEWS 2.4M`、`ENGAGEMENT 18.7%`，白大数字、灰标签、底部细荧光绿折线和淡网格。

Workflow：顶部 `WORKFLOW SYSTEM`，横向时间线有白节点与一个绿高亮点；下方四张细线流程卡 `01 TOPIC`、`02 SCRIPT`、`03 VISUALS`、`04 EDIT`，每卡有图标、三条短 bullet 和灰阶缩略图。

Chrome Asset：黑灰背景中的银色流体金属抽象雕塑，真实反射、非塑料；周围是圆构造线、准星、角标、微小编号，绿仅为一个状态点。
```

### 可粘贴的 `DESIGN.md` 块

```markdown
### 视觉方向
- 风格库：`monochrome-cyber-editorial-cards`
- 背景：纯黑/极深灰编辑作品集背景，轻微暗角、细网格、扫描线和边缘 UI 装饰。
- 主体：模块化黑灰卡片系统，内含黑白人物图、媒体预览、数据指标、账号信息、3D 金属资产、组件库或流程步骤。
- 核心视觉：超粗白色大标题、灰色小字、1px 细线、十字准星、圆形瞄准线、编号、时间码、状态点和细进度条。
- 色彩：背景 `#030303` / `#080808`；卡片 `#111111` / `#171717`；主字 `#FFFFFF`；辅字 `#8A8A8A`；少量荧光绿 `#A7FF3C`。
- 动效：卡片从黑场浮现，细线绘制，绿节点点亮，数字递增，进度条增长，图片轻推近，金属物慢转/扫光。
- 不要做：蓝紫霓虹、普通 SaaS、游戏 UI、卡通风、塑料 3D、大面积绿色、廉价 glitch、普通 PPT 流程图。
```
