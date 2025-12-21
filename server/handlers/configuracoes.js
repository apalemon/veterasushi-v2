// Handler moved from api/configuracoes.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const collection = await getCollection('configuracoes');

        if (req.method === 'PUT') {
            const body = req.body || {};
            const doc = { ...body };
            await collection.updateOne({ _id: 'main' }, { $set: doc }, { upsert: true });
            const saved = await collection.findOne({ _id: 'main' });
            delete saved._id;
            return res.status(200).json(saved);
        }

        if (req.method === 'GET') {
            let config = await collection.findOne({ _id: 'main' });
            if (!config) {
                config = {
                    chavePix: '',
                    nomeEstabelecimento: 'Vetera Sushi',
                    telefone: '',
                    endereco: '',
                    taxaEntrega: 0,
                    tempoPreparo: 30
                };
            } else {
                delete config._id;
            }
            return res.status(200).json(config);
        }

        return res.status(405).json({ error: 'Método não permitido' });
    } catch (err) {
        console.error('[API/configuracoes] erro', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
};