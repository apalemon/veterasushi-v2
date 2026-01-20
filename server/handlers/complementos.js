// Handler para complementos
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const complementosCollection = await getCollection('complementos');
            const complementos = await complementosCollection.findOne({ _id: 'main' });
            return res.status(200).json(complementos ? (complementos.complementos || []) : []);
        } catch (err) {
            console.error('[COMPLEMENTOS] ❌ Erro ao buscar complementos:', err.message);
            return res.status(200).json([]);
        }
    }

    if (req.method === 'POST') {
        try {
            const complementos = req.body;
            if (!Array.isArray(complementos)) return res.status(400).json({ error: 'Complementos deve ser um array' });
            const complementosCollection = await getCollection('complementos');
            await complementosCollection.updateOne(
                { _id: 'main' },
                { $set: { complementos: complementos, updatedAt: new Date() } },
                { upsert: true }
            );
            console.log(`[COMPLEMENTOS] ✅ ${complementos.length} abas de complementos salvas`);
            return res.status(200).json({ success: true, total: complementos.length });
        } catch (err) {
            console.error('[COMPLEMENTOS] ❌ Erro ao salvar complementos:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar complementos', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};
