# Voice Lab Source Receipts

The entries below are free local/open-source runtimes. Model files are downloaded separately by each upstream application and remain under the tool directory or the documented local cache.

| Runtime | Upstream | License | Local source receipt |
| --- | --- | --- | --- |
| DeepFilterNet | https://github.com/Rikorose/DeepFilterNet | MIT or Apache-2.0 | `DeepFilterNet.zip`, SHA-256 `954F18E6E46C9021DB996F0C5FBD6632E0182FD5A4DCD59DB597D30720F2FF37` |
| Seed-VC | https://github.com/Plachtaa/seed-vc | GPL-3.0 | `seed-vc.zip`, SHA-256 `0560CAEB1E678012FFB8D72D982230B79E9C9C4188A172C412542F5D1C983527` |
| RVC WebUI | https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI | MIT | `RVC-WebUI.zip`, SHA-256 `22699DD699DD8148FBDC74E2F7EC81C2B2A8F33F16BFE53DC8CEC804E53E8339` |
| ClearerVoice-Studio | https://github.com/modelscope/ClearerVoice-Studio | Apache-2.0 | Upstream commit `6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61`; runtime `clearvoice==0.1.2`; details in `ClearerVoice-Studio/SOURCE_RECEIPT.md` |
| VoxCPM2 | https://github.com/OpenBMB/VoxCPM | Apache-2.0 | Upstream commit `616d3d3e630a9c96c2853250eef91b0f39dcd5fa`; ModelScope `OpenBMB/VoxCPM2`; details in `VoxCPM/SOURCE_RECEIPT.md` |
| CosyVoice | https://github.com/FunAudioLLM/CosyVoice | Apache-2.0 | Upstream commit `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`; local models `CosyVoice-300M` and `CosyVoice-300M-SFT` |
| Qwen3-TTS | https://github.com/QwenLM/Qwen3-TTS | Apache-2.0 | Upstream commit `022e286b98fbec7e1e916cb940cdf532cd9f488e`; details and weight hashes in `Qwen3-TTS/SOURCE_RECEIPT.md` |

The ClearerVoice full checkout is not used on Windows because upstream training data contains the reserved filename `AUX`. The installed runtime, official Streamlit UI, license, README, and FRCRN model receipt are sufficient for local inference and are kept in `ClearerVoice-Studio/`.

Voice models and reference recordings need separate consent and licensing. These repository licenses do not grant rights to imitate another person's voice.
