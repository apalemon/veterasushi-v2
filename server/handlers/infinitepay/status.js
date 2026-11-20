const { getCollection } = require('../../mongodb');
const { createOrderFromPaidIntent, requestInfinitePay } = require('../../infinitepay');

function safeStr(value) {
  return String(value == null ? '' : value).trim();
}

function getQuery(req, key) {
  try {
    const url = new URL(String(req.url || ''), 'http://localhost');
    return safeStr(url.searchParams.get(key));
  } catch (e) {
    return '';
  }
}

function paymentCheckError(response) {
  const data = response && response.data ? response.data : {};
  return safeStr(data.error || data.message || data.detail) || 'Não foi possível confirmar o pagamento na InfinitePay.';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método não permitido' });

  const handle = safeStr(process.env.INFINITEPAY_HANDLE).replace(/^\$/, '');
  const apiKey = safeStr(process.env.INFINITEPAY_API_KEY);
  if (!handle || !apiKey) {
    return res.status(500).json({ ok: false, error: 'InfinitePay não configurada na Vercel.' });
  }

  const orderNsu = getQuery(req, 'order_nsu');
  if (!orderNsu) return res.status(400).json({ ok: false, error: 'order_nsu é obrigatório' });

  try {
    const intentsCol = await getCollection('payment_intents');
    const intent = await intentsCol.findOne({ intentId: orderNsu, provider: 'infinitepay' });
    if (!intent) return res.status(404).json({ ok: false, error: 'Pagamento não encontrado' });
    if (intent.orderId) {
      return res.status(200).json({ ok: true, status: 'approved', orderId: intent.orderId });
    }

    const transactionNsu = getQuery(req, 'transaction_nsu') || safeStr(intent.infinitePayTransactionNsu);
    const slug = getQuery(req, 'slug') || safeStr(intent.infinitePayInvoiceSlug);
    if (!transactionNsu || !slug) {
      return res.status(400).json({
        ok: false,
        error: 'A InfinitePay não retornou os identificadores necessários para confirmar este pagamento.'
      });
    }

    const response = await requestInfinitePay('/payment_check', {
      handle,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug
    });
    if (!response.ok || !response.data || response.data.success !== true) {
      return res.status(502).json({
        ok: false,
        error: paymentCheckError(response),
        providerStatus: response.status
      });
    }

    if (response.data.paid !== true) {
      await intentsCol.updateOne(
        { intentId: orderNsu, status: { $ne: 'approved' } },
        {
          $set: {
            status: 'pending',
            infinitePayTransactionNsu: transactionNsu,
            infinitePayInvoiceSlug: slug,
            updatedAt: new Date().toISOString()
          }
        }
      );
      return res.status(200).json({ ok: true, status: 'pending', orderNsu });
    }

    const result = await createOrderFromPaidIntent(intent, {
      ...response.data,
      transaction_nsu: transactionNsu,
      invoice_slug: slug
    });

    if (!result.ok) {
      return res.status(409).json({
        ok: false,
        status: result.status,
        error: result.status === 'amount_mismatch'
          ? 'O valor confirmado pela InfinitePay não corresponde ao pedido.'
          : 'Não foi possível registrar automaticamente este pagamento.'
      });
    }

    return res.status(200).json({
      ok: true,
      status: result.orderId ? 'approved' : (result.status || 'pending'),
      orderId: result.orderId || null,
      orderNsu
    });
  } catch (error) {
    console.error('[InfinitePay] Erro ao consultar pagamento:', error);
    return res.status(500).json({
      ok: false,
      error: 'Erro interno ao consultar o pagamento.',
      details: safeStr(error && error.message)
    });
  }
};
