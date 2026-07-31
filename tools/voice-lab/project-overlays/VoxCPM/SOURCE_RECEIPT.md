# VoxCPM2 Local Runtime Receipt

- Upstream: <https://github.com/OpenBMB/VoxCPM>
- Source commit: `616d3d3e630a9c96c2853250eef91b0f39dcd5fa`
- Code and model license: Apache-2.0
- Model repository: <https://modelscope.cn/models/OpenBMB/VoxCPM2>
- ModelScope model id: `OpenBMB/VoxCPM2`
- Local model path: `pretrained_models/VoxCPM2/`
- Model file: `model.safetensors`, 4,580,080,592 bytes
- Model SHA-256: `F7F964CFA9DA23653BAEC6E6F7750719977AD944ED9F95FE52FE3A620506891D`
- AudioVAE SHA-256: `94B5D51E107E0507D4ACC976CFDADB64EDD6FD06D1F751DADBF2FD1594274BF1`
- Python: 3.10.20, isolated in `.venv/`
- PyTorch: 2.10.0+cu128
- TorchAudio: 2.10.0+cu128
- TorchCodec: 0.10.0
- Windows app-local MSVC runtime: 14.42.34433

The default sample script uses Voice Design and does not imitate a named person. Voice cloning must only use recordings with explicit permission for voice cloning and publication. AI-generated audio should be disclosed where appropriate.

## Verify Without Inference

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-mature-female.ps1 -CheckOnly
```

Add `-VerifyHash` to recompute the SHA-256 of the 4.58 GB model file.

## Generate The Short Sample

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-mature-female.ps1
```

The default text and control prompt target a 10-15 second mature Mandarin female narration. Duration is generative and can vary by seed, so the script reports the actual duration without trimming speech.
