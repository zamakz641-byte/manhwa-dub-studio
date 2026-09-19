"""Drop-in Qwen worker using faster-qwen3-tts CUDA graphs.

The proven prompt serialization and JSON protocol remain in NarratorStudio's
worker; only model loading is replaced. Set MANHWA_QWEN_ENGINE=legacy to use
the original worker through runtime.py.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path


NARRATOR = Path(os.environ.get("MANHWA_NARRATOR_ROOT", r"D:\manhwa studio\NarratorStudio_StoryDub_v1_3"))
sys.path.insert(0, str(NARRATOR))

import qwen_tts_worker as legacy  # noqa: E402


def load_fast_model(model_path: str):
    path = Path(model_path).expanduser().resolve()
    if legacy.MODEL is not None:
        if legacy.MODEL_PATH != str(path):
            raise RuntimeError(f"Qwen worker already loaded another model: {legacy.MODEL_PATH}")
        return {"loaded": True, "model_path": legacy.MODEL_PATH, "cold": False, "engine": "FasterQwen3TTS CUDA graphs"}
    if not path.is_dir() or not (path / "config.json").is_file():
        raise FileNotFoundError(f"Local Qwen3-TTS model not found: {path}")

    import torch
    from faster_qwen3_tts import FasterQwen3TTS

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable in the Qwen3-TTS runtime")
    started = time.perf_counter()
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    legacy.MODEL = FasterQwen3TTS.from_pretrained(
        str(path), device="cuda:0", dtype=dtype, attn_implementation="sdpa", max_seq_len=2048,
        local_files_only=True,
    )
    legacy.MODEL_PATH = str(path)
    return {
        "loaded": True,
        "model_path": legacy.MODEL_PATH,
        "cold": True,
        "load_seconds": round(time.perf_counter() - started, 3),
        "gpu": torch.cuda.get_device_name(0),
        "dtype": str(dtype).replace("torch.", ""),
        "attention": "sdpa",
        "engine": "FasterQwen3TTS CUDA graphs",
    }


legacy.load_model = load_fast_model

if __name__ == "__main__":
    raise SystemExit(legacy.main())
