from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from validate_alignment_and_export_srt import (  # noqa: E402
    ValidationError,
    render_srt,
    sha256_file,
    validate_alignment,
)
from lock_alignment_to_narration import (  # noqa: E402
    build_cues,
    normalize_word_interval,
    quantize_word_interval,
)


class AlignmentDeliveryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.narration = self.root / "narration.txt"
        self.lock = self.root / "NarrationLock.json"
        self.audio = self.root / "narration.wav"
        self.asr = self.root / "alignment.asr.json"
        self.alignment = self.root / "alignment.json"

        narration_text = "你好，AI。\n这是测试！"
        self.narration.write_text(narration_text, encoding="utf-8")
        normalized = narration_text.strip()
        narration_sha = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        self.lock.write_text(json.dumps({"normalizedSha256": narration_sha}), encoding="utf-8")

        with wave.open(str(self.audio), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(8000)
            handle.writeframes(b"\x00\x00" * 8000)

        audio_sha = sha256_file(self.audio)
        asr_record = {
            "sourceSha256": audio_sha,
            "transcriptText": "你好，诶爱。这是侧试。",
        }
        self.asr.write_text(json.dumps(asr_record, ensure_ascii=False), encoding="utf-8")
        words = []
        for index, character in enumerate("你好ai这是测试"):
            words.append({
                "index": index,
                "text": character,
                "start": round(index / 8, 3),
                "end": round((index + 1) / 8, 3),
                "mapping": "exact",
            })
        cues = [
            {"id": "cue-001", "start": 0.0, "end": 0.5, "text": "你好，AI。", "source": "NarrationLock exact text"},
            {"id": "cue-002", "start": 0.5, "end": 1.0, "text": "这是测试！", "source": "NarrationLock exact text"},
        ]
        alignment_record = {
            "sourceSha256": audio_sha,
            "narrationSha256": narration_sha,
            "asrAlignmentSha256": sha256_file(self.asr),
            "durationSeconds": 1.0,
            "transcriptText": asr_record["transcriptText"],
            "words": words,
            "cues": cues,
        }
        self.alignment.write_text(json.dumps(alignment_record, ensure_ascii=False), encoding="utf-8")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def validate(self):
        return validate_alignment(
            self.alignment,
            self.asr,
            self.narration,
            self.lock,
            self.audio,
            max_cps=20.0,
        )

    def test_valid_alignment_reconstructs_lock_and_marks_raw_asr_evidence_only(self) -> None:
        report = self.validate()
        self.assertEqual(report["status"], "passed")
        self.assertTrue(report["checks"]["cueTextReconstructsNarrationLock"])
        self.assertFalse(report["textPolicy"]["rawAsrTranscriptDownstreamConsumable"])
        self.assertEqual(report["textPolicy"]["downstreamTextSource"], "alignment.cues")

    def test_srt_uses_locked_cue_text(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        srt = render_srt(alignment["cues"])
        self.assertIn("00:00:00,000 --> 00:00:00,500", srt)
        self.assertIn("你好，AI。", srt)
        self.assertNotIn("诶爱", srt)

    def test_audio_hash_mismatch_is_rejected(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        alignment["sourceSha256"] = "0" * 64
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "Hash mismatch"):
            self.validate()

    def test_cue_text_change_is_rejected(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        alignment["cues"][1]["text"] = "这是篡改！"
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "does not reconstruct"):
            self.validate()

    def test_evidence_bound_silent_gap_is_accepted(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        second_cue_word = 4
        second_word_count = len(alignment["words"]) - second_cue_word
        for offset, word in enumerate(alignment["words"][second_cue_word:]):
            word["start"] = round(0.625 + 0.375 * offset / second_word_count, 3)
            word["end"] = round(0.625 + 0.375 * (offset + 1) / second_word_count, 3)
        alignment["cues"][1]["start"] = 0.625
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")

        report = self.validate()
        self.assertEqual(report["checks"]["cueTimeline"]["gapCount"], 1)
        self.assertEqual(report["checks"]["cueTimeline"]["maxGapSeconds"], 0.125)
        self.assertEqual(
            report["checks"]["cueWordBindings"]["reviewScope"],
            "technical-only/internal-only",
        )
        self.assertEqual(report["checks"]["cueWordBindings"]["humanListening"], "not-performed")

    def test_gap_that_skips_aligned_speech_is_rejected(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        alignment["cues"][1]["start"] = 0.625
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "starts after its first aligned character"):
            self.validate()

    def test_missing_cue_is_rejected(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        alignment["cues"].pop()
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(ValidationError):
            self.validate()

    def test_first_and_last_timeline_coverage_remain_required(self) -> None:
        alignment = json.loads(self.alignment.read_text(encoding="utf-8"))
        alignment["cues"][0]["start"] = 0.01
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "First cue must start at zero"):
            self.validate()

        alignment["cues"][0]["start"] = 0.0
        alignment["cues"][-1]["end"] = 0.99
        self.alignment.write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "Last cue does not cover"):
            self.validate()

    def test_cue_builder_uses_full_asr_word_envelope_for_interpolated_boundary(self) -> None:
        words = [
            {"text": "a", "start": 0.0, "end": 0.4, "asrWordStart": 0.0, "asrWordEnd": 0.4},
            {"text": "b", "start": 0.6, "end": 0.8, "asrWordStart": 0.4, "asrWordEnd": 0.8},
        ]
        cues = build_cues("A\u3002B\u3002", words, 1.0)
        self.assertEqual(cues[0]["end"], 0.4)
        self.assertEqual(cues[1]["start"], 0.4)
        self.assertEqual(cues[1]["end"], 1.0)

    def test_cue_builder_splits_shared_asr_envelope_at_character_boundary(self) -> None:
        words = [
            {"text": "a", "start": 0.0, "end": 0.4, "asrWordStart": 0.0, "asrWordEnd": 0.8},
            {"text": "b", "start": 0.4, "end": 0.8, "asrWordStart": 0.0, "asrWordEnd": 0.8},
        ]
        cues = build_cues("A\u3002B\u3002", words, 1.0)
        self.assertEqual(cues[0]["end"], 0.4)
        self.assertEqual(cues[1]["start"], 0.4)
        self.assertEqual(cues[1]["end"], 1.0)

    def test_word_interval_quantization_repairs_collapsed_millisecond(self) -> None:
        start, end, repaired = quantize_word_interval(1247.8606, 1247.8614)
        self.assertTrue(repaired)
        self.assertEqual(start, 1247.861)
        self.assertEqual(end, 1247.862)

    def test_word_interval_normalization_moves_duplicate_after_previous_end(self) -> None:
        first_start, first_end, _ = normalize_word_interval(0.0, 1005.18, 1005.46)
        second_start, second_end, _ = normalize_word_interval(first_end, 1005.18, 1005.46)
        self.assertEqual(first_start, 1005.18)
        self.assertEqual(first_end, 1005.46)
        self.assertEqual(second_start, 1005.46)
        self.assertEqual(second_end, 1005.461)


if __name__ == "__main__":
    unittest.main()
