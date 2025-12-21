const path = require('path');
const fs = require('fs');

module.exports = async (req, res) => {
    // This single serverless function will route to handlers in ../server/handlers
    // Path parts come from req.query.slug (Vercel passes catch-all segments as array)
    const slug = req.query && req.query.slug ? req.query.slug : [];
    const parts = Array.isArray(slug) ? slug : [slug];

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
        if (fs.existsSync(c)) {
            resolved = c;
            break;
        }
    }

    if (!resolved) {
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