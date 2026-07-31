import argparse
import sys
from pathlib import Path

import torch
import torchaudio


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "third_party" / "Matcha-TTS"))

from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402


def save_chunks(chunks, output: Path, sample_rate: int) -> None:
    audio = torch.cat([chunk["tts_speech"].cpu() for chunk in chunks], dim=1)
    nonfinite = (~torch.isfinite(audio)).sum().item()
    if nonfinite:
        print(f"Replacing {nonfinite} non-finite samples before saving")
    audio = torch.nan_to_num(audio, nan=0.0, posinf=1.0, neginf=-1.0).clamp(-1.0, 1.0)
    output.parent.mkdir(parents=True, exist_ok=True)
    torchaudio.save(str(output), audio, sample_rate)
    print(f"Saved {audio.shape[1] / sample_rate:.2f}s to {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local CosyVoice SFT or voice-conversion tests.")
    parser.add_argument("mode", choices=["sft", "vc"])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--text", help="Mandarin text for SFT mode")
    parser.add_argument("--speaker", default="中文女")
    parser.add_argument("--source", type=Path, help="Source recording for VC mode")
    parser.add_argument("--prompt", type=Path, help="Target voice prompt for VC mode")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--fp16", action="store_true", help="Use FP16 only on GPUs verified not to emit NaNs")
    args = parser.parse_args()

    if args.mode == "sft":
        if not args.text:
            parser.error("--text is required for sft mode")
        model_dir = ROOT / "pretrained_models" / "CosyVoice-300M-SFT"
        model = AutoModel(model_dir=str(model_dir), fp16=args.fp16)
        print("Available speakers:", model.list_available_spks())
        chunks = model.inference_sft(
            args.text,
            args.speaker,
            stream=True,
            speed=args.speed,
        )
    else:
        if not args.source or not args.prompt:
            parser.error("--source and --prompt are required for vc mode")
        model_dir = ROOT / "pretrained_models" / "CosyVoice-300M"
        model = AutoModel(model_dir=str(model_dir), fp16=args.fp16)
        chunks = model.inference_vc(
            str(args.source),
            str(args.prompt),
            stream=True,
            speed=args.speed,
        )

    save_chunks(chunks, args.output.resolve(), model.sample_rate)


if __name__ == "__main__":
    main()
