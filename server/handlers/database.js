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
                tempoPreparo: 30,
                logoUrl: '/logo.png',
                faviconUrl: '/logo.png',
                tema: {
                    accent: '#dc2626',
                    accentHover: '#b91c1c',
                    bg: '#0a0a0a',
                    bgSecondary: '#111111',
                    textPrimary: '#ffffff',
                    textSecondary: '#a3a3a3'
                }
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
                tempoPreparo: configuracoes.tempoPreparo || 30,
                logoUrl: configuracoes.logoUrl || '/logo.png',
                faviconUrl: configuracoes.faviconUrl || '/logo.png',
                tema: {
                    accent: configuracoes.tema?.accent || '#dc2626',
                    accentHover: configuracoes.tema?.accentHover || '#b91c1c',
                    bg: configuracoes.tema?.bg || '#0a0a0a',
                    bgSecondary: configuracoes.tema?.bgSecondary || '#111111',
                    textPrimary: configuracoes.tema?.textPrimary || '#ffffff',
                    textSecondary: configuracoes.tema?.textSecondary || '#a3a3a3'
                }
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
                tempoPreparo: 30,
                logoUrl: '/logo.png',
                faviconUrl: '/logo.png',
                tema: {
                    accent: '#dc2626',
                    accentHover: '#b91c1c',
                    bg: '#0a0a0a',
                    bgSecondary: '#111111',
                    textPrimary: '#ffffff',
                    textSecondary: '#a3a3a3'
                }
            }
        });
    }
};