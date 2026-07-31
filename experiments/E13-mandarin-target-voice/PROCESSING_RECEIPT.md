# Processing Receipt

Generated locally on 2026-07-18. No paid API or cloud voice conversion was used.

## Input

- Source: user-provided recording frozen in E12 as `00-original.wav`
- Source duration: 51.925 seconds, 48 kHz mono
- Reference: `references/xiaoxiao-mandarin-female.wav`
- Reference origin: E05 local technical sample, voice `zh-CN-XiaoxiaoNeural`, first 15 seconds extracted from the existing local narration
- Reference role: Mandarin female target timbre only; this is not the user's voice and is local evaluation only

## Seed-VC parameters

- Source: https://github.com/Plachtaa/seed-vc
- Code license: GPL-3.0
- V2 checkpoint/dependency weight license: not captured in this experiment; do not treat the candidates as cleared for publication
- Runtime: local Seed-VC V2, RTX 4060 Ti
- Common parameters: steps 30, length adjust 1.0, intelligibility 0.0, top-p 0.9, temperature 1.0, repetition 1.0, style/emotion/accent off

| Candidate | Similarity CFG | Raw output | Listening output |
| --- | ---: | --- | --- |
| 07 | 0.45 | `outputs/raw/07-seedvc-zh-female-sim045.wav` | `outputs/listen/07-seedvc-zh-female-sim045.wav` |
| 08 | 0.55 | `outputs/raw/08-seedvc-zh-female-sim055.wav` | `outputs/listen/08-seedvc-zh-female-sim055.wav` |
| 09 | 0.65 | `outputs/raw/09-seedvc-zh-female-sim065.wav` | `outputs/listen/09-seedvc-zh-female-sim065.wav` |

All listening outputs use two-pass FFmpeg loudnorm targeting `I=-16`, `TP=-1.5`, `LRA=11`, then 48 kHz mono PCM WAV.

## SHA-256

| File | SHA-256 |
| --- | --- |
| `outputs/raw/07-seedvc-zh-female-sim045.wav` | `BA4A2C62EE62E933E39AC9B77D747840DD4EB2344D37C21AFC372FE7DF3BF649` |
| `outputs/listen/07-seedvc-zh-female-sim045.wav` | `4B7B9F71A55F015F895926181692A3461E1806240816BDA1033FDE6E3ED153BD` |
| `outputs/raw/08-seedvc-zh-female-sim055.wav` | `A7364C89EED509A7C888BFCA89D9FB6BC9655F404805D53D8A6AB0DD1B18DFD8` |
| `outputs/listen/08-seedvc-zh-female-sim055.wav` | `4BA007B67861FB7ED3216D9570C40AB7CF3EEEE1700F24069DD1575886685D3A` |
| `outputs/raw/09-seedvc-zh-female-sim065.wav` | `6B2A131DAAD7A0F82A96438640B8EF5A390F6BA7E2574C0DD0C85DA400F6018E` |
| `outputs/listen/09-seedvc-zh-female-sim065.wav` | `E259DCCE3579543E57FB5FC906257962932F53552F9DFB57C41CC6CDF04F932C` |
