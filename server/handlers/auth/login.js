// Handler moved from api/auth/login.js
const { getCollection } = require('../../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { usuario, senha } = req.body || {};
        if (!usuario || !senha) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        const usuariosCollection = await getCollection('usuarios');
        const totalUsers = await usuariosCollection.countDocuments();
        console.log('[AUTH/LOGIN] total usuarios in DB:', totalUsers);
        const user = await usuariosCollection.findOne({ usuario, senha, ativo: { $ne: false } });

        // If no user found, and there are no users at all in DB, allow a temporary admin (admin/admin)
        if (!user) {
            if (totalUsers === 0 && String(usuario) === 'admin' && String(senha) === 'admin') {
                console.warn('[AUTH/LOGIN] No users in DB - granting temporary admin login (admin/admin)');
                const adminUser = { id: 'admin', usuario: 'admin', nome: 'Administrador (seed)', nivel: 'admin', ativo: true };
                return res.status(200).json({ success: true, user: adminUser });
            }
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Remover senha antes de retornar
        delete user.senha;
        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error('[AUTH/LOGIN] ❌', err.message);
        return res.status(500).json({ error: 'Erro interno', detalles: err.message });
    }
};