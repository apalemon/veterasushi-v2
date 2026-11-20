const { getCollection } = require('../../mongodb');
const { createOrderFromPaidIntent, requestInfinitePay } = require('../../infinitepay');

function safeStr(value) {
  return String(value == null ? '' : value).trim();
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
    return res.status(500).json({ ok: false, error: 'InfinitePay não configurada na Vercel.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const event = safeStr(body.event || body.type).toLowerCase();
  if (event && event !== 'paid' && event !== 'settled') {
    return res.status(200).json({ ok: true, ignored: true, event });
  }

  const orderNsu = safeStr(body.order_nsu);
  const transactionNsu = safeStr(body.transaction_nsu);
  const slug = safeStr(body.invoice_slug || body.slug);
  if (!orderNsu || !transactionNsu || !slug) {
    return res.status(400).json({ ok: false, error: 'Notificação sem os identificadores do pagamento.' });
  }

  try {
    const intentsCol = await getCollection('payment_intents');
    const intent = await intentsCol.findOne({ intentId: orderNsu, provider: 'infinitepay' });
    if (!intent) return res.status(200).json({ ok: true, ignored: true });

    const response = await requestInfinitePay('/payment_check', {
      handle,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug
    });
    if (!response.ok || !response.data || response.data.success !== true) {
      console.error('[InfinitePay] Falha ao validar webhook:', response.status, response.data || response.raw);
      return res.status(502).json({ ok: false, error: 'Não foi possível validar a notificação com a InfinitePay.' });
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
      return res.status(200).json({ ok: true, status: 'pending' });
    }

    const result = await createOrderFromPaidIntent(intent, {
      ...response.data,
      transaction_nsu: transactionNsu,
      invoice_slug: slug,
      receipt_url: safeStr(body.receipt_url)
    });

    if (!result.ok) {
      console.error('[InfinitePay] Pagamento requer revisão:', orderNsu, result.status);
      return res.status(200).json({ ok: false, status: result.status });
    }

    return res.status(200).json({ ok: true, status: 'approved', orderId: result.orderId || null });
  } catch (error) {
    console.error('[InfinitePay] Erro ao processar webhook:', error);
    return res.status(500).json({ ok: false, error: 'Erro interno ao processar o webhook.' });
  }
};
