// Handler moved from api/horarios.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Permitir PUT além dos métodos existentes para suportar atualizações manuais
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
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

                // Persistir no servidor como fonte de verdade
                try {
                    await coll.updateOne({ _id: 'main' }, { $set: { ...doc } }, { upsert: true });
                } catch (e) {
                    // best-effort
                }
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
            const coll = await getCollection('horarios');

            // Compatibilidade: se vier array, manter comportamento legado
            if (Array.isArray(horarios)) {
                await coll.deleteMany({});
                if (horarios.length > 0) await coll.insertMany(horarios.map(h => ({ ...h })));
                return res.status(200).json({ success: true, total: horarios.length });
            }

            // Novo: aceitar objeto e persistir como documento único
            if (!horarios || typeof horarios !== 'object') {
                return res.status(400).json({ error: 'Horários inválidos' });
            }

            const docToSave = { ...horarios };
            // Garantir que não persista _id enviado pelo cliente
            if (docToSave._id) delete docToSave._id;
            await coll.updateOne({ _id: 'main' }, { $set: docToSave }, { upsert: true });

            const saved = await coll.findOne({ _id: 'main' });
            if (saved && saved._id) delete saved._id;
            return res.status(200).json(saved);
        } catch (err) {
            console.error('[HORARIOS] ❌', err.message);
            return res.status(500).json({ error: 'Erro ao salvar horários', detalhes: err.message });
        }
    }

    // PUT - atualizar flags (statusManual / aberta) sem precisar enviar o documento completo
    if (req.method === 'PUT') {
        try {
            const body = req.body || {};
            const coll = await getCollection('horarios');

            // Prepare the update according to received flags
            const update = {};
            if (Object.prototype.hasOwnProperty.call(body, 'statusManual')) {
                // If explicit boolean or null provided
                update.statusManual = body.statusManual === null ? null : !!body.statusManual;
                // If statusManual is boolean true -> mark aberta true; if false -> aberta false; if null -> do not change aberta
                if (body.statusManual === true) update.aberta = true;
                else if (body.statusManual === false) update.aberta = false;
            }

            if (Object.prototype.hasOwnProperty.call(body, 'aberta')) {
                update.aberta = !!body.aberta;
            }

            if (Object.keys(update).length === 0) {
                return res.status(400).json({ error: 'Nenhuma alteração válida fornecida' });
            }

            // Ensure a single document storage with _id = 'main'
            await coll.updateOne({ _id: 'main' }, { $set: update }, { upsert: true });

            console.log('[HORARIOS] ✅ Atualizado (PUT):', update);
            // Return the updated document
            const doc = await coll.findOne({ _id: 'main' });
            if (doc && doc._id) delete doc._id;
            return res.status(200).json(doc);
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro no PUT:', err.message);
            return res.status(500).json({ error: 'Erro ao atualizar horários', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};