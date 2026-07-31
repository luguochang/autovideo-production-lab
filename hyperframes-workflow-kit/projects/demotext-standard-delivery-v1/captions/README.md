# Caption Handoff

`narration.zh-CN.srt` is generated from `audio/alignment.json` `cues`, whose text reconstructs the immutable NarrationLock exactly after whitespace normalization.

Do not consume `audio/alignment.json` `transcriptText`. That field intentionally retains the raw Whisper transcript as ASR evidence and contains recognition errors. The allowed downstream text sources are:

- subtitle and phrase-level motion: `alignment.cues`
- word-level motion: `alignment.words`, subject to the documented interpolation limitation

Validation evidence is in `alignment-validation.json`. The current result binds the final WAV, raw ASR, NarrationLock and alignment hashes; verifies 46 monotonic, gap-free cues; and passes a 15 CPS threshold with a measured maximum of 8.75 CPS.

Word timing is not forced alignment. Before karaoke highlighting, lip-sync or phoneme-precise motion, perform forced alignment or human timing review. Human listening and voice publication rights also remain required before public release.
