# 工作流配置

```yaml
engine: HyperFrames
check_command: hyperframes check
default_fps: 30
style_registry: ../style-library/STYLE_REGISTRY.md
motion_registry: ../style-library/MOTION_REGISTRY.md
style_selection_gate: required
full_production_before_approval: forbidden
base_style_count: 1
max_addon_families: 2
probe_duration_seconds: 3-8
screen_text_labels:
  - exact-source
  - approved-summary
  - generated-summary
```

比例、平台、目标时长、受众和具体风格不得在全局配置里猜测；每个项目在 `VIDEO_TASK.md` 中单独锁定。

