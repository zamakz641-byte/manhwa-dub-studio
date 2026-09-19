from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request


def request_json(url: str, method: str = "GET", payload: dict | None = None, timeout: int = 900) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--base", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    project_url = f"{args.base}/api/projects/{args.project_id}"
    project = request_json(project_url)
    pending = [segment for segment in project["segments"] if not segment.get("tts_path")]
    total = len(project["segments"])
    started = time.monotonic()
    for offset, segment in enumerate(pending, 1):
        last_error = None
        for attempt in range(1, 4):
            try:
                result = request_json(f"{project_url}/segments/{segment['id']}/tts", method="POST")
                elapsed = time.monotonic() - started
                done = total - len(pending) + offset
                eta = elapsed / offset * (len(pending) - offset) if offset else 0
                print(json.dumps({
                    "done": done, "total": total, "id": segment["id"],
                    "duration": result.get("tts_duration"), "sync": result.get("sync", {}).get("status"),
                    "eta_seconds": round(eta),
                }), flush=True)
                break
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = exc
                time.sleep(attempt * 2)
        else:
            raise RuntimeError(f"Échec TTS {segment['id']} après 3 essais : {last_error}")
    print(json.dumps({"ok": True, "generated": len(pending), "elapsed_seconds": round(time.monotonic() - started, 1)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
