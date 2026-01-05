// Handler for /api/entradas
const crypto = require('crypto');
const { getCollection } = require('../mongodb');

function getClientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (xf && typeof xf === 'string') {
        // x-forwarded-for may be "ip, proxy1, proxy2"
        return xf.split(',')[0].trim();
    }
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
    // Vercel/Node
    return (req.socket && req.socket.remoteAddress) ? String(req.socket.remoteAddress) : '';
}

function hashIp(ip) {
    if (!ip) return '';
    const salt = process.env.ENTRADAS_IP_SALT || 'vetera_entradas_salt_v1';
    return crypto.createHash('sha256').update(String(ip) + '|' + salt).digest('hex').slice(0, 24);
}

function todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const collection = await getCollection('entradas');

        // Best-effort indexes (não falhar se não puder criar)
        try {
            await collection.createIndex({ dia: 1, sessionId: 1 }, { unique: true });
            await collection.createIndex({ lastSeenAt: -1 });
        } catch (e) {
            // ignore
        }

        if (req.method === 'GET') {
            const limitRaw = (req.query && req.query.limit) ? Number(req.query.limit) : 200;
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

            const docs = await collection
                .find({})
                .sort({ lastSeenAt: -1 })
                .limit(limit)
                .toArray();

            const limpos = docs.map(d => {
                const { _id, ...rest } = d;
                return rest;
            });
            return res.status(200).json(limpos);
        }

        if (req.method === 'POST') {
            const body = req.body || {};
            const sessionId = body.sessionId ? String(body.sessionId).slice(0, 80) : '';
            if (!sessionId) return res.status(400).json({ error: 'sessionId obrigatório' });

            const dia = todayKey();
            const ip = getClientIp(req);
            const ipHash = hashIp(ip);

            const userAgent = (req.headers['user-agent'] ? String(req.headers['user-agent']) : (body.userAgent ? String(body.userAgent) : '')).slice(0, 240);
            const device = (body.device ? String(body.device) : '').slice(0, 240);
            const teveCarrinho = body.teveCarrinho === true;

            const now = new Date();

            const update = {
                $setOnInsert: {
                    dia,
                    sessionId,
                    firstSeenAt: now,
                    ipHash,
                    userAgent,
                    device,
                    teveCarrinho: teveCarrinho
                },
                $set: {
                    lastSeenAt: now
                }
            };
            if (teveCarrinho) {
                update.$set.teveCarrinho = true;
            }

            await collection.updateOne({ dia, sessionId }, update, { upsert: true });

            // Controle de crescimento: ocasionalmente limitar volume (leve)
            if (Math.random() < 0.01) {
                try {
                    const maxDocs = 5000;
                    const total = await collection.estimatedDocumentCount();
                    if (total > maxDocs) {
                        const toDelete = total - maxDocs;
                        const old = await collection.find({}).sort({ lastSeenAt: 1 }).limit(toDelete).toArray();
                        const ids = old.map(o => o._id).filter(Boolean);
                        if (ids.length > 0) {
                            await collection.deleteMany({ _id: { $in: ids } });
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Método não permitido' });
    } catch (err) {
        console.error('[ENTRADAS] ❌ erro', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
