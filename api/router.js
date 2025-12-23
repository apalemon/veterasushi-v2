const path = require('path');
const fs = require('fs');

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
    return res.status(500).json({ error: 'Erro interno ao executar handler', detalhes: err.message });
  }
};
