from __future__ import annotations

import argparse
import hashlib
import json
import wave
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_CACHE = ROOT / ".cache" / "whisper"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe a locked AutoVideo narration WAV with word timestamps.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--narration-lock", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    audio_path = args.input.resolve()
    lock_path = args.narration_lock.resolve()
    output_path = args.output.resolve()
    if not audio_path.is_file() or audio_path.suffix.lower() != ".wav":
        raise FileNotFoundError(f"Final narration WAV does not exist: {audio_path}")
    if not lock_path.is_file():
        raise FileNotFoundError(f"NarrationLock does not exist: {lock_path}")

    lock = json.loads(lock_path.read_text(encoding="utf-8-sig"))
    narration_sha256 = lock.get("normalizedSha256")
    if not narration_sha256:
        raise ValueError("NarrationLock is missing normalizedSha256")

    import torch
    import whisper

    device = "cuda" if torch.cuda.is_available() else "cpu"
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    model = whisper.load_model(args.model, device=device, download_root=str(args.cache_dir.resolve()))
    result = model.transcribe(
        str(audio_path),
        language=args.language,
        word_timestamps=True,
        fp16=device == "cuda",
        temperature=0,
        condition_on_previous_text=True,
        initial_prompt="AI Coze Dify Codex Claude Code Agent Demo Magic Engineering API MCP Token",
        verbose=False,
    )

    segments = []
    words = []
    for segment in result.get("segments", []):
        segment_words = []
        for word in segment.get("words", []):
            item = {
                "start": round(float(word["start"]), 3),
                "end": round(float(word["end"]), 3),
                "text": str(word.get("word", "")),
                "probability": round(float(word.get("probability", 0)), 6),
            }
            segment_words.append(item)
            words.append(item)
        segments.append({
            "id": int(segment.get("id", len(segments))),
            "start": round(float(segment["start"]), 3),
            "end": round(float(segment["end"]), 3),
            "text": str(segment.get("text", "")).strip(),
            "words": segment_words,
        })

    if not words and not segments:
        raise RuntimeError("Whisper returned no timed entries")
    duration = wav_duration(audio_path)
    timed_entries = words or segments
    record = {
        "schemaVersion": "autovideo-alignment-whisper/v1",
        "engine": f"openai-whisper/{args.model}",
        "device": device,
        "language": args.language,
        "limitation": "ASR-derived word timestamps; this is not forced alignment. Re-run WhisperX for phoneme or lip-sync precision.",
        "source": str(audio_path),
        "sourceSha256": sha256_file(audio_path),
        "narrationLock": str(lock_path),
        "narrationSha256": narration_sha256,
        "durationSeconds": round(duration, 6),
        "firstStartSeconds": timed_entries[0]["start"],
        "lastEndSeconds": timed_entries[-1]["end"],
        "transcriptText": str(result.get("text", "")).strip(),
        "words": words,
        "segments": segments,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output": str(output_path),
        "engine": record["engine"],
        "device": device,
        "durationSeconds": record["durationSeconds"],
        "segments": len(segments),
        "words": len(words),
        "firstStartSeconds": record["firstStartSeconds"],
        "lastEndSeconds": record["lastEndSeconds"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
