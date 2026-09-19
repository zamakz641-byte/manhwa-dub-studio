from __future__ import annotations

import difflib
import json
import os
import subprocess
import sys
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / "voices/registry.json").read_text(encoding="utf-8"))
DUBROOM = Path(r"D:\manhwa studio\anime_manga_manhua_dubbing_app")
NARRATOR = Path(r"D:\manhwa studio\NarratorStudio_StoryDub_v1_3")
QWEN_PYTHON = DUBROOM / "data/environments/tts-qwen3-0.6b-base/venv/Scripts/python.exe"
QWEN_MODEL = DUBROOM / "models/tts-qwen3-0.6b-base/model"
QWEN_WORKER = NARRATOR / "qwen_tts_worker.py"
ASR_PYTHON = DUBROOM / "data/environments/faster-whisper-turbo/venv/Scripts/python.exe"
ASR_MODEL = Path(r"C:\Users\USER\.cache\huggingface\hub\models--Systran--faster-whisper-base\snapshots\ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66")
TEXT = "Au sommet de la tour interdite, Kael découvre enfin le secret qui pourrait renverser le royaume. Mais dans l'ombre, son plus grand ennemi l'attend déjà."


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    return " ".join("".join(c if c.isalnum() else " " for c in value).split())


def main() -> int:
    out_dir = ROOT / "work/voice_benchmark"
    out_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update({"PYTHONIOENCODING": "utf-8", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
    proc = subprocess.Popen(
        [str(QWEN_PYTHON), "-u", str(QWEN_WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=env,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert proc.stdin and proc.stdout
    results = []
    for voice in REGISTRY["voices"]:
        output = out_dir / f"{voice['id']}.wav"
        request = {
            "cmd": "generate", "request_id": voice["id"], "model_path": str(QWEN_MODEL),
            "prompt_path": voice["prompt_path"], "output_path": str(output), "text": TEXT,
            "language": "fr", "temperature": 0.82, "repetition_penalty": 1.08,
        }
        proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n"); proc.stdin.flush()
        event = None
        while event is None:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("Worker Qwen arrêté")
            try:
                candidate = json.loads(line)
            except json.JSONDecodeError:
                continue
            if candidate.get("request_id") == voice["id"] and candidate.get("event") in {"completed", "error"}:
                event = candidate
        if not event.get("ok"):
            results.append({"id": voice["id"], "name": voice["name"], "error": event.get("error")})
            continue
        request_asr = {"audio": str(output), "model": str(ASR_MODEL), "device": "cuda", "compute_type": "float16", "language": "fr"}
        asr = subprocess.run(
            [str(ASR_PYTHON), str(ROOT / "asr_worker.py")], input=json.dumps(request_asr), capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=1200,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        decoded = json.loads(asr.stdout.strip().splitlines()[-1])
        transcript = " ".join(s.get("text", "") for s in decoded.get("segments", [])).strip()
        similarity = difflib.SequenceMatcher(None, normalized(TEXT), normalized(transcript)).ratio()
        results.append({"id": voice["id"], "name": voice["name"], "duration": event.get("duration"), "transcript": transcript, "similarity": round(similarity, 4), "audio": str(output)})
        print(json.dumps(results[-1], ensure_ascii=True), flush=True)
    proc.stdin.write(json.dumps({"cmd": "shutdown", "request_id": "shutdown"}) + "\n"); proc.stdin.flush()
    proc.wait(timeout=30)
    results.sort(key=lambda x: x.get("similarity", 0), reverse=True)
    (out_dir / "results.json").write_text(json.dumps({"text": TEXT, "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"best": results[0]["id"], "results_file": str(out_dir / "results.json")}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
