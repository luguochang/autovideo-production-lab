from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


RUNNER_ROOT = Path(__file__).resolve().parents[1] / "CosyVoice"
sys.path.insert(0, str(RUNNER_ROOT))

from run_zh_female_seed7 import SegmentRequest, preflight_frontend_utterances  # noqa: E402


class _Frontend:
    def __init__(self, utterances: list[str]) -> None:
        self.utterances = utterances

    def text_normalize(self, text: str, split: bool, text_frontend: bool) -> list[str]:
        self.last_call = (text, split, text_frontend)
        return self.utterances


class _Model:
    def __init__(self, utterances: list[str]) -> None:
        self.frontend = _Frontend(utterances)


class CosyVoiceRunnerContractTest(unittest.TestCase):
    def request(self, root: Path) -> SegmentRequest:
        return SegmentRequest("part-001", "这是完整的一段。", "test", root / "part.wav", root / "part.json")

    def test_single_internal_utterance_is_receipted(self) -> None:
        with tempfile.TemporaryDirectory() as value:
            result = preflight_frontend_utterances(_Model(["这是完整的一段。"]), self.request(Path(value)))
        self.assertEqual(result["policy"], "exactly-one-internal-utterance-required")
        self.assertEqual(result["utterance_count"], 1)
        self.assertEqual(result["normalized_text_characters"], 8)

    def test_multiple_internal_utterances_fail_before_synthesis(self) -> None:
        with tempfile.TemporaryDirectory() as value:
            with self.assertRaisesRegex(RuntimeError, "split 'part-001' into 2 internal utterances"):
                preflight_frontend_utterances(_Model(["第一段。", "第二段。"]), self.request(Path(value)))


if __name__ == "__main__":
    unittest.main()
