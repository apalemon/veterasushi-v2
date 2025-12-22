const path = require('path');
const fs = require('fs');

module.exports = async (req, res) => {
    // This single serverless function will route to handlers in ../server/handlers
    // Path parts come from req.query.slug (Vercel passes catch-all segments as array)
    const slug = req.query && req.query.slug ? req.query.slug : [];
    const parts = Array.isArray(slug) ? slug : [slug];

    console.log('[API ROUTER] request:', req.method, req.url, 'slug=', JSON.stringify(slug));

    // If no slug provided (call to /api), default to 'database' handler
    if (!parts || parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
        try {
            const handler = require(path.join(__dirname, '..', 'server', 'handlers', 'database'));
            return await handler(req, res);
        } catch (err) {
            console.error('[API ROUTER] erro ao chamar handler default:', err.message);
            return res.status(500).json({ error: 'Erro interno no roteador' });
        }
    }

    // Build absolute handler path
    const handlerPath = path.join(__dirname, '..', 'server', 'handlers', ...parts);

    // Try a few variations: exact file, file + .js, folder/index.js
    const candidates = [handlerPath, handlerPath + '.js', path.join(handlerPath, 'index.js')];

    let resolved = null;
    for (const c of candidates) {
        const exists = fs.existsSync(c);
        console.log('[API ROUTER] Checking candidate:', c, 'exists=', exists);
        if (exists) {
            resolved = c;
            break;
        }
    }

    if (!resolved) {
        console.warn('[API ROUTER] direct candidates not found for /' + parts.join('/'));
        // Attempt recursive search under server/handlers for matching path suffix
        const handlersRoot = path.join(__dirname, '..', 'server', 'handlers');
        const targetSuffix = path.join(...parts) + '.js';
        function findFile(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const ent of entries) {
                const p = path.join(dir, ent.name);
                if (ent.isFile() && p.endsWith(targetSuffix)) {
                    return p;
                }
                if (ent.isDirectory()) {
                    const found = findFile(p);
                    if (found) return found;
                }
            }
            return null;
        }
        try {
            const found = findFile(handlersRoot);
            if (found) {
                resolved = found;
                console.log('[API ROUTER] Fallback resolved handler at', resolved);
            }
        } catch (e) {
            console.error('[API ROUTER] erro buscando fallback handler:', e);
        }
    }

    if (!resolved) {
        console.error('[API ROUTER] endpoint not found after fallback search for /' + parts.join('/'));
        return res.status(404).json({ error: 'Endpoint não encontrado', path: '/' + parts.join('/') });
    }

    try {
        const handler = require(resolved);
        if (typeof handler !== 'function') {
            return res.status(500).json({ error: 'Handler inválido para rota' });
        }
        return await handler(req, res);
    } catch (err) {
        console.error('[API ROUTER] erro ao executar handler', err);
        return res.status(500).json({ error: 'Erro interno ao executar handler', detalhes: err.message });
    }
};