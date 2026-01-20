const crypto = require('crypto');
const { getCollection } = require('../../mongodb');

function safeStr(v) {
  return String(v == null ? '' : v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pedidoIdQuery(pedidoId) {
  const n = toNumber(pedidoId);
  if (n != null) return { $or: [{ id: n }, { id: String(n) }] };
  const s = safeStr(pedidoId);
  return s ? { $or: [{ id: s }, { id: Number(s) }] } : { id: null };
}

async function mpFetch(path, accessToken, init) {
  const url = 'https://api.mercadopago.com' + path;
  const resp = await fetch(url, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(init && init.headers ? init.headers : {})
    }
  });
  return resp;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido' });
  }

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Mercado Pago não configurado (MP_ACCESS_TOKEN ausente)' });
    }

    const body = req.body || {};
    const pedidoId = body.pedidoId;
    const title = safeStr(body.title) || 'Pedido Vetera Sushi';
    const amount = Number(body.amount);

    if (!pedidoId || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'pedidoId e amount são obrigatórios' });
    }

    const pedidosCol = await getCollection('pedidos');
    const pedido = await pedidosCol.findOne(pedidoIdQuery(pedidoId));
    if (!pedido) {
      return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || (req && req.headers && req.headers.host ? ('https://' + req.headers.host) : null);
    const backUrls = {
      success: baseUrl ? baseUrl + '/cardapio?mp=success&pedidoId=' + encodeURIComponent(String(pedido.id)) : undefined,
      pending: baseUrl ? baseUrl + '/cardapio?mp=pending&pedidoId=' + encodeURIComponent(String(pedido.id)) : undefined,
      failure: baseUrl ? baseUrl + '/cardapio?mp=failure&pedidoId=' + encodeURIComponent(String(pedido.id)) : undefined
    };

    const webhookUrl = process.env.MP_WEBHOOK_URL || (baseUrl ? (baseUrl + '/api/mercadopago/webhook') : undefined);

    const preferencePayload = {
      items: [
        {
          id: String(pedido.id),
          title,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(amount)
        }
      ],
      external_reference: String(pedido.id),
      notification_url: webhookUrl,
      back_urls: backUrls,
      auto_return: 'approved',
      metadata: {
        pedidoId: String(pedido.id)
      }
    };

    const mpResp = await mpFetch('/checkout/preferences', accessToken, {
      method: 'POST',
      body: JSON.stringify(preferencePayload)
    });

    const payload = await mpResp.json().catch(() => null);
    if (!mpResp.ok) {
      return res.status(500).json({ ok: false, error: 'Falha ao criar preference', details: payload || null });
    }

    const preferenceId = payload && payload.id ? String(payload.id) : '';
    const initPoint = payload && payload.init_point ? String(payload.init_point) : '';
    const sandboxInitPoint = payload && payload.sandbox_init_point ? String(payload.sandbox_init_point) : '';

    // salvar refs do MP no pedido
    try {
      await pedidosCol.updateOne(
        pedidoIdQuery(pedido.id),
        {
          $set: {
            mpPreferenceId: preferenceId,
            mpInitPoint: initPoint,
            mpSandboxInitPoint: sandboxInitPoint,
            mpUpdatedAt: nowIso()
          }
        }
      );
    } catch (e) {
      // ignora
    }

    return res.status(200).json({ ok: true, preferenceId, init_point: initPoint, sandbox_init_point: sandboxInitPoint });
  } catch (err) {
    console.error('[MP] preference erro:', err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: 'Erro ao criar pagamento', details: err && err.message ? err.message : String(err) });
  }
};
