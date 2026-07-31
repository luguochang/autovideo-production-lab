import argparse
from pathlib import Path

from clearvoice import ClearVoice


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--model", default="FRCRN_SE_16K")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    engine = ClearVoice(task="speech_enhancement", model_names=[args.model])
    enhanced = engine(input_path=str(input_path), online_write=False)
    engine.write(enhanced, output_path=str(output_path))
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
