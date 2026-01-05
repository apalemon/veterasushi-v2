// Handler moved from api/usuarios-admin.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

    // DELETE: remover usuário por id
    if (req.method === 'DELETE') {
        try {
            let id = null;
            try {
                const u = new URL(String(req.url || ''), 'http://localhost');
                id = u.searchParams.get('id');
            } catch (e) {
                id = null;
            }

            if (!id) return res.status(400).json({ error: 'Parâmetro id é obrigatório' });

            const coll = await getCollection('usuarios');
            await coll.deleteOne({ $or: [{ id: String(id) }, { _id: String(id) }] });
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error('[USUARIOS-ADMIN] ❌ Erro ao deletar:', err.message);
            return res.status(500).json({ error: 'Erro ao deletar usuário', detalhes: err.message });
        }
    }

    // POST/PUT: salvar lista completa de usuários do painel
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const body = req.body;
            if (!Array.isArray(body)) return res.status(400).json({ error: 'Dados inválidos (esperado array)' });

            // Sanitizar: permitir apenas campos esperados
            const allowedLevels = new Set(['admin', 'gerente', 'funcionario']);

            const coll = await getCollection('usuarios');
            const existentes = await coll.find({}).toArray();
            const byId = new Map((existentes || []).filter(Boolean).map(u => [String(u.id || u._id || ''), u]));
            const byUsuario = new Map((existentes || []).filter(Boolean).map(u => [String(u.usuario || ''), u]));

            function sanitizePermissoes(p) {
                const src = (p && typeof p === 'object') ? p : {};
                return {
                    pedidos: src.pedidos !== false,
                    produtos: !!src.produtos,
                    pagamentos: !!src.pagamentos,
                    configuracoes: !!src.configuracoes,
                    usuarios: !!src.usuarios
                };
            }

            const usuarios = body
                .filter(Boolean)
                .map(u => ({
                    id: String(u.id || '').trim(),
                    usuario: String(u.usuario || u.login || '').trim(),
                    nome: String(u.nome || '').trim(),
                    nivel: allowedLevels.has(String(u.nivel || '').toLowerCase()) ? String(u.nivel || '').toLowerCase() : 'gerente',
                    ativo: u.ativo !== false,
                    // senha pode vir hashed_ (recomendado). Se não vier, ainda salvamos como string.
                    senha: u.senha,
                    permissoes: sanitizePermissoes(u.permissoes)
                }))
                .filter(u => u.usuario);

            // Preservar senha existente quando não enviada
            const merged = usuarios.map(u => {
                const prev = (u.id && byId.get(String(u.id))) || byUsuario.get(u.usuario) || null;
                if (!u.senha && prev && prev.senha) {
                    u.senha = prev.senha;
                }
                return u;
            });

            await coll.deleteMany({});
            if (merged.length > 0) {
                await coll.insertMany(merged.map(u => {
                    const doc = { ...u };
                    if (doc._id) delete doc._id;
                    return doc;
                }));
            }

            return res.status(200).json({ success: true, total: merged.length });
        } catch (err) {
            console.error('[USUARIOS-ADMIN] ❌ Erro ao salvar:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar usuários', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};
