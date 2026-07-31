# AutoVideo CosyVoice Overlay

上游基线：

```text
https://github.com/FunAudioLLM/CosyVoice.git
074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc
```

本 overlay 保存 AutoVideo 正式配音所需的项目文件：

- `run_zh_female_seed7.py`：预设 14 deterministic runner；
- `requirements.windows.txt`：本机 Windows 补充依赖；
- `download_minimal_models.py`：最小模型下载辅助；
- `run_local_test.py`：本地技术测试；
- `tests/`：dry-run batch 和 runner 合同测试；
- `webui.py`：只将 WebUI 默认 speed 改为 1.03、seed 改为 7。

正式生产必须使用 `run_zh_female_seed7.py`，不能把 WebUI 下载文件当作正式资产。模型权重和 `.venv` 不在 Git 中，恢复规则见：

- `hyperframes-workflow-kit/VOICE_HANDOFF.md`
- `tools/voice-lab/tutorials/08-final-voice-14.md`
- `docs/25-GitHub归档与新环境恢复手册.md`

