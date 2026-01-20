// ============================================
// CONFIGURAÇÕES DE AMBIENTE
// ============================================

// Detectar ambiente automaticamente
const isDevelopment = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' || 
                     window.location.hostname.includes('192.168.') ||
                     window.location.hostname.includes('10.0.') ||
                     window.location.port !== '';

// Configurações baseadas no ambiente
const ENV = {
    // Ambiente
    isDevelopment: isDevelopment,
    isProduction: !isDevelopment,
    
    // URLs base
    apiBaseUrl: window.location.origin,
    
    // URLs de imagens
    imagesBaseUrl: isDevelopment ? 
        '/Fotos' : 
        '/Fotos',
    
    // Configurações de upload
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    
    // Configurações de cache
    cacheVersion: Date.now(),
    
    // Debug
    debug: isDevelopment
};

// Exportar para uso global
window.ENV = ENV;

// Log de ambiente
if (ENV.debug) {
    console.log('[ENV] Ambiente de desenvolvimento detectado');
    console.log('[ENV] API URL:', ENV.apiBaseUrl);
    console.log('[ENV] Images URL:', ENV.imagesBaseUrl);
} else {
    console.log('[ENV] Ambiente de produção detectado');
}
