const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static files (front)
app.use(express.static(path.join(__dirname)));

function setDefaultHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

app.options('/api/*', (req, res) => {
  setDefaultHeaders(res);
  return res.status(200).end();
});

app.all('/api/*', async (req, res) => {
  setDefaultHeaders(res);

  try {
    // Map /api/<...> to server/handlers/<...>.js
    const slug = req.params[0] || '';
    const parts = slug.split('/').filter(Boolean);

    // /api -> default database handler
    if (parts.length === 0) {
      const handler = require(path.join(__dirname, 'server', 'handlers', 'database.js'));
      return await handler(req, res);
    }

    const handlerPath = path.join(__dirname, 'server', 'handlers', ...parts);
    const candidates = [handlerPath, handlerPath + '.js', path.join(handlerPath, 'index.js')];

    let resolved = null;
    for (const c of candidates) {
      try {
        // require.resolve will throw if not found
        resolved = require.resolve(c);
        break;
      } catch (_) {
        // keep searching
      }
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
    console.error('[SERVER] ❌', err);
    return res.status(500).json({ error: 'Erro interno', detalhes: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[SERVER] ✅ Rodando em http://localhost:${port}`);
  console.log('[SERVER] ✅ APIs em /api/* (ex: /api/auth/login)');
});
