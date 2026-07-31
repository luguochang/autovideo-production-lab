# Voice Lab Project Overlays

本目录保存原工作区中位于第三方 Git 仓库内部、但由 AutoVideo 项目新增或修改的文件。

第三方完整源码不直接提交到主仓库。运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\restore-third-party.ps1
```

恢复脚本会 checkout 归档记录的精确上游 commit，并把生产 overlay 复制到对应源码目录。

| Overlay | 用途 | 自动应用 |
| --- | --- | --- |
| `CosyVoice/` | 预设 14 deterministic runner、Windows 依赖、测试和 WebUI 默认值 | 是 |
| `Qwen3-TTS/` | 本地选型 runner、README 和来源回执 | 是 |
| `VoxCPM/` | 成熟女声 Voice Design runner 和来源回执 | 是 |
| `ClearerVoice-Studio-experimental/` | 旧机器的实验性源码修改 | 否 |

不要把 overlay 当成独立上游 fork。升级第三方源码时，应先比较旧 commit、新 commit 和 overlay，再运行对应测试。

