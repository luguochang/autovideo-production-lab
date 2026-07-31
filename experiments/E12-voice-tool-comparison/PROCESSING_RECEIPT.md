# Processing Receipt

Generated locally on 2026-07-17. No paid API or cloud voice generation was used.

## Input

- User file: `C:\Users\90603\Documents\录音\录音.m4a`
- Frozen asset: `.media/audio/voice/voice_001.m4a`
- SHA-256: `239BE515FACD90D20943C67EB5068E80CEFB0F9B71C368BE79DB74F8CE04A63B`
- Format: AAC, 48 kHz, mono, 51.925250 seconds
- Measured input loudness: -29.99 LUFS, -6.90 dBTP

## Common listening normalization

All files in `outputs/listen/` use two-pass FFmpeg `loudnorm` with target `I=-16`, `TP=-1.5`, `LRA=11`, then 48 kHz mono PCM 16-bit output. Measured integrated loudness ranges from -16.67 to -16.06 LUFS.

## Candidate 00: Original

- Processing: AAC decode to 48 kHz mono PCM WAV; no enhancement or conversion
- Raw SHA-256: `34F9E68A17494FA46CB21B1CFA3E9456641D37FCB2374A6D1CC19650BAD2F02E`

## Candidate 01: DeepFilterNet

- Source: https://github.com/Rikorose/DeepFilterNet
- License: MIT or Apache-2.0
- Runtime: `deepfilternet==0.5.6`, DeepFilterNet3, CPU
- Parameters: upstream default enhancement, delay compensation enabled, no post-filter
- Core inference: 1.17 seconds, RT factor 0.023
- Raw SHA-256: `757C2FC15A5A8A574232F63247296F324442F2BABA3BE9EF8E36CA5C579CBEC5`

## Candidate 02: ClearerVoice

- Source: https://github.com/modelscope/ClearerVoice-Studio
- License: Apache-2.0
- Runtime: `clearvoice==0.1.2`, CPU
- Model: `FRCRN_SE_16K`
- Parameters: speech enhancement, VAD disabled
- Model inference: about 56 seconds
- Raw SHA-256: `DD3D7673DF9B178DF4968FE4E9A688F5DABF570DF6032565E77C3AA0E1ADC9F9`

## Candidate 03: Seed-VC female demo

- Source: https://github.com/Plachtaa/seed-vc
- Code license: GPL-3.0
- Weight note: the exact V2 checkpoint and dependency-model license receipts were not captured in this experiment. Candidates 03 and 04 therefore remain local evaluation only even apart from the reference-voice warning.
- Runtime: Seed-VC V2, Torch `2.4.0+cu124`, RTX 4060 Ti
- Reference: upstream demo `examples/reference/azuma_0.wav`, copied to `references/seed-demo-azuma.wav`
- Reference SHA-256: `3930141E927BE50E7F3D666DB5890EF9A4BDA0623645483A6AFAAD241C82FB70`
- Parameters: steps 30, length 1.0, intelligibility 0.0, similarity 0.7, top-p 0.9, temperature 1.0, repetition 1.0, style conversion off, anonymization off
- Rights note: the demo reference's individual voice provenance is not documented. Local evaluation only.
- Raw format: 22.05 kHz mono PCM; measured true peak 0.0 dBFS, so use the normalized listening copy rather than the raw file.
- Raw SHA-256: `6D48AC5EBA538534EB758F004A62303B9DA783B99FB0FAEE0F895C44AAA7F61F`

## Candidate 04: Seed-VC anonymized

- Runtime and common parameters: same as candidate 03
- Parameters: anonymization on; target reference ignored
- Raw format: 22.05 kHz mono PCM; measured true peak about +0.1 dBFS, so use the normalized listening copy rather than the raw file.
- Raw SHA-256: `2ABB8F24AA8DA78E996904D7BB64B8CB95DB2F397F11CDD82C8DCF546447ED29`

## Candidates 05 and 06: RVC Female_1

- RVC source: https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
- RVC code license: MIT
- Target model: https://huggingface.co/Wismut/RVC_US_Female_1
- Model repository license: Apache-2.0
- Model commit: `e75d78091ea200d8e9e422760b96c4738287f10d`
- Model SHA-256: `CFD1A7B9FF93BBB394E2DDB39FE4C9F3512F9176072187D35C11800B6F435B5B`
- Index SHA-256: `B15D67755AAF7D62C5D26B6FC10DF7DDB2F625B17D15248A42F0EDE78B47D105`
- Runtime: Torch `2.4.0+cu121`, RTX 4060 Ti
- Parameters: RMVPE, index rate 0.7, filter radius 3, RMS mix 0.25, protect 0.33, no output resampling
- Candidate 05 pitch: +6 semitones; raw SHA-256 `8FAC533781B58496803FE568CCC5F42AB6854855CFF86CFD64FB0B24B72BBF19`
- Candidate 06 pitch: +12 semitones; raw SHA-256 `FDE673147E263F81F835C5DF14FBC85EE82223E3CFF512C4105BF84435E3C9FA`
- Rights note: the model card declares Apache-2.0 but does not document the individual training voice source or consent. Local evaluation only.

## Loudness-matched listening hashes

The registered `.media` copies `voice_002` through `voice_008` are byte-identical to these files.

| Candidate | Listening SHA-256 |
| --- | --- |
| 00 | `257E1BF2DCAE774080A4354C36F2CF6F8353CF2C8A8E31539E51559084415C1C` |
| 01 | `0F48371D9E16C1F1CB35CFCDDE55CD60CF8D446C37E44BAC16011649512EFAE5` |
| 02 | `9B07858D870341B7812C30BE30C5235E6FB7CD9AE2D3778E01291DC78DB133E9` |
| 03 | `E850DA97D55BF83AD00CC8420918C2C61C8DC3F087CAF609C42617615E1B8AE7` |
| 04 | `2E0E1727B37174146AC21CF82B6A378FB5550D94973FD3A298D629524A20402D` |
| 05 | `1312B5EC1E293ED2D4372C621D50437DA9C048B8E4B9BD62287EB6BBC2116CE4` |
| 06 | `7375D326F673239623EE1D19F10FCBE47CD50E4FAFB7C04CA2D12AC77CA222FB` |
