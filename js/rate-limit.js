// ============================================
// RATE LIMITING - PROTEÇÃO CONTRA ABUSO
// ============================================

(function() {
    'use strict';
    
    // Configurações
    const CONFIG = {
        maxRequestsPerMinute: 60,  // Máximo de requisições por minuto
        maxPedidosPorHora: 10,     // Máximo de pedidos por hora (por telefone)
        blockDurationMs: 60000,    // Duração do bloqueio (1 minuto)
        storageKey: 'vetera_rate_limit'
    };
    
    // Obter dados do localStorage
    function getData() {
        try {
            const data = localStorage.getItem(CONFIG.storageKey);
            return data ? JSON.parse(data) : { requests: [], pedidos: {}, blocked: null };
        } catch (e) {
            return { requests: [], pedidos: {}, blocked: null };
        }
    }
    
    // Salvar dados no localStorage
    function saveData(data) {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        } catch (e) {}
    }
    
    // Limpar requisições antigas (mais de 1 minuto)
    function cleanOldRequests(requests) {
        const now = Date.now();
        return requests.filter(ts => now - ts < 60000);
    }
    
    // Limpar pedidos antigos (mais de 1 hora)
    function cleanOldPedidos(pedidos) {
        const now = Date.now();
        const cleaned = {};
        Object.keys(pedidos).forEach(tel => {
            const validPedidos = pedidos[tel].filter(ts => now - ts < 3600000);
            if (validPedidos.length > 0) {
                cleaned[tel] = validPedidos;
            }
        });
        return cleaned;
    }
    
    // Verificar se está bloqueado
    function isBlocked() {
        const data = getData();
        if (data.blocked && Date.now() < data.blocked) {
            return true;
        }
        if (data.blocked && Date.now() >= data.blocked) {
            data.blocked = null;
            saveData(data);
        }
        return false;
    }
    
    // Registrar requisição
    function trackRequest() {
        if (isBlocked()) return false;
        
        const data = getData();
        data.requests = cleanOldRequests(data.requests);
        
        if (data.requests.length >= CONFIG.maxRequestsPerMinute) {
            // Bloquear
            data.blocked = Date.now() + CONFIG.blockDurationMs;
            saveData(data);
            console.warn('[RATE-LIMIT] Muitas requisições. Bloqueado por 1 minuto.');
            return false;
        }
        
        data.requests.push(Date.now());
        saveData(data);
        return true;
    }
    
    // Verificar se pode criar pedido
    function canCreateOrder(telefone) {
        if (!telefone) return true;
        
        const data = getData();
        data.pedidos = cleanOldPedidos(data.pedidos);
        
        const telKey = String(telefone).replace(/\D/g, '');
        const pedidosTel = data.pedidos[telKey] || [];
        
        if (pedidosTel.length >= CONFIG.maxPedidosPorHora) {
            console.warn('[RATE-LIMIT] Limite de pedidos por hora atingido.');
            return false;
        }
        
        return true;
    }
    
    // Registrar criação de pedido
    function trackOrder(telefone) {
        if (!telefone) return;
        
        const data = getData();
        data.pedidos = cleanOldPedidos(data.pedidos);
        
        const telKey = String(telefone).replace(/\D/g, '');
        if (!data.pedidos[telKey]) {
            data.pedidos[telKey] = [];
        }
        data.pedidos[telKey].push(Date.now());
        saveData(data);
    }
    
    // Obter tempo restante de bloqueio
    function getBlockTimeRemaining() {
        const data = getData();
        if (data.blocked && Date.now() < data.blocked) {
            return Math.ceil((data.blocked - Date.now()) / 1000);
        }
        return 0;
    }
    
    // Exportar funções
    window.RateLimit = {
        trackRequest: trackRequest,
        canCreateOrder: canCreateOrder,
        trackOrder: trackOrder,
        isBlocked: isBlocked,
        getBlockTimeRemaining: getBlockTimeRemaining
    };
    
})();
