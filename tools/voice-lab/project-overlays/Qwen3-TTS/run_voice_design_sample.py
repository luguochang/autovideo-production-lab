"""Run a local Qwen3-TTS 1.7B VoiceDesign Mandarin probe."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "pretrained_models" / "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
DEFAULT_TEXT = "我奉劝很多人对AI一定要有敬畏之心，也希望大家擦亮双眼。"
DEFAULT_INSTRUCT = (
    "成熟稳重的普通话女性，中低音，音色温暖有厚度，语气克制自然，"
    "像面对面讲解而不是播音，不甜腻，不尖锐，句尾自然收住"
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
    parser = argparse.ArgumentParser(description="Generate one mature Mandarin female VoiceDesign probe.")
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--instruct", default=DEFAULT_INSTRUCT)
    parser.add_argument("--language", default="Chinese", choices=("Chinese",))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--load-only", action="store_true")
    return parser.parse_args()


def memory_mib(torch) -> dict[str, float]:
    return {
        "allocated_mib": torch.cuda.memory_allocated() / (1024**2),
        "reserved_mib": torch.cuda.memory_reserved() / (1024**2),
        "peak_allocated_mib": torch.cuda.max_memory_allocated() / (1024**2),
        "peak_reserved_mib": torch.cuda.max_memory_reserved() / (1024**2),
    }


def main() -> None:
    args = parse_args()
    weights = MODEL_DIR / "model.safetensors"
    if not weights.is_file():
        raise FileNotFoundError(f"VoiceDesign weights are missing: {weights}")

    ensure_sox_on_path()
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for this prepared Windows probe.")

    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    torch.cuda.reset_peak_memory_stats()
    print(f"model={MODEL_DIR}")
    print(f"seed={args.seed}")
    print(f"text={args.text}")
    print(f"instruct={args.instruct}")

    model = Qwen3TTSModel.from_pretrained(
        str(MODEL_DIR),
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    print("memory_after_load=" + repr(memory_mib(torch)))
    if args.load_only:
        return
    if args.output is None:
        raise ValueError("--output is required unless --load-only is used")

    wavs, sample_rate = model.generate_voice_design(
        text=args.text,
        language=args.language,
        instruct=args.instruct,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, wavs[0], sample_rate)
    print(f"output={args.output.resolve()}")
    print(f"duration_seconds={len(wavs[0]) / sample_rate:.3f}")
    print("memory_after_generate=" + repr(memory_mib(torch)))


if __name__ == "__main__":
    main()
