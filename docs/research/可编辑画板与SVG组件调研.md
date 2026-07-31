# 可编辑画板与 SVG 组件调研

> 调研日期：2026-07-16  
> 实验：`experiments/E02-editable-canvas`  
> 结论状态：已完成第一轮本机验证，可用于下一阶段架构选型  
> 说明：版本、维护时间和许可证是 2026-07-16 快照，不是永久结论。

## 1. 结论先行

在主任务已经验证 HyperFrames SDK 具备稳定对象 ID、文字/样式编辑、patch、undo/redo、持久化和版本历史的前提下，**不应再引入 tldraw、Excalidraw、Fabric 或 Konva 作为第二套主画板**。维护两套主场景图会让选择、层级、字体、图片、撤销历史和动画引用长期漂移。

推荐组合如下：

```text
已确认口播稿
  -> Visual Plan / Canonical Canvas IR
       -> 普通文字、图片、卡片：HyperFrames SDK 主编辑器
       -> 结构图 Graph IR：ELK.js 布局 -> 自有 SVG/HTML 图元
       -> 常见流程图：Mermaid -> mermaid-to-excalidraw -> 图表子编辑器
       -> 严格层级/依赖图：Graphviz via Viz.js -> SVG 适配器
       -> 高质量静态架构图：可选 D2 -> SVG 适配器
  -> 用户修改形成字段级 patch
  -> 独立 timeline.json 通过 canonical object id 驱动动画
  -> 连续画板渲染器
```

核心选择：

1. **主编辑层：HyperFrames SDK**。复用已经验证的稳定 ID、patch、undo/redo 和版本能力。
2. **主图表布局：Graph IR + ELK.js**。ELK 只算坐标和边路由，保留原节点/边 ID；样式、交互和动画仍归系统所有。
3. **可人工细调的流程图：Excalidraw 子编辑器**。仅在用户点击“编辑图表”时使用，不承载整条视频。
4. **流程图快捷入口：Mermaid**。优先走官方维护的 `@excalidraw/mermaid-to-excalidraw`，转换为真正可拖动的矩形、文字和箭头，而不是把 SVG 当成一张图。
5. **任意 SVG 兼容层：Fabric.js**。只用于拆解、改字和重组外部 SVG；不用于实现主编辑器。
6. **严格拓扑图：Graphviz + Viz.js**。显式 DOT `id` 能进入 SVG，适合节点/边级动画。
7. **D2：可选静态素材生成器**。版式好，但 SVG 语义键藏在 base64 class 中，接动画需要额外适配。
8. **Slidev、Reveal.js、PptxGenJS：不作为视频主时间线**。可以做内容导入、快速审稿或 PPTX 旁路输出。
9. **动画不写进 SVG，也不写进编辑器私有 JSON**。对象状态在 `canvas.json`，时间和缓动在 `timeline.json`，二者只用稳定 ID 关联。

## 2. 推荐系统边界

### 2.1 事实来源

长期事实来源应是项目自己的 Canonical Canvas IR，不是 HyperFrames、Excalidraw、Fabric 或任何上游项目的内部 JSON：

```text
projects/<video-id>/
  canvas/
    canvas.json                 # 规范化对象、层级、位置、样式、内容
    timeline.json               # 动画、相机、强调和音频时间引用
    theme.json
    provider-map.json           # canonical id <-> 编辑器/图表工具 id
  editor/
    hyperframes.snapshot.json   # 可恢复编辑会话，但不是跨实现协议
    diagrams/
      <diagram-id>.excalidraw   # 只有需要图表细调时才存在
  graph/
    <diagram-id>.graph.json     # 节点/边事实来源
    <diagram-id>.layout.json    # ELK / Graphviz 布局缓存
  assets/
    svg/
    images/
  patches/
    <revision>.json
```

### 2.2 最小对象协议

```ts
type CanvasObject = {
  id: string;                   // 创建后不可改变，不使用数组下标
  revision: number;
  kind: "text" | "image" | "shape" | "diagram-node" | "diagram-edge" | "group";
  parentId?: string;
  transform: {x: number; y: number; width: number; height: number; rotation: number};
  content?: {text?: string; assetId?: string};
  style: Record<string, unknown>;
  source?: {
    adapter: "hyperframes" | "excalidraw" | "elk" | "mermaid" | "graphviz" | "d2";
    sourceId: string;
  };
  locks?: Array<"content" | "position" | "size" | "style" | "asset">;
};

type TimelineCue = {
  id: string;
  targetId: CanvasObject["id"];
  at: number;
  duration: number;
  op: "add" | "write" | "move" | "scale" | "highlight" | "draw" | "replace" | "remove";
  easing?: string;
  params?: Record<string, unknown>;
};
```

稳定 ID 规则：

- 系统对象使用不可变 ID，例如 `obj_<ulid>`；显示文字和数组位置不能参与 ID。
- 图表内部使用命名空间，例如 `diagram_rag::node::retrieve`。
- 编辑器 ID 只进入 `provider-map.json`，时间线永远引用 canonical ID。
- 删除使用 tombstone，避免旧时间线突然指向同名新对象。
- 自动重新规划时尊重 `locks`；用户拖动、改字、换图后，对应字段默认加锁。
- 子元素 ID 不稳定时，把它们映射到稳定父对象。例如 Excalidraw 的文字元素 ID 可随机变化，但 `containerId=source` 稳定。

### 2.3 编辑同步接口

编辑器适配层只需要四个方向明确的接口：

```ts
toEditorDocument(canvas: CanvasDocument): ProviderDocument;
fromEditorDocument(document: ProviderDocument, previous: CanvasDocument): CanvasPatch[];
applyCanvasPatches(document: ProviderDocument, patches: CanvasPatch[]): ProviderDocument;
resolveProviderId(canonicalId: string): string[];
```

典型用户操作应产生字段级 patch：

| 用户操作 | Canvas patch | 是否重做资产 | 是否重算动画 |
|---|---|---:|---:|
| 拖动/缩放 | `transform.*` | 否 | 仅相关对象与连线 |
| 改屏幕文字 | `content.text` | 否 | 重新测量布局，保留时间 |
| 替换图片 | `content.assetId` | 单个资产 | 否，除非宽高比变化 |
| 改颜色/字体 | `style.*` | 否 | 否 |
| 换动画预设 | `timeline cue` | 否 | 仅该 cue |
| 调整出现时间 | `at/duration` | 否 | 仅局部时间区间 |
| 重排整个图 | `graph/layout` | 否 | 节点/边和相机区间 |

## 3. 编辑层候选比较

### 3.1 HyperFrames SDK：采用为主编辑层

主任务侧已经验证：稳定 ID、文字/样式编辑、patch、undo/redo、持久化和版本历史均可用。它覆盖了本系统最难的主编辑能力，因此再引入第二套无限画板没有收益。

仍需在集成阶段补齐的边界：

- 确认许可证、商用部署和版本锁定策略。
- 建立 HyperFrames ID 到 canonical ID 的一对一或一对多映射。
- 图片替换、图表子文档、时间线属性面板通过扩展工具实现。
- 保存时输出字段级 patch，而不是只保存全量私有快照。
- 渲染器不能依赖编辑器运行时；应消费同一份 Canvas IR。

### 3.2 Excalidraw：采用为图表子编辑器，不作主画板

优势：

- MIT，完整的拖动、缩放、改字、连线、图片、分组和导出 UI。
- `initialData`、`onChange`、`updateScene`、`serializeAsJSON`、`restore`、`exportToSvg` 等 API 可嵌入 React 应用。
- 元素有稳定 `id`，场景 JSON 可保存和恢复。
- 官方维护 `@excalidraw/mermaid-to-excalidraw`，能把 Mermaid 的 flowchart、sequence、class、ER、state 转成可编辑图元；其他图型回退为静态 SVG image。

本机实测：

- Mermaid RAG 流程图转换为 11 个实际 Excalidraw 元素：rectangle、text、arrow。
- Mermaid 容器语义 ID `source/retrieve/model/answer` 原样保留。
- `serializeAsJSON` 保存后所有 ID 和绑定引用仍有效。
- 每次重新转换会重新生成 bound text ID；所以转换结果必须持久化，不能每次预览重新生成。
- Excalidraw 导出的 SVG 没有保留 `source/retrieve/model/answer` 这些语义 DOM ID，因此只能把导出 SVG 当静态快照；若要逐节点动画，必须把场景对象投影回 Canvas IR。

风险：

- Excalidraw 没有视频时间线，动画仍需本系统提供。
- 任意外部 SVG 通常作为 image，而不是自动拆成可编辑节点；Mermaid converter 是专用通道。
- converter 当前代码使用 Mermaid 已标记 deprecated 的 `mermaidAPI.getDiagramFromText(...).db`，必须锁定版本并保留契约测试。
- Excalidraw 0.18.1 的部分内嵌 Radix 依赖对 React 19 会给出 peer warning；本实验用独立 React 18.3.1 编辑器环境通过。建议编辑器 SPA 与视频渲染工程解耦。

### 3.3 Fabric.js：采用为任意 SVG 兼容适配器

Fabric.js 是底层 Canvas/SVG 对象库，不是现成产品编辑器。它适合处理“用户给了一份 SVG，希望拆开改文字和位置”的窄场景。

本机实测 Graphviz SVG：

- `loadSVGFromString` 解析出 14 个叶对象。
- reviver 可读取最近的 Graphviz `<g id>`，写入 `sourceGroupId` 和自定义 `objectId`。
- 自定义 ID 经过 Fabric JSON 保存和 `enlivenObjects` 恢复后不丢失。
- 恢复后的 `text` 对象可以直接改成 `LLM / 大模型`。

边界：一个图表节点会被拆成背景、边框、文字等多个叶对象，必须按 `sourceGroupId` 重组。Fabric 没有完整属性面板、资产管理、时间线或版本系统；拿它重做主编辑器成本不合理。

### 3.4 tldraw：生产环境淘汰，除非另购商业许可

tldraw 的编辑器和 store/snapshot API 很成熟，也支持自定义 shape 和 SVG 导出。但当前 `tldraw` 5.2.5 使用自定义 tldraw license：默认许可允许 Development Environment，明确禁止 Production Environment，并有 license key、部署检测和 watermark enforcement。它不满足“优先开源组装并可生产部署”的当前约束。

即便购买商业许可，它与已验证 HyperFrames 的主编辑功能高度重叠，因此也不是当前优先项。

### 3.5 Konva：淘汰为主方案

Konva 适合高性能 Canvas 交互，节点 attrs 可带 ID，`Stage.toJSON()` / `Node.create()` 可以保存基础场景。但官方文档也建议 React 场景保存应用状态而不是序列化整棵 Stage；图片和事件处理器不能靠 JSON 完整恢复。它没有语义 SVG 导出，导出主要是 PNG/data URL。

在已有主编辑器、又需要 SVG 节点级动画的情况下，Konva 会增加一套 Canvas 渲染语义，收益低于 Fabric 的 SVG 适配能力。

## 4. HTML / PPT 候选的正确定位

### 4.1 HTML/CSS：采用为内容图元，不采用 slide runtime

文字、代码、表格、卡片、标签和字幕仍应由 HTML/SVG/React 组件渲染。用户编辑的是组件属性和约束，不是任意 HTML 字符串：

```json
{
  "id": "obj_compare_rag_ft",
  "kind": "comparison",
  "props": {
    "leftTitle": "RAG",
    "rightTitle": "微调",
    "rows": []
  }
}
```

这样既能保持字体和布局确定性，也避免 HTML 注入、不可控 CSS 和内容溢出。

### 4.2 Slidev：仅作审稿/导入实验

Slidev 52.18.0 很活跃，Markdown + Vue 组件和 click animation 适合演示文稿。它仍以 slide/page 为核心。官方导出文档明确说明：PPTX 中每页是图片，文字不可选择；click steps 会导成多个页面，交互动画不会成为连续视频时间线。

结论：不作为主画板、不作为可编辑 PPTX 交付；可用于快速内容审阅或导入 Markdown 结构。

### 4.3 Reveal.js：不采用为主时间线

Reveal.js 6.0.1 的 `fragment` 和 `auto-animate` 很适合网页演示。`data-id` 可以匹配相邻 slide 中的对象并自动插值，视觉上比普通切页柔和。

但它仍是“slide + click step”状态机，没有对象编辑器、音频时间轴或 canonical JSON。为了配合逐词 TTS 还要再做一层自动导航和帧捕获，等于绕过现有渲染器重建时间线。可以参考它的 matching 设计，不引入 runtime。

### 4.4 PptxGenJS：采用为旁路 PPTX 导出，不做往返编辑

PptxGenJS 4.0.1 能在 Node/浏览器生成真正的 `.pptx`，文本、形状、图片可以在 PowerPoint 中继续调整。适合作为“额外交付一份 PPTX 供人工审稿”的旁路。

它是生成器，不是 PPTX 解析器或视频时间线；当前文档没有可用于本工作流的对象动画 API。用户在 PowerPoint 中的修改不能可靠回写 Canvas IR，因此 PPTX 不能作为事实来源。

## 5. 图表与 SVG 积木比较

### 5.1 首选：Graph IR + ELK.js

最适合自动化生产的不是让模型直接写 Mermaid/DOT/D2，而是让模型输出受 schema 约束的 Graph IR：

```json
{
  "id": "diagram_rag",
  "nodes": [
    {"id": "source", "label": "知识库", "kind": "source"},
    {"id": "retrieve", "label": "检索", "kind": "process"}
  ],
  "edges": [
    {"id": "source_retrieve", "from": "source", "to": "retrieve"}
  ]
}
```

ELK.js 0.11.1 接收这份 JSON，返回 x/y、宽高和边 sections，并原样保留节点/边 ID。渲染器再用自己的 HTML/SVG 图元画节点和边，因此：

- 用户拖动后可以锁定节点位置。
- 文字、颜色、图标和动画完全可控。
- 布局变化时能按同一 ID 在旧/新坐标间插值。
- 不依赖第三方 SVG 的 DOM 结构。

本机验证 4 节点、3 条边均保留 ID，所有边得到路由 sections。这是默认图表路径。

### 5.2 Mermaid：采用为快捷 DSL 和 Excalidraw 导入层

Mermaid 11.16.0 支持大量常见图型，适合 LLM 快速生成和用户阅读源文件。本机真实 Chrome 输出 SVG 成功，并开启 `deterministicIds`。

但是实际 DOM ID 为 `mermaid-rag-flowchart-source-0` 等生成格式，节点增删可能改变后缀；边 ID 也带生成前缀。因此直接动画前必须注入 canonical `data-object-id`，不能把 Mermaid DOM ID 当长期协议。

最有价值的组合是：

```text
Graph IR / Mermaid source
  -> @excalidraw/mermaid-to-excalidraw
  -> 用户在 Excalidraw 子编辑器微调
  -> scene + canonical mapping
  -> 投影回 Canvas IR 或整体 SVG 快照
```

### 5.3 Graphviz via Viz.js：采用为严格拓扑图

`@viz-js/viz` 3.28.0 在 Node/浏览器中运行 Graphviz 15.0.0 WASM，不需要系统安装 `dot.exe`。适合复杂层级、依赖图和需要成熟路由算法的场景。

本机验证在 DOT 中给 graph/node/edge 设置显式 `id` 后，SVG DOM 全部保留这些 ID。Graphviz 原始 XML 会把连字符序列化为 `&#45;`，但 XML DOM 解析后仍是正确 ID；适配器必须用 DOM parser，不能只做字符串查找。

限制：布局很强，但用户手动拖节点后不适合再回到 DOT 自动布局。建议把它当“首次布局/静态素材”或把输出坐标导回 Graph IR。

### 5.4 D2：继续观察，作为高质量静态备选

D2 v0.7.1 语法简洁、主题和架构图观感好，可选择 ELK 布局。本机 Windows CLI 多次在约 0.3-0.45 秒生成测试 SVG。

测试 SVG 不给节点写显式语义 `id`，而是把 `source` 编成 CSS class `c291cmNl`，边也使用编码 class。适配器可以解码并注入 `data-object-id`，但这比 ELK 原生 JSON 或 Graphviz 显式 ID 多一层脆弱耦合。

结论：保留为特定视觉风格或复杂静态图生成器；不作为默认的逐节点动画源。

### 5.5 SVG 动画策略

不把 SMIL/CSS keyframes 写回 SVG 文件。图表生成器只输出几何和语义映射，视频渲染器按帧执行 `timeline.json`：

- 节点出现：opacity + scale + y offset。
- 连线绘制：`stroke-dasharray` / `stroke-dashoffset`，箭头在末段出现。
- 重点强调：独立 highlight overlay，不修改源图颜色。
- 旧内容收缩：对象 transform 与相机 transform 分离。
- 重新布局：同 ID 节点在旧/新坐标间插值；边路径不能稳定 morph 时重绘或短交叉淡化。
- 整体静态 SVG：只允许镜头移动、遮罩、标注和整体 transform，不冒充节点级动画。

这样才能支持拖动时间、局部预览、音频重对齐和逐帧确定性渲染。

## 6. 本机实验与证据

复现：

```powershell
cd E:\project\study\codex\autoVideo\experiments\E02-editable-canvas
npm.cmd install --no-audit --no-fund
npm.cmd run verify
```

`verify` 会：

1. 下载并运行固定版本 D2 v0.7.1 到用户临时目录。
2. 用 Viz.js/Graphviz 输出带显式 ID 的 SVG。
3. 用 ELK.js 对相同 4 节点/3 边图布局并验证 ID。
4. 用 Fabric.js 解析 Graphviz SVG，保存/恢复自定义对象 ID并修改文字。
5. 启动本机 Chrome，让 Mermaid 真实渲染 SVG。
6. 在 Chrome 中执行 Mermaid -> Excalidraw 转换、官方 scene JSON 序列化和 SVG 导出。

2026-07-16 最新通过结果：

| 检查 | 结果 |
|---|---|
| Canonical IR 引用完整 | 4 对象、3 边、3 timeline target 全通过 |
| ELK ID 与边路由 | 4 节点、3 边全保留并有 route sections |
| Graphviz 显式 ID | graph、4 node、3 edge 全保留 |
| Fabric SVG 拆解 | 14 对象；自定义 ID JSON 往返通过；文字可改 |
| Mermaid Chrome SVG | 4 节点、3 边真实渲染；已注入 canonical data id |
| Mermaid -> Excalidraw | 11 元素；rectangle/text/arrow；绑定完整 |
| Excalidraw scene | 官方 JSON 保存 ID；重新转换时 text ID 会变化 |
| Excalidraw SVG | 可导出，但语义对象 ID 不在 SVG DOM 中 |
| D2 SVG | 语义键能从 base64 class 恢复；没有显式语义 group id |

证据文件：

- `experiments/E02-editable-canvas/output/verification.json`
- `experiments/E02-editable-canvas/output/elk-layout.json`
- `experiments/E02-editable-canvas/output/graphviz.svg`
- `experiments/E02-editable-canvas/output/mermaid.svg`
- `experiments/E02-editable-canvas/output/d2.svg`
- `experiments/E02-editable-canvas/output/excalidraw.scene.json`
- `experiments/E02-editable-canvas/output/excalidraw.svg`
- `experiments/E02-editable-canvas/output/fabric-roundtrip.json`

## 7. 版本、维护与许可证快照

| 项目 | 实测/查询版本 | 最近仓库推送 | 许可证 | 决策 |
|---|---:|---|---|---|
| tldraw | 5.2.5 | 2026-07-15 | 自定义 tldraw license，默认禁生产 | 淘汰主方案 |
| Excalidraw | 0.18.1 | 2026-07-15 | MIT | 图表子编辑器 |
| mermaid-to-excalidraw | 2.2.2 | 2026-03-24 | MIT | 采用并锁版本 |
| Fabric.js | 7.4.0 | 2026-07-08 | MIT | SVG 适配器 |
| Konva | 10.3.0 | 2026-06-15 | MIT | 不采用主方案 |
| Slidev | 52.18.0 | 2026-07-14 | MIT | 审稿/导入备选 |
| Reveal.js | 6.0.1 | 2026-05-21 | MIT | 仅参考 auto-animate |
| PptxGenJS | 4.0.1 | 2025-11-28 | MIT | 旁路 PPTX 导出 |
| Mermaid | 11.16.0 | 2026-07-15 | MIT | 快捷 DSL/转换入口 |
| D2 | 0.7.1 | 2026-04-24 | MPL-2.0 | 静态图备选 |
| ELK.js | 0.11.1 | 2026-07-13 | EPL-2.0 | 默认布局引擎 |
| Viz.js | 3.28.0 | 2026-07-09 | wrapper MIT；Graphviz EPL-2.0 | Graphviz WASM 适配 |

MIT 项目接入最简单。MPL-2.0/EPL-2.0 允许商用，但分发相关二进制或修改文件时要保留许可证并满足对应源码/notice 义务；发布前应做一次正式第三方许可证清单。本节不是法律意见。

## 8. 淘汰与保留理由汇总

| 候选 | 主编辑 | 图表子编辑 | 自动布局 | SVG 适配 | 旁路导出 | 主要原因 |
|---|---:|---:|---:|---:|---:|---|
| HyperFrames SDK | 是 | 可承载 | 否 | 可承载 | 否 | 已验证稳定 ID、patch、历史，不重复造主画板 |
| Excalidraw | 否 | 是 | 间接 | 静态导出 | 是 | Mermaid 可转可编辑图元，但无时间线且 SVG 丢语义 ID |
| Fabric.js | 否 | 备选 | 否 | 是 | 是 | 任意 SVG 拆解强，但完整 UI 要自研 |
| tldraw | 否 | 否 | 否 | 是 | 是 | 默认许可证禁止生产，且与主编辑器重复 |
| Konva | 否 | 否 | 否 | 否 | 位图 | 没有语义 SVG，仍需自研编辑 UI |
| ELK.js | 否 | 否 | 是 | 否 | 否 | 稳定 ID + 坐标/路由，最适合自己的图元和动画 |
| Mermaid | 否 | 输入 | 是 | 是 | 是 | DSL 丰富；直接 DOM ID 不宜作长期协议 |
| Graphviz/Viz.js | 否 | 输入 | 是 | 是 | 是 | 严格拓扑和显式 ID 强；手动布局往返弱 |
| D2 | 否 | 输入 | 是 | 是 | 是 | 观感好；语义 ID 适配和许可证成本更高 |
| Slidev/Reveal | 否 | 否 | 否 | HTML | 是 | 页/点击模型，不是连续画板时间线 |
| PptxGenJS | 否 | 否 | 否 | SVG 图片 | 是 | 适合额外交付，不能可靠往返 |

## 9. 下一步实现建议

按风险从低到高推进：

1. 冻结 `CanvasObject`、`Graph IR`、`TimelineCue` 和 `CanvasPatch` schema。
2. 为 HyperFrames 建 canonical ID/provider ID 映射和字段级 patch 导出。
3. 实现 `Graph IR -> ELK -> CanvasObject[]`，先支持 rectangle/text/arrow 三类图元。
4. 在编辑器增加图表属性面板：重新布局、锁定节点、编辑文字、颜色和连线。
5. 加入“在 Excalidraw 中编辑图表”弹窗；保存 `.excalidraw` 和映射，不每次重转。
6. 实现 `Graphviz SVG -> DOM parser -> canonical data id` 适配器。
7. Fabric 只作为用户任意 SVG 的高级导入模式，默认先整体导入，用户明确选择后才拆解。
8. 时间线属性面板只写 `timeline.json`；编辑器 scene JSON 中不添加私有动画字段。
9. 做一次局部修改验收：拖一个节点、改一个词、换一张图、移动一个 cue，确认只更新对应 patch 和局部预览。
10. 许可证清单固定依赖版本，尤其锁定 Excalidraw/Mermaid converter、D2 和 Graphviz WASM。

第一版不应实现：完整 PPT 导入、PPT 修改回写、tldraw 双编辑器、Konva 重建 UI、SVG 内嵌时间线、任意 HTML 直接执行。

## 10. 主要来源

- tldraw repository/license: https://github.com/tldraw/tldraw / https://github.com/tldraw/tldraw/blob/main/LICENSE.md
- Excalidraw repository/API: https://github.com/excalidraw/excalidraw / https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api
- Mermaid to Excalidraw: https://github.com/excalidraw/mermaid-to-excalidraw
- Fabric.js serialization/SVG: https://fabricjs.com/docs/using-custom-properties/ / https://fabricjs.com/api/functions/loadsvgfromstring/
- Konva serialization: https://konvajs.org/docs/data_and_serialization/Serialize_a_Stage.html / https://konvajs.org/docs/data_and_serialization/Best_Practices.html
- Slidev exporting: https://sli.dev/guide/exporting
- Reveal.js fragments/auto-animate: https://revealjs.com/fragments/ / https://revealjs.com/auto-animate/
- PptxGenJS docs: https://gitbrent.github.io/PptxGenJS/
- Mermaid: https://github.com/mermaid-js/mermaid
- D2: https://github.com/terrastruct/d2
- ELK.js: https://github.com/kieler/elkjs
- Viz.js: https://github.com/mdaines/viz-js
- Graphviz SVG id attribute: https://graphviz.org/docs/attrs/id/
