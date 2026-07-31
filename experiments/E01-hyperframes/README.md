# E01 HyperFrames 本机验证

## 目的

验证 HyperFrames 是否能作为连续 HTML 画板的渲染与人工微调底座，而不是只依据项目 README 判断。

## 版本

- HyperFrames CLI：`0.7.59`
- HyperFrames SDK：`0.7.59`
- License：Apache-2.0
- Node.js：`24.18.0`

## 验证内容

`index.html` 是一个 12 秒、1280x720 的单画板 composition。输入链对象持续存在，GSAP 相机移动到画板右侧后展示输出链，没有分页或整屏卸载。

```powershell
npm.cmd run check -- --snapshots
npm.cmd run verify:sdk-edit
npm.cmd run render -- --quality draft --output renders/e01-hyperframes.mp4
npm.cmd run dev -- --port 3200 --no-open
```

## 实际结果

- `check --snapshots`：lint/runtime/layout/motion 均为 0 findings；29/29 文本通过 WCAG AA。
- 生成 5 张时间点快照，确认相机移动和对象连续状态。
- draft render：360 帧、12 秒、1280x720、H.264，约 19 秒完成。
- FFmpeg 黑帧检测：`BLACK_FRAMES=NONE`。
- Studio：`http://localhost:3200`，HTTP 200。
- SDK：精确编辑稳定 ID `hf-output-title`，批量修改文字与颜色；undo/redo、3 个 patch 事件、HTML 自动持久化和版本快照均验证通过。
- `doctor --json`：CLI/Node/CPU/内存/磁盘/FFmpeg/FFprobe/固定 Chrome 均正常；缺少的 Whisper、Kokoro、MusicGen 是可选项，Docker 已安装但未运行。

## 关键发现

1. 生成器必须为每个可编辑对象写入稳定 `data-hf-id`。按文本模糊查找可能命中父容器，不能用于生产编辑。
2. 无限画板要显式标记 `data-layout-allow-overflow`，否则布局检查会把设计内的视口裁切报告为警告。
3. HyperFrames Studio 的时间线编辑目前适合移动、轨道、右裁剪和媒体左裁剪；它不是完整 NLE。
4. SDK 能承担自定义属性面板、画布拖动、undo/redo、patch 持久化和版本历史，减少自研编辑内核的工作量。
5. HTML + GSAP 足以实现连续世界画板；最终视觉质量仍取决于规划、布局、SVG/图片资产和动作模板。
6. 不需要为了首版安装所有本地 AI 模型；转写、TTS、BGM 应保持 provider 可插拔。

## 产物

- `index.html`：连续画板 composition
- `snapshots/`：自动检查快照
- `renders/e01-hyperframes.mp4`：本机渲染产物
- `verify-sdk-edit.mjs`：SDK 编辑验证
- `sdk-output/editable.html`：持久化后的可编辑 HTML
- `sdk-output/patches.json`：编辑/undo/redo patch 证据
