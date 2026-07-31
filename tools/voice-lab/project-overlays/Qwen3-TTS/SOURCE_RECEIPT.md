# Qwen3-TTS Source Receipt

- Upstream source: <https://github.com/QwenLM/Qwen3-TTS>
- Local source commit: `022e286b98fbec7e1e916cb940cdf532cd9f488e`
- Source license: Apache-2.0 (`LICENSE`)
- Official models: `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` and `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- Model host: ModelScope
- Model metadata license: Apache-2.0
- ModelScope reported storage size: `2,498,389,167` bytes
- Weight-file revision: `3b07e1843e41f3863f213c84e7003ad836a059c6`
- `model.safetensors`: `1,811,626,576` bytes, SHA-256
  `bc3c7e785eb961179c25450d1acff03f839e0002f2f3a5aeb67b5735c0fa2adb`
- `speech_tokenizer/model.safetensors`: `682,293,092` bytes, SHA-256
  `836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`
- Local manifest verification: 14 of 14 official files match their reported sizes;
  no incomplete files remain
- Prepared speakers: `Serena`, `Vivian`
- Prepared language: `Chinese`
- Instruction control: not supported by the 0.6B CustomVoice model; omitted

## 1.7B VoiceDesign

- Model metadata license: Apache-2.0
- ModelScope reported storage size: `4,520,164,607` bytes across 14 files
- `model.safetensors`: `3,833,402,552` bytes, SHA-256
  `391e8db219f292c515297cdceeb43e4eae67cdde35fa57e79a6a8a532fca0522`
- `speech_tokenizer/model.safetensors`: `682,293,092` bytes, SHA-256
  `836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`
- Prepared language: `Chinese`
- Prepared use: non-person-specific mature mid-low female voice design
- Local BF16/SDPA generation passed on RTX 4060 Ti 8 GB; peak PyTorch reserved memory was 4242 MiB

## Windows runtime

- Python: `3.10.20`
- `qwen-tts`: `0.1.1` from the editable official checkout
- PyTorch: `2.3.1+cu121`
- Torchaudio: `2.3.1+cu121`
- ONNX Runtime: `1.18.0`
- NumPy: `1.26.4`
- SoX: `14.4.2`, installed through WinGet for the current user

CPU/BF16 model-load validation passed with PyTorch SDPA. The model reported all
nine official speakers, including `serena` and `vivian`, and reported `chinese`
as a supported language. CUDA memory allocated during this validation was zero;
no speech inference was run.

The official model card describes Serena as a warm, gentle Chinese female voice
and Vivian as a bright, slightly edgy Chinese female voice. No external human
reference recording is used by the local sample script.

Repository and model licenses cover the code and weights. They do not authorize
using a third party's separate voice recording or impersonating an identifiable
person without consent.
