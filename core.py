from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

import runtime


ROOT = Path(__file__).resolve().parent
PROJECTS = ROOT / "projects"
PROJECTS.mkdir(exist_ok=True)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_id(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")[:42]
    return f"{cleaned or 'project'}-{uuid.uuid4().hex[:6]}"


def project_dir(project_id: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]{3,64}", project_id):
        raise ValueError("Identifiant de projet invalide")
    return PROJECTS / project_id


def read_project(project_id: str) -> dict[str, Any]:
    path = project_dir(project_id) / "project.json"
    if not path.is_file():
        raise FileNotFoundError(project_id)
    return json.loads(path.read_text(encoding="utf-8"))


def write_project(data: dict[str, Any]) -> dict[str, Any]:
    folder = project_dir(data["id"])
    folder.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = now()
    temp = folder / "project.json.tmp"
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(folder / "project.json")
    return data


def create_project(
    title: str,
    target_language: str = "fr",
    voice_id: str | None = None,
    tts_engine: str = "qwen",
) -> dict[str, Any]:
    pid = safe_id(title)
    folder = project_dir(pid)
    for child in ("source", "transcript", "script", "timeline", "previews", "export", "cache", "tts"):
        (folder / child).mkdir(parents=True, exist_ok=True)
    data = {
        "id": pid,
        "title": title.strip() or "Nouveau projet",
        "source_language": "auto",
        "target_language": target_language,
        "voice_id": voice_id or runtime.load_voices()["default"],
        "tts_engine": tts_engine if tts_engine in {"qwen", "omnivoice"} else "qwen",
        "status": "draft",
        "progress": 0,
        "created_at": now(),
        "updated_at": now(),
        "source": None,
        "duration": 0,
        "fps": 0,
        "segments": [],
        "writing_profile": {
            "style": "entertaining_recap", "humor": 0.35, "pop_culture": 0.25,
            "roasting": 0.20, "dramatic_weight": 0.85, "factual_fidelity": 1.0,
        },
    }
    return write_project(data)


def list_projects() -> list[dict[str, Any]]:
    items = []
    for path in PROJECTS.glob("*/project.json"):
        try:
            items.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(items, key=lambda item: item.get("updated_at", ""), reverse=True)


def ffprobe(path: Path) -> dict[str, Any]:
    command = [str(runtime.FFPROBE), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60, check=True)
    raw = json.loads(result.stdout)
    video = next((s for s in raw.get("streams", []) if s.get("codec_type") == "video"), {})
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    a, b = (rate.split("/", 1) + ["1"])[:2]
    fps = float(a) / max(float(b), 1.0)
    duration = float(raw.get("format", {}).get("duration") or video.get("duration") or 0)
    return {"duration": duration, "fps": fps, "width": video.get("width", 0), "height": video.get("height", 0)}


def analyze_visual(
    path: Path,
    output: Path,
    duration: float,
    progress: Callable[[float, str], None] | None = None,
) -> list[dict[str, Any]]:
    output.mkdir(parents=True, exist_ok=True)
    sample_step = 1.5
    width, height = 320, 180
    frame_size = width * height * 3
    command = [
        str(runtime.FFMPEG), "-v", "error", "-i", str(path), "-an",
        "-vf", f"fps={1 / sample_step:.6f},scale={width}:{height}",
        "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout
    samples: list[tuple[float, np.ndarray, np.ndarray]] = []
    index = 0
    while True:
        raw = process.stdout.read(frame_size)
        if len(raw) != frame_size:
            break
        thumb = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3)).copy()
        hist = cv2.calcHist([thumb], [0, 1], None, [24, 24], [0, 256, 0, 256])
        cv2.normalize(hist, hist)
        samples.append((index * sample_step, thumb, hist))
        index += 1
        if progress and (index == 1 or index % 20 == 0):
            progress(min(1.0, (index * sample_step) / max(duration, sample_step)), f"Images analysées : {index}")
    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
    if process.wait(timeout=max(120, min(1800, int(duration * 2)))) != 0:
        raise RuntimeError("Analyse visuelle FFmpeg impossible : " + stderr[-500:])
    if not samples:
        return []
    boundaries = [0.0]
    for index in range(1, len(samples)):
        score = cv2.compareHist(samples[index - 1][2], samples[index][2], cv2.HISTCMP_BHATTACHARYYA)
        if score > 0.46 and samples[index][0] - boundaries[-1] >= 2.0:
            boundaries.append(samples[index][0])
    boundaries.append(duration)
    scenes = []
    for i in range(len(boundaries) - 1):
        start, end = boundaries[i], boundaries[i + 1]
        mid = (start + end) / 2
        nearest = min(samples, key=lambda item: abs(item[0] - mid))
        name = f"scene_{i + 1:04d}.jpg"
        cv2.imwrite(str(output / name), nearest[1], [cv2.IMWRITE_JPEG_QUALITY, 88])
        scenes.append({"id": f"scene_{i + 1:04d}", "start": round(start, 3), "end": round(end, 3), "frame": name})
    return scenes


def solve_segment(segment: dict[str, Any]) -> dict[str, Any]:
    video = max(0.05, float(segment.get("original_duration") or 0.05))
    audio = max(0.05, float(segment.get("tts_duration") or segment.get("preferred_duration") or video))
    ratio = audio / video
    if 0.90 <= ratio <= 1.30:
        status, video_speed = "ideal", max(0.94, min(1.06, video / audio))
    elif 0.80 <= ratio <= 1.50:
        status, video_speed = "tolerable", max(0.90, min(1.10, video / audio))
    else:
        status, video_speed = ("script_too_long" if ratio > 1 else "script_too_short"), 1.0
    transition = "HOLD + CUT" if ratio > 1.1 else "CROSSFADE" if ratio < 0.9 else "CUT"
    return {"ratio": round(ratio, 3), "status": status, "video_speed": round(video_speed, 3), "audio_speed": 1.0, "transition": transition}


def build_segments(scenes: list[dict[str, Any]], transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    bases = transcript or [{"start": s["start"], "end": s["end"], "text": ""} for s in scenes]
    segments = []
    for i, item in enumerate(bases):
        start, end = float(item.get("start", 0)), float(item.get("end", 0))
        if end <= start:
            end = start + 2.0
        scene = min(scenes, key=lambda s: abs(((s["start"] + s["end"]) / 2) - ((start + end) / 2))) if scenes else None
        duration = end - start
        seg = {
            "id": f"seg_{i + 1:04d}", "video_start": round(start, 3), "video_end": round(end, 3),
            "original_duration": round(duration, 3), "transcript": item.get("text", ""), "rewritten_text": "",
            "frame": scene.get("frame") if scene else None, "motion": "static_or_slow_pan", "cuts": [],
            "preferred_duration": round(duration, 3), "soft_min": round(duration * 0.9, 3),
            "soft_max": round(duration * 1.3, 3), "hard_max": round(duration * 1.5, 3),
            "tts_duration": None, "tts_path": None,
        }
        seg["sync"] = solve_segment(seg)
        segments.append(seg)
    return segments


def script_pack(project: dict[str, Any]) -> dict[str, Any]:
    segments = project.get("segments", [])
    words_per_second = float(project.get("tts_words_per_second") or 2.20)
    full_transcript = " ".join(str(s.get("transcript") or "").strip() for s in segments).strip()
    compact = []
    for i, s in enumerate(segments):
        maximum = round(float(s["original_duration"]), 3)
        compact.append({
            "id": s["id"], "video_start": s["video_start"], "video_end": s["video_end"],
            "original_duration": s["original_duration"], "transcript": s["transcript"],
            "previous_context": segments[i - 1]["transcript"] if i else None,
            "next_context": segments[i + 1]["transcript"] if i + 1 < len(segments) else None,
            "visual": {"frames": [s["frame"]] if s.get("frame") else [], "motion": s.get("motion"), "cuts": s.get("cuts", [])},
            "timing": {
                **{k: s[k] for k in ("preferred_duration", "soft_min", "soft_max", "hard_max")},
                "max_audio_duration_seconds": maximum,
                "word_budget_fr": max(1, math.floor(maximum * words_per_second)),
                "constraint": "HARD: generated speech must not exceed max_audio_duration_seconds",
            },
            "rewritten_text": s.get("rewritten_text", ""),
        })
    return {
        "schema_version": "manhwa-dub-script-pack-2.0",
        "project": {k: project.get(k) for k in ("title", "source_language", "target_language", "duration")},
        "writing_profile": project.get("writing_profile", {}),
        "story_context": {
            "instruction": "Read the complete source before rewriting any segment so names, chronology, motivations and revelations remain coherent.",
            "full_transcript": full_transcript,
        },
        "chatgpt_prompt": (
            "Tu es le scénariste français de Manhwa Dub Studio. Lis D'ABORD story_context.full_transcript et TOUS les segments "
            "dans l'ordre afin de comprendre l'histoire entière, ses personnages, les causes, les révélations et la chronologie. "
            "Réécris ensuite chaque segment comme un recap manhwa français fluide, cinématographique et captivant : phrases naturelles "
            "à l'oral, tension claire, humour léger seulement quand il convient, noms et faits fidèles, aucune invention. Conserve exactement "
            "le même id et le même ordre; ne fusionne, ne supprime et ne divise aucun segment. Remplis uniquement rewritten_text. "
            "CONTRAINTE ABSOLUE : la voix générée ne doit jamais dépasser timing.max_audio_duration_seconds. Respecte donc "
            "timing.word_budget_fr (calculé prudemment à 2,20 mots/seconde), emploie des formulations plus courtes si nécessaire et n'ajoute "
            "aucune pause ou didascalie. Utilise previous_context et next_context pour assurer des transitions naturelles sans répéter. "
            "Retourne uniquement un objet JSON valide ayant schema_version et segments; chaque élément doit contenir id et rewritten_text."
        ),
        "response_contract": {
            "format": "json_only",
            "required_root_keys": ["schema_version", "segments"],
            "required_segment_keys": ["id", "rewritten_text"],
            "preserve_ids_and_order": True,
        },
        "segments": compact,
    }


def clean_cache(folder: Path) -> int:
    removed = 0
    for name in ("cache", "previews"):
        target = folder / name
        if target.is_dir():
            for item in target.iterdir():
                if item.is_file():
                    item.unlink(missing_ok=True); removed += 1
                elif item.is_dir():
                    shutil.rmtree(item); removed += 1
    return removed
