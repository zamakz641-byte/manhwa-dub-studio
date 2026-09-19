from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import ctranslate2
import sentencepiece as spm


APP_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = Path(r"D:\manhwa studio\anime_manga_manhua_dubbing_app\models\libretranslate-argos-en-fr-1.9\package-extracted\translate-en_fr-1_9")


def clean(text: str) -> str:
    text = text.replace("▁", " ")
    text = re.sub(r"\s+([,.!?;:])", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    args = parser.parse_args()
    project_file = APP_ROOT / "projects" / args.project_id / "project.json"
    project = json.loads(project_file.read_text(encoding="utf-8"))
    processor = spm.SentencePieceProcessor(model_file=str(MODEL_ROOT / "sentencepiece.model"))
    translator = ctranslate2.Translator(str(MODEL_ROOT / "model"), device="cpu", compute_type="int8")
    rows = []
    for start in range(0, len(project["segments"]), 24):
        batch = project["segments"][start:start + 24]
        tokens = [processor.encode(segment["transcript"], out_type=str) for segment in batch]
        translated = translator.translate_batch(tokens, beam_size=4, max_batch_size=24)
        for segment, result in zip(batch, translated):
            rows.append({
                "id": segment["id"],
                "duration": segment["original_duration"],
                "original": segment["transcript"],
                "draft": clean(processor.decode(result.hypotheses[0])),
                "rewritten_text": "",
            })
        print(json.dumps({"translated": len(rows), "total": len(project["segments"])}), flush=True)
    output = project_file.parent / "script" / "chatgpt_styling_draft.json"
    output.write_text(json.dumps({"project_id": args.project_id, "segments": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
