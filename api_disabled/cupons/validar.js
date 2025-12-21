// Vercel Serverless Function: POST /api/cupons/validar
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ valido: false, mensagem: 'Método não permitido' });
    }

    try {
        const { codigo, valorTotal } = req.body;
        
        if (!codigo) {
            return res.status(400).json({ valido: false, mensagem: 'Código do cupom não fornecido' });
        }
        
        const cuponsCollection = await getCollection('cupons');
        const codigoUpper = codigo.toUpperCase().trim();
        
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
            return res.status(200).json({ valido: false, mensagem: 'Cupom não encontrado ou inativo' });
        }
        
        if (cupom.validade) {
            const dataValidade = new Date(cupom.validade);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataValidade.setHours(0, 0, 0, 0);
            
            if (dataValidade < hoje) {
                return res.status(200).json({ valido: false, mensagem: 'Cupom expirado' });
            }
        }
        
        if (cupom.valorMinimo && valorTotal < cupom.valorMinimo) {
            return res.status(200).json({ valido: false, mensagem: `Valor mínimo de R$ ${cupom.valorMinimo.toFixed(2)}` });
        }
        
        const limite = cupom.limiteUsos || cupom.usosMaximos;
        if (limite && (cupom.usosAtuais || 0) >= limite) {
            return res.status(200).json({ valido: false, mensagem: 'Cupom esgotado' });
        }
        
        const { _id, ...cupomSemId } = cupom;
        
        if (cupom.freteGratis) {
            cupomSemId.freteGratis = true;
            if (cupom.distanciaMaxFreteGratis) {
                cupomSemId.distanciaMaxFreteGratis = cupom.distanciaMaxFreteGratis;
            }
        }
        
        return res.status(200).json({ valido: true, cupom: cupomSemId });
    } catch (err) {
        console.error('[CUPONS-VALIDAR] ❌ Erro:', err.message);
        return res.status(500).json({ valido: false, mensagem: 'Erro ao validar cupom' });
    }
};


