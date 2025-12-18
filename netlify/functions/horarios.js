// Netlify Function: GET/POST /api/horarios
const { getCollection } = require('./mongodb');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // GET: Carregar horários
    if (event.httpMethod === 'GET') {
        try {
            const horariosCollection = await getCollection('configuracoes');
            const horarios = await horariosCollection.findOne({ tipo: 'horarios' });
            
            if (horarios) {
                console.log('[HORARIOS] 📦 Horários carregados');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(horarios.dados || null)
                };
            } else {
                // Retornar null se não existir
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(null)
                };
            }
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro ao carregar:', err.message);
            
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
                body: JSON.stringify({ error: 'Erro ao carregar horários', detalhes: err.message })
            };
        }
    }

    // POST: Salvar horários
    if (event.httpMethod === 'POST') {
        try {
            const horarios = JSON.parse(event.body);
            
            if (!horarios) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Body vazio' })
                };
            }
            
            const horariosCollection = await getCollection('configuracoes');
            
            // Salvar ou atualizar horários
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
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Horários salvos com sucesso'
                })
            };
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro ao salvar:', err.message);
            
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
                body: JSON.stringify({ error: 'Erro ao salvar horários', detalhes: err.message })
            };
        }
    }

    // PUT: Atualizar status manual (abrir/fechar loja)
    if (event.httpMethod === 'PUT') {
        try {
            const { statusManual } = JSON.parse(event.body);
            
            if (statusManual === undefined) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'statusManual é obrigatório' })
                };
            }
            
            const horariosCollection = await getCollection('configuracoes');
            
            // Buscar horários existentes
            const existente = await horariosCollection.findOne({ tipo: 'horarios' });
            
            if (existente && existente.dados) {
                // Atualizar status manual
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
                // Criar novo com status manual
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
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: `Loja ${statusManual ? 'aberta' : 'fechada'} com sucesso`
                })
            };
        } catch (err) {
            console.error('[HORARIOS] ❌ Erro ao atualizar status:', err.message);
            
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
                body: JSON.stringify({ error: 'Erro ao atualizar status', detalhes: err.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Método não permitido' })
    };
};

