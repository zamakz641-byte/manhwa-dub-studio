from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
import wave
import asyncio
import hashlib
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

    def initialize(self) -> dict[str, Any]:
        """Load Qwen once and leave the worker/model resident for the batch."""
        request_id = uuid.uuid4().hex
        payload = {"cmd": "init", "request_id": request_id, "model_path": str(runtime.QWEN_MODEL)}
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
                if event.get("request_id") == request_id and event.get("event") in {"ready", "error"}:
                    if not event.get("ok"):
                        raise RuntimeError(event.get("error") or "Erreur d'initialisation Qwen")
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
        speed: float = 1.05,
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
            "speed": max(0.8, min(1.3, float(speed))),
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


class SupertonicWorker:
    """Persistent Supertonic 3 CUDA worker using the isolated ONNX environment."""

    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.lock = threading.Lock()

    def _ensure(self) -> subprocess.Popen[str]:
        if self.process and self.process.poll() is None:
            return self.process
        env = os.environ.copy()
        env.update({"PYTHONIOENCODING": "utf-8", "HF_HUB_OFFLINE": "1"})
        env["PATH"] = str(runtime.SUPERTONIC_CUDA_LIBS) + os.pathsep + env.get("PATH", "")
        self.process = subprocess.Popen(
            [str(runtime.SUPERTONIC_PYTHON), "-u", str(runtime.SUPERTONIC_WORKER)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", errors="replace", env=env,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return self.process

    def _request(self, payload: dict[str, Any], expected: set[str]) -> dict[str, Any]:
        request_id = uuid.uuid4().hex
        payload["request_id"] = request_id
        proc = self._ensure()
        assert proc.stdin and proc.stdout
        proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        recent: list[str] = []
        while True:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError(f"Le worker Supertonic s'est arrêté (code {proc.poll()}). {' | '.join(recent[-8:])[-1800:]}")
            recent.append(line.strip())
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("request_id") == request_id and event.get("event") in expected | {"error"}:
                if not event.get("ok"):
                    raise RuntimeError(event.get("error") or "Erreur Supertonic")
                return event

    def initialize(self) -> dict[str, Any]:
        with self.lock:
            return self._request({"cmd": "init", "model_path": str(runtime.SUPERTONIC_MODEL_ROOT)}, {"ready"})

    def generate(self, text: str, language: str, output: Path, voice: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            return self._request({
                "cmd": "generate", "model_path": str(runtime.SUPERTONIC_MODEL_ROOT),
                "output_path": str(output), "text": text, "language": language,
                "voice": str(voice.get("supertonic_voice") or "M5"),
                "total_steps": 16, "speed": 1.2,
            }, {"completed"})

    def shutdown(self) -> None:
        with self.lock:
            if not self.process or self.process.poll() is not None:
                return
            try:
                self._request({"cmd": "shutdown"}, {"shutdown"})
                self.process.wait(timeout=5)
            except Exception:
                self.process.terminate()
            finally:
                self.process = None


supertonic = SupertonicWorker()

EXPORT_PRESETS = {
    "recap_1080p": {"name": "Recap manhwa 1080p", "description": "30 fps · H.264 NVENC · qualité élevée et poids raisonnable (recommandé)", "codec": "h264_nvenc", "preset": "p5", "quality": ["-cq", "23"], "audio": "192k", "fps": 30},
    "youtube_1080p": {"name": "YouTube 1080p60", "description": "60 fps · H.264 NVENC · fichier plus lourd", "codec": "h264_nvenc", "preset": "p5", "quality": ["-cq", "19"], "audio": "192k", "fps": 60},
    "fast_preview": {"name": "Aperçu rapide", "description": "30 fps · encodage GPU rapide et fichier léger", "codec": "h264_nvenc", "preset": "p1", "quality": ["-cq", "27"], "audio": "128k", "fps": 30},
    "compact_hevc": {"name": "Compact HEVC", "description": "30 fps · taille minimale et qualité élevée", "codec": "hevc_nvenc", "preset": "p5", "quality": ["-cq", "26"], "audio": "160k", "fps": 30},
    "archive_master": {"name": "Master archive", "description": "30 fps · HEVC haute qualité pour conservation", "codec": "hevc_nvenc", "preset": "p7", "quality": ["-cq", "17"], "audio": "256k", "fps": 30},
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
    if engine not in {"qwen", "omnivoice", "supertonic"}:
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
    if engine not in {"qwen", "omnivoice", "supertonic"}:
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
    temporary = target.with_suffix(target.suffix + ".uploading")
    try:
        with temporary.open("wb") as handle:
            async for chunk in request.stream():
                if chunk:
                    handle.write(chunk)
        os.replace(temporary, target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    # ffprobe is a blocking subprocess. Keep it away from the async server
    # loop so runtime/task polling remains responsive after a large upload.
    info = await asyncio.to_thread(core.ffprobe, target)
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
        subprocess.run(
            cmd, check=True, timeout=3600,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
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
    subprocess.run(
        [str(runtime.FFMPEG), "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio)],
        check=True, capture_output=True, timeout=600,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
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
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
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
    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        raise HTTPException(400, "JSON invalide : la clé 'segments' doit contenir une liste")
    if not project.get("segments"):
        raise HTTPException(400, "Ce projet ne contient aucun segment. Lancez d'abord l'analyse vidéo")
    incoming = {
        str(item.get("id")): item
        for item in raw_segments
        if isinstance(item, dict) and item.get("id") is not None
    }
    known_ids = {str(segment.get("id")) for segment in project.get("segments", [])}
    matched_ids = known_ids.intersection(incoming)
    if not matched_ids:
        raise HTTPException(
            400,
            "Aucun identifiant du JSON ne correspond aux segments de ce projet",
        )
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
    spoken_text = core.apply_pronunciation_lexicon(text, project.get("pronunciation_lexicon"))
    output = core.project_dir(project_id) / "tts" / f"{segment['id']}.wav"
    engine = str(project.get("tts_engine") or "qwen")
    voice_id = project.get("voice_id")
    if engine == "supertonic":
        result = supertonic.generate(
            spoken_text, project.get("target_language", "fr"), output, runtime.voice_profile(voice_id),
        )
        segment["tts_audio_cleanup"] = core.condition_supertonic_wav(output)
    elif engine == "omnivoice":
        result = omnivoice.generate(
            spoken_text, project.get("target_language", "fr"), output, runtime.voice_profile(voice_id),
        )
        cleanup = core.condition_omnivoice_wav(output)
        regenerated = False
        if cleanup.get("regenerate_recommended"):
            # One retry only: a persistent issue must remain visible for review
            # instead of trapping a long batch in an infinite retry loop.
            result = omnivoice.generate(
                spoken_text, project.get("target_language", "fr"), output, runtime.voice_profile(voice_id),
            )
            cleanup = core.condition_omnivoice_wav(output)
            regenerated = True
        cleanup["regenerated_once"] = regenerated
        segment["tts_audio_cleanup"] = cleanup
    else:
        result = qwen.generate(
            spoken_text, project.get("target_language", "fr"), output, runtime.voice_prompt(voice_id),
        )
        segment.pop("tts_audio_cleanup", None)
    raw_duration = float(core.ffprobe(output)["duration"])
    segment["tts_raw_duration"] = raw_duration
    segment["tts_time_fit_rate"] = 1.0
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
        or abs(float(s.get("tts_time_fit_rate") or 1.0) - 1.0) > 0.001
    ]
    if not candidates:
        return {"generated": 0, "total": 0}
    if engine == "qwen":
        task_update(
            project_id, "tts", state="running", current=0, total=len(candidates), progress=1,
            message="Chargement de FasterQwen sur le GPU · le modèle restera en VRAM",
        )
        qwen_info = qwen.initialize()
        load_note = f"chargé en {qwen_info.get('load_seconds')} s" if qwen_info.get("cold") else "déjà chaud"
        task_update(
            project_id, "tts", state="running", current=0, total=len(candidates), progress=2,
            message=f"CUDA {qwen_info.get('dtype', 'BF16')} prêt · {load_note} · graphes au premier segment",
        )
    elif engine == "supertonic":
        task_update(
            project_id, "tts", state="running", current=0, total=len(candidates), progress=1,
            message="Chargement de Supertonic 3 sur le GPU · M1/M5 · 16 steps",
        )
        info = supertonic.initialize()
        load_note = f"chargé en {info.get('load_seconds')} s" if info.get("cold") else "déjà chaud"
        task_update(
            project_id, "tts", state="running", current=0, total=len(candidates), progress=2,
            message=f"Supertonic CUDA prêt · {load_note} · vitesse 1,2",
        )
    started = time.perf_counter()
    generated_seconds = 0.0
    for index, segment in enumerate(candidates, 1):
        engine_name = str(engine_status.get("name") or engine)
        prefix = "Capture graphes CUDA + " if engine == "qwen" and index == 1 else ""
        progress = max(2 if engine in {"qwen", "supertonic"} else 0, round((index - 1) / len(candidates) * 100))
        task_update(project_id, "tts", state="running", current=index - 1, total=len(candidates), progress=progress, message=f"{prefix}{engine_name} · {segment['id']} ({index}/{len(candidates)})")
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


def export_project(
    project_id: str,
    preset_id: str = "recap_1080p",
    source_limit_seconds: float | None = None,
    output_suffix: str | None = None,
) -> dict:
    project = core.read_project(project_id)
    source = Path(project.get("source") or "")
    if not source.is_file():
        raise HTTPException(400, "Source absente")
    segments = project.get("segments", [])
    if source_limit_seconds is not None:
        limit = max(0.1, float(source_limit_seconds))
        segments = [segment for segment in segments if float(segment.get("video_start") or 0) < limit]
    if not segments:
        raise HTTPException(400, "Aucun segment dans la plage d'export")
    # V1 safe path: preserve source video and replace with a contiguous TTS master when every segment exists.
    wavs = [Path(s.get("tts_path") or "") for s in segments]
    if not wavs or any(not p.is_file() for p in wavs):
        raise HTTPException(400, "Générez l'audio de tous les segments avant l'export")
    folder = core.project_dir(project_id)
    # A manual cache cleanup may remove these transient directories while the
    # project and its generated TTS files remain valid.  Export must therefore
    # recreate its own working/output directories instead of assuming that the
    # project scaffold is still intact.
    (folder / "cache").mkdir(parents=True, exist_ok=True)
    (folder / "export").mkdir(parents=True, exist_ok=True)
    preset = EXPORT_PRESETS.get(preset_id)
    if not preset:
        raise ValueError(f"Preset d'export inconnu : {preset_id}")
    total_segments = len(segments)
    task_update(project_id, "export", progress=2, current=0, total=total_segments, message="Assemblage de la narration")
    concat = folder / "cache" / "tts_concat.txt"
    concat.write_text("\n".join("file '" + p.as_posix().replace("'", "'\\''") + "'" for p in wavs), encoding="utf-8")
    job_key = re.sub(r"[^a-z0-9_-]+", "-", str(output_suffix or preset_id).lower()).strip("-") or preset_id
    master = folder / "cache" / f"tts_master_{job_key}.wav"
    subprocess.run(
        [str(runtime.FFMPEG), "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c:a", "pcm_s16le", str(master)],
        check=True, capture_output=True, timeout=900,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    output = folder / "export" / f"{project_id}_{output_suffix or preset_id}.mp4"
    rendering_output = output.with_name(output.stem + ".rendering.mp4")
    rendering_output.unlink(missing_ok=True)
    requested_codec = str(preset["codec"])
    codec = requested_codec
    encoder_probe = subprocess.run(
        # Recent NVENC drivers reject frames smaller than 145x145.  A 64x64
        # probe therefore produced a false negative and silently forced every
        # export onto libx264/CPU even though the NVIDIA encoder was available.
        [str(runtime.FFMPEG), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=size=320x180:rate=24", "-frames:v", "1", "-c:v", codec, "-f", "null", "-"],
        capture_output=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if encoder_probe.returncode != 0:
        codec = "libx264"
    encoder_preset = str(preset["preset"]) if codec == requested_codec else "medium"
    encoder_quality = list(preset["quality"])
    if codec == "libx264" and "-cq" in encoder_quality:
        encoder_quality[encoder_quality.index("-cq")] = "-crf"
    encoder_label = f"GPU NVIDIA · {codec}" if codec.endswith("_nvenc") else f"CPU · {codec}"
    task_update(
        project_id, "export", progress=4, current=0, total=total_segments,
        message=f"Encodeur sélectionné : {encoder_label}",
    )

    output_fps = max(24.0, min(60.0, float(preset.get("fps") or project.get("fps") or 30.0)))
    segment_cache = folder / "cache" / "video_segments"
    segment_cache.mkdir(parents=True, exist_ok=True)
    rendered_clips: list[Path] = []
    source_signature = f"{source.resolve()}:{source.stat().st_size}:{source.stat().st_mtime_ns}"
    started_render = time.perf_counter()
    cache_hits = 0
    for index, segment in enumerate(segments, 1):
        start, end = float(segment["video_start"]), float(segment["video_end"])
        video_duration = max(0.05, end - start)
        audio_duration = max(0.05, float(segment.get("tts_duration") or video_duration))
        exact_speed = video_duration / audio_duration
        filter_parts = ["setpts=PTS-STARTPTS"]
        if exact_speed < 0.92:
            # Generate enough intermediate frames before stretching the PTS.
            # Full motion-compensated interpolation takes roughly one minute
            # per second at 1080p on this machine; blend is fast and reliable
            # for the mostly static panels/pans found in manhwa recaps.  The
            # compact TTS padding now prevents the extreme 2x slowdowns that
            # were the actual source of the visible judder.
            interpolation_fps = min(120, max(round(output_fps * 2), round(output_fps / max(exact_speed, 0.25))))
            filter_parts.append(f"minterpolate=fps={interpolation_fps}:mi_mode=blend")
        filter_parts.extend([f"setpts=PTS/{exact_speed:.9f}", f"fps={output_fps:.3f}", "format=yuv420p"])
        render_key = hashlib.sha1(
            (source_signature + json.dumps({
                "id": segment.get("id"), "start": start, "end": end,
                "audio": audio_duration, "fps": output_fps, "filter": filter_parts,
                "codec": codec, "preset": encoder_preset, "quality": encoder_quality,
            }, sort_keys=True)).encode("utf-8")
        ).hexdigest()[:16]
        clip = segment_cache / f"{index:04d}-{render_key}.mp4"
        rendered_clips.append(clip)
        if clip.is_file() and clip.stat().st_size > 1024:
            cache_hits += 1
        else:
            partial = clip.with_name(clip.stem + ".part.mp4")
            partial.unlink(missing_ok=True)
            command = [
                str(runtime.FFMPEG), "-y", "-hide_banner", "-loglevel", "error",
                "-ss", f"{start:.6f}", "-t", f"{video_duration:.6f}", "-i", str(source),
                "-an", "-vf", ",".join(filter_parts), "-c:v", codec,
                "-preset", encoder_preset, *encoder_quality,
                "-g", str(max(1, round(output_fps * 2))), "-movflags", "+faststart", str(partial),
            ]
            completed = subprocess.run(
                command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if completed.returncode != 0:
                partial.unlink(missing_ok=True)
                raise RuntimeError(f"Rendu vidéo impossible sur {segment['id']}: {(completed.stderr or completed.stdout)[-1800:]}")
            os.replace(partial, clip)
        progress = 5 + round(index / max(total_segments, 1) * 78)
        elapsed = max(0.001, time.perf_counter() - started_render)
        eta = elapsed / index * (total_segments - index)
        task_update(
            project_id, "export", state="running", progress=progress,
            current=index, total=total_segments, eta_seconds=round(eta, 1),
            message=f"Retime vidéo · {segment['id']} ({index}/{total_segments}) · {encoder_label} · cache {cache_hits}",
        )

    task_update(project_id, "export", progress=85, current=total_segments, total=total_segments, message="Concaténation vidéo sans réencodage")
    video_concat = folder / "cache" / "video_segments_concat.txt"
    video_concat.write_text("\n".join("file '" + p.as_posix().replace("'", "'\\''") + "'" for p in rendered_clips), encoding="utf-8")
    video_master = folder / "cache" / f"video_master_{job_key}.mp4"
    subprocess.run(
        [str(runtime.FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(video_concat), "-an", "-c:v", "copy", "-movflags", "+faststart", str(video_master)],
        check=True, capture_output=True, timeout=1800,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    expected_duration = sum(float(s.get("tts_duration") or s.get("original_duration") or 0) for s in segments)
    # Encoding thousands of individually retimed clips quantizes every cut to a
    # video frame. Those tiny rounding losses accumulate (2.08 s over 1070
    # clips in the real project) and `-shortest` would then cut off narration.
    # Append a frozen copy of the final frame so the video track always covers
    # the complete master audio. Only this very short tail is encoded.
    video_duration = float(core.ffprobe(video_master).get("duration") or 0)
    shortfall = expected_duration - video_duration
    if shortfall > (1.0 / output_fps):
        task_update(
            project_id, "export", progress=88, current=total_segments, total=total_segments,
            message=f"Correction de fin vidéo · {shortfall:.2f} s",
        )
        last_frame = folder / "cache" / f"video_last_frame_{job_key}.png"
        tail_clip = folder / "cache" / f"video_tail_{job_key}.mp4"
        subprocess.run(
            [str(runtime.FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-sseof", "-1", "-i", str(video_master), "-frames:v", "1", "-update", "1", str(last_frame)],
            check=True, capture_output=True, timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        subprocess.run(
            [
                str(runtime.FFMPEG), "-y", "-hide_banner", "-loglevel", "error",
                "-loop", "1", "-framerate", f"{output_fps:.3f}", "-i", str(last_frame),
                "-t", f"{shortfall + (1.0 / output_fps):.6f}", "-an", "-vf", "format=yuv420p",
                "-c:v", codec, "-preset", encoder_preset, *encoder_quality,
                "-g", str(max(1, round(output_fps * 2))), "-movflags", "+faststart", str(tail_clip),
            ],
            check=True, capture_output=True, timeout=300,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        padded_clips = [*rendered_clips, tail_clip]
        video_concat.write_text(
            "\n".join("file '" + p.as_posix().replace("'", "'\\''") + "'" for p in padded_clips),
            encoding="utf-8",
        )
        subprocess.run(
            [str(runtime.FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(video_concat), "-an", "-c:v", "copy", "-movflags", "+faststart", str(video_master)],
            check=True, capture_output=True, timeout=1800,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    task_update(project_id, "export", progress=90, current=total_segments, total=total_segments, message="Multiplexage audio final")
    mux_command = [
        str(runtime.FFMPEG), "-y", "-hide_banner", "-i", str(video_master), "-i", str(master),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
        "-b:a", str(preset["audio"]), "-shortest", "-movflags", "+faststart", str(rendering_output),
    ]
    run_ffmpeg_progress(
        mux_command, expected_duration,
        lambda ratio: task_update(project_id, "export", progress=90 + round(ratio * 8), current=total_segments, total=total_segments, message="Multiplexage audio final"),
    )
    task_update(project_id, "export", progress=99, current=total_segments, total=total_segments, message="Vérification du fichier")
    probe = core.ffprobe(rendering_output)
    if float(probe.get("duration") or 0) < max(1.0, expected_duration - 2.0):
        raise RuntimeError("L'export final est plus court que la narration attendue")
    os.replace(rendering_output, output)
    if output_suffix is None:
        project.update({"status": "done", "progress": 100, "last_export": str(output), "last_export_preset": preset_id, "last_export_info": probe})
    # Keep validated segment renders for fast retries/re-exports. The existing
    # cleanup action remains available when the user explicitly wants the disk
    # space back.
    core.write_project(project)
    return {
        "ok": True, "path": str(output), "preset": preset_id,
        "duration": probe.get("duration"), "segment_count": total_segments,
        "source_limit_seconds": source_limit_seconds,
    }


@app.post("/api/projects/{project_id}/export")
def export_video(project_id: str, payload: dict = Body(default={})) -> dict:
    preset_id = str(payload.get("preset") or ("compact_hevc" if payload.get("compact") else "recap_1080p"))
    return export_project(project_id, preset_id)


@app.post("/api/projects/{project_id}/tasks/export")
def export_task(project_id: str, payload: dict = Body(default={})) -> dict:
    core.read_project(project_id)
    preset_id = str(payload.get("preset") or "recap_1080p")
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
