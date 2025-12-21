// Handler moved from api/cupons.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const cuponsCollection = await getCollection('cupons');
            const cupons = await cuponsCollection.find({}).toArray();
            return res.status(200).json(cupons);
        } catch (err) {
            console.error('[CUPONS] ❌ Erro ao buscar cupons:', err.message);
            return res.status(200).json([]);
        }
    }

    if (req.method === 'POST') {
        try {
            const cupons = req.body;
            if (!Array.isArray(cupons)) return res.status(400).json({ error: 'Cupons inválidos' });
            const cuponsCollection = await getCollection('cupons');
            await cuponsCollection.deleteMany({});
            if (cupons.length > 0) await cuponsCollection.insertMany(cupons.map(c => ({ ...c })));
            console.log(`[CUPONS] ✅ ${cupons.length} cupons salvos`);
            return res.status(200).json({ success: true, total: cupons.length });
        } catch (err) {
            console.error('[CUPONS] ❌ Erro ao salvar cupons:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar cupons', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};