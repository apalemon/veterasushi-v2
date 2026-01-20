const { getCollection } = require('../../mongodb');

function safeStr(v) {
  return String(v == null ? '' : v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePedidoId(v) {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const s = safeStr(v);
  return s ? s : null;
}

function chatPedidoIdQuery(pedidoId) {
  const n = Number(pedidoId);
  if (Number.isFinite(n)) {
    return { $or: [{ pedidoId: n }, { pedidoId: String(n) }] };
  }
  const s = safeStr(pedidoId);
  return s ? { $or: [{ pedidoId: s }, { pedidoId: Number(s) }] } : { pedidoId: null };
}

async function getPedidoById(pedidosCol, pedidoId) {
  // tenta número e string
  const q = typeof pedidoId === 'number'
    ? { $or: [{ id: pedidoId }, { id: String(pedidoId) }] }
    : { $or: [{ id: pedidoId }, { id: Number(pedidoId) }] };
  return await pedidosCol.findOne(q);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const chatsCol = await getCollection('chats');
  const pedidosCol = await getCollection('pedidos');

  // GET /api/chat/cliente?pedidoId=123&token=...&since=ISO
  if (req.method === 'GET') {
    try {
      let pedidoId = null;
      let token = '';
      let since = '';
      try {
        const u = new URL(String(req.url || ''), 'http://localhost');
        pedidoId = normalizePedidoId(u.searchParams.get('pedidoId'));
        token = safeStr(u.searchParams.get('token'));
        since = safeStr(u.searchParams.get('since'));
      } catch (e) {}

      if (!pedidoId || !token) {
        return res.status(400).json({ ok: false, error: 'pedidoId e token são obrigatórios' });
      }

      const pedido = await getPedidoById(pedidosCol, pedidoId);
      if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });

      if (!pedido.chatToken || safeStr(pedido.chatToken) !== token) {
        return res.status(403).json({ ok: false, error: 'Token inválido' });
      }

      const chat = await chatsCol.findOne(chatPedidoIdQuery(pedido.id));
      const msgs = (chat && Array.isArray(chat.messages)) ? chat.messages : [];

      let filtered = msgs;
      if (since) {
        const sinceMs = new Date(since).getTime();
        if (Number.isFinite(sinceMs)) {
          filtered = msgs.filter(m => new Date(m.ts || 0).getTime() > sinceMs);
        }
      }

      return res.status(200).json({
        ok: true,
        pedidoId: pedido.id,
        messages: filtered,
        serverTime: nowIso()
      });
    } catch (err) {
      console.error('[CHAT/CLIENTE] GET erro:', err.message);
      return res.status(500).json({ ok: false, error: 'Erro ao carregar mensagens' });
    }
  }

  // POST /api/chat/cliente  { pedidoId, token, text }
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const pedidoId = normalizePedidoId(body.pedidoId);
      const token = safeStr(body.token);
      const text = safeStr(body.text);

      if (!pedidoId || !token || !text) {
        return res.status(400).json({ ok: false, error: 'pedidoId, token e text são obrigatórios' });
      }
      if (text.length > 800) {
        return res.status(400).json({ ok: false, error: 'Mensagem muito longa' });
      }

      const pedido = await getPedidoById(pedidosCol, pedidoId);
      if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });

      if (!pedido.chatToken || safeStr(pedido.chatToken) !== token) {
        return res.status(403).json({ ok: false, error: 'Token inválido' });
      }

      const msg = {
        id: Date.now(),
        from: 'cliente',
        text,
        ts: nowIso()
      };

      await chatsCol.updateOne(
        chatPedidoIdQuery(pedido.id),
        {
          $setOnInsert: { pedidoId: pedido.id, createdAt: nowIso() },
          $set: { updatedAt: nowIso(), clienteTelefone: pedido.clienteTelefone || '', clienteNome: pedido.clienteNome || '' },
          $push: { messages: { $each: [msg], $slice: -300 } }
        },
        { upsert: true }
      );

      return res.status(200).json({ ok: true, message: msg });
    } catch (err) {
      console.error('[CHAT/CLIENTE] POST erro:', err.message);
      return res.status(500).json({ ok: false, error: 'Erro ao enviar mensagem' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' });
};

