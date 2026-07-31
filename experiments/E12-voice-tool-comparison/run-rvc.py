import argparse
import os
import sys
from pathlib import Path

import soundfile as sf
from dotenv import load_dotenv


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("model")
    parser.add_argument("index")
    parser.add_argument("output_dir")
    parser.add_argument("--pitches", nargs="+", type=int, default=[6, 12])
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    index_path = Path(args.index).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    workspace = Path(__file__).resolve().parents[2]
    rvc_root = workspace / "tools" / "voice-lab" / "RVC-WebUI"
    load_dotenv(rvc_root / ".env")
    os.chdir(rvc_root)
    sys.path.insert(0, str(rvc_root))
    sys.argv = [sys.argv[0]]

    from configs.config import Config
    from infer.modules.vc.modules import VC

    config = Config()
    engine = VC(config)
    engine.get_vc(args.model)

    for pitch in args.pitches:
        info, result = engine.vc_single(
            0,
            str(input_path),
            pitch,
            None,
            "rmvpe",
            str(index_path),
            "",
            0.7,
            3,
            0,
            0.25,
            0.33,
        )
        sample_rate, audio = result
        if sample_rate is None or audio is None:
            raise RuntimeError(info)
        output = output_dir / f"rvc-female-p{pitch:02d}.wav"
        sf.write(output, audio, sample_rate, subtype="PCM_16")
        print(info)
        print(f"wrote {output}")


if __name__ == "__main__":
    main()
