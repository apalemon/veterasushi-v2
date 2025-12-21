// Handler moved from api/upload-imagem.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        // Implementação simples: espera um campo 'image' (base64 ou URL)
        const body = req.body || {};
        const image = body.image;
        if (!image) return res.status(400).json({ error: 'Imagem não informada' });

        // No momento, apenas retornamos sucesso e a string enviada
        console.log('[UPLOAD] 🔼 Imagem recebida (não armazenada)');
        return res.status(200).json({ success: true, image });
    } catch (err) {
        console.error('[UPLOAD] ❌', err.message);
        return res.status(500).json({ error: 'Erro no upload', detalhes: err.message });
    }
};