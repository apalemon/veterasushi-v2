const { getCollection } = require('../mongodb');

function nowIso() {
  return new Date().toISOString();
}

function getToken(req) {
  try {
    const h = req.headers || {};
    const auth = h.authorization || h.Authorization || '';
    const x = h['x-print-token'] || h['X-Print-Token'] || '';
    if (x) return String(x).trim();
    if (auth && String(auth).toLowerCase().startsWith('bearer ')) return String(auth).slice(7).trim();
    return '';
  } catch (e) {
    return '';
  }
}

function requirePrintToken(req, res) {
  const expected = String(process.env.PRINT_APP_TOKEN || '').trim();
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'PRINT_APP_TOKEN_not_configured' });
  }
  const got = getToken(req);
  if (!got || got !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return true;
}

function normalizePedidoIdQuery(pedidoId) {
  const idNum = Number(pedidoId);
  if (Number.isFinite(idNum)) {
    return { $or: [{ id: idNum }, { id: String(idNum) }] };
  }
  return { $or: [{ id: String(pedidoId) }, { id: Number(pedidoId) }] };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Print-Token');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!requirePrintToken(req, res)) return;

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const pedidoId = body.pedidoId != null ? body.pedidoId : body.id;
    if (!pedidoId) return res.status(400).json({ ok: false, error: 'pedidoId_required' });

    const status = body.status ? String(body.status) : 'printed';
    const printedAt = body.printedAt ? String(body.printedAt) : nowIso();

    const pedidosCol = await getCollection('pedidos');
    const q = normalizePedidoIdQuery(pedidoId);

    const existing = await pedidosCol.findOne(q);
    if (!existing) return res.status(404).json({ ok: false, error: 'pedido_not_found' });

    if (String(existing.printStatus || '') === 'printed' && existing.printedAt) {
      const { _id, ...rest } = existing;
      return res.status(200).json({ ok: true, already: true, pedido: rest });
    }

    await pedidosCol.updateOne(q, {
      $set: {
        printStatus: status,
        printedAt: printedAt,
        printUpdatedAt: nowIso()
      }
    });

    const updated = await pedidosCol.findOne(q);
    const { _id, ...rest } = updated || {};
    return res.status(200).json({ ok: true, already: false, pedido: rest });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', details: e && e.message ? String(e.message) : String(e) });
  }
};
