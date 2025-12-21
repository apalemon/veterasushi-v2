// Vercel Serverless Function: GET/POST /api/condicionais
const { getCollection } = require('./mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: Carregar condicionais
    if (req.method === 'GET') {
        try {
            const condicionaisCollection = await getCollection('configuracoes');
            const condicionais = await condicionaisCollection.findOne({ tipo: 'condicionais' });
            
            if (condicionais) {
                console.log('[CONDICIONAIS] 📦 Condicionais carregadas');
                return res.status(200).json(condicionais.dados || []);
            } else {
                return res.status(200).json([]);
            }
        } catch (err) {
            console.error('[CONDICIONAIS] ❌ Erro ao carregar:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return res.status(503).json({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' });
            }
            
            return res.status(500).json({ error: 'Erro ao carregar condicionais', detalhes: err.message });
        }
    }

    // POST: Salvar condicionais
    if (req.method === 'POST') {
        try {
            const condicionais = req.body;
            
            if (!condicionais || !Array.isArray(condicionais)) {
                return res.status(400).json({ error: 'Dados inválidos. Esperado array.' });
            }
            
            const condicionaisCollection = await getCollection('configuracoes');
            
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
            
            return res.status(200).json({ 
                success: true, 
                message: 'Condicionais salvas com sucesso'
            });
        } catch (err) {
            console.error('[CONDICIONAIS] ❌ Erro ao salvar:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return res.status(503).json({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' });
            }
            
            return res.status(500).json({ error: 'Erro ao salvar condicionais', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};


