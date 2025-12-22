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
        if (!user) {
            // Debug: check if user exists ignoring password
            const userByName = await usuariosCollection.findOne({ usuario });
            if (userByName) {
                console.warn('[AUTH/LOGIN] usuário encontrado sem correspondência de senha. usuario:', usuario, 'storedPasswordType:', (userByName.senha||'').startsWith('hashed_') ? 'hashed' : 'plain');
            } else {
                console.log('[AUTH/LOGIN] usuário não encontrado com usuario:', usuario);
            }

            const allowOverride = String(process.env.ALLOW_ADMIN_OVERRIDE || '').toLowerCase() === 'true';
            if (allowOverride && String(usuario) === 'admin' && String(senha) === 'admin') {
                console.warn('[AUTH/LOGIN] ALLOW_ADMIN_OVERRIDE enabled - granting admin login (admin/admin)');
                const adminUser = { id: 'admin', usuario: 'admin', nome: 'Administrador (override)', nivel: 'admin', ativo: true };
                return res.status(200).json({ success: true, user: adminUser });
            }
            if (totalUsers === 0 && String(usuario) === 'admin' && String(senha) === 'admin') {
                console.warn('[AUTH/LOGIN] No users in DB - granting temporary admin login (admin/admin)');
                const adminUser = { id: 'admin', usuario: 'admin', nome: 'Administrador (seed)', nivel: 'admin', ativo: true };
                return res.status(200).json({ success: true, user: adminUser });
            }
            return res.status(401).json({ error: 'Credenciais inválidas', info: (allowOverride ? 'Server override (ALLOW_ADMIN_OVERRIDE) is active' : undefined) });
        }

        // Remover senha antes de retornar
        delete user.senha;
        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error('[AUTH/LOGIN] ❌', err.message);
        return res.status(500).json({ error: 'Erro interno', detalles: err.message });
    }
};