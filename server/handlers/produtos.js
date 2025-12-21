// Handler moved from api/produtos.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const produtos = req.body;
        if (!Array.isArray(produtos)) return res.status(400).json({ error: 'Produtos deve ser um array' });
        const produtosCollection = await getCollection('produtos');

        produtos.forEach((p, idx) => {
            p.ordem = typeof p.ordem !== 'undefined' ? p.ordem : idx;
            if (p._id) delete p._id;
            if (typeof p.id === 'undefined' || p.id === null) {
                p.id = Date.now() + Math.floor(Math.random() * 1000) + idx;
            }
        });

        const seen = new Set();
        const produtosUnicos = [];
        for (const p of produtos) {
            if (!seen.has(p.id)) {
                seen.add(p.id);
                produtosUnicos.push(p);
            }
        }

        await produtosCollection.deleteMany({});
        if (produtosUnicos.length > 0) await produtosCollection.insertMany(produtosUnicos);

        try {
            const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];
            const categoriasColl = await getCollection('categorias');
            await categoriasColl.deleteMany({});
            if (categorias.length > 0) {
                const docs = categorias.map(c => ({ nome: c }));
                await categoriasColl.insertMany(docs);
            }
        } catch (catErr) {
            console.warn('[CATEGORIAS] ❌ Erro ao salvar categorias:', catErr.message || catErr);
        }

        console.log(`[PRODUTOS] ✅ ${produtos.length} produtos salvos`);
        return res.status(200).json({ success: true, message: 'Produtos salvos com sucesso', total: produtos.length });
    } catch (err) {
        console.error('[PRODUTOS] ❌ Erro ao salvar:', err.message);
        return res.status(500).json({ error: 'Erro ao salvar produtos', detalhes: err.message });
    }
};