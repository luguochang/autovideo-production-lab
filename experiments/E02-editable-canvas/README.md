# E02 - 可编辑画板与 SVG 组件最小验证

本实验不修改主项目。它验证“规范化画板 IR -> 自动布局/图表 SVG -> 编辑器对象 JSON”的关键接口，不试图交付完整编辑器。

## 运行

```powershell
cd E:\project\study\codex\autoVideo\experiments\E02-editable-canvas
npm.cmd install --no-audit --no-fund
npm.cmd run verify
```

## 验证范围

- `canvas-ir.json` 中对象、连线和时间线使用稳定 ID，所有引用可解析。
- ELK.js 布局后保留节点/边 ID，并返回节点坐标和边路由。
- Viz.js（Graphviz WASM）输出 SVG 时保留 DOT 中显式指定的节点/边 ID。
- Fabric.js 通过 SVG reviver 把 Graphviz 分组 ID 映射为编辑对象属性；JSON 保存/恢复后 ID 不丢失，文字仍可修改。
- Mermaid 在本机真实 Chrome 中生成 SVG，并开启确定性 ID 配置；适配器为生成节点补入规范化 `data-object-id`。
- `@excalidraw/mermaid-to-excalidraw` 在真实 Chrome 中把同一 Mermaid 图转换成可编辑的形状、文字和箭头，并检查内部绑定及 ID 保存行为。
- D2 v0.7.1 CLI 使用 ELK 布局生成 SVG；验证语义键被编码为可恢复的 base64 CSS class，但不是显式 SVG `id`。

## 产物

- `output/elk-layout.json`
- `output/graphviz.svg`
- `output/mermaid.svg`
- `output/d2.svg`
- `output/excalidraw-elements.json`
- `output/excalidraw.scene.json`
- `output/excalidraw.svg`
- `output/fabric-roundtrip.json`
- `output/verification.json`

## 已知边界

- 一个 Graphviz 节点通常会被 Fabric 解析成背景、边框、文字等多个叶对象。适配器要以 `sourceGroupId` 重新分组，动画仍引用规范化 IR 的节点 ID。
- Fabric JSON 只应作为编辑器快照；视频工程的事实来源应是独立 Canvas IR。不要把 Fabric、Excalidraw 或 tldraw 的内部格式直接当长期公共协议。
- 本实验没有把动画写进 SVG。动画保存在时间线 JSON，渲染阶段用对象 ID 驱动，这样才能准确拖动时间、局部重渲染和逐帧复现。
