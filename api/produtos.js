// Vercel Serverless Function: POST /api/produtos
const { getCollection } = require('./mongodb');

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
        const produtos = req.body;
        
        if (!Array.isArray(produtos)) {
            return res.status(400).json({ error: 'Produtos deve ser um array' });
        }
        
        const produtosCollection = await getCollection('produtos');
        
        await produtosCollection.deleteMany({});
        
        if (produtos.length > 0) {
            await produtosCollection.insertMany(produtos);
        }
        
        console.log(`[PRODUTOS] ✅ ${produtos.length} produtos salvos`);
        
        return res.status(200).json({ 
            success: true, 
            message: 'Produtos salvos com sucesso',
            total: produtos.length
        });
    } catch (err) {
        console.error('[PRODUTOS] ❌ Erro ao salvar:', err.message);
        return res.status(500).json({ error: 'Erro ao salvar produtos', detalhes: err.message });
    }
};


