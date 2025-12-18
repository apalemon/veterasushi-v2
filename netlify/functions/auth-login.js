// Netlify Function: POST /api/auth/login
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
            body: JSON.stringify({ success: false, message: 'Método não permitido' })
        };
    }

    try {
        const { usuario, senha } = JSON.parse(event.body);
        
        if (!usuario || !senha) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: 'Usuário e senha são obrigatórios' })
            };
        }
        
        const usuariosCollection = await getCollection('usuarios');
        
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
            user = await usuariosCollection.findOne({ 
                $or: [{ usuario: 'admin' }, { nivel: 'admin' }],
                ativo: { $ne: false }
            });
        } else {
            user = await usuariosCollection.findOne({ 
                $or: [{ usuario: usuario }, { telefone: usuario }],
                ativo: { $ne: false }
            });
        }
        
        if (!user) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, message: 'Usuário não encontrado' })
            };
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
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, user: userSafe })
            };
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: false, message: 'Senha incorreta' })
        };
    } catch (err) {
        console.error('[AUTH-LOGIN] ❌ Erro:', err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Erro ao validar login' })
        };
    }
};
