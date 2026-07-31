from __future__ import annotations

import argparse
import ctypes
import glob
import hashlib
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "pretrained_models" / "VoxCPM2"
DEFAULT_OUTPUT = ROOT / "outputs" / "voxcpm2-mature-female-seed42.wav"
DEFAULT_TEXT = (
    "欢迎来到本期内容。接下来，我们会用清晰自然的方式，一步一步梳理重点，"
    "帮助你快速理解其中的关键逻辑。"
)
DEFAULT_CONTROL = (
    "成熟稳重的普通话女性，中低音，温暖克制，纪录片口播，语速自然，"
    "不甜腻，不夸张，口齿清楚"
)
EXPECTED_MODEL_SHA256 = "f7f964cfa9da23653baec6e6f7750719977ad944ed9f95fe52fe3a620506891d"


def preload_windows_runtime() -> None:
    if sys.platform != "win32":
        return
    scripts_dir = Path(sys.executable).resolve().parent
    for pattern in ("vcruntime140*.dll", "msvcp140*.dll"):
        for dll_path in sorted(glob.glob(str(scripts_dir / pattern))):
            ctypes.WinDLL(dll_path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_model(model_dir: Path, verify_hash: bool) -> None:
    required = (
        "config.json",
        "model.safetensors",
        "audiovae.pth",
        "tokenizer.json",
        "tokenizer_config.json",
    )
    missing = [name for name in required if not (model_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Model is incomplete at {model_dir}: missing {', '.join(missing)}")

    weights = model_dir / "model.safetensors"
    if weights.stat().st_size != 4_580_080_592:
        raise RuntimeError(f"Unexpected model size: {weights.stat().st_size} bytes")
    if verify_hash:
        actual = sha256(weights)
        if actual != EXPECTED_MODEL_SHA256:
            raise RuntimeError(f"Model SHA-256 mismatch: {actual}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a short Mandarin mature-female Voice Design sample with local VoxCPM2."
    )
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--control", default=DEFAULT_CONTROL)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--device", default="cuda", help="cuda, cuda:0, or cpu")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--cfg-value", type=float, default=2.0)
    parser.add_argument("--steps", type=int, default=10)
    parser.add_argument("--check-only", action="store_true", help="Validate files/imports without loading the model")
    parser.add_argument("--verify-hash", action="store_true", help="Also hash the 4.58 GB model file")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_dir = args.model.resolve()
    validate_model(model_dir, args.verify_hash)
    preload_windows_runtime()

    import torch

    if args.check_only:
        from safetensors import safe_open

        with safe_open(model_dir / "model.safetensors", framework="pt", device="cpu") as weights:
            tensor_count = len(weights.keys())
        print(f"VoxCPM2 model OK: {model_dir}")
        print(f"Tensors: {tensor_count}; torch: {torch.__version__}; CUDA runtime: {torch.version.cuda}")
        return 0

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available. Use --device cpu only for a slow fallback.")

    from voxcpm import VoxCPM
    import soundfile as sf

    model = VoxCPM.from_pretrained(
        str(model_dir),
        load_denoiser=False,
        local_files_only=True,
        optimize=False,
        device=args.device,
    )
    final_text = f"({args.control.strip()}){args.text.strip()}"
    audio = model.generate(
        text=final_text,
        cfg_value=args.cfg_value,
        inference_timesteps=args.steps,
        seed=args.seed,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = model.tts_model.sample_rate
    sf.write(args.output, audio, sample_rate)
    duration = len(audio) / sample_rate
    print(f"Saved: {args.output.resolve()}")
    print(f"Duration: {duration:.2f}s; sample rate: {sample_rate} Hz; seed: {args.seed}")
    if not 8 <= duration <= 18:
        print("Note: generation length varies by seed; adjust --text if a tighter 10-15s sample is required.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
