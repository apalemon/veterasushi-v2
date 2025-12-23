// ============================================
// SISTEMA DE RATE LIMITING
// ============================================

class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.limits = {
      adicionarCarrinho: { max: 10, window: 60000 }, // 10 por minuto
      criarPedido: { max: 3, window: 300000 }, // 3 por 5 minutos
      aplicarCupom: { max: 5, window: 60000 } // 5 por minuto
    };
  }

  // Verificar se pode fazer ação
  canPerform(action, identifier = 'default') {
    const limit = this.limits[action];
    if (!limit) return true;

    const key = `${action}_${identifier}`;
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];

    // Remover requisições antigas
    const recentRequests = userRequests.filter(time => now - time < limit.window);

    if (recentRequests.length >= limit.max) {
      return {
        allowed: false,
        retryAfter: Math.ceil((recentRequests[0] + limit.window - now) / 1000)
      };
    }

    // Adicionar nova requisição
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return { allowed: true };
  }

  // Limpar requisições antigas periodicamente
  cleanup() {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const action = key.split('_')[0];
      const limit = this.limits[action];
      if (limit) {
        const recentRequests = requests.filter(time => now - time < limit.window);
        if (recentRequests.length === 0) {
          this.requests.delete(key);
        } else {
          this.requests.set(key, recentRequests);
        }
      }
    }
  }
}

// Instância global
const rateLimiter = new RateLimiter();
window.rateLimiter = rateLimiter; // Tornar global

// Limpar requisições antigas a cada minuto
setInterval(() => rateLimiter.cleanup(), 60000);

















