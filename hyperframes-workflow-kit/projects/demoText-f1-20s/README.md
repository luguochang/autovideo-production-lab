# demoText F1 七风格 20 秒评审

这个项目把 `demo/demoText.txt` 中同一段 20 秒口播，制作成 7 个竖屏风格对比样片。它当前停在 `style-review`，不是完整口播成片；在用户选定风格前，不继续扩展全文。

## 直接查看

- 评审页：`review/index.html`
- 对比总览：`review/stills/contact-final.png`
- 单个 MP4：`review/probes/`
- 风格说明与 A-G 对照：`STYLE_REVIEW.md`

评审服务器已按项目根目录启动时，可访问：

```text
http://127.0.0.1:3302/review/
```

服务器未运行时，在本项目目录执行：

```powershell
npx.cmd --yes http-server . -p 3302 -c-1
```

## 后续触发

从仓库根目录继续时，使用：

```powershell
npm.cmd run video:status -- --project demoText-f1-20s
```

对话中也可以说：

```text
继续 demoText-f1-20s，选择 F 手绘流程教程
```

也可以指定“以 F 为基础，只借用 A 的数据证据条”之类的局部组合；整个项目只能有一个基础风格，附加组件家族最多两个。选择确认后，流水线会写入项目级 `style-selection.json`，再进入完整分镜和全文制作。

## 当前结论

- A-G 七个样片均已通过 HyperFrames、媒体和浏览器 QA。
- 原始口播已由 `NarrationLock.json` 锁定；画面中的总结语已区分 `exact-source` 与 `generated-summary`。
- F1 文档只作为风格规格使用，未把缺失的原始图片、代码或示例声明为已安装/已授权素材。
- 当前风格审批仍为 `pending`。
