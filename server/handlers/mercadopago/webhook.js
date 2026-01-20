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

async function mpFetch(path, accessToken) {
  const url = 'https://api.mercadopago.com' + path;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Accept': 'application/json'
    }
  });
  return resp;
}

function verifyHmac(req, rawBody, secret) {
  try {
    if (!secret) return true; // sem secret configurado -> não bloquear (dev)

    const sigHeader = safeStr(req.headers && (req.headers['x-signature'] || req.headers['x-signature-hmac-sha256'] || req.headers['x-hub-signature']));
    if (!sigHeader) return false;

    const expected = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');

    // aceitar formatos comuns
    const provided = sigHeader
      .replace(/^sha256=/i, '')
      .replace(/[^0-9a-f]/ig, '')
      .toLowerCase();

    return provided === expected;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Mercado Pago pode enviar GET para validação
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, pong: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido' });
  }

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Mercado Pago não configurado (MP_ACCESS_TOKEN ausente)' });
    }

    const secret = process.env.MP_WEBHOOK_SECRET || '';

    // Nota: em Vercel/node serverless, muitas vezes não temos rawBody.
    // Aqui tentamos inferir raw a partir de req.body se for string.
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

    if (secret) {
      const okSig = verifyHmac(req, rawBody, secret);
      if (!okSig) {
        return res.status(401).json({ ok: false, error: 'Assinatura inválida' });
      }
    }

    // Formatos possíveis:
    // - { type: 'payment', data: { id: '123' } }
    // - { action: 'payment.updated', data: { id: '123' } }
    const body = (typeof req.body === 'object' && req.body) ? req.body : {};
    const type = safeStr(body.type || body.topic);
    const dataId = body && body.data && (body.data.id || body.data.payment_id) ? safeStr(body.data.id || body.data.payment_id) : '';

    if (!dataId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Buscar o pagamento no MP para status confiável
    const payResp = await mpFetch('/v1/payments/' + encodeURIComponent(dataId), accessToken);
    const pay = await payResp.json().catch(() => null);

    if (!payResp.ok || !pay) {
      console.warn('[MP] webhook: falha ao buscar payment', payResp.status, pay);
      return res.status(200).json({ ok: true, fetched: false });
    }

    const status = safeStr(pay.status);
    const externalRef = safeStr(pay.external_reference || (pay.metadata && pay.metadata.pedidoId) || '');

    if (!externalRef) {
      // não sabemos qual pedido atualizar
      return res.status(200).json({ ok: true, no_reference: true, status });
    }

    const pedidosCol = await getCollection('pedidos');
    const chatsCol = await getCollection('chats');

    // Atualizar pedido conforme status
    const update = {
      mpPaymentId: String(pay.id || dataId),
      mpPaymentStatus: status,
      mpPaymentStatusDetail: safeStr(pay.status_detail),
      mpPaymentUpdatedAt: nowIso()
    };

    // Automação: aprovado => pago + em_preparo
    if (status === 'approved') {
      update.statusPagamento = 'pago';
      update.status = 'em_preparo';
      update.dataPagamento = nowIso();
    } else if (status === 'rejected' || status === 'cancelled') {
      update.statusPagamento = 'recusado';
    } else {
      // pending / in_process etc.
      update.statusPagamento = 'processando';
    }

    await pedidosCol.updateOne(pedidoIdQuery(externalRef), { $set: update });

    // Garantir que o chat exista e tenha meta do cliente (nome/telefone)
    try {
      const pedido = await pedidosCol.findOne(pedidoIdQuery(externalRef));
      if (pedido) {
        const pidNum = toNumber(pedido.id);
        await chatsCol.updateOne(
          pidNum != null ? { $or: [{ pedidoId: pidNum }, { pedidoId: String(pidNum) }] } : { pedidoId: String(pedido.id) },
          {
            $setOnInsert: { pedidoId: pidNum != null ? pidNum : String(pedido.id), createdAt: nowIso() },
            $set: {
              updatedAt: nowIso(),
              clienteNome: pedido.clienteNome || '',
              clienteTelefone: pedido.clienteTelefone || ''
            }
          },
          { upsert: true }
        );
      }
    } catch (e) {
      // ignora
    }

    return res.status(200).json({ ok: true, paymentId: String(pay.id || dataId), status, pedidoId: externalRef });
  } catch (err) {
    console.error('[MP] webhook erro:', err && err.message ? err.message : err);
    return res.status(200).json({ ok: true, error: 'internal', details: err && err.message ? err.message : String(err) });
  }
};
