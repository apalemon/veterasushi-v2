// Netlify Function: POST /api/cupons/validar
const { getCollection } = require('./mongodb');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ valido: false, mensagem: 'Método não permitido' })
        };
    }

    try {
        const { codigo, valorTotal } = JSON.parse(event.body);
        
        if (!codigo) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ valido: false, mensagem: 'Código do cupom não fornecido' })
            };
        }
        
        const cuponsCollection = await getCollection('cupons');
        const codigoUpper = codigo.toUpperCase().trim();
        
        // Buscar cupom no MongoDB
        const cupom = await cuponsCollection.findOne({
            $expr: {
                $eq: [
                    { $toUpper: { $trim: { input: '$codigo' } } },
                    codigoUpper
                ]
            },
            ativo: { $ne: false }
        });
        
        if (!cupom) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valido: false, mensagem: 'Cupom não encontrado ou inativo' })
            };
        }
        
        // Verificar validade
        if (cupom.validade) {
            const dataValidade = new Date(cupom.validade);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataValidade.setHours(0, 0, 0, 0);
            
            if (dataValidade < hoje) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ valido: false, mensagem: 'Cupom expirado' })
                };
            }
        }
        
        // Verificar valor mínimo
        if (cupom.valorMinimo && valorTotal < cupom.valorMinimo) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valido: false, mensagem: `Valor mínimo de R$ ${cupom.valorMinimo.toFixed(2)}` })
            };
        }
        
        // Verificar usos máximos
        const limite = cupom.limiteUsos || cupom.usosMaximos;
        if (limite && (cupom.usosAtuais || 0) >= limite) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valido: false, mensagem: 'Cupom esgotado' })
            };
        }
        
        // Remover _id do MongoDB antes de retornar
        const { _id, ...cupomSemId } = cupom;
        
        // Incluir informações de frete grátis se existir
        if (cupom.freteGratis) {
            cupomSemId.freteGratis = true;
            if (cupom.distanciaMaxFreteGratis) {
                cupomSemId.distanciaMaxFreteGratis = cupom.distanciaMaxFreteGratis;
            }
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ valido: true, cupom: cupomSemId })
        };
    } catch (err) {
        console.error('[CUPONS-VALIDAR] ❌ Erro:', err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ valido: false, mensagem: 'Erro ao validar cupom' })
        };
    }
};
