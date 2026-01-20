// Servidor local para desenvolvimento
const express = require('express');
const cors = require('cors');
const path = require('path');
 
// Reaproveitar o mesmo router da Vercel para /api/*
const apiRouter = require('./api/router');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Headers de segurança
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Handler para todas as rotas /api/*
app.use('/api', async (req, res) => {
    try {
        // O router espera URLs no formato /api/...
        const originalUrl = req.url;
        req.url = '/api' + originalUrl;
        await apiRouter(req, res);
    } catch (error) {
        console.error('[SERVER] Erro no handler da API:', error);
        const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
        res.status(500).json({
            error: 'Erro interno do servidor',
            detalhes: error && error.message ? String(error.message) : String(error),
            ...(isProd ? {} : { stack: error && error.stack ? String(error.stack) : null })
        });
    }
});

// Rota principal para o cardápio
app.get('/:slug/cardapio', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota principal para o gestor
app.get('/:slug/gestor', (req, res) => {
    res.sendFile(path.join(__dirname, 'gestor.html'));
});

// Rota padrão (redireciona para o cardápio)
app.get('/', (req, res) => {
    res.redirect('/vetera/cardapio');
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor iniciado em http://localhost:${PORT}`);
    console.log(`📱 Cardápio: http://localhost:${PORT}/vetera/cardapio`);
    console.log(`⚙️  Gestor: http://localhost:${PORT}/vetera/gestor`);
    console.log(`🔗 API: http://localhost:${PORT}/api/*`);
    console.log(`\n✅ Sistema Vetera Sushi funcionando!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n👋 Servidor encerrado gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n👋 Servidor encerrado gracefully');
    process.exit(0);
});
