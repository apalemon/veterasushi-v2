// Handler moved from api/upload-imagem.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        // Vercel/local: não persistimos arquivos enviados por cliente.
        // Aceitamos somente URL/path (ex.: /Fotos/arquivo.png ou https://...)
        const body = req.body || {};
        const image = body.image;
        if (!image) return res.status(400).json({ error: 'Imagem não informada' });

        const s = String(image).trim();
        if (!s) return res.status(400).json({ error: 'Imagem inválida' });

        if (s.startsWith('data:image')) {
            return res.status(400).json({
                error: 'Upload base64 desativado',
                detalhes: 'Use um caminho em /Fotos/ (imagem já existente no projeto) ou uma URL externa.'
            });
        }

        if (!(s.startsWith('/Fotos/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/'))) {
            return res.status(400).json({
                error: 'Formato de imagem inválido',
                detalhes: 'Use /Fotos/arquivo.png, /logo.png ou https://...'
            });
        }

        console.log('[UPLOAD] 🔼 Upload lógico recebido (URL/path), sem armazenamento:', s);
        return res.status(200).json({ success: true, image: s });
    } catch (err) {
        console.error('[UPLOAD] ❌', err.message);
        return res.status(500).json({ error: 'Erro no upload', detalhes: err.message });
    }
};