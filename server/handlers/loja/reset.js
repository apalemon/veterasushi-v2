const { getCollection } = require('../../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const body = req.body || {};
        const usuario = String(body.usuario || '').trim();
        const senha = String(body.senha || '');
        const confirm = String(body.confirm || '').trim();

        if (!usuario || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }
        if (confirm !== 'RESETAR') {
            return res.status(400).json({ error: 'Confirmação inválida', detalhes: 'Digite RESETAR para confirmar' });
        }

        const jwtUser = req.user || null;
        if (!jwtUser || jwtUser.tipo !== 'admin') {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        // Helper: reproduce client hash algorithm
        function serverHashPassword(password) {
            try {
                const salt = 'vetera_sushi_2024_salt_secure';
                const saltedPassword = salt + password + salt;
                let hash = 0;
                for (let i = 0; i < saltedPassword.length; i++) {
                    const char = saltedPassword.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                let hash2 = 0;
                for (let i = saltedPassword.length - 1; i >= 0; i--) {
                    const char = saltedPassword.charCodeAt(i);
                    hash2 = ((hash2 << 3) - hash2) + char;
                    hash2 = hash2 & hash2;
                }
                const combined = Math.abs(hash) + Math.abs(hash2);
                return 'hashed_' + Math.abs(combined).toString(36) + Math.abs(hash).toString(36).slice(-10);
            } catch (e) {
                return String(password);
            }
        }

        // Validar credenciais do admin informado
        const usuariosColl = await getCollection('usuarios');
        const adminDoc = await usuariosColl.findOne({ usuario, ativo: { $ne: false } });
        if (!adminDoc) return res.status(401).json({ error: 'Credenciais inválidas' });

        const senhaArmazenada = String(adminDoc.senha || '');
        let senhaValida = false;
        if (senhaArmazenada.startsWith('hashed_')) {
            senhaValida = serverHashPassword(senha) === senhaArmazenada;
        } else {
            senhaValida = senhaArmazenada === senha;
            if (senhaValida) {
                try {
                    await usuariosColl.updateOne({ _id: adminDoc._id }, { $set: { senha: serverHashPassword(senha) } });
                } catch (e) {}
            }
        }
        if (!senhaValida) return res.status(401).json({ error: 'Credenciais inválidas' });

        // Fazer backup leve no servidor antes de apagar
        let backupId = null;
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
                resetRequestedBy: usuario,
                data: {
                    produtos: (produtos || []).map(stripId),
                    cupons: (cupons || []).map(stripId),
                    destaques: (destaques || []).map(stripId),
                    categorias: (categorias || []).map(stripId),
                    condicionais: (condicionais || []).map(stripId),
                    pedidos: (pedidos || []).map(stripId),
                    clientes: (clientes || []).map(stripId),
                    usuariosAdmin: (usuariosAdmin || []).map(stripId),
                    horarios: stripId(horariosDocRaw),
                    configuracoes: stripId(configuracoesDocRaw)
                }
            };

            const backups = await getCollection('loja_backups');
            const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
            const doc = { createdAt: new Date(), expiresAt, payload };
            const result = await backups.insertOne(doc);
            backupId = String(result.insertedId);
        } catch (e) {
            // best-effort
        }

        // Reset total (mantendo o usuário atual para não travar acesso)
        const keepUserId = adminDoc._id;

        const collProdutos = await getCollection('produtos');
        const collCupons = await getCollection('cupons');
        const collDestaques = await getCollection('destaques');
        const collCategorias = await getCollection('categorias');
        const collCondicionais = await getCollection('condicionais');
        const collPedidos = await getCollection('pedidos');
        const collClientes = await getCollection('clientes');
        const collHorarios = await getCollection('horarios');
        const collConfiguracoes = await getCollection('configuracoes');

        await collProdutos.deleteMany({});
        await collCupons.deleteMany({});
        await collDestaques.deleteMany({});
        await collCategorias.deleteMany({});
        await collCondicionais.deleteMany({});
        await collPedidos.deleteMany({});
        await collClientes.deleteMany({});
        await collHorarios.deleteMany({});
        await collConfiguracoes.deleteMany({});

        // Apagar todos admins exceto o que confirmou
        try {
            await usuariosColl.deleteMany({ _id: { $ne: keepUserId } });
        } catch (e) {}

        // Recriar configuracoes defaults (vazio) e horarios defaults serão seeded pelos GETs
        try {
            await collConfiguracoes.updateOne(
                { _id: 'main' },
                {
                    $set: {
                        chavePix: '',
                        nomeEstabelecimento: 'Vetera Sushi',
                        telefone: '',
                        endereco: '',
                        taxaEntrega: 0,
                        tempoPreparo: 30
                    }
                },
                { upsert: true }
            );
        } catch (e) {}

        return res.status(200).json({ success: true, message: 'Loja resetada com sucesso', backupId });
    } catch (err) {
        console.error('[LOJA/RESET] ❌', err.message);
        return res.status(500).json({ error: 'Erro ao resetar loja', detalhes: err.message });
    }
};
