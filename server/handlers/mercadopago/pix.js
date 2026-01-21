const crypto = require('crypto');
const https = require('https');
const { getCollection } = require('../../mongodb');

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

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

async function mpRequest(path, accessToken, init) {
  const url = 'https://api.mercadopago.com' + path;
  return await fetchCompat(url, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(init && init.headers ? init.headers : {})
    }
  });
}

function makeIntentId() {
  try {
    return crypto.randomBytes(16).toString('hex');
  } catch (e) {
    return String(Date.now()) + '_' + String(Math.floor(Math.random() * 1e9));
  }
}

function normalizeEmail(email, telefone) {
  const e = safeStr(email);
  if (e && e.includes('@')) return e;
  const digits = String(telefone || '').replace(/\D/g, '');
  if (digits) return 'cliente_' + digits + '@example.com';
  return 'cliente_' + makeIntentId().slice(0, 8) + '@example.com';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ ok: false, error: 'Mercado Pago não configurado (MP_ACCESS_TOKEN ausente)' });
  }

  const intentsCol = await getCollection('payment_intents');

  if (req.method === 'GET') {
    try {
      const u = new URL(String(req.url || ''), 'http://localhost');
      const intentId = safeStr(u.searchParams.get('intentId') || '');
      if (!intentId) {
        return res.status(400).json({ ok: false, error: 'intentId é obrigatório' });
      }

      const intent = await intentsCol.findOne({ intentId });
      if (!intent) return res.status(404).json({ ok: false, error: 'Intent não encontrada' });

      const clean = { ...intent };
      delete clean._id;
      return res.status(200).json({ ok: true, intent: clean });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Erro ao consultar intent', details: e && e.message ? String(e.message) : String(e) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido' });
  }

  try {
    const body = (typeof req.body === 'object' && req.body) ? req.body : {};

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'amount inválido' });
    }

    const draft = (typeof body.draft === 'object' && body.draft) ? body.draft : null;
    if (!draft) {
      return res.status(400).json({ ok: false, error: 'draft é obrigatório' });
    }

    const clienteTelefone = safeStr(draft.clienteTelefone || body.telefone || '');
    const payerEmail = normalizeEmail(body.email || draft.clienteEmail, clienteTelefone);
    const payerName = safeStr(draft.clienteNome || body.nome || 'Cliente');

    const intentId = makeIntentId();

    const proto = firstNonEmptyStr(
      req && req.headers ? (req.headers['x-forwarded-proto'] || req.headers['X-Forwarded-Proto']) : '',
      'https'
    );
    const host = firstNonEmptyStr(req && req.headers ? (req.headers['x-forwarded-host'] || req.headers['host']) : '');
    const baseUrl = process.env.PUBLIC_BASE_URL || (host ? (proto + '://' + host) : null);
    const webhookUrl = process.env.MP_WEBHOOK_URL || (baseUrl ? (baseUrl + '/api/mercadopago/webhook') : undefined);

    const hasPublicWebhook = Boolean(process.env.MP_WEBHOOK_URL || process.env.PUBLIC_BASE_URL);

    const paymentPayload = {
      transaction_amount: Number(amount),
      description: safeStr(body.description) || ('Pedido Vetera - ' + intentId),
      payment_method_id: 'pix',
      payer: {
        email: payerEmail,
        first_name: payerName
      },
      external_reference: intentId,
      metadata: {
        intentId
      }
    };

    // Em ambiente local (sem domínio público), o MP pode rejeitar notification_url.
    // Só enviar quando houver URL público explicitamente configurado.
    if (hasPublicWebhook && webhookUrl) {
      paymentPayload.notification_url = webhookUrl;
    }

    const mpResp = await mpRequest('/v1/payments', accessToken, {
      method: 'POST',
      body: JSON.stringify(paymentPayload)
    });

    const mpText = await mpResp.text().catch(() => '');
    const mp = (() => {
      try { return JSON.parse(mpText || 'null'); } catch (e) { return null; }
    })();

    if (!mpResp.ok || !mp) {
      return res.status(500).json({
        ok: false,
        error: 'Falha ao criar pagamento PIX',
        status: mpResp.status,
        details: mp,
        raw: mpText
      });
    }

    const tx = mp && mp.point_of_interaction && mp.point_of_interaction.transaction_data ? mp.point_of_interaction.transaction_data : null;
    const qrCode = safeStr(tx && tx.qr_code);
    const qrCodeBase64 = safeStr(tx && tx.qr_code_base64);

    const intentDoc = {
      intentId,
      provider: 'mercadopago',
      status: safeStr(mp.status) || 'pending',
      amount: Number(amount),
      currency_id: safeStr(mp.currency_id) || 'BRL',
      mpPaymentId: mp && mp.id ? String(mp.id) : '',
      mpStatus: safeStr(mp.status),
      mpStatusDetail: safeStr(mp.status_detail),
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      draft,
      orderId: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await intentsCol.insertOne(intentDoc);

    return res.status(200).json({
      ok: true,
      intentId,
      status: intentDoc.status,
      mpPaymentId: intentDoc.mpPaymentId,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'Erro ao criar intent PIX',
      details: err && err.message ? String(err.message) : String(err),
      hint: 'Verifique MP_ACCESS_TOKEN e a conexão com o MongoDB (payment_intents).'
    });
  }
};
