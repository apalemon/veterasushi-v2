// Netlify Function: GET/POST /api/cupons
const { getCollection } = require('./mongodb');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // GET: Buscar cupons
    if (event.httpMethod === 'GET') {
        try {
            const cuponsCollection = await getCollection('cupons');
            const cupons = await cuponsCollection.find({ ativo: { $ne: false } }).toArray();
            
            console.log(`[CUPONS] 📦 Carregados ${cupons.length} cupons`);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(cupons)
            };
        } catch (err) {
            console.error('[CUPONS] ❌ Erro ao carregar:', err.message);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify([])
            };
        }
    }

    // POST: Salvar cupons
    if (event.httpMethod === 'POST') {
        try {
            const cupons = JSON.parse(event.body);
            
            if (!Array.isArray(cupons)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Cupons deve ser um array' })
                };
            }
            
            const cuponsCollection = await getCollection('cupons');
            
            // Limpar todos os cupons existentes e inserir os novos
            await cuponsCollection.deleteMany({});
            
            if (cupons.length > 0) {
                await cuponsCollection.insertMany(cupons);
            }
            
            console.log(`[CUPONS] ✅ ${cupons.length} cupons salvos`);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Cupons salvos com sucesso',
                    total: cupons.length
                })
            };
        } catch (err) {
            console.error('[CUPONS] ❌ Erro ao salvar:', err.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Erro ao salvar cupons', detalhes: err.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Método não permitido' })
    };
};
