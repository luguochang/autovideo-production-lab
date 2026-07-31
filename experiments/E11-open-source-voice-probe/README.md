# E11 Open Source Voice Probe

This probe validates a fully local GPT-SoVITS V2 inference path using a short
project-generated Edge TTS clip as a technical reference voice. It does not
represent the user's voice and must not be treated as an approved production
voice.

- Source model/code: `RVC-Boss/GPT-SoVITS`, MIT license.
- Model source: `XXXXRT/GPT-SoVITS-Pretrained` on ModelScope.
- Reference source: `experiments/E05-tts-probe/output/xiaoxiao-105/chunks/000/audio.webm`.
- Reference text: exact excerpt from `demo/demoText.txt`.
- Target text: generated test copy, not a NarrationLock excerpt.
