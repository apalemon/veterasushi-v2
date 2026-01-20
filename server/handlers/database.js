// Handler moved from api/database.js
const { getCollection } = require('../mongodb');
const fs = require('fs');
const path = require('path');

let _cachePayload = null;
let _cacheAt = 0;
let _cachePromise = null;
const CACHE_TTL_MS = 5000;

// Cache simples de nomes de arquivos em /Fotos para mapear por ID
let _fotosIndex = null;
function getFotosIndex() {
    try {
        if (_fotosIndex) return _fotosIndex;
        const fotosDir = path.join(__dirname, '..', '..', 'Fotos');
        const files = fs.existsSync(fotosDir) ? fs.readdirSync(fotosDir) : [];
        _fotosIndex = Array.isArray(files) ? files : [];
        return _fotosIndex;
    } catch (e) {
        _fotosIndex = [];
        return _fotosIndex;
    }
}

function resolveImagemProduto(prod) {
    try {
        if (!prod) return '';

        // Se já for path local válido em /Fotos, manter
        const img = typeof prod.imagem === 'string' ? prod.imagem.trim() : '';
        if (img && img.startsWith('/Fotos/')) return img;

        const id = (prod.id !== undefined && prod.id !== null) ? String(prod.id) : '';
        if (!id) return '';

        const files = getFotosIndex();

        // Padrões conhecidos
        const candidates = [
            // padrão atual do projeto: produto-<id>-Nome.png
            new RegExp('^produto-' + id.replace(/[-/\\.^$*+?()[\]{}|]/g, '\\$&') + '-.+\\.(png|jpg|jpeg|webp)$', 'i'),
            // fallback: produto_<id>.png/jpg
            new RegExp('^produto_' + id.replace(/[-/\\.^$*+?()[\]{}|]/g, '\\$&') + '\\.(png|jpg|jpeg|webp)$', 'i'),
            // fallback: <id>.png/jpg
            new RegExp('^' + id.replace(/[-/\\.^$*+?()[\]{}|]/g, '\\$&') + '\\.(png|jpg|jpeg|webp)$', 'i')
        ];

        const found = files.find(f => candidates.some(rx => rx.test(String(f))));
        return found ? '/Fotos/' + found : '';
    } catch (e) {
        return '';
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Cache rápido (evita várias consultas ao Mongo em refresh/reload)
    try {
        const now = Date.now();
        if (_cachePayload && (now - _cacheAt) < CACHE_TTL_MS) {
            return res.status(200).json(_cachePayload);
        }
        if (_cachePromise) {
            const payload = await _cachePromise;
            return res.status(200).json(payload);
        }
    } catch (e) {
        // ignora cache
    }

    try {
        _cachePromise = (async () => {
            const produtosCollection = await getCollection('produtos');
            const cuponsCollection = await getCollection('cupons');
            const configuracoesCollection = await getCollection('configuracoes');
            const categoriasCollection = await getCollection('categorias');
            const complementosCollection = await getCollection('complementos');

            // IGNORAR produtos do MongoDB - usar apenas produtos manuais do código
            const produtosLimpos = [];
            console.log('[DATABASE] ⚠️ Produtos do MongoDB ignorados - usando produtos manuais do código');

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

            let complementos = [];
            try {
                const complementosDoc = await complementosCollection.findOne({ _id: 'main' });
                complementos = (complementosDoc && complementosDoc.complementos) ? complementosDoc.complementos : [];
            } catch (e) {
                complementos = [];
            }

            console.log(`[DATABASE] 📦 Produtos: 0 (usando produtos manuais do código), Cupons: ${cupons.length}, Categorias: ${categorias.length}, Complementos: ${complementos.length}`);

            const payload = {
                produtos: produtosLimpos || [],
                categorias: categorias || [],
                categoriasDetalhadas: (categoriasDetalhadas || []).map(c => {
                    if (!c) return c;
                    const cc = { ...c };
                    delete cc._id;
                    return cc;
                }),
                cupons: (cupons || []).map(c => {
                    if (!c || typeof c !== 'object') return c;
                    const copy = { ...c };
                    delete copy._id;
                    return copy;
                }),
                complementos: complementos || [],
                configuracoes: {
                    chavePix: configuracoes.chavePix || '',
                    nomeEstabelecimento: configuracoes.nomeEstabelecimento || 'Minha Loja',
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

            _cachePayload = payload;
            _cacheAt = Date.now();
            return payload;
        })();

        const payload = await _cachePromise;
        return res.status(200).json(payload);
    } catch (e) {
        _cachePromise = null;
        console.error('[DATABASE] Erro:', e);
        return res.status(500).json({ error: 'Erro ao carregar database', detalhes: e.message });
    } finally {
        _cachePromise = null;
    }
};