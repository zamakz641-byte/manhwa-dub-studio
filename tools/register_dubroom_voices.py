from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NARRATOR = Path(r"D:\manhwa studio\NarratorStudio_StoryDub_v1_3")
DUBROOM = Path(r"D:\manhwa studio\anime_manga_manhua_dubbing_app")
PYTHON = DUBROOM / "data/environments/tts-qwen3-0.6b-base/venv/Scripts/python.exe"
MODEL = DUBROOM / "models/tts-qwen3-0.6b-base/model"
WORKER = NARRATOR / "qwen_tts_worker.py"
VOICE_DIR = ROOT / "voices"

VOICES = [
    {
        "id": "fr_ben",
        "name": "Ben · Narrateur manhwa",
        "language": "fr",
        "gender": "male",
        "style": "Voix masculine chaleureuse, posée et charismatique, conçue pour la narration longue.",
        "reference_path": str(DUBROOM / "data/voice-profiles/local-d385d7af180d4fc8b24471a4fcfb20b8/design/reference-1e771790cd15b694d345.wav"),
        "reference_text": "Personne ne comprenait pourquoi il restait aussi calme. Pourtant, lorsqu'il releva les yeux, tout le monde comprit que la bataille avait déjà commencé. Sa voix resta claire, posée et assurée, même lorsque le danger se rapprocha. Puis il ajouta, avec une légère ironie, que le véritable problème ne faisait que commencer.",
        "source": "DubRoom · profil français Qwen3-TTS VoiceDesign",
    },
    {
        "id": "fr_naturelle_06",
        "name": "Naturelle FR · 0.6B",
        "language": "fr",
        "gender": "unknown",
        "style": "Narration française naturelle issue d'un profil Qwen3-TTS 0.6B enregistré.",
        "reference_path": str(DUBROOM / "data/voice-profiles/local-b81c33ac0fbc4188888101b19bd679c2/processed/9a556950ed5d4e05ba6ad3b347b595ca.clean.wav"),
        "reference_text": "La princesse aux cheveux argentés lui ordonne d'ôter une autre malédiction au héros blond. Crash obéit. Son pouvoir sombre...",
        "source": "DubRoom · profil français Qwen3-TTS 0.6B Base",
    },
    {
        "id": "fr_goat",
        "name": "Narrateur FR · Goat",
        "language": "fr",
        "gender": "male",
        "style": "Narrateur français grave et expressif, nettoyé pour le clonage vocal.",
        "reference_path": str(DUBROOM / "data/voice-profiles/local-93672d00b486438b9beeef66ac365e17/processed/953a56952ecb43a395df87fdabfab57f.clean.wav"),
        "reference_text": "Mais pourquoi ? Né dans une famille puissante, marqué comme un échec, il existe pour une seule raison : absorber les malédictions et blessures de l'équipe des héros.",
        "source": "DubRoom · profil français cloné",
    },
    {
        "id": "fr_cinematic_male",
        "name": "FR · Narrateur cinématique",
        "language": "fr",
        "gender": "male",
        "style": "Baryton chaleureux, tension contenue, pauses dramatiques.",
        "reference_path": str(DUBROOM / "data/library/audio/025fc55c0186485cb824650c8a54ff10.wav"),
        "reference_text": "La nuit semblait paisible. Pourtant, derrière les remparts, quelque chose attendait son heure. Lorsque la cloche sonna, chacun comprit que le royaume ne serait plus jamais le même.",
        "source": "DubRoom · Qwen3-TTS 1.7B VoiceDesign",
    },
    {
        "id": "fr_epic_female",
        "name": "FR · Narratrice épique",
        "language": "fr",
        "gender": "female",
        "style": "Timbre riche et lumineux, vulnérabilité devenant détermination.",
        "reference_path": str(DUBROOM / "data/library/audio/8d261e141f264e9689d7be1772417266.wav"),
        "reference_text": "Elle avait tout perdu, sauf cette étrange certitude : l'histoire n'était pas terminée. Alors elle releva la tête, inspira lentement, et fit un pas vers la lumière.",
        "source": "DubRoom · Qwen3-TTS 1.7B VoiceDesign",
    },
]


def main() -> int:
    VOICE_DIR.mkdir(exist_ok=True)
    env = os.environ.copy()
    env.update({"PYTHONIOENCODING": "utf-8", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
    proc = subprocess.Popen(
        [str(PYTHON), "-u", str(WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=env,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert proc.stdin and proc.stdout
    registry = []
    pending = set()
    for voice in VOICES:
        prompt = VOICE_DIR / f"{voice['id']}_icl.pt"
        xvec = VOICE_DIR / f"{voice['id']}_xvec.pt"
        request_id = voice["id"]
        pending.add(request_id)
        request = {
            "cmd": "create_prompts", "request_id": request_id, "model_path": str(MODEL),
            "ref_audio_path": voice["reference_path"], "ref_text": voice["reference_text"],
            "icl_prompt_path": str(prompt), "xvec_prompt_path": str(xvec),
        }
        proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        while request_id in pending:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("Le worker Qwen s'est arrêté pendant la création des voix")
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("request_id") == request_id and event.get("event") in {"prompt_created", "error"}:
                if not event.get("ok"):
                    raise RuntimeError(event.get("error") or "Création de voix impossible")
                pending.remove(request_id)
                item = dict(voice)
                item.update({"prompt_path": str(prompt), "xvec_prompt_path": str(xvec), "ready": True})
                registry.append(item)
                print(json.dumps({"voice": voice["name"], "ready": True, "elapsed": event.get("elapsed")}, ensure_ascii=False), flush=True)
    proc.stdin.write(json.dumps({"cmd": "shutdown", "request_id": "shutdown"}) + "\n")
    proc.stdin.flush()
    proc.wait(timeout=30)
    (VOICE_DIR / "registry.json").write_text(json.dumps({"default": "fr_naturelle_06", "voices": registry}, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
