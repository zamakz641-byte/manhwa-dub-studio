from __future__ import annotations

import unittest

from core import apply_pronunciation_lexicon, build_segments, script_pack, solve_segment


class TimelineTests(unittest.TestCase):
    def test_ideal_window(self):
        result = solve_segment({"original_duration": 4.0, "tts_duration": 4.8})
        self.assertEqual(result["status"], "ideal")
        self.assertAlmostEqual(result["video_speed"], 4.0 / 4.8, places=4)
        self.assertEqual(result["audio_speed"], 1.0)
        self.assertEqual(result["output_duration"], 4.8)

    def test_large_overflow_retimes_video_without_touching_voice(self):
        result = solve_segment({"original_duration": 4.0, "tts_duration": 8.0})
        self.assertEqual(result["status"], "retimed")
        self.assertEqual(result["video_speed"], 0.5)
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
        self.assertEqual(pack["segments"][0]["timing"]["target_audio_duration_seconds"], 2.0)
        self.assertEqual(pack["segments"][0]["timing"]["recommended_word_target_fr"], 4)
        self.assertIn("ce ne sont ni des limites", pack["chatgpt_prompt"])
        self.assertNotIn("hard_max", pack["segments"][0]["timing"])
        self.assertEqual(pack["story_context"]["full_transcript"], "One Two")

    def test_pronunciation_lexicon_changes_only_complete_names(self):
        spoken = apply_pronunciation_lexicon("Kael avance, mais Mikael reste.", {"Kael": "Kaël"})
        self.assertEqual(spoken, "Kaël avance, mais Mikael reste.")


if __name__ == "__main__":
    unittest.main()
