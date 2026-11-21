const crypto = require('crypto');
const { getCollection } = require('../../mongodb');
const { amountToCents, requestInfinitePay } = require('../../infinitepay');
const { avaliarStatusLoja } = require('../../loja-status');

const DEFAULT_PUBLIC_BASE_URL = 'https://www.veterasushi.bar';

function safeStr(value) {
  return String(value == null ? '' : value).trim();
}

function getPublicBaseUrl(req) {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return DEFAULT_PUBLIC_BASE_URL;
  }

  const configured = safeStr(process.env.PUBLIC_BASE_URL);
  if (configured) {
    const url = new URL(configured);
    return url.origin;
  }

  const headers = req && req.headers ? req.headers : {};
  const host = safeStr(headers['x-forwarded-host'] || headers.host).split(',')[0].trim();
  const proto = safeStr(headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  if (!host) throw new Error('PUBLIC_BASE_URL não configurada e host da requisição ausente');
  const url = new URL(proto + '://' + host);
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && url.protocol !== 'https:') {
    throw new Error('A URL pública precisa usar HTTPS em produção');
  }
  return url.origin;
}

function phoneWithCountryCode(value) {
  const digits = safeStr(value).replace(/\D/g, '');
  if (!digits) return '';
  return '+' + (digits.startsWith('55') ? digits : '55' + digits);
}

function providerError(response) {
  const data = response && response.data ? response.data : {};
  return safeStr(data.error || data.message || data.detail) || 'A InfinitePay não retornou um link de checkout válido.';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' });

  const handle = safeStr(process.env.INFINITEPAY_HANDLE).replace(/^\$/, '');
  const apiKey = safeStr(process.env.INFINITEPAY_API_KEY);
  if (!handle || !apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'InfinitePay não configurada. Defina INFINITEPAY_HANDLE e INFINITEPAY_API_KEY nas variáveis de ambiente da Vercel.'
    });
  }

  let baseUrl;
  try {
    baseUrl = getPublicBaseUrl(req);
    const baseHostname = new URL(baseUrl).hostname;
    if (
      baseHostname.endsWith('.vercel.app') &&
      !safeStr(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    ) {
      throw new Error('Ative o Protection Bypass for Automation na Vercel para permitir a confirmação dos pagamentos.');
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : null;
  const amountCents = amountToCents(body.amount);

  if (!draft) return res.status(400).json({ ok: false, error: 'draft é obrigatório' });
  if (amountCents == null || amountCents < 100) {
    return res.status(400).json({ ok: false, error: 'O pagamento mínimo da InfinitePay é R$ 1,00.' });
  }

  const draftAmountCents = amountToCents(draft.total);
  if (draftAmountCents !== amountCents) {
    return res.status(400).json({ ok: false, error: 'O valor do pagamento não corresponde ao total do pedido.' });
  }

  try {
    const horariosCol = await getCollection('horarios');
    const horarios = await horariosCol.findOne({ _id: 'main' });
    const statusLoja = avaliarStatusLoja(horarios || {});
    if (!statusLoja.aberta) {
      return res.status(409).json({ ok: false, error: statusLoja.mensagem });
    }
  } catch (error) {
    console.error('[InfinitePay] Não foi possível confirmar se a loja está aberta:', error);
    return res.status(503).json({
      ok: false,
      error: 'Não foi possível confirmar o funcionamento da loja. Tente novamente em instantes.'
    });
  }

  const orderNsu = crypto.randomBytes(16).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
  const intentDoc = {
    intentId: orderNsu,
    orderNsu,
    provider: 'infinitepay',
    status: 'pending',
    amount: amountCents / 100,
    amountCents,
    draft,
    orderId: null,
    createdAt,
    updatedAt: createdAt
  };

  const intentsCol = await getCollection('payment_intents');
  await intentsCol.insertOne(intentDoc);

  const webhookUrl = new URL('/api/infinitepay/webhook', baseUrl);
  const vercelBypassSecret = safeStr(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  if (vercelBypassSecret) {
    webhookUrl.searchParams.set('x-vercel-protection-bypass', vercelBypassSecret);
  }

  const phoneNumber = phoneWithCountryCode(draft.clienteTelefone);
  const payload = {
    handle,
    order_nsu: orderNsu,
    items: [{
      quantity: 1,
      price: amountCents,
      description: 'Pedido Vetera Sushi'
    }],
    redirect_url: baseUrl + '/vetera/cardapio',
    webhook_url: webhookUrl.toString(),
    options: {
      single_payment: true,
      valid_until: expiresAt
    },
    ...(draft.clienteNome || phoneNumber ? {
      customer: {
        ...(draft.clienteNome ? { name: safeStr(draft.clienteNome) } : {}),
        ...(phoneNumber ? { phone_number: phoneNumber } : {})
      }
    } : {}),
    ...(draft.enderecoEntrega ? { address: draft.enderecoEntrega } : {})
  };

  try {
    const response = await requestInfinitePay('/links', payload);
    const responseData = response && response.data ? response.data : {};
    const checkoutUrl = safeStr(responseData.url || responseData.checkout_url || responseData.link);

    if (!response.ok || !checkoutUrl) {
      await intentsCol.updateOne(
        { intentId: orderNsu },
        { $set: { status: 'failed', providerError: providerError(response), updatedAt: new Date().toISOString() } }
      );
      return res.status(502).json({
        ok: false,
        error: 'Não foi possível criar o checkout da InfinitePay.',
        providerStatus: response.status,
        details: providerError(response)
      });
    }

    let parsedCheckoutUrl;
    try { parsedCheckoutUrl = new URL(checkoutUrl); } catch (e) {}
    if (!parsedCheckoutUrl || parsedCheckoutUrl.protocol !== 'https:') {
      await intentsCol.updateOne(
        { intentId: orderNsu },
        { $set: { status: 'failed', providerError: 'URL de checkout inválida', updatedAt: new Date().toISOString() } }
      );
      return res.status(502).json({ ok: false, error: 'A InfinitePay retornou uma URL de checkout inválida.' });
    }

    await intentsCol.updateOne(
      { intentId: orderNsu },
      {
        $set: {
          checkoutUrl,
          expiresAt,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return res.status(200).json({ ok: true, orderNsu, checkoutUrl });
  } catch (error) {
    await intentsCol.updateOne(
      { intentId: orderNsu },
      {
        $set: {
          status: 'failed',
          providerError: safeStr(error && error.message) || 'Erro de comunicação com a InfinitePay',
          updatedAt: new Date().toISOString()
        }
      }
    );
    console.error('[InfinitePay] Erro ao criar checkout:', error);
    return res.status(502).json({
      ok: false,
      error: 'Erro ao criar checkout na InfinitePay.',
      details: safeStr(error && error.message)
    });
  }
};
