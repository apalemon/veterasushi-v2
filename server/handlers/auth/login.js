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
        const user = await usuariosCollection.findOne({ usuario, senha, ativo: { $ne: false } });
        if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
        // Remover senha antes de retornar
        delete user.senha;
        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error('[AUTH/LOGIN] ❌', err.message);
        return res.status(500).json({ error: 'Erro interno', detalles: err.message });
    }
};