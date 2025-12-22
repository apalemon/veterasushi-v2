// Lightweight shim to ensure /api/auth/login exists as a direct serverless entry
// It delegates to the consolidated handler in server/handlers/auth/login.js
const path = require('path');

module.exports = async (req, res) => {
  console.log('[API SHIM] /api/auth/login invoked', req.method, req.url);
  try {
    const handler = require(path.join(__dirname, '..', '..', 'server', 'handlers', 'auth', 'login'));
    // Allow handler to manage CORS and methods
    return await handler(req, res);
  } catch (err) {
    console.error('[API SHIM] erro delegando para handler:', err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Erro interno no shim de autenticação', detalhes: String(err && err.message ? err.message : err) });
  }
};