// Vercel Serverless Function: POST /api/upload-imagem
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { imagemBase64, produtoId, nomeProduto } = req.body;
        
        if (!imagemBase64) {
            return res.status(400).json({ error: 'Imagem não fornecida' });
        }
        
        const nomeArquivo = `produto-${produtoId}-${(nomeProduto || 'imagem').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        const imageUrl = `/Fotos/${nomeArquivo}`;
        
        return res.status(200).json({ 
            success: true, 
            url: imageUrl, 
            caminho: imageUrl,
            aviso: 'Imagem não salva na Vercel - use Cloudinary ou outro serviço'
        });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao salvar imagem' });
    }
};


