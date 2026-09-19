from __future__ import annotations

import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from core import condition_omnivoice_wav, condition_supertonic_wav


def write_wav(path: Path, samples: np.ndarray, sample_rate: int = 24000) -> None:
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        target.writeframes(samples.astype("<i2").tobytes())


def read_wav(path: Path) -> tuple[int, np.ndarray]:
    with wave.open(str(path), "rb") as source:
        return source.getframerate(), np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")


class OmniVoiceAudioConditioningTests(unittest.TestCase):
    def test_adds_only_missing_padding_and_fades_speech_boundaries(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "abrupt.wav"
            speech = np.full(2400, 12000, dtype=np.int16)
            write_wav(path, speech)

            report = condition_omnivoice_wav(path)
            sample_rate, result = read_wav(path)

            self.assertTrue(report["applied"])
            self.assertAlmostEqual(report["added_start_ms"], 30.0, delta=0.1)
            self.assertAlmostEqual(report["added_end_ms"], 20.0, delta=0.1)
            onset = round(sample_rate * 0.030)
            self.assertEqual(result[onset], 0)
            self.assertGreater(result[onset + round(sample_rate * 0.010)], 11000)
            self.assertEqual(result[-1], 0)

    def test_existing_leading_silence_is_not_extended(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "already-padded.wav"
            samples = np.concatenate((
                np.zeros(round(24000 * 0.120), dtype=np.int16),
                np.full(2400, 6000, dtype=np.int16),
                np.zeros(round(24000 * 0.030), dtype=np.int16),
            ))
            write_wav(path, samples)
            original_frames = len(samples)

            report = condition_omnivoice_wav(path)
            _, result = read_wav(path)

            self.assertEqual(report["added_start_ms"], 0.0)
            self.assertEqual(report["added_end_ms"], 0.0)
            self.assertEqual(len(result), original_frames)

    def test_severe_initial_discontinuity_requests_one_regeneration(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "click.wav"
            samples = np.zeros(4800, dtype=np.int16)
            samples[2400:2404] = [100, 32767, -32768, 100]
            samples[2404:4000] = 5000
            write_wav(path, samples)

            report = condition_omnivoice_wav(path)

            self.assertTrue(report["artifact_suspected"])
            self.assertTrue(report["regenerate_recommended"])
            self.assertTrue(any("discontinuité" in reason for reason in report["reasons"]))


class SupertonicAudioConditioningTests(unittest.TestCase):
    def test_compacts_outer_and_long_internal_silence_and_normalizes_peak(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "supertonic.wav"
            rate = 24000
            speech = np.full(round(rate * 0.4), 8000, dtype=np.int16)
            samples = np.concatenate((
                np.zeros(round(rate * 0.4), dtype=np.int16),
                speech,
                np.zeros(round(rate * 0.5), dtype=np.int16),
                speech,
                np.zeros(round(rate * 0.6), dtype=np.int16),
            ))
            write_wav(path, samples, rate)

            report = condition_supertonic_wav(path)
            _, result = read_wav(path)

            self.assertTrue(report["applied"])
            self.assertEqual(report["shortened_internal_pauses"], 1)
            self.assertGreater(report["removed_ms"], 1200)
            self.assertAlmostEqual(np.max(np.abs(result)) / 32768.0, 10 ** (-1.5 / 20), delta=0.002)
            self.assertAlmostEqual(len(result) / rate, 0.965, delta=0.04)

    def test_keeps_short_natural_pause(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "short-pause.wav"
            rate = 24000
            speech = np.full(round(rate * 0.3), 8000, dtype=np.int16)
            samples = np.concatenate((speech, np.zeros(round(rate * 0.12), dtype=np.int16), speech))
            write_wav(path, samples, rate)

            report = condition_supertonic_wav(path)

            self.assertEqual(report["shortened_internal_pauses"], 0)


if __name__ == "__main__":
    unittest.main()
