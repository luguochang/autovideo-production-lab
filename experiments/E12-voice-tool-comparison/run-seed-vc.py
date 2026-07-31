import argparse
import os
import shutil
import time
from pathlib import Path

from gradio_client import Client, handle_file


def file_path(value) -> Path:
    if isinstance(value, str):
        return Path(value)
    if isinstance(value, dict) and value.get("path"):
        return Path(value["path"])
    raise TypeError(f"Unsupported Gradio file result: {value!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("reference")
    parser.add_argument("output")
    parser.add_argument("--url", default="http://127.0.0.1:7861")
    parser.add_argument("--anonymize", action="store_true")
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--intelligibility", type=float, default=0.0)
    parser.add_argument("--similarity", type=float, default=0.7)
    parser.add_argument("--top-p", type=float, default=0.9)
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument("--repetition", type=float, default=1.0)
    args = parser.parse_args()

    source = Path(args.source).resolve()
    reference = Path(args.reference).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    os.environ["NO_PROXY"] = "127.0.0.1,localhost"
    os.environ["no_proxy"] = "127.0.0.1,localhost"
    client = None
    for attempt in range(3):
        try:
            client = Client(args.url, verbose=False)
            break
        except ValueError:
            if attempt == 2:
                raise
            time.sleep(2)
    assert client is not None
    client.download_files = False
    result = client.predict(
        handle_file(str(source)),
        handle_file(str(reference)),
        args.steps,
        1.0,
        args.intelligibility,
        args.similarity,
        args.top_p,
        args.temperature,
        args.repetition,
        False,
        args.anonymize,
        api_name="/predict",
    )
    if not isinstance(result, (list, tuple)) or len(result) < 2:
        raise RuntimeError(f"Unexpected Seed-VC result: {result!r}")
    full_output = file_path(result[1])
    shutil.copy2(full_output, output)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
