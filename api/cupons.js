// Vercel Serverless Function: GET/POST /api/cupons
const { getCollection } = require('./mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: Buscar cupons
    if (req.method === 'GET') {
        try {
            const cuponsCollection = await getCollection('cupons');
            const cupons = await cuponsCollection.find({ ativo: { $ne: false } }).toArray();
            
            console.log(`[CUPONS] 📦 Carregados ${cupons.length} cupons`);
            
            return res.status(200).json(cupons);
        } catch (err) {
            console.error('[CUPONS] ❌ Erro ao carregar:', err.message);
            return res.status(200).json([]);
        }
    }

    // POST: Salvar cupons
    if (req.method === 'POST') {
        try {
            const cupons = req.body;
            
            if (!Array.isArray(cupons)) {
                return res.status(400).json({ error: 'Cupons deve ser um array' });
            }
            
            const cuponsCollection = await getCollection('cupons');
            
            await cuponsCollection.deleteMany({});
            
            if (cupons.length > 0) {
                await cuponsCollection.insertMany(cupons);
            }
            
            console.log(`[CUPONS] ✅ ${cupons.length} cupons salvos`);
            
            return res.status(200).json({ 
                success: true, 
                message: 'Cupons salvos com sucesso',
                total: cupons.length
            });
        } catch (err) {
            console.error('[CUPONS] ❌ Erro ao salvar:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar cupons', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};


