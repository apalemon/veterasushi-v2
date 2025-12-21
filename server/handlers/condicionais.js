// Handler moved from api/condicionais.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // GET: listar condicionais
    if (req.method === 'GET') {
        try {
            const coll = await getCollection('condicionais');
            const list = await coll.find({}).toArray();
            return res.status(200).json(list);
        } catch (err) {
            console.error('[CONDICIONAIS] ❌', err.message);
            return res.status(200).json([]);
        }
    }

    // POST/PUT: salvar
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const data = req.body;
            if (!data) return res.status(400).json({ error: 'Dados inválidos' });
            const coll = await getCollection('condicionais');
            if (Array.isArray(data)) {
                await coll.deleteMany({});
                if (data.length > 0) await coll.insertMany(data.map(d => ({ ...d })));
                return res.status(200).json({ success: true, total: data.length });
            }
            if (data.id) {
                await coll.updateOne({ id: data.id }, { $set: data }, { upsert: true });
                return res.status(200).json({ success: true });
            }
            return res.status(400).json({ error: 'Formato inválido' });
        } catch (err) {
            console.error('[CONDICIONAIS] ❌', err.message);
            return res.status(500).json({ error: 'Erro ao salvar condicionais', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};