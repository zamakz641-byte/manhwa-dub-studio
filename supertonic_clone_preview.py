from __future__ import annotations

import json
import time
import wave
from pathlib import Path

from supertonic import TTS


ROOT = Path(__file__).resolve().parent
MODEL_ROOT = Path(r"D:\manhwa studio\anime_manga_manhua_dubbing_app\models\supertonic-3")
OUTPUT_DIR = ROOT / "projects" / "complet-15b1d5" / "previews" / "supertonic3"
TEXT = (
    "Kaël découvre enfin la vérité. Son meilleur ami l’a trahi depuis le début. "
    "Mais cette fois, il connaît déjà la fin de l’histoire et prépare sa revanche."
)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tts = TTS(model_dir=str(MODEL_ROOT), auto_download=False)
    results = []
    for voice in ("M1", "M2", "M3", "M4", "M5"):
        style_path = MODEL_ROOT / "voice_styles" / f"{voice}.json"
        style = tts.get_voice_style_from_path(str(style_path))
        for total_steps in (12, 16):
            output = OUTPUT_DIR / f"preset-{voice}-speed-1.2-{total_steps}steps.wav"
            started = time.perf_counter()
            audio, _ = tts.synthesize(
                TEXT, voice_style=style, total_steps=total_steps, speed=1.2,
                lang="fr", verbose=False,
            )
            tts.save_audio(audio, str(output))
            elapsed = time.perf_counter() - started
            with wave.open(str(output), "rb") as wav:
                duration = wav.getnframes() / wav.getframerate()
            results.append({
                "voice": voice, "output": str(output), "steps": total_steps,
                "duration": round(duration, 3), "generation_seconds": round(elapsed, 3),
                "realtime_multiple": round(duration / elapsed, 2),
            })
    print(json.dumps({"source": "official Supertonic 3 presets", "speed": 1.2, "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
