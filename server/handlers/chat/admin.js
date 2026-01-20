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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const chatsCol = await getCollection('chats');

  // GET /api/chat/admin            -> lista conversas
  // GET /api/chat/admin?pedidoId=1 -> mensagens de um pedido
  if (req.method === 'GET') {
    try {
      let pedidoId = null;
      try {
        const u = new URL(String(req.url || ''), 'http://localhost');
        pedidoId = normalizePedidoId(u.searchParams.get('pedidoId'));
      } catch (e) {}

      if (pedidoId) {
        const chat = await chatsCol.findOne(chatPedidoIdQuery(pedidoId));
        const msgs = (chat && Array.isArray(chat.messages)) ? chat.messages : [];
        return res.status(200).json({ ok: true, pedidoId, chat: { ...chat, messages: msgs, _id: undefined } });
      }

      const chats = await chatsCol
        .find({})
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(200)
        .toArray();

      const list = chats.map(c => {
        const msgs = Array.isArray(c.messages) ? c.messages : [];
        const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const { _id, ...rest } = c;
        return {
          ...rest,
          lastMessage: last ? { from: last.from, text: last.text, ts: last.ts } : null,
          messagesCount: msgs.length
        };
      });

      return res.status(200).json({ ok: true, chats: list, serverTime: nowIso() });
    } catch (err) {
      console.error('[CHAT/ADMIN] GET erro:', err.message);
      return res.status(500).json({ ok: false, error: 'Erro ao carregar chats' });
    }
  }

  // POST /api/chat/admin { pedidoId, text }
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const pedidoId = normalizePedidoId(body.pedidoId);
      const text = safeStr(body.text);

      if (!pedidoId || !text) {
        return res.status(400).json({ ok: false, error: 'pedidoId e text são obrigatórios' });
      }
      if (text.length > 800) return res.status(400).json({ ok: false, error: 'Mensagem muito longa' });

      const msg = { id: Date.now(), from: 'admin', text, ts: nowIso() };

      await chatsCol.updateOne(
        chatPedidoIdQuery(pedidoId),
        {
          $setOnInsert: { pedidoId, createdAt: nowIso() },
          $set: { updatedAt: nowIso() },
          $push: { messages: { $each: [msg], $slice: -300 } }
        },
        { upsert: true }
      );

      return res.status(200).json({ ok: true, message: msg });
    } catch (err) {
      console.error('[CHAT/ADMIN] POST erro:', err.message);
      return res.status(500).json({ ok: false, error: 'Erro ao enviar mensagem' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' });
};

