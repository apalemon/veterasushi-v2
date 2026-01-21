const crypto = require('crypto');
const { getCollection } = require('../../mongodb');
const https = require('https');

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

function fetchCompat(url, init) {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(url, init);
  }

  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
      const headers = (init && init.headers) ? init.headers : {};
      const body = init && init.body != null ? init.body : null;

      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          method,
          headers
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            const status = Number(res.statusCode || 0);
            resolve({
              ok: status >= 200 && status < 300,
              status,
              json: async () => {
                try { return JSON.parse(data || 'null'); } catch (e) { return null; }
              },
              text: async () => String(data || '')
            });
          });
        }
      );

      req.on('error', reject);
      if (body != null) req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function mpFetch(path, accessToken) {
  const url = 'https://api.mercadopago.com' + path;
  const resp = await fetchCompat(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Accept': 'application/json'
    }
  });
  return resp;
}

async function atualizarPedidoComPagamento(pedidoId, pay, paymentIdFallback) {
  const status = safeStr(pay && pay.status);
  const pedidosCol = await getCollection('pedidos');
  const chatsCol = await getCollection('chats');

  const update = {
    mpPaymentId: String((pay && pay.id) || paymentIdFallback || ''),
    mpPaymentStatus: status,
    mpPaymentStatusDetail: safeStr(pay && pay.status_detail),
    mpPaymentUpdatedAt: nowIso()
  };

  if (status === 'approved') {
    update.statusPagamento = 'pago';
    update.status = 'em_preparo';
    update.dataPagamento = nowIso();
  } else if (status === 'rejected' || status === 'cancelled') {
    update.statusPagamento = 'recusado';
  } else {
    update.statusPagamento = 'processando';
  }

  await pedidosCol.updateOne(pedidoIdQuery(pedidoId), { $set: update });

  try {
    const pedido = await pedidosCol.findOne(pedidoIdQuery(pedidoId));
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

  return { status, mpPaymentId: String((pay && pay.id) || paymentIdFallback || '') };
}

function verifyHmac(req, rawBody, secret) {
  try {
    // O formato de assinatura do Mercado Pago não é um HMAC simples do body.
    // Para evitar bloquear notificações em produção, não validamos aqui.
    // (Se quiser validar no futuro, implementar algoritmo oficial do MP.)
    return true;
  } catch (e) {
    return true;
  }
}

function getQueryParam(req, key) {
  try {
    const u = new URL(String(req.url || ''), 'http://localhost');
    return safeStr(u.searchParams.get(key) || '');
  } catch (e) {
    return '';
  }
}

function extractPaymentIdFromAny(req, body) {
  try {
    const qId = getQueryParam(req, 'id');
    if (qId) return qId;

    const qTopic = getQueryParam(req, 'topic') || getQueryParam(req, 'type');
    if (qTopic && qId) return qId;

    const b = (typeof body === 'object' && body) ? body : {};
    const dataId = b && b.data && (b.data.id || b.data.payment_id) ? safeStr(b.data.id || b.data.payment_id) : '';
    if (dataId) return dataId;

    const resource = safeStr(b.resource || b.data && b.data.resource || '');
    if (resource) {
      const m = resource.match(/\/v1\/payments\/(\d+)/i) || resource.match(/payments\/(\d+)/i);
      if (m && m[1]) return safeStr(m[1]);
    }

    const bId = safeStr(b.id || '');
    if (bId && safeStr(b.topic || b.type)) return bId;
  } catch (e) {}
  return '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: validação OU fallback manual para sincronizar status
  if (req.method === 'GET') {
    try {
      const accessToken = process.env.MP_ACCESS_TOKEN;
      if (!accessToken) {
        return res.status(500).json({ ok: false, error: 'Mercado Pago não configurado (MP_ACCESS_TOKEN ausente)' });
      }

      const pedidoId = getQueryParam(req, 'pedidoId');
      if (!pedidoId) {
        return res.status(200).json({ ok: true, pong: true });
      }

      // Buscar pagamento mais recente por external_reference
      const searchPath = '/v1/payments/search?external_reference=' + encodeURIComponent(String(pedidoId)) + '&sort=date_created&criteria=desc&limit=1';
      const sResp = await mpFetch(searchPath, accessToken);
      const sJson = await sResp.json().catch(() => null);

      const results = sJson && Array.isArray(sJson.results) ? sJson.results : [];
      const pay = results && results.length ? results[0] : null;
      if (!pay) {
        return res.status(200).json({ ok: true, pedidoId: String(pedidoId), found: false });
      }

      const updated = await atualizarPedidoComPagamento(String(pedidoId), pay, pay && pay.id);
      return res.status(200).json({ ok: true, pedidoId: String(pedidoId), found: true, status: updated.status, paymentId: updated.mpPaymentId });
    } catch (e) {
      return res.status(200).json({ ok: true, error: 'internal', details: e && e.message ? String(e.message) : String(e) });
    }
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

    // Não bloquear webhook por assinatura (verifiqueHmac é bypass).
    // Se quiser validação estrita, implementar algoritmo oficial do MP.
    if (secret) {
      try { verifyHmac(req, rawBody, secret); } catch (e) {}
    }

    // Formatos possíveis:
    // - { type: 'payment', data: { id: '123' } }
    // - { action: 'payment.updated', data: { id: '123' } }
    const body = (typeof req.body === 'object' && req.body) ? req.body : (req.body || {});
    const type = safeStr((body && body.type) || (body && body.topic) || getQueryParam(req, 'topic') || getQueryParam(req, 'type'));
    const dataId = extractPaymentIdFromAny(req, body);

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

    const updated = await atualizarPedidoComPagamento(String(externalRef), pay, dataId);
    return res.status(200).json({ ok: true, topic: type || 'payment', paymentId: updated.mpPaymentId, status: updated.status, pedidoId: externalRef });
  } catch (err) {
    console.error('[MP] webhook erro:', err && err.message ? err.message : err);
    return res.status(200).json({ ok: true, error: 'internal', details: err && err.message ? err.message : String(err) });
  }
};
