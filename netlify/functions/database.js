// Netlify Function: GET /api/database
const { getCollection } = require('./mongodb');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Buscar dados do MongoDB
        const produtosCollection = await getCollection('produtos');
        const cuponsCollection = await getCollection('cupons');
        const configuracoesCollection = await getCollection('configuracoes');
        
        // Buscar produtos (apenas ativos)
        const produtos = await produtosCollection.find({ ativo: { $ne: false } }).toArray();
        
        // Buscar cupons (apenas ativos)
        const cupons = await cuponsCollection.find({ ativo: { $ne: false } }).toArray();
        
        // Buscar configurações (ou usar padrão)
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
            // Remover _id do objeto de configurações
            delete configuracoes._id;
        }
        
        // Gerar categorias a partir dos produtos
        const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];
        
        console.log(`[NETLIFY-DB] 📦 Produtos carregados: ${produtos.length}, Cupons: ${cupons.length}, Categorias: ${categorias.length}`);
        
        // Retornar apenas dados públicos (sem usuários e sem informações sensíveis)
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
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(dadosPublicos)
        };
    } catch (err) {
        console.error('[NETLIFY-DB] ❌ Erro geral:', err.message);
        console.error('[NETLIFY-DB] Stack:', err.stack);
        // Em caso de erro, retornar estrutura vazia
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
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
            })
        };
    }
};
