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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Print-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!requirePrintToken(req, res)) return;

  try {
    const pedidosCol = await getCollection('pedidos');

    let limit = 10;
    try {
      const u = new URL(String(req.url || ''), 'http://localhost');
      const q = u.searchParams.get('limit');
      const n = Number(q);
      if (Number.isFinite(n) && n > 0) limit = Math.min(50, Math.max(1, Math.floor(n)));
    } catch (e) {}

    const query = {
      statusPagamento: 'pago',
      $or: [
        { printStatus: { $exists: false } },
        { printStatus: null },
        { printStatus: '' },
        { printStatus: 'pending' },
        { printStatus: 'error' }
      ]
    };

    const pedidos = await pedidosCol
      .find(query)
      .sort({ dataPagamento: -1, dataCriacao: -1, data: -1, timestamp: -1 })
      .limit(limit)
      .toArray();

    const clean = (pedidos || []).map(p => {
      const { _id, ...rest } = p;
      return rest;
    });

    return res.status(200).json({ ok: true, serverTime: nowIso(), pedidos: clean });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', details: e && e.message ? String(e.message) : String(e) });
  }
};
