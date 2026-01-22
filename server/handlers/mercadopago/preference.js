const crypto = require('crypto');
const { getCollection } = require('../../mongodb');
const https = require('https');

function safeStr(v) {
  return String(v == null ? '' : v).trim();
}

function firstNonEmptyStr(...values) {
  for (const v of values) {
    const s = safeStr(v);
    if (s) return s;
  }
  return '';
}

function nowIso() {
  return new Date().toISOString();
}

function generateIntentId() {
  return (Date.now() * 1000) + Math.floor(Math.random() * 1000);
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

async function mpFetch(path, accessToken, init) {
  const url = 'https://api.mercadopago.com' + path;
  const resp = await fetchCompat(url, {
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
    const title = safeStr(body.title) || 'Pedido Vetera Sushi';
    const amount = Number(body.amount);
    const draft = (body && typeof body.draft === 'object' && body.draft) ? body.draft : {};

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'amount é obrigatório' });
    }

    const intentsCol = await getCollection('payment_intents');
    const intentId = safeStr(body.intentId) || String(generateIntentId());

    // Upsert do intent (permite reuso idempotente quando cliente reenvia)
    try {
      await intentsCol.updateOne(
        { intentId: String(intentId) },
        {
          $setOnInsert: {
            intentId: String(intentId),
            type: 'card',
            amount: Number(amount),
            status: 'pending',
            createdAt: nowIso(),
            orderId: null
          },
          $set: {
            type: 'card',
            amount: Number(amount),
            draft: draft,
            updatedAt: nowIso()
          }
        },
        { upsert: true }
      );
    } catch (e) {}

    const proto = firstNonEmptyStr(
      req && req.headers ? (req.headers['x-forwarded-proto'] || req.headers['X-Forwarded-Proto']) : '',
      'https'
    );
    const host = firstNonEmptyStr(req && req.headers ? (req.headers['x-forwarded-host'] || req.headers['host']) : '');
    const baseUrl = process.env.PUBLIC_BASE_URL || (host ? (proto + '://' + host) : null);

    const slug = firstNonEmptyStr(
      body.slug,
      body.lojaSlug,
      (draft && draft.slug) || '',
      (draft && draft.lojaSlug) || '',
      'vetera'
    );

    const cardapioPath = '/' + encodeURIComponent(String(slug)) + '/cardapio';
    const backUrls = {
      success: baseUrl ? baseUrl + cardapioPath + '?mp=success&intentId=' + encodeURIComponent(String(intentId)) : undefined,
      pending: baseUrl ? baseUrl + cardapioPath + '?mp=pending&intentId=' + encodeURIComponent(String(intentId)) : undefined,
      failure: baseUrl ? baseUrl + cardapioPath + '?mp=failure&intentId=' + encodeURIComponent(String(intentId)) : undefined
    };

    const webhookUrl = process.env.MP_WEBHOOK_URL || (baseUrl ? (baseUrl + '/api/mercadopago/webhook') : undefined);

    const preferencePayload = {
      items: [
        {
          id: String(intentId),
          title,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(amount)
        }
      ],
      external_reference: String(intentId),
      notification_url: webhookUrl,
      back_urls: backUrls,
      auto_return: 'approved',
      metadata: {
        intentId: String(intentId)
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

    // salvar refs do MP no intent
    try {
      await intentsCol.updateOne(
        { intentId: String(intentId) },
        {
          $set: {
            mpPreferenceId: preferenceId,
            mpInitPoint: initPoint,
            mpSandboxInitPoint: sandboxInitPoint,
            mpUpdatedAt: nowIso(),
            updatedAt: nowIso()
          }
        }
      );
    } catch (e) {}

    return res.status(200).json({ ok: true, intentId: String(intentId), preferenceId, init_point: initPoint, sandbox_init_point: sandboxInitPoint });
  } catch (err) {
    console.error('[MP] preference erro:', err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: 'Erro ao criar pagamento', details: err && err.message ? err.message : String(err) });
  }
};
