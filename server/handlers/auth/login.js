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
                console.warn('[AUTH/LOGIN] erro ao hashear senha no servidor', e);
                return String(password);
            }
        }

        // Find user by username only, then compare password (supports hashed and plain)
        const user = await usuariosCollection.findOne({ usuario, ativo: { $ne: false } });
        if (!user) {
            // No user with that username
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
            console.log('[AUTH/LOGIN] usuário não encontrado com usuario:', usuario);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Compare passwords
        const senhaArmazenada = user.senha || '';
        const isHashedStored = String(senhaArmazenada).startsWith('hashed_');
        const attemptedHashed = serverHashPassword(senha);

        console.log('[AUTH/LOGIN] comparando senha: usuario=', usuario, 'isHashedStored=', isHashedStored);

        let senhaValida = false;
        if (isHashedStored) {
            senhaValida = attemptedHashed === String(senhaArmazenada);
        } else {
            // stored plain: accept if equal to provided (legacy) or if attempted hashed equals stored hashed (unlikely)
            if (String(senhaArmazenada) === String(senha)) {
                senhaValida = true;
                // Migrate to hashed password
                try {
                    const newHashed = serverHashPassword(senha);
                    await usuariosCollection.updateOne({ _id: user._id }, { $set: { senha: newHashed } });
                    console.log('[AUTH/LOGIN] senha de usuario migrada para hashed:', usuario);
                } catch (e) {
                    console.warn('[AUTH/LOGIN] falha ao migrar senha para hashed:', e);
                }
            }
        }

        if (!senhaValida) {
            console.warn('[AUTH/LOGIN] senha inválida para usuario:', usuario);
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