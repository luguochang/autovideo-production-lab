#!/usr/bin/env python3
"""RapidOCR JSON adapter for the AutoVideo screen-text receipt runner."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import sys
import time
from pathlib import Path
from typing import Any


ENGINE_NAME = "RapidOCR ONNXRuntime"
ENGINE_SOURCE = "https://github.com/RapidAI/RapidOCR"
MODEL_SOURCE = "https://github.com/PaddlePaddle/PaddleOCR"


def emit(payload: dict[str, Any]) -> None:
    json.dump(payload, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")


def unavailable(message: str) -> dict[str, Any]:
    return {
        "ok": False,
        "unavailable": True,
        "engine": {
            "name": ENGINE_NAME,
            "version": None,
            "runtime": "onnxruntime-cpu",
            "source": ENGINE_SOURCE,
            "modelSource": MODEL_SOURCE,
            "license": "Apache-2.0",
        },
        "error": {"code": "engine-unavailable", "message": message},
        "frames": [],
    }


def load_engine() -> tuple[Any | None, dict[str, Any]]:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as error:  # pragma: no cover - exercised by the Node unavailable test
        return None, unavailable(
            "rapidocr-onnxruntime is not installed in the selected Python environment: "
            f"{type(error).__name__}: {error}"
        )

    try:
        version = importlib.metadata.version("rapidocr-onnxruntime")
        engine = RapidOCR()
    except Exception as error:
        return None, unavailable(
            f"RapidOCR could not initialize its local ONNX models: {type(error).__name__}: {error}"
        )

    return engine, {
        "ok": True,
        "engine": {
            "name": ENGINE_NAME,
            "version": version,
            "runtime": "onnxruntime-cpu",
            "source": ENGINE_SOURCE,
            "modelSource": MODEL_SOURCE,
            "license": "Apache-2.0",
        },
    }


def normalize_detection(item: Any) -> dict[str, Any]:
    if not isinstance(item, (list, tuple)) or len(item) < 3:
        raise ValueError("RapidOCR returned an unknown detection shape")
    polygon, text, confidence = item[0], item[1], item[2]
    points = []
    for point in polygon:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise ValueError("RapidOCR returned an invalid polygon")
        points.append([round(float(point[0]), 3), round(float(point[1]), 3)])
    return {
        "text": str(text),
        "confidence": round(float(confidence), 6),
        "polygon": points,
    }


def recognize(engine: Any, frame: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    image_path = Path(str(frame.get("inputPath", "")))
    if not image_path.is_file():
        return {
            "id": frame.get("id"),
            "ok": False,
            "error": {"code": "image-missing", "message": f"Image does not exist: {image_path}"},
            "detections": [],
        }
    try:
        raw = engine(str(image_path))
        result = raw[0] if isinstance(raw, tuple) else raw
        detections = [] if result is None else [normalize_detection(item) for item in result]
        return {
            "id": frame.get("id"),
            "ok": True,
            "elapsedMs": round((time.perf_counter() - started) * 1000, 3),
            "detections": detections,
        }
    except Exception as error:
        return {
            "id": frame.get("id"),
            "ok": False,
            "elapsedMs": round((time.perf_counter() - started) * 1000, 3),
            "error": {"code": "recognition-failed", "message": f"{type(error).__name__}: {error}"},
            "detections": [],
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", help="Path to the JSON request written by the Node receipt runner")
    parser.add_argument("--probe", action="store_true", help="Report whether the local engine can initialize")
    args = parser.parse_args()

    engine, state = load_engine()
    if engine is None:
        emit(state)
        return 0
    if args.probe:
        emit(state)
        return 0
    if not args.request:
        emit({**state, "ok": False, "error": {"code": "request-required", "message": "--request is required"}})
        return 2

    request = json.loads(Path(args.request).read_text(encoding="utf-8"))
    frames = request.get("frames")
    if not isinstance(frames, list) or not frames:
        emit({**state, "ok": False, "error": {"code": "frames-required", "message": "The request contains no frames"}})
        return 2

    results = [recognize(engine, frame) for frame in frames]
    emit({**state, "ok": all(item["ok"] for item in results), "frames": results})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
