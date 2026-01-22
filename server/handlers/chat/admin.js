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

function chatVisitorQuery(visitorId) {
  const v = safeStr(visitorId);
  return v ? { chatType: 'visitor', visitorId: v } : { chatType: 'visitor', visitorId: null };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  function isTransientDbError(msg) {
    const m = String(msg || '');
    return /tls|ssl|handshake|timeout|timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|connection/i.test(m);
  }

  // GET /api/chat/admin            -> lista conversas
  // GET /api/chat/admin?pedidoId=1 -> mensagens de um pedido
  // GET /api/chat/admin?visitorId=v_... -> mensagens de atendimento
  if (req.method === 'GET') {
    try {
      const chatsCol = await getCollection('chats');

      let pedidoId = null;
      let visitorId = '';
      try {
        const u = new URL(String(req.url || ''), 'http://localhost');
        pedidoId = normalizePedidoId(u.searchParams.get('pedidoId'));
        visitorId = safeStr(u.searchParams.get('visitorId'));
      } catch (e) {}

      if (pedidoId) {
        const chat = await chatsCol.findOne(chatPedidoIdQuery(pedidoId));
        const msgs = (chat && Array.isArray(chat.messages)) ? chat.messages : [];
        return res.status(200).json({ ok: true, pedidoId, chat: { ...chat, messages: msgs, _id: undefined } });
      }

      if (visitorId) {
        const chat = await chatsCol.findOne(chatVisitorQuery(visitorId));
        const msgs = (chat && Array.isArray(chat.messages)) ? chat.messages : [];
        return res.status(200).json({ ok: true, visitorId, chat: { ...chat, messages: msgs, _id: undefined } });
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
      const msg = err && err.message ? String(err.message) : String(err);
      console.error('[CHAT/ADMIN] GET erro:', msg);
      return res.status(isTransientDbError(msg) ? 503 : 500).json({ ok: false, error: 'Erro ao carregar chats', detalhes: msg });
    }
  }

  // POST /api/chat/admin { pedidoId, text }
  if (req.method === 'POST') {
    try {
      const chatsCol = await getCollection('chats');

      const body = req.body || {};
      const pedidoId = normalizePedidoId(body.pedidoId);
      const visitorId = safeStr(body.visitorId);
      const text = safeStr(body.text);

      if ((!pedidoId && !visitorId) || !text) {
        return res.status(400).json({ ok: false, error: 'pedidoId/visitorId e text são obrigatórios' });
      }
      if (text.length > 800) return res.status(400).json({ ok: false, error: 'Mensagem muito longa' });

      const msg = { id: Date.now(), from: 'admin', text, ts: nowIso() };

      if (visitorId) {
        await chatsCol.updateOne(
          chatVisitorQuery(visitorId),
          {
            $setOnInsert: { chatType: 'visitor', visitorId, createdAt: nowIso() },
            $set: { updatedAt: nowIso() },
            $push: { messages: { $each: [msg], $slice: -300 } }
          },
          { upsert: true }
        );
      } else {
        await chatsCol.updateOne(
          chatPedidoIdQuery(pedidoId),
          {
            $setOnInsert: { pedidoId, createdAt: nowIso() },
            $set: { updatedAt: nowIso() },
            $push: { messages: { $each: [msg], $slice: -300 } }
          },
          { upsert: true }
        );
      }

      return res.status(200).json({ ok: true, message: msg });
    } catch (err) {
      const msg = err && err.message ? String(err.message) : String(err);
      console.error('[CHAT/ADMIN] POST erro:', msg);
      return res.status(isTransientDbError(msg) ? 503 : 500).json({ ok: false, error: 'Erro ao enviar mensagem', detalhes: msg });
    }
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' });
};

