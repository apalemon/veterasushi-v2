const { getCollection } = require('../../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const produtos = await (await getCollection('produtos')).find({}).toArray();
        const cupons = await (await getCollection('cupons')).find({}).toArray();
        const destaques = await (await getCollection('destaques')).find({}).toArray();
        const categorias = await (await getCollection('categorias')).find({}).toArray();
        const condicionais = await (await getCollection('condicionais')).find({}).toArray();
        const pedidos = await (await getCollection('pedidos')).find({}).toArray();
        const clientes = await (await getCollection('clientes')).find({}).toArray();
        const usuariosAdmin = await (await getCollection('usuarios')).find({}).toArray();

        const horariosDocRaw = await (await getCollection('horarios')).findOne({ _id: 'main' });
        const configuracoesDocRaw = await (await getCollection('configuracoes')).findOne({ _id: 'main' });

        const stripId = (doc) => {
            if (!doc || typeof doc !== 'object') return doc;
            const out = { ...doc };
            if (out._id) delete out._id;
            return out;
        };

        const payload = {
            version: 1,
            createdAt: new Date().toISOString(),
            data: {
                produtos: (produtos || []).map(stripId),
                cupons: (cupons || []).map(stripId),
                destaques: (destaques || []).map(stripId),
                categorias: (categorias || []).map(stripId),
                condicionais: (condicionais || []).map(stripId),
                pedidos: (pedidos || []).map(stripId),
                clientes: (clientes || []).map(stripId),
                usuariosAdmin: (usuariosAdmin || []).map(u => {
                    const uu = stripId(u);
                    // não expor hash no payload local? manter (para backup total) — mas remover se vazio
                    return uu;
                }),
                horarios: stripId(horariosDocRaw),
                configuracoes: stripId(configuracoesDocRaw)
            }
        };

        // Backup leve no servidor (temporário)
        const backups = await getCollection('loja_backups');
        const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 dias
        const doc = {
            createdAt: new Date(),
            expiresAt,
            payload
        };
        const result = await backups.insertOne(doc);

        return res.status(200).json({ success: true, backupId: String(result.insertedId), payload });
    } catch (err) {
        console.error('[LOJA/BACKUP] ❌', err.message);
        return res.status(500).json({ error: 'Erro ao gerar backup', detalhes: err.message });
    }
};
