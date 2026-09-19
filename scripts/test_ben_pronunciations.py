from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app
import core
import runtime


VARIANTS = {
    "01_kael_original.wav": "Au moment où tout semblait perdu, Kael comprit enfin la vérité.",
    "02_kael_trema.wav": "Au moment où tout semblait perdu, Kaël comprit enfin la vérité.",
    "03_kael_phonetique.wav": "Au moment où tout semblait perdu, Ka-èl comprit enfin la vérité.",
    "04_kael_lie.wav": "Au moment où tout semblait perdu, Kaèle comprit enfin la vérité.",
}


def main() -> int:
    voice = runtime.voice_profile("fr_ben")
    output_dir = ROOT / "projects" / "complet-15b1d5" / "previews" / "ben-pronunciation"
    output_dir.mkdir(parents=True, exist_ok=True)
    for index, (name, text) in enumerate(VARIANTS.items(), 1):
        output = output_dir / name
        print(f"[{index}/{len(VARIANTS)}] {text}", flush=True)
        app.omnivoice.generate(text, "fr", output, voice)
        report = core.condition_omnivoice_wav(output)
        print(f"OK {name} · artefact={report['artifact_suspected']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
