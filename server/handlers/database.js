// Handler moved from api/database.js
const { getCollection } = require('../mongodb');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const produtosCollection = await getCollection('produtos');
        const cuponsCollection = await getCollection('cupons');
        const configuracoesCollection = await getCollection('configuracoes');
        const categoriasCollection = await getCollection('categorias');

        const produtos = await produtosCollection.find({}).toArray();
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

        let categoriasDetalhadas = [];
        try {
            categoriasDetalhadas = await categoriasCollection.find({}).toArray();
        } catch (e) {
            categoriasDetalhadas = [];
        }
        // Compatibilidade: categorias como array de nomes
        const categorias = (categoriasDetalhadas && categoriasDetalhadas.length > 0)
            ? categoriasDetalhadas.map(c => c.nome).filter(Boolean)
            : [...new Set(produtos.map(p => p.categoria).filter(Boolean))];

        console.log(`[DATABASE] 📦 Produtos: ${produtos.length}, Cupons: ${cupons.length}, Categorias: ${categorias.length}`);

        const dadosPublicos = {
            produtos: produtos || [],
            categorias: categorias || [],
            categoriasDetalhadas: (categoriasDetalhadas || []).map(c => {
                if (!c) return c;
                const cc = { ...c };
                delete cc._id;
                return cc;
            }),
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
        return res.status(200).json({ produtos: [], categorias: [], cupons: [], configuracoes: { chavePix: '', nomeEstabelecimento: 'Vetera Sushi', telefone: '', endereco: '', taxaEntrega: 0, tempoPreparo: 30 } });
    }
};