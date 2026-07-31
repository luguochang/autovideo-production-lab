from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import wave
from datetime import datetime, timezone
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalized_text(value: str) -> str:
    return value.replace("\r\n", "\n").strip()


def normalized_characters(value: str) -> list[str]:
    return [character.lower() for character in value if character.isalnum()]


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def quantize_word_interval(start: float, end: float) -> tuple[float, float, bool]:
    start_ms = round(start * 1000)
    end_ms = round(end * 1000)
    repaired = end_ms <= start_ms
    if repaired:
        end_ms = start_ms + 1
    return start_ms / 1000, end_ms / 1000, repaired


def normalize_word_interval(
    previous_end: float,
    raw_start: float,
    raw_end: float,
) -> tuple[float, float, bool]:
    start = max(previous_end, raw_start)
    end = max(start + 0.001, raw_end)
    return quantize_word_interval(start, end)


def levenshtein(left: list[str], right: list[str]) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_value in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_value in enumerate(right, start=1):
            current.append(min(
                previous[right_index] + 1,
                current[right_index - 1] + 1,
                previous[right_index - 1] + (left_value != right_value),
            ))
        previous = current
    return previous[-1]


def narration_cues(value: str) -> list[str]:
    cues = []
    for match in re.finditer(r"[^\n。！？!?]+(?:[。！？!?]+|$)", value.replace("\r\n", "\n")):
        cue = match.group(0).strip()
        if cue:
            cues.append(cue)
    return cues


def build_cues(narration: str, words: list[dict], duration: float) -> list[dict]:
    cues = []
    cursor = 0
    previous_end = 0.0
    previous_word_end = 0.0
    for cue_index, cue_text in enumerate(narration_cues(narration), start=1):
        cue_length = len(normalized_characters(cue_text))
        cue_words = words[cursor:cursor + cue_length]
        cursor += cue_length
        if not cue_words:
            continue

        first_word = cue_words[0]
        last_word = cue_words[-1]
        # An interpolated locked character can map to only part of an ASR word.
        # Preserve the source word envelope so a cue never starts mid-utterance.
        source_start = float(first_word.get("asrWordStart", first_word["start"]))
        source_end = float(last_word.get("asrWordEnd", last_word["end"]))
        first_word_start = float(first_word["start"])
        natural_start = min(first_word_start, source_start)
        if cues and previous_end > natural_start and previous_word_end <= first_word_start:
            lower_ms = round(previous_word_end * 1000)
            upper_ms = round(first_word_start * 1000)
            boundary_ms = min(upper_ms, max(lower_ms, round((lower_ms + upper_ms) / 2)))
            cues[-1]["end"] = boundary_ms / 1000
            previous_end = cues[-1]["end"]
        start = max(previous_end, natural_start)
        end = max(start + 0.05, float(last_word["end"]), source_end)
        cues.append({
            "id": f"cue-{cue_index:03d}",
            "start": round(start, 3),
            "end": round(min(duration, end), 3),
            "text": cue_text,
            "source": "NarrationLock exact text",
        })
        previous_end = cues[-1]["end"]
        previous_word_end = float(last_word["end"])

    if cursor != len(words):
        raise RuntimeError(f"Cue reconstruction consumed {cursor} of {len(words)} normalized characters")
    if not cues:
        raise RuntimeError("Narration produced no subtitle cues")
    cues[0]["start"] = 0.0
    cues[-1]["end"] = round(duration, 3)
    return cues


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Map ASR word timestamps back to immutable NarrationLock text.")
    parser.add_argument("--asr-alignment", type=Path, required=True)
    parser.add_argument("--narration", type=Path, required=True)
    parser.add_argument("--narration-lock", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asr_path = args.asr_alignment.resolve()
    narration_path = args.narration.resolve()
    lock_path = args.narration_lock.resolve()
    audio_path = args.audio.resolve()
    output_path = args.output.resolve()

    asr = json.loads(asr_path.read_text(encoding="utf-8-sig"))
    lock = json.loads(lock_path.read_text(encoding="utf-8-sig"))
    narration = normalized_text(narration_path.read_text(encoding="utf-8-sig"))
    narration_sha256 = hashlib.sha256(narration.encode("utf-8")).hexdigest()
    if narration_sha256 != lock.get("normalizedSha256"):
        raise ValueError("Narration text does not match NarrationLock")
    audio_sha256 = sha256_file(audio_path)
    if asr.get("sourceSha256") != audio_sha256:
        raise ValueError("ASR alignment source audio does not match the final WAV")

    reference = normalized_characters(narration)
    hypothesis = []
    hypothesis_times = []
    for word in asr.get("words", []):
        characters = normalized_characters(str(word.get("text", "")))
        if not characters:
            continue
        start = float(word["start"])
        end = float(word["end"])
        span = max(0.001, end - start)
        for index, character in enumerate(characters):
            hypothesis.append(character)
            hypothesis_times.append((
                start + span * index / len(characters),
                start + span * (index + 1) / len(characters),
                start,
                end,
            ))
    if not reference or not hypothesis:
        raise RuntimeError("Narration or ASR transcript has no alignable characters")

    mapped = [None] * len(reference)
    exact = [False] * len(reference)
    matcher = difflib.SequenceMatcher(None, reference, hypothesis, autojunk=False)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            mapped[block.a + offset] = block.b + offset
            exact[block.a + offset] = True

    known = [index for index, value in enumerate(mapped) if value is not None]
    if not known:
        raise RuntimeError("No characters could be mapped between NarrationLock and ASR")
    for index, value in enumerate(mapped):
        if value is not None:
            continue
        left = next((candidate for candidate in range(index - 1, -1, -1) if mapped[candidate] is not None), None)
        right = next((candidate for candidate in range(index + 1, len(mapped)) if mapped[candidate] is not None), None)
        if left is None:
            mapped[index] = max(0, mapped[right] - (right - index))
        elif right is None:
            mapped[index] = min(len(hypothesis) - 1, mapped[left] + (index - left))
        else:
            fraction = (index - left) / (right - left)
            mapped[index] = round(mapped[left] + (mapped[right] - mapped[left]) * fraction)
        mapped[index] = max(0, min(len(hypothesis) - 1, mapped[index]))

    words = []
    repaired_word_indexes = []
    shifted_overlap_word_indexes = []
    previous_end = 0.0
    for index, character in enumerate(reference):
        raw_start, raw_end, asr_word_start, asr_word_end = hypothesis_times[mapped[index]]
        if raw_start + 1e-9 < previous_end:
            shifted_overlap_word_indexes.append(index)
        start, end, repaired = normalize_word_interval(previous_end, raw_start, raw_end)
        if repaired:
            repaired_word_indexes.append(index)
        words.append({
            "index": index,
            "text": character,
            "start": start,
            "end": end,
            "asrWordStart": round(asr_word_start, 3),
            "asrWordEnd": round(asr_word_end, 3),
            "mapping": "exact" if exact[index] else "interpolated",
        })
        previous_end = end

    duration = wav_duration(audio_path)
    words[0]["start"] = 0.0
    words[-1]["end"] = round(duration, 3)
    cues = build_cues(narration, words, duration)

    edit_distance = levenshtein(reference, hypothesis)
    record = {
        "schemaVersion": "autovideo-alignment-locked/v1",
        "engine": "NarrationLock character mapping over openai-whisper/small",
        "method": "SequenceMatcher exact blocks plus monotonic interpolation for ASR substitutions/deletions",
        "limitation": "Locked-text timing derived from ASR words; use WhisperX/MFA for phoneme or lip-sync precision.",
        "source": str(audio_path),
        "sourceSha256": audio_sha256,
        "narration": str(narration_path),
        "narrationLock": str(lock_path),
        "narrationSha256": narration_sha256,
        "asrAlignment": str(asr_path),
        "asrAlignmentSha256": sha256_file(asr_path),
        "durationSeconds": round(duration, 6),
        "firstStartSeconds": words[0]["start"],
        "lastEndSeconds": words[-1]["end"],
        "referenceCharacters": len(reference),
        "asrCharacters": len(hypothesis),
        "editDistance": edit_distance,
        "cer": round(edit_distance / len(reference), 6),
        "exactMappedCharacters": sum(exact),
        "interpolatedCharacters": len(reference) - sum(exact),
        "timingNormalization": {
            "precisionMilliseconds": 1,
            "minimumWordIntervalMilliseconds": 1,
            "repairedCollapsedWordCount": len(repaired_word_indexes),
            "repairedWordIndexes": repaired_word_indexes,
            "shiftedOverlapWordCount": len(shifted_overlap_word_indexes),
            "shiftedOverlapWordIndexes": shifted_overlap_word_indexes,
        },
        "transcriptText": asr.get("transcriptText", ""),
        "transcriptTextRole": "raw-asr-evidence-only",
        "downstreamTextSource": "cues",
        "words": words,
        "segments": cues,
        "cues": cues,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output": str(output_path),
        "words": len(words),
        "cues": len(cues),
        "cer": record["cer"],
        "exactMappedCharacters": record["exactMappedCharacters"],
        "interpolatedCharacters": record["interpolatedCharacters"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
