// Handler moved from api/cupons/validar.js
const { getCollection } = require('../../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { codigo, valorTotal } = req.body || {};
        if (!codigo) return res.status(400).json({ valido: false, mensagem: 'Código não informado' });
        
        // Buscar cupom no banco (case insensitive)
        const cuponsCollection = await getCollection('cupons');
        const cupom = await cuponsCollection.findOne({ 
            codigo: { $regex: new RegExp('^' + codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
        });
        
        if (!cupom) {
            return res.status(200).json({ valido: false, mensagem: 'Cupom não encontrado' });
        }
        
        // Verificar se está ativo
        if (cupom.ativo === false) {
            return res.status(200).json({ valido: false, mensagem: 'Cupom inativo' });
        }
        
        // Verificar validade
        if (cupom.validade) {
            const dataValidade = new Date(cupom.validade);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataValidade.setHours(23, 59, 59, 999);
            
            if (dataValidade < hoje) {
                return res.status(200).json({ valido: false, mensagem: 'Cupom expirado' });
            }
        }
        
        // Verificar valor mínimo
        const valorTotalNum = parseFloat(valorTotal) || 0;
        if (cupom.valorMinimo && valorTotalNum < cupom.valorMinimo) {
            return res.status(200).json({ 
                valido: false, 
                mensagem: `Valor mínimo de R$ ${cupom.valorMinimo.toFixed(2)}` 
            });
        }
        
        // Verificar usos máximos
        const limite = cupom.limiteUsos || cupom.usosMaximos;
        if (limite && (cupom.usosAtuais || 0) >= limite) {
            return res.status(200).json({ valido: false, mensagem: 'Cupom esgotado' });
        }
        
        // Cupom válido - retornar estrutura completa
        return res.status(200).json({ 
            valido: true, 
            mensagem: 'Cupom válido',
            cupom: {
                id: cupom.id || cupom._id,
                codigo: cupom.codigo,
                tipo: cupom.tipo || 'percentual',
                valor: cupom.valor || 0,
                valorMinimo: cupom.valorMinimo || 0,
                limiteUsos: cupom.limiteUsos || cupom.usosMaximos || null,
                usosAtuais: cupom.usosAtuais || 0,
                validade: cupom.validade || null,
                ativo: cupom.ativo !== false,
                freteGratis: cupom.freteGratis || false,
                distanciaMaxFreteGratis: cupom.distanciaMaxFreteGratis || null
            }
        });
    } catch (err) {
        console.error('[CUPONS/VALIDAR] ❌', err.message);
        return res.status(500).json({ valido: false, mensagem: 'Erro ao validar cupom', detalhes: err.message });
    }
};