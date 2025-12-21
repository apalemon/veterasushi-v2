// Handler moved from api/usuarios.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: Carregar usuários (clientes)
    if (req.method === 'GET') {
        try {
            const usuariosCollection = await getCollection('clientes');
            const usuarios = await usuariosCollection.find({}).toArray();
            console.log(`[USUARIOS] 📦 Carregados ${usuarios.length} usuários`);
            return res.status(200).json(usuarios);
        } catch (err) {
            console.error('[USUARIOS] ❌ Erro ao carregar:', err.message);
            return res.status(200).json([]);
        }
    }

    // POST: Salvar usuários (clientes)
    if (req.method === 'POST') {
        try {
            const usuarios = req.body;
            if (!usuarios || !Array.isArray(usuarios)) {
                return res.status(400).json({ error: 'Dados inválidos. Esperado array.' });
            }
            const usuariosCollection = await getCollection('clientes');
            let salvos = 0;
            let atualizados = 0;
            for (const usuario of usuarios) {
                if (!usuario || !usuario.telefone) continue;
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
            return res.status(200).json({ 
                success: true, 
                message: 'Usuários salvos com sucesso',
                total: usuarios.length,
                salvos,
                atualizados
            });
        } catch (err) {
            console.error('[USUARIOS] ❌ Erro ao salvar:', err.message);
            return res.status(500).json({ error: 'Erro ao salvar usuários', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};