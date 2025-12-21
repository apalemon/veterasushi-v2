// Vercel Serverless Function: POST /api/auth/login
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Método não permitido' });
    }

    try {
        const { usuario, senha } = req.body;
        
        if (!usuario || !senha) {
            return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
        }
        
        const usuariosCollection = await getCollection('usuarios');
        
        function hashPassword(password) {
            if (!password) return '';
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
        }
        
        let user = null;
        if (usuario.toLowerCase() === 'admin') {
            user = await usuariosCollection.findOne({ 
                $or: [{ usuario: 'admin' }, { nivel: 'admin' }],
                ativo: { $ne: false }
            });
        } else {
            user = await usuariosCollection.findOne({ 
                $or: [{ usuario: usuario }, { telefone: usuario }],
                ativo: { $ne: false }
            });
        }
        
        if (!user) {
            return res.status(200).json({ success: false, message: 'Usuário não encontrado' });
        }
        
        let senhaValida = false;
        if (user.senha && user.senha.startsWith('hashed_')) {
            const senhaHash = hashPassword(senha);
            senhaValida = senhaHash === user.senha;
        } else {
            const senhaHash = hashPassword(senha);
            const senhaArmazenadaHash = hashPassword(user.senha);
            senhaValida = (user.senha === senha) || (senhaHash === senhaArmazenadaHash);
        }
        
        if (senhaValida) {
            const { senha: _, ...userSafe } = user;
            return res.status(200).json({ success: true, user: userSafe });
        }
        
        return res.status(200).json({ success: false, message: 'Senha incorreta' });
    } catch (err) {
        console.error('[AUTH-LOGIN] ❌ Erro:', err.message);
        return res.status(500).json({ success: false, message: 'Erro ao validar login' });
    }
};

