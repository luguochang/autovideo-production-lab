# Qwen3-TTS Local Windows Setup

This checkout prepares the official 0.6B CustomVoice and 1.7B VoiceDesign
models for local Mandarin female-voice comparison. No celebrity, public figure,
or cloned human reference is used.

## Installed paths

- Source: `tools/voice-lab/Qwen3-TTS/`
- Python 3.10 environment: `tools/voice-lab/Qwen3-TTS/.venv/`
- Model: `pretrained_models/Qwen3-TTS-12Hz-0.6B-CustomVoice/`
- Sample runner: `run_custom_voice_sample.py`
- VoiceDesign model: `pretrained_models/Qwen3-TTS-12Hz-1.7B-VoiceDesign/`
- VoiceDesign runner: `run_voice_design_sample.py`
- Generated WAV files: `outputs/`

## Prepared voices

| Speaker | Official description | Native language |
| --- | --- | --- |
| `Serena` | Warm, gentle young female voice | Chinese |
| `Vivian` | Bright, slightly edgy young female voice | Chinese |

The 0.6B CustomVoice model does not support the `instruct` parameter. The local
runner therefore passes only `language="Chinese"`, a fixed preset speaker, and
the sample text. Do not describe this model as style-controllable. Serena's
official preset description is warm and gentle, but it is still a young female
voice rather than a dedicated mature-persona voice.

## Dry-run validation

This does not load the model or touch GPU memory:

```powershell
& .\.venv\Scripts\python.exe .\run_custom_voice_sample.py --dry-run
```

## Generate samples later

Run these only when GPU testing is intended:

```powershell
& .\.venv\Scripts\python.exe .\run_custom_voice_sample.py --speaker Serena
& .\.venv\Scripts\python.exe .\run_custom_voice_sample.py --speaker Vivian
```

The prepared runtime uses `torch==2.3.1+cu121`, `torchaudio==2.3.1+cu121`,
`onnxruntime==1.18.0`, `numpy==1.26.4`, and the official editable
`qwen-tts==0.1.1` checkout. The script uses PyTorch SDPA because FlashAttention
is not required for this Windows test path. SoX 14.4.2 is installed through WinGet for the current user; the
runner can locate it even when an older PowerShell session has not refreshed
its `PATH` yet.

## Expected resources

- Model files: about 2.5 GB on disk.
- Runtime environment: several GB because CUDA libraries are bundled.
- Expected inference VRAM: about 4-6 GB in BF16 for the 0.6B model, with short
  single-item generation. Keep the other voice-conversion servers stopped if an
  8 GB GPU reports an out-of-memory error.

## License and voice rights

The repository and official model metadata declare Apache-2.0. See
`SOURCE_RECEIPT.md` and the bundled `LICENSE` files. This permits use of the
software/model subject to the license, but does not grant rights to imitate an
unrelated identifiable person. The prepared test uses only official preset
speaker IDs and original neutral text.
