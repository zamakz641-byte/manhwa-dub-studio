from __future__ import annotations

import json
import ctypes
import os
import sys
from pathlib import Path


_DLL_HANDLES = []


def configure_cuda() -> None:
    if os.name != "nt":
        return
    site = Path(sys.prefix) / "Lib" / "site-packages"
    environments = Path(sys.prefix).parent.parent
    candidates = [
        site / "ctranslate2",
        site / "nvidia" / "cublas" / "bin",
        site / "nvidia" / "cudnn" / "bin",
        environments / "tts-qwen3-0.6b-base" / "venv" / "Lib" / "site-packages" / "torch" / "lib",
        environments / "tts-omnivoice-hq" / "venv" / "Lib" / "site-packages" / "torch" / "lib",
    ]
    folders = [p for p in candidates if p.is_dir()]
    if folders:
        os.environ["PATH"] = os.pathsep.join([*(str(p) for p in folders), os.environ.get("PATH", "")])
    for folder in folders:
        try:
            _DLL_HANDLES.append(os.add_dll_directory(str(folder)))
        except OSError:
            pass
    for name in ("cudart64_12.dll", "cublasLt64_12.dll", "cublas64_12.dll", "cudnn64_9.dll"):
        path = next((folder / name for folder in folders if (folder / name).is_file()), None)
        if path:
            _DLL_HANDLES.append(ctypes.WinDLL(str(path)))


def main() -> int:
    req = json.loads(sys.stdin.read() or "{}")
    configure_cuda()
    from faster_whisper import WhisperModel
    model = WhisperModel(req["model"], device=req.get("device", "cuda"), compute_type=req.get("compute_type", "float16"), local_files_only=True)
    language = req.get("language")
    if language in (None, "", "auto"):
        language = None
    segments, info = model.transcribe(req["audio"], language=language, vad_filter=True, beam_size=1, word_timestamps=False)
    result = [{"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()} for s in segments if s.text.strip()]
    print(json.dumps({"ok": True, "language": info.language, "probability": info.language_probability, "segments": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
