# AutoVideo Agent Rules

These rules apply to the whole workspace.

## Workflow Triggers

Treat any of the following as an explicit request to use the project-local AutoVideo pipeline:

- "按 AutoVideo 流水线做"
- "按 HyperFrames 视频流水线生成"
- "创建一个新视频项目"
- "用这段口播和参考图做视频"

For a fresh project with a narration file, initialize it before authoring video code:

```powershell
npm.cmd run video:new -- --id <project-id> --narration <path> [--reference-image <path>] --ratio <ratio> --duration <duration> --platform <platform>
```

If the user provides narration as chat text instead of a file, first preserve it as project input, then initialize the project. Do not silently alter approved wording.

Treat "继续视频项目 <project-id>" or "继续 <project-id>" as a resume trigger. Run `npm.cmd run video:status -- --project <project-id>`, read `hyperframes-workflow-kit/prompts/00-继续项目.md`, and continue only the next permitted stage.

If the user asks to "直接做" or explicitly skip review, keep the pipeline but record the skipped gate and reason. Do not bypass project initialization, NarrationLock, provenance, or QA.

For every narrated video, read `hyperframes-workflow-kit/VOICE_HANDOFF.md` before generating audio or timing visuals. The approved-text default is CosyVoice preset 14 (`中文女 / FP32 / stream=false / speed 1.03 / seed 7`) unless the user explicitly overrides it. Production voice assets must come from the deterministic runner described there, not from a WebUI download.

## Audio Test Safety

For the current production-pipeline goal, audio and real-time meeting tests are file-in/file-out only. Use imported audio files or bytes for SHA-256, metadata, FFmpeg decode/loudness, timing, and API-contract checks. Automated tests must not request or call the microphone, start recording, autoplay or programmatically play media, select an audio output device, or emit sound. Microphone testing remains disabled until the user explicitly authorizes it in a later request.

## Output Aspect Constraint

Unless the user explicitly overrides it for a named project, every new video and every style probe must be landscape `16:9`. Use `--ratio 16:9` at project initialization, author compositions at `1920x1080` (or another landscape `16:9` resolution), and fail QA for any portrait or square output. Existing projects retain their recorded aspect ratio and are not silently migrated.

## Video Workflow

For any video, animation, storyboard, style, or HyperFrames task:

1. Read `style-library/STYLE_REGISTRY.md` before choosing a visual direction.
2. Read the selected style guide and `style-library/MOTION_REGISTRY.md`; do not infer a style from a vague request such as "高级感".
3. Search the official HyperFrames examples, registry blocks/components, frame presets, and motion rules before authoring a custom equivalent.
4. Preserve an approved narration as an immutable `NarrationLock`. Screen summaries must record whether they are exact excerpts or generated summaries.
5. Freeze and approve the unique final narration WAV before deriving captions, scene durations, or motion timing. Any regenerated audio invalidates alignment and all downstream timing.
6. Create a human-readable video task from `style-library/templates/VIDEO_TASK.md` and a style comparison from `style-library/templates/STYLE_REVIEW.md` before full production.
7. For unresolved style choices, produce still frames or 3-8 second motion probes from the same approved narration window. Do not render several full-length videos merely to choose a style.
8. Do not enter full production until the style selection is `approved`, unless the user explicitly asks to skip review. Record any skipped gate and inferred choice in the task document.
9. Use one base style. Add at most two clearly scoped component families; do not blend entire style systems.
10. Use `hyperframes check`, not the deprecated `inspect` alias. Media QA and visual/contrast QA are separate gates.
11. After approval, record successful components, failed patterns, and user feedback back into the project style library. Do not promote an unvalidated rule to a global Codex skill.

## Reuse Order

Use the first suitable source:

1. Official HyperFrames frame presets and examples.
2. Official HyperFrames registry blocks and components.
3. Official HyperFrames animation rules and blueprints.
4. Pinned, licensed community references under `vendor/`.
5. Project-local custom code only for a demonstrated gap.

Every reused or generated asset must have a source and license/provenance receipt. User-provided `demo/f1` documents are design specifications, not proof that their referenced code, images, or examples are installed or licensed.
