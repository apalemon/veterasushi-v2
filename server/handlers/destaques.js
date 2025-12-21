// Handler moved from api/destaques.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const coll = await getCollection('destaques');
            const docs = await coll.find({}).toArray();
            return res.status(200).json(docs);
        } catch (err) {
            console.error('[DESTAQUES] ❌', err.message);
            return res.status(200).json([]);
        }
    }

    if (req.method === 'POST') {
        try {
            const items = req.body;
            if (!Array.isArray(items)) return res.status(400).json({ error: 'Itens inválidos' });
            const coll = await getCollection('destaques');
            await coll.deleteMany({});
            if (items.length > 0) await coll.insertMany(items.map(i => ({ ...i })));
            return res.status(200).json({ success: true, total: items.length });
        } catch (err) {
            console.error('[DESTAQUES] ❌', err.message);
            return res.status(500).json({ error: 'Erro ao salvar destaques', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};