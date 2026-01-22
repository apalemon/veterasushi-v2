import os
import threading
import time
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, Response

from escpos.printer import Win32Raw

from printer_layout import build_discount_url, format_pedido_for_print

try:
    # Suporte a .env (padrão) e .ENV (como você criou no Windows)
    _here = os.path.dirname(os.path.abspath(__file__))
    _dotenv_1 = os.path.join(_here, ".env")
    _dotenv_2 = os.path.join(_here, ".ENV")
    if os.path.exists(_dotenv_1):
        load_dotenv(_dotenv_1)
    elif os.path.exists(_dotenv_2):
        load_dotenv(_dotenv_2)
    else:
        load_dotenv()
except Exception:
    load_dotenv()

SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "").strip().rstrip("/")
PRINT_APP_TOKEN = os.getenv("PRINT_APP_TOKEN", "").strip()
PRINTER_NAME = os.getenv("PRINTER_NAME", "").strip()
STORE_NAME = os.getenv("STORE_NAME", "Vetera Sushi").strip()
DISCOUNT_URL_BASE = os.getenv("DISCOUNT_URL_BASE", "").strip().rstrip("/")
POLL_SECONDS = float(os.getenv("POLL_SECONDS", "3"))

app = Flask(__name__)

_state = {
    "running": True,
    "last_error": None,
    "last_poll_at": None,
    "printed_count": 0,
}

_print_lock = threading.Lock()


def _log(msg: str) -> None:
    try:
        ts = time.strftime('%H:%M:%S')
        print(f"[{ts}] {msg}", flush=True)
    except Exception:
        pass


def _headers() -> Dict[str, str]:
    return {
        "X-Print-Token": PRINT_APP_TOKEN,
        "Content-Type": "application/json",
    }


def _queue_url() -> str:
    return f"{SERVER_BASE_URL}/api/print/queue"


def _ack_url() -> str:
    return f"{SERVER_BASE_URL}/api/print/ack"


def _require_env() -> Optional[str]:
    if not SERVER_BASE_URL:
        return "SERVER_BASE_URL não configurado"
    if not PRINT_APP_TOKEN:
        return "PRINT_APP_TOKEN não configurado"
    if not PRINTER_NAME:
        return "PRINTER_NAME não configurado"
    try:
        import win32print  # type: ignore
    except Exception:
        return (
            "Dependência ausente para impressão no Windows (win32print). "
            "Instale 'pywin32'. Se sua versão do Python não tiver build compatível, "
            "instale Python 3.12/3.11 e recrie a venv."
        )
    return None


def _money(v: float) -> str:
    # simples pt-BR
    try:
        return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return f"R$ {v}"


def print_pedido(pedido: Dict[str, Any]) -> None:
    p = Win32Raw(PRINTER_NAME)

    data = format_pedido_for_print(pedido)

    # Topo
    p.set(align="center", bold=True, width=2, height=2)
    p.text(STORE_NAME + "\n")

    # Faixa preta com ID (invert)
    p.set(align="center", bold=True, invert=True, width=2, height=2)
    p.text(f" PEDIDO #{data['id']} \n")
    p.set(invert=False)

    p.set(align="center")
    p.text("-" * 32 + "\n")

    p.set(align="left", bold=True)
    p.text(f"Data: {data['data']}   Hora: {data['hora']}\n")
    p.set(bold=False)

    p.text("-" * 32 + "\n")

    p.set(bold=True)
    p.text("Cliente:\n")
    p.set(bold=False)
    if data["cliente_nome"]:
        p.text(data["cliente_nome"] + "\n")
    if data["cliente_tel"]:
        p.text(data["cliente_tel"] + "\n")

    if data["endereco_full"]:
        p.text("\nEndereço:\n")
        p.text(data["endereco_full"] + "\n")

    p.text("-" * 32 + "\n")

    # Itens
    p.set(bold=True)
    p.text("ITENS\n")
    p.set(bold=False)

    for it in data["itens"]:
        nome = (it["nome"] or "").strip()
        qtd = it["qtd"]
        subtotal = it["subtotal"]
        # 1 linha simples (nome pode quebrar)
        line = f"{qtd}x {nome}".strip()
        if len(line) > 32:
            p.text(line[:32] + "\n")
            if len(line) > 32:
                p.text(line[32:64] + "\n")
        else:
            p.text(line + "\n")
        p.set(align="right")
        p.text(_money(float(subtotal)) + "\n")
        p.set(align="left")

    p.text("-" * 32 + "\n")

    # Total
    p.set(align="center", bold=True, width=2, height=2)
    p.text("TOTAL\n")
    p.text(_money(float(data["total"])) + "\n")
    p.set(bold=False, width=1, height=1)

    p.text("-" * 32 + "\n")

    # QR desconto
    url = build_discount_url(DISCOUNT_URL_BASE, data.get("cupom"))
    if url:
        p.set(align="center", bold=True)
        p.text("DESCONTO\n")
        p.set(bold=False)
        try:
            # qr() é o caminho mais confiável em ESC/POS
            p.qr(url, size=4)
        except Exception:
            # fallback: imprime o link
            p.text(url + "\n")

    p.text("\n")
    p.set(align="center")
    p.text("Powered by Nurhb\n")

    p.cut()


def ack_pedido(pedido_id: Any, status: str) -> None:
    requests.post(
        _ack_url(),
        headers=_headers(),
        json={"pedidoId": pedido_id, "status": status},
        timeout=15,
    )


def fetch_queue(limit: int = 10) -> Dict[str, Any]:
    resp = requests.get(_queue_url(), headers=_headers(), params={"limit": str(limit)}, timeout=20)
    return {
        "status_code": resp.status_code,
        "text": resp.text,
        "json": (resp.json() if resp.status_code == 200 else None),
    }


def fetch_pedido_by_id(pedido_id: Any) -> Dict[str, Any]:
    url = f"{SERVER_BASE_URL}/api/pedidos"
    resp = requests.get(url, params={"ids": str(pedido_id)}, timeout=20)
    return {
        "status_code": resp.status_code,
        "text": resp.text,
        "json": (resp.json() if resp.status_code == 200 else None),
    }


def print_next_from_queue() -> Dict[str, Any]:
    if not _print_lock.acquire(blocking=False):
        return {"ok": True, "busy": True}
    try:
        q = fetch_queue(limit=1)
        if q["status_code"] != 200:
            return {"ok": False, "error": "queue_http", "status": q["status_code"], "details": q["text"][:400]}
        payload = q.get("json") or {}
        pedidos = payload.get("pedidos") or []
        if not pedidos:
            return {"ok": True, "printed": False, "message": "no_pending"}
        pedido = pedidos[0]
        pid = pedido.get("id")

        last_err = None
        for _ in range(2):
            try:
                print_pedido(pedido)
                ack_pedido(pid, "printed")
                _state["printed_count"] += 1
                return {"ok": True, "printed": True, "pedidoId": pid}
            except Exception as e:
                last_err = e
                time.sleep(0.4)

        try:
            ack_pedido(pid, "error")
        except Exception:
            pass

        return {"ok": False, "error": "print_failed", "pedidoId": pid, "details": str(last_err) if last_err else ""}
    finally:
        try:
            _print_lock.release()
        except Exception:
            pass


def print_specific_pedido(pedido_id: Any) -> Dict[str, Any]:
    if not _print_lock.acquire(blocking=False):
        return {"ok": True, "busy": True, "pedidoId": pedido_id}
    try:
        p = fetch_pedido_by_id(pedido_id)
        if p["status_code"] != 200:
            return {"ok": False, "error": "pedido_http", "status": p["status_code"], "details": p["text"][:400]}

        arr = p.get("json")
        if not isinstance(arr, list) or not arr:
            return {"ok": False, "error": "pedido_not_found", "pedidoId": pedido_id}

        pedido = arr[0]

        last_err = None
        for _ in range(2):
            try:
                print_pedido(pedido)
                try:
                    ack_pedido(pedido.get("id"), "printed")
                except Exception:
                    pass
                _state["printed_count"] += 1
                return {"ok": True, "printed": True, "pedidoId": pedido.get("id")}
            except Exception as e:
                last_err = e
                time.sleep(0.4)

        return {"ok": False, "error": "print_failed", "pedidoId": pedido_id, "details": str(last_err) if last_err else ""}
    finally:
        try:
            _print_lock.release()
        except Exception:
            pass


def poll_loop() -> None:
    err = _require_env()
    if err:
        _state["last_error"] = err
        _log(f"ERRO: {err}")
        return

    _log("Print App iniciado")
    _log(f"Servidor: {SERVER_BASE_URL}")
    _log(f"Impressora: {PRINTER_NAME}")

    while _state["running"]:
        try:
            _state["last_poll_at"] = time.time()
            # Se o botão manual está imprimindo, não competir
            if _print_lock.locked():
                time.sleep(POLL_SECONDS)
                continue

            resp = requests.get(_queue_url(), headers=_headers(), timeout=20)
            if resp.status_code != 200:
                _state["last_error"] = f"queue HTTP {resp.status_code}: {resp.text[:200]}"
                _log(_state["last_error"]) 
                time.sleep(POLL_SECONDS)
                continue

            payload = resp.json()
            pedidos = payload.get("pedidos") or []

            _log(f"Fila: {len(pedidos)} pedido(s) pendente(s)")

            for pedido in pedidos:
                pid = pedido.get("id")
                try:
                    _log(f"Imprimindo pedido {pid}...")
                    if not _print_lock.acquire(blocking=False):
                        break
                    try:
                        last_err = None
                        for _ in range(2):
                            try:
                                print_pedido(pedido)
                                ack_pedido(pid, "printed")
                                _state["printed_count"] += 1
                                _log(f"OK pedido {pid} (printed)")
                                last_err = None
                                break
                            except Exception as e:
                                last_err = e
                                time.sleep(0.4)
                        if last_err is not None:
                            raise last_err
                    finally:
                        try:
                            _print_lock.release()
                        except Exception:
                            pass
                except Exception as e:
                    _state["last_error"] = f"print error pedido {pid}: {e}"
                    _log(_state["last_error"]) 
                    try:
                        ack_pedido(pid, "error")
                    except Exception:
                        pass

            _state["last_error"] = None
        except Exception as e:
            _state["last_error"] = str(e)
            _log(f"ERRO loop: {_state['last_error']}")

        time.sleep(POLL_SECONDS)


@app.get("/status")
def status():
    return jsonify(
        {
            "ok": True,
            "running": _state["running"],
            "last_error": _state["last_error"],
            "last_poll_at": _state["last_poll_at"],
            "printed_count": _state["printed_count"],
            "server": SERVER_BASE_URL,
            "printer": PRINTER_NAME,
        }
    )


@app.post("/print-next")
def print_next():
    err = _require_env()
    if err:
        _state["last_error"] = err
        return jsonify({"ok": False, "error": "config", "details": err}), 500

    result = print_next_from_queue()
    if result.get("ok"):
        return jsonify(result)
    return jsonify(result), 500


@app.get("/print-order")
def print_order():
    err = _require_env()
    if err:
        _state["last_error"] = err
        return Response("Config inválida", status=500, mimetype="text/plain")

    pedido_id = (request.args.get("pedidoId") or request.args.get("id") or "").strip()
    if not pedido_id:
        return Response("pedidoId é obrigatório", status=400, mimetype="text/plain")

    result = print_specific_pedido(pedido_id)
    ok = bool(result.get("ok"))
    busy = bool(result.get("busy"))
    printed = bool(result.get("printed"))
    details = str(result.get("details") or result.get("error") or "")

    html = """
<!doctype html>
<html lang=\"pt-br\"><head>
<meta charset=\"utf-8\" />
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<title>Impressão</title>
</head><body style=\"font-family: Arial, sans-serif; padding: 16px;\">
<h2>Impressão de comanda</h2>
<div><strong>Pedido:</strong> #{pedido}</div>
<div><strong>Status:</strong> {status}</div>
{details_block}
<script>
  try {{ setTimeout(() => window.close(), 1800); }} catch (e) {{}}
</script>
</body></html>
"""

    status_txt = "OK (impresso)" if printed else ("OK (ocupado)" if busy else ("OK" if ok else "Falha"))
    details_block = "" if (not details) else ("<pre style=\"margin-top:12px; background:#f6f6f6; padding:12px; border-radius:8px;\">" + details + "</pre>")
    return Response(
        html.format(pedido=str(pedido_id), status=status_txt, details_block=details_block),
        status=(200 if ok else 500),
        mimetype="text/html",
    )


def main() -> None:
    t = threading.Thread(target=poll_loop, daemon=True)
    t.start()
    app.run(host="127.0.0.1", port=5055)


if __name__ == "__main__":
    main()
