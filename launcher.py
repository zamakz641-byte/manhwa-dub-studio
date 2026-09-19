from __future__ import annotations

import argparse
import ctypes
import os
import socket
import threading
import time
import urllib.request
import traceback
from pathlib import Path

import uvicorn


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"


def free_port(first: int = 8765, last: int = 8795) -> int:
    for port in range(first, last + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
            except OSError:
                continue
            return port
    raise RuntimeError("Aucun port local disponible entre 8765 et 8795")


def wait_until_ready(url: str, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{url}/api/runtime", timeout=1.0) as response:
                if response.status == 200:
                    return
        except Exception as exc:
            last_error = exc
            time.sleep(0.12)
    raise RuntimeError(f"Le serveur Manhwa Du ne répond pas : {last_error}")


def show_error(message: str) -> None:
    try:
        (ROOT / "launcher_error.log").write_text(message, encoding="utf-8")
    except OSError:
        pass
    try:
        ctypes.windll.user32.MessageBoxW(0, message, "Manhwa Dub Studio", 0x10)
    except Exception:
        print(message)


def run(smoke_test: bool = False) -> int:
    os.chdir(ROOT)
    import app as backend

    port = free_port()
    url = f"http://{HOST}:{port}"
    # pythonw n'expose ni stdout ni stderr : désactiver la configuration de logs
    # d'Uvicorn évite qu'elle tente d'accéder à ces flux inexistants.
    config = uvicorn.Config(backend.app, host=HOST, port=port, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="manhwa-dub-api", daemon=True)
    thread.start()
    try:
        wait_until_ready(url)
        if smoke_test:
            with urllib.request.urlopen(f"{url}/api/voices", timeout=5.0) as response:
                if response.status != 200:
                    raise RuntimeError("Le catalogue de voix ne répond pas")
            return 0

        try:
            import webview
        except ImportError as exc:
            raise RuntimeError("pywebview est absent. Lancez : python -m pip install pywebview") from exc

        webview.create_window(
            "Manhwa Dub Studio",
            url=url,
            width=1460,
            height=920,
            min_size=(1050, 700),
            background_color="#0b0d12",
            text_select=True,
        )
        webview.start(gui="edgechromium", debug=False, private_mode=False)
        return 0
    finally:
        server.should_exit = True
        thread.join(timeout=8)
        backend.qwen.shutdown()


def main() -> int:
    parser = argparse.ArgumentParser(description="Lance Manhwa Dub Studio dans une fenêtre pywebview.")
    parser.add_argument("--smoke-test", action="store_true", help="Teste le démarrage sans ouvrir de fenêtre.")
    args = parser.parse_args()
    try:
        return run(args.smoke_test)
    except Exception as exc:
        show_error(f"{exc}\n\n{traceback.format_exc()}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
