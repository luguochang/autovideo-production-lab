# Local Voice Lab

This directory contains free, local voice-processing tools used before narration is attached to HyperFrames.

Chinese step-by-step tutorials with screenshots: [`tutorials/README.md`](./tutorials/README.md).

## Recommended chain

1. Record the narration with the intended pacing, pauses, emphasis, and emotion.
2. Use DeepFilterNet only when the recording needs noise cleanup.
3. Use CosyVoice VC or Seed-VC with style conversion disabled when the goal is to preserve delivery and change timbre.
4. Use VoxCPM2 when a new, non-identifiable mature Mandarin target voice must be designed without copying a named person.
5. Use RVC after training or adding a compatible authorized voice model when a stable long-term personal voice is needed.
6. Use Qwen3-TTS or CosyVoice SFT only when direct text regeneration is acceptable; these modes do not preserve the source delivery.
7. Loudness-normalize the selected result, transcribe it for word timing, and then attach the frozen local audio file to HyperFrames.

## Tools

| Tool | Local path | License | Interface | Purpose |
| --- | --- | --- | --- | --- |
| DeepFilterNet | `DeepFilterNet/` | MIT OR Apache-2.0 | CLI | Speech denoise/enhancement without replacing human delivery |
| Seed-VC | `seed-vc/` | GPL-3.0 | Gradio, port 7861 | Zero-shot voice conversion while retaining source timing |
| RVC WebUI | `RVC-WebUI/` | MIT | Gradio, port 7862 | Trained voice conversion for a repeatable personal voice |
| ClearerVoice-Studio | `ClearerVoice-Studio/` | Apache-2.0 | Streamlit, port 8501 | Speech enhancement, separation, and target-speaker extraction |
| VoxCPM2 | `VoxCPM/` | Apache-2.0 | Python/CLI | Mandarin Voice Design without copying a named real person |
| CosyVoice | `CosyVoice/` | Apache-2.0 | Python/CLI | Mandarin voice conversion that preserves source timing; fixed SFT voices for comparison |
| Qwen3-TTS | `Qwen3-TTS/` | Apache-2.0 | Python/CLI | Official fixed Mandarin presets such as Serena and Vivian; direct TTS only |

Upstream sources:

- <https://github.com/Rikorose/DeepFilterNet>
- <https://github.com/Plachtaa/seed-vc>
- <https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI>
- <https://github.com/modelscope/ClearerVoice-Studio>
- <https://github.com/OpenBMB/VoxCPM>
- <https://github.com/FunAudioLLM/CosyVoice>
- <https://github.com/QwenLM/Qwen3-TTS>

## Start

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\start-seed-vc.ps1 -OpenBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\start-rvc.ps1 -OpenBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\start-clearervoice.ps1 -OpenBrowser
```

Seed-VC starts V2 by default because it is the relevant timbre/style conversion path and fits an 8 GB GPU more reliably. Add `-EnableV1` only when both interfaces are needed at the same time.

Run DeepFilterNet on one recording:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\voice-lab\run-deepfilter.ps1 -InputPath .\path\to\narration.wav
```

Server logs and PID files are written below each application's `.runtime/` directory.

The currently running processes use the upstream launch logs under each application's `logs/` directory. The local launcher scripts use `.runtime/` for new sessions. Stop the existing process before starting a duplicate session on the same port.

## HyperFrames handoff

Keep the human delivery as the source recording. The practical local handoff is:

```text
recorded narration -> DeepFilterNet/ClearerVoice (optional cleanup)
                    -> CosyVoice VC or Seed-VC V2 (timbre-only; style checkbox off)
                    -> optional RVC model conversion
                    -> loudness/transcription -> HyperFrames media manifest
```

Use the selected WAV as a frozen local media asset in the HyperFrames project and record its source receipt. Do not let a TTS or voice-conversion pass silently rewrite timing; compare the converted waveform against the original before publishing.

### Locked alignment and SRT export

After ASR timing has been mapped back to `NarrationLock`, validate every hash and export subtitles only from the locked cues:

```powershell
python .\tools\voice-lab\validate_alignment_and_export_srt.py `
  --alignment .\path\to\audio\alignment.json `
  --asr-alignment .\path\to\audio\alignment.asr.json `
  --narration .\path\to\input\narration.txt `
  --narration-lock .\path\to\NarrationLock.json `
  --audio .\path\to\audio\narration.final.wav `
  --output-srt .\path\to\captions\narration.zh-CN.srt `
  --report .\path\to\captions\alignment-validation.json
```

The tool verifies audio, ASR and narration hashes; monotonic word/cue timing; full NarrationLock reconstruction; and cue CPS. A cue gap is accepted only when the cue-to-word binding proves that no aligned character is skipped; this is a `technical-only/internal-only` check with `humanListening=not-performed`, not a listening approval. `alignment.transcriptText` is retained raw ASR evidence and is never a subtitle or on-screen-text source. Downstream text must come from `alignment.cues`.

## Provenance

The source archives and upstream license files remain beside the installations. Generated audio must be registered in the target project's media manifest before final HyperFrames render. Voice models and reference recordings require their own consent and license receipt; repository code licenses do not grant rights to a third party's voice.
