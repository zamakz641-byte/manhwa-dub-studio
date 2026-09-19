from __future__ import annotations

import os
import shutil
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VOICE_REGISTRY = ROOT / "voices" / "registry.json"


def env_path(name: str, default: str) -> Path:
    return Path(os.environ.get(name, default)).expanduser()


FFMPEG = Path(os.environ.get("MANHWA_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg")
FFPROBE = Path(os.environ.get("MANHWA_FFPROBE") or shutil.which("ffprobe") or "ffprobe")
YTDLP = Path(os.environ.get("MANHWA_YTDLP") or shutil.which("yt-dlp") or "yt-dlp")

DUBROOM = env_path("MANHWA_DUBROOM_ROOT", r"D:\manhwa studio\anime_manga_manhua_dubbing_app")
NARRATOR = env_path("MANHWA_NARRATOR_ROOT", r"D:\manhwa studio\NarratorStudio_StoryDub_v1_3")

ASR_PYTHON = env_path(
    "MANHWA_ASR_PYTHON",
    str(DUBROOM / "data/environments/faster-whisper-turbo/venv/Scripts/python.exe"),
)
ASR_MODEL = env_path(
    "MANHWA_ASR_MODEL",
    str(DUBROOM / "models/faster-whisper-turbo/model"),
)
if not ASR_MODEL.exists():
    ASR_MODEL = env_path(
        "MANHWA_ASR_MODEL_FALLBACK",
        r"C:\Users\USER\.cache\huggingface\hub\models--Systran--faster-whisper-base\snapshots\ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66",
    )

QWEN_PYTHON = env_path(
    "MANHWA_QWEN_PYTHON",
    str(DUBROOM / "data/environments/tts-qwen3-0.6b-base/venv/Scripts/python.exe"),
)
QWEN_MODEL = env_path(
    "MANHWA_QWEN_MODEL",
    str(DUBROOM / "models/tts-qwen3-0.6b-base/model"),
)
_fast_worker = ROOT / "fast_qwen_worker.py"
_legacy_worker = NARRATOR / "qwen_tts_worker.py"
QWEN_ENGINE = os.environ.get("MANHWA_QWEN_ENGINE", "fast").strip().lower()
QWEN_WORKER = env_path(
    "MANHWA_QWEN_WORKER",
    str(_fast_worker if QWEN_ENGINE != "legacy" and _fast_worker.is_file() else _legacy_worker),
)
QWEN_VOICE = env_path(
    "MANHWA_QWEN_VOICE",
    str(NARRATOR / "qwen_voices/qwen_65a6e53caeb4474b/qwen_prompt_icl.pt"),
)

OMNIVOICE_PYTHON = env_path(
    "MANHWA_OMNIVOICE_PYTHON",
    str(DUBROOM / "data/environments/tts-omnivoice-hq-torch28-v53/venv/Scripts/python.exe"),
)
OMNIVOICE_MODEL_ROOT = env_path(
    "MANHWA_OMNIVOICE_MODEL_ROOT",
    str(DUBROOM / "models/tts-omnivoice-hq"),
)
OMNIVOICE_WORKER = env_path(
    "MANHWA_OMNIVOICE_WORKER",
    str(DUBROOM / "scripts/engines/run-tts.py"),
)


def omnivoice_ready() -> bool:
    return (
        OMNIVOICE_PYTHON.is_file()
        and (OMNIVOICE_MODEL_ROOT / "model").is_dir()
        and OMNIVOICE_WORKER.is_file()
    )


def load_voices() -> dict:
    if VOICE_REGISTRY.is_file():
        try:
            data = json.loads(VOICE_REGISTRY.read_text(encoding="utf-8"))
            voices = [v for v in data.get("voices", []) if Path(v.get("prompt_path", "")).is_file()]
            if voices:
                omni_ready = omnivoice_ready()
                for voice in voices:
                    engines = ["qwen"]
                    omni_prompt = ROOT / "voices" / f"omnivoice_{voice['id']}.pt"
                    reference = Path(str(voice.get("reference_path") or ""))
                    if omni_ready and reference.is_file() and str(voice.get("reference_text") or "").strip():
                        engines.append("omnivoice")
                    voice["engines"] = engines
                    voice["omnivoice_prompt_path"] = str(omni_prompt)
                return {"default": data.get("default") or voices[0]["id"], "voices": voices}
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return {"default": "legacy", "voices": [{"id": "legacy", "name": "Voix Qwen existante", "language": "auto", "prompt_path": str(QWEN_VOICE), "ready": QWEN_VOICE.is_file()}]}


def voice_prompt(voice_id: str | None) -> Path:
    registry = load_voices()
    selected = next((v for v in registry["voices"] if v["id"] == voice_id), None)
    selected = selected or next((v for v in registry["voices"] if v["id"] == registry["default"]), registry["voices"][0])
    return Path(selected["prompt_path"])


def voice_profile(voice_id: str | None) -> dict:
    registry = load_voices()
    selected = next((v for v in registry["voices"] if v["id"] == voice_id), None)
    return selected or next(
        (v for v in registry["voices"] if v["id"] == registry["default"]),
        registry["voices"][0],
    )


def available(path: Path, marker: str | None = None) -> bool:
    if str(path).lower() in {"ffmpeg", "ffprobe", "yt-dlp"}:
        return shutil.which(str(path)) is not None
    return path.exists() and (not marker or (path / marker).exists())


def status() -> dict:
    voices = load_voices()
    return {
        "ffmpeg": {"ready": available(FFMPEG), "path": str(FFMPEG)},
        "ffprobe": {"ready": available(FFPROBE), "path": str(FFPROBE)},
        "yt_dlp": {"ready": available(YTDLP), "path": str(YTDLP)},
        "asr": {
            "ready": ASR_PYTHON.is_file() and ASR_MODEL.exists(),
            "engine": "Faster-Whisper",
            "python": str(ASR_PYTHON),
            "model": str(ASR_MODEL),
        },
        "tts": {
            "ready": QWEN_PYTHON.is_file() and QWEN_MODEL.exists() and QWEN_WORKER.is_file() and voice_prompt(voices["default"]).is_file(),
            "engine": "FasterQwen3TTS · CUDA graphs" if QWEN_WORKER.name == "fast_qwen_worker.py" else "Qwen3-TTS 0.6B Base",
            "python": str(QWEN_PYTHON),
            "model": str(QWEN_MODEL),
            "voice": next((v["name"] for v in voices["voices"] if v["id"] == voices["default"]), voices["default"]),
            "voice_count": len(voices["voices"]),
            "measured_audio_per_compute": 1.925,
            "estimated_minutes_per_hour": 31.2,
            "benchmark_note": "Mesure secteur: 184,4 s audio / 95,8 s, 39 segments, voix Naturelle FR",
            "engines": {
                "qwen": {
                    "id": "qwen", "name": "Qwen3-TTS", "ready": QWEN_PYTHON.is_file() and QWEN_MODEL.exists(),
                    "estimated_minutes_per_hour": 31.2,
                },
                "omnivoice": {
                    "id": "omnivoice", "name": "OmniVoice HQ", "ready": omnivoice_ready(),
                    "estimated_minutes_per_hour": 8.0,
                    "note": "Mesure locale à chaud avec la voix Naturelle FR; le débit varie selon la voix.",
                },
            },
        },
        "omni_voice": {
            "ready": omnivoice_ready(),
            "engine": "OmniVoice HQ 0.2.1",
            "python": str(OMNIVOICE_PYTHON),
            "model": str(OMNIVOICE_MODEL_ROOT),
            "voice_count": sum("omnivoice" in v.get("engines", []) for v in voices["voices"]),
            "measured_audio_per_compute": 8.03,
            "estimated_minutes_per_hour": 8.0,
            "benchmark_note": "Voix Naturelle FR, modèle chaud, 18,44 s audio en 2,30 s",
        },
    }
