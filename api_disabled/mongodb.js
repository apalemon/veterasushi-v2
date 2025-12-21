// Helper para conexão MongoDB Atlas
const { MongoClient } = require('mongodb');

// Nome do banco de dados
const DB_NAME = process.env.MONGODB_DB_NAME || 'vetera';

let client = null;
let db = null;

// Conectar ao MongoDB
async function connectDB() {
    try {
        if (client && client.topology && client.topology.isConnected()) {
            return client.db(DB_NAME);
        }

        // A string de conexão deve estar na variável de ambiente MONGODB_URI
        // Formato: mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
        const uri = process.env.MONGODB_URI;
        
        if (!uri) {
            const errorMsg = 'MONGODB_URI não está definida nas variáveis de ambiente da Vercel. Configure em Project settings > Environment variables.';
            console.error('[MONGODB] ❌', errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('[MONGODB] 🔗 Tentando conectar...');
        
        client = new MongoClient(uri, {
            serverApi: {
                version: '1',
                strict: true,
                deprecationErrors: true,
            }
        });

        await client.connect();
        db = client.db(DB_NAME);
        
        console.log('[MONGODB] ✅ Conectado ao MongoDB Atlas');
        return db;
    } catch (error) {
        console.error('[MONGODB] ❌ Erro ao conectar:', error.message);
        throw error;
    }
}

// Obter instância do banco de dados
async function getDB() {
    if (!db) {
        await connectDB();
    }
    return db;
}

// Fechar conexão (útil para cleanup)
async function closeConnection() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('[MONGODB] 🔌 Conexão fechada');
    }
}

// Helper para obter coleção
async function getCollection(collectionName) {
    const database = await getDB();
    return database.collection(collectionName);
}

module.exports = {
    connectDB,
    getDB,
    getCollection,
    closeConnection,
    DB_NAME
};


