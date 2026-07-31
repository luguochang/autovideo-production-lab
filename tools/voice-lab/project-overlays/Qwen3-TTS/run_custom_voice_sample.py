"""Generate a short Mandarin sample with Qwen3-TTS built-in female voices."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "pretrained_models" / "Qwen3-TTS-12Hz-0.6B-CustomVoice"
OUTPUT_DIR = ROOT / "outputs"

DEFAULT_TEXT = (
    "今天我们不追求播音腔，而是用平静、自然的方式，把复杂的内容讲清楚。"
    "语速稍慢一些，停顿留得舒服，让每句话听起来都像真实交流。"
)


def ensure_sox_on_path() -> None:
    if shutil.which("sox"):
        return
    package_root = (
        Path.home()
        / "AppData"
        / "Local"
        / "Microsoft"
        / "WinGet"
        / "Packages"
        / "ChrisBagwell.SoX_Microsoft.Winget.Source_8wekyb3d8bbwe"
    )
    candidates = sorted(package_root.glob("sox-*\\sox.exe"), reverse=True)
    if candidates:
        os.environ["PATH"] = f"{candidates[0].parent};{os.environ.get('PATH', '')}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a 10-15 second Mandarin female-voice sample."
    )
    parser.add_argument(
        "--speaker",
        choices=("Serena", "Vivian"),
        default="Serena",
        help="Serena is warm/gentle; Vivian is brighter and slightly edgy.",
    )
    parser.add_argument("--language", default="Chinese", choices=("Chinese",))
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--output",
        type=Path,
        help="Output WAV path. Defaults to outputs/qwen3-tts-<speaker>-sample.wav.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the resolved parameters without loading the model or GPU.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output = args.output or (
        OUTPUT_DIR / f"qwen3-tts-{args.speaker.lower()}-sample.wav"
    )

    print(f"model={MODEL_DIR}")
    print(f"speaker={args.speaker}")
    print(f"language={args.language}")
    print("instruct=<unsupported by 0.6B CustomVoice; omitted>")
    print(f"seed={args.seed}")
    print(f"text={args.text}")
    print(f"output={output}")

    if args.dry_run:
        return
    if not MODEL_DIR.joinpath("model.safetensors").is_file():
        raise FileNotFoundError(
            f"Model weights are incomplete or missing: {MODEL_DIR / 'model.safetensors'}"
        )

    ensure_sox_on_path()
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the prepared Windows test path.")

    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)

    model = Qwen3TTSModel.from_pretrained(
        str(MODEL_DIR),
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    wavs, sample_rate = model.generate_custom_voice(
        text=args.text,
        language=args.language,
        speaker=args.speaker,
    )
    sf.write(output, wavs[0], sample_rate)
    duration = len(wavs[0]) / sample_rate
    print(f"wrote={output}")
    print(f"duration_seconds={duration:.3f}")


if __name__ == "__main__":
    main()
