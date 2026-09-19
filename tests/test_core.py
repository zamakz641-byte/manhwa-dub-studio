from __future__ import annotations

import unittest

from core import build_segments, script_pack, solve_segment


class TimelineTests(unittest.TestCase):
    def test_ideal_window(self):
        result = solve_segment({"original_duration": 4.0, "tts_duration": 4.8})
        self.assertEqual(result["status"], "ideal")
        self.assertGreaterEqual(result["video_speed"], 0.94)

    def test_large_overflow_is_editorial_alert(self):
        result = solve_segment({"original_duration": 4.0, "tts_duration": 8.0})
        self.assertEqual(result["status"], "script_too_long")
        self.assertEqual(result["audio_speed"], 1.0)

    def test_segments_keep_timing_contract(self):
        scenes = [{"start": 0, "end": 5, "frame": "scene_0001.jpg"}]
        transcript = [{"start": 0.2, "end": 4.2, "text": "The clan abandoned him."}]
        segment = build_segments(scenes, transcript)[0]
        self.assertEqual(segment["soft_max"], 5.2)
        self.assertEqual(segment["hard_max"], 6.0)
        self.assertEqual(segment["frame"], "scene_0001.jpg")

    def test_script_pack_context(self):
        segments = build_segments([], [
            {"start": 0, "end": 2, "text": "One"},
            {"start": 2, "end": 4, "text": "Two"},
        ])
        pack = script_pack({"title": "Test", "source_language": "en", "target_language": "fr", "duration": 4, "segments": segments})
        self.assertEqual(pack["segments"][0]["next_context"], "Two")
        self.assertEqual(pack["segments"][1]["previous_context"], "One")
        self.assertEqual(pack["schema_version"], "manhwa-dub-script-pack-2.0")
        self.assertIn("histoire entière", pack["chatgpt_prompt"])
        self.assertEqual(pack["segments"][0]["timing"]["max_audio_duration_seconds"], 2.0)
        self.assertEqual(pack["segments"][0]["timing"]["word_budget_fr"], 4)
        self.assertEqual(pack["story_context"]["full_transcript"], "One Two")


if __name__ == "__main__":
    unittest.main()
