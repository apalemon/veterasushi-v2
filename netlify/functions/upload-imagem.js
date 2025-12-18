// Netlify Function: POST /api/upload-imagem
const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método não permitido' })
        };
    }

    try {
        const { imagemBase64, produtoId, nomeProduto } = JSON.parse(event.body);
        
        if (!imagemBase64) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Imagem não fornecida' })
            };
        }
        
        // Extrair base64 (remover data:image/...;base64,)
        const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Nome do arquivo: produto-{id}-{nome}.png
        const nomeArquivo = `produto-${produtoId}-${(nomeProduto || 'imagem').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        // Na Netlify, não podemos escrever arquivos permanentemente
        // Retornar URL baseada no nome do arquivo (imagem deve estar no GitHub)
        // Em produção, use Cloudinary ou outro serviço de armazenamento
        
        const imageUrl = `/Fotos/${nomeArquivo}`;
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                url: imageUrl, 
                caminho: imageUrl,
                aviso: 'Imagem não salva na Netlify - use Cloudinary ou outro serviço'
            })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Erro ao salvar imagem' })
        };
    }
};
