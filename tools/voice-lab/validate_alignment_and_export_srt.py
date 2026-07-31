from __future__ import annotations

import argparse
import hashlib
import json
import math
import unicodedata
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ValidationError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize_locked_text(value: str) -> str:
    return unicodedata.normalize("NFC", value.replace("\r\n", "\n").strip())


def compact_text(value: str) -> str:
    return "".join(character for character in normalize_locked_text(value) if not character.isspace())


def alignment_characters(value: str) -> str:
    return "".join(character.lower() for character in normalize_locked_text(value) if character.isalnum())


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValidationError(f"Expected a JSON object: {path}")
    return value


def timed_entry_metrics(entries: Any, label: str, allow_overlaps: bool) -> dict[str, Any]:
    if not isinstance(entries, list) or not entries:
        raise ValidationError(f"Alignment has no {label}")

    overlap_count = 0
    max_gap_seconds = 0.0
    gaps = []
    previous_start = -math.inf
    previous_end = -math.inf
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ValidationError(f"{label}[{index}] is not an object")
        try:
            start = float(entry["start"])
            end = float(entry["end"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValidationError(f"{label}[{index}] has invalid timestamps") from error
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValidationError(f"{label}[{index}] has an invalid interval: {start}..{end}")
        if start + 1e-9 < previous_start or end + 1e-9 < previous_end:
            raise ValidationError(f"{label} timestamps are not monotonic at index {index}")
        if start + 1e-9 < previous_end:
            overlap_count += 1
            if not allow_overlaps:
                raise ValidationError(f"{label} overlap at index {index}: {start} < {previous_end}")
        if math.isfinite(previous_end):
            gap_seconds = start - previous_end
            max_gap_seconds = max(max_gap_seconds, gap_seconds)
            if gap_seconds > 0.001:
                gaps.append({
                    "beforeIndex": index,
                    "startSeconds": round(previous_end, 6),
                    "endSeconds": round(start, 6),
                    "durationSeconds": round(gap_seconds, 6),
                })
        previous_start = start
        previous_end = end

    return {
        "count": len(entries),
        "firstStartSeconds": float(entries[0]["start"]),
        "lastEndSeconds": float(entries[-1]["end"]),
        "overlapCount": overlap_count,
        "gapCount": len(gaps),
        "gaps": gaps,
        "maxGapSeconds": round(max_gap_seconds, 6),
        "monotonic": True,
    }


def cue_word_binding_metrics(
    cues: list[dict[str, Any]],
    words: list[dict[str, Any]],
) -> dict[str, Any]:
    cursor = 0
    bindings = []
    for cue_index, cue in enumerate(cues):
        character_count = len(alignment_characters(str(cue.get("text", ""))))
        cue_words = words[cursor:cursor + character_count]
        if len(cue_words) != character_count or not cue_words:
            raise ValidationError(f"Cue {cue.get('id', cue_index)} has no complete word binding")

        cue_start = float(cue["start"])
        cue_end = float(cue["end"])
        first_word_start = float(cue_words[0]["start"])
        last_word_end = float(cue_words[-1]["end"])
        if cue_start - first_word_start > 0.001:
            raise ValidationError(
                f"Cue {cue.get('id', cue_index)} starts after its first aligned character"
            )
        if last_word_end - cue_end > 0.001:
            raise ValidationError(
                f"Cue {cue.get('id', cue_index)} ends before its last aligned character"
            )

        bindings.append({
            "id": cue.get("id"),
            "firstWordIndex": cursor,
            "lastWordIndex": cursor + character_count - 1,
            "firstWordStartSeconds": first_word_start,
            "lastWordEndSeconds": last_word_end,
            "passed": True,
        })
        cursor += character_count

    if cursor != len(words):
        raise ValidationError(f"Cue bindings consume {cursor} of {len(words)} word entries")
    return {
        "policy": "gaps-allowed-only-when-no-aligned-character-is-skipped",
        "reviewScope": "technical-only/internal-only",
        "humanListening": "not-performed",
        "passed": True,
        "bindings": bindings,
    }


def cue_cps_metrics(cues: list[dict[str, Any]], max_cps: float) -> dict[str, Any]:
    items = []
    for cue in cues:
        duration = float(cue["end"]) - float(cue["start"])
        characters = len(compact_text(str(cue.get("text", ""))))
        cps = characters / duration
        items.append({
            "id": cue.get("id"),
            "characters": characters,
            "durationSeconds": round(duration, 3),
            "cps": round(cps, 3),
            "passed": cps <= max_cps,
        })
    failed = [item for item in items if not item["passed"]]
    if failed:
        detail = ", ".join(f"{item['id']}={item['cps']}" for item in failed)
        raise ValidationError(f"Cue CPS exceeds {max_cps}: {detail}")
    return {
        "thresholdCps": max_cps,
        "maximumCps": max(item["cps"] for item in items),
        "passed": True,
        "cues": items,
    }


def format_srt_timestamp(seconds: float) -> str:
    total_milliseconds = round(seconds * 1000)
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def render_srt(cues: list[dict[str, Any]]) -> str:
    blocks = []
    for index, cue in enumerate(cues, start=1):
        text = str(cue["text"]).replace("\r\n", "\n").strip()
        blocks.append(
            f"{index}\r\n"
            f"{format_srt_timestamp(float(cue['start']))} --> "
            f"{format_srt_timestamp(float(cue['end']))}\r\n"
            f"{text.replace(chr(10), chr(13) + chr(10))}"
        )
    return "\r\n\r\n".join(blocks) + "\r\n"


def validate_alignment(
    alignment_path: Path,
    asr_alignment_path: Path,
    narration_path: Path,
    narration_lock_path: Path,
    audio_path: Path,
    max_cps: float = 15.0,
) -> dict[str, Any]:
    alignment = read_json(alignment_path)
    asr_alignment = read_json(asr_alignment_path)
    narration_lock = read_json(narration_lock_path)
    narration = normalize_locked_text(narration_path.read_text(encoding="utf-8-sig"))

    narration_sha256 = hashlib.sha256(narration.encode("utf-8")).hexdigest()
    audio_sha256 = sha256_file(audio_path)
    asr_sha256 = sha256_file(asr_alignment_path)
    expected = {
        "NarrationLock.normalizedSha256": (narration_lock.get("normalizedSha256"), narration_sha256),
        "alignment.narrationSha256": (alignment.get("narrationSha256"), narration_sha256),
        "alignment.sourceSha256": (alignment.get("sourceSha256"), audio_sha256),
        "ASR.sourceSha256": (asr_alignment.get("sourceSha256"), audio_sha256),
        "alignment.asrAlignmentSha256": (alignment.get("asrAlignmentSha256"), asr_sha256),
    }
    for label, (recorded, actual) in expected.items():
        if str(recorded).lower() != str(actual).lower():
            raise ValidationError(f"Hash mismatch for {label}: recorded={recorded}, actual={actual}")

    duration = wav_duration(audio_path)
    if abs(float(alignment.get("durationSeconds", -1)) - duration) > 0.001:
        raise ValidationError("Alignment duration does not match the final WAV")

    words = alignment.get("words")
    cues = alignment.get("cues")
    word_metrics = timed_entry_metrics(words, "words", allow_overlaps=True)
    cue_metrics = timed_entry_metrics(cues, "cues", allow_overlaps=False)
    if abs(cue_metrics["firstStartSeconds"]) > 0.001:
        raise ValidationError("First cue must start at zero")
    if abs(cue_metrics["lastEndSeconds"] - duration) > 0.001:
        raise ValidationError("Last cue does not cover the final WAV duration")

    locked_cue_text = "".join(str(cue.get("text", "")) for cue in cues)
    if compact_text(locked_cue_text) != compact_text(narration):
        raise ValidationError("Cue text does not reconstruct the full NarrationLock narration")
    if any(cue.get("source") != "NarrationLock exact text" for cue in cues):
        raise ValidationError("Every cue must declare NarrationLock exact text as its source")

    locked_word_text = "".join(str(word.get("text", "")) for word in words)
    if locked_word_text != alignment_characters(narration):
        raise ValidationError("Word entries do not reconstruct NarrationLock alignable characters")

    cue_word_bindings = cue_word_binding_metrics(cues, words)

    raw_asr_text = str(asr_alignment.get("transcriptText", ""))
    if str(alignment.get("transcriptText", "")) != raw_asr_text:
        raise ValidationError("alignment.transcriptText must retain the raw ASR transcript as evidence")

    cps = cue_cps_metrics(cues, max_cps)
    return {
        "schemaVersion": "autovideo-alignment-validation/v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "inputs": {
            "alignment": str(alignment_path.resolve()),
            "alignmentSha256": sha256_file(alignment_path),
            "asrAlignment": str(asr_alignment_path.resolve()),
            "asrAlignmentSha256": asr_sha256,
            "narration": str(narration_path.resolve()),
            "narrationSha256": narration_sha256,
            "narrationLock": str(narration_lock_path.resolve()),
            "audio": str(audio_path.resolve()),
            "audioSha256": audio_sha256,
            "audioDurationSeconds": round(duration, 6),
        },
        "textPolicy": {
            "downstreamTextSource": "alignment.cues",
            "rawAsrTranscriptField": "alignment.transcriptText",
            "rawAsrTranscriptRole": "evidence-only",
            "rawAsrTranscriptDownstreamConsumable": False,
        },
        "checks": {
            "hashesBound": True,
            "wordTimeline": word_metrics,
            "cueTimeline": cue_metrics,
            "cueWordBindings": cue_word_bindings,
            "wordTextReconstructsNarrationLock": True,
            "cueTextReconstructsNarrationLock": True,
            "cueCps": cps,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate locked narration alignment and export SRT only from NarrationLock cues."
    )
    parser.add_argument("--alignment", type=Path, required=True)
    parser.add_argument("--asr-alignment", type=Path, required=True)
    parser.add_argument("--narration", type=Path, required=True)
    parser.add_argument("--narration-lock", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--output-srt", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--max-cps", type=float, default=15.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report = validate_alignment(
        args.alignment.resolve(),
        args.asr_alignment.resolve(),
        args.narration.resolve(),
        args.narration_lock.resolve(),
        args.audio.resolve(),
        args.max_cps,
    )
    alignment = read_json(args.alignment.resolve())
    srt = render_srt(alignment["cues"])
    args.output_srt.parent.mkdir(parents=True, exist_ok=True)
    args.output_srt.write_bytes(srt.encode("utf-8"))
    report["outputs"] = {
        "srt": str(args.output_srt.resolve()),
        "srtSha256": sha256_file(args.output_srt),
        "cueCount": len(alignment["cues"]),
        "source": "alignment.cues (NarrationLock exact text)",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "report": str(args.report.resolve()),
        "srt": str(args.output_srt.resolve()),
        "cues": report["outputs"]["cueCount"],
        "maximumCueCps": report["checks"]["cueCps"]["maximumCps"],
        "rawAsrTranscriptDownstreamConsumable": False,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
