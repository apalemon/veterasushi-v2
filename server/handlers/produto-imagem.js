const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const fullUrl = String(req.url || '');
    const u = new URL(fullUrl, 'http://localhost');
    const idRaw = u.searchParams.get('id');
    if (!idRaw) return res.status(400).json({ error: 'id é obrigatório' });

    const idNum = Number(idRaw);
    const id = Number.isFinite(idNum) ? idNum : idRaw;

    const produtosCollection = await getCollection('produtos');
    const p = await produtosCollection.findOne({ id });

    if (!p || !p.imagem || typeof p.imagem !== 'string') {
      return res.status(404).end();
    }

    const img = String(p.imagem);
    if (!img.startsWith('data:image')) {
      // Se for caminho/URL, redireciona (mantém compatibilidade)
      res.setHeader('Location', img);
      return res.status(302).end();
    }

    const match = img.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(415).json({ error: 'Formato de imagem inválido' });

    const mime = match[1];
    const b64 = match[2];

    const buf = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[PRODUTO-IMAGEM] ❌', err.message || err);
    return res.status(500).json({ error: 'Erro ao servir imagem', detalhes: err.message || String(err) });
  }
};
