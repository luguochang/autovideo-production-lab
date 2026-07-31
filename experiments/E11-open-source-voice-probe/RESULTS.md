# E11 免费本地配音自测结果

## Scope

This is a technical voice probe, not a final narration approval. The reference
voice is a project-generated Edge TTS clip, not the user's voice. The target
copy is generated test text, not an approved `NarrationLock` excerpt.

## Candidates

| Candidate | Runtime | Duration | Loudness after one-pass normalize | Notes |
|---|---:|---:|---:|---|
| GPT-SoVITS V2 | local CPU | 19.82 s | -16.2 LUFS | cloned the reference timbre; more pauses and longer delivery |
| Edge Yunxi 1.08 | local/network-free after request | 18.09 s | -17.5 LUFS | existing project baseline; faster and more compressed delivery |

The same three-sentence Chinese text was used for both candidates. The
unnormalized GPT-SoVITS output measured -21.0 LUFS and the Edge output -24.7
LUFS, so the A/B file was normalized before playback.

## Selected free path

For the generated-voice path, use **GPT-SoVITS V2 + FFmpeg loudnorm**, with
ClearerVoice or an equivalent local enhancer applied only when the input is a
real recording. Keep Edge TTS as the cheap fallback and regression baseline.

Why this is the current selection:

- Chinese zero-shot voice cloning works locally with no API key.
- The repository code is MIT licensed.
- The output preserved the reference voice characteristics and generated
  natural sentence-level pauses in this probe.
- The RTX 4060 Ti is sufficient for the model; this probe ran on CPU because a
  stable CUDA wheel was not installed yet. CPU generation is usable for short
  iterations but slower for full-length production.

## Artifacts

- Raw GPT-SoVITS: `output/gpt-sovits-v2-cpu-long.wav`
- Raw Edge baseline: `output/edge-yunxi-long/narration.mp3`
- Normalized GPT-SoVITS: `output/normalized/gpt-sovits-v2.wav`
- Normalized Edge: `output/normalized/edge-yunxi.wav`
- A/B playback file (GPT then Edge): `assets/voice/ab-normalized-gpt-then-edge.wav`
- HyperFrames media manifest: `.media/manifest.jsonl`

## HyperFrames handoff

Use `output/normalized/gpt-sovits-v2.wav` as the frozen voice asset, ingest it
with `media-use resolve --from ... --type voice`, then transcribe the final
audio for word timestamps before driving captions and animation. Do not reuse
Edge timestamps after switching voices.

## Remaining quality gate

Human listening is still required for final approval: pronunciation of project
names, emotional credibility, and whether the cloned timbre is comfortable for
a full five-minute narration. The A/B file is intentionally provided for that
decision.
