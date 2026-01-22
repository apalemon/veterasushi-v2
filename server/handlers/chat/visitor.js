const crypto = require('crypto');
const { getCollection } = require('../../mongodb');

function safeStr(v) {
  return String(v == null ? '' : v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  try {
    return String(prefix || '') + crypto.randomBytes(12).toString('hex');
  } catch (e) {
    return String(prefix || '') + String(Date.now()) + '_' + String(Math.floor(Math.random() * 1e9));
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const chatsCol = await getCollection('chats');

  // POST /api/chat/visitor/start { name }
  if (req.method === 'POST') {
    try {
      const u = new URL(String(req.url || ''), 'http://localhost');
      const action = safeStr(u.searchParams.get('action') || '');

      const body = req.body || {};
      const name = safeStr(body.name || body.nome);

      if (action === 'start') {
        if (!name) return res.status(400).json({ ok: false, error: 'name é obrigatório' });

        const visitorId = makeId('v_');
        const token = makeId('t_');
        const chatId = makeId('visitor_');

        await chatsCol.insertOne({
          chatId,
          chatType: 'visitor',
          visitorId,
          visitorToken: token,
          visitorName: name,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          messages: []
        });

        return res.status(200).json({ ok: true, chatId, visitorId, token, name });
      }

      // POST /api/chat/visitor  { visitorId, token, text }
      const visitorId = safeStr(body.visitorId);
      const token = safeStr(body.token);
      const text = safeStr(body.text);

      if (!visitorId || !token || !text) {
        return res.status(400).json({ ok: false, error: 'visitorId, token e text são obrigatórios' });
      }
      if (text.length > 800) return res.status(400).json({ ok: false, error: 'Mensagem muito longa' });

      const chat = await chatsCol.findOne({ chatType: 'visitor', visitorId });
      if (!chat) return res.status(404).json({ ok: false, error: 'Chat não encontrado' });
      if (!chat.visitorToken || safeStr(chat.visitorToken) !== token) {
        return res.status(403).json({ ok: false, error: 'Token inválido' });
      }

      const msg = { id: Date.now(), from: 'cliente', text, ts: nowIso() };

      await chatsCol.updateOne(
        { chatType: 'visitor', visitorId },
        {
          $set: { updatedAt: nowIso(), visitorName: chat.visitorName || name || '' },
          $push: { messages: { $each: [msg], $slice: -300 } }
        }
      );

      return res.status(200).json({ ok: true, message: msg });
    } catch (err) {
      console.error('[CHAT/VISITOR] POST erro:', err && err.message ? err.message : err);
      return res.status(500).json({ ok: false, error: 'Erro ao enviar mensagem' });
    }
  }

  // GET /api/chat/visitor?visitorId=...&token=...&since=ISO
  if (req.method === 'GET') {
    try {
      let visitorId = '';
      let token = '';
      let since = '';
      try {
        const u = new URL(String(req.url || ''), 'http://localhost');
        visitorId = safeStr(u.searchParams.get('visitorId'));
        token = safeStr(u.searchParams.get('token'));
        since = safeStr(u.searchParams.get('since'));
      } catch (e) {}

      if (!visitorId || !token) {
        return res.status(400).json({ ok: false, error: 'visitorId e token são obrigatórios' });
      }

      const chat = await chatsCol.findOne({ chatType: 'visitor', visitorId });
      if (!chat) return res.status(404).json({ ok: false, error: 'Chat não encontrado' });
      if (!chat.visitorToken || safeStr(chat.visitorToken) !== token) {
        return res.status(403).json({ ok: false, error: 'Token inválido' });
      }

      const msgs = Array.isArray(chat.messages) ? chat.messages : [];
      let filtered = msgs;
      if (since) {
        const sinceMs = new Date(since).getTime();
        if (Number.isFinite(sinceMs)) {
          filtered = msgs.filter(m => new Date(m.ts || 0).getTime() > sinceMs);
        }
      }

      return res.status(200).json({
        ok: true,
        chatId: chat.chatId || '',
        visitorId,
        name: chat.visitorName || '',
        messages: filtered,
        serverTime: nowIso()
      });
    } catch (err) {
      console.error('[CHAT/VISITOR] GET erro:', err && err.message ? err.message : err);
      return res.status(500).json({ ok: false, error: 'Erro ao carregar mensagens' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' });
};
