from pathlib import Path

from modelscope import snapshot_download


ROOT = Path(__file__).resolve().parent / "pretrained_models"
CORE_FILES = [
    "README.md",
    "configuration.json",
    "cosyvoice.yaml",
    "campplus.onnx",
    "flow.pt",
    "hift.pt",
    "llm.pt",
    "speech_tokenizer_v1.onnx",
]


def download(model_id: str, files: list[str]) -> None:
    target = ROOT / model_id.rsplit("/", 1)[-1]
    print(f"Downloading {model_id} to {target}")
    snapshot_download(
        model_id,
        local_dir=str(target),
        allow_patterns=files,
    )


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    download("iic/CosyVoice-300M", CORE_FILES)
    download("iic/CosyVoice-300M-SFT", [*CORE_FILES, "spk2info.pt"])
