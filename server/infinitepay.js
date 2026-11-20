const https = require('https');
const { getCollection } = require('./mongodb');

function requestInfinitePay(path, payload) {
  const apiKey = String(process.env.INFINITEPAY_API_KEY || '').trim();
  const body = JSON.stringify(payload || {});

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.checkout.infinitepay.io',
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(apiKey ? { 'X-Api-Key': apiKey } : {})
        }
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { responseBody += chunk; });
        response.on('end', () => {
          const status = Number(response.statusCode || 0);
          let data = null;
          try { data = JSON.parse(responseBody || 'null'); } catch (e) {}
          resolve({
            ok: status >= 200 && status < 300,
            status,
            data,
            raw: responseBody
          });
        });
      }
    );

    request.setTimeout(15000, () => {
      request.destroy(new Error('Tempo esgotado ao consultar a InfinitePay'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function nowIso() {
  return new Date().toISOString();
}

function amountToCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function generatePedidoId() {
  return (Date.now() * 1000) + Math.floor(Math.random() * 1000);
}

async function createOrderFromPaidIntent(intent, payment) {
  const intentsCol = await getCollection('payment_intents');
  const pedidosCol = await getCollection('pedidos');
  const intentId = String(intent && intent.intentId || '');
  const expectedAmount = Number(intent && intent.amountCents);
  const receivedAmount = Number(payment && payment.amount);

  if (!Number.isInteger(expectedAmount) || expectedAmount !== receivedAmount) {
    await intentsCol.updateOne(
      { intentId, status: { $ne: 'approved' } },
      {
        $set: {
          status: 'amount_mismatch',
          infinitePayPaymentCheck: payment || null,
          updatedAt: nowIso()
        }
      }
    );
    return { ok: false, status: 'amount_mismatch' };
  }

  const captureMethod = String(payment && payment.capture_method || '').trim().toLowerCase();
  const formaPagamento = captureMethod === 'credit_card'
    ? 'cartao'
    : captureMethod === 'pix'
      ? 'pix'
      : '';

  if (!formaPagamento) {
    await intentsCol.updateOne(
      { intentId, status: { $ne: 'approved' } },
      {
        $set: {
          status: 'manual_review',
          infinitePayCaptureMethod: captureMethod,
          updatedAt: nowIso()
        }
      }
    );
    return { ok: false, status: 'manual_review' };
  }

  const existingOrder = await pedidosCol.findOne({ payment_intent_id: intentId });
  if (existingOrder) {
    await intentsCol.updateOne(
      { intentId },
      {
        $set: {
          status: 'approved',
          orderId: existingOrder.id,
          infinitePayTransactionNsu: String(payment.transaction_nsu || intent.infinitePayTransactionNsu || ''),
          infinitePayInvoiceSlug: String(payment.invoice_slug || intent.infinitePayInvoiceSlug || ''),
          updatedAt: nowIso()
        }
      }
    );
    return { ok: true, orderId: existingOrder.id };
  }

  if (intent.orderId) return { ok: true, orderId: intent.orderId };

  const lock = await intentsCol.updateOne(
    {
      intentId,
      orderId: null,
      $or: [
        { status: { $ne: 'processing' } },
        { updatedAt: { $lt: new Date(Date.now() - 60000).toISOString() } }
      ]
    },
    {
      $set: {
        status: 'processing',
        infinitePayTransactionNsu: String(payment.transaction_nsu || intent.infinitePayTransactionNsu || ''),
        infinitePayInvoiceSlug: String(payment.invoice_slug || intent.infinitePayInvoiceSlug || ''),
        updatedAt: nowIso()
      }
    }
  );

  if (!lock.matchedCount) {
    const currentIntent = await intentsCol.findOne({ intentId });
    return {
      ok: true,
      orderId: currentIntent && currentIntent.orderId ? currentIntent.orderId : null,
      status: currentIntent && currentIntent.status ? currentIntent.status : 'pending'
    };
  }

  const pedidoId = generatePedidoId();
  const draft = intent && typeof intent.draft === 'object' && intent.draft ? intent.draft : {};
  const pedido = {
    id: pedidoId,
    dataCriacao: nowIso(),
    data: nowIso(),
    timestamp: pedidoId,
    status: 'em_preparo',
    statusPagamento: 'pago',
    formaPagamento,
    formaPagamentoDetalhe: 'infinitepay',
    paymentProvider: 'infinitepay',
    printStatus: 'pending',
    printedAt: null,
    total: expectedAmount / 100,
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
    payment_intent_id: intentId,
    infinitePayTransactionNsu: String(payment.transaction_nsu || intent.infinitePayTransactionNsu || ''),
    infinitePayInvoiceSlug: String(payment.invoice_slug || intent.infinitePayInvoiceSlug || ''),
    infinitePayReceiptUrl: String(payment.receipt_url || ''),
    infinitePayPaymentMethod: captureMethod,
    dataPagamento: nowIso()
  };

  try {
    await pedidosCol.insertOne(pedido);
    await intentsCol.updateOne(
      { intentId },
      {
        $set: {
          status: 'approved',
          orderId: pedidoId,
          infinitePayTransactionNsu: pedido.infinitePayTransactionNsu,
          infinitePayInvoiceSlug: pedido.infinitePayInvoiceSlug,
          updatedAt: nowIso()
        }
      }
    );
  } catch (error) {
    await intentsCol.updateOne(
      { intentId, status: 'processing', orderId: null },
      { $set: { status: 'pending', updatedAt: nowIso() } }
    );
    throw error;
  }

  return { ok: true, orderId: pedidoId };
}

module.exports = {
  amountToCents,
  createOrderFromPaidIntent,
  requestInfinitePay
};
