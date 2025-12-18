// Netlify Function: GET/POST /api/usuarios
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

    // GET: Carregar usuários (clientes)
    if (event.httpMethod === 'GET') {
        try {
            const usuariosCollection = await getCollection('clientes');
            const usuarios = await usuariosCollection.find({}).toArray();
            
            console.log(`[USUARIOS] 📦 Carregados ${usuarios.length} usuários`);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(usuarios)
            };
        } catch (err) {
            console.error('[USUARIOS] ❌ Erro ao carregar:', err.message);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify([])
            };
        }
    }

    // POST: Salvar usuários (clientes)
    if (event.httpMethod === 'POST') {
        try {
            const usuarios = JSON.parse(event.body);
            
            if (!usuarios) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Body vazio' })
                };
            }
            
            if (!Array.isArray(usuarios)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Dados inválidos. Esperado array.' })
                };
            }
            
            const usuariosCollection = await getCollection('clientes');
            
            // Processar cada usuário
            let salvos = 0;
            let atualizados = 0;
            
            for (const usuario of usuarios) {
                if (!usuario || !usuario.telefone) continue;
                
                // Usar telefone como identificador único
                await usuariosCollection.updateOne(
                    { telefone: usuario.telefone },
                    { $set: usuario },
                    { upsert: true }
                );
                
                const existe = await usuariosCollection.findOne({ telefone: usuario.telefone });
                if (existe && existe._id) {
                    atualizados++;
                } else {
                    salvos++;
                }
            }
            
            console.log(`[USUARIOS] ✅ Processados: ${salvos} novos, ${atualizados} atualizados`);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Usuários salvos com sucesso',
                    total: usuarios.length,
                    salvos,
                    atualizados
                })
            };
        } catch (err) {
            console.error('[USUARIOS] ❌ Erro ao salvar:', err.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Erro ao salvar usuários', detalhes: err.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Método não permitido' })
    };
};
