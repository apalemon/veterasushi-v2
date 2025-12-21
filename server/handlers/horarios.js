// Handler moved from api/horarios.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const coll = await getCollection('horarios');
            // Prefer a single document if present (support both legacy array and single-doc storage)
            let doc = await coll.findOne({ _id: 'main' });
            if (!doc) {
                const docs = await coll.find({}).toArray();
                if (Array.isArray(docs) && docs.length > 0) doc = docs[0];
            }

            if (!doc) {
                // Default schedule structure
                doc = {
                    ativo: true,
                    fuso: 'America/Sao_Paulo',
                    dias: {
                        domingo: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                        segunda: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                        terca: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                        quarta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                        quinta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                        sexta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                        sabado: { aberto: true, abertura: '18:30', fechamento: '23:00' }
                    }
                };
            }

            // Remove internal _id before returning
            if (doc && doc._id) delete doc._id;

            console.log('[HORARIOS] ✅ Horário enviado ao cliente');
            return res.status(200).json(doc);
        } catch (err) {
            console.error('[HORARIOS] ❌', err.message);
            return res.status(200).json({
                ativo: true,
                fuso: 'America/Sao_Paulo',
                dias: {
                    domingo: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                    segunda: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                    terca: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                    quarta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                    quinta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                    sexta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                    sabado: { aberto: true, abertura: '18:30', fechamento: '23:00' }
                }
            });
        }
    }

    if (req.method === 'POST') {
        try {
            const horarios = req.body;
            if (!Array.isArray(horarios)) return res.status(400).json({ error: 'Horários inválidos' });
            const coll = await getCollection('horarios');
            await coll.deleteMany({});
            if (horarios.length > 0) await coll.insertMany(horarios.map(h => ({ ...h })));
            return res.status(200).json({ success: true, total: horarios.length });
        } catch (err) {
            console.error('[HORARIOS] ❌', err.message);
            return res.status(500).json({ error: 'Erro ao salvar horários', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};