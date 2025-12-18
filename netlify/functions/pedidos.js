// Netlify Function: GET/POST /api/pedidos
const { getCollection } = require('./mongodb');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // GET: Carregar pedidos
    if (event.httpMethod === 'GET') {
        try {
            const pedidosCollection = await getCollection('pedidos');
            
            // Buscar todos os pedidos, ordenados por data (mais recentes primeiro)
            // Tentar ordenar por dataCriacao, se não existir, usar data ou timestamp
            let pedidos = await pedidosCollection
                .find({})
                .toArray();
            
            // Ordenar manualmente (mais recentes primeiro)
            pedidos.sort((a, b) => {
                const dataA = a.dataCriacao || a.data || a.timestamp || 0;
                const dataB = b.dataCriacao || b.data || b.timestamp || 0;
                const timeA = typeof dataA === 'string' ? new Date(dataA).getTime() : dataA;
                const timeB = typeof dataB === 'string' ? new Date(dataB).getTime() : dataB;
                return timeB - timeA; // Mais recente primeiro
            });
            
            console.log(`[PEDIDOS] 📦 Carregados ${pedidos.length} pedidos do MongoDB`);
            
            // Remover _id do MongoDB antes de retornar
            const pedidosLimpos = pedidos.map(p => {
                const { _id, ...pedidoSemId } = p;
                return pedidoSemId;
            });
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(pedidosLimpos)
            };
        } catch (err) {
            console.error('[PEDIDOS] ❌ Erro ao carregar:', err.message);
            console.error('[PEDIDOS] Stack:', err.stack);
            
            // Se for erro de conexão/timeout, retornar 503
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection')) {
                return {
                    statusCode: 503,
                    headers,
                    body: JSON.stringify({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify([])
            };
        }
    }

    // POST: Salvar pedidos
    if (event.httpMethod === 'POST') {
        try {
            const pedidos = JSON.parse(event.body);
            
            if (!pedidos) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Body vazio' })
                };
            }
            
            if (!Array.isArray(pedidos)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Dados inválidos. Esperado array.' })
                };
            }
            
            console.log(`[PEDIDOS] 📥 Recebendo ${pedidos.length} pedidos para salvar`);
            
            // Verificar se MONGODB_URI está configurada
            if (!process.env.MONGODB_URI) {
                console.error('[PEDIDOS] ❌ MONGODB_URI não está configurada!');
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        error: 'MongoDB não configurado', 
                        detalhes: 'Variável de ambiente MONGODB_URI não encontrada. Configure na Netlify.' 
                    })
                };
            }
            
            const pedidosCollection = await getCollection('pedidos');
            
            // Processar cada pedido
            let salvos = 0;
            let atualizados = 0;
            const erros = [];
            
            for (const pedido of pedidos) {
                try {
                    if (!pedido || !pedido.id) {
                        console.warn('[PEDIDOS] ⚠️ Pedido sem ID, pulando:', pedido);
                        continue;
                    }
                    
                    // Garantir dataCriacao se não existir
                    if (!pedido.dataCriacao && !pedido.data) {
                        pedido.dataCriacao = new Date();
                    } else if (pedido.data && !pedido.dataCriacao) {
                        // Se tem 'data' mas não 'dataCriacao', usar 'data'
                        pedido.dataCriacao = new Date(pedido.data);
                    }
                    
                    // Usar upsert para atualizar se existir ou criar se não existir
                    const result = await pedidosCollection.updateOne(
                        { id: pedido.id },
                        { $set: pedido },
                        { upsert: true }
                    );
                    
                    if (result.upsertedCount > 0) {
                        salvos++;
                    } else if (result.modifiedCount > 0) {
                        atualizados++;
                    } else {
                        atualizados++; // Já existia, consideramos atualizado
                    }
                } catch (pedidoErr) {
                    console.error(`[PEDIDOS] ❌ Erro ao processar pedido ${pedido.id}:`, pedidoErr.message);
                    erros.push({ id: pedido.id, erro: pedidoErr.message });
                }
            }
            
            console.log(`[PEDIDOS] ✅ Processados: ${salvos} novos, ${atualizados} atualizados`);
            if (erros.length > 0) {
                console.error(`[PEDIDOS] ⚠️ ${erros.length} pedidos com erro`);
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Pedidos salvos com sucesso',
                    total: pedidos.length,
                    salvos,
                    atualizados,
                    erros: erros.length > 0 ? erros : undefined
                })
            };
        } catch (err) {
            console.error('[PEDIDOS] ❌ Erro ao salvar:', err.message);
            console.error('[PEDIDOS] Stack:', err.stack);
            
            // Se for erro de conexão/timeout, retornar 503
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return {
                    statusCode: 503,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Service Unavailable', 
                        message: 'Erro de conexão com o banco de dados. Tente novamente em alguns instantes.',
                        detalhes: err.message
                    })
                };
            }
            
            // Verificar se é erro de conexão MongoDB
            if (err.message.includes('MONGODB_URI') || err.message.includes('authentication')) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Erro de conexão MongoDB', 
                        detalhes: 'Verifique se MONGODB_URI está configurada corretamente na Netlify',
                        mensagem: err.message
                    })
                };
            }
            
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Erro ao salvar pedidos', 
                    detalhes: err.message,
                    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
                })
            };
        }
    }

    // DELETE: Excluir pedido
    if (event.httpMethod === 'DELETE') {
        try {
            const { pedidoId } = JSON.parse(event.body || '{}');
            
            if (!pedidoId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID do pedido não fornecido' })
                };
            }
            
            console.log(`[PEDIDOS] 🗑️ Excluindo pedido ${pedidoId} do MongoDB`);
            
            // Verificar se MONGODB_URI está configurada
            if (!process.env.MONGODB_URI) {
                console.error('[PEDIDOS] ❌ MONGODB_URI não está configurada!');
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        error: 'MongoDB não configurado', 
                        detalhes: 'Variável de ambiente MONGODB_URI não encontrada. Configure na Netlify.' 
                    })
                };
            }
            
            const pedidosCollection = await getCollection('pedidos');
            
            // Converter pedidoId para número se possível (para garantir compatibilidade)
            const pedidoIdNum = typeof pedidoId === 'string' && !isNaN(pedidoId) ? parseInt(pedidoId) : pedidoId;
            
            // Tentar excluir por id (número ou string)
            // MongoDB pode ter o id como número ou string, então tentamos ambos
            let result = await pedidosCollection.deleteOne({ id: pedidoIdNum });
            
            // Se não encontrou, tentar como string
            if (result.deletedCount === 0 && typeof pedidoIdNum !== 'string') {
                result = await pedidosCollection.deleteOne({ id: String(pedidoIdNum) });
            }
            
            // Se ainda não encontrou, tentar como número
            if (result.deletedCount === 0 && typeof pedidoIdNum === 'string') {
                const numId = parseInt(pedidoIdNum);
                if (!isNaN(numId)) {
                    result = await pedidosCollection.deleteOne({ id: numId });
                }
            }
            
            // Se ainda não encontrou, tentar buscar primeiro para ver o formato do ID
            if (result.deletedCount === 0) {
                const pedidoEncontrado = await pedidosCollection.findOne({
                    $or: [
                        { id: pedidoIdNum },
                        { id: String(pedidoIdNum) },
                        { id: parseInt(pedidoIdNum) }
                    ]
                });
                
                if (pedidoEncontrado) {
                    // Se encontrou, usar o _id para excluir
                    result = await pedidosCollection.deleteOne({ _id: pedidoEncontrado._id });
                    console.log(`[PEDIDOS] 🔍 Pedido encontrado com _id: ${pedidoEncontrado._id}, excluindo...`);
                }
            }
            
            if (result.deletedCount > 0) {
                console.log(`[PEDIDOS] ✅ Pedido ${pedidoId} excluído com sucesso do MongoDB`);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        message: 'Pedido excluído com sucesso',
                        deletedCount: result.deletedCount
                    })
                };
            } else {
                console.log(`[PEDIDOS] ⚠️ Pedido ${pedidoId} não encontrado no MongoDB`);
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Pedido não encontrado no banco de dados',
                        deletedCount: 0
                    })
                };
            }
        } catch (err) {
            console.error('[PEDIDOS] ❌ Erro ao excluir pedido:', err.message);
            console.error('[PEDIDOS] Stack:', err.stack);
            
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Erro ao excluir pedido', 
                    detalhes: err.message
                })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Método não permitido' })
    };
};
