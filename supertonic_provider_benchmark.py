from __future__ import annotations

import argparse
import json
import time
import wave
from pathlib import Path

import supertonic.loader as loader
from supertonic import TTS


MODEL_ROOT = Path(r"D:\manhwa studio\anime_manga_manhua_dubbing_app\models\supertonic-3")
OUTPUT_ROOT = Path(__file__).resolve().parent / "projects" / "complet-15b1d5" / "previews" / "supertonic3"
TEXT = (
    "Kaël découvre enfin la vérité. Son meilleur ami l’a trahi depuis le début. "
    "Mais cette fois, il connaît déjà la fin de l’histoire et prépare sa revanche."
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("cpu", "cuda"), required=True)
    args = parser.parse_args()

    requested = "CUDAExecutionProvider" if args.provider == "cuda" else "CPUExecutionProvider"
    loader.DEFAULT_ONNX_PROVIDERS = [requested, "CPUExecutionProvider"] if args.provider == "cuda" else [requested]

    tts = TTS(model_dir=str(MODEL_ROOT), auto_download=False)
    sessions = (tts.model.dp_ort, tts.model.text_enc_ort, tts.model.vector_est_ort, tts.model.vocoder_ort)
    active = [session.get_providers() for session in sessions]
    results = []
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    for voice in ("M1", "M5"):
        style = tts.get_voice_style(voice)
        # Warm-up is deliberately excluded from the steady-state benchmark.
        tts.synthesize(TEXT, voice_style=style, total_steps=16, speed=1.2, lang="fr", verbose=False)
        started = time.perf_counter()
        audio, _ = tts.synthesize(TEXT, voice_style=style, total_steps=16, speed=1.2, lang="fr", verbose=False)
        elapsed = time.perf_counter() - started
        output = OUTPUT_ROOT / f"benchmark-{args.provider}-{voice}-16steps.wav"
        tts.save_audio(audio, str(output))
        with wave.open(str(output), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        results.append({
            "voice": voice,
            "duration": round(duration, 3),
            "generation_seconds": round(elapsed, 3),
            "realtime_multiple": round(duration / elapsed, 2),
        })

    print(json.dumps({"requested": requested, "active_providers": active, "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
