// Vercel Serverless Function: GET/POST/PUT /api/horarios
const { getCollection } = require('./mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: Carregar horários
    if (req.method === 'GET') {
        try {
            const horariosCollection = await getCollection('configuracoes');
            const horarios = await horariosCollection.findOne({ tipo: 'horarios' });
            
            if (horarios) {
                console.log('[HORARIOS] 📦 Horários carregados');
                return res.status(200).json(horarios.dados || null);
            } else {
                return res.status(200).json(null);
            }
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro ao carregar:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return res.status(503).json({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' });
            }
            
            return res.status(500).json({ error: 'Erro ao carregar horários', detalhes: err.message });
        }
    }

    // POST: Salvar horários
    if (req.method === 'POST') {
        try {
            const horarios = req.body;
            
            if (!horarios) {
                return res.status(400).json({ error: 'Body vazio' });
            }
            
            const horariosCollection = await getCollection('configuracoes');
            
            await horariosCollection.updateOne(
                { tipo: 'horarios' },
                { 
                    $set: { 
                        tipo: 'horarios',
                        dados: horarios,
                        atualizadoEm: new Date().toISOString()
                    } 
                },
                { upsert: true }
            );
            
            console.log('[HORARIOS] ✅ Horários salvos');
            
            return res.status(200).json({ 
                success: true, 
                message: 'Horários salvos com sucesso'
            });
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro ao salvar:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return res.status(503).json({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' });
            }
            
            return res.status(500).json({ error: 'Erro ao salvar horários', detalhes: err.message });
        }
    }

    // PUT: Atualizar status manual (abrir/fechar loja)
    if (req.method === 'PUT') {
        try {
            const { statusManual } = req.body;
            
            if (statusManual === undefined) {
                return res.status(400).json({ error: 'statusManual é obrigatório' });
            }
            
            const horariosCollection = await getCollection('configuracoes');
            const existente = await horariosCollection.findOne({ tipo: 'horarios' });
            
            if (existente && existente.dados) {
                existente.dados.statusManual = statusManual;
                existente.dados.statusManualAtualizadoEm = new Date().toISOString();
                
                await horariosCollection.updateOne(
                    { tipo: 'horarios' },
                    { 
                        $set: { 
                            tipo: 'horarios',
                            dados: existente.dados,
                            atualizadoEm: new Date().toISOString()
                        } 
                    }
                );
            } else {
                const horariosPadrao = {
                    ativo: true,
                    fuso: 'America/Sao_Paulo',
                    statusManual: statusManual,
                    statusManualAtualizadoEm: new Date().toISOString(),
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
                
                await horariosCollection.updateOne(
                    { tipo: 'horarios' },
                    { 
                        $set: { 
                            tipo: 'horarios',
                            dados: horariosPadrao,
                            atualizadoEm: new Date().toISOString()
                        } 
                    },
                    { upsert: true }
                );
            }
            
            console.log(`[HORARIOS] ✅ Status manual atualizado: ${statusManual ? 'Aberta' : 'Fechada'}`);
            
            return res.status(200).json({ 
                success: true, 
                message: `Loja ${statusManual ? 'aberta' : 'fechada'} com sucesso`
            });
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro ao atualizar status:', err.message);
            
            if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('connection') || err.message.includes('ETIMEDOUT')) {
                return res.status(503).json({ error: 'Service Unavailable', message: 'Erro de conexão com o banco de dados' });
            }
            
            return res.status(500).json({ error: 'Erro ao atualizar status', detalhes: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
};


