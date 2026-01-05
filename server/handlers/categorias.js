// Handler moved from api/categorias.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // GET: listar categorias detalhadas
    if (req.method === 'GET') {
        try {
            const coll = await getCollection('categorias');
            const docs = await coll.find({}).toArray();
            return res.status(200).json(docs || []);
        } catch (err) {
            console.error('[CATEGORIAS] ❌', err.message);
            return res.status(200).json([]);
        }
    }

    // POST/PUT: salvar categorias
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const body = req.body;
            if (!Array.isArray(body)) return res.status(400).json({ error: 'Categorias inválidas (esperado array)' });

            // Aceitar tanto array de strings quanto array de objetos {nome, produtos}
            const nomes = body
                .map(c => (typeof c === 'string' ? c : (c && typeof c.nome === 'string' ? c.nome : '')))
                .map(x => String(x || '').trim())
                .filter(Boolean);

            const produtosColl = await getCollection('produtos');
            const produtos = await produtosColl.find({}).toArray();

            const mapaProdutos = new Map();
            for (const p of (produtos || [])) {
                const nomeCat = (p && typeof p.categoria === 'string') ? p.categoria.trim() : '';
                if (!nomeCat) continue;
                if (!mapaProdutos.has(nomeCat)) mapaProdutos.set(nomeCat, []);
                mapaProdutos.get(nomeCat).push(p.id);
            }

            const docs = nomes.map(nome => ({
                nome,
                produtos: Array.isArray(mapaProdutos.get(nome)) ? mapaProdutos.get(nome) : [],
                updatedAt: new Date().toISOString()
            }));

            const coll = await getCollection('categorias');
            await coll.deleteMany({});
            if (docs.length > 0) await coll.insertMany(docs);

            return res.status(200).json({ success: true, total: docs.length });
        } catch (err) {
            console.error('[CATEGORIAS] ❌ Erro ao salvar:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar categorias', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};
