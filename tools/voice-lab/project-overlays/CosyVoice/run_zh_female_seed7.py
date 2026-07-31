from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "pretrained_models" / "CosyVoice-300M-SFT"
MODEL_SCOPE_CACHE = ROOT.parent / ".cache" / "modelscope"
# Keep the small wetext frontend cache with the E-drive voice-lab install.
MODEL_SCOPE_CACHE.mkdir(parents=True, exist_ok=True)
os.environ["MODELSCOPE_CACHE"] = str(MODEL_SCOPE_CACHE)
DEFAULT_SPEAKER = "中文女"
DEFAULT_SPEED = 1.03
DEFAULT_SEED = 7
TARGET_LUFS = -16
TARGET_SAMPLE_RATE = 48_000
BATCH_SCHEMA_VERSION = "cosyvoice-zh-female-batch/v1"
MAX_BATCH_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_BATCH_SEGMENTS = 1000


@dataclass(frozen=True)
class SegmentRequest:
    segment_id: str
    text: str
    text_source: str
    output: Path
    receipt: Path
    batch_manifest: str | None = None
    batch_manifest_sha256: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the selected CosyVoice SFT Mandarin female preset (E14 candidate 14)."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="Text to synthesize. Best for one to three natural sentences.")
    source.add_argument("--text-file", type=Path, help="UTF-8 text file to synthesize.")
    source.add_argument(
        "--batch-manifest",
        type=Path,
        help="Auditable JSON manifest for multiple segments. Relative paths stay inside its directory.",
    )
    parser.add_argument("--output", type=Path, help="Final 48 kHz mono PCM WAV. Required outside batch mode.")
    parser.add_argument("--speaker", default=DEFAULT_SPEAKER)
    parser.add_argument("--speed", type=float, default=DEFAULT_SPEED)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--receipt",
        type=Path,
        help="JSON receipt path. Defaults to <output-stem>.recipe.json.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing output and receipt.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs and print the recipe without loading the model.",
    )
    args = parser.parse_args()
    if args.batch_manifest is None and args.output is None:
        parser.error("--output is required with --text or --text-file")
    if args.batch_manifest is not None and args.output is not None:
        parser.error("--output is declared per segment in --batch-manifest")
    if args.batch_manifest is not None and args.receipt is not None:
        parser.error("--receipt is declared per segment in --batch-manifest")
    return args


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def read_text(args: argparse.Namespace) -> tuple[str, str]:
    if args.text_file is not None:
        path = args.text_file.resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Text file does not exist: {path}")
        text = path.read_text(encoding="utf-8-sig")
        source = str(path)
    else:
        text = args.text
        source = "command-line"
    if not text or not text.strip():
        raise ValueError("Narration text is empty")
    return text, source


def ensure_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def reject_unknown_fields(value: dict[str, Any], allowed: set[str], label: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ValueError(f"{label} contains unknown fields: {', '.join(unknown)}")


def resolve_manifest_path(manifest_root: Path, value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty relative path")
    relative = Path(value)
    if relative.is_absolute():
        raise ValueError(f"{label} must be relative to the batch manifest: {value}")
    resolved = (manifest_root / relative).resolve()
    try:
        resolved.relative_to(manifest_root)
    except ValueError as error:
        raise ValueError(f"{label} escapes the batch manifest directory: {value}") from error
    return resolved


def path_key(path: Path) -> str:
    return os.path.normcase(str(path.resolve()))


def validate_expected_sha256(value: Any, actual: str, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, str) or re.fullmatch(r"[0-9A-Fa-f]{64}", value) is None:
        raise ValueError(f"{label} must be a 64-character hexadecimal SHA-256")
    if value.upper() != actual:
        raise ValueError(f"{label} does not match the segment text")


def load_batch_requests(manifest_path: Path) -> list[SegmentRequest]:
    manifest = manifest_path.resolve()
    if not manifest.is_file():
        raise FileNotFoundError(f"Batch manifest does not exist: {manifest}")
    if manifest.stat().st_size > MAX_BATCH_MANIFEST_BYTES:
        raise ValueError(f"Batch manifest exceeds {MAX_BATCH_MANIFEST_BYTES} bytes")
    try:
        document = ensure_object(json.loads(manifest.read_text(encoding="utf-8-sig")), "Batch manifest")
    except json.JSONDecodeError as error:
        raise ValueError(f"Batch manifest is invalid JSON: {error}") from error
    reject_unknown_fields(document, {"schemaVersion", "segments"}, "Batch manifest")
    if document.get("schemaVersion") != BATCH_SCHEMA_VERSION:
        raise ValueError(f"Batch manifest schemaVersion must be {BATCH_SCHEMA_VERSION!r}")
    segments = document.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("Batch manifest segments must be a non-empty array")
    if len(segments) > MAX_BATCH_SEGMENTS:
        raise ValueError(f"Batch manifest has more than {MAX_BATCH_SEGMENTS} segments")

    manifest_root = manifest.parent.resolve()
    manifest_key = path_key(manifest)
    manifest_sha256 = sha256_file(manifest)
    requests: list[SegmentRequest] = []
    ids: set[str] = set()
    produced_paths: dict[str, str] = {}
    input_paths: dict[str, str] = {}

    for index, raw_segment in enumerate(segments, start=1):
        label = f"segments[{index - 1}]"
        segment = ensure_object(raw_segment, label)
        reject_unknown_fields(
            segment,
            {"id", "text", "textFile", "textSha256", "output", "receipt"},
            label,
        )
        segment_id = segment.get("id")
        if not isinstance(segment_id, str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", segment_id) is None:
            raise ValueError(f"{label}.id must match [A-Za-z0-9][A-Za-z0-9._-]{{0,99}}")
        if segment_id in ids:
            raise ValueError(f"Duplicate segment id: {segment_id}")
        ids.add(segment_id)

        has_text = "text" in segment
        has_text_file = "textFile" in segment
        if has_text == has_text_file:
            raise ValueError(f"{label} must declare exactly one of text or textFile")
        if has_text:
            text = segment["text"]
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"{label}.text must be a non-empty string")
            text_source = f"{manifest}#{segment_id}"
        else:
            text_path = resolve_manifest_path(manifest_root, segment["textFile"], f"{label}.textFile")
            if not text_path.is_file():
                raise FileNotFoundError(f"{label}.textFile does not exist: {text_path}")
            text = text_path.read_text(encoding="utf-8-sig")
            if not text.strip():
                raise ValueError(f"{label}.textFile is empty: {text_path}")
            text_source = str(text_path)
            input_paths[path_key(text_path)] = f"{label}.textFile"

        text_sha256 = sha256_bytes(text.encode("utf-8"))
        validate_expected_sha256(segment.get("textSha256"), text_sha256, f"{label}.textSha256")
        output = resolve_manifest_path(manifest_root, segment.get("output"), f"{label}.output")
        if output.suffix.lower() != ".wav":
            raise ValueError(f"{label}.output must use the .wav extension")
        receipt_value = segment.get("receipt")
        receipt = (
            resolve_manifest_path(manifest_root, receipt_value, f"{label}.receipt")
            if receipt_value is not None
            else output.with_suffix(".recipe.json")
        )
        if receipt.suffix.lower() != ".json":
            raise ValueError(f"{label}.receipt must use the .json extension")

        for path, field in ((output, "output"), (receipt, "receipt")):
            key = path_key(path)
            if key == manifest_key:
                raise ValueError(f"{label}.{field} cannot overwrite the batch manifest")
            previous = produced_paths.get(key)
            if previous is not None:
                raise ValueError(f"Duplicate batch output path: {label}.{field} conflicts with {previous}")
            produced_paths[key] = f"{label}.{field}"
            if path.exists() and not path.is_file():
                raise ValueError(f"{label}.{field} points to a non-file path: {path}")

        requests.append(
            SegmentRequest(
                segment_id,
                text,
                text_source,
                output,
                receipt,
                str(manifest),
                manifest_sha256,
            )
        )

    for key, producer in produced_paths.items():
        if key in input_paths:
            raise ValueError(f"Batch output {producer} conflicts with input {input_paths[key]}")
    return requests


def load_requests(args: argparse.Namespace) -> tuple[list[SegmentRequest], Path | None]:
    if args.batch_manifest is not None:
        manifest = args.batch_manifest.resolve()
        return load_batch_requests(manifest), manifest
    text, text_source = read_text(args)
    output = args.output.resolve()
    if output.suffix.lower() != ".wav":
        raise ValueError("--output must use the .wav extension")
    receipt = (args.receipt or output.with_suffix(".recipe.json")).resolve()
    return [SegmentRequest("single", text, text_source, output, receipt)], None


def normalize_loudness(source: Path, destination: Path) -> None:
    first_pass = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(source),
            "-af",
            f"loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
        ]
    )
    match = re.search(r'\{\s*"input_i"[\s\S]*?\}', first_pass.stderr)
    if not match:
        raise RuntimeError("Could not parse FFmpeg loudnorm measurements")
    stats = json.loads(match.group(0))
    loudnorm = (
        f"loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11:"
        f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
        f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
        f"offset={stats['target_offset']}:linear=true:print_format=summary"
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            str(source),
            "-af",
            loudnorm,
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def refuse_overwrite(paths: list[Path], overwrite: bool) -> None:
    occupied = [path for path in paths if path.exists()]
    if occupied and not overwrite:
        listing = "\n".join(f"  {path}" for path in occupied)
        raise FileExistsError(f"Refusing to overwrite existing files:\n{listing}")


def print_plan(
    request: SegmentRequest,
    args: argparse.Namespace,
) -> None:
    print("CosyVoice selected voice recipe")
    print(f"segment_id={request.segment_id}")
    print(f"model={MODEL_DIR}")
    print(f"speaker={args.speaker}")
    print(f"speed={args.speed}")
    print(f"seed={args.seed}")
    print("precision=FP32")
    print("stream=False")
    print(f"text_source={request.text_source}")
    print(f"text_sha256={sha256_bytes(request.text.encode('utf-8'))}")
    print(f"text_characters={len(request.text)}")
    print(f"output={request.output}")
    print(f"receipt={request.receipt}")
    print(f"post=two-pass loudnorm {TARGET_LUFS} LUFS, 48 kHz mono PCM")


def preflight_frontend_utterances(model: Any, request: SegmentRequest) -> dict[str, Any]:
    normalized = list(model.frontend.text_normalize(request.text, split=True, text_frontend=True))
    utterances = [str(item) for item in normalized if str(item).strip()]
    if len(utterances) != 1:
        lengths = ", ".join(str(len(item)) for item in utterances) or "none"
        raise RuntimeError(
            f"CosyVoice frontend split {request.segment_id!r} into {len(utterances)} internal utterances "
            f"(character lengths: {lengths}). Split the project part at a natural semantic boundary "
            "before production synthesis."
        )
    normalized_text = utterances[0]
    return {
        "policy": "exactly-one-internal-utterance-required",
        "utterance_count": 1,
        "normalized_text_sha256": sha256_bytes(normalized_text.encode("utf-8")),
        "normalized_text_characters": len(normalized_text),
    }


def synthesize_segment(
    request: SegmentRequest,
    args: argparse.Namespace,
    model: Any,
    torch: Any,
    torchaudio: Any,
    frontend_preflight: dict[str, Any],
) -> dict[str, Any]:
    request.output.parent.mkdir(parents=True, exist_ok=True)
    request.receipt.parent.mkdir(parents=True, exist_ok=True)
    temp_root = Path(tempfile.mkdtemp(prefix=".cosyvoice-zh-female-", dir=request.output.parent))
    raw_path = temp_root / "raw.wav"
    final_path = temp_root / "final.wav"
    receipt_path = temp_root / "recipe.json"
    try:
        # Reset immediately before every segment so batch output matches
        # independent single-segment invocations of the selected recipe.
        torch.manual_seed(args.seed)
        torch.cuda.manual_seed_all(args.seed)
        chunks = list(
            model.inference_sft(
                request.text,
                args.speaker,
                stream=False,
                speed=args.speed,
            )
        )
        if not chunks:
            raise RuntimeError("CosyVoice returned no audio chunks")
        audio = torch.cat([chunk["tts_speech"].cpu() for chunk in chunks], dim=1)
        nonfinite = int((~torch.isfinite(audio)).sum().item())
        if nonfinite:
            raise RuntimeError(f"CosyVoice produced {nonfinite} non-finite samples; no file was published")
        audio = audio.clamp(-1.0, 1.0)
        torchaudio.save(str(raw_path), audio, model.sample_rate)

        decoded_raw, raw_rate = torchaudio.load(str(raw_path))
        raw_nonfinite = int((~torch.isfinite(decoded_raw)).sum().item())
        if raw_nonfinite:
            raise RuntimeError(f"Raw WAV contains {raw_nonfinite} non-finite decoded samples")

        normalize_loudness(raw_path, final_path)
        decoded_final, final_rate = torchaudio.load(str(final_path))
        final_nonfinite = int((~torch.isfinite(decoded_final)).sum().item())
        if final_nonfinite:
            raise RuntimeError(f"Final WAV contains {final_nonfinite} non-finite decoded samples")
        if final_rate != TARGET_SAMPLE_RATE or decoded_final.shape[0] != 1:
            raise RuntimeError(
                f"Final WAV format mismatch: sample_rate={final_rate}, channels={decoded_final.shape[0]}"
            )
        run(["ffmpeg", "-v", "error", "-i", str(final_path), "-f", "null", "-"])

        metadata = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "recipe": "E14 candidate 14",
            "model": "CosyVoice-300M-SFT",
            "model_dir": str(MODEL_DIR),
            "speaker": args.speaker,
            "speed": args.speed,
            "seed": args.seed,
            "precision": "FP32",
            "stream": False,
            "segment_id": request.segment_id,
            "text_source": request.text_source,
            "text_sha256": sha256_bytes(request.text.encode("utf-8")),
            "text_characters": len(request.text),
            "frontend_preflight": frontend_preflight,
            "output_chunks": len(chunks),
            "raw": {
                "sample_rate": raw_rate,
                "duration_seconds": decoded_raw.shape[1] / raw_rate,
                "sha256": sha256_file(raw_path),
                "nonfinite_samples": raw_nonfinite,
            },
            "output": {
                "path": str(request.output),
                "sample_rate": final_rate,
                "channels": decoded_final.shape[0],
                "duration_seconds": decoded_final.shape[1] / final_rate,
                "sha256": sha256_file(final_path),
                "nonfinite_samples": final_nonfinite,
                "loudness_target_lufs": TARGET_LUFS,
                "true_peak_target_db": -1.5,
            },
        }
        if request.batch_manifest is not None:
            metadata["batch"] = {
                "manifest": request.batch_manifest,
                "manifest_sha256": request.batch_manifest_sha256,
            }
        receipt_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        refuse_overwrite([request.output, request.receipt], args.overwrite)
        final_path.replace(request.output)
        receipt_path.replace(request.receipt)
        print(f"saved={request.output}")
        print(f"receipt={request.receipt}")
        print(f"duration_seconds={metadata['output']['duration_seconds']:.4f}")
        print(f"sha256={metadata['output']['sha256']}")
        return metadata
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def main() -> None:
    args = parse_args()
    requests, manifest = load_requests(args)
    produced = [path for request in requests for path in (request.output, request.receipt)]
    refuse_overwrite(produced, args.overwrite)
    if manifest is not None:
        print(f"batch_manifest={manifest}")
        print(f"batch_manifest_sha256={requests[0].batch_manifest_sha256}")
        print(f"batch_schema={BATCH_SCHEMA_VERSION}")
        print(f"batch_segments={len(requests)}")
    for index, request in enumerate(requests, start=1):
        if manifest is not None:
            print(f"batch_segment={index}/{len(requests)}")
        print_plan(request, args)
    if args.dry_run:
        print("dry_run=true; model was not loaded and no files were written")
        return

    if not MODEL_DIR.is_dir():
        raise FileNotFoundError(f"CosyVoice SFT model is missing: {MODEL_DIR}")
    if shutil.which("ffmpeg") is None:
        raise FileNotFoundError("ffmpeg is required on PATH")

    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "third_party" / "Matcha-TTS"))

    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing an unexpected CPU production run")

    model = AutoModel(model_dir=str(MODEL_DIR), fp16=False)
    speakers = model.list_available_spks()
    if args.speaker not in speakers:
        raise RuntimeError(f"Speaker {args.speaker!r} is unavailable: {speakers}")

    # Validate the complete batch before writing any segment. A partial batch is not
    # a valid production candidate and must never be mistaken for resumable output.
    frontend_preflights = {
        request.segment_id: preflight_frontend_utterances(model, request)
        for request in requests
    }
    print(f"frontend_preflight_passed={len(frontend_preflights)}")

    for index, request in enumerate(requests, start=1):
        if manifest is not None:
            print(f"generating_batch_segment={index}/{len(requests)}:{request.segment_id}")
        synthesize_segment(
            request,
            args,
            model,
            torch,
            torchaudio,
            frontend_preflights[request.segment_id],
        )
    if manifest is not None:
        print(f"batch_complete={len(requests)}")


if __name__ == "__main__":
    main()
