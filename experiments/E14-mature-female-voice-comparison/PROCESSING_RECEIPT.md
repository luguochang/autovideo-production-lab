# E14 Processing Receipt

Generated locally on 2026-07-18. No paid API or cloud voice service was used.

## Human preference

Updated on 2026-07-18 after the user explicitly selected candidate `14` for current production use. This is the final local selection for now, not final publication authorization:

| Candidate | Route | Manifest ID | Timing behavior |
| --- | --- | --- | --- |
| `14` | CosyVoice SFT built-in `中文女`, speed `1.03`, seed `7` | `voice_015` | Current selection; text-only TTS regeneration |
| `10` | CosyVoice SFT built-in `中文女`, speed `1.03` | `voice_011` | Previous favorite; no fixed sampling seed |
| `02` | VoxCPM2 mature mid-low Mandarin female Voice Design | `voice_003` | Historical candidate; TTS regeneration |
| `06` | CosyVoice SFT built-in `中文女`, speed `1.0` | `voice_007` | Historical baseline for the same speaker identity |

The project preference is stored at `.media/preferences.json` with the value `14 CosyVoice SFT 中文女 speed 1.03 seed 7 (selected final for now; text-only TTS default)`. It has not been promoted to a user-wide default.

## Input and ASR

- User source: `C:\Users\90603\Documents\录音\录音.m4a`
- Full duration: 51.925 seconds, mono
- Probe window: first 15.000 seconds
- ASR: local CPU FunASR SeACo-Paraformer, with SenseVoiceSmall cross-check
- ASR status: `needs_human_review` for mixed-English product names; only the two agreed Chinese sentences were used for TTS

## Source repositories

| Tool | Repository | Commit | Code license |
| --- | --- | --- | --- |
| CosyVoice | `https://github.com/FunAudioLLM/CosyVoice` | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc` | Apache-2.0 |
| VoxCPM | `https://github.com/OpenBMB/VoxCPM` | `616d3d3e630a9c96c2853250eef91b0f39dcd5fa` | Apache-2.0 |
| Qwen3-TTS | `https://github.com/QwenLM/Qwen3-TTS` | `022e286b98fbec7e1e916cb940cdf532cd9f488e` | Apache-2.0 |

Model paths:

- `tools/voice-lab/CosyVoice/pretrained_models/CosyVoice-300M`
- `tools/voice-lab/CosyVoice/pretrained_models/CosyVoice-300M-SFT`
- `tools/voice-lab/VoxCPM/pretrained_models/VoxCPM2`
- `tools/voice-lab/Qwen3-TTS/pretrained_models/Qwen3-TTS-12Hz-0.6B-CustomVoice`
- `tools/voice-lab/Qwen3-TTS/pretrained_models/Qwen3-TTS-12Hz-1.7B-VoiceDesign`

VoxCPM2 official main-weight SHA-256: `F7F964CFA9DA23653BAEC6E6F7750719977AD944ED9F95FE52FE3A620506891D`.

Qwen3-TTS official main-weight SHA-256: `BC3C7E785EB961179C25450D1ACFF03F839E0002F2F3A5AEB67B5735C0FA2ADB`.

Qwen3-TTS 1.7B VoiceDesign main-weight SHA-256: `391E8DB219F292C515297CDCEEB43E4EAE67CDDE35FA57E79A6A8A532FCA0522`.

Qwen3-TTS speech-tokenizer SHA-256: `836B7B357F5EA43E889936A3709AF68DFE3751881ACEFE4ECF0DBD30BA571258`.

## Generation parameters

### CosyVoice VC

- Source: `inputs/source-probe-00-15s.wav`
- Runtime: RTX 4060 Ti, FP32, `stream=True`, speed `1.0`
- `01` target: E13 Xiaoxiao synthetic technical reference
- `03` target: raw `02` VoxCPM2 mature low female
- `05` target: raw `04` VoxCPM2 mid-bright female
- Output duration: 14.9769 seconds for all three VC probes

FP16 was tested once on this machine and produced an all-NaN decoded waveform (`330240/330240` samples non-finite). The invalid file was overwritten. `run_local_test.py` now defaults to FP32, replaces any non-finite values before saving, and requires an explicit `--fp16` opt-in.

### VoxCPM2 Voice Design

- Device/dtype: CUDA, BF16
- CFG: `2.0`
- Inference steps: `10`
- `02` seed `42`; control: mature, steady Mandarin woman, mid-low pitch, warm, restrained, documentary narration, natural speed, not sweet
- `04` seed `7`; control: mature, intelligent Mandarin woman, brighter mid pitch, warm, natural, conversational, not sweet
- `11` seed `17` and `12` seed `73`; shared control: mature and intelligent Mandarin woman, mid-low pitch, warm and relaxed, natural conversation, thoughtful pauses, relaxed sentence endings, no broadcast delivery, not sweet

### CosyVoice SFT

- Speaker: `中文女`
- Runtime: FP32, `stream=True`, speed `1.0`
- The built-in speaker's underlying human-source consent/provenance is not documented in the checked model card; evaluation only until verified
- `09/10` runtime: FP32, `stream=False`, speed `0.94/1.03`. Non-streaming is required for this CosyVoice branch to apply `speed`; the former `stream=True` path ignores it.
- The generator is stochastic and no fixed sampling seed was exposed for `09/10`, so they are listening candidates rather than a controlled time-stretch experiment. Observed duration is not assumed to change monotonically with `speed`.
- The SFT speaker map contains `中文女`, `中文男`, `日语男`, `粤语女`, `英文女`, `英文男`, and `韩语女`; only `中文女` is a native Mandarin female preset.
- `14/15/16`: same `中文女`, FP32, `stream=False`, speed `1.03`, deterministic seeds `7/42/73`. These vary sampling/prosody, not speaker identity.
- `17`: CosyVoice VC, FP32, source `inputs/source-probe-00-15s.wav`, target raw candidate `10`, speed `1.0`; intended to preserve source delivery while approaching the preferred target timbre.

### Qwen3-TTS 0.6B CustomVoice

- Device/dtype: CUDA, BF16, SDPA
- Language: `Chinese`
- Seed: `42`
- Speakers: `Serena`, `Vivian`
- The 0.6B implementation forces `instruct=None`; no style instruction was passed
- Official descriptions classify both Chinese female voices as young, so they are fixed-voice naturalness baselines, not mature-voice claims

### Qwen3-TTS 1.7B VoiceDesign

- Device/dtype/attention: CUDA, BF16, PyTorch SDPA; FlashAttention was not installed or required
- Language: `Chinese`; seed: `42`
- Instruction: mature and steady Mandarin woman, mid-low pitch, warm and substantial timbre, restrained natural delivery, face-to-face explanation rather than broadcast narration, not sweet or sharp, relaxed sentence endings
- Memory after load: 3985 MiB allocated / 4112 MiB reserved; generation peak: 4163 MiB allocated / 4242 MiB reserved
- Output sample rate: 24 kHz; the listening copy is mono 48 kHz PCM after loudness normalization
- This is a non-person-specific designed voice and does not preserve the user's original timing

## Output checks

All raw outputs decode successfully with zero non-finite samples. Listening outputs are mono 48 kHz PCM WAV normalized with FFmpeg loudnorm targeting `I=-16`, `TP=-1.5`, `LRA=11`.

| ID | Raw duration | Median F0 | Raw SHA-256 | Listening SHA-256 |
| --- | ---: | ---: | --- | --- |
| 00 | 15.0000s | 120 Hz | user-source probe | `C301F69B9FEF720D2EB0258F1BFA050458776C63E670AEFD676C0806212F1373` |
| 01 | 14.9769s | 205 Hz | `8003423D4B8BA2EAA1543CA9E136210756D0DF2EAB3E20EA55957D2119AADFA1` | `3FB92C6A9B82899895433EC89484B447250E054B210423E740D9F3F7721B5E34` |
| 02 | 5.1200s | 177 Hz | `0A688D53E5E92F44705B0774F6E9E91D9BAE34963C5F91BE0B256E772C9010AA` | `380FC32356AE2D9941F9BE461B2FF9C54DCEBA2B5957F0CDEE1805E7E2A755AD` |
| 03 | 14.9769s | 153 Hz | `98C0058D7AEA7E1CDA31E55FBFF1A91C6E268A05596E5BB60B9E06452775CAB8` | `F88806FA6F51845608CC5E94B85DA72520640FC9FCF3E7F68D8215F9F4069D93` |
| 04 | 4.4800s | 271 Hz | `9F0D1D9F27004548F2C1BAB89E4CD5CD2084F1268616B951B081164666851E04` | `F21558E88B960EF94FB93D0B1EDC49DB9D599C8D7B6B7B9FD96DFF738DCCDC22` |
| 05 | 14.9769s | 211 Hz | `EAC48CB33B054805B327FE54B22BE6C60BDC3FECF98FE371757E28E68A28E85C` | `20409AEE26D155E06EFBDFF245801D2EC410E5D7933AA76BD638C2D062C31294` |
| 06 | 4.3886s | 193 Hz | `D4805C8FBA1A5A836B6D526546226286F856608FA8FEE477B21FA9B548E9D830` | `0055C55AD1D584834FEFCF6ACE7B3D997F7348B1EDEF69456BB94F4D1E174383` |
| 07 | 5.3600s | 276 Hz | `2740AB700867661477B2E62BF5BFD6F3F6DC42D152EE27191CAFB2BE78D9B7A8` | `61449D32186728F5A04EA2D9A7CC5EA525ACF2C6F9205A64BDBED251D2FA43F3` |
| 08 | 6.4800s | 238 Hz | `FE70A77FB7BD4D0B80A21CCDA9A41E3287A366F1CF1E2733CD5529155E0B698A` | `37A2151B18510E8F8D92048DCC349C302C7F63ACDA928CB6E984F449CE2003C1` |
| 09 | 4.6556s | 193 Hz | `15AB406A36456D563F8044E38B62FA8F6CAC4A2A165CFB818D801B85153F69E5` | `1AF6D7DD496A4AF99AE68398F389A20EA1B18847C6F516252DB98CA08BDA36FD` |
| 10 | 4.7020s | 182 Hz | `C0B3887BDB2EA20AF2F9843D283C2D83C47293F952C21D51E36DEA6D0D48EDAB` | `CFE1536A28EC5C872AEEB176491AA10229EA3817F12A45587FA78498409879A7` |
| 11 | 5.2800s | 177 Hz | `B47B34391AF8A81A007A5F4CE9389A24DEC3CB025BE43DBE6554C0E6E3C14105` | `9E5D3842CB493FBE337DF071567774E922D9F3536309FBAE194180DF049EA944` |
| 12 | 6.5600s | 169 Hz | `1344A1EAA52EF4340405BD075010061AC80844BCC3ACBCB0D8F3B4EEF92FB744` | `0D0D65224652F6A1DCA280546E747FACFA51BEC4816DF4220BCC452923FA179F` |
| 13 | 5.7600s | 193 Hz | `AFB9D861582CD48242D1F9B7E9BACF02190206E0B7AD12C6BA7F1987654D063C` | `0D88F88C054D91CDB01BC1D19BD17F7536853768F62A76F4BF1635070035429E` |
| 14 | 5.1084s | 187 Hz | `DACEF9B61F98565FF550A3FD01EF040FD650945CEAF60C5C2655A8E16B076FD9` | `582031149997BA5814EFE6CE5BB90FD3FEEE8C1AB7D66C98C7B4C1511C028EAC` |
| 15 | 5.1548s | 183 Hz | `A0001F08DC9766DBADA4DC9F171A003DA5644DCA6032657BCA6C01E97FB232D8` | `FD34EF7517B5E3C37E6E849649B3D67B1AF4B68A6239E18445F45CD3FD27E1FE` |
| 16 | 4.8878s | 191 Hz | `0A01D0D766B4E32E87D57E34DCB16DB8AD5F783F9B974C2B72F6A80FF1E7BE56` | `70DACB8A17FDA6C86396B45F1044D2931F2F32D08013A247AC9859B0C0BF9BF3` |
| 17 | 14.9769s | 161 Hz | `EB9BAB70BD07776542D5DA45C051728804668644C90A5A4513F517131E63E4DF` | `D283C39065A498A9E89D09E452D778FAAC8E7C360E7929283B1413E4C7722B2B` |

## Rights boundary

- The user recording is user-provided and remains local.
- Apache/MIT/GPL code licenses do not automatically grant rights to an identifiable person's voice.
- VoxCPM2 Voice Design was used to create non-person-specific female personas; it was not instructed to imitate a real person.
- Xiaoxiao and built-in model speakers are evaluation-only here because a software/model license is not the same as documented speaker consent.
- Do not use a celebrity, commercial voice actor, colleague, or any identifiable real-person reference unless that person or the rights holder has explicitly authorized voice cloning and publication.
