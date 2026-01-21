import datetime
from typing import Any, Dict, List, Optional


def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v)


def _split_address(addr: str) -> Dict[str, str]:
    """Heurística simples: mantém tudo em 1 linha, mas separa bairro/cidade se existir."""
    a = (addr or "").strip()
    return {
        "full": a,
    }


def build_discount_url(discount_url_base: str, cupom: Optional[str]) -> Optional[str]:
    cup = (cupom or "").strip()
    if not cup:
        return None
    base = (discount_url_base or "").strip()
    if not base:
        return None
    join = "&" if "?" in base else "?"
    return f"{base}{join}cupom={cup}"


def format_pedido_for_print(pedido: Dict[str, Any]) -> Dict[str, Any]:
    # Datas
    dt_raw = pedido.get("dataPagamento") or pedido.get("dataCriacao") or pedido.get("data")
    dt = None
    if dt_raw:
        try:
            dt = datetime.datetime.fromisoformat(str(dt_raw).replace("Z", "+00:00"))
        except Exception:
            dt = None

    if dt is None:
        dt = datetime.datetime.now()

    endereco = _split_address(_safe_str(pedido.get("clienteEndereco")))

    itens: List[Dict[str, Any]] = []
    for it in pedido.get("itens") or []:
        try:
            qtd = int(it.get("quantidade") or 0)
        except Exception:
            qtd = 0
        try:
            preco = float(it.get("preco") or 0)
        except Exception:
            preco = 0.0
        itens.append(
            {
                "nome": _safe_str(it.get("nome")),
                "qtd": qtd,
                "preco": preco,
                "subtotal": preco * qtd,
            }
        )

    return {
        "id": _safe_str(pedido.get("id")),
        "data": dt.strftime("%d/%m/%Y"),
        "hora": dt.strftime("%H:%M"),
        "cliente_nome": _safe_str(pedido.get("clienteNome")),
        "cliente_tel": _safe_str(pedido.get("clienteTelefone")),
        "endereco_full": endereco["full"],
        "itens": itens,
        "total": float(pedido.get("total") or 0),
        "cupom": _safe_str(pedido.get("cupom")),
    }
