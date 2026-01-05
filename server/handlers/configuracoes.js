// Handler moved from api/configuracoes.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
                    nomeEstabelecimento: 'Minha Loja',
                    telefone: '',
                    endereco: '',
                    taxaEntrega: 0,
                    tempoPreparo: 30,
                    logoUrl: '/logo.png',
                    faviconUrl: '/logo.png',
                    tema: {
                        accent: '#dc2626',
                        accentHover: '#b91c1c',
                        bg: '#0a0a0a',
                        bgSecondary: '#111111',
                        textPrimary: '#ffffff',
                        textSecondary: '#a3a3a3'
                    }
                };

                // Persistir defaults no servidor (fonte de verdade)
                try {
                    await collection.updateOne({ _id: 'main' }, { $set: { ...config } }, { upsert: true });
                } catch (e) {
                    // best-effort
                }
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