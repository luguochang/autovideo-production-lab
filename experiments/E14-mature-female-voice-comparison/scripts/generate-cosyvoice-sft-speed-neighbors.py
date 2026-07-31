from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
EXPERIMENT_DIR = SCRIPT_DIR.parent
REPO_ROOT = SCRIPT_DIR.parents[2]
COSYVOICE_ROOT = REPO_ROOT / "tools" / "voice-lab" / "CosyVoice"
MODEL_DIR = COSYVOICE_ROOT / "pretrained_models" / "CosyVoice-300M-SFT"

TEXT = "我奉劝很多人对 AI 一定要有敬畏之心，也希望大家擦亮双眼。"
SPEAKER = "中文女"


@dataclass(frozen=True)
class Variant:
    id: str
    speed: float
    stem: str


VARIANTS = (
    Variant("09", 0.94, "09-cosyvoice-sft-zh-female-speed094"),
    Variant("10", 1.03, "10-cosyvoice-sft-zh-female-speed103"),
)


def paths_for(variant: Variant, root: Path = EXPERIMENT_DIR) -> dict[str, Path]:
    return {
        "raw": root / "outputs" / "raw" / f"{variant.stem}.wav",
        "listen": root / "outputs" / "listen" / f"{variant.stem}.wav",
        "wave": root / "assets" / "waveforms" / f"{variant.stem}.png",
    }


def print_plan() -> None:
    print("CosyVoice SFT speed-neighbor plan (dry run)")
    print(f"Model: {MODEL_DIR}")
    print(f"Speaker: {SPEAKER}")
    print(f"Text: {TEXT}")
    print("Precision: FP32; stream=False (required for speed to take effect)")
    for variant in VARIANTS:
        targets = paths_for(variant)
        print(f"{variant.id}: speed={variant.speed}")
        print(f"  raw:    {targets['raw']}")
        print(f"  listen: {targets['listen']}")
        print(f"  wave:   {targets['wave']}")
    print()
    print("Run with --execute to start GPU inference. Existing outputs are never overwritten.")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def normalize_loudness(source: Path, destination: Path) -> None:
    first = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(source),
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
        ]
    )
    match = re.search(r'\{\s*"input_i"[\s\S]*?\}', first.stderr)
    if not match:
        raise RuntimeError(f"Could not parse loudnorm measurements for {source}")
    stats = json.loads(match.group(0))
    filter_value = (
        "loudnorm=I=-16:TP=-1.5:LRA=11:"
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
            filter_value,
            "-ar",
            "48000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def render_waveform(source: Path, destination: Path) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            str(source),
            "-filter_complex",
            "showwavespic=s=900x180:colors=0x35a36f",
            "-frames:v",
            "1",
            str(destination),
        ]
    )


def assert_destinations_free() -> None:
    occupied = [path for variant in VARIANTS for path in paths_for(variant).values() if path.exists()]
    if occupied:
        formatted = "\n".join(f"  {path}" for path in occupied)
        raise FileExistsError(f"Refusing to overwrite existing E14 files:\n{formatted}")


def execute() -> None:
    if not MODEL_DIR.is_dir():
        raise FileNotFoundError(f"CosyVoice SFT model is missing: {MODEL_DIR}")
    if shutil.which("ffmpeg") is None:
        raise FileNotFoundError("ffmpeg is required on PATH")
    assert_destinations_free()

    sys.path.insert(0, str(COSYVOICE_ROOT))
    sys.path.insert(0, str(COSYVOICE_ROOT / "third_party" / "Matcha-TTS"))

    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Stop here rather than running the SFT model unexpectedly on CPU.")

    print(f"Loading {MODEL_DIR} in FP32")
    model = AutoModel(model_dir=str(MODEL_DIR), fp16=False)
    if SPEAKER not in model.list_available_spks():
        raise RuntimeError(f"Speaker {SPEAKER!r} is not available: {model.list_available_spks()}")

    temp_root = Path(tempfile.mkdtemp(prefix="e14-cosyvoice-speed-", dir=SCRIPT_DIR))
    staged: list[tuple[Path, Path]] = []
    try:
        for variant in VARIANTS:
            temp_paths = paths_for(variant, temp_root)
            for path in temp_paths.values():
                path.parent.mkdir(parents=True, exist_ok=True)

            print(f"Generating {variant.id}: speed={variant.speed}, FP32, stream=False")
            chunks = list(
                model.inference_sft(
                    TEXT,
                    SPEAKER,
                    stream=False,
                    speed=variant.speed,
                )
            )
            audio = torch.cat([chunk["tts_speech"].cpu() for chunk in chunks], dim=1)
            nonfinite = int((~torch.isfinite(audio)).sum().item())
            if nonfinite:
                raise RuntimeError(f"{variant.id} produced {nonfinite} non-finite samples; no file was published")
            audio = audio.clamp(-1.0, 1.0)
            torchaudio.save(str(temp_paths["raw"]), audio, model.sample_rate)

            decoded, decoded_rate = torchaudio.load(str(temp_paths["raw"]))
            decoded_nonfinite = int((~torch.isfinite(decoded)).sum().item())
            if decoded_nonfinite:
                raise RuntimeError(f"{variant.id} raw WAV contains {decoded_nonfinite} non-finite decoded samples")
            print(
                f"  raw duration={decoded.shape[1] / decoded_rate:.3f}s "
                f"rate={decoded_rate} peak={decoded.abs().max().item():.4f}"
            )

            normalize_loudness(temp_paths["raw"], temp_paths["listen"])
            render_waveform(temp_paths["listen"], temp_paths["wave"])

            final_paths = paths_for(variant)
            staged.extend((temp_paths[kind], final_paths[kind]) for kind in ("raw", "listen", "wave"))

        assert_destinations_free()
        for source, destination in staged:
            destination.parent.mkdir(parents=True, exist_ok=True)
            source.replace(destination)
            print(f"Published: {destination}")
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    print("Generation complete. Update README.md, index.html, PROCESSING_RECEIPT.md and .media only after listening QA.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare or generate E14 CosyVoice SFT speed neighbors 09/10 without overwriting files."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Run FP32 GPU inference. Omit this flag for a read-only dry run.",
    )
    args = parser.parse_args()
    print_plan()
    if args.execute:
        execute()


if __name__ == "__main__":
    main()
