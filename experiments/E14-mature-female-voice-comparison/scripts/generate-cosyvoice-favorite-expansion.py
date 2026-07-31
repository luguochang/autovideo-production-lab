from __future__ import annotations

import argparse
import importlib.util
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
EXPERIMENT_DIR = SCRIPT_DIR.parent
REPO_ROOT = SCRIPT_DIR.parents[2]
COSYVOICE_ROOT = REPO_ROOT / "tools" / "voice-lab" / "CosyVoice"
MODEL_DIR = COSYVOICE_ROOT / "pretrained_models" / "CosyVoice-300M-SFT"
HELPER_PATH = SCRIPT_DIR / "generate-cosyvoice-sft-speed-neighbors.py"

TEXT = "我奉劝很多人对 AI 一定要有敬畏之心，也希望大家擦亮双眼。"
SPEAKER = "中文女"
SPEED = 1.03


@dataclass(frozen=True)
class Variant:
    id: str
    seed: int
    stem: str


VARIANTS = (
    Variant("14", 7, "14-cosyvoice-sft-zh-female-speed103-seed7"),
    Variant("15", 42, "15-cosyvoice-sft-zh-female-speed103-seed42"),
    Variant("16", 73, "16-cosyvoice-sft-zh-female-speed103-seed73"),
)


def load_helpers():
    spec = importlib.util.spec_from_file_location("e14_cosyvoice_helpers", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def paths_for(variant: Variant, root: Path = EXPERIMENT_DIR) -> dict[str, Path]:
    return {
        "raw": root / "outputs" / "raw" / f"{variant.stem}.wav",
        "listen": root / "outputs" / "listen" / f"{variant.stem}.wav",
        "wave": root / "assets" / "waveforms" / f"{variant.stem}.png",
    }


def assert_destinations_free() -> None:
    occupied = [path for variant in VARIANTS for path in paths_for(variant).values() if path.exists()]
    if occupied:
        formatted = "\n".join(f"  {path}" for path in occupied)
        raise FileExistsError(f"Refusing to overwrite existing E14 files:\n{formatted}")


def print_plan() -> None:
    print("CosyVoice favorite expansion")
    print(f"speaker={SPEAKER}; speed={SPEED}; precision=FP32; stream=False")
    print(f"text={TEXT}")
    for variant in VARIANTS:
        print(f"{variant.id}: seed={variant.seed}; stem={variant.stem}")


def execute() -> None:
    if not MODEL_DIR.is_dir():
        raise FileNotFoundError(f"CosyVoice SFT model is missing: {MODEL_DIR}")
    if shutil.which("ffmpeg") is None:
        raise FileNotFoundError("ffmpeg is required on PATH")
    assert_destinations_free()
    helpers = load_helpers()

    sys.path.insert(0, str(COSYVOICE_ROOT))
    sys.path.insert(0, str(COSYVOICE_ROOT / "third_party" / "Matcha-TTS"))

    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing an unexpected CPU run")

    model = AutoModel(model_dir=str(MODEL_DIR), fp16=False)
    available = model.list_available_spks()
    print(f"available_speakers={available}")
    if SPEAKER not in available:
        raise RuntimeError(f"Speaker {SPEAKER!r} is unavailable")

    temp_root = Path(tempfile.mkdtemp(prefix="e14-cosyvoice-favorite-", dir=SCRIPT_DIR))
    staged: list[tuple[Path, Path]] = []
    try:
        for variant in VARIANTS:
            torch.manual_seed(variant.seed)
            torch.cuda.manual_seed_all(variant.seed)
            temp_paths = paths_for(variant, temp_root)
            for path in temp_paths.values():
                path.parent.mkdir(parents=True, exist_ok=True)

            chunks = list(
                model.inference_sft(
                    TEXT,
                    SPEAKER,
                    stream=False,
                    speed=SPEED,
                )
            )
            audio = torch.cat([chunk["tts_speech"].cpu() for chunk in chunks], dim=1)
            nonfinite = int((~torch.isfinite(audio)).sum().item())
            if nonfinite:
                raise RuntimeError(f"{variant.id} produced {nonfinite} non-finite samples")
            audio = audio.clamp(-1.0, 1.0)
            torchaudio.save(str(temp_paths["raw"]), audio, model.sample_rate)

            decoded, sample_rate = torchaudio.load(str(temp_paths["raw"]))
            decoded_nonfinite = int((~torch.isfinite(decoded)).sum().item())
            if decoded_nonfinite:
                raise RuntimeError(f"{variant.id} raw WAV contains non-finite samples")
            print(
                f"{variant.id}: duration={decoded.shape[1] / sample_rate:.3f}s "
                f"peak={decoded.abs().max().item():.4f}"
            )
            helpers.normalize_loudness(temp_paths["raw"], temp_paths["listen"])
            helpers.render_waveform(temp_paths["listen"], temp_paths["wave"])
            final_paths = paths_for(variant)
            staged.extend((temp_paths[kind], final_paths[kind]) for kind in ("raw", "listen", "wave"))

        assert_destinations_free()
        for source, destination in staged:
            destination.parent.mkdir(parents=True, exist_ok=True)
            source.replace(destination)
            print(f"published={destination}")
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand E14 candidate 10 with deterministic seeds.")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    print_plan()
    if args.execute:
        execute()


if __name__ == "__main__":
    main()
