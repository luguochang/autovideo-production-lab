from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


RUNNER_PATH = Path(__file__).resolve().parents[1] / "run_zh_female_seed7.py"
SPEC = importlib.util.spec_from_file_location("run_zh_female_seed7", RUNNER_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


class BatchManifestTests(unittest.TestCase):
    def write_manifest(self, root: Path, document: dict) -> Path:
        path = root / "batch.json"
        path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
        return path

    def test_loads_text_file_and_inline_text(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "input").mkdir()
            (root / "input" / "part-01.txt").write_text("第一段。", encoding="utf-8")
            manifest = self.write_manifest(
                root,
                {
                    "schemaVersion": runner.BATCH_SCHEMA_VERSION,
                    "segments": [
                        {
                            "id": "part-01",
                            "textFile": "input/part-01.txt",
                            "output": "audio/part-01.wav",
                        },
                        {
                            "id": "part-02",
                            "text": "第二段。",
                            "textSha256": runner.sha256_bytes("第二段。".encode("utf-8")),
                            "output": "audio/part-02.wav",
                            "receipt": "receipts/part-02.json",
                        },
                    ],
                },
            )

            requests = runner.load_batch_requests(manifest)

            self.assertEqual([item.segment_id for item in requests], ["part-01", "part-02"])
            self.assertEqual(requests[0].text, "第一段。")
            self.assertEqual(requests[0].receipt, root / "audio" / "part-01.recipe.json")
            self.assertEqual(requests[1].receipt, root / "receipts" / "part-02.json")

    def test_rejects_duplicate_resolved_output_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.write_manifest(
                root,
                {
                    "schemaVersion": runner.BATCH_SCHEMA_VERSION,
                    "segments": [
                        {"id": "part-01", "text": "一。", "output": "audio/same.wav"},
                        {"id": "part-02", "text": "二。", "output": "audio/sub/../same.wav"},
                    ],
                },
            )

            with self.assertRaisesRegex(ValueError, "Duplicate batch output path"):
                runner.load_batch_requests(manifest)

    def test_rejects_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.write_manifest(
                root,
                {
                    "schemaVersion": runner.BATCH_SCHEMA_VERSION,
                    "segments": [
                        {"id": "part-01", "text": "一。", "output": "../escape.wav"},
                    ],
                },
            )

            with self.assertRaisesRegex(ValueError, "escapes the batch manifest directory"):
                runner.load_batch_requests(manifest)

    def test_rejects_output_that_overwrites_an_input(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "part.wav").write_text("不是音频，只是输入文本。", encoding="utf-8")
            manifest = self.write_manifest(
                root,
                {
                    "schemaVersion": runner.BATCH_SCHEMA_VERSION,
                    "segments": [
                        {
                            "id": "part-01",
                            "textFile": "part.wav",
                            "output": "part.wav",
                            "receipt": "part.json",
                        },
                    ],
                },
            )

            with self.assertRaisesRegex(ValueError, "conflicts with input"):
                runner.load_batch_requests(manifest)

    def test_rejects_text_sha_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.write_manifest(
                root,
                {
                    "schemaVersion": runner.BATCH_SCHEMA_VERSION,
                    "segments": [
                        {
                            "id": "part-01",
                            "text": "第一段。",
                            "textSha256": "0" * 64,
                            "output": "audio/part-01.wav",
                        },
                    ],
                },
            )

            with self.assertRaisesRegex(ValueError, "does not match"):
                runner.load_batch_requests(manifest)


if __name__ == "__main__":
    unittest.main()
