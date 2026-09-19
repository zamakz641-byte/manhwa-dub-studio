from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app
import core
import runtime


TEXT = (
    "Au moment où tout semblait perdu, Kaël comprit enfin la vérité. "
    "Son meilleur ami l'avait trahi depuis le début. Mais cette fois, "
    "il n'allait pas fuir. Il allait reprendre le contrôle de son destin."
)


def main() -> int:
    voice = runtime.voice_profile("fr_ben")
    output_dir = ROOT / "projects" / "complet-15b1d5" / "previews" / "ben-speed"
    output_dir.mkdir(parents=True, exist_ok=True)
    for speed in (1.05, 1.10, 1.15):
        output = output_dir / f"ben_speed_{speed:.2f}.wav"
        print(f"Ben speed={speed:.2f}", flush=True)
        app.omnivoice.generate(TEXT, "fr", output, voice, speed=speed)
        core.condition_omnivoice_wav(output)
        print(f"OK · {core.ffprobe(output)['duration']:.2f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
