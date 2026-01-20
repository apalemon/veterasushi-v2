// Helper para conexão MongoDB (moved out of /api to allow single serverless function)
const { MongoClient } = require('mongodb');

function getDbName() {
    return process.env.MONGODB_DB_NAME || 'vetera';
}
let client = null;
let db = null;

// Carregar variáveis de ambiente
function loadEnv() {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Tentar carregar .env
        const envPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const raw = String(line || '').trim();
                if (!raw) return;
                if (raw.startsWith('#')) return;
                const idx = raw.indexOf('=');
                if (idx === -1) return;
                const key = raw.slice(0, idx).trim();
                const value = raw.slice(idx + 1).trim();
                if (!key) return;
                // Nunca sobrescrever variáveis já definidas (Vercel/prod)
                if (typeof process.env[key] === 'undefined' || process.env[key] === '') {
                    process.env[key] = value;
                }
            });
            console.log('✅ Variáveis de ambiente carregadas de .env');
        } else {
            // Sem .env: em produção (Vercel), as variáveis devem vir do ambiente.
            // NÃO setar localhost aqui (isso quebra produção).
            console.warn('⚠️ Arquivo .env não encontrado. Configure MONGODB_URI nas variáveis de ambiente (Vercel) ou crie um .env local.');
        }
    } catch (error) {
        console.error('Erro ao carregar .env:', error.message);
    }
}

// Carregar variáveis no início
loadEnv();

async function connectDB() {
    try {
        if (db) return db;

        const uri = process.env.MONGODB_URI;
        if (!uri) {
            const errorMsg = 'MONGODB_URI não está definida nas variáveis de ambiente.';
            console.error('[MONGODB] ❌', errorMsg);
            throw new Error(errorMsg);
        }

        if (!client) {
            client = new MongoClient(uri, {
                // Deixar mais rápido e falhar rápido quando URI estiver errada
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
                maxPoolSize: 10,
                serverApi: {
                    version: '1',
                    strict: true,
                    deprecationErrors: true,
                }
            });
        }

        await client.connect();
        db = client.db(getDbName());
        console.log('[MONGODB] ✅ Conectado');
        return db;
    } catch (error) {
        console.error('[MONGODB] ❌ Erro ao conectar:', error.message);
        throw error;
    }
}

async function getDB() {
    if (!db) await connectDB();
    return db;
}

async function closeConnection() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('[MONGODB] 🔌 Conexão fechada');
    }
}

async function getCollection(collectionName) {
    const database = await getDB();
    return database.collection(collectionName);
}

module.exports = { connectDB, getDB, getCollection, closeConnection, getDbName };
