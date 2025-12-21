// Handler moved from api/cupons/validar.js
const { getCollection } = require('../../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { codigo } = req.body || {};
        if (!codigo) return res.status(400).json({ valid: false, reason: 'Código não informado' });
        const cuponsCollection = await getCollection('cupons');
        const cupom = await cuponsCollection.findOne({ codigo });
        if (!cupom) return res.status(200).json({ valid: false, reason: 'Cupom não encontrado' });
        if (cupom.ativo === false) return res.status(200).json({ valid: false, reason: 'Cupom inativo' });
        // Implementar regras de validade (datas, usos, etc.)
        return res.status(200).json({ valid: true, discount: cupom.desconto || 0, cupom });
    } catch (err) {
        console.error('[CUPONS/VALIDAR] ❌', err.message);
        return res.status(500).json({ valid: false, reason: 'Erro ao validar cupom', detalhes: err.message });
    }
};