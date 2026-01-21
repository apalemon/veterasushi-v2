import os
import threading
import time
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify

from escpos.printer import Win32Raw

from printer_layout import build_discount_url, format_pedido_for_print

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
            p.qr(url, size=6)
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


def poll_loop() -> None:
    err = _require_env()
    if err:
        _state["last_error"] = err
        return

    while _state["running"]:
        try:
            _state["last_poll_at"] = time.time()
            resp = requests.get(_queue_url(), headers=_headers(), timeout=20)
            if resp.status_code != 200:
                _state["last_error"] = f"queue HTTP {resp.status_code}: {resp.text[:200]}"
                time.sleep(POLL_SECONDS)
                continue

            payload = resp.json()
            pedidos = payload.get("pedidos") or []

            for pedido in pedidos:
                pid = pedido.get("id")
                try:
                    print_pedido(pedido)
                    ack_pedido(pid, "printed")
                    _state["printed_count"] += 1
                except Exception as e:
                    _state["last_error"] = f"print error pedido {pid}: {e}"
                    try:
                        ack_pedido(pid, "error")
                    except Exception:
                        pass

            _state["last_error"] = None
        except Exception as e:
            _state["last_error"] = str(e)

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


def main() -> None:
    t = threading.Thread(target=poll_loop, daemon=True)
    t.start()
    app.run(host="127.0.0.1", port=5055)


if __name__ == "__main__":
    main()
