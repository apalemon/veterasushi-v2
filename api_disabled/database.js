// Vercel Serverless Function: GET /api/database
const { getCollection } = require('./mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const produtosCollection = await getCollection('produtos');
        const cuponsCollection = await getCollection('cupons');
        const configuracoesCollection = await getCollection('configuracoes');
        
        const produtos = await produtosCollection.find({ ativo: { $ne: false } }).toArray();
        const cupons = await cuponsCollection.find({ ativo: { $ne: false } }).toArray();
        
        let configuracoes = await configuracoesCollection.findOne({ _id: 'main' });
        if (!configuracoes) {
            configuracoes = {
                chavePix: '',
                nomeEstabelecimento: 'Vetera Sushi',
                telefone: '',
                endereco: '',
                taxaEntrega: 0,
                tempoPreparo: 30
            };
        } else {
            delete configuracoes._id;
        }
        
        const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];
        
        console.log(`[DATABASE] 📦 Produtos: ${produtos.length}, Cupons: ${cupons.length}, Categorias: ${categorias.length}`);
        
        const dadosPublicos = {
            produtos: produtos || [],
            categorias: categorias || [],
            cupons: cupons || [],
            configuracoes: {
                chavePix: configuracoes.chavePix || '',
                nomeEstabelecimento: configuracoes.nomeEstabelecimento || 'Vetera Sushi',
                telefone: configuracoes.telefone || '',
                endereco: configuracoes.endereco || '',
                taxaEntrega: configuracoes.taxaEntrega || 0,
                tempoPreparo: configuracoes.tempoPreparo || 30
            }
        };
        
        return res.status(200).json(dadosPublicos);
    } catch (err) {
        console.error('[DATABASE] ❌ Erro geral:', err.message);
        return res.status(200).json({
            produtos: [],
            categorias: [],
            cupons: [],
            configuracoes: {
                chavePix: '',
                nomeEstabelecimento: 'Vetera Sushi',
                telefone: '',
                endereco: '',
                taxaEntrega: 0,
                tempoPreparo: 30
            }
        });
    }
};


