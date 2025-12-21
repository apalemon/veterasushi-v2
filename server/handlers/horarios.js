// Handler moved from api/horarios.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const coll = await getCollection('horarios');
            const docs = await coll.find({}).toArray();
            return res.status(200).json(docs);
        } catch (err) {
            console.error('[HORARIOS] ❌', err.message);
            return res.status(200).json([]);
        }
    }

    if (req.method === 'POST') {
        try {
            const horarios = req.body;
            if (!Array.isArray(horarios)) return res.status(400).json({ error: 'Horários inválidos' });
            const coll = await getCollection('horarios');
            await coll.deleteMany({});
            if (horarios.length > 0) await coll.insertMany(horarios.map(h => ({ ...h })));
            return res.status(200).json({ success: true, total: horarios.length });
        } catch (err) {
            console.error('[HORARIOS] ❌', err.message);
            return res.status(500).json({ error: 'Erro ao salvar horários', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};