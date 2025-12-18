// Netlify Function: POST /api/produtos
const { getCollection } = require('./mongodb');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método não permitido' })
        };
    }

    try {
        const produtos = JSON.parse(event.body);
        
        if (!Array.isArray(produtos)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Produtos deve ser um array' })
            };
        }
        
        const produtosCollection = await getCollection('produtos');
        
        // Limpar todos os produtos existentes e inserir os novos
        await produtosCollection.deleteMany({});
        
        if (produtos.length > 0) {
            await produtosCollection.insertMany(produtos);
        }
        
        console.log(`[PRODUTOS] ✅ ${produtos.length} produtos salvos`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Produtos salvos com sucesso',
                total: produtos.length
            })
        };
    } catch (err) {
        console.error('[PRODUTOS] ❌ Erro ao salvar:', err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Erro ao salvar produtos', detalhes: err.message })
        };
    }
};
