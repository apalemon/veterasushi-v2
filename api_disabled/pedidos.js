// Vercel Serverless Function: GET/POST/DELETE /api/pedidos
const { getCollection } = require('./mongodb');

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: Carregar pedidos
    if (req.method === 'GET') {
        try {
            const pedidosCollection = await getCollection('pedidos');
            
            let pedidos = await pedidosCollection.find({}).toArray();
            
            // Ordenar manualmente (mais recentes primeiro)
            pedidos.sort((a, b) => {
                const dataA = a.dataCriacao || a.data || a.timestamp || 0;
                const dataB = b.dataCriacao || b.data || b.timestamp || 0;
                const timeA = typeof dataA === 'string' ? new Date(dataA).getTime() : dataA;
                const timeB = typeof dataB === 'string' ? new Date(dataB).getTime() : dataB;
                return timeB - timeA;
            });
            
            console.log(`[PEDIDOS] 📦 Carregados ${pedidos.length} pedidos do MongoDB`);
            
            const pedidosLimpos = pedidos.map(p => {
                const { _id, ...pedidoSemId } = p;
                return pedidoSemId;
            });
            
            return res.status(200).json(pedidosLimpos);
        } catch (err) {
            console.error('[PEDIDOS] ❌ Erro ao carregar:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection')) {
                return res.status(503).json({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' });
            }
            
            return res.status(200).json([]);
        }
    }

    // POST: Salvar pedidos
    if (req.method === 'POST') {
        try {
            const pedidos = req.body;
            
            if (!pedidos || !Array.isArray(pedidos)) {
                return res.status(400).json({ error: 'Dados inválidos. Esperado array.' });
            }
            
            console.log(`[PEDIDOS] 📥 Recebendo ${pedidos.length} pedidos para salvar`);
            
            if (!process.env.MONGODB_URI) {
                console.error('[PEDIDOS] ❌ MONGODB_URI não está configurada!');
                return res.status(500).json({ 
                    error: 'MongoDB não configurado', 
                    detalhes: 'Variável de ambiente MONGODB_URI não encontrada. Configure na Vercel.' 
                });
            }
            
            const pedidosCollection = await getCollection('pedidos');
            
            let salvos = 0;
            let atualizados = 0;
            const erros = [];
            
            for (const pedido of pedidos) {
                try {
                    if (!pedido || !pedido.id) {
                        console.warn('[PEDIDOS] ⚠️ Pedido sem ID, pulando:', pedido);
                        continue;
                    }
                    
                    if (!pedido.dataCriacao && !pedido.data) {
                        pedido.dataCriacao = new Date();
                    } else if (pedido.data && !pedido.dataCriacao) {
                        pedido.dataCriacao = new Date(pedido.data);
                    }
                    
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
                        atualizados++;
                    }
                } catch (pedidoErr) {
                    console.error(`[PEDIDOS] ❌ Erro ao processar pedido ${pedido.id}:`, pedidoErr.message);
                    erros.push({ id: pedido.id, erro: pedidoErr.message });
                }
            }
            
            console.log(`[PEDIDOS] ✅ Processados: ${salvos} novos, ${atualizados} atualizados`);
            
            return res.status(200).json({ 
                success: true, 
                message: 'Pedidos salvos com sucesso',
                total: pedidos.length,
                salvos,
                atualizados,
                erros: erros.length > 0 ? erros : undefined
            });
        } catch (err) {
            console.error('[PEDIDOS] ❌ Erro ao salvar:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return res.status(503).json({ 
                    error: 'Service Unavailable', 
                    message: 'Erro de conexão com o banco de dados. Tente novamente em alguns instantes.',
                    detalhes: err.message
                });
            }
            
            if (err.message.includes('MONGODB_URI') || err.message.includes('authentication')) {
                return res.status(500).json({ 
                    error: 'Erro de conexão MongoDB', 
                    detalhes: 'Verifique se MONGODB_URI está configurada corretamente na Vercel',
                    mensagem: err.message
                });
            }
            
            return res.status(500).json({ 
                error: 'Erro ao salvar pedidos', 
                detalhes: err.message
            });
        }
    }

    // DELETE: Excluir pedido
    if (req.method === 'DELETE') {
        try {
            const { pedidoId } = req.body || {};
            
            if (!pedidoId) {
                return res.status(400).json({ error: 'ID do pedido não fornecido' });
            }
            
            console.log(`[PEDIDOS] 🗑️ Excluindo pedido ${pedidoId} do MongoDB`);
            
            if (!process.env.MONGODB_URI) {
                return res.status(500).json({ 
                    error: 'MongoDB não configurado', 
                    detalhes: 'Variável de ambiente MONGODB_URI não encontrada. Configure na Vercel.' 
                });
            }
            
            const pedidosCollection = await getCollection('pedidos');
            const pedidoIdNum = typeof pedidoId === 'string' && !isNaN(pedidoId) ? parseInt(pedidoId) : pedidoId;
            
            let result = await pedidosCollection.deleteOne({ id: pedidoIdNum });
            
            if (result.deletedCount === 0 && typeof pedidoIdNum !== 'string') {
                result = await pedidosCollection.deleteOne({ id: String(pedidoIdNum) });
            }
            
            if (result.deletedCount === 0 && typeof pedidoIdNum === 'string') {
                const numId = parseInt(pedidoIdNum);
                if (!isNaN(numId)) {
                    result = await pedidosCollection.deleteOne({ id: numId });
                }
            }
            
            if (result.deletedCount === 0) {
                const pedidoEncontrado = await pedidosCollection.findOne({
                    $or: [
                        { id: pedidoIdNum },
                        { id: String(pedidoIdNum) },
                        { id: parseInt(pedidoIdNum) }
                    ]
                });
                
                if (pedidoEncontrado) {
                    result = await pedidosCollection.deleteOne({ _id: pedidoEncontrado._id });
                }
            }
            
            if (result.deletedCount > 0) {
                console.log(`[PEDIDOS] ✅ Pedido ${pedidoId} excluído com sucesso`);
                return res.status(200).json({ 
                    success: true, 
                    message: 'Pedido excluído com sucesso',
                    deletedCount: result.deletedCount
                });
            } else {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Pedido não encontrado no banco de dados',
                    deletedCount: 0
                });
            }
        } catch (err) {
            console.error('[PEDIDOS] ❌ Erro ao excluir pedido:', err.message);
            return res.status(500).json({ 
                error: 'Erro ao excluir pedido', 
                detalhes: err.message
            });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};


