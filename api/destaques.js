// Vercel Serverless Function: GET/POST /api/destaques
const { getCollection } = require('./mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const coll = await getCollection('destaques');

        if (req.method === 'GET') {
            const docs = await coll.find({}).toArray();
            return res.status(200).json(docs);
        }

        if (req.method === 'POST') {
            const data = req.body;
            if (!Array.isArray(data)) {
                return res.status(400).json({ error: 'Payload deve ser um array' });
            }

            await coll.deleteMany({});
            if (data.length > 0) {
                await coll.insertMany(data);
            }

            return res.status(200).json({ success: true, total: data.length });
        }

        return res.status(405).json({ error: 'Método não permitido' });
    } catch (err) {
        console.error('[DESTAQUES] ❌', err.message || err);
        return res.status(500).json({ error: 'Erro no servidor', detalhes: err.message });
    }
};
