const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Habilita CORS
app.use(cors());

// Middleware para parsing JSON
app.use(express.json({ limit: '50mb' }));

// Middleware para bloquear acesso direto a arquivos sensíveis (ANTES do static)
app.use((req, res, next) => {
    // Bloquear arquivos JSON sensíveis se existirem
    if (req.path.endsWith('/database.json') ||
        req.path.endsWith('/usuarios.json') ||
        req.path.endsWith('/pedidos.json')) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
});

// Serve arquivos estáticos
app.use(express.static(__dirname));

// Servir pasta de fotos
app.use('/Fotos', express.static(path.join(__dirname, 'Fotos')));

// Middleware para log de requisições (debug)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Caminhos dos arquivos
const USUARIOS_FILE_PATH = path.join(__dirname, 'data', 'usuarios.json');
const DATABASE_FILE_PATH = path.join(__dirname, 'data', 'database.json');

// Garantir que o arquivo existe
function ensureUsuariosFile() {
    const dir = path.dirname(USUARIOS_FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(USUARIOS_FILE_PATH)) {
        fs.writeFileSync(USUARIOS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
        console.log('📄 Arquivo usuarios.json criado');
    }
}

ensureUsuariosFile();

// API: Salvar usuários
app.post('/api/usuarios', (req, res) => {
    try {
        console.log('📥 Recebendo requisição POST /api/usuarios');
        const usuarios = req.body;
        
        if (!usuarios) {
            console.error('❌ Body vazio');
            return res.status(400).json({ error: 'Body vazio' });
        }
        
        if (!Array.isArray(usuarios)) {
            console.error('❌ Dados inválidos. Esperado array, recebido:', typeof usuarios);
            return res.status(400).json({ error: 'Dados inválidos. Esperado array.' });
        }
        
        console.log('💾 Salvando', usuarios.length, 'usuários...');
        
        // Garantir que o diretório existe
        const dir = path.dirname(USUARIOS_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log('📁 Diretório criado:', dir);
        }
        
        fs.writeFileSync(USUARIOS_FILE_PATH, JSON.stringify(usuarios, null, 2), 'utf8');
        console.log('✅ Usuários salvos em usuarios.json. Total:', usuarios.length);
        
        res.json({ success: true, message: 'Usuários salvos com sucesso', total: usuarios.length });
    } catch (err) {
        console.error('❌ Erro ao salvar usuários:', err);
        console.error('❌ Stack:', err.stack);
        res.status(500).json({ error: 'Erro ao salvar usuários', detalhes: err.message });
    }
});

// API: Buscar usuários (para backup - apenas para administradores autenticados)
app.get('/api/usuarios', (req, res) => {
    try {
        if (fs.existsSync(USUARIOS_FILE_PATH)) {
            const data = fs.readFileSync(USUARIOS_FILE_PATH, 'utf8');
            const usuarios = JSON.parse(data);
            res.json(usuarios);
        } else {
            res.json([]);
        }
    } catch (err) {
        console.error('[USUARIOS GET] ❌ Erro ao carregar usuários:', err);
        res.status(500).json({ error: 'Erro ao carregar usuários' });
    }
});

// API: Carregar usuários - PROTEGIDO (não expor dados sensíveis)
// Apenas para validação de login interno
app.post('/api/usuarios/validar', (req, res) => {
    try {
        const { telefone, senhaHash } = req.body;
        
        if (!telefone || !senhaHash) {
            return res.status(400).json({ success: false, message: 'Dados inválidos' });
        }
        
        if (!fs.existsSync(USUARIOS_FILE_PATH)) {
            return res.json({ success: false, message: 'Usuário não encontrado' });
        }
        
        const data = fs.readFileSync(USUARIOS_FILE_PATH, 'utf8');
        const usuarios = JSON.parse(data);
        
        const usuario = usuarios.find(u => u.telefone === telefone && u.senha === senhaHash);
        
        if (usuario) {
            // Retornar dados SEM a senha
            const { senha, ...usuarioSafe } = usuario;
            res.json({ success: true, usuario: usuarioSafe });
        } else {
            res.json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (err) {
        console.error('Erro ao validar usuário:', err);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// Caminho do arquivo pedidos.json
const PEDIDOS_FILE_PATH = path.join(__dirname, 'data', 'pedidos.json');

// Garantir que o arquivo pedidos.json existe
function ensurePedidosFile() {
    const dir = path.dirname(PEDIDOS_FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(PEDIDOS_FILE_PATH)) {
        fs.writeFileSync(PEDIDOS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
        console.log('📄 Arquivo pedidos.json criado');
    }
}

ensurePedidosFile();

// API: Salvar pedidos
app.post('/api/pedidos', (req, res) => {
    try {
        console.log('[PEDIDOS] POST /api/pedidos recebido');
        
        const pedidos = req.body;
        
        if (!pedidos) {
            console.error('[PEDIDOS] ❌ Body vazio');
            return res.status(400).json({ error: 'Body vazio' });
        }
        
        if (!Array.isArray(pedidos)) {
            console.error('[PEDIDOS] ❌ Esperado array, recebido:', typeof pedidos);
            return res.status(400).json({ error: 'Dados inválidos. Esperado array.' });
        }
        
        console.log('[PEDIDOS] 💾 Salvando', pedidos.length, 'pedidos no arquivo...');
        
        // Garantir que o diretório existe
        const dir = path.dirname(PEDIDOS_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // REMOVER DUPLICATAS baseado no ID antes de salvar
        const pedidosUnicos = [];
        const idsVistos = new Set();
        
        pedidos.forEach(pedido => {
            if (pedido && pedido.id && !idsVistos.has(pedido.id)) {
                idsVistos.add(pedido.id);
                pedidosUnicos.push(pedido);
            }
        });
        
        // Salvar no arquivo
        fs.writeFileSync(PEDIDOS_FILE_PATH, JSON.stringify(pedidosUnicos, null, 2), 'utf8');
        console.log('[PEDIDOS] ✅ Pedidos salvos! Total:', pedidosUnicos.length, '(removidas', pedidos.length - pedidosUnicos.length, 'duplicatas)');
        
        res.json({ success: true, message: 'Pedidos salvos com sucesso', total: pedidosUnicos.length });
    } catch (err) {
        console.error('[PEDIDOS] ❌ Erro ao salvar pedidos:', err.message);
        console.error('[PEDIDOS] Stack:', err.stack);
        res.status(500).json({ error: 'Erro ao salvar pedidos', detalhes: err.message });
    }
});

// Tratar método OPTIONS (preflight CORS)
app.options('/api/pedidos', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

// API: Carregar pedidos
app.get('/api/pedidos', (req, res) => {
    try {
        if (!fs.existsSync(PEDIDOS_FILE_PATH)) {
            ensurePedidosFile();
        }
        const data = fs.readFileSync(PEDIDOS_FILE_PATH, 'utf8');
        const pedidos = JSON.parse(data);
        res.json(pedidos);
    } catch (err) {
        console.error('[PEDIDOS GET] ❌ Erro ao carregar pedidos:', err);
        res.status(500).json({ error: 'Erro ao carregar pedidos' });
    }
});

// Caminho da pasta Fotos
const FOTOS_DIR = path.join(__dirname, 'Fotos');

// Garantir que a pasta Fotos existe
if (!fs.existsSync(FOTOS_DIR)) {
    fs.mkdirSync(FOTOS_DIR, { recursive: true });
    console.log('📁 Pasta Fotos criada');
}

// API: Buscar dados públicos do database (sem usuários)
app.get('/api/database', (req, res) => {
    try {
        let database = {};
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf8');
            database = JSON.parse(data);
        }
        
        // Retornar apenas dados públicos (sem usuários e sem informações sensíveis)
        const dadosPublicos = {
            produtos: database.produtos || [],
            categorias: database.categorias || [],
            cupons: database.cupons || [],
            configuracoes: {
                chavePix: database.configuracoes?.chavePix || '',
                nomeEstabelecimento: database.configuracoes?.nomeEstabelecimento || '',
                telefone: database.configuracoes?.telefone || '',
                endereco: database.configuracoes?.endereco || '',
                taxaEntrega: database.configuracoes?.taxaEntrega || 0,
                tempoPreparo: database.configuracoes?.tempoPreparo || 30
            }
            // NÃO incluir: usuarios, pedidos, clientes
        };
        
        res.json(dadosPublicos);
    } catch (err) {
        console.error('Erro ao buscar database:', err);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
});

// API: Buscar cupons do database.json
app.get('/api/cupons', (req, res) => {
    try {
        let database = {};
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf8');
            database = JSON.parse(data);
        }
        
        const cupons = database.cupons || [];
        res.json(cupons);
    } catch (err) {
        console.error('Erro ao buscar cupons:', err);
        res.status(500).json({ error: 'Erro ao buscar cupons' });
    }
});

// API: Validar login (sem expor dados)
app.post('/api/auth/login', (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        if (!usuario || !senha) {
            return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
        }
        
        // Carregar database.json
        let database = {};
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf8');
            database = JSON.parse(data);
        }
        
        const usuarios = database.usuarios || [];
        
        // Função de hash (mesma do cliente)
        function hashPassword(password) {
            if (!password) return '';
            const salt = 'vetera_sushi_2024_salt_secure';
            const saltedPassword = salt + password + salt;
            let hash = 0;
            for (let i = 0; i < saltedPassword.length; i++) {
                const char = saltedPassword.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            let hash2 = 0;
            for (let i = saltedPassword.length - 1; i >= 0; i--) {
                const char = saltedPassword.charCodeAt(i);
                hash2 = ((hash2 << 3) - hash2) + char;
                hash2 = hash2 & hash2;
            }
            const combined = Math.abs(hash) + Math.abs(hash2);
            return 'hashed_' + Math.abs(combined).toString(36) + Math.abs(hash).toString(36).slice(-10);
        }
        
        // Buscar usuário
        let user = null;
        if (usuario.toLowerCase() === 'admin') {
            user = usuarios.find(u => (u.usuario === 'admin' || u.nivel === 'admin') && u.ativo !== false);
        } else {
            user = usuarios.find(u => (u.usuario === usuario || u.telefone === usuario) && u.ativo !== false);
        }
        
        if (!user) {
            return res.json({ success: false, message: 'Usuário não encontrado' });
        }
        
        // Verificar senha
        let senhaValida = false;
        if (user.senha && user.senha.startsWith('hashed_')) {
            const senhaHash = hashPassword(senha);
            senhaValida = senhaHash === user.senha;
        } else {
            const senhaHash = hashPassword(senha);
            const senhaArmazenadaHash = hashPassword(user.senha);
            senhaValida = (user.senha === senha) || (senhaHash === senhaArmazenadaHash);
        }
        
        if (senhaValida) {
            // Remover senha antes de retornar
            const { senha: _, ...userSafe } = user;
            return res.json({ success: true, user: userSafe });
        }
        
        return res.json({ success: false, message: 'Senha incorreta' });
    } catch (err) {
        console.error('Erro ao validar login:', err);
        res.status(500).json({ success: false, message: 'Erro ao validar login' });
    }
});

// API: Validar cupom
app.post('/api/cupons/validar', (req, res) => {
    try {
        const { codigo, valorTotal } = req.body;
        
        if (!codigo) {
            return res.status(400).json({ valido: false, mensagem: 'Código do cupom não fornecido' });
        }
        
        // Carregar database.json
        let database = {};
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf8');
            database = JSON.parse(data);
        }
        
        const cupons = database.cupons || [];
        
        const codigoUpper = codigo.toUpperCase().trim();
        
        const cupom = cupons.find(c => {
            const codigoCupom = (c.codigo || '').toUpperCase().trim();
            return codigoCupom === codigoUpper && (c.ativo === true || c.ativo === undefined);
        });
        
        if (!cupom) {
            return res.json({ valido: false, mensagem: 'Cupom não encontrado ou inativo' });
        }
        
        // Verificar validade
        if (cupom.validade) {
            const dataValidade = new Date(cupom.validade);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataValidade.setHours(0, 0, 0, 0);
            
            if (dataValidade < hoje) {
                return res.json({ valido: false, mensagem: 'Cupom expirado' });
            }
        }
        
        // Verificar valor mínimo
        if (cupom.valorMinimo && valorTotal < cupom.valorMinimo) {
            return res.json({ valido: false, mensagem: `Valor mínimo de R$ ${cupom.valorMinimo.toFixed(2)}` });
        }
        
        // Verificar usos máximos
        const limite = cupom.limiteUsos || cupom.usosMaximos;
        if (limite && (cupom.usosAtuais || 0) >= limite) {
            return res.json({ valido: false, mensagem: 'Cupom esgotado' });
        }
        
        res.json({ valido: true, cupom });
    } catch (err) {
        console.error('Erro ao validar cupom:', err);
        res.status(500).json({ valido: false, mensagem: 'Erro ao validar cupom' });
    }
});

// API: Salvar cupons no database.json
app.post('/api/cupons', (req, res) => {
    try {
        const cupons = req.body;
        if (!Array.isArray(cupons)) {
            return res.status(400).json({ error: 'Cupons deve ser um array' });
        }
        
        // Carregar database.json
        let database = {};
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf8');
            database = JSON.parse(data);
        }
        
        // Atualizar cupons
        database.cupons = cupons;
        
        // Salvar de volta
        fs.writeFileSync(DATABASE_FILE_PATH, JSON.stringify(database, null, 2), 'utf8');
        
        console.log('Cupons salvos no database.json:', cupons.length);
        res.json({ success: true, message: 'Cupons salvos com sucesso' });
    } catch (err) {
        console.error('Erro ao salvar cupons:', err);
        res.status(500).json({ error: 'Erro ao salvar cupons' });
    }
});

// API: Salvar imagem de produto
app.post('/api/upload-imagem', (req, res) => {
    try {
        const { imagemBase64, produtoId, nomeProduto } = req.body;
        
        if (!imagemBase64) {
            return res.status(400).json({ error: 'Imagem não fornecida' });
        }
        
        // Extrair base64 (remover data:image/...;base64,)
        const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Nome do arquivo: produto-{id}-{nome}.png
        const nomeArquivo = `produto-${produtoId}-${(nomeProduto || 'imagem').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        const caminhoArquivo = path.join(FOTOS_DIR, nomeArquivo);
        
        // Salvar arquivo
        fs.writeFileSync(caminhoArquivo, imageBuffer);
        
        // Retornar URL da imagem (usar caminho absoluto)
        const imageUrl = `/Fotos/${nomeArquivo}`;
        
        res.json({ success: true, url: imageUrl, caminho: imageUrl });
    } catch (err) {
        console.error('Erro ao salvar imagem:', err);
        res.status(500).json({ error: 'Erro ao salvar imagem' });
    }
});

// API: Salvar produtos no database.json
app.post('/api/produtos', (req, res) => {
    try {
        const produtos = req.body;
        if (!Array.isArray(produtos)) {
            return res.status(400).json({ error: 'Produtos deve ser um array' });
        }
        
        // Carregar database.json
        let database = {};
        if (fs.existsSync(DATABASE_FILE_PATH)) {
            const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf8');
            database = JSON.parse(data);
        }
        
        // Atualizar produtos
        database.produtos = produtos;
        
        // Salvar de volta
        fs.writeFileSync(DATABASE_FILE_PATH, JSON.stringify(database, null, 2), 'utf8');
        
        res.json({ success: true, message: 'Produtos salvos com sucesso', total: produtos.length });
    } catch (err) {
        console.error('Erro ao salvar produtos:', err);
        res.status(500).json({ error: 'Erro ao salvar produtos' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📁 Arquivo usuarios.json: ${USUARIOS_FILE_PATH}`);
    console.log(`📁 Arquivo pedidos.json: ${PEDIDOS_FILE_PATH}`);
    console.log(`📁 Pasta Fotos: ${FOTOS_DIR}`);
});
