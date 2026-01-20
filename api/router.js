const path = require('path');
const fs = require('fs');
const { verifyJwt, getBearerToken } = require('../server/jwt');

module.exports = async (req, res) => {
  // This single serverless function handles ALL /api/* routes (Hobby plan friendly)
  // It is invoked via vercel.json rewrite: /api/:path* -> /api/router

  try {
    // req.url will be like: /api/database?x=1
    const url = String(req.url || '');
    const clean = url.split('?')[0];

    // Remove leading "/api" (and possible leading "/")
    let rest = clean;
    if (rest.startsWith('/api')) rest = rest.slice(4);
    if (rest.startsWith('/')) rest = rest.slice(1);

    const parts = rest.split('/').filter(Boolean);

    // =========================
    // AUTH (JWT Bearer)
    // =========================
    function isProtectedRoute(partsArr, method, fullUrl) {
      const m = String(method || '').toUpperCase();
      const first = partsArr && partsArr.length > 0 ? String(partsArr[0]) : '';
      const second = partsArr && partsArr.length > 1 ? String(partsArr[1]) : '';
      const protectedRoots = new Set([
        'produtos',
        'cupons',
        'destaques',
        'horarios',
        'configuracoes',
        'categorias',
        'condicionais',
        'complementos',
        'usuarios-admin',
        'entradas',
        'loja'
      ]);

      // Rotas explicitamente públicas
      if (first === 'auth' || first === 'database' || first === 'usuarios') {
        return false;
      }

      // Exceções públicas específicas
      if (first === 'cupons' && second === 'validar') return false;

      // CHAT:
      // - /api/chat/cliente: público (mas validado no handler via token do pedido)
      // - /api/chat/* (restante): somente admin (ex.: /api/chat/admin)
      if (first === 'chat') {
        if (second === 'cliente') return false;
        return true;
      }

      // usuarios-admin: sempre protegido
      if (first === 'usuarios-admin') return true;

      // loja (backup/reset/branding): sempre protegido
      if (first === 'loja') return true;

      // Entradas: POST público (site), GET protegido (admin)
      if (first === 'entradas') {
        if (m === 'GET') return true;
        return false;
      }

      // Pedidos: GET sem ids = admin; DELETE = admin; POST público (criação)
      if (first === 'pedidos') {
        if (m === 'GET') {
          try {
            const u = new URL(String(fullUrl || ''), 'http://localhost');
            const ids = u.searchParams.get('ids');
            return !(ids && String(ids).trim());
          } catch (e) {
            return true;
          }
        }
        if (m === 'DELETE') return true;
        return false;
      }

      // Para rotas de conteúdo (cupons/destaques/horarios/configs/categorias/condicionais/produtos):
      // GET é público, mutações são admin.
      if (protectedRoots.has(first)) {
        if (m === 'GET' || m === 'OPTIONS') return false;
        return true;
      }

      // Regra geral: se for mutação e não for explicitamente público, proteger
      if (m === 'POST' || m === 'PUT' || m === 'DELETE') {
        return true;
      }
      return false;
    }

    if (isProtectedRoute(parts, req.method, req.url)) {
      const token = getBearerToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Não autorizado', detalhes: 'Token Bearer ausente' });
      }
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({ error: 'JWT não configurado', detalhes: 'Defina JWT_SECRET nas variáveis de ambiente (Vercel).' });
      }
      const v = verifyJwt(token, secret);
      if (!v.valid) {
        return res.status(401).json({ error: 'Não autorizado', detalhes: v.reason || 'Token inválido' });
      }
      // Somente admin
      if (!v.payload || v.payload.tipo !== 'admin') {
        return res.status(403).json({ error: 'Proibido', detalhes: 'Token não possui permissão de admin' });
      }
      req.user = v.payload;
    }

    // Default handler for /api
    if (parts.length === 0) {
      const handler = require(path.join(__dirname, '..', 'server', 'handlers', 'database.js'));
      return await handler(req, res);
    }

    const handlerPath = path.join(__dirname, '..', 'server', 'handlers', ...parts);
    const candidates = [handlerPath, handlerPath + '.js', path.join(handlerPath, 'index.js')];

    let resolved = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        resolved = c;
        break;
      }
    }

    if (!resolved) {
      // Fallback recursive search
      const handlersRoot = path.join(__dirname, '..', 'server', 'handlers');
      const targetSuffix = path.join(...parts) + '.js';

      function findFile(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const p = path.join(dir, ent.name);
          if (ent.isFile() && p.endsWith(targetSuffix)) return p;
          if (ent.isDirectory()) {
            const found = findFile(p);
            if (found) return found;
          }
        }
        return null;
      }

      resolved = findFile(handlersRoot);
    }

    if (!resolved) {
      return res.status(404).json({ error: 'Endpoint não encontrado', path: '/' + parts.join('/') });
    }

    const handler = require(resolved);
    if (typeof handler !== 'function') {
      return res.status(500).json({ error: 'Handler inválido para rota' });
    }

    return await handler(req, res);
  } catch (err) {
    console.error('[API ROUTER] erro ao executar', err);
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    return res.status(500).json({
      error: 'Erro interno ao executar handler',
      detalhes: err && err.message ? err.message : String(err),
      ...(isProd ? {} : { stack: err && err.stack ? String(err.stack) : null })
    });
  }
};
