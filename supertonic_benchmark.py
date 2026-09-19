from __future__ import annotations

import json
import time
import wave
from pathlib import Path

from supertonic import TTS


MODEL_ROOT = Path(r"D:\manhwa studio\anime_manga_manhua_dubbing_app\models\supertonic-3")
OUTPUT_ROOT = Path(__file__).resolve().parent / "projects" / "complet-15b1d5" / "previews" / "supertonic3"
TEXT = (
    "Kaël découvre enfin la vérité. Son meilleur ami l’a trahi depuis le début. "
    "Mais cette fois, il connaît déjà la fin de l’histoire et prépare sa revanche."
)


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    loaded_at = time.perf_counter()
    tts = TTS(model_dir=str(MODEL_ROOT), auto_download=False)
    load_seconds = time.perf_counter() - loaded_at
    results = []
    for voice_name in ("M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"):
        output = OUTPUT_ROOT / f"{voice_name}.wav"
        style = tts.get_voice_style(voice_name=voice_name)
        started = time.perf_counter()
        wav, _ = tts.synthesize(
            TEXT, voice_style=style, total_steps=8, speed=1.0, lang="fr", verbose=False,
        )
        tts.save_audio(wav, str(output))
        elapsed = time.perf_counter() - started
        with wave.open(str(output), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        results.append({
            "voice": voice_name,
            "output": str(output),
            "duration": round(duration, 3),
            "generation_seconds": round(elapsed, 3),
            "realtime_multiple": round(duration / elapsed, 2),
        })
    print(json.dumps({"load_seconds": round(load_seconds, 3), "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
