const crypto = require('crypto');

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeToString(input) {
  const str = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str + pad, 'base64').toString('utf8');
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function signJwt(payload, secret, options = {}) {
  if (!secret) throw new Error('JWT_SECRET não configurado');
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const expSeconds = typeof options.expiresInSeconds === 'number' ? options.expiresInSeconds : 7 * 24 * 60 * 60;
  const body = {
    ...payload,
    iat: now,
    exp: now + expSeconds,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signingInput = encodedHeader + '.' + encodedPayload;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const encodedSignature = base64UrlEncode(signature);
  return signingInput + '.' + encodedSignature;
}

function verifyJwt(token, secret) {
  if (!secret) throw new Error('JWT_SECRET não configurado');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { valid: false, reason: 'Formato inválido' };

  const [h, p, s] = parts;
  const signingInput = h + '.' + p;
  const expectedSig = base64UrlEncode(crypto.createHmac('sha256', secret).update(signingInput).digest());
  if (expectedSig !== s) return { valid: false, reason: 'Assinatura inválida' };

  const payloadStr = base64UrlDecodeToString(p);
  const payload = safeJsonParse(payloadStr);
  if (!payload || typeof payload !== 'object') return { valid: false, reason: 'Payload inválido' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && typeof payload.exp === 'number' && now > payload.exp) {
    return { valid: false, reason: 'Token expirado' };
  }

  return { valid: true, payload };
}

function getBearerToken(req) {
  const h = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

module.exports = {
  signJwt,
  verifyJwt,
  getBearerToken,
};
