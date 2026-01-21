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

function firstNonEmptyStr(...values) {
  for (const v of values) {
    const s = safeStr(v);
    if (s) return s;
  }
  return '';
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

function parseMpSignatureHeader(value) {
  const raw = safeStr(value);
  if (!raw) return { ts: '', v1: '' };
  const parts = raw.split(',').map(s => safeStr(s));
  let ts = '';
  let v1 = '';
  for (const p of parts) {
    if (p.startsWith('ts=')) ts = safeStr(p.slice(3));
    if (p.startsWith('v1=')) v1 = safeStr(p.slice(3));
  }
  return { ts, v1 };
}

function extractMpEventIdFromQuery(req) {
  try {
    const u = new URL(String(req.url || ''), 'http://localhost');
    const v = firstNonEmptyStr(u.searchParams.get('data.id'), u.searchParams.get('id'));
    return safeStr(v);
  } catch (e) {
    return '';
  }
}

function verifyMpWebhookSignature(req, secret) {
  const sec = safeStr(secret);
  if (!sec) return true;

  const xSignature = safeStr(req && req.headers ? (req.headers['x-signature'] || req.headers['X-Signature']) : '');
  const xRequestId = safeStr(req && req.headers ? (req.headers['x-request-id'] || req.headers['X-Request-Id']) : '');
  const { ts, v1 } = parseMpSignatureHeader(xSignature);
  const dataIdUrl = extractMpEventIdFromQuery(req);

  if (!ts || !v1 || !xRequestId || !dataIdUrl) return false;

  const idNormalized = /[a-z]/i.test(dataIdUrl) ? String(dataIdUrl).toLowerCase() : String(dataIdUrl);
  const template = 'id:' + idNormalized + ';request-id:' + xRequestId + ';ts:' + ts + ';';

  const computed = crypto
    .createHmac('sha256', sec)
    .update(template)
    .digest('hex');

  return computed === v1;
}

function generatePedidoId() {
  return (Date.now() * 1000) + Math.floor(Math.random() * 1000);
}

function normalizeAmountCents(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

async function upsertIntentStatus(intentId, patch) {
  const intentsCol = await getCollection('payment_intents');
  await intentsCol.updateOne(
    { intentId: String(intentId) },
    {
      $set: {
        ...patch,
        updatedAt: nowIso()
      }
    }
  );
}

async function createOrderFromIntentApproved(intent, pay) {
  const pedidosCol = await getCollection('pedidos');
  const intentsCol = await getCollection('payment_intents');

  const existingOrderId = intent && intent.orderId ? intent.orderId : null;
  if (existingOrderId) return { ok: true, orderId: existingOrderId, created: false };

  const intentAmountCents = normalizeAmountCents(intent && intent.amount);
  const paidAmountCents = normalizeAmountCents(pay && pay.transaction_amount);
  if (intentAmountCents == null || paidAmountCents == null || intentAmountCents !== paidAmountCents) {
    await upsertIntentStatus(intent.intentId, {
      status: 'rejected',
      mpStatus: safeStr(pay && pay.status),
      mpStatusDetail: safeStr(pay && pay.status_detail),
      mpPaymentId: pay && pay.id ? String(pay.id) : (intent.mpPaymentId || '')
    });
    return { ok: false, error: 'amount_mismatch' };
  }

  const pedidoId = generatePedidoId();
  const draft = (intent && typeof intent.draft === 'object' && intent.draft) ? intent.draft : {};
  const pedido = {
    id: pedidoId,
    dataCriacao: nowIso(),
    data: nowIso(),
    timestamp: pedidoId,
    status: 'em_preparo',
    statusPagamento: 'pago',
    formaPagamento: 'pix',
    formaPagamentoDetalhe: 'mercadopago',
    total: Number(intent.amount),
    subtotal: Number(draft.subtotal || 0),
    desconto: Number(draft.desconto || 0),
    taxaEntrega: Number(draft.taxaEntrega || 0),
    clienteId: null,
    clienteNome: draft.clienteNome || '',
    clienteTelefone: draft.clienteTelefone || '',
    clienteCPF: draft.clienteCPF || '',
    clienteEndereco: draft.clienteEndereco || '',
    observacoes: draft.observacoes || '',
    itens: Array.isArray(draft.itens) ? draft.itens : [],
    cupom: draft.cupom || null,
    payment_intent_id: String(intent.intentId),
    mpPaymentId: pay && pay.id ? String(pay.id) : (intent.mpPaymentId || ''),
    mpPaymentStatus: safeStr(pay && pay.status),
    mpPaymentStatusDetail: safeStr(pay && pay.status_detail),
    dataPagamento: nowIso()
  };

  await pedidosCol.insertOne(pedido);

  await intentsCol.updateOne(
    { intentId: String(intent.intentId), orderId: null },
    {
      $set: {
        status: 'approved',
        mpStatus: safeStr(pay && pay.status),
        mpStatusDetail: safeStr(pay && pay.status_detail),
        mpPaymentId: pay && pay.id ? String(pay.id) : (intent.mpPaymentId || ''),
        orderId: pedidoId,
        updatedAt: nowIso()
      }
    }
  );

  return { ok: true, orderId: pedidoId, created: true };
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
    // Compatibilidade: manter assinatura antiga, mas valida pelo algoritmo oficial do MP.
    return verifyMpWebhookSignature(req, secret);
  } catch (e) {
    return false;
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

      const intentId = getQueryParam(req, 'intentId');
      const pedidoId = getQueryParam(req, 'pedidoId');
      if (!intentId && !pedidoId) {
        return res.status(200).json({ ok: true, pong: true });
      }

      if (intentId) {
        const intentsCol = await getCollection('payment_intents');
        const intent = await intentsCol.findOne({ intentId: String(intentId) });
        if (!intent) return res.status(404).json({ ok: false, error: 'Intent não encontrada' });

        let pay = null;
        if (intent.mpPaymentId) {
          const payResp = await mpFetch('/v1/payments/' + encodeURIComponent(String(intent.mpPaymentId)), accessToken);
          pay = await payResp.json().catch(() => null);
        } else {
          const searchPath = '/v1/payments/search?external_reference=' + encodeURIComponent(String(intentId)) + '&sort=date_created&criteria=desc&limit=1';
          const sResp = await mpFetch(searchPath, accessToken);
          const sJson = await sResp.json().catch(() => null);
          const results = sJson && Array.isArray(sJson.results) ? sJson.results : [];
          pay = results && results.length ? results[0] : null;
        }

        if (!pay) {
          return res.status(200).json({ ok: true, intentId: String(intentId), found: false, status: intent.status || 'pending', orderId: intent.orderId || null });
        }

        await upsertIntentStatus(intentId, {
          status: safeStr(pay && pay.status) || (intent.status || 'pending'),
          mpPaymentId: pay && pay.id ? String(pay.id) : (intent.mpPaymentId || ''),
          mpStatus: safeStr(pay && pay.status),
          mpStatusDetail: safeStr(pay && pay.status_detail)
        });

        const status = safeStr(pay && pay.status);
        let orderId = intent.orderId || null;
        if (status === 'approved') {
          const intentUpdated = await intentsCol.findOne({ intentId: String(intentId) });
          const created = await createOrderFromIntentApproved(intentUpdated || intent, pay);
          if (created && created.ok) orderId = created.orderId;
        }

        return res.status(200).json({ ok: true, intentId: String(intentId), found: true, status: safeStr(pay && pay.status), orderId });
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

    if (secret) {
      const okSig = verifyHmac(req, rawBody, secret);
      if (!okSig) {
        return res.status(401).json({ ok: false, error: 'Assinatura inválida' });
      }
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
    const intentId = safeStr(pay.external_reference || (pay.metadata && (pay.metadata.intentId || pay.metadata.pedidoId)) || '');

    if (!intentId) {
      return res.status(200).json({ ok: true, no_reference: true, status });
    }

    const intentsCol = await getCollection('payment_intents');
    const intent = await intentsCol.findOne({ intentId: String(intentId) });
    if (!intent) {
      // Não criar intent no webhook (não confiar no payload). Apenas registrar status.
      return res.status(200).json({ ok: true, intent_missing: true, intentId: String(intentId), status });
    }

    await upsertIntentStatus(intentId, {
      status: status || (intent.status || 'pending'),
      mpPaymentId: pay && pay.id ? String(pay.id) : (intent.mpPaymentId || ''),
      mpStatus: status,
      mpStatusDetail: safeStr(pay && pay.status_detail)
    });

    let orderId = intent.orderId || null;
    if (status === 'approved') {
      const intentUpdated = await intentsCol.findOne({ intentId: String(intentId) });
      const created = await createOrderFromIntentApproved(intentUpdated || intent, pay);
      if (created && created.ok) orderId = created.orderId;
    }

    return res.status(200).json({ ok: true, topic: type || 'payment', paymentId: pay && pay.id ? String(pay.id) : '', status, intentId: String(intentId), orderId });
  } catch (err) {
    console.error('[MP] webhook erro:', err && err.message ? err.message : err);
    return res.status(200).json({ ok: true, error: 'internal', details: err && err.message ? String(err.message) : String(err) });
  }
};
