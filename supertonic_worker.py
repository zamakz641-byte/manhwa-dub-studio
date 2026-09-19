from __future__ import annotations

import json
import sys
import time
import traceback
import wave
from pathlib import Path

import supertonic.loader as loader
from supertonic import TTS


_tts: TTS | None = None
_model_path: str | None = None


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def ensure_model(model_path: str) -> tuple[TTS, float, bool]:
    global _tts, _model_path
    if _tts is not None and _model_path == model_path:
        return _tts, 0.0, False
    loader.DEFAULT_ONNX_PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    started = time.perf_counter()
    _tts = TTS(model_dir=model_path, auto_download=False)
    _model_path = model_path
    return _tts, time.perf_counter() - started, True


def providers(tts: TTS) -> list[list[str]]:
    sessions = (tts.model.dp_ort, tts.model.text_enc_ort, tts.model.vector_est_ort, tts.model.vocoder_ort)
    return [session.get_providers() for session in sessions]


def handle(request: dict) -> bool:
    request_id = str(request.get("request_id") or "")
    command = str(request.get("cmd") or "generate")
    if command == "shutdown":
        emit({"event": "shutdown", "ok": True, "request_id": request_id})
        return False
    try:
        tts, load_seconds, cold = ensure_model(str(request["model_path"]))
        active = providers(tts)
        if not all("CUDAExecutionProvider" in item for item in active):
            raise RuntimeError(f"Supertonic CUDA indisponible, providers actifs: {active}")
        if command == "init":
            emit({
                "event": "ready", "ok": True, "request_id": request_id,
                "cold": cold, "load_seconds": round(load_seconds, 3), "providers": active,
            })
            return True
        output = Path(str(request["output_path"]))
        output.parent.mkdir(parents=True, exist_ok=True)
        style = tts.get_voice_style(str(request.get("voice") or "M5"))
        started = time.perf_counter()
        audio, _ = tts.synthesize(
            str(request["text"]), voice_style=style,
            total_steps=int(request.get("total_steps") or 16),
            speed=float(request.get("speed") or 1.2),
            lang=str(request.get("language") or "fr"), verbose=False,
        )
        tts.save_audio(audio, str(output))
        elapsed = time.perf_counter() - started
        with wave.open(str(output), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        emit({
            "event": "completed", "ok": True, "request_id": request_id,
            "output_path": str(output), "duration": round(duration, 6),
            "generation_seconds": round(elapsed, 6),
            "realtime_multiple": round(duration / max(elapsed, 0.001), 3),
        })
    except Exception as exc:
        emit({
            "event": "error", "ok": False, "request_id": request_id,
            "error": str(exc), "traceback": traceback.format_exc()[-3000:],
        })
    return True


def main() -> int:
    for line in sys.stdin:
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not handle(request):
            break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
