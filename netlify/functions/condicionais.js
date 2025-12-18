// Netlify Function: GET/POST /api/condicionais
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

    // GET: Carregar condicionais
    if (event.httpMethod === 'GET') {
        try {
            const condicionaisCollection = await getCollection('configuracoes');
            const condicionais = await condicionaisCollection.findOne({ tipo: 'condicionais' });
            
            if (condicionais) {
                console.log('[CONDICIONAIS] 📦 Condicionais carregadas');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(condicionais.dados || [])
                };
            } else {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify([])
                };
            }
        } catch (err) {
            console.error('[CONDICIONAIS] ❌ Erro ao carregar:', err.message);
            
            // Se for erro de conexão/timeout, retornar 503
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return {
                    statusCode: 503,
                    headers,
                    body: JSON.stringify({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' })
                };
            }
            
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Erro ao carregar condicionais', detalhes: err.message })
            };
        }
    }

    // POST: Salvar condicionais
    if (event.httpMethod === 'POST') {
        try {
            const condicionais = JSON.parse(event.body);
            
            if (!condicionais) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Body vazio' })
                };
            }
            
            if (!Array.isArray(condicionais)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Dados inválidos. Esperado array.' })
                };
            }
            
            const condicionaisCollection = await getCollection('configuracoes');
            
            // Salvar ou atualizar condicionais
            await condicionaisCollection.updateOne(
                { tipo: 'condicionais' },
                { 
                    $set: { 
                        tipo: 'condicionais',
                        dados: condicionais,
                        atualizadoEm: new Date().toISOString()
                    } 
                },
                { upsert: true }
            );
            
            console.log('[CONDICIONAIS] ✅ Condicionais salvas');
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Condicionais salvas com sucesso'
                })
            };
        } catch (err) {
            console.error('[CONDICIONAIS] ❌ Erro ao salvar:', err.message);
            
            // Se for erro de conexão/timeout, retornar 503
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return {
                    statusCode: 503,
                    headers,
                    body: JSON.stringify({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' })
                };
            }
            
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Erro ao salvar condicionais', detalhes: err.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Método não permitido' })
    };
};

