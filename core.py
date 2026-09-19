from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

import runtime


ROOT = Path(__file__).resolve().parent
PROJECTS = ROOT / "projects"
PROJECTS.mkdir(exist_ok=True)
_PROJECT_WRITE_LOCK = threading.RLock()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_id(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")[:42]
    return f"{cleaned or 'project'}-{uuid.uuid4().hex[:6]}"


def apply_pronunciation_lexicon(text: str, lexicon: dict[str, str] | None) -> str:
    """Apply project-local spoken spellings without altering the visible script."""
    spoken = str(text)
    for written, pronounced in (lexicon or {}).items():
        written = str(written).strip()
        pronounced = str(pronounced).strip()
        if written and pronounced:
            spoken = re.sub(rf"(?<!\w){re.escape(written)}(?!\w)", pronounced, spoken, flags=re.IGNORECASE)
    return spoken


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
    # TTS, task progress and UI requests can save the same project from
    # different threads. A shared `project.json.tmp` makes one thread rename a
    # file while another still owns it, which fails with WinError 5 on Windows.
    # Serialize writes, use a unique staging file, and retry atomic replacement
    # briefly for antivirus/indexer locks.
    with _PROJECT_WRITE_LOCK:
        folder = project_dir(data["id"])
        folder.mkdir(parents=True, exist_ok=True)
        data["updated_at"] = now()
        target = folder / "project.json"
        temp = folder / (
            f".project-{os.getpid()}-{threading.get_ident()}-{uuid.uuid4().hex}.tmp"
        )
        try:
            temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            for attempt in range(7):
                try:
                    os.replace(temp, target)
                    return data
                except PermissionError:
                    if attempt == 6:
                        raise
                    time.sleep(0.025 * (attempt + 1))
        finally:
            temp.unlink(missing_ok=True)


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
        "tts_engine": tts_engine if tts_engine in {"qwen", "omnivoice", "supertonic"} else "qwen",
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
    result = subprocess.run(
        command, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=60, check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    raw = json.loads(result.stdout)
    video = next((s for s in raw.get("streams", []) if s.get("codec_type") == "video"), {})
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    a, b = (rate.split("/", 1) + ["1"])[:2]
    fps = float(a) / max(float(b), 1.0)
    duration = float(raw.get("format", {}).get("duration") or video.get("duration") or 0)
    return {"duration": duration, "fps": fps, "width": video.get("width", 0), "height": video.get("height", 0)}


def condition_omnivoice_wav(
    path: Path,
    pad_start_ms: float = 30.0,
    pad_end_ms: float = 20.0,
    fade_in_ms: float = 10.0,
    fade_out_ms: float = 10.0,
) -> dict[str, Any]:
    """Remove onset/ending clicks without changing the body or speed of speech.

    OmniVoice normally emits roughly 100 ms of leading silence. Padding is only
    added when a generated file contains less than the requested minimum. Fades
    are anchored to the detected speech boundaries rather than to sample zero.
    """
    path = Path(path)
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
        compression = source.getcomptype()
        raw = source.readframes(frame_count)

    report: dict[str, Any] = {
        "applied": False,
        "added_start_ms": 0.0,
        "added_end_ms": 0.0,
        "fade_in_ms": 0.0,
        "fade_out_ms": 0.0,
        "artifact_suspected": False,
        "regenerate_recommended": False,
        "reasons": [],
    }
    if sample_width != 2 or compression != "NONE" or channels < 1 or not raw:
        report["skipped"] = "Format WAV non PCM16"
        return report

    samples = np.frombuffer(raw, dtype="<i2").copy()
    complete_frames = samples.size // channels
    samples = samples[:complete_frames * channels].reshape(complete_frames, channels)
    normalized = samples.astype(np.float32) / 32768.0
    frame_level = np.max(np.abs(normalized), axis=1)
    active = np.flatnonzero(frame_level >= 0.002)
    if not active.size:
        report["skipped"] = "Audio silencieux"
        return report

    onset = int(active[0])
    ending = int(active[-1])
    report["onset_ms"] = round(onset * 1000.0 / sample_rate, 2)

    # Only severe, unambiguous defects trigger a retry. Natural plosives can
    # produce large derivatives, so ordinary onset transients are never enough.
    inspect_end = min(complete_frames, onset + max(1, round(sample_rate * 0.100)))
    onset_audio = normalized[onset:inspect_end]
    clip_ratio = float(np.mean(np.abs(onset_audio) >= 0.985)) if onset_audio.size else 0.0
    max_jump = float(np.max(np.abs(np.diff(onset_audio, axis=0)))) if len(onset_audio) > 1 else 0.0
    dc_offset = float(np.max(np.abs(np.mean(onset_audio, axis=0)))) if onset_audio.size else 0.0
    reasons: list[str] = []
    if clip_ratio >= 0.01:
        reasons.append(f"écrêtage initial {clip_ratio * 100:.1f}%")
    if max_jump >= 0.65:
        reasons.append(f"discontinuité initiale {max_jump:.2f}")
    if dc_offset >= 0.12 and clip_ratio >= 0.001:
        reasons.append(f"offset continu initial {dc_offset:.2f}")
    report.update({
        "artifact_suspected": bool(reasons),
        "regenerate_recommended": bool(reasons),
        "reasons": reasons,
        "initial_clip_ratio": round(clip_ratio, 5),
        "initial_max_jump": round(max_jump, 5),
    })

    required_start = max(0, round(sample_rate * pad_start_ms / 1000.0))
    required_end = max(0, round(sample_rate * pad_end_ms / 1000.0))
    prepend = max(0, required_start - onset)
    trailing_silence = complete_frames - 1 - ending
    append = max(0, required_end - trailing_silence)
    if prepend or append:
        samples = np.pad(samples, ((prepend, append), (0, 0)), mode="constant")
        onset += prepend
        ending += prepend
        report["added_start_ms"] = round(prepend * 1000.0 / sample_rate, 2)
        report["added_end_ms"] = round(append * 1000.0 / sample_rate, 2)

    processed = samples.astype(np.float32)
    fade_in_frames = min(max(0, round(sample_rate * fade_in_ms / 1000.0)), len(processed) - onset)
    fade_out_frames = min(max(0, round(sample_rate * fade_out_ms / 1000.0)), ending + 1)
    if fade_in_frames:
        processed[onset:onset + fade_in_frames] *= np.linspace(0.0, 1.0, fade_in_frames, dtype=np.float32)[:, None]
        report["fade_in_ms"] = round(fade_in_frames * 1000.0 / sample_rate, 2)
    if fade_out_frames:
        start = ending - fade_out_frames + 1
        processed[start:ending + 1] *= np.linspace(1.0, 0.0, fade_out_frames, dtype=np.float32)[:, None]
        report["fade_out_ms"] = round(fade_out_frames * 1000.0 / sample_rate, 2)

    output = np.clip(np.rint(processed), -32768, 32767).astype("<i2")
    temporary = path.with_name(f".{path.stem}-{uuid.uuid4().hex}.wav.tmp")
    try:
        with wave.open(str(temporary), "wb") as target:
            target.setnchannels(channels)
            target.setsampwidth(2)
            target.setframerate(sample_rate)
            target.setcomptype("NONE", "not compressed")
            target.writeframes(output.tobytes())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    report["applied"] = True
    report["duration"] = round(len(output) / sample_rate, 4)
    return report


def condition_supertonic_wav(
    path: Path,
    lead_ms: float = 30.0,
    tail_ms: float = 45.0,
    internal_pause_ms: float = 90.0,
    shorten_after_ms: float = 220.0,
    silence_db: float = -50.0,
    peak_db: float = -1.5,
) -> dict[str, Any]:
    """Give Supertonic narration preview-like loudness and compact pauses.

    Supertonic commonly emits 350-500 ms before speech and 500-750 ms after
    it.  Across a segmented recap those gaps add many minutes and make the
    narration sound disconnected.  Keep short, natural pauses untouched, cap
    only long silent runs, then peak-normalize to the same -1.5 dB ceiling used
    by the approved preview files.  Speech samples are never time-stretched.
    """
    path = Path(path)
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
        compression = source.getcomptype()
        raw = source.readframes(frame_count)

    report: dict[str, Any] = {"applied": False, "removed_ms": 0.0, "gain_db": 0.0}
    if sample_width != 2 or compression != "NONE" or channels < 1 or not raw:
        report["skipped"] = "Format WAV non PCM16"
        return report

    values = np.frombuffer(raw, dtype="<i2").copy()
    complete_frames = values.size // channels
    samples = values[:complete_frames * channels].reshape(complete_frames, channels)
    level = np.max(np.abs(samples.astype(np.float32) / 32768.0), axis=1)
    threshold = 10.0 ** (silence_db / 20.0)

    # A 10 ms envelope avoids treating zero crossings and unvoiced consonants
    # as pauses.  One active frame on either side is kept as a safety margin.
    block = max(1, round(sample_rate * 0.010))
    block_count = math.ceil(complete_frames / block)
    padded = np.pad(level, (0, block_count * block - complete_frames))
    active_blocks = padded.reshape(block_count, block).max(axis=1) >= threshold
    if len(active_blocks) >= 3:
        active_blocks = active_blocks | np.r_[False, active_blocks[:-1]] | np.r_[active_blocks[1:], False]
    active_indices = np.flatnonzero(active_blocks)
    if not active_indices.size:
        report["skipped"] = "Audio silencieux"
        return report

    first = max(0, int(active_indices[0] * block) - round(sample_rate * lead_ms / 1000.0))
    last = min(complete_frames, int((active_indices[-1] + 1) * block) + round(sample_rate * tail_ms / 1000.0))
    work = samples[first:last]
    work_blocks = active_blocks[active_indices[0]:active_indices[-1] + 1]

    max_quiet_blocks = max(1, round(shorten_after_ms / 10.0))
    keep_quiet_blocks = max(1, round(internal_pause_ms / 10.0))
    pieces: list[np.ndarray] = []
    cursor_block = 0
    quiet_runs = 0
    i = 0
    while i < len(work_blocks):
        if work_blocks[i]:
            i += 1
            continue
        j = i + 1
        while j < len(work_blocks) and not work_blocks[j]:
            j += 1
        if j - i > max_quiet_blocks:
            cut_start_block = i + keep_quiet_blocks // 2
            cut_end_block = j - (keep_quiet_blocks - keep_quiet_blocks // 2)
            start_sample = max(0, min(len(work), cursor_block * block))
            cut_sample = max(start_sample, min(len(work), cut_start_block * block))
            pieces.append(work[start_sample:cut_sample])
            cursor_block = cut_end_block
            quiet_runs += 1
        i = j
    pieces.append(work[min(len(work), cursor_block * block):])
    processed = np.concatenate(pieces, axis=0) if len(pieces) > 1 else pieces[0]

    # Peak normalization matches the presence of the approved "normalized"
    # previews without the 192 kHz upsampling caused by FFmpeg loudnorm.
    float_audio = processed.astype(np.float32)
    current_peak = float(np.max(np.abs(float_audio))) / 32768.0 if float_audio.size else 0.0
    target_peak = 10.0 ** (peak_db / 20.0)
    gain = min(target_peak / max(current_peak, 1e-9), 10.0 ** (12.0 / 20.0))
    float_audio *= gain
    output = np.clip(np.rint(float_audio), -32768, 32767).astype("<i2")

    temporary = path.with_name(f".{path.stem}-{uuid.uuid4().hex}.wav.tmp")
    try:
        with wave.open(str(temporary), "wb") as target:
            target.setnchannels(channels)
            target.setsampwidth(2)
            target.setframerate(sample_rate)
            target.setcomptype("NONE", "not compressed")
            target.writeframes(output.tobytes())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

    report.update({
        "applied": True,
        "original_duration": round(complete_frames / sample_rate, 4),
        "duration": round(len(output) / sample_rate, 4),
        "removed_ms": round((complete_frames - len(output)) * 1000.0 / sample_rate, 2),
        "shortened_internal_pauses": quiet_runs,
        "gain_db": round(20.0 * math.log10(max(gain, 1e-9)), 2),
        "peak_db": peak_db,
    })
    return report


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
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
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
    # The voice is the timing master. Preserve it at natural speed and retime
    # the matching video slice to its exact duration during export.
    video_speed = video / audio
    if 0.80 <= ratio <= 1.35:
        status = "ideal"
    elif 0.55 <= ratio <= 1.80:
        status = "tolerable"
    else:
        status = "retimed"
    transition = "MOTION INTERPOLATION" if video_speed < 0.92 else "CROSSFADE" if video_speed > 1.15 else "CUT"
    return {
        "ratio": round(ratio, 3),
        "status": status,
        "video_speed": round(video_speed, 4),
        "audio_speed": 1.0,
        "output_duration": round(audio, 3),
        "transition": transition,
    }


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
                **{k: s[k] for k in ("preferred_duration", "soft_min", "soft_max")},
                "target_audio_duration_seconds": maximum,
                "recommended_word_target_fr": max(1, math.floor(maximum * words_per_second)),
                "constraint": "SOFT GUIDANCE ONLY: write the length needed for a clear, engaging retelling. Avoid padding, repetition and disproportionate digressions. Never shorten at the expense of comprehension. The matching video segment will be retimed to the natural French audio duration.",
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
            "Écris chaque passage à la longueur réellement nécessaire pour raconter correctement l'action. timing.target_audio_duration_seconds "
            "et timing.recommended_word_target_fr donnent seulement un ordre de grandeur : ce ne sont ni des limites ni une obligation de remplissage. "
            "Tu peux les dépasser quand la compréhension, l'émotion ou une transition l'exigent, mais évite le bavardage, les répétitions et les "
            "digressions disproportionnées. N'accélère jamais artificiellement la voix : la vidéo de chaque segment sera retimée sur la durée réelle de l'audio. "
            "Utilise previous_context et next_context pour assurer des transitions naturelles sans répéter. "
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
