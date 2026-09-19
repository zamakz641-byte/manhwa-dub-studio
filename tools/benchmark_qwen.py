from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import runtime


TEXT = """Au moment où la ville bascule dans le chaos, personne ne comprend encore que cette journée va décider du destin de milliers de survivants. Adrien, lui, reconnaît immédiatement les signes qu'il avait vus avant sa mort. Les rues se vident, les alarmes hurlent et ceux qui riaient de ses avertissements cherchent soudain un refuge. Mais cette fois, il ne compte sauver ni les lâches ni les traîtres. Il possède les souvenirs de la première apocalypse, connaît les réserves cachées et sait exactement qui tentera de le poignarder dans le dos.

Son ancien ami Victor arrive avec un sourire rassurant, comme si leur trahison n'avait jamais existé. Adrien joue le jeu. Il lui ouvre la porte, lui offre de l'eau et écoute son mensonge jusqu'au bout. Derrière ce calme se prépare pourtant une revanche froide. Chaque détail compte : la clé du dépôt, la radio militaire, le passage souterrain et surtout l'heure précise où les créatures envahiront le quartier. En quelques minutes, Adrien transforme une rencontre banale en piège parfait.

Pendant que Victor rassemble ses complices, notre héros rejoint Lina, la seule personne qui l'avait aidé dans sa première vie. Elle ignore encore toute la vérité, mais comprend vite que ses prédictions sont trop précises pour être des suppositions. Ensemble, ils récupèrent des médicaments, renforcent leur abri et établissent un itinéraire de fuite. Adrien ne révèle pas tout. Il sait qu'une histoire impossible se prouve par des actes, pas par de longs discours.

Puis le ciel devient rouge. Une onde traverse les immeubles et coupe l'électricité. Les premiers monstres surgissent du métro tandis que la foule se précipite vers les sorties condamnées. Victor croit pouvoir voler les provisions et abandonner Adrien une seconde fois. Mauvais calcul. Les portes se verrouillent, la radio diffuse son aveu et ses propres alliés découvrent qu'il comptait aussi les sacrifier. En voulant répéter l'histoire, le traître vient de détruire son unique avantage.

Adrien et Lina quittent le bâtiment par le tunnel quelques secondes avant l'assaut. Derrière eux, les cris se rapprochent, mais devant eux se trouve une base oubliée contenant assez de matériel pour bâtir une véritable forteresse. La revanche n'est pourtant que le commencement. Adrien sait qu'au septième jour apparaîtra un ennemi bien plus dangereux que les monstres : un homme capable, lui aussi, de se souvenir du futur. Cette fois, la bataille ne se jouera pas seulement avec des armes, mais avec la connaissance de tout ce qui doit arriver."""


def request(proc: subprocess.Popen[str], text: str, output: Path, prompt: Path) -> dict:
    rid = uuid.uuid4().hex
    payload = {"cmd": "generate", "request_id": rid, "model_path": str(runtime.QWEN_MODEL), "prompt_path": str(prompt), "output_path": str(output), "text": text, "language": "fr", "temperature": 0.82, "repetition_penalty": 1.08}
    started = time.perf_counter()
    assert proc.stdin and proc.stdout
    proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
    proc.stdin.flush()
    tail = []
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("Worker stopped: " + " | ".join(tail[-10:]))
        tail.append(line.strip())
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("request_id") == rid and event.get("event") in {"completed", "error"}:
            event["wall_seconds"] = round(time.perf_counter() - started, 3)
            if not event.get("ok"):
                raise RuntimeError(event.get("error") or str(event))
            return event


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("work/qwen_benchmark"))
    parser.add_argument("--xvec", action="store_true")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    env = dict(**__import__("os").environ, PYTHONIOENCODING="utf-8", HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
    proc = subprocess.Popen([str(runtime.QWEN_PYTHON), "-u", str(runtime.QWEN_WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=env)
    try:
        registry = runtime.load_voices()
        voice = next(v for v in registry["voices"] if v["id"] == registry["default"])
        prompt = Path(voice.get("xvec_prompt_path") if args.xvec else voice["prompt_path"])
        warm = request(proc, "La tempête approche, mais cette fois il est prêt.", args.output_dir / "warmup.wav", prompt)
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", TEXT.replace("\n", " ")) if len(s.split()) >= 5]
        queue = (sentences * 3)[:48]
        batch_started = time.perf_counter()
        runs = []
        audio_seconds = 0.0
        for index, sentence in enumerate(queue, 1):
            item = request(proc, sentence, args.output_dir / f"segment_{index:03d}.wav", prompt)
            runs.append({"segment": index, "duration": item["duration"], "wall_seconds": item["wall_seconds"], "elapsed": item.get("elapsed")})
            audio_seconds += float(item["duration"])
            if audio_seconds >= 180:
                break
        batch_seconds = time.perf_counter() - batch_started
        speed = audio_seconds / max(batch_seconds, 0.001)
        report = {"engine_worker": str(runtime.QWEN_WORKER), "prompt_mode": "xvector_turbo" if args.xvec else "icl_quality", "prompt": str(prompt), "warmup": warm, "segmented_run": {"segments": len(runs), "audio_seconds": round(audio_seconds, 3), "wall_seconds": round(batch_seconds, 3), "runs": runs}, "audio_per_compute": round(speed, 3), "estimated_minutes_for_one_hour": round(60 / speed, 2), "target_30_minutes_met": speed >= 2.0}
        (args.output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        if proc.poll() is None:
            assert proc.stdin
            proc.stdin.write(json.dumps({"cmd": "shutdown", "request_id": "shutdown"}) + "\n")
            proc.stdin.flush()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
