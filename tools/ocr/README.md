# AutoVideo Screen OCR

This adapter produces `qa/ocr-report.json` from the current hash-bound screen-text frame set. It does not approve screen text; every frame still requires human review in the workbench.

## Setup on E drive

```powershell
$env:UV_CACHE_DIR = 'E:\project\study\codex\autoVideo\.uv-cache'
uv venv tools/ocr/.venv --python 3.10
uv pip install --python tools/ocr/.venv/Scripts/python.exe -r tools/ocr/requirements.txt
```

## Run

The project must already have a current `qa/hyperframes-check.json` and `qa/screen-text-frame-set.json`.

```powershell
npm.cmd run video:ocr -- --project <project-id>
```

The runner re-hashes the composition, HyperFrames check, frame set and every frame before invoking RapidOCR. A missing engine writes an explicit `unavailable` receipt. A frame error or detection below the configured confidence threshold writes `unresolved`; only a fully current zero-unresolved report can enable `ocr-assisted` review.

RapidOCR is a CPU ONNX deployment of PaddleOCR models. The pinned package is `rapidocr-onnxruntime==1.4.4`; runtime and model licensing are Apache-2.0. The local virtual environment and caches are ignored and must not enter a delivery package.
