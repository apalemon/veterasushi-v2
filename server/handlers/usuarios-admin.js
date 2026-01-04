// Handler moved from api/usuarios-admin.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // GET: listar usuários do painel (admins/gerentes)
    if (req.method === 'GET') {
        try {
            const coll = await getCollection('usuarios');
            const docs = await coll.find({}).toArray();
            // Nunca retornar senha
            const safe = (docs || []).map(u => {
                if (!u) return u;
                const x = { ...u };
                delete x.senha;
                return x;
            });
            return res.status(200).json(safe);
        } catch (err) {
            console.error('[USUARIOS-ADMIN] ❌', err.message);
            return res.status(200).json([]);
        }
    }

    // POST/PUT: salvar lista completa de usuários do painel
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const body = req.body;
            if (!Array.isArray(body)) return res.status(400).json({ error: 'Dados inválidos (esperado array)' });

            // Sanitizar: permitir apenas campos esperados
            const allowedLevels = new Set(['admin', 'gerente']);
            const usuarios = body
                .filter(Boolean)
                .map(u => ({
                    id: u.id,
                    usuario: String(u.usuario || '').trim(),
                    nome: String(u.nome || '').trim(),
                    nivel: allowedLevels.has(String(u.nivel || '').toLowerCase()) ? String(u.nivel || '').toLowerCase() : 'gerente',
                    ativo: u.ativo !== false,
                    // senha pode vir hashed_ (recomendado). Se não vier, ainda salvamos como string.
                    senha: u.senha
                }))
                .filter(u => u.usuario);

            const coll = await getCollection('usuarios');
            await coll.deleteMany({});
            if (usuarios.length > 0) {
                await coll.insertMany(usuarios.map(u => {
                    const doc = { ...u };
                    if (doc._id) delete doc._id;
                    return doc;
                }));
            }

            return res.status(200).json({ success: true, total: usuarios.length });
        } catch (err) {
            console.error('[USUARIOS-ADMIN] ❌ Erro ao salvar:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar usuários', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};
