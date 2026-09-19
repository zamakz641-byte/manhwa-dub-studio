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
    "Au moment où tout semblait perdu, Kael comprit enfin la vérité. "
    "Son meilleur ami l'avait trahi depuis le début. Mais cette fois, "
    "il n'allait pas fuir. Il allait reprendre le contrôle de son destin."
)


def main() -> int:
    output_dir = ROOT / "projects" / "complet-15b1d5" / "previews" / "voice-comparison"
    output_dir.mkdir(parents=True, exist_ok=True)
    voices = runtime.load_voices()["voices"]
    for index, voice in enumerate(voices, 1):
        if "omnivoice" not in voice.get("engines", []):
            continue
        output = output_dir / f"{index:02d}_{voice['id']}.wav"
        print(f"[{index}/{len(voices)}] {voice['name']}", flush=True)
        result = app.omnivoice.generate(TEXT, "fr", output, voice)
        cleanup = core.condition_omnivoice_wav(output)
        duration = core.ffprobe(output)["duration"]
        print(
            f"OK {output.name} · {duration:.2f}s · "
            f"{result.get('generation_seconds', '?')}s génération · "
            f"artefact={cleanup['artifact_suspected']}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
