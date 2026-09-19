from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import uvicorn
from fastapi import Body, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import core
import runtime


BASE = Path(__file__).resolve().parent
WEB = BASE / "web"
app = FastAPI(title="Manhwa Dub Studio", version="1.0.0")
app.mount("/static", StaticFiles(directory=WEB), name="static")


class QwenWorker:
    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.lock = threading.Lock()

    def _ensure(self) -> subprocess.Popen[str]:
        if self.process and self.process.poll() is None:
            return self.process
        env = os.environ.copy()
        env.update({"PYTHONIOENCODING": "utf-8", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
        self.process = subprocess.Popen(
            [str(runtime.QWEN_PYTHON), "-u", str(runtime.QWEN_WORKER)], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return self.process

    def generate(self, text: str, language: str, output: Path, prompt: Path) -> dict[str, Any]:
        request_id = uuid.uuid4().hex
        payload = {
            "cmd": "generate", "request_id": request_id, "model_path": str(runtime.QWEN_MODEL),
            "prompt_path": str(prompt), "output_path": str(output), "text": text,
            "language": language, "temperature": 0.82, "repetition_penalty": 1.08,
        }
        with self.lock:
            proc = self._ensure()
            assert proc.stdin and proc.stdout
            proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
            proc.stdin.flush()
            recent_output: list[str] = []
            while True:
                line = proc.stdout.readline()
                if not line:
                    detail = " | ".join(recent_output[-12:])[-1800:]
                    raise RuntimeError(f"Le worker Qwen s'est arrêté (code {proc.poll()}). {detail}")
                recent_output.append(line.strip())
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("request_id") == request_id and event.get("event") in {"completed", "error"}:
                    if not event.get("ok"):
                        raise RuntimeError(event.get("error") or "Erreur Qwen")
                    return event

    def shutdown(self) -> None:
        with self.lock:
            if not self.process or self.process.poll() is not None:
                return
            try:
                assert self.process.stdin
                self.process.stdin.write(json.dumps({"cmd": "shutdown", "request_id": "shutdown"}) + "\n")
                self.process.stdin.flush()
                self.process.wait(timeout=8)
            except Exception:
                self.process.terminate()
            finally:
                self.process = None


qwen = QwenWorker()


class OmniVoiceWorker:
    """Bridge to DubRoom's isolated OmniVoice runtime and persistent CUDA worker."""

    def __init__(self) -> None:
        self.lock = threading.Lock()

    def generate(
        self,
        text: str,
        language: str,
        output: Path,
        voice: dict[str, Any],
    ) -> dict[str, Any]:
        if not runtime.omnivoice_ready():
            raise RuntimeError("Runtime OmniVoice HQ local incomplet")
        if "omnivoice" not in voice.get("engines", []):
            raise RuntimeError(f"La voix {voice.get('name') or voice.get('id')} n'est pas disponible dans OmniVoice")
        output.parent.mkdir(parents=True, exist_ok=True)
        request_path = output.parent / f".omnivoice-{uuid.uuid4().hex}.json"
        log_path = request_path.with_suffix(".log")
        request_payload = {
            "family": "omnivoice",
            "variant": "clone",
            "model_root": str(runtime.OMNIVOICE_MODEL_ROOT),
            "output_path": str(output),
            "text": text,
            "language": language,
            "num_step": 12,
            "speed": 1.05,
            "sample": {
                "path": str(voice["reference_path"]),
                "reference_text": str(voice["reference_text"]),
                "prompt_cache_path": str(voice["omnivoice_prompt_path"]),
            },
        }
        request_path.write_text(json.dumps(request_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        env = os.environ.copy()
        env.update({
            "PYTHONIOENCODING": "utf-8",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_HOME": str(runtime.DUBROOM / "data/cache/huggingface"),
            "DUBROOM_OMNIVOICE_IDLE_TIMEOUT": "3600",
        })
        try:
            with self.lock:
                # Redirect to a real file instead of PIPE. On Windows, CUDA/model
                # children can keep an inherited pipe open after the CLI exits,
                # which would make communicate() wait until the daemon timeout.
                with log_path.open("w", encoding="utf-8", errors="replace") as log_file:
                    completed = subprocess.run(
                        [str(runtime.OMNIVOICE_PYTHON), str(runtime.OMNIVOICE_WORKER), "--request", str(request_path)],
                        cwd=str(runtime.DUBROOM), env=env, stdout=log_file, stderr=subprocess.STDOUT,
                        text=True, timeout=1800,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    )
            output_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
            events: list[dict[str, Any]] = []
            for line in output_text.splitlines():
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    events.append(value)
            result = next((event for event in reversed(events) if event.get("status") == "completed"), None)
            if completed.returncode != 0 or not result:
                detail = (output_text or "Erreur OmniVoice inconnue")[-2400:]
                raise RuntimeError(f"OmniVoice a échoué : {detail}")
            return result
        finally:
            request_path.unlink(missing_ok=True)
            try:
                log_path.unlink(missing_ok=True)
            except PermissionError:
                # The first detached Windows daemon may briefly inherit the
                # startup log handle. It is a tiny diagnostic file and can be
                # removed by the normal project-cache cleanup later.
                pass


omnivoice = OmniVoiceWorker()

EXPORT_PRESETS = {
    "youtube_1080p": {"name": "YouTube 1080p", "description": "H.264 NVENC, excellente compatibilité", "codec": "h264_nvenc", "preset": "p5", "quality": ["-cq", "19"], "audio": "192k"},
    "fast_preview": {"name": "Aperçu rapide", "description": "Encodage GPU prioritaire, fichier léger", "codec": "h264_nvenc", "preset": "p1", "quality": ["-cq", "25"], "audio": "128k"},
    "compact_hevc": {"name": "Compact HEVC", "description": "Taille réduite, qualité élevée", "codec": "hevc_nvenc", "preset": "p5", "quality": ["-cq", "26"], "audio": "160k"},
    "archive_master": {"name": "Master archive", "description": "HEVC haute qualité pour conservation", "codec": "hevc_nvenc", "preset": "p7", "quality": ["-cq", "17"], "audio": "256k"},
}

TASKS: dict[str, dict[str, dict[str, Any]]] = {}
TASK_LOCK = threading.Lock()


def task_update(project_id: str, kind: str, **changes: Any) -> dict[str, Any]:
    with TASK_LOCK:
        task = TASKS.setdefault(project_id, {}).setdefault(kind, {
            "kind": kind, "state": "queued", "progress": 0, "current": 0, "total": 0,
            "message": "En attente", "started_at": time.time(), "elapsed_seconds": 0, "eta_seconds": None,
        })
        task.update(changes)
        elapsed = max(0.0, time.time() - float(task.get("started_at") or time.time()))
        task["elapsed_seconds"] = round(elapsed, 1)
        current, total = int(task.get("current") or 0), int(task.get("total") or 0)
        if task.get("state") == "running" and current and total > current:
            task["eta_seconds"] = round(elapsed / current * (total - current), 1)
        elif task.get("state") in {"done", "failed"}:
            task["eta_seconds"] = 0
        return dict(task)


def task_start(project_id: str, kind: str, runner, *args: Any) -> dict[str, Any]:
    with TASK_LOCK:
        current = TASKS.get(project_id, {}).get(kind)
        if current and current.get("state") in {"queued", "running"}:
            raise HTTPException(409, f"La tâche {kind} est déjà en cours")
    task_update(project_id, kind, state="queued", progress=0, current=0, total=0, message="Mise en file", started_at=time.time(), error=None)

    def target() -> None:
        task_update(project_id, kind, state="running", message="Démarrage")
        try:
            result = runner(project_id, *args)
            task_update(project_id, kind, state="done", progress=100, message="Terminé", result=result)
        except Exception as exc:
            task_update(project_id, kind, state="failed", message="Échec", error=str(exc))

    threading.Thread(target=target, name=f"manhwa-{kind}-{project_id}", daemon=True).start()
    return task_update(project_id, kind)


def run_ffmpeg_progress(command: list[str], duration: float, callback) -> None:
    progress_command = [*command[:-1], "-progress", "pipe:1", "-nostats", command[-1]]
    process = subprocess.Popen(
        progress_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert process.stdout
    tail: list[str] = []
    for raw in process.stdout:
        line = raw.strip()
        tail.append(line)
        if line.startswith(("out_time_us=", "out_time_ms=")):
            try:
                seconds = int(line.split("=", 1)[1]) / 1_000_000
                callback(min(1.0, seconds / max(duration, 0.05)))
            except ValueError:
                pass
    if process.wait() != 0:
        raise subprocess.CalledProcessError(process.returncode, progress_command, output="\n".join(tail[-80:]))


@app.get("/api/export-presets")
def export_presets() -> dict:
    return {key: {k: v for k, v in value.items() if k not in {"codec", "quality", "audio", "preset"}} for key, value in EXPORT_PRESETS.items()}


@app.get("/api/projects/{project_id}/tasks")
def project_tasks(project_id: str) -> dict:
    core.read_project(project_id)
    with TASK_LOCK:
        tasks = {key: dict(value) for key, value in TASKS.get(project_id, {}).items()}
    for task in tasks.values():
        if task.get("state") == "running":
            elapsed = max(0.0, time.time() - float(task.get("started_at") or time.time()))
            task["elapsed_seconds"] = round(elapsed, 1)
            current, total = int(task.get("current") or 0), int(task.get("total") or 0)
            if current and total > current:
                task["eta_seconds"] = round(elapsed / current * (total - current), 1)
    return tasks


@app.get("/", response_class=HTMLResponse)
def home() -> FileResponse:
    return FileResponse(WEB / "index.html")


@app.get("/api/runtime")
def runtime_status() -> dict:
    return runtime.status()


@app.get("/api/voices")
def voices() -> dict:
    return runtime.load_voices()


@app.get("/api/voices/{voice_id}/sample")
def voice_sample(voice_id: str) -> FileResponse:
    voice = next((item for item in runtime.load_voices()["voices"] if item["id"] == voice_id), None)
    if not voice:
        raise HTTPException(404, "Voix introuvable")
    path = Path(str(voice.get("reference_path") or ""))
    if not path.is_file():
        raise HTTPException(404, "Extrait vocal introuvable")
    return FileResponse(path, media_type="audio/wav", filename=f"{voice_id}.wav")


@app.get("/api/projects")
def projects() -> list[dict[str, Any]]:
    return core.list_projects()


@app.post("/api/projects")
def project_create(payload: dict = Body(...)) -> dict:
    engine = str(payload.get("tts_engine") or "qwen").strip().lower()
    if engine not in {"qwen", "omnivoice"}:
        raise HTTPException(400, "Moteur TTS inconnu")
    voice_id = str(payload.get("voice_id") or "") or None
    voice = runtime.voice_profile(voice_id)
    if engine not in voice.get("engines", ["qwen"]):
        raise HTTPException(400, "Cette voix n'est pas disponible avec le moteur sélectionné")
    return core.create_project(
        str(payload.get("title") or "Nouveau projet"),
        str(payload.get("target_language") or "fr"),
        voice_id,
        engine,
    )


@app.patch("/api/projects/{project_id}")
def project_update(project_id: str, payload: dict = Body(...)) -> dict:
    project = core.read_project(project_id)
    engine = str(payload.get("tts_engine", project.get("tts_engine") or "qwen")).strip().lower()
    if engine not in {"qwen", "omnivoice"}:
        raise HTTPException(400, "Moteur TTS inconnu")
    voice_id = str(payload.get("voice_id", project.get("voice_id") or ""))
    valid = {v["id"]: v for v in runtime.load_voices()["voices"]}
    if voice_id not in valid:
        raise HTTPException(400, "Voix inconnue")
    if engine not in valid[voice_id].get("engines", ["qwen"]):
        raise HTTPException(400, "Cette voix n'est pas disponible avec le moteur sélectionné")
    project["tts_engine"] = engine
    project["voice_id"] = voice_id
    return core.write_project(project)


@app.get("/api/projects/{project_id}")
def project_get(project_id: str) -> dict:
    try:
        return core.read_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Projet introuvable")


@app.get("/api/projects/{project_id}/source-media")
def project_source_media(project_id: str) -> FileResponse:
    project = core.read_project(project_id)
    path = Path(str(project.get("source") or ""))
    if not path.is_file():
        raise HTTPException(404, "Vidéo source introuvable")
    media_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
    }
    # Do not set filename here: that adds Content-Disposition: attachment,
    # which prevents Edge WebView's <video> element from treating the route as
    # an inline seekable media stream.
    return FileResponse(path, media_type=media_types.get(path.suffix.lower(), "application/octet-stream"))


@app.delete("/api/projects/{project_id}")
def project_delete(project_id: str) -> dict:
    folder = core.project_dir(project_id)
    if not (folder / "project.json").is_file():
        raise HTTPException(404, "Projet introuvable")
    shutil.rmtree(folder)
    return {"ok": True}


@app.post("/api/projects/{project_id}/source")
async def upload_source(project_id: str, request: Request, x_filename: str = Header("source.mp4")) -> dict:
    project = core.read_project(project_id)
    x_filename = unquote(x_filename)
    suffix = Path(x_filename).suffix.lower()
    if suffix not in {".mp4", ".mkv", ".mov", ".webm", ".avi"}:
        raise HTTPException(400, "Format vidéo non pris en charge")
    target = core.project_dir(project_id) / "source" / f"original{suffix}"
    with target.open("wb") as handle:
        async for chunk in request.stream():
            handle.write(chunk)
    info = core.ffprobe(target)
    project.update({"source": str(target), **info, "status": "imported", "progress": 12})
    return core.write_project(project)


@app.post("/api/projects/{project_id}/source-url")
def import_url(project_id: str, payload: dict = Body(...)) -> dict:
    project = core.read_project(project_id)
    url = str(payload.get("url") or "").strip()
    if not url.startswith(("https://", "http://")):
        raise HTTPException(400, "URL invalide")
    output = core.project_dir(project_id) / "source" / "original.%(ext)s"
    cmd = [str(runtime.YTDLP), "--no-playlist", "-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", str(output), url]
    try:
        subprocess.run(cmd, check=True, timeout=3600)
    except (subprocess.SubprocessError, OSError) as exc:
        raise HTTPException(500, f"Import YouTube impossible: {exc}")
    target = next((p for p in output.parent.glob("original.*") if p.is_file()), None)
    if not target:
        raise HTTPException(500, "yt-dlp n'a produit aucun fichier")
    info = core.ffprobe(target)
    project.update({"source": str(target), "source_url": url, **info, "status": "imported", "progress": 12})
    return core.write_project(project)


def analyze_project(project_id: str) -> dict:
    project = core.read_project(project_id)
    source = Path(project.get("source") or "")
    if not source.is_file():
        raise HTTPException(400, "Importez d'abord une vidéo")
    folder = core.project_dir(project_id)
    audio = folder / "cache" / "source_16k.wav"
    task_update(project_id, "analyze", progress=4, message="Extraction de l’audio", current=0, total=100)
    subprocess.run([str(runtime.FFMPEG), "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio)], check=True, capture_output=True, timeout=600)
    task_update(project_id, "analyze", progress=12, message="Analyse visuelle")
    scenes = core.analyze_visual(
        source, folder / "previews", float(project.get("duration") or 0),
        lambda ratio, message: task_update(project_id, "analyze", progress=12 + round(ratio * 38), current=12 + round(ratio * 38), message=message),
    )
    transcript: list[dict[str, Any]] = []
    asr_error = None
    if runtime.status()["asr"]["ready"]:
        task_update(project_id, "analyze", progress=52, current=52, message="Transcription Faster-Whisper")
        req = {"audio": str(audio), "model": str(runtime.ASR_MODEL), "device": "cuda", "compute_type": "float16", "language": None}
        try:
            asr_env = os.environ.copy()
            asr_env["PYTHONIOENCODING"] = "utf-8"
            proc = subprocess.run(
                [str(runtime.ASR_PYTHON), str(BASE / "asr_worker.py")], input=json.dumps(req), capture_output=True,
                text=True, encoding="utf-8", errors="replace", timeout=7200,
                env=asr_env,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            result = json.loads(proc.stdout.strip().splitlines()[-1])
            transcript = result.get("segments", [])
            project["source_language"] = result.get("language", "auto")
            if not result.get("ok"):
                asr_error = result.get("error")
        except Exception as exc:
            asr_error = str(exc)
    project["segments"] = core.build_segments(scenes, transcript)
    task_update(project_id, "analyze", progress=96, current=96, message="Construction de la timeline")
    project.update({"status": "analyzed", "progress": 38, "scene_count": len(scenes), "asr_error": asr_error})
    (folder / "transcript" / "transcript.json").write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
    return core.write_project(project)


@app.post("/api/projects/{project_id}/analyze")
def analyze(project_id: str) -> dict:
    return analyze_project(project_id)


@app.post("/api/projects/{project_id}/tasks/analyze")
def analyze_task(project_id: str) -> dict:
    project = core.read_project(project_id)
    if not Path(project.get("source") or "").is_file():
        raise HTTPException(400, "Importez d'abord une vidéo")
    return task_start(project_id, "analyze", analyze_project)


@app.get("/api/projects/{project_id}/frames/{name}")
def frame(project_id: str, name: str) -> FileResponse:
    if not name.replace("_", "").replace(".", "").isalnum():
        raise HTTPException(400, "Nom invalide")
    path = core.project_dir(project_id) / "previews" / name
    if not path.is_file():
        project = core.read_project(project_id)
        segment = next((s for s in project.get("segments", []) if s.get("frame") == name), None)
        source = Path(project.get("source") or "")
        if segment and source.is_file():
            path.parent.mkdir(parents=True, exist_ok=True)
            midpoint = (float(segment.get("video_start") or 0) + float(segment.get("video_end") or 0)) / 2
            subprocess.run(
                [str(runtime.FFMPEG), "-y", "-ss", f"{midpoint:.3f}", "-i", str(source), "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", str(path)],
                check=True, capture_output=True, timeout=45,
            )
        if not path.is_file():
            raise HTTPException(404, "Image introuvable")
    return FileResponse(path)


@app.get("/api/projects/{project_id}/script-pack")
def export_script_pack(project_id: str) -> JSONResponse:
    project = core.read_project(project_id)
    payload = core.script_pack(project)
    path = core.project_dir(project_id) / "script" / "chatgpt_script_pack.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{project_id}_script_pack.json"'})


@app.post("/api/projects/{project_id}/script")
def import_script(project_id: str, payload: dict = Body(...)) -> dict:
    project = core.read_project(project_id)
    incoming = {str(s.get("id")): s for s in payload.get("segments", []) if isinstance(s, dict)}
    validation = {"accepted": 0, "over_budget": [], "missing": []}
    for segment in project.get("segments", []):
        item = incoming.get(segment["id"], {})
        rewritten = str(item.get("rewritten_text") or item.get("script") or item.get("text") or segment.get("rewritten_text") or "").strip()
        segment["rewritten_text"] = rewritten
        budget = max(1, int(float(segment.get("original_duration") or 0) * float(project.get("tts_words_per_second") or 2.20)))
        count = len(re.findall(r"\b[\wÀ-ÿ'-]+\b", rewritten))
        segment["script_word_count"] = count
        segment["script_word_budget"] = budget
        if not rewritten:
            validation["missing"].append(segment["id"])
        elif count > budget:
            validation["over_budget"].append({"id": segment["id"], "words": count, "budget": budget})
        else:
            validation["accepted"] += 1
    project["script_validation"] = validation
    project.update({"status": "script_ready", "progress": 55})
    (core.project_dir(project_id) / "script" / "final.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return core.write_project(project)


@app.patch("/api/projects/{project_id}/segments/{segment_id}")
def segment_update(project_id: str, segment_id: str, payload: dict = Body(...)) -> dict:
    project = core.read_project(project_id)
    segment = next((s for s in project.get("segments", []) if s["id"] == segment_id), None)
    if not segment:
        raise HTTPException(404, "Segment introuvable")
    for key in ("rewritten_text", "transition"):
        if key in payload:
            segment[key] = payload[key]
    segment["sync"] = core.solve_segment(segment)
    core.write_project(project)
    return segment


def generate_segment_audio(project: dict[str, Any], segment: dict[str, Any]) -> dict[str, Any]:
    project_id = project["id"]
    text = str(segment.get("rewritten_text") or segment.get("transcript") or "").strip()
    if not text:
        raise ValueError(f"{segment['id']} ne contient aucun texte")
    output = core.project_dir(project_id) / "tts" / f"{segment['id']}.wav"
    engine = str(project.get("tts_engine") or "qwen")
    voice_id = project.get("voice_id")
    if engine == "omnivoice":
        result = omnivoice.generate(
            text, project.get("target_language", "fr"), output, runtime.voice_profile(voice_id),
        )
    else:
        result = qwen.generate(
            text, project.get("target_language", "fr"), output, runtime.voice_prompt(voice_id),
        )
    raw_duration = float(result["duration"])
    limit = max(0.05, float(segment.get("original_duration") or raw_duration))
    segment["tts_raw_duration"] = raw_duration
    segment["tts_time_fit_rate"] = 1.0
    if raw_duration > limit + 0.03:
        rate = raw_duration / limit
        filters = []
        remaining = rate
        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2.0
        filters.append(f"atempo={remaining:.6f}")
        fitted = output.with_name(output.stem + ".fitted.wav")
        subprocess.run([str(runtime.FFMPEG), "-y", "-i", str(output), "-filter:a", ",".join(filters), str(fitted)], check=True, capture_output=True, timeout=300)
        fitted.replace(output)
        segment["tts_time_fit_rate"] = round(rate, 3)
        segment["tts_duration"] = min(limit, float(core.ffprobe(output)["duration"]))
    else:
        segment["tts_duration"] = raw_duration
    segment["tts_path"] = str(output)
    segment["tts_engine"] = engine
    segment["tts_voice_id"] = voice_id
    segment["sync"] = core.solve_segment(segment)
    return segment


@app.post("/api/projects/{project_id}/segments/{segment_id}/tts")
def segment_tts(project_id: str, segment_id: str) -> dict:
    project = core.read_project(project_id)
    engine = str(project.get("tts_engine") or "qwen")
    engine_status = runtime.status()["tts"]["engines"].get(engine, {})
    if not engine_status.get("ready"):
        raise HTTPException(503, f"Runtime {engine_status.get('name') or engine} local incomplet")
    segment = next((s for s in project.get("segments", []) if s["id"] == segment_id), None)
    if not segment:
        raise HTTPException(404, "Segment introuvable")
    try:
        generate_segment_audio(project, segment)
    except Exception as exc:
        raise HTTPException(500, str(exc))
    project.update({"status": "tts", "progress": max(68, int(project.get("progress", 0)))})
    core.write_project(project)
    return segment


def generate_all_tts(project_id: str, force: bool = False) -> dict:
    project = core.read_project(project_id)
    engine = str(project.get("tts_engine") or "qwen")
    engine_status = runtime.status()["tts"]["engines"].get(engine, {})
    if not engine_status.get("ready"):
        raise RuntimeError(f"Runtime {engine_status.get('name') or engine} local incomplet")
    voice_id = project.get("voice_id")
    candidates = [
        s for s in project.get("segments", [])
        if force
        or not Path(s.get("tts_path") or "").is_file()
        or s.get("tts_engine") != engine
        or s.get("tts_voice_id") != voice_id
    ]
    if not candidates:
        return {"generated": 0, "total": 0}
    started = time.perf_counter()
    generated_seconds = 0.0
    for index, segment in enumerate(candidates, 1):
        engine_name = str(engine_status.get("name") or engine)
        task_update(project_id, "tts", state="running", current=index - 1, total=len(candidates), progress=round((index - 1) / len(candidates) * 100), message=f"{engine_name} · {segment['id']} ({index}/{len(candidates)})")
        generate_segment_audio(project, segment)
        generated_seconds += float(segment.get("tts_duration") or 0)
        core.write_project(project)
        task_update(project_id, "tts", current=index, total=len(candidates), progress=round(index / len(candidates) * 100), message=f"Voix générées : {index}/{len(candidates)}")
    elapsed = max(0.001, time.perf_counter() - started)
    project["tts_benchmark"] = {
        "audio_seconds": round(generated_seconds, 3), "generation_seconds": round(elapsed, 3),
        "realtime_factor": round(generated_seconds / elapsed, 3),
        "estimated_minutes_for_one_hour": round(60.0 / max(generated_seconds / elapsed, 0.001), 1),
        "engine": engine_status.get("name") or engine,
        "engine_id": engine,
        "voice_id": voice_id,
    }
    project.update({"status": "tts", "progress": 78})
    core.write_project(project)
    return {"generated": len(candidates), **project["tts_benchmark"]}


@app.post("/api/projects/{project_id}/tasks/tts")
def tts_task(project_id: str, payload: dict = Body(default={})) -> dict:
    core.read_project(project_id)
    return task_start(project_id, "tts", generate_all_tts, bool(payload.get("force")))


@app.post("/api/projects/{project_id}/solve")
def solve(project_id: str) -> dict:
    project = core.read_project(project_id)
    for segment in project.get("segments", []):
        segment["sync"] = core.solve_segment(segment)
    project.update({"status": "review", "progress": 86})
    (core.project_dir(project_id) / "timeline" / "timeline.json").write_text(json.dumps(project["segments"], ensure_ascii=False, indent=2), encoding="utf-8")
    return core.write_project(project)


@app.get("/api/projects/{project_id}/audio/{segment_id}")
def audio(project_id: str, segment_id: str) -> FileResponse:
    path = core.project_dir(project_id) / "tts" / f"{segment_id}.wav"
    if not path.is_file():
        raise HTTPException(404, "Audio introuvable")
    return FileResponse(path, media_type="audio/wav")


def export_project(project_id: str, preset_id: str = "youtube_1080p") -> dict:
    project = core.read_project(project_id)
    source = Path(project.get("source") or "")
    if not source.is_file():
        raise HTTPException(400, "Source absente")
    # V1 safe path: preserve source video and replace with a contiguous TTS master when every segment exists.
    wavs = [Path(s.get("tts_path") or "") for s in project.get("segments", [])]
    if not wavs or any(not p.is_file() for p in wavs):
        raise HTTPException(400, "Générez l'audio de tous les segments avant l'export")
    blocked = [s["id"] for s in project.get("segments", []) if s.get("sync", {}).get("status") not in {"ideal", "tolerable"}]
    if blocked:
        raise HTTPException(400, "Réécrivez les segments hors fenêtre avant l'export: " + ", ".join(blocked[:8]))
    folder = core.project_dir(project_id)
    preset = EXPORT_PRESETS.get(preset_id)
    if not preset:
        raise ValueError(f"Preset d'export inconnu : {preset_id}")
    task_update(project_id, "export", progress=5, current=5, total=100, message="Assemblage de la narration")
    concat = folder / "cache" / "tts_concat.txt"
    concat.write_text("\n".join("file '" + p.as_posix().replace("'", "'\\''") + "'" for p in wavs), encoding="utf-8")
    master = folder / "cache" / "tts_master.wav"
    subprocess.run([str(runtime.FFMPEG), "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c:a", "pcm_s16le", str(master)], check=True, capture_output=True, timeout=900)
    output = folder / "export" / f"{project_id}_{preset_id}.mp4"
    codec = str(preset["codec"])
    filters = []
    video_inputs = []
    for index, segment in enumerate(project["segments"]):
        start, end = float(segment["video_start"]), float(segment["video_end"])
        video_duration = max(0.05, end - start)
        audio_duration = max(0.05, float(segment.get("tts_duration") or video_duration))
        # Every visual segment must end with its own WAV. A globally concatenated
        # audio track combined with a clamped speed used to truncate the final
        # narration through -shortest whenever French was longer than English.
        exact_speed = video_duration / audio_duration
        filters.append(f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=(PTS-STARTPTS)/{exact_speed:.9f}[v{index}]")
        video_inputs.append(f"[v{index}]")
    filters.append("".join(video_inputs) + f"concat=n={len(video_inputs)}:v=1:a=0[vout]")
    task_update(project_id, "export", progress=22, current=22, total=100, message=f"Encodage · {preset['name']}")
    cmd = [str(runtime.FFMPEG), "-y", "-i", str(source), "-i", str(master), "-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "1:a:0", "-c:v", codec, "-preset", str(preset["preset"]), *preset["quality"], "-c:a", "aac", "-b:a", str(preset["audio"]), "-shortest", str(output)]
    try:
        expected_duration = sum(float(s.get("tts_duration") or s.get("original_duration") or 0) for s in project["segments"])
        run_ffmpeg_progress(cmd, expected_duration, lambda ratio: task_update(project_id, "export", progress=22 + round(ratio * 70), current=22 + round(ratio * 70), total=100, message=f"Encodage · {preset['name']}"))
    except subprocess.CalledProcessError:
        cmd[cmd.index(codec)] = "libx264"
        preset_index = cmd.index("-preset") + 1
        cmd[preset_index] = "medium"
        if "-cq" in cmd:
            cmd[cmd.index("-cq")] = "-crf"
        run_ffmpeg_progress(cmd, expected_duration, lambda ratio: task_update(project_id, "export", progress=22 + round(ratio * 70), current=22 + round(ratio * 70), total=100, message="Encodage CPU de secours"))
    task_update(project_id, "export", progress=94, current=94, total=100, message="Vérification du fichier")
    probe = core.ffprobe(output)
    project.update({"status": "done", "progress": 100, "last_export": str(output), "last_export_preset": preset_id, "last_export_info": probe})
    core.clean_cache(folder)
    core.write_project(project)
    return {"ok": True, "path": str(output), "preset": preset_id, "duration": probe.get("duration")}


@app.post("/api/projects/{project_id}/export")
def export_video(project_id: str, payload: dict = Body(default={})) -> dict:
    preset_id = str(payload.get("preset") or ("compact_hevc" if payload.get("compact") else "youtube_1080p"))
    return export_project(project_id, preset_id)


@app.post("/api/projects/{project_id}/tasks/export")
def export_task(project_id: str, payload: dict = Body(default={})) -> dict:
    core.read_project(project_id)
    preset_id = str(payload.get("preset") or "youtube_1080p")
    if preset_id not in EXPORT_PRESETS:
        raise HTTPException(400, "Preset d'export inconnu")
    return task_start(project_id, "export", export_project, preset_id)


@app.post("/api/projects/{project_id}/cleanup")
def cleanup(project_id: str) -> dict:
    folder = core.project_dir(project_id)
    if not (folder / "project.json").is_file():
        raise HTTPException(404, "Projet introuvable")
    return {"ok": True, "removed": core.clean_cache(folder)}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
