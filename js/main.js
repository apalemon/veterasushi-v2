// ============================================
// SISTEMA PRINCIPAL - CARDÁPIO ONLINE
// ============================================

let categoriaSelecionada = 'Todas';
let cupomAplicado = null;

// Toggle dropdown do usuário
function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }

}

async function handleMercadoPagoPendingFallback() {
    try {
        // Se já veio com mp=...&pedidoId=..., o handler principal cuida.
        const qs = new URLSearchParams(String(window.location && window.location.search ? window.location.search : ''));
        if (String(qs.get('mp') || '').trim() && String(qs.get('pedidoId') || '').trim()) return;

        let pending = null;
        try {
            pending = JSON.parse(localStorage.getItem('vetera_mp_pending_order') || 'null');
        } catch (e) {
            pending = null;
        }
        if (!pending || !pending.pedidoId) return;

        const pedidoId = String(pending.pedidoId).trim();
        const createdAt = Number(pending.createdAt || 0);
        if (!pedidoId) return;

        // Evitar ficar consultando para sempre
        if (createdAt && Date.now() - createdAt > 2 * 60 * 60 * 1000) {
            try { localStorage.removeItem('vetera_mp_pending_order'); } catch (e) {}
            return;
        }

        try {
            mostrarNotificacaoInApp('Pagamento', 'Verificando status do seu pagamento...', '⏳');
        } catch (e) {}

        const startedAt = Date.now();
        const timeoutMs = 60000;
        const intervalMs = 3000;

        async function syncStatus() {
            try {
                await fetch(window.location.origin + '/api/mercadopago/webhook?pedidoId=' + encodeURIComponent(String(pedidoId)));
            } catch (e) {}
        }

        async function fetchPedido() {
            const resp = await fetch(window.location.origin + '/api/pedidos?ids=' + encodeURIComponent(String(pedidoId)));
            if (!resp.ok) return null;
            const data = await resp.json();
            const arr = Array.isArray(data) ? data : [];
            return arr.find(x => String(x && x.id) === String(pedidoId) || Number(x && x.id) === Number(pedidoId)) || null;
        }

        while (Date.now() - startedAt < timeoutMs) {
            await syncStatus();
            if (intentId) {
                let data = null;
                try {
                    const resp = await fetch(window.location.origin + '/api/mercadopago/webhook?intentId=' + encodeURIComponent(String(intentId)));
                    data = resp.ok ? await resp.json().catch(() => null) : null;
                } catch (e) {
                    data = null;
                }
                const st = String(data && data.status ? data.status : '').toLowerCase();
                if (st === 'approved') {
                    try { mostrarNotificacaoInApp('Pagamento', 'Pagamento aprovado! Seu pedido já está em andamento.', '✅'); } catch (e) {}
                    try { localStorage.removeItem('vetera_card_intent_pendente'); } catch (e) {}
                    return;
                }
            } else {
                let pedido = null;
                try { pedido = await fetchPedido(); } catch (e) { pedido = null; }

                const stPag = String(pedido && pedido.statusPagamento ? pedido.statusPagamento : '').toLowerCase();
                if (stPag === 'pago') {
                    try {
                        mostrarNotificacaoInApp('Pagamento', 'Pagamento aprovado! Seu pedido entrou em preparo.', '✅');
                    } catch (e) {}
                    try { localStorage.removeItem('vetera_mp_pending_order'); } catch (e) {}
                    return;
                }
            }

            await new Promise(r => setTimeout(r, intervalMs));
        }
    } catch (e) {
        // ignora
    }
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('user-dropdown');
    const dropdownButton = e.target.closest('.btn-dropdown');
    if (dropdown && !dropdown.contains(e.target) && !dropdownButton) {
        dropdown.style.display = 'none';
    }
});

async function handleMercadoPagoReturn() {
    try {
        const qs = new URLSearchParams(String(window.location && window.location.search ? window.location.search : ''));
        const mp = String(qs.get('mp') || '').toLowerCase();
        const pedidoId = String(qs.get('pedidoId') || '').trim();
        const intentId = String(qs.get('intentId') || '').trim();
        if (!mp || (!pedidoId && !intentId)) return;

        try {
            if (mp === 'success') {
                mostrarNotificacaoInApp('Pagamento', 'Pagamento confirmado! Estamos validando...', '✅');
            } else if (mp === 'pending') {
                mostrarNotificacaoInApp('Pagamento', 'Pagamento em análise/pendente. Aguarde a confirmação.', '⏳');
            } else if (mp === 'failure') {
                mostrarNotificacaoInApp('Pagamento', 'Pagamento não concluído. Você pode tentar novamente.', '⚠️');
            }
        } catch (e) {}

        // Poll curto para refletir status do webhook
        const startedAt = Date.now();
        const timeoutMs = 90000;
        const intervalMs = 3000;

        async function syncStatus() {
            try {
                if (intentId) {
                    await fetch(window.location.origin + '/api/mercadopago/webhook?intentId=' + encodeURIComponent(String(intentId)));
                } else {
                    await fetch(window.location.origin + '/api/mercadopago/webhook?pedidoId=' + encodeURIComponent(String(pedidoId)));
                }
            } catch (e) {}
        }

        async function fetchPedido() {
            const resp = await fetch(window.location.origin + '/api/pedidos?ids=' + encodeURIComponent(String(pedidoId)));
            if (!resp.ok) return null;
            const data = await resp.json();
            const arr = Array.isArray(data) ? data : [];
            return arr.find(x => String(x && x.id) === String(pedidoId) || Number(x && x.id) === Number(pedidoId)) || null;
        }

        while (Date.now() - startedAt < timeoutMs) {
            await syncStatus();
            let pedido = null;
            try { pedido = await fetchPedido(); } catch (e) { pedido = null; }

            const stPag = String(pedido && pedido.statusPagamento ? pedido.statusPagamento : '').toLowerCase();
            if (stPag === 'pago') {
                try {
                    mostrarNotificacaoInApp('Pagamento', 'Pagamento aprovado! Seu pedido entrou em preparo.', '✅');
                } catch (e) {}
                break;
            }

            await new Promise(r => setTimeout(r, intervalMs));
        }

        // Limpar querystring (evita repetir popup ao recarregar)
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('mp');
            url.searchParams.delete('pedidoId');
            window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? ('?' + url.searchParams.toString()) : '') + url.hash);
        } catch (e) {}

        // Limpar pendência local (se existir)
        try {
            localStorage.removeItem('vetera_mp_pending_order');
        } catch (e) {}
    } catch (e) {
        // ignora
    }
}

function _entradasIsFileOrigin() {
    try {
        return window.location.protocol === 'file:' || window.location.origin === 'null';
    } catch (e) {
        return false;
    }
}

// Função auxiliar: converter hex para rgba
function _hexToRgba(hex, alpha) {
    try {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } catch (e) {
        return hex;
    }
}

// Função auxiliar: escurecer cor
function _darkenColor(hex, percent) {
    try {
        const h = hex.replace('#', '');
        let r = parseInt(h.substring(0, 2), 16);
        let g = parseInt(h.substring(2, 4), 16);
        let b = parseInt(h.substring(4, 6), 16);
        r = Math.max(0, Math.floor(r * (100 - percent) / 100));
        g = Math.max(0, Math.floor(g * (100 - percent) / 100));
        b = Math.max(0, Math.floor(b * (100 - percent) / 100));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (e) {
        return hex;
    }
}

function aplicarBrandingLoja() {
    try {
        if (typeof db === 'undefined' || !db || typeof db.getConfiguracoes !== 'function') return;
        const cfg = db.getConfiguracoes() || {};
        const tema = cfg.tema || {};
        const root = document.documentElement;

        // Aplicar cores base
        if (tema.bg) root.style.setProperty('--bg', tema.bg);
        if (tema.bgSecondary) root.style.setProperty('--bg-secondary', tema.bgSecondary);
        if (tema.accent) root.style.setProperty('--accent', tema.accent);
        if (tema.accentHover) root.style.setProperty('--accent-hover', tema.accentHover);
        if (tema.textPrimary) root.style.setProperty('--text-primary', tema.textPrimary);
        if (tema.textSecondary) root.style.setProperty('--text-secondary', tema.textSecondary);
        
        // Aplicar cor accent em todas as variáveis de cor relacionadas
        if (tema.accent) {
            root.style.setProperty('--vermelho-claro', tema.accent);
            root.style.setProperty('--accent-light', _hexToRgba(tema.accent, 0.1));
            root.style.setProperty('--borda', _hexToRgba(tema.accent, 0.2));
            root.style.setProperty('--borda-hover', _hexToRgba(tema.accent, 0.4));
            root.style.setProperty('--vermelho-glow', _hexToRgba(tema.accent, 0.4));
            root.style.setProperty('--sombra-vermelha', _hexToRgba(tema.accent, 0.3));
            root.style.setProperty('--sombra-card-hover', `0 8px 30px ${_hexToRgba(tema.accent, 0.2)}`);
        }
        if (tema.accentHover) {
            root.style.setProperty('--vermelho-escuro', tema.accentHover);
            root.style.setProperty('--vermelho-hover', tema.accentHover);
        }
        // Gradientes dinâmicos
        if (tema.accent && tema.accentHover) {
            root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${tema.accent} 0%, ${tema.accentHover} 100%)`);
            root.style.setProperty('--gradient-hover', `linear-gradient(135deg, ${tema.accentHover} 0%, ${_darkenColor(tema.accentHover, 20)} 100%)`);
        }

        const nome = cfg.nomeEstabelecimento || 'Vetera Sushi';
        try { document.title = nome + ' - Cardápio Online'; } catch (e) {}

        const logoUrl = cfg.logoUrl || '/logo.png';
        const faviconUrl = cfg.faviconUrl || logoUrl || '/logo.png';
        
        // Atualizar nome da loja em todos os lugares
        try {
            // Header logo e nome
            const headerLogo = document.getElementById('header-logo');
            if (headerLogo && logoUrl) {
                headerLogo.src = logoUrl;
                headerLogo.alt = nome;
            }
            const headerNome = document.getElementById('header-nome-loja');
            if (headerNome) headerNome.textContent = nome;
            
            // Título principal da página (cardápio)
            const tituloLoja = document.getElementById('titulo-loja');
            if (tituloLoja) tituloLoja.textContent = nome.toUpperCase();
            
            // Sidebar do gestor
            const sidebarNome = document.getElementById('sidebar-nome-loja');
            if (sidebarNome) sidebarNome.textContent = nome;
            
            // Atualizar link do gestor com slug
            const slug = cfg.slug || 'vetera';
            const linkGestor = document.getElementById('link-gestor');
            if (linkGestor) linkGestor.href = '/' + slug + '/gestor';
            
            // Atualizar link do dropdown
            const linkGestorDropdown = document.getElementById('link-gestor-dropdown');
            if (linkGestorDropdown) linkGestorDropdown.href = '/' + slug + '/gestor';

            const linkCardapio = document.getElementById('link-cardapio');
            if (linkCardapio) linkCardapio.href = '/' + slug + '/cardapio';
            const menuLinkCardapio = document.getElementById('menu-link-cardapio');
            if (menuLinkCardapio) menuLinkCardapio.href = '/' + slug + '/cardapio';
            
            // Fallback para seletores antigos
            const logoImg = document.querySelector('a.logo img');
            if (logoImg && logoUrl && !logoImg.id) {
                logoImg.src = logoUrl;
                logoImg.alt = nome;
            }
            const logoText = document.querySelector('a.logo span');
            if (logoText && !logoText.id) logoText.textContent = nome;
        } catch (e) {}

        // Atualizar favicon
        try {
            const links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
            links.forEach(l => {
                try { l.href = faviconUrl; } catch (e) {}
            });
        } catch (e) {}
    } catch (e) {
        // ignora
    }
}

function _entradasGetSessionId() {
    try {
        const k = 'vetera_entradas_session_id';
        let v = localStorage.getItem(k);
        if (v && String(v).length > 8) return v;
        v = Date.now().toString(36) + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(k, v);
        return v;
    } catch (e) {
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
}

function _entradasGetDevice() {
    try {
        return navigator.userAgent || '';
    } catch (e) {
        return '';
    }
}

async function registrarEntradaSite(payload) {
    try {
        if (_entradasIsFileOrigin()) return;
        const body = payload || {};
        body.sessionId = body.sessionId || _entradasGetSessionId();
        body.device = body.device || _entradasGetDevice();
        body.teveCarrinho = body.teveCarrinho === true;

        await fetch(window.location.origin + '/api/entradas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        // ignora (não pode quebrar o site)
    }
}

function _entradasMarcarCarrinhoSeNecessario() {
    try {
        const raw = localStorage.getItem('vetera_carrinho');
        const itens = raw ? JSON.parse(raw) : [];
        const tem = Array.isArray(itens) && itens.some(i => i && (i.quantidade || 0) > 0);
        if (!tem) return;
        const k = 'vetera_entradas_teve_carrinho';
        const ja = localStorage.getItem(k);
        if (ja === '1') return;
        localStorage.setItem(k, '1');
        registrarEntradaSite({ teveCarrinho: true });
    } catch (e) {
        // ignora
    }
}

function _getPedidosStatusCacheCliente() {
    try {
        const raw = localStorage.getItem('vetera_pedidos_status_cache');
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
        return {};
    }
}

function _setPedidosStatusCacheCliente(cache) {
    try {
        localStorage.setItem('vetera_pedidos_status_cache', JSON.stringify(cache || {}));
    } catch (e) {
        // ignora
    }
}

function mostrarAvisoPedidoCliente(mensagem) {
    try {
        const existing = document.getElementById('pedido-status-toast');
        if (existing) existing.remove();
        const div = document.createElement('div');
        div.id = 'pedido-status-toast';
        div.style.cssText = 'position:fixed; left:50%; transform:translateX(-50%); bottom:90px; z-index:99999; max-width:92vw; padding:12px 14px; border-radius:12px; background: rgba(0,0,0,0.85); border: 1px solid rgba(255,255,255,0.12); color:#fff; font-weight:700; text-align:center;';
        div.textContent = mensagem;
        document.body.appendChild(div);
        setTimeout(() => { try { div.remove(); } catch (e) {} }, 12000);
    } catch (e) {
        // fallback
        try { alert(mensagem); } catch (err) {}
    }
}

// Carregar cupom do localStorage
function carregarCupomSalvo() {
    try {
        const cupomSalvo = localStorage.getItem('vetera_cupom_aplicado');
        if (cupomSalvo) {
            const cupomData = JSON.parse(cupomSalvo);
            // Validar se o cupom ainda é válido
            if (cupomData && db.validarCupom(cupomData.codigo, 0).valido) {
                cupomAplicado = cupomData;
            }
        }
    } catch (e) {
    }
}

// Salvar cupom no localStorage
function salvarCupom() {
    if (cupomAplicado) {
        localStorage.setItem('vetera_cupom_aplicado', JSON.stringify(cupomAplicado));
    } else {
        localStorage.removeItem('vetera_cupom_aplicado');
    }
}

// Inicializar página
document.addEventListener('DOMContentLoaded', async () => {
    // Opção B: no site público, não persistir banco/credenciais de admin no localStorage
    try {
        const path = String(window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
        if (path.includes('/gestor')) {
            // Página do gestor - não inicializar cardápio
            return;
        }
    } catch (e) {}
    
    // Inicializar cardápio
    inicializarCardapio();

    // Tratar retorno do Mercado Pago (success/pending/failure)
    try { handleMercadoPagoReturn(); } catch (e) {}
    try { handleMercadoPagoPendingFallback(); } catch (e) {}

    // Iniciar monitoramento de status + chat (se houver pedidos)
    try { iniciarMonitoramentoStatusPedidosCliente(); } catch (e) {}
    try { initChatWidgetCliente(); } catch (e) {}
    
    // Atualizar status da loja periodicamente
    setInterval(async () => {
        try {
            // Recarregar horários do servidor antes de atualizar indicador
            await carregarHorariosDoServidorMain();
            atualizarStatusLojaIndicador();
        } catch (e) {}
    }, 30000); // A cada 30 segundos
});

function iniciarMonitoramentoStatusPedidosCliente() {
    try {
        // Evitar criar múltiplos intervals
        if (window.__veteraPedidosClienteInterval) return;

        // Rodar imediatamente (mesmo se ainda não existir pedido; a função interna já ignora)
        verificarAtualizacoesStatusPedidosCliente();

        window.__veteraPedidosClienteInterval = setInterval(() => {
            try { verificarAtualizacoesStatusPedidosCliente(); } catch (e) {}
        }, 10000);
    } catch (e) {
        // ignora
    }
}

function _getPedidoPreparoPopupCacheCliente() {
    try {
        const raw = localStorage.getItem('vetera_pedidos_popup_preparo');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function _setPedidoPreparoPopupCacheCliente(cache) {
    try {
        localStorage.setItem('vetera_pedidos_popup_preparo', JSON.stringify(cache || {}));
    } catch (e) {
        // ignora
    }
}

function _jaMostrouPopupPreparo(pedidoId) {
    const cache = _getPedidoPreparoPopupCacheCliente();
    return cache && cache[String(pedidoId)] === true;
}

function _marcarPopupPreparoMostrado(pedidoId) {
    const cache = _getPedidoPreparoPopupCacheCliente();
    cache[String(pedidoId)] = true;
    _setPedidoPreparoPopupCacheCliente(cache);
}

function _getPedidoProntoPopupCacheCliente() {
    try {
        const raw = localStorage.getItem('vetera_pedidos_popup_pronto');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function _setPedidoProntoPopupCacheCliente(cache) {
    try {
        localStorage.setItem('vetera_pedidos_popup_pronto', JSON.stringify(cache || {}));
    } catch (e) {}
}

function _jaMostrouPopupPronto(pedidoId) {
    const cache = _getPedidoProntoPopupCacheCliente();
    return cache && cache[String(pedidoId)] === true;
}

function _marcarPopupProntoMostrado(pedidoId) {
    const cache = _getPedidoProntoPopupCacheCliente();
    cache[String(pedidoId)] = true;
    _setPedidoProntoPopupCacheCliente(cache);
}

function mostrarModalPedidoPronto(pedido) {
    try {
        const existing = document.getElementById('modal-pedido-pronto');
        if (existing) existing.remove();

        const numeroWhats = '+55 51 984149137';
        const numeroWhatsDigits = '5551984149137';
        const pedidoId = pedido && pedido.id ? pedido.id : '';
        const textoWhats = encodeURIComponent('Olá! Meu pedido #' + pedidoId + ' foi concluído.');
        const linkWhats = 'https://wa.me/' + numeroWhatsDigits + '?text=' + textoWhats;

        const overlay = document.createElement('div');
        overlay.id = 'modal-pedido-pronto';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.75);';

        const card = document.createElement('div');
        card.style.cssText = 'width:min(480px,95vw);border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#1a1a1f,#0f0f12);border:1px solid rgba(59,130,246,0.35);box-shadow:0 25px 80px rgba(59,130,246,0.18),0 0 0 1px rgba(255,255,255,0.05);';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:28px 20px 18px;background:linear-gradient(180deg,rgba(59,130,246,0.18) 0%,transparent 100%);';
        header.innerHTML =
            '<div style="width:80px;height:80px;border-radius:50%;background:rgba(59,130,246,0.12);border:2px solid rgba(59,130,246,0.35);display:flex;align-items:center;justify-content:center;margin-bottom:14px;">' +
                '<i class="fas fa-check-circle" style="font-size:34px;color:#60a5fa;"></i>' +
            '</div>' +
            '<div style="font-size:22px;font-weight:800;color:#fff;text-align:center;">Pedido concluído</div>' +
            '<div style="margin-top:6px;font-size:14px;color:rgba(255,255,255,0.65);">Pedido #' + pedidoId + '</div>';

        const body = document.createElement('div');
        body.style.cssText = 'padding:18px 24px 24px;text-align:center;';
        body.innerHTML =
            '<div style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.5;margin-bottom:16px;">Seu pedido foi concluído pelo restaurante.</div>' +
            '<div style="display:flex;gap:12px;">' +
                '<a href="' + linkWhats + '" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;text-decoration:none;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:10px;color:#fff;padding:14px 18px;font-weight:700;">' +
                    '<i class="fab fa-whatsapp" style="margin-right:8px;"></i>WhatsApp' +
                '</a>' +
                '<button type="button" id="btn-pronto-ok" style="flex:1;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;padding:14px 18px;font-weight:700;cursor:pointer;">Entendi</button>' +
            '</div>';

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const close = () => { try { overlay.remove(); } catch (e) {} };
        const btnOk = document.getElementById('btn-pronto-ok');
        if (btnOk) btnOk.addEventListener('click', close);
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });

        try {
            if (typeof window.mostrarNotificacao === 'function') {
                window.mostrarNotificacao('Pedido concluído', 'Seu pedido #' + pedidoId + ' foi concluído.', '✅');
            }
        } catch (e) {}
    } catch (e) {
        try { mostrarAvisoPedidoCliente('Seu pedido foi concluído.'); } catch (e2) {}
    }
}

function mostrarModalPedidoEmPreparo(pedido) {
    try {
        const existing = document.getElementById('modal-pedido-preparo');
        if (existing) existing.remove();

        const numeroWhats = '+55 51 984149137';
        const numeroWhatsDigits = '5551984149137';
        const pedidoId = pedido && pedido.id ? pedido.id : '';
        const textoWhats = encodeURIComponent('Olá! Meu pedido #' + pedidoId + ' foi aprovado e está em preparo.');
        const linkWhats = 'https://wa.me/' + numeroWhatsDigits + '?text=' + textoWhats;

        const overlay = document.createElement('div');
        overlay.id = 'modal-pedido-preparo';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(0, 0, 0, 0.75);
            animation: fadeIn 0.3s ease;
        `;

        const card = document.createElement('div');
        card.style.cssText = `
            width: min(480px, 95vw);
            border-radius: 16px;
            overflow: hidden;
            background: linear-gradient(145deg, #1a1a1f, #0f0f12);
            border: 1px solid rgba(34, 197, 94, 0.3);
            box-shadow: 0 25px 80px rgba(34, 197, 94, 0.15), 0 0 0 1px rgba(255,255,255,0.05);
            animation: slideUp 0.3s ease;
        `;

        // Header com ícone
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px 20px;
            background: linear-gradient(180deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%);
        `;

        const iconContainer = document.createElement('div');
        iconContainer.style.cssText = `
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(34, 197, 94, 0.15);
            border: 2px solid rgba(34, 197, 94, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 15px;
            animation: pulse 2s infinite;
        `;
        iconContainer.innerHTML = '<i class="fas fa-utensils" style="font-size: 32px; color: #22c55e;"></i>';

        const title = document.createElement('h2');
        title.textContent = 'Pedido em Preparo!';
        title.style.cssText = 'margin: 0; font-size: 22px; font-weight: 700; color: #fff; text-align: center;';

        const pedidoNum = document.createElement('div');
        pedidoNum.textContent = 'Pedido #' + pedidoId;
        pedidoNum.style.cssText = 'margin-top: 5px; font-size: 14px; color: rgba(255,255,255,0.6);';

        header.appendChild(iconContainer);
        header.appendChild(title);
        header.appendChild(pedidoNum);

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px 25px 25px; text-align: center;';

        const mensagem = document.createElement('p');
        mensagem.textContent = 'Seu pedido foi aprovado e já está sendo preparado! Em breve estará pronto para entrega.';
        mensagem.style.cssText = 'margin: 0 0 20px; font-size: 15px; color: rgba(255,255,255,0.8); line-height: 1.5;';

        const whatsInfo = document.createElement('div');
        whatsInfo.style.cssText = `
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.2);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
        `;
        whatsInfo.innerHTML = `
            <div style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 5px;">Dúvidas? Fale conosco:</div>
            <div style="font-size: 16px; color: #22c55e; font-weight: 600;">${numeroWhats}</div>
        `;

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 12px;';

        const btnWhats = document.createElement('a');
        btnWhats.href = linkWhats;
        btnWhats.target = '_blank';
        btnWhats.rel = 'noopener noreferrer';
        btnWhats.innerHTML = '<i class="fab fa-whatsapp" style="margin-right: 8px;"></i>WhatsApp';
        btnWhats.style.cssText = `
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            text-decoration: none;
            background: linear-gradient(135deg, #22c55e, #16a34a);
            border: none;
            border-radius: 10px;
            color: #fff;
            padding: 14px 20px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.textContent = 'Entendi';
        btnOk.style.cssText = `
            flex: 1;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 10px;
            color: #fff;
            padding: 14px 20px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        actions.appendChild(btnWhats);
        actions.appendChild(btnOk);

        body.appendChild(mensagem);
        body.appendChild(whatsInfo);
        body.appendChild(actions);

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const close = () => {
            try { overlay.remove(); } catch (e) {}
        };
        btnOk.addEventListener('click', close);
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) close();
        });
    } catch (e) {
        // fallback: toast
        try { mostrarAvisoPedidoCliente('Seu pedido está em preparo: o gestor aprovou seu pedido.'); } catch (e2) {}
    }
}

async function verificarAtualizacoesStatusPedidosCliente() {
    try {
        const ids = (typeof getPedidoIdsClienteLocal === 'function') ? getPedidoIdsClienteLocal() : [];
        if (!ids || ids.length === 0) return;

        const pedidosServidor = await carregarPedidosClienteServidor();
        const pedidosBase = Array.isArray(pedidosServidor)
            ? pedidosServidor
            : (typeof db !== 'undefined' && typeof db.getPedidos === 'function' ? db.getPedidos() : []);

        const setIds = new Set(ids.map(v => Number(v)));
        const meus = (pedidosBase || []).filter(p => setIds.has(Number(p && p.id)));
        if (meus.length === 0) return;

        const cache = _getPedidosStatusCacheCliente();

        meus.forEach(p => {
            const id = Number(p.id);
            const statusAtual = String(p.status || '').toLowerCase();
            const statusAnterior = String(cache[id] || '').toLowerCase();

            // Aceito / em preparo
            if (statusAtual === 'em_preparo' && statusAnterior !== 'em_preparo') {
                // Se houver GUI de pagamento aberta (PIX aguardando aprovação), fechar automaticamente
                try {
                    const aguardandoPixId = localStorage.getItem('vetera_pedido_aguardando_pix');
                    if (aguardandoPixId && String(aguardandoPixId) === String(id)) {
                        localStorage.removeItem('vetera_pedido_aguardando_pix');
                    }
                } catch (e) {}

                try {
                    if (typeof window.fecharModalPix === 'function') {
                        window.fecharModalPix();
                    } else {
                        const modalPix = document.getElementById('modal-pix');
                        if (modalPix) modalPix.classList.remove('active');
                    }
                } catch (e) {}

                // Abrir GUI (uma vez por pedido)
                if (!_jaMostrouPopupPreparo(id)) {
                    _marcarPopupPreparoMostrado(id);
                    mostrarModalPedidoEmPreparo(p);
                } else {
                    // fallback: toast
                    try { mostrarAvisoPedidoCliente('Seu pedido está em preparo: o gestor aprovou seu pedido.'); } catch (e) {}
                }
            }

            // Concluído/pronto
            if (statusAtual === 'concluido' && statusAnterior !== 'concluido') {
                if (!_jaMostrouPopupPronto(id)) {
                    _marcarPopupProntoMostrado(id);
                    mostrarModalPedidoPronto(p);
                } else {
                    try { mostrarAvisoPedidoCliente('Seu pedido foi concluído.'); } catch (e) {}
                }
            }

            cache[id] = statusAtual;
        });

        _setPedidosStatusCacheCliente(cache);
    } catch (e) {
        // ignora
    }
}

// Atualizar indicador de status da loja na página principal
function atualizarStatusLojaIndicador() {
    const indicador = document.getElementById('status-loja-indicador');
    const mensagemFechada = document.getElementById('mensagem-loja-fechada');
    const mensagemTexto = document.getElementById('mensagem-loja-fechada-texto');
    
    if (!indicador) return;
    
    if (typeof verificarStatusLoja === 'function') {
        const status = verificarStatusLoja();
        
        if (status.aberta) {
            // Esconder mensagem de loja fechada
            if (mensagemFechada) mensagemFechada.style.display = 'none';
            
            indicador.innerHTML = `
                <div style="width: 10px; height: 10px; background: var(--status-aberta); border-radius: 50%; animation: pulse 2s infinite;"></div>
                <span style="color: var(--status-aberta); font-weight: 600; font-size: 14px;">Loja Aberta</span>
                <span style="color: var(--texto-medio); font-size: 12px;">• Fecha às ${status.proximoFechamento || '23:30'}</span>
            `;
            indicador.style.background = 'rgba(34, 197, 94, 0.1)';
            indicador.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        } else {
            // Mostrar mensagem de loja fechada
            if (mensagemFechada) {
                mensagemFechada.style.display = 'block';
                if (mensagemTexto) {
                    mensagemTexto.textContent = status.mensagem || 'No momento estamos fechados. Tente novamente mais tarde!';
                }
            }
            
            indicador.innerHTML = `
                <div style="width: 10px; height: 10px; background: var(--status-fechada); border-radius: 50%;"></div>
                <span style="color: var(--status-fechada); font-weight: 600; font-size: 14px;">Loja Fechada</span>
            `;
            indicador.style.background = 'rgba(239, 68, 68, 0.1)';
            indicador.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        }
    } else {
        // Esconder mensagem se não conseguir verificar
        if (mensagemFechada) mensagemFechada.style.display = 'none';
        
        indicador.innerHTML = `
            <div style="width: 10px; height: 10px; background: var(--status-aberta); border-radius: 50%;"></div>
            <span style="color: var(--status-aberta); font-weight: 600; font-size: 14px;">Loja Aberta</span>
        `;
    }
}

async function inicializarCardapio() {
    try {
        // Aguardar um pouco para garantir que db está pronto
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verificar se db existe
        if (typeof db === 'undefined') {
            console.error('db não está definido');
            return;
        }
        
        // Verificar se db.data existe e tem produtos
        if (!db.data) {
            db.data = {
                produtos: [],
                categorias: [],
                pedidos: [],
                clientes: [],
                cupons: [],
                configuracoes: {},
                usuarios: []
            };
        }
        
        // SEMPRE recarregar do arquivo para garantir dados atualizados
        try {
            await db.fetchInitialData();
            // Após carregar, garantir que produtos manuais estão carregados
            db.inicializarProdutosManualmente();
        } catch (e) {
            console.error('[MAIN] ❌ Erro ao buscar dados:', e);
            // Se falhar, garantir produtos manuais mesmo assim
            db.inicializarProdutosManualmente();
        }

        try {
            aplicarBrandingLoja();
        } catch (e) {}
        
        // Carregar horários do servidor ANTES de verificar status
        try {
            await carregarHorariosDoServidorMain();
        } catch (e) {
            console.warn('[MAIN] ⚠️ Erro ao carregar horários do servidor:', e);
        }
        
        // Atualizar status da loja
        try {
            atualizarStatusLojaIndicador();
        } catch (e) {}
        
        // Garantir que categorias existam (extrair de produtos se necessário)
        if (!db.data.categorias || db.data.categorias.length === 0) {
            if (db.data.produtos && db.data.produtos.length > 0) {
                db.data.categorias = [...new Set(db.data.produtos.map(p => p.categoria).filter(Boolean))];
                db.saveData();
            }
        }
        
        if (!db.data.clientes) {
            db.data.clientes = [];
            db.saveData();
        }
        
        // Carregar cupom salvo
        carregarCupomSalvo();
        
        // Renderizar categorias e produtos (mesmo se vazios)
        try {
            renderizarCategorias();
        } catch (e) {
            console.error('Erro ao renderizar categorias:', e);
        }
        
        try {
            renderizarProdutos();
        } catch (e) {
            console.error('Erro ao renderizar produtos:', e);
        }

        try {
            // Carregar destaques (Combos natalinos)
            await fetchDestaques();
        } catch (e) {
            console.error('[DESTAQUES] Erro ao carregar destaques:', e);
        }
        
        try {
            if (typeof carrinho !== 'undefined') {
                carrinho.renderizar();
            }
        } catch (e) {
            console.error('Erro ao renderizar carrinho:', e);
        }
    } catch (error) {
        console.error('Erro ao inicializar cardápio:', error);
        // Tentar renderizar mesmo com erro
        try {
            if (typeof db !== 'undefined' && db.data) {
                renderizarCategorias();
                renderizarProdutos();
            } else {
                // Se db não existe, mostrar mensagem
                const container = document.getElementById('produtos-container');
                if (container) {
                    container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); grid-column: 1 / -1;">Erro ao carregar produtos. Recarregue a página.</p>';
                }
            }
        } catch (renderError) {
            console.error('Erro ao renderizar:', renderError);
        }
    }
}

// Renderizar categorias
function renderizarCategorias() {
    // Tentar encontrar o container de categorias em diferentes layouts
    let container = document.getElementById('categorias-container');
    
    // Se não encontrar no container principal, tentar no layout padrão
    if (!container) {
        container = document.querySelector('.categorias');
    }
    
    // Se ainda não encontrar, criar no container principal
    if (!container) {
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
            // Criar container de categorias se não existir
            let categoriasDiv = document.getElementById('categorias');
            if (!categoriasDiv) {
                categoriasDiv = document.createElement('div');
                categoriasDiv.id = 'categorias';
                categoriasDiv.style.cssText = 'margin-bottom: 2rem; display: flex; gap: 0.5rem; flex-wrap: wrap;';
                mainContainer.insertBefore(categoriasDiv, mainContainer.firstChild);
            }
            container = categoriasDiv;
        }
    }
    
    if (!container) return;

    // Verificar se db existe
    if (typeof db === 'undefined') {
        container.innerHTML = '<button class="categoria-btn active">Todas</button>';
        return;
    }
    
    // Garantir que db.data existe
    if (!db.data) {
        db.data = {
            produtos: [],
            categorias: [],
            pedidos: [],
            clientes: [],
            cupons: [],
            configuracoes: {},
            usuarios: []
        };
    }

    let categorias = [];
    try {
        categorias = db.getCategorias();
    } catch (e) {
        categorias = [];
    }
    
    container.innerHTML = `
        <button class="categoria-btn ${categoriaSelecionada === 'Todas' ? 'active' : ''}" 
                onclick="filtrarCategoria('Todas')">
            Todas
        </button>
    `;

    categorias.forEach(categoria => {
        const btn = document.createElement('button');
        btn.className = `categoria-btn ${categoriaSelecionada === categoria ? 'active' : ''}`;
        btn.textContent = categoria;
        btn.onclick = () => filtrarCategoria(categoria);
        container.appendChild(btn);
    });
}

// Filtrar produtos por categoria
function filtrarCategoria(categoria) {
    categoriaSelecionada = categoria;
    
    // Atualizar botões ativos
    document.querySelectorAll('.categoria-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent === categoria || (categoria === 'Todas' && btn.textContent === 'Todas')) {
            btn.classList.add('active');
        }
    });
    
    renderizarProdutos();
}

function normalizarTelefone(tel) {
    return String(tel || '').replace(/\D/g, '');
}

function getTelefoneClienteAtual() {
    try {
        if (typeof window.clienteAuth !== 'undefined' && window.clienteAuth.isAuthenticated()) {
            const c = window.clienteAuth.getCurrentCliente();
            if (c && c.telefone) return String(c.telefone);
        }
    } catch (e) {
        // ignora
    }
    try {
        const raw = localStorage.getItem('vetera_cliente_local');
        if (raw) {
            const c = JSON.parse(raw);
            if (c && c.telefone) return String(c.telefone);
        }
    } catch (e) {
        // ignora
    }
    return '';
}

function getPedidoIdsClienteLocal() {
    try {
        const raw = localStorage.getItem('vetera_pedidos_cliente');
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function adicionarPedidoIdClienteLocal(pedidoId) {
    try {
        if (!pedidoId) return;
        const ids = getPedidoIdsClienteLocal();
        const idNum = Number(pedidoId);
        const idToStore = Number.isFinite(idNum) ? idNum : pedidoId;
        if (!ids.includes(idToStore)) ids.unshift(idToStore);
        // evitar crescimento infinito
        const trimmed = ids.slice(0, 50);
        localStorage.setItem('vetera_pedidos_cliente', JSON.stringify(trimmed));
    } catch (e) {
        // ignora
    }
}

function _getChatTokensLocal() {
    try {
        const raw = localStorage.getItem('vetera_chat_tokens');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function _setChatTokensLocal(map) {
    try {
        localStorage.setItem('vetera_chat_tokens', JSON.stringify(map || {}));
    } catch (e) {}
}

function _gerarChatToken() {
    try {
        const arr = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        return String(Date.now()) + String(Math.random()).slice(2);
    }
}

function salvarChatTokenPedidoLocal(pedidoId, token) {
    try {
        if (!pedidoId || !token) return;
        const map = _getChatTokensLocal();
        map[String(pedidoId)] = String(token);
        _setChatTokensLocal(map);
    } catch (e) {}
}

function obterChatTokenPedidoLocal(pedidoId) {
    try {
        const map = _getChatTokensLocal();
        return map[String(pedidoId)] || '';
    } catch (e) {
        return '';
    }
}

async function _recuperarChatTokenDoServidor(pedidoId) {
    try {
        if (!pedidoId) return '';
        const resp = await fetch(window.location.origin + '/api/pedidos?ids=' + encodeURIComponent(String(pedidoId)));
        if (!resp.ok) return '';
        const data = await resp.json();
        const arr = Array.isArray(data) ? data : [];
        const p = arr.find(x => String(x && x.id) === String(pedidoId) || Number(x && x.id) === Number(pedidoId));
        const token = p && p.chatToken ? String(p.chatToken) : '';
        if (token) {
            salvarChatTokenPedidoLocal(pedidoId, token);
            return token;
        }
    } catch (e) {
        // ignora
    }
    return '';
}

// ============================================
// CHAT (CLIENTE) - Bolinha + Janela + Polling
// ============================================
function initChatWidgetCliente() {
    try {
        if (document.getElementById('vetera-chat-bubble')) return;

        const bubble = document.createElement('button');
        bubble.id = 'vetera-chat-bubble';
        bubble.type = 'button';
        bubble.setAttribute('aria-label', 'Abrir chat');
        bubble.style.cssText = `
            position: fixed;
            right: 18px;
            bottom: 18px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.12);
            background: linear-gradient(135deg, rgba(220,38,38,0.9), rgba(185,28,28,0.9));
            color: #fff;
            box-shadow: 0 18px 60px rgba(0,0,0,0.45);
            cursor: pointer;
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        bubble.innerHTML = '<i class="fas fa-comments" style="font-size: 20px;"></i>';

        const badge = document.createElement('div');
        badge.id = 'vetera-chat-badge';
        badge.style.cssText = `
            position:absolute;
            top:-6px;
            right:-6px;
            min-width: 18px;
            height: 18px;
            padding: 0 6px;
            border-radius: 999px;
            background: #22c55e;
            color: #0b0b0d;
            font-weight: 900;
            font-size: 12px;
            display: none;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(0,0,0,0.6);
        `;
        badge.textContent = '1';
        bubble.appendChild(badge);

        const panel = document.createElement('div');
        panel.id = 'vetera-chat-panel';
        panel.style.cssText = `
            position: fixed;
            right: 18px;
            bottom: 86px;
            width: min(380px, calc(100vw - 36px));
            height: min(560px, calc(100vh - 120px));
            border-radius: 16px;
            background: #0f0f12;
            border: 1px solid rgba(255,255,255,0.10);
            box-shadow: 0 24px 90px rgba(0,0,0,0.60);
            overflow: hidden;
            z-index: 99999;
            display: none;
            flex-direction: column;
        `;

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 12px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">
                <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                    <div style="font-weight:900;color:#fff;">Chat do Pedido</div>
                    <div id="vetera-chat-subtitle" style="font-size:12px;color:rgba(255,255,255,0.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Selecione um pedido</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button type="button" id="vetera-chat-notif" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:700;font-size:12px;">Notificações</button>
                    <button type="button" id="vetera-chat-close" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:800;">Fechar</button>
                </div>
            </div>
            <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
                <select id="vetera-chat-pedido-select" style="width:100%;background:#0b0b0d;border:1px solid rgba(255,255,255,0.10);color:#fff;border-radius:10px;padding:10px 12px;">
                    <option value="">Escolha um pedido...</option>
                </select>
            </div>
            <div id="vetera-chat-messages" style="flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;"></div>
            <div style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:10px;align-items:center;">
                <input id="vetera-chat-input" type="text" placeholder="Digite sua mensagem..." style="flex:1;background:#0b0b0d;border:1px solid rgba(255,255,255,0.10);color:#fff;border-radius:12px;padding:12px 12px;outline:none;">
                <button id="vetera-chat-send" type="button" style="background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:#fff;border-radius:12px;padding:12px 14px;font-weight:900;cursor:pointer;">Enviar</button>
            </div>
        `;

        document.body.appendChild(panel);
        document.body.appendChild(bubble);

        let pollTimer = null;
        let lastSince = '';
        let unread = 0;
        let activePedidoId = '';

        function setBadge(n) {
            unread = n;
            const b = document.getElementById('vetera-chat-badge');
            if (!b) return;
            if (n > 0) {
                b.style.display = 'flex';
                b.textContent = String(n);
            } else {
                b.style.display = 'none';
            }
        }

        function renderMessage(m) {
            const wrap = document.createElement('div');
            const from = String(m && m.from ? m.from : '');
            const isMine = from === 'cliente';
            wrap.style.cssText = 'display:flex;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';';
            const bubbleMsg = document.createElement('div');
            bubbleMsg.style.cssText =
                'max-width:85%;padding:10px 12px;border-radius:14px;' +
                (isMine
                    ? 'background:rgba(220,38,38,0.18);border:1px solid rgba(220,38,38,0.28);color:#fff;'
                    : 'background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);color:#fff;');
            bubbleMsg.textContent = String(m && m.text ? m.text : '');
            wrap.appendChild(bubbleMsg);
            return wrap;
        }

        function scrollToBottom() {
            const box = document.getElementById('vetera-chat-messages');
            if (!box) return;
            box.scrollTop = box.scrollHeight;
        }

        function startPolling() {
            if (pollTimer) return;
            pollTimer = setInterval(() => { pollOnce().catch(() => {}); }, 3000);
            pollOnce().catch(() => {});
        }

        function stopPolling() {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
        }

        function openPanel() {
            populatePedidos();
            panel.style.display = 'flex';
            setBadge(0);
            startPolling();
        }

        function closePanel() {
            panel.style.display = 'none';
            stopPolling();
        }

        bubble.addEventListener('click', () => {
            if (panel.style.display === 'none') openPanel();
            else closePanel();
        });

        panel.querySelector('#vetera-chat-close')?.addEventListener('click', closePanel);
        panel.querySelector('#vetera-chat-notif')?.addEventListener('click', async () => {
            try {
                if (typeof window.solicitarPermissaoNotificacoes === 'function') {
                    await window.solicitarPermissaoNotificacoes();
                } else if (typeof window.sugerirNotificacoes === 'function') {
                    window.sugerirNotificacoes();
                }
            } catch (e) {}
        });

        const sel = panel.querySelector('#vetera-chat-pedido-select');
        const subtitle = panel.querySelector('#vetera-chat-subtitle');
        if (sel) {
            sel.addEventListener('change', () => {
                activePedidoId = String(sel.value || '');
                lastSince = '';
                const box = document.getElementById('vetera-chat-messages');
                if (box) box.innerHTML = '';
                if (subtitle) subtitle.textContent = activePedidoId ? ('Pedido #' + activePedidoId) : 'Selecione um pedido';
                startPolling();
            });
            // inicial
            setTimeout(() => {
                activePedidoId = String(sel.value || '');
                if (subtitle) subtitle.textContent = activePedidoId ? ('Pedido #' + activePedidoId) : 'Selecione um pedido';
            }, 50);
        }

        async function sendMessage() {
            if (!activePedidoId) return;
            let token = obterChatTokenPedidoLocal(activePedidoId);
            if (!token) {
                token = await _recuperarChatTokenDoServidor(activePedidoId);
            }
            if (!token) {
                console.warn('[CHAT] Sem chatToken para enviar mensagem no pedido', activePedidoId);
                if (typeof window.mostrarNotificacaoInApp === 'function') {
                    window.mostrarNotificacaoInApp('Chat', 'Não foi possível iniciar o chat deste pedido (token ausente). Atualize a página e tente novamente.');
                }
                return;
            }
            const input = document.getElementById('vetera-chat-input');
            const text = String(input && input.value ? input.value : '').trim();
            if (!text) return;

            try {
                if (typeof window.exigirEscolhaNotificacoesCliente === 'function') {
                    const choice = await window.exigirEscolhaNotificacoesCliente();
                    if (!choice) return;
                }
            } catch (e) {}

            // otimista: já renderiza
            const box = document.getElementById('vetera-chat-messages');
            if (box) {
                box.appendChild(renderMessage({ from: 'cliente', text, ts: new Date().toISOString() }));
                scrollToBottom();
            }
            if (input) input.value = '';

            try {
                const resp = await fetch(window.location.origin + '/api/chat/cliente', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pedidoId: activePedidoId, token, text })
                });
                if (!resp.ok) {
                    // falhou: avisar
                    if (typeof window.mostrarNotificacaoInApp === 'function') {
                        window.mostrarNotificacaoInApp('Chat', 'Não foi possível enviar a mensagem. Tente novamente.');
                    }
                    try {
                        const payload = await resp.json();
                        console.warn('[CHAT] POST falhou:', resp.status, payload);
                    } catch (e) {
                        console.warn('[CHAT] POST falhou:', resp.status);
                    }
                } else {
                    try {
                        const payload = await resp.json();
                        if (!payload || !payload.ok) {
                            console.warn('[CHAT] POST retornou ok=false:', payload);
                        }
                    } catch (e) {}
                }
            } catch (e) {
                if (typeof window.mostrarNotificacaoInApp === 'function') {
                    window.mostrarNotificacaoInApp('Chat', 'Não foi possível enviar a mensagem. Verifique sua conexão.');
                }
                console.warn('[CHAT] POST erro:', e);
            }
        }

        panel.querySelector('#vetera-chat-send')?.addEventListener('click', sendMessage);
        panel.querySelector('#vetera-chat-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        // Quando o storage mudar (outra aba), atualizar pedidos
        window.addEventListener('storage', (e) => {
            if (e && (e.key === 'vetera_pedidos_cliente' || e.key === 'vetera_chat_tokens')) {
                populatePedidos();
            }
        });

        // polling leve mesmo fechado (só para badge)
        setInterval(() => {
            if (panel.style.display !== 'none') return;
            populatePedidos();
            const ids = (typeof getPedidoIdsClienteLocal === 'function') ? (getPedidoIdsClienteLocal() || []) : [];
            const first = ids && ids.length > 0 ? String(ids[0]) : '';
            if (!first) return;
            activePedidoId = first;
            pollOnce().catch(() => {});
        }, 8000);
    } catch (e) {
        console.warn('[CHAT] Falha ao iniciar widget:', e);
    }
}

// Renderizar produtos
function renderizarProdutos() {
    // Tentar encontrar o container de produtos em diferentes layouts
    let container = document.getElementById('produtos-container');
    
    // Se não encontrar, tentar no container principal
    if (!container) {
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
            // Criar container de produtos se não existir
            let produtosDiv = document.getElementById('produtos');
            if (!produtosDiv) {
                produtosDiv = document.createElement('div');
                produtosDiv.id = 'produtos';
                produtosDiv.style.cssText = 'display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));';
                // Inserir após o header ou categorias
                const categorias = document.getElementById('categorias');
                if (categorias) {
                    categorias.insertAdjacentElement('after', produtosDiv);
                } else {
                    mainContainer.appendChild(produtosDiv);
                }
            }
            container = produtosDiv;
        }
    }
    
    if (!container) {
        // Container não encontrado, tentar novamente depois
        setTimeout(renderizarProdutos, 500);
        return;
    }

    // Verificar se db está disponível
    if (typeof db === 'undefined') {
        console.warn('[MAIN] db não está definido ao renderizar produtos');
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); grid-column: 1 / -1;">Carregando produtos...</p>';
        setTimeout(renderizarProdutos, 500);
        return;
    }
    
    // Garantir que db.data existe
    if (!db.data) {
        console.warn('[MAIN] db.data não existe, inicializando...');
        db.data = {
            produtos: [],
            categorias: [],
            pedidos: [],
            clientes: [],
            cupons: [],
            configuracoes: {},
            usuarios: []
        };
    }

    console.log('[MAIN] Renderizando produtos. Total no db.data:', db.data.produtos?.length || 0);

    // Importante: no cliente, também precisamos mostrar produtos pausados (ativo === false)
    let produtos = Array.isArray(db.data.produtos) ? [...db.data.produtos] : [];
    produtos.sort((a, b) => {
        const ao = (typeof a.ordem === 'number') ? a.ordem : 0;
        const bo = (typeof b.ordem === 'number') ? b.ordem : 0;
        return ao - bo;
    });
    if (categoriaSelecionada && categoriaSelecionada !== 'Todas') {
        produtos = produtos.filter(p => p && p.categoria === categoriaSelecionada);
    }

    // Determinar ids de produtos em destaque (do destaque ativo)
    let destaqueIds = [];
    try {
        const destaquesRaw = db.data?.destaques;
        const destaques = Array.isArray(destaquesRaw) ? destaquesRaw : (destaquesRaw && typeof destaquesRaw === 'object' ? (Array.isArray(destaquesRaw.destaques) ? destaquesRaw.destaques : (destaquesRaw.produtos ? [destaquesRaw] : Object.values(destaquesRaw))) : []);
        const ativo = (destaques || []).find(d => d.ativo) || (destaques && destaques[0]);
        if (ativo && Array.isArray(ativo.produtos)) {
            destaqueIds = ativo.produtos.map(id => parseInt(id));
        }
    } catch (e) {
        destaqueIds = [];
    }

    // Obter categorias com divisória
    const categoriasDados = typeof db.getCategoriasDados === 'function' ? db.getCategoriasDados() : [];
    const categoriasComDivisoria = new Set();
    categoriasDados.forEach(cat => {
        if (cat.divisoria) {
            categoriasComDivisoria.add(cat.nome);
        }
    });

    // Agrupar produtos por categoria (se não houver filtro de categoria específica)
    let produtosPorCategoria = {};
    if (!categoriaSelecionada || categoriaSelecionada === 'Todas') {
        produtos.forEach(p => {
            const cat = p.categoria || 'Sem categoria';
            if (!produtosPorCategoria[cat]) {
                produtosPorCategoria[cat] = [];
            }
            produtosPorCategoria[cat].push(p);
        });
    } else {
        produtosPorCategoria[categoriaSelecionada] = produtos;
    }


    // Se não houver produtos, mostrar mensagem apropriada
    if (produtos.length === 0) {
        // Se não há produtos mas db.data.produtos existe, pode ser filtro
        if (db.data.produtos && db.data.produtos.length > 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); grid-column: 1 / -1;">Nenhum produto encontrado nesta categoria.</p>';
        } else {
            // Não há produtos carregados
            container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); grid-column: 1 / -1;">Carregando produtos...</p>';
            // Tentar recarregar
            setTimeout(async () => {
                try {
                    await db.fetchInitialData();
                    renderizarProdutos();
                } catch (e) {
                    console.error('[MAIN] Erro ao recarregar:', e);
                    container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); grid-column: 1 / -1;">Nenhum produto disponível no momento.</p>';
                }
            }, 2000);
        }
        return;
    }

    // Renderizar produtos por categoria com divisórias
    let html = '';
    const categoriasOrdenadas = Object.keys(produtosPorCategoria).sort((a, b) => {
        const ordemA = categoriasDados.find(c => c.nome === a)?.ordem || 999;
        const ordemB = categoriasDados.find(c => c.nome === b)?.ordem || 999;
        return ordemA - ordemB;
    });

    categoriasOrdenadas.forEach((categoria, index) => {
        // Adicionar divisória bonita para cada categoria (exceto a primeira)
        if (index > 0 || categoriasComDivisoria.has(categoria)) {
            const categoriaDados = categoriasDados.find(c => c.nome === categoria);
            html += '<div class="categoria-divisoria" style="grid-column: 1 / -1; margin: 3rem 0 2rem; padding: 0 1rem; position: relative;">';
            html += '<div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">';
            html += '<div style="flex: 1; height: 2px; background: linear-gradient(to right, transparent, var(--accent), transparent); opacity: 0.4; max-width: 100px;"></div>';
            html += '<div style="background: linear-gradient(135deg, var(--accent), var(--vermelho-escuro)); padding: 0.75rem 2rem; border-radius: 50px; box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3);">';
            html += '<h2 style="color: white; font-weight: 700; font-size: 1.3rem; margin: 0; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 0.5rem; justify-content: center;">';
            html += '<i class="fas fa-utensils" style="font-size: 1.1rem;"></i>';
            html += '<span>' + categoria + '</span>';
            html += '</h2>';
            html += '</div>';
            html += '<div style="flex: 1; height: 2px; background: linear-gradient(to left, transparent, var(--accent), transparent); opacity: 0.4; max-width: 100px;"></div>';
            html += '</div>';
            html += '</div>';
        }

        // Renderizar produtos da categoria
        produtosPorCategoria[categoria].forEach(produto => {
            if (!produto) return;
            
            // Calcular preço com desconto
            const precoOriginal = parseFloat(produto.preco) || 0;
            let precoFinal = precoOriginal;
            let temDesconto = false;
            let descontoInfo = '';
            
            if (produto.desconto && produto.desconto.ativo && produto.desconto.valor) {
                temDesconto = true;
                if (produto.desconto.tipo === 'percentual') {
                    precoFinal = precoOriginal * (1 - produto.desconto.valor / 100);
                } else if (produto.desconto.tipo === 'fixo') {
                    precoFinal = precoOriginal - produto.desconto.valor;
                    if (precoFinal < 0) precoFinal = 0;
                }
                
                const descontoTexto = produto.desconto.tipo === 'percentual' ? produto.desconto.valor + '% OFF' : 'DESCONTO';
                descontoInfo = '<div class="produto-preco" style="display: flex; flex-direction: column; gap: 4px;"><div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"><span style="text-decoration: line-through; color: var(--texto-medio); font-size: 0.9em;">R$ ' + precoOriginal.toFixed(2) + '</span><span style="background: var(--vermelho-claro); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; font-weight: 600;">' + descontoTexto + '</span></div><div style="color: var(--vermelho-claro); font-size: 1.2em; font-weight: 700;">R$ ' + precoFinal.toFixed(2) + '</div></div>';
            } else {
                descontoInfo = '<div class="produto-preco">R$ ' + precoOriginal.toFixed(2) + '</div>';
            }
            
            // Sanitizar dados
            const nomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(produto.nome) : String(produto.nome || '').replace(/[<>]/g, '');
            const descricaoSegura = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(produto.descricao) : String(produto.descricao || '').replace(/[<>]/g, '');
            
            // Corrigir URL da imagem - usar caminho direto das Fotos
            let imagemUrl = '';
            if (produto.imagem) {
                // Limpar URL primeiro
                let imagemLimpa = String(produto.imagem).trim();
                
                // Se contém api/produto-imagem, converter para caminho direto da pasta Fotos
                if (imagemLimpa.includes('api/produto-imagem')) {
                    // Extrair ID da imagem da URL
                    const match = imagemLimpa.match(/id=(\d+)/);
                    if (match && match[1]) {
                        // Usar caminho direto da pasta Fotos
                        const imagesBase = window.ENV?.imagesBaseUrl || '/Fotos';
                        imagemUrl = imagesBase + '/produto_' + match[1] + '.jpg';
                    } else {
                        imagemUrl = ''; // Se não conseguir extrair ID, não usar imagem
                    }
                } else if (imagemLimpa.startsWith('http') || imagemLimpa.startsWith('data:')) {
                    imagemUrl = imagemLimpa;
                } else if (imagemLimpa.startsWith('/')) {
                    imagemUrl = imagemLimpa;
                } else {
                    // Caminho normal para pasta Fotos
                    const imagesBase = window.ENV?.imagesBaseUrl || '/Fotos';
                    imagemUrl = imagesBase + '/' + imagemLimpa;
                }
                imagemUrl = imagemUrl.replace(/[<>'"]/g, '');
            }
            
            const indisponivel = produto.ativo === false;

            html += '<div class="produto-card" style="' + (indisponivel ? 'opacity:0.55; filter:grayscale(1);' : '') + '">' +
                '<div class="produto-imagem-container">' +
                (produto.imagem ? 
                    '<img src="' + imagemUrl + '" alt="' + nomeSeguro + '" class="produto-imagem" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">' +
                    '<div class="produto-imagem-placeholder" style="display: none;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm6-2h-1.2l-.8-1.2A1 1 0 0 0 15.9 5H8.1a1 1 0 0 0-.9.3L6.4 6.5H5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2z"/></svg><span class="placeholder-text">Foto</span></div>' :
                    '<div class="produto-imagem-placeholder"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm6-2h-1.2l-.8-1.2A1 1 0 0 0 15.9 5H8.1a1 1 0 0 0-.9.3L6.4 6.5H5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2z"/></svg><span class="placeholder-text">Foto</span></div>'
                ) +
                '</div>' +
                '<div class="produto-conteudo">' +
                '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
                '<h3 class="produto-nome" style="margin:0;">' + nomeSeguro + '</h3>' +
                (destaqueIds.includes(produto.id) ? '<span class="produto-badge destaque">DESTAQUE</span>' : '') +
                '</div>' +
                '<p class="produto-descricao">' + descricaoSegura + '</p>' +
                (indisponivel ? '<div style="margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: var(--texto-medio); font-weight: 600; text-align:center;">Indisponível no momento</div>' : '') +
                descontoInfo +
                '<div class="produto-controles">' +
                '<div class="quantidade-controle">' +
                '<button class="quantidade-btn" ' + (indisponivel ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '') + ' onclick="diminuirQuantidade(' + produto.id + ')">-</button>' +
                '<span class="quantidade-valor" id="qtd-' + produto.id + '">0</span>' +
                '<button class="quantidade-btn" ' + (indisponivel ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '') + ' onclick="aumentarQuantidade(' + produto.id + ')">+</button>' +
                '</div>' +
                '<button class="adicionar-btn" ' + (indisponivel ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '') + ' onclick="adicionarAoCarrinho(' + produto.id + ')">' + (indisponivel ? 'Indisponível' : 'Adicionar') + '</button>' +
                '</div>' +
                '</div>' +
                '</div>';
        });
    });

    container.innerHTML = html || '<p style="text-align: center; color: var(--texto-medio); grid-column: 1 / -1;">Nenhum produto encontrado.</p>';

    // Atualizar quantidades visíveis baseadas no carrinho
    atualizarQuantidadesVisiveis();
    
    // Garantir que o carrinho está renderizado
    if (typeof carrinho !== 'undefined') {
        carrinho.renderizar();
    }
}

// Atualizar quantidades visíveis baseadas no carrinho
function atualizarQuantidadesVisiveis() {
    if (typeof carrinho === 'undefined') {
        console.warn('[MAIN] ⚠️ carrinho não está definido');
        return;
    }
    
    // Recarregar itens do carrinho para garantir dados atualizados
    const itensCarrinho = carrinho.getItens();
    // Atualizar contador de cada produto baseado no que está no carrinho
    itensCarrinho.forEach(item => {
        const qtdElement = document.getElementById(`qtd-${item.produtoId}`);
        if (qtdElement) {
            qtdElement.textContent = item.quantidade;
        }
    });
    
    // Resetar contadores de produtos que não estão no carrinho
    if (typeof db !== 'undefined' && db.data && db.data.produtos) {
        db.data.produtos.forEach(produto => {
            const itemNoCarrinho = itensCarrinho.find(item => item.produtoId === produto.id);
            if (!itemNoCarrinho) {
                const qtdElement = document.getElementById(`qtd-${produto.id}`);
                if (qtdElement && qtdElement.textContent !== '0') {
                    qtdElement.textContent = '0';
                }
            }
        });
    }
}

// Aumentar quantidade
function aumentarQuantidade(produtoId) {
    const produto = (typeof db !== 'undefined' && typeof db.getProduto === 'function') ? db.getProduto(produtoId) : null;
    if (produto && produto.ativo === false) return;
    const qtdElement = document.getElementById(`qtd-${produtoId}`);
    if (!qtdElement) return;
    let quantidade = parseInt(qtdElement.textContent) || 0;
    quantidade++;
    qtdElement.textContent = quantidade;
}

// Diminuir quantidade
function diminuirQuantidade(produtoId) {
    const produto = (typeof db !== 'undefined' && typeof db.getProduto === 'function') ? db.getProduto(produtoId) : null;
    if (produto && produto.ativo === false) return;
    const qtdElement = document.getElementById(`qtd-${produtoId}`);
    if (!qtdElement) return;
    let quantidade = parseInt(qtdElement.textContent) || 0;
    if (quantidade > 0) {
        quantidade--;
        qtdElement.textContent = quantidade;
    }
}

// Adicionar ao carrinho - SEM necessidade de login
function adicionarAoCarrinho(produtoId) {
    // Sanitizar ID do produto
    const idSeguro = typeof sanitizeId !== 'undefined' ? sanitizeId(produtoId) : parseInt(produtoId);
    if (!idSeguro) {
        console.error('[MAIN] ❌ ID de produto inválido:', produtoId);
        return;
    }

    try {
        const produto = (typeof db !== 'undefined' && typeof db.getProduto === 'function') ? db.getProduto(idSeguro) : null;
        if (produto && produto.ativo === false) return;
        
        const qtdElement = document.getElementById(`qtd-${idSeguro}`);
        const quantidade = qtdElement ? (parseInt(qtdElement.textContent) || 1) : 1;
        
        // Se for um combo, abrir modal de seleção de partes
        if (produto && produto.tipo === 'combo' && produto.partes && produto.partes.length > 0) {
            abrirModalCombo(produto, quantidade);
            return;
        }
        
        // Se tiver finalizações, abrir modal de seleção
        if (produto && produto.finalizacoes && produto.finalizacoes.length > 0) {
            abrirModalFinalizacoes(produto, quantidade);
            return;
        }
        
        // Se for um produto normal (sem combo, sem finalizações), adicionar direto ao carrinho
        if (produto && produto.tipo !== 'combo' && (!produto.finalizacoes || produto.finalizacoes.length === 0)) {
            carrinho.adicionarItem(idSeguro, quantidade);
            return;
        }
    } catch (e) {
        console.error('[MAIN] Erro ao processar produto:', e);
    }
    
    const qtdElement = document.getElementById(`qtd-${idSeguro}`);
    if (!qtdElement) {
        console.warn('[MAIN] ⚠️ Elemento de quantidade não encontrado para produto:', idSeguro);
        // Adicionar com quantidade 1 se o elemento não existir
        carrinho.adicionarItem(idSeguro, 1);
        return;
    }
    
    let quantidade = parseInt(qtdElement.textContent) || 1;
    if (quantidade <= 0) quantidade = 1;
    
    // Adicionar ao carrinho
    const sucesso = carrinho.adicionarItem(idSeguro, quantidade);
    
    if (sucesso) {
        // Aguardar um pouco para garantir que o carrinho foi atualizado
        setTimeout(() => {
            // Atualizar contador visual do produto para mostrar quantidade no carrinho
            const itensCarrinho = carrinho.getItens();
            const itemNoCarrinho = itensCarrinho.find(item => item.produtoId === idSeguro);
            if (itemNoCarrinho && qtdElement) {
                qtdElement.textContent = itemNoCarrinho.quantidade;
            } else if (qtdElement) {
                qtdElement.textContent = '0';
            }
        }, 100);
    }
}

// Função para abrir modal de seleção de combo
function abrirModalCombo(produto, quantidade = 1) {
    // Criar modal se não existir
    let modal = document.getElementById('modal-combo');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-combo';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2 class="modal-title" id="modal-combo-titulo"></h2>
                    <button class="modal-close" onclick="fecharModalCombo()"><i class="fas fa-times"></i></button>
                </div>
                <div id="modal-combo-conteudo" style="padding: 20px;">
                    <!-- Conteúdo será inserido aqui -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const titulo = document.getElementById('modal-combo-titulo');
    const conteudo = document.getElementById('modal-combo-conteudo');
    
    titulo.textContent = produto.nome + (quantidade > 1 ? ` (${quantidade}x)` : '');
    
    let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--borda);">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">${produto.descricao || ''}</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--vermelho-claro);">R$ ${produto.preco.toFixed(2)}</div>
        </div>
    `;
    
    // Renderizar partes
    produto.partes.forEach((parte, parteIndex) => {
        html += `
            <div style="margin-bottom: 25px; padding: 20px; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--borda);">
                <h3 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 1.1rem; font-weight: 700;">
                    🔹 ${parte.nome}${parte.descricao ? ` – ${parte.descricao}` : ''}
                </h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
        `;
        
        parte.opcoes.forEach((opcao, opcaoIndex) => {
            const opcaoId = `combo-${produto.id}-parte-${parteIndex}-opcao-${opcaoIndex}`;
            const precoAdicional = opcao.preco > 0 ? ` <span style="color: var(--vermelho-claro); font-weight: 600;">➕ R$ ${opcao.preco.toFixed(2)}</span>` : '';
            const isRadio = parte.escolhaMaxima === 1;
            
            html += `
                <label style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-primary); border: 2px solid var(--borda); border-radius: 8px; cursor: pointer; transition: all 0.2s;" 
                       onmouseover="this.style.borderColor='var(--vermelho-claro)'; this.style.background='rgba(220,38,38,0.05)'" 
                       onmouseout="this.style.borderColor='var(--borda)'; this.style.background='var(--bg-primary)'">
                    <input type="${isRadio ? 'radio' : 'checkbox'}" 
                           name="combo-${produto.id}-parte-${parteIndex}" 
                           id="${opcaoId}"
                           value="${opcaoIndex}"
                           ${parte.obrigatorio && isRadio && opcaoIndex === 0 ? 'checked' : ''}
                           style="width: 20px; height: 20px; accent-color: var(--vermelho-claro); cursor: pointer;"
                           onchange="atualizarPrecoCombo()">
                    <span style="flex: 1; color: var(--text-primary); font-size: 0.95rem;">${opcao.nome}${precoAdicional}</span>
                </label>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    // Renderizar adicionais se existirem
    if (produto.adicionais && produto.adicionais.length > 0) {
        html += `
            <div style="margin-bottom: 25px; padding: 20px; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--borda);">
                <h3 style="margin: 0 0 15px 0; color: var(--text-primary); font-size: 1.1rem; font-weight: 700;">
                    ➕ Adicionais${produto.adicionaisMaximo ? ` (até ${produto.adicionaisMaximo})` : ''}
                </h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
        `;
        
        produto.adicionais.forEach((adicional, adicionalIndex) => {
            const adicionalId = `combo-${produto.id}-adicional-${adicionalIndex}`;
            html += `
                <label style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; background: var(--bg-primary); border: 2px solid var(--borda); border-radius: 8px; cursor: pointer; transition: all 0.2s;" 
                       onmouseover="this.style.borderColor='var(--vermelho-claro)'; this.style.background='rgba(220,38,38,0.05)'" 
                       onmouseout="this.style.borderColor='var(--borda)'; this.style.background='var(--bg-primary)'">
                    <span style="flex: 1; color: var(--text-primary); font-size: 0.95rem;">${adicional.nome}</span>
                    <span style="color: var(--vermelho-claro); font-weight: 600;">➕ R$ ${adicional.preco.toFixed(2)}</span>
                    <input type="checkbox" 
                           id="${adicionalId}"
                           style="width: 20px; height: 20px; accent-color: var(--vermelho-claro); cursor: pointer;"
                           onchange="atualizarPrecoCombo(); validarAdicionaisMaximo()">
                </label>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Preço total e botão adicionar
    html += `
        <div style="margin-top: 25px; padding: 20px; background: var(--bg-secondary); border-radius: 12px; border: 2px solid var(--vermelho-claro);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-size: 1.2rem; font-weight: 600; color: var(--text-primary);">Total:</span>
                <span id="combo-preco-total" style="font-size: 1.8rem; font-weight: 700; color: var(--vermelho-claro);">R$ ${produto.preco.toFixed(2)}</span>
            </div>
            <button onclick="adicionarComboAoCarrinho(${produto.id}, ${quantidade})" 
                    class="btn btn-primary" 
                    style="width: 100%; padding: 15px; font-size: 1.1rem; font-weight: 700;">
                Adicionar ao Carrinho
            </button>
        </div>
    `;
    
    conteudo.innerHTML = html;
    modal.style.display = 'flex';
    
    // Armazenar dados do produto no modal
    modal.dataset.produtoId = produto.id;
    modal.dataset.quantidade = quantidade;
    window.comboAtual = produto;
    window.comboQuantidade = quantidade;
    
    // Calcular preço inicial
    atualizarPrecoCombo();
}

// Função para atualizar preço total do combo
function atualizarPrecoCombo() {
    if (!window.comboAtual) return;
    
    const produto = window.comboAtual;
    let precoTotal = produto.preco;
    
    // Calcular preço das partes selecionadas
    produto.partes.forEach((parte, parteIndex) => {
        const radioName = `combo-${produto.id}-parte-${parteIndex}`;
        const radioSelecionado = document.querySelector(`input[name="${radioName}"]:checked`);
        if (radioSelecionado) {
            const opcaoIndex = parseInt(radioSelecionado.value);
            const opcao = parte.opcoes[opcaoIndex];
            if (opcao && opcao.preco) {
                precoTotal += opcao.preco;
            }
        }
    });
    
    // Calcular preço dos adicionais selecionados
    if (produto.adicionais) {
        produto.adicionais.forEach((adicional, adicionalIndex) => {
            const checkbox = document.getElementById(`combo-${produto.id}-adicional-${adicionalIndex}`);
            if (checkbox && checkbox.checked) {
                precoTotal += adicional.preco;
            }
        });
    }
    
    // Multiplicar pela quantidade
    precoTotal *= (window.comboQuantidade || 1);
    
    // Atualizar exibição
    const precoElement = document.getElementById('combo-preco-total');
    if (precoElement) {
        precoElement.textContent = `R$ ${precoTotal.toFixed(2)}`;
    }
}

// Validar máximo de adicionais
function validarAdicionaisMaximo() {
    if (!window.comboAtual || !window.comboAtual.adicionaisMaximo) return;
    
    const produto = window.comboAtual;
    const adicionaisSelecionados = produto.adicionais.filter((_, index) => {
        const checkbox = document.getElementById(`combo-${produto.id}-adicional-${index}`);
        return checkbox && checkbox.checked;
    }).length;
    
    if (adicionaisSelecionados > produto.adicionaisMaximo) {
        alert(`Você pode selecionar no máximo ${produto.adicionaisMaximo} adicionais.`);
        event.target.checked = false;
        atualizarPrecoCombo();
    }
}

// Adicionar combo ao carrinho
function adicionarComboAoCarrinho(produtoId, quantidade) {
    if (!window.comboAtual) return;
    
    const produto = window.comboAtual;
    
    // Validar partes obrigatórias
    for (let i = 0; i < produto.partes.length; i++) {
        const parte = produto.partes[i];
        if (parte.obrigatorio) {
            const radioName = `combo-${produtoId}-parte-${i}`;
            const selecionado = document.querySelector(`input[name="${radioName}"]:checked`);
            if (!selecionado) {
                alert(`Por favor, selecione uma opção na ${parte.nome}.`);
                return;
            }
        }
    }
    
    // Coletar seleções
    const selecoes = {
        partes: [],
        adicionais: []
    };
    
    produto.partes.forEach((parte, parteIndex) => {
        const radioName = `combo-${produtoId}-parte-${parteIndex}`;
        const radioSelecionado = document.querySelector(`input[name="${radioName}"]:checked`);
        if (radioSelecionado) {
            const opcaoIndex = parseInt(radioSelecionado.value);
            selecoes.partes.push({
                parte: parte.nome,
                opcao: parte.opcoes[opcaoIndex].nome,
                precoAdicional: parte.opcoes[opcaoIndex].preco || 0
            });
        }
    });
    
    if (produto.adicionais) {
        produto.adicionais.forEach((adicional, adicionalIndex) => {
            const checkbox = document.getElementById(`combo-${produtoId}-adicional-${adicionalIndex}`);
            if (checkbox && checkbox.checked) {
                selecoes.adicionais.push({
                    nome: adicional.nome,
                    preco: adicional.preco
                });
            }
        });
    }
    
    // Calcular preço total
    let precoTotal = produto.preco;
    selecoes.partes.forEach(p => precoTotal += (p.precoAdicional || 0));
    selecoes.adicionais.forEach(a => precoTotal += (a.preco || 0));
    
    // Multiplicar pela quantidade
    precoTotal *= (window.comboQuantidade || 1);
    
    // Atualizar exibição
    const precoElement = document.getElementById('combo-preco-total');
    if (precoElement) {
        precoElement.textContent = `R$ ${precoTotal.toFixed(2)}`;
    }
    
    // SOLUÇÃO DEFINITIVA: Implementar a lógica diretamente aqui, sem depender do método da classe
    const carrinhoInstance = window.carrinho;
    
    if (!carrinhoInstance) {
        console.error('[MAIN] Erro: carrinho não está disponível');
        alert('Erro ao adicionar combo ao carrinho. Por favor, recarregue a página.');
        return;
    }
    
    // O produto já foi obtido no início da função (linha 1355: const produto = window.comboAtual)
    // Verificar se produto está válido
    if (!produto || produto.ativo === false) {
        console.error('[MAIN] Produto não encontrado ou inativo:', produtoId);
        alert('Produto não encontrado.');
        return;
    }
    
    // Verificar se o ID corresponde (usar produtoId da função, não buscar novo)
    if (produto.id && produto.id !== produtoId) {
        console.warn('[MAIN] ID do produto não corresponde, usando o ID da função:', produtoId);
    }
    
    // Garantir que o produtoId usado seja o correto
    const produtoIdFinal = produto.id || produtoId;
    
    // Criar nome do item com resumo das seleções
    let nomeCompleto = produto.nome;
    if (selecoes.partes && selecoes.partes.length > 0) {
        nomeCompleto += ' - ' + selecoes.partes.map(p => p.opcao).join(', ');
    }
    if (selecoes.adicionais && selecoes.adicionais.length > 0) {
        nomeCompleto += ' + ' + selecoes.adicionais.map(a => a.nome).join(', ');
    }
    
    // Usar produtoIdFinal para busca
    const produtoIdParaBusca = produtoIdFinal || produtoId;
    
    // Obter itens atuais do carrinho
    let itens = carrinhoInstance.getItens();
    
    // Verificar se já existe item igual (mesmo produto com mesmas seleções)
    const itemExistenteIndex = itens.findIndex(item => 
        item.produtoId === produtoIdParaBusca && 
        JSON.stringify(item.selecoes) === JSON.stringify(selecoes)
    );
    
    if (itemExistenteIndex >= 0) {
        // Item igual existe - somar quantidade
        const itemExistente = itens[itemExistenteIndex];
        itemExistente.quantidade = (parseInt(itemExistente.quantidade) || 0) + quantidade;
        itemExistente.preco = precoTotal;
        
        // Atualizar array e salvar
        itens[itemExistenteIndex] = itemExistente;
        carrinhoInstance.itens = itens;
        carrinhoInstance.salvarCarrinho();
    } else {
        // Novo item - adicionar
        const novoItem = {
            produtoId: produtoIdParaBusca,
            nome: nomeCompleto,
            nomeOriginal: produto.nome,
            preco: precoTotal,
            quantidade: quantidade,
            imagem: produto.imagem || null,
            tipo: 'combo',
            selecoes: selecoes
        };
        
        // Adicionar ao array de itens do carrinho
        itens.push(novoItem);
        carrinhoInstance.itens = itens;
        
        // Salvar no localStorage
        carrinhoInstance.salvarCarrinho();
    }
    
    // Renderizar carrinho
    carrinhoInstance.renderizar();
    
    // Mostrar feedback
    if (typeof carrinhoInstance.mostrarFeedback === 'function') {
        const totalItens = carrinhoInstance.contarItens();
        carrinhoInstance.mostrarFeedback(`${quantidade} ${quantidade === 1 ? 'combo' : 'combos'} adicionado${quantidade === 1 ? '' : 's'}! Total no carrinho: ${totalItens} itens`);
    }
    
    // Atualizar quantidades visíveis
    setTimeout(() => {
        if (typeof atualizarQuantidadesVisiveis === 'function') {
            atualizarQuantidadesVisiveis();
        }
    }, 50);
    
    // Fechar modal e atualizar quantidade no card
    fecharModalCombo();
    
    setTimeout(() => {
        const qtdElement = document.getElementById(`qtd-${produtoIdParaBusca || produtoId}`);
        if (qtdElement) {
            const itensCarrinho = carrinhoInstance.getItens();
            // Buscar todos os itens do mesmo produto (pode ter seleções diferentes)
            const produtoIdBusca = produtoIdParaBusca || produtoId;
            const itensMesmoProduto = itensCarrinho.filter(item => item.produtoId === produtoIdBusca);
            const totalQuantidade = itensMesmoProduto.reduce((sum, item) => sum + (parseInt(item.quantidade) || 0), 0);
            qtdElement.textContent = totalQuantidade;
        }
    }, 100);
}

// Tornar função global
window.adicionarComboAoCarrinho = adicionarComboAoCarrinho;

// Fechar modal de combo
function fecharModalCombo() {
    const modal = document.getElementById('modal-combo');
    if (modal) {
        modal.style.display = 'none';
    }
    window.comboAtual = null;
    window.comboQuantidade = null;
}

// Função para abrir modal de finalizações
function abrirModalFinalizacoes(produto, quantidade = 1) {
    let modal = document.getElementById('modal-finalizacoes');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-finalizacoes';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2 class="modal-title" id="modal-finalizacoes-titulo"></h2>
                    <button class="modal-close" onclick="fecharModalFinalizacoes()"><i class="fas fa-times"></i></button>
                </div>
                <div id="modal-finalizacoes-conteudo" style="padding: 20px;">
                    <!-- Conteúdo será inserido aqui -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const titulo = document.getElementById('modal-finalizacoes-titulo');
    const conteudo = document.getElementById('modal-finalizacoes-conteudo');
    
    titulo.textContent = produto.nome + (quantidade > 1 ? ` (${quantidade}x)` : '');
    
    let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--borda);">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">${produto.descricao || ''}</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--vermelho-claro);">R$ ${produto.preco.toFixed(2)}</div>
        </div>
        <div style="margin-bottom: 20px; padding: 15px; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--borda);">
            <h3 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 1rem; font-weight: 700;">
                Finalização - Escolha pelo menos ${produto.finalizacoesMinimas || 1} opção(ões)
            </h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
    `;
    
    produto.finalizacoes.forEach((finalizacao, index) => {
        const finalizacaoId = `finalizacao-${produto.id}-${index}`;
        const precoAdicional = finalizacao.preco > 0 ? ` <span style="color: var(--vermelho-claro); font-weight: 600;">+ R$ ${finalizacao.preco.toFixed(2)}</span>` : '';
        
        html += `
            <label style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-primary); border: 2px solid var(--borda); border-radius: 8px; cursor: pointer; transition: all 0.2s;" 
                   onmouseover="this.style.borderColor='var(--vermelho-claro)'; this.style.background='rgba(220,38,38,0.05)'" 
                   onmouseout="this.style.borderColor='var(--borda)'; this.style.background='var(--bg-primary)'">
                <input type="checkbox" 
                       id="${finalizacaoId}"
                       value="${index}"
                       style="width: 20px; height: 20px; accent-color: var(--vermelho-claro); cursor: pointer;"
                       onchange="validarFinalizacoesMinimas(); atualizarPrecoFinalizacoes()">
                <span style="flex: 1; color: var(--text-primary); font-size: 0.95rem;">${finalizacao.nome}${precoAdicional}</span>
            </label>
        `;
    });
    
    html += `
            </div>
            <div id="finalizacoes-contador" style="margin-top: 10px; font-size: 0.9rem; color: var(--texto-medio);">
                <span id="finalizacoes-selecionadas">0</span>/${produto.finalizacoesMaximo || produto.finalizacoesMinimas || 3} selecionada(s)
            </div>
        </div>
    `;
    
    // Preço total e botão adicionar
    html += `
        <div style="margin-top: 25px; padding: 20px; background: var(--bg-secondary); border-radius: 12px; border: 2px solid var(--vermelho-claro);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-size: 1.2rem; font-weight: 600; color: var(--text-primary);">Total:</span>
                <span id="finalizacoes-preco-total" style="font-size: 1.8rem; font-weight: 700; color: var(--vermelho-claro);">R$ ${produto.preco.toFixed(2)}</span>
            </div>
            <button onclick="adicionarComFinalizacoes(${produto.id}, ${quantidade})" 
                    class="btn btn-primary" 
                    id="btn-adicionar-finalizacoes"
                    style="width: 100%; padding: 15px; font-size: 1.1rem; font-weight: 700;">
                Adicionar ao Carrinho
            </button>
        </div>
    `;
    
    conteudo.innerHTML = html;
    modal.style.display = 'flex';
    
    window.produtoFinalizacoes = produto;
    window.quantidadeFinalizacoes = quantidade;
    
    validarFinalizacoesMinimas();
    atualizarPrecoFinalizacoes();
}

// Validar mínimo de finalizações
function validarFinalizacoesMinimas() {
    if (!window.produtoFinalizacoes) return;
    
    const produto = window.produtoFinalizacoes;
    const minimo = produto.finalizacoesMinimas || 1;
    
    const selecionados = produto.finalizacoes.filter((_, index) => {
        const checkbox = document.getElementById(`finalizacao-${produto.id}-${index}`);
        return checkbox && checkbox.checked;
    }).length;
    
    const contador = document.getElementById('finalizacoes-contador');
    const btnAdicionar = document.getElementById('btn-adicionar-finalizacoes');
    const selecionadasSpan = document.getElementById('finalizacoes-selecionadas');
    
    if (selecionadasSpan) {
        selecionadasSpan.textContent = selecionados;
        selecionadasSpan.style.color = selecionados >= minimo ? 'var(--vermelho-claro)' : 'var(--texto-medio)';
    }
    
    if (btnAdicionar) {
        btnAdicionar.disabled = selecionados < minimo;
        btnAdicionar.style.opacity = selecionados < minimo ? '0.5' : '1';
        btnAdicionar.style.cursor = selecionados < minimo ? 'not-allowed' : 'pointer';
    }
    
    if (contador) {
        contador.style.color = selecionados >= minimo ? 'var(--text-primary)' : 'var(--vermelho-claro)';
    }
}

// Atualizar preço total das finalizações
function atualizarPrecoFinalizacoes() {
    if (!window.produtoFinalizacoes) return;
    
    const produto = window.produtoFinalizacoes;
    let precoTotal = produto.preco;
    
    produto.finalizacoes.forEach((finalizacao, index) => {
        const checkbox = document.getElementById(`finalizacao-${produto.id}-${index}`);
        if (checkbox && checkbox.checked && finalizacao.preco) {
            precoTotal += finalizacao.preco;
        }
    });
    
    precoTotal *= (window.quantidadeFinalizacoes || 1);
    
    const precoElement = document.getElementById('finalizacoes-preco-total');
    if (precoElement) {
        precoElement.textContent = `R$ ${precoTotal.toFixed(2)}`;
    }
}

// Adicionar produto com finalizações ao carrinho
function adicionarComFinalizacoes(produtoId, quantidade) {
    console.log('[DEBUG] adicionarComFinalizacoes chamada', { produtoId, quantidade });
    console.log('[DEBUG] window.carrinho:', window.carrinho);
    console.log('[DEBUG] carrinho.adicionarItemComFinalizacoes:', typeof carrinho?.adicionarItemComFinalizacoes);
    
    if (!window.produtoFinalizacoes) return;
    
    const produto = window.produtoFinalizacoes;
    const minimo = produto.finalizacoesMinimas || 1;
    
    // Coletar finalizações selecionadas
    const finalizacoesSelecionadas = [];
    produto.finalizacoes.forEach((finalizacao, index) => {
        const checkbox = document.getElementById(`finalizacao-${produtoId}-${index}`);
        if (checkbox && checkbox.checked) {
            finalizacoesSelecionadas.push({
                nome: finalizacao.nome,
                preco: finalizacao.preco || 0
            });
        }
    });
    
    if (finalizacoesSelecionadas.length < minimo) {
        alert(`Por favor, selecione pelo menos ${minimo} finalização(ões).`);
        return;
    }
    
    // Calcular preço total
    let precoTotal = produto.preco;
    finalizacoesSelecionadas.forEach(f => precoTotal += (f.preco || 0));
    
    // Adicionar ao carrinho
    if (typeof carrinho !== 'undefined' && typeof carrinho.adicionarItemComFinalizacoes === 'function') {
        carrinho.adicionarItemComFinalizacoes(produtoId, quantidade, finalizacoesSelecionadas, precoTotal);
    } else {
        console.error('[MAIN] Erro: carrinho.adicionarItemComFinalizacoes não está disponível');
        alert('Erro ao adicionar produto ao carrinho. Por favor, recarregue a página.');
        return;
    }
    
    // Fechar modal
    fecharModalFinalizacoes();
    
    // Atualizar quantidade no card
    setTimeout(() => {
        const qtdElement = document.getElementById(`qtd-${produtoId}`);
        if (qtdElement) {
            const itensCarrinho = carrinho.getItens();
            const itemNoCarrinho = itensCarrinho.find(item => item.produtoId === produtoId && JSON.stringify(item.finalizacoes) === JSON.stringify(finalizacoesSelecionadas));
            if (itemNoCarrinho) {
                qtdElement.textContent = itemNoCarrinho.quantidade;
            }
        }
    }, 100);
}

// Tornar função global
window.adicionarComFinalizacoes = adicionarComFinalizacoes;

// Fechar modal de finalizações
function fecharModalFinalizacoes() {
    const modal = document.getElementById('modal-finalizacoes');
    if (modal) {
        modal.style.display = 'none';
    }
    window.produtoFinalizacoes = null;
    window.quantidadeFinalizacoes = null;
}

// Abrir checkout (modal do carrinho)
function abrirCheckout() {
    mostrarCarrinhoDetalhado();
    const modal = document.getElementById('modal-carrinho');
    if (modal) {
        modal.classList.add('active');
    }
}

// Fechar modal
function fecharModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Mostrar carrinho detalhado
function mostrarCarrinhoDetalhado() {
    const container = document.getElementById('carrinho-detalhado');
    if (!container) return;

    const itens = carrinho.getItens();
    
    if (itens.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); padding: 2rem;">Carrinho vazio</p>';
        return;
    }

    container.innerHTML = itens.map(item => {
        const produto = db.getProduto(item.produtoId);
        const subtotal = item.preco * item.quantidade;
        // Usar imagem do item (se salva) ou do produto ou fallback
        let imagem = item.imagem || produto?.imagem || null;
        if (imagem && !imagem.startsWith('http') && !imagem.startsWith('/') && !imagem.startsWith('data:')) {
            imagem = '/Fotos/' + imagem;
        } else if (!imagem) {
            imagem = '/Fotos/produto-' + item.produtoId + '.png';
        }
        
        return `
            <div style="display: flex; gap: 1rem; padding: 1rem; background: var(--cinza-medio); border-radius: 8px; margin-bottom: 1rem; align-items: center;">
                <div style="flex-shrink: 0;">
                    <img src="${imagem}" 
                         alt="${item.nome}" 
                         style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid var(--borda); background: var(--cinza-escuro);"
                         onerror="this.onerror=null; this.src='logo.png'; this.style.width='80px'; this.style.height='80px'; this.style.objectFit='contain';">
                </div>
                <div style="flex: 1; min-width: 0;">
                    <h4 style="color: var(--texto-claro); margin-bottom: 0.5rem; font-size: 1rem;">${item.nome}</h4>
                    <p style="color: var(--texto-medio); font-size: 0.9rem; margin-bottom: 0.25rem;">
                        <strong>Valor unitário:</strong> R$ ${item.preco.toFixed(2)}
                    </p>
                    <p style="color: var(--texto-medio); font-size: 0.9rem; margin-bottom: 0.5rem;">
                        <strong>Quantidade:</strong> ${item.quantidade}
                    </p>
                    <p style="color: var(--vermelho-claro); font-weight: bold; font-size: 1.1rem; margin: 0;">
                        <strong>Subtotal:</strong> R$ ${subtotal.toFixed(2)}
                    </p>
                </div>
                <div style="flex-shrink: 0;">
                    <button onclick="removerItemCarrinho(${item.produtoId})" 
                            style="background: var(--vermelho-escuro); color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                        Remover
                    </button>
                </div>
            </div>
        `;
    }).join('');

    atualizarTotalCarrinho();
}

// Remover item do carrinho
function removerItemCarrinho(produtoId) {
    carrinho.removerItem(produtoId);
    mostrarCarrinhoDetalhado();
    atualizarQuantidadesVisiveis();
}

// Atualizar total do carrinho
function atualizarTotalCarrinho() {
    const subtotal = carrinho.calcularTotal();
    let desconto = 0;

    if (cupomAplicado) {
        if (cupomAplicado.tipo === 'percentual') {
            desconto = subtotal * (cupomAplicado.valor / 100);
        } else {
            desconto = cupomAplicado.valor;
        }
    }

    const total = subtotal - desconto;

    const subtotalEl = document.getElementById('carrinho-subtotal');
    const descontoEl = document.getElementById('carrinho-desconto');
    const totalEl = document.getElementById('carrinho-total-modal');

    if (subtotalEl) subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;
    if (descontoEl) descontoEl.textContent = `- R$ ${desconto.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
}

// Aplicar cupom no carrinho
function aplicarCupom() {
    const codigoInput = document.getElementById('cupom-codigo');
    const mensagemEl = document.getElementById('cupom-mensagem');
    
    if (!codigoInput || !mensagemEl) return;

    const codigo = codigoInput.value.trim().toUpperCase();
    if (!codigo) {
        mensagemEl.innerHTML = '<span style="color: var(--aviso);">Digite um código de cupom</span>';
        return;
    }

    const subtotal = carrinho.calcularTotal();
    const validacao = db.validarCupom(codigo, subtotal);

    if (validacao.valido) {
        cupomAplicado = validacao.cupom;
        salvarCupom();
            mensagemEl.innerHTML = '<span style="color: var(--sucesso);"><i class="fas fa-check-circle"></i> Cupom aplicado com sucesso!</span>';
        atualizarTotalCarrinho();
    } else {
        cupomAplicado = null;
        salvarCupom();
        const mensagemSegura = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(validacao.mensagem) : String(validacao.mensagem || '').replace(/[<>]/g, '');
            mensagemEl.innerHTML = `<span style="color: var(--vermelho-claro);"><i class="fas fa-times-circle"></i> ${mensagemSegura}</span>`;
        atualizarTotalCarrinho();
    }
}

// Aplicar cupom no checkout
async function aplicarCupomCheckout() {
    const codigoInput = document.getElementById('checkout-cupom');
    const mensagemEl = document.getElementById('checkout-cupom-msg');
    
    if (!codigoInput) return;

    const codigo = codigoInput.value.trim().toUpperCase();
    if (!codigo) {
        if (mensagemEl) mensagemEl.innerHTML = '<span style="color: var(--aviso);">Digite um código de cupom</span>';
        return;
    }

    const itens = carrinho.getItens();
    const subtotal = itens.reduce((sum, item) => sum + (parseFloat(item.preco) * parseInt(item.quantidade)), 0);
    
    // SEMPRE validar via API (fonte única da verdade)
    try {
        const response = await fetch(window.location.origin + '/api/cupons/validar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo, valorTotal: subtotal })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
        
        const validacao = await response.json();

        if (validacao.valido) {
            cupomAplicado = validacao.cupom;
            salvarCupom();
            if (mensagemEl) mensagemEl.innerHTML = `<span style="color: var(--sucesso);"><i class="fas fa-check-circle"></i> Cupom "${codigo}" aplicado! Desconto: ${validacao.cupom.tipo === 'percentual' ? validacao.cupom.valor + '%' : 'R$ ' + validacao.cupom.valor.toFixed(2)}</span>`;
            atualizarTotaisCheckout();
        } else {
            cupomAplicado = null;
            salvarCupom();
            if (mensagemEl) mensagemEl.innerHTML = `<span style="color: var(--vermelho-claro);"><i class="fas fa-times-circle"></i> ${validacao.mensagem}</span>`;
            atualizarTotaisCheckout();
        }
    } catch (error) {
        console.error('[CUPOM] Erro ao validar via API:', error);
        // Fallback para validação local
        if (db && db.validarCupom) {
            const validacao = db.validarCupom(codigo, subtotal);
            if (validacao.valido) {
                cupomAplicado = validacao.cupom;
                salvarCupom();
                if (mensagemEl) {
                    const codigoSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(codigo) : String(codigo || '').replace(/[<>]/g, '');
                    let mensagemCupom = `<span style="color: var(--sucesso);"><i class="fas fa-check-circle"></i> Cupom "${codigoSeguro}" aplicado!`;
                    if (validacao.cupom.tipo === 'percentual' || validacao.cupom.valor > 0) {
                        const descontoTexto = validacao.cupom.tipo === 'percentual' ? validacao.cupom.valor + '%' : 'R$ ' + validacao.cupom.valor.toFixed(2);
                        mensagemCupom += ` Desconto: ${descontoTexto}`;
                    }
            if (validacao.cupom.freteGratis) {
                mensagemCupom += validacao.cupom.distanciaMaxFreteGratis 
                    ? ` + <i class="fas fa-truck"></i> Frete Grátis (até ${validacao.cupom.distanciaMaxFreteGratis}km)`
                    : ' + <i class="fas fa-truck"></i> Frete Grátis';
            }
                    mensagemCupom += '</span>';
                    mensagemEl.innerHTML = mensagemCupom;
                }
                atualizarTotaisCheckout();
                calcularTaxaEntregaCheckout();
            } else {
                cupomAplicado = null;
                salvarCupom();
                if (mensagemEl) mensagemEl.innerHTML = `<span style="color: var(--vermelho-claro);"><i class="fas fa-times-circle"></i> ${validacao.mensagem}</span>`;
                atualizarTotaisCheckout();
            }
        } else {
            if (mensagemEl) {
                mensagemEl.innerHTML = '<span style="color: var(--vermelho-claro);">Erro ao validar cupom. Tente novamente.</span>';
            }
        }
    }
}

window.aplicarCupomCheckout = aplicarCupomCheckout;

// Finalizar pedido - Abre modal de checkout
function finalizarPedido() {
    const itens = carrinho.getItens();
    if (itens.length === 0) {
        alert('Adicione itens ao carrinho antes de finalizar!');
        return;
    }
    
    // Abrir modal de checkout na mesma página
    abrirCheckoutModal();
}

// Modal de loja fechada
function mostrarModalLojaFechada(mensagem) {
    // Remover modal existente se houver
    const existente = document.getElementById('modal-loja-fechada');
    if (existente) existente.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'modal-loja-fechada';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.75);
        animation: fadeIn 0.3s ease;
    `;
    
    const card = document.createElement('div');
    card.style.cssText = `
        width: min(450px, 95vw);
        border-radius: 16px;
        overflow: hidden;
        background: linear-gradient(145deg, #1a1a1f, #0f0f12);
        border: 1px solid rgba(239, 68, 68, 0.3);
        box-shadow: 0 25px 80px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(255,255,255,0.05);
        animation: slideUp 0.3s ease;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 25px 20px 15px;
        background: linear-gradient(180deg, rgba(239, 68, 68, 0.15) 0%, transparent 100%);
    `;
    
    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.15);
        border: 2px solid rgba(239, 68, 68, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    iconContainer.innerHTML = '<i class="fas fa-store-slash" style="font-size: 28px; color: #ef4444;"></i>';
    header.appendChild(iconContainer);
    
    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding: 20px 25px 25px; text-align: center;';
    
    const titulo = document.createElement('h2');
    titulo.textContent = 'Loja Fechada';
    titulo.style.cssText = 'margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #fff;';
    
    const texto = document.createElement('p');
    texto.textContent = mensagem || 'No momento estamos fechados. Tente novamente mais tarde!';
    texto.style.cssText = 'margin: 0 0 20px; font-size: 15px; color: rgba(255,255,255,0.7); line-height: 1.5;';
    
    const btnFechar = document.createElement('button');
    btnFechar.textContent = 'Entendi';
    btnFechar.style.cssText = `
        width: 100%;
        padding: 14px 20px;
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        border: none;
        border-radius: 10px;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    `;
    btnFechar.onmouseover = () => btnFechar.style.transform = 'translateY(-2px)';
    btnFechar.onmouseout = () => btnFechar.style.transform = 'translateY(0)';
    btnFechar.onclick = () => overlay.remove();
    
    body.appendChild(titulo);
    body.appendChild(texto);
    body.appendChild(btnFechar);
    
    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    
    // Fechar ao clicar fora
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
    
    document.body.appendChild(overlay);
}

// Abrir modal de checkout
function abrirCheckoutModal() {
    // Verificar se a loja está aberta
    if (typeof verificarStatusLoja === 'function') {
        const status = verificarStatusLoja();
        if (!status.aberta) {
            // Mostrar modal informativo de loja fechada
            mostrarModalLojaFechada(status.mensagem);
            return;
        }
    }
    
    const modal = document.getElementById('modal-checkout');
    if (!modal) {
        console.error('[MAIN] ❌ Modal de checkout não encontrado!');
        return;
    }
    
    // Fechar modal de carrinho se estiver aberto
    fecharModal('modal-carrinho');
    
    // Renderizar checkout
    renderizarCheckoutModal();
    
    // Abrir modal
    modal.classList.add('active');
    
    // Inicializar máscaras de telefone e CEP
    setTimeout(() => {
        const telefoneInput = document.getElementById('checkout-telefone');
        const cepInput = document.getElementById('checkout-cep');
        
        if (telefoneInput && !telefoneInput.dataset.mascaraAplicada) {
            aplicarMascaraTelefone(telefoneInput);
            telefoneInput.dataset.mascaraAplicada = 'true';
        }
        
        if (cepInput && !cepInput.dataset.mascaraAplicada) {
            aplicarMascaraCEP(cepInput);
            cepInput.dataset.mascaraAplicada = 'true';
        }
    }, 100);
}

// Renderizar checkout no modal
function renderizarCheckoutModal() {
    const itens = carrinho.getItens();
    if (itens.length === 0) return;
    
    // Renderizar resumo de itens
    const resumoContainer = document.getElementById('checkout-resumo-pedido');
    if (resumoContainer) {
        let htmlItens = '';
        itens.forEach(item => {
            const produto = db.getProduto(item.produtoId);
            const preco = parseFloat(item.preco) || 0;
            const quantidade = parseInt(item.quantidade) || 0;
            const subtotal = preco * quantidade;
            
            // Obter imagem do produto
            let imagem = item.imagem || produto?.imagem || null;
            if (imagem && !imagem.startsWith('http') && !imagem.startsWith('/') && !imagem.startsWith('data:')) {
                imagem = '/Fotos/' + imagem;
            } else if (!imagem) {
                imagem = '/Fotos/produto-' + item.produtoId + '.png';
            }
            
            // Sanitizar dados para prevenir XSS
            const nomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(item.nome) : String(item.nome || '').replace(/[<>]/g, '');
            const imagemSegura = typeof escapeHTML !== 'undefined' ? escapeHTML(imagem) : String(imagem || '').replace(/[<>'"]/g, '');
            
            htmlItens += `
                <div class="checkout-item" style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--borda); align-items: center; flex-wrap: wrap;">
                    <div style="flex-shrink: 0;">
                        <img src="${imagemSegura}" 
                             alt="${nomeSeguro}" 
                             class="checkout-item-img"
                             style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 2px solid var(--borda); background: var(--cinza-escuro); box-shadow: 0 2px 8px rgba(0,0,0,0.2);"
                             onerror="this.onerror=null; this.src='logo.png'; this.style.width='70px'; this.style.height='70px'; this.style.objectFit='contain';">
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: var(--texto-claro); font-weight: 600; margin-bottom: 6px; font-size: 1rem;">${nomeSeguro}</div>
                        <div style="color: var(--texto-medio); font-size: 0.9rem; margin-bottom: 4px;">
                            <strong>Valor unitário:</strong> R$ ${preco.toFixed(2)}
                        </div>
                        <div style="color: var(--texto-medio); font-size: 0.9rem;">
                            <strong>Quantidade:</strong> ${quantidade}
                        </div>
                    </div>
                    <div style="flex-shrink: 0; text-align: right;">
                        <div style="color: var(--vermelho-claro); font-weight: bold; font-size: 1.2rem;">
                            R$ ${subtotal.toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
        });
        // Limpar seleção antes de atualizar innerHTML para evitar erro de Range
        try {
            if (window.getSelection) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    selection.removeAllRanges();
                }
            }
        } catch (e) {
            // Ignorar erros de seleção
        }
        resumoContainer.innerHTML = htmlItens;
    }
    
    // Preencher dados do cliente se estiver logado
    if (typeof window.clienteAuth !== 'undefined' && window.clienteAuth.isAuthenticated()) {
        const cliente = window.clienteAuth.getCurrentCliente();
        if (cliente) {
            const nomeInput = document.getElementById('checkout-nome');
            const telefoneInput = document.getElementById('checkout-telefone');
            const enderecoInput = document.getElementById('checkout-endereco');
            const bairroInput = document.getElementById('checkout-bairro');
            const cepInput = document.getElementById('checkout-cep');
            
            if (nomeInput && cliente.nome) nomeInput.value = cliente.nome;
            if (telefoneInput && cliente.telefone) telefoneInput.value = cliente.telefone;
            if (enderecoInput && cliente.endereco) enderecoInput.value = cliente.endereco;
            if (bairroInput && cliente.bairro) bairroInput.value = cliente.bairro;
            if (cepInput && cliente.cep) cepInput.value = cliente.cep;
        }
    }
    
    // Carregar cupom salvo e preencher campo
    carregarCupomSalvo();
    const cupomInput = document.getElementById('checkout-cupom');
    if (cupomInput && cupomAplicado) {
        cupomInput.value = cupomAplicado.codigo;
        const mensagemEl = document.getElementById('checkout-cupom-msg');
        if (mensagemEl) {
            mensagemEl.innerHTML = `<span style="color: var(--sucesso);"><i class="fas fa-check-circle"></i> Cupom "${cupomAplicado.codigo}" aplicado!</span>`;
        }
    }

    // Renderizar formas de pagamento dinamicamente
    renderizarFormasPagamentoCheckout();
    
    // Atualizar totais
    atualizarTotaisCheckout();

}

// Renderizar formas de pagamento no checkout de acordo com configurações
function renderizarFormasPagamentoCheckout() {
    const container = document.getElementById('checkout-formas-list');
    if (!container) return;
    container.innerHTML = `
      <label style="display:flex; align-items:center; gap:12px; padding:12px; background: rgba(255,255,255,0.03); border-radius:8px; cursor:pointer; margin-bottom:8px;">
        <input type="radio" name="checkout-pagamento" value="pix" style="width:18px; height:18px;" checked>
        <span style="color:#fff; font-weight:500;">Pix</span>
      </label>
      <label style="display:flex; align-items:center; gap:12px; padding:12px; background: rgba(255,255,255,0.03); border-radius:8px; cursor:pointer; margin-bottom:8px;">
        <input type="radio" name="checkout-pagamento" value="cartao" style="width:18px; height:18px;">
        <span style="color:#fff; font-weight:500;">Cartão</span>
      </label>
    `;
    return;

    // Mapear os valores para nomes legíveis
    const nomeFormaPagamento = (valor) => {
        const map = {
            'pix': 'Pix',
            'mercadopago': 'Pix',
            'debito': 'Débito',
            'credito': 'Crédito',
            'dinheiro': 'Dinheiro',
            'ted': 'TED',
            'boleto': 'Boleto'
        };
        return map[valor] || valor;
    };

    let html = '';
    opcoes.forEach((opcao, index) => {
        const nome = nomeFormaPagamento(opcao);
        html += `<label style="display:flex; align-items:center; gap:12px; padding:12px; background: rgba(255,255,255,0.03); border-radius:8px; cursor:pointer; margin-bottom:8px;">
            <input type="radio" name="checkout-pagamento" value="${opcao}" style="width:18px; height:18px;" ${index === 0 ? 'checked' : ''}>
            <span style="color:#fff; font-weight:500;">${escapeHTML(nome)}</span>
        </label>`;
    });

    // Limpar seleção antes de atualizar innerHTML para evitar erro de Range
    try {
        if (window.getSelection) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                selection.removeAllRanges();
            }
        }
    } catch (e) {
        // Ignorar erros de seleção
    }
    container.innerHTML = html;
}

// Validar CPF (algoritmo brasileiro)
function validarCPF(cpf) {
    if (!cpf) return false;
    const nums = String(cpf).replace(/\D/g, '');
    if (nums.length !== 11) return false;
    if (/^(\d)\1+$/.test(nums)) return false;

    const calc = (t) => {
        let s = 0;
        for (let i = 0; i < t; i++) {
            s += parseInt(nums.charAt(i)) * (t + 1 - i);
        }
        const r = s % 11;
        return r < 2 ? 0 : 11 - r;
    };

    const dv1 = calc(9);
    const dv2 = calc(10);
    return dv1 === parseInt(nums.charAt(9)) && dv2 === parseInt(nums.charAt(10));
}

// Calcular taxa de entrega no checkout
async function calcularTaxaEntregaCheckout() {
    const endereco = document.getElementById('checkout-endereco')?.value;
    const bairro = document.getElementById('checkout-bairro')?.value;
    const taxaEl = document.getElementById('checkout-taxa');
    const msgTaxaEl = document.getElementById('checkout-taxa-msg');
    
    // Verificar se cupom aplicado tem frete grátis
    let freteGratisAplicado = false;
    if (cupomAplicado && cupomAplicado.freteGratis === true) {
        freteGratisAplicado = true;
    }
    
    if (endereco && bairro && typeof window.calcularTaxaEntregaPorEndereco === 'function') {
        const enderecoCompleto = `${endereco}, ${bairro}, Porto Alegre, RS`;
        
        const resultado = await window.calcularTaxaEntregaPorEndereco(enderecoCompleto);
        if (resultado && resultado.sucesso) {
            let taxaFinal = resultado.taxa || 0;
            let distancia = resultado.distancia || 0;
            
            // Verificar se cupom tem limite de distância para frete grátis
            if (freteGratisAplicado && cupomAplicado.distanciaMaxFreteGratis) {
                if (distancia <= cupomAplicado.distanciaMaxFreteGratis) {
                    taxaFinal = 0; // Frete grátis dentro da distância
                    if (msgTaxaEl) {
                        msgTaxaEl.innerHTML = `<span style="color: var(--sucesso);"><i class="fas fa-check-circle"></i> Frete Grátis! Distância: ${distancia.toFixed(2)}km (dentro do limite de ${cupomAplicado.distanciaMaxFreteGratis}km)</span>`;
                    }
                } else {
                    // Fora da distância, cobrar taxa normal
                    if (msgTaxaEl) {
                        msgTaxaEl.innerHTML = `<span style="color: var(--aviso);">Distância: ${distancia.toFixed(2)}km (acima do limite de ${cupomAplicado.distanciaMaxFreteGratis}km para frete grátis)</span>`;
                    }
                }
            } else if (freteGratisAplicado) {
                taxaFinal = 0; // Frete grátis sem limite de distância
                if (msgTaxaEl) {
                    msgTaxaEl.innerHTML = `<span style="color: var(--sucesso);"><i class="fas fa-check-circle"></i> Frete Grátis! Distância: ${distancia.toFixed(2)}km</span>`;
                }
            } else {
                if (msgTaxaEl) {
                    msgTaxaEl.innerHTML = `<span style="color: var(--sucesso);">Distância: ${distancia.toFixed(2)}km</span>`;
                }
            }
            
            if (taxaEl) taxaEl.textContent = `R$ ${taxaFinal.toFixed(2)}`;
        } else {
            if (taxaEl) taxaEl.textContent = freteGratisAplicado ? 'R$ 0,00' : 'R$ 0,00';
            if (msgTaxaEl) {
                const erroMsg = resultado?.mensagem || resultado?.erro || 'Erro ao calcular';
                const erroMsgSegura = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(erroMsg) : String(erroMsg).replace(/[<>]/g, '');
                msgTaxaEl.innerHTML = `<span style="color: var(--vermelho-claro);">${erroMsgSegura}</span>`;
            }
        }
    }
    
    atualizarTotaisCheckout();
}

// Atualizar totais do checkout
async function atualizarTotaisCheckout() {
    const itens = carrinho.getItens();
    if (itens.length === 0) return;
    
    const subtotal = itens.reduce((sum, item) => sum + (parseFloat(item.preco) * parseInt(item.quantidade)), 0);
    let desconto = 0;
    
    if (cupomAplicado) {
        if (cupomAplicado.tipo === 'percentual') {
            desconto = subtotal * (cupomAplicado.valor / 100);
        } else {
            desconto = cupomAplicado.valor;
        }
    }
    
    // Aplicar regras condicionais
    const formaPagamento = document.querySelector('input[name="checkout-pagamento"]:checked')?.value;
    let descontoCondicional = 0;
    let freteGratisCondicional = false;
    let distanciaMaxFreteGratis = null;
    
    if (typeof aplicarRegrasCondicionais === 'function') {
        const resultado = aplicarRegrasCondicionais({
            formaPagamento: formaPagamento,
            subtotal: subtotal,
            quantidadeItens: itens.length
        });
        descontoCondicional = resultado.desconto || 0;
        freteGratisCondicional = resultado.freteGratis || false;
        distanciaMaxFreteGratis = resultado.distanciaMaxFreteGratis || null;
    }
    
    // Calcular taxa de entrega
    let taxaEntrega = 0;
    let distanciaEntrega = 0;
    const enderecoInput = document.getElementById('checkout-endereco');
    const bairroInput = document.getElementById('checkout-bairro');
    
    // Verificar se cupom aplicado tem frete grátis
    let freteGratisAplicado = false;
    if (cupomAplicado && cupomAplicado.freteGratis === true) {
        freteGratisAplicado = true;
    }
    
    if (enderecoInput && bairroInput && enderecoInput.value && bairroInput.value) {
        if (typeof window.calcularTaxaEntregaPorEndereco === 'function') {
            try {
                const enderecoCompleto = `${enderecoInput.value}, ${bairroInput.value}, Porto Alegre, RS`;
                const resultado = await window.calcularTaxaEntregaPorEndereco(enderecoCompleto);
                
                if (resultado && resultado.sucesso) {
                    distanciaEntrega = resultado.distancia || 0;
                    
                    // Verificar se cupom tem limite de distância para frete grátis
                    if (freteGratisAplicado && cupomAplicado.distanciaMaxFreteGratis) {
                        if (distanciaEntrega <= cupomAplicado.distanciaMaxFreteGratis) {
                            taxaEntrega = 0; // Frete grátis dentro da distância
                        } else {
                            taxaEntrega = resultado.taxa || 0; // Fora da distância, cobrar taxa normal
                        }
                    } else if (freteGratisAplicado) {
                        taxaEntrega = 0; // Frete grátis sem limite de distância
                    } else {
                        taxaEntrega = resultado.taxa || 0; // Taxa normal
                    }
                } else {
                    taxaEntrega = freteGratisAplicado ? 0 : 3.00; // Taxa mínima se não conseguir calcular
                }
            } catch (error) {
                taxaEntrega = freteGratisAplicado ? 0 : 3.00;
            }
        } else {
            taxaEntrega = freteGratisAplicado ? 0 : 3.00; // Taxa mínima
        }
    } else {
        taxaEntrega = freteGratisAplicado ? 0 : 3.00; // Taxa mínima
    }
    
    // Aplicar frete grátis condicional
    if (freteGratisCondicional) {
        if (distanciaMaxFreteGratis !== null && distanciaEntrega > distanciaMaxFreteGratis) {
            // Fora da distância, cobrar taxa normal
        } else {
            taxaEntrega = 0; // Frete grátis
        }
    }
    
    const total = subtotal - desconto - descontoCondicional + taxaEntrega;
    
    // Atualizar elementos
    const subtotalEl = document.getElementById('checkout-subtotal');
    const descontoEl = document.getElementById('checkout-desconto');
    const taxaEl = document.getElementById('checkout-taxa');
    const totalEl = document.getElementById('checkout-total');
    
    if (subtotalEl) subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;
    if (descontoEl) descontoEl.textContent = `- R$ ${(desconto + descontoCondicional).toFixed(2)}`;
    if (taxaEl) taxaEl.textContent = `R$ ${taxaEntrega.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
}

// Processar pedido do checkout
async function processarPedidoCheckout() {
    // Verificar se a loja está aberta
    if (typeof verificarStatusLoja === 'function') {
        const status = verificarStatusLoja();
        if (!status.aberta) {
            // Mostrar popup de loja fechada
            const mensagem = status.mensagem || 'A loja está fechada no momento. Tente novamente mais tarde.';
            mostrarPopupLojaFechada(mensagem);
            return;
        }
    }
    
    const itens = carrinho.getItens();
    if (itens.length === 0) {
        alert('Seu carrinho está vazio!');
        return;
    }
    
    // Obter dados do formulário
    const nome = document.getElementById('checkout-nome')?.value.trim();
    const telefone = document.getElementById('checkout-telefone')?.value.trim();
    const endereco = document.getElementById('checkout-endereco')?.value.trim();
    const numeroCasa = document.getElementById('checkout-numero-casa')?.value.trim();
    const bairro = document.getElementById('checkout-bairro')?.value.trim();
    const cep = document.getElementById('checkout-cep')?.value.trim();
    const referencia = document.getElementById('checkout-referencia')?.value.trim();
    const observacoes = document.getElementById('checkout-observacoes')?.value.trim();
    const formaPagamento = document.querySelector('input[name="checkout-pagamento"]:checked')?.value || 'pix';
    
    if (!nome || !telefone || !endereco || !numeroCasa || !bairro || !cep) {
        alert('Preencha todos os campos obrigatórios!');
        return;
    }
    
    // Validar telefone
    if (!validarTelefone(telefone)) {
        mostrarErroCheckout('checkout-telefone', 'Telefone inválido. Use o formato (00) 00000-0000 ou (00) 0000-0000');
        return;
    }
    
    // Validar CEP
    if (!validarCEP(cep)) {
        mostrarErroCheckout('checkout-cep', 'CEP inválido. Use o formato 00000-000');
        return;
    }
    
    // Verificar se CEP existe (via API)
    const cepValido = await verificarCEPExistente(cep);
    if (!cepValido) {
        mostrarErroCheckout('checkout-cep', 'CEP não encontrado. Verifique se o CEP está correto.');
        return;
    }
    
    // Calcular totais
    await atualizarTotaisCheckout();
    
    const cpf = document.getElementById('checkout-cpf')?.value.trim();
    if (!cpf || !validarCPF(cpf)) {
        mostrarErroCheckout('checkout-cpf', 'CPF inválido. Verifique e tente novamente.');
        return;
    }

    const subtotal = itens.reduce((sum, item) => sum + (parseFloat(item.preco) * parseInt(item.quantidade)), 0);
    let desconto = 0;
    if (cupomAplicado) {
        desconto = cupomAplicado.tipo === 'percentual' 
            ? subtotal * (cupomAplicado.valor / 100)
            : cupomAplicado.valor;
    }
    // Aplicar regras condicionais
    let descontoCondicional = 0;
    let freteGratisCondicional = false;
    let distanciaMaxFreteGratis = null;
    
    if (typeof aplicarRegrasCondicionais === 'function') {
        const resultado = aplicarRegrasCondicionais({
            formaPagamento: formaPagamento,
            subtotal: subtotal,
            quantidadeItens: itens.length
        });
        descontoCondicional = resultado.desconto || 0;
        freteGratisCondicional = resultado.freteGratis || false;
        distanciaMaxFreteGratis = resultado.distanciaMaxFreteGratis || null;
    }
    
    // VALIDAR DISTÂNCIA ANTES DE CRIAR PEDIDO
    let taxaEntrega = 0;
    let distanciaCalculada = 0;
    
    // Verificar se cupom aplicado tem frete grátis
    let freteGratisAplicado = false;
    if (cupomAplicado && cupomAplicado.freteGratis === true) {
        freteGratisAplicado = true;
    }
    
    if (endereco && bairro && typeof window.calcularTaxaEntregaPorEndereco === 'function') {
        try {
            const enderecoCompleto = `${endereco}, ${bairro}, Porto Alegre, RS`;
            const resultado = await window.calcularTaxaEntregaPorEndereco(enderecoCompleto);
            
            if (resultado && resultado.sucesso) {
                distanciaCalculada = resultado.distancia || 0;
                
                // Verificar se cupom tem limite de distância para frete grátis
                if (freteGratisAplicado && cupomAplicado.distanciaMaxFreteGratis) {
                    if (distanciaCalculada <= cupomAplicado.distanciaMaxFreteGratis) {
                        taxaEntrega = 0; // Frete grátis dentro da distância
                    } else {
                        taxaEntrega = resultado.taxa || 0; // Fora da distância, cobrar taxa normal
                    }
                } else if (freteGratisAplicado) {
                    taxaEntrega = 0; // Frete grátis sem limite de distância
                } else {
                    taxaEntrega = resultado.taxa || 0; // Taxa normal
                }
            } else {
                // Se a distância exceder o limite, RECUSAR o pedido
                if (resultado && resultado.distancia && resultado.distancia > 12) {
                    alert(resultado.mensagem || 'Endereço muito distante! Não realizamos entregas acima de 12km.');
                    return;
                }
                alert(resultado?.mensagem || 'Erro ao calcular distância. Verifique o endereço e tente novamente.');
                return;
            }
        } catch (error) {
            console.error('[MAIN] ❌ Erro ao calcular taxa:', error);
            alert('Erro ao calcular distância. Verifique o endereço e tente novamente.');
            return;
        }
    } else {
        alert('Erro: Sistema de cálculo de distância não disponível.');
        return;
    }
    
    // Aplicar frete grátis condicional
    if (freteGratisCondicional) {
        if (distanciaMaxFreteGratis !== null && distanciaCalculada > distanciaMaxFreteGratis) {
            // Fora da distância, cobrar taxa normal
        } else {
            taxaEntrega = 0; // Frete grátis
        }
    }
    
    const total = subtotal - desconto - descontoCondicional + taxaEntrega;
    
    // Forma de pagamento fixa: Mercado Pago

    // Preparar itens
    const itensParaPedido = itens.map(item => ({
        produtoId: item.produtoId,
        nome: item.nome,
        preco: parseFloat(item.preco) || 0,
        quantidade: parseInt(item.quantidade) || 0
    }));
    
    // Cliente não precisa estar logado - usar dados do formulário
    const clienteId = null;
    
    // Criar intenção de pagamento (PIX ou Cartão) - NÃO criar pedido antes do pagamento
    const enderecoCompleto = `${endereco}, Nº ${numeroCasa} - ${bairro} - CEP: ${cep}` + (referencia ? ` (Ref: ${referencia})` : '');

    const draft = {
        clienteNome: nome,
        clienteCPF: cpf,
        clienteTelefone: telefone,
        clienteEndereco: enderecoCompleto,
        itens: itensParaPedido,
        subtotal: subtotal,
        desconto: desconto + descontoCondicional,
        taxaEntrega: taxaEntrega,
        total: total,
        observacoes: observacoes,
        cupom: cupomAplicado ? cupomAplicado.codigo : null
    };

    if (formaPagamento === 'cartao') {
        // Cartão: redirecionar para o Mercado Pago Checkout Pro
        let prefResp = null;
        try {
            let slug = '';
            try {
                const parts = (window.location && window.location.pathname ? window.location.pathname.split('/') : []).filter(Boolean);
                slug = (parts && parts.length > 0) ? String(parts[0]) : '';
            } catch (e) {
                slug = '';
            }
            const resp = await fetch(window.location.origin + '/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: Number(total),
                    title: 'Pedido Vetera Sushi',
                    draft: { ...draft, lojaSlug: slug },
                    lojaSlug: slug
                })
            });
            const respText = await resp.text().catch(() => '');
            prefResp = (() => { try { return JSON.parse(respText || 'null'); } catch (e) { return null; } })();
            if (!resp.ok || !prefResp || !prefResp.ok || !prefResp.init_point) {
                const detalhes = prefResp && (prefResp.error || prefResp.message || prefResp.details)
                    ? (prefResp.error || prefResp.message || JSON.stringify(prefResp.details))
                    : (respText ? String(respText) : null);
                alert('Não foi possível iniciar o pagamento no cartão.' + (detalhes ? ('\n\nDetalhes: ' + String(detalhes).slice(0, 1200)) : ''));
                return;
            }
        } catch (e) {
            alert('Erro ao iniciar pagamento no cartão. Verifique sua conexão e tente novamente.');
            return;
        }

        // Salvar para acompanhar na volta
        try { localStorage.setItem('vetera_card_intent_pendente', String(prefResp.intentId || '')); } catch (e) {}

        // Fechar checkout e redirecionar
        try { fecharModal('modal-checkout'); } catch (e) {}
        try { window.location.href = String(prefResp.init_point); } catch (e) { window.location.assign(String(prefResp.init_point)); }
        return;
    }

    // Pix (padrão)
    // Limpar carrinho e fechar checkout antes de exibir o PIX
    try {
        if (typeof window.carrinho !== 'undefined') {
            window.carrinho.limpar();
        }
        localStorage.removeItem('vetera_carrinho');
        localStorage.removeItem('vetera_pedido_temporario');
    } catch (e) {}
    try { fecharModal('modal-checkout'); } catch (e) {}

    let intentResp = null;
    try {
        const resp = await fetch(window.location.origin + '/api/mercadopago/pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: Number(total),
                draft: draft,
                description: 'Pagamento PIX - Vetera Sushi'
            })
        });

        const respText = await resp.text().catch(() => '');
        intentResp = (() => {
            try { return JSON.parse(respText || 'null'); } catch (e) { return null; }
        })();

        if (!resp.ok || !intentResp || !intentResp.ok) {
            console.warn('[PIX] Falha ao criar intent PIX:', resp.status, intentResp, respText);
            const detalhes = intentResp && (intentResp.error || intentResp.message || intentResp.details || intentResp.raw)
                ? (intentResp.error || intentResp.message || JSON.stringify(intentResp.details || intentResp.raw))
                : (respText ? String(respText) : null);
            alert('Não foi possível iniciar o PIX.' + (detalhes ? ('\n\nDetalhes: ' + String(detalhes).slice(0, 1200)) : ''));
            return;
        }
    } catch (e) {
        console.warn('[PIX] Erro ao criar intent PIX:', e);
        alert('Erro ao iniciar PIX. Verifique sua conexão e tente novamente.');
        return;
    }

    try {
        await mostrarPixIntent({
            intentId: intentResp.intentId,
            qr_code: intentResp.qr_code,
            qr_code_base64: intentResp.qr_code_base64,
            amount: Number(total)
        });
    } catch (e) {
        console.warn('[PIX] Erro ao exibir modal PIX:', e);
    }
}

// Gerar código de cupom único e aleatório (alphanumérico)
function gerarCodigoCupomAleatorio() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = '';
    // Gerar 6 caracteres alfanuméricos
    for (let i = 0; i < 6; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
}

// Verificar se cupom já existe
function cupomJaExiste(codigo) {
    if (!db || !db.data || !db.data.cupons) return false;
    const codigoUpper = codigo.toUpperCase();
    return db.data.cupons.some(c => (c.codigo || '').toUpperCase() === codigoUpper);
}

// Mostrar página de desconto após pedido
async function mostrarPaginaDesconto(pedido) {
    // Gerar cupom único (alphanumérico de 6 caracteres)
    let cupomCodigo = gerarCodigoCupomAleatorio();
    let tentativas = 0;
    const maxTentativas = 10;
    
    // Garantir que o código é único
    while (cupomJaExiste(cupomCodigo) && tentativas < maxTentativas) {
        cupomCodigo = gerarCodigoCupomAleatorio();
        tentativas++;
    }
    
    // Se ainda não for único após tentativas, adicionar timestamp
    if (cupomJaExiste(cupomCodigo)) {
        cupomCodigo = gerarCodigoCupomAleatorio() + Date.now().toString().slice(-4);
    }
    
    // Calcular data de validade (30 dias a partir de hoje)
    const dataValidade = new Date();
    dataValidade.setDate(dataValidade.getDate() + 30);
    const dataValidadeStr = dataValidade.toISOString().split('T')[0]; // Formato YYYY-MM-DD
    
    // Criar cupom no banco de dados
    try {
        const cupom = {
            id: Date.now(),
            codigo: cupomCodigo.toUpperCase(),
            tipo: 'percentual',
            valor: 5,
            valorMinimo: 0,
            limiteUsos: 1, // Campo correto para limite de usos
            usosAtuais: 0,
            usosMaximos: 1, // Mantido para compatibilidade
            ativo: true,
            validade: dataValidadeStr, // Formato de data para validade
            dataValidade: dataValidade.toISOString(), // Também salvar em formato ISO
            descricao: 'Cupom de desconto ganho após pedido - 5% OFF',
            freteGratis: false,
            distanciaMaxFreteGratis: null
        };
        
        console.log('[MAIN] Criando cupom:', cupom);
        
        // Salvar cupom no banco (local e servidor)
        const cupomSalvo = await db.salvarCupom(cupom);
        
        console.log('[MAIN] Cupom salvo:', cupomSalvo);
        
        // Verificar se foi salvo corretamente
        const cupomVerificado = db.getCupom(cupomCodigo);
        if (!cupomVerificado) {
            console.warn('[MAIN] Aviso: Cupom não encontrado após salvar');
        }
        
        // Mostrar modal de desconto
        const modal = document.getElementById('modal-desconto');
        const codigoElement = document.getElementById('cupom-codigo');
        if (modal && codigoElement) {
            codigoElement.textContent = cupomCodigo.toUpperCase();
            modal.classList.add('active');
        } else {
            console.error('[MAIN] Modal de desconto não encontrado');
        }
    } catch (error) {
        console.error('[MAIN] Erro ao criar cupom:', error);
        // Mostrar mensagem de sucesso mesmo com erro no cupom
        alert('Pedido feito com sucesso! Qualquer coisa o administrador entrará em contato com você pelo seu número de telefone.');
    }
}

// Copiar cupom para área de transferência
function copiarCupom() {
    const codigoElement = document.getElementById('cupom-codigo');
    if (codigoElement) {
        const codigo = codigoElement.textContent.trim();
        navigator.clipboard.writeText(codigo).then(() => {
            alert('Cupom copiado! Use-o no próximo pedido.');
        }).catch(() => {
            // Fallback para navegadores antigos
            const textarea = document.createElement('textarea');
            textarea.value = codigo;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Cupom copiado! Use-o no próximo pedido.');
        });
    }
}
window.copiarCupom = copiarCupom;

// Mostrar popup de loja fechada
function mostrarPopupLojaFechada(mensagem) {
    const modal = document.getElementById('modal-loja-fechada');
    const mensagemEl = document.getElementById('modal-loja-fechada-mensagem');
    if (modal && mensagemEl) {
        mensagemEl.textContent = mensagem || 'A loja está fechada no momento. Tente novamente mais tarde.';
        modal.classList.add('active');
    } else {
        // Fallback: alert
        alert(mensagem || 'A loja está fechada no momento. Tente novamente mais tarde.');
    }
}
window.mostrarPopupLojaFechada = mostrarPopupLojaFechada;

// Mostrar QR Code PIX
function mostrarQRCodePix(pedido) {
    // Compatibilidade: fluxo antigo não é mais usado. Mantido para não quebrar chamadas antigas.
    try {
        console.warn('[PIX] Fluxo antigo de PIX foi substituído por PIX Mercado Pago (Payment Intent).');
    } catch (e) {}
}

async function mostrarPixIntent(intent) {
    const modal = document.getElementById('modal-pix');
    const container = document.getElementById('pix-container');
    if (!modal || !container) return;

    const intentId = String(intent && intent.intentId ? intent.intentId : '').trim();
    if (!intentId) {
        alert('Erro ao iniciar pagamento PIX.');
        return;
    }

    const qrBase64 = String(intent && intent.qr_code_base64 ? intent.qr_code_base64 : '').trim();
    const qrCode = String(intent && intent.qr_code ? intent.qr_code : '').trim();
    const amount = Number(intent && intent.amount != null ? intent.amount : NaN);

    const qrImg = qrBase64 ? ('data:image/png;base64,' + qrBase64) : (qrCode ? (pixPayment.gerarQRCode(qrCode, Number.isFinite(amount) ? amount : 0).qrCodeUrl) : '');
    const codigo = qrCode;

    const codigoEsc = typeof escapeHTML !== 'undefined' ? escapeHTML(codigo) : String(codigo || '').replace(/[<>'"]/g, '');
    const codigoClipboard = codigoEsc.replace(/'/g, "\\'").replace(/\"/g, '\\"');

    container.innerHTML = `
      <div class="pix-container" style="text-align: center; padding: 2rem;">
        <h3 style="color: var(--vermelho-claro); margin-bottom: 1.5rem;">Pagamento via PIX</h3>

        ${qrImg ? `
          <div style="background: white; padding: 1.5rem; border-radius: 10px; display: inline-block; margin-bottom: 1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
            <img src="${qrImg}" alt="QR Code PIX" style="max-width: 300px; width: 100%;">
          </div>
        ` : ''}

        <div style="background: var(--cinza-medio); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
          <p style="color: var(--texto-medio); margin-bottom: 0.5rem;">Status:</p>
          <p id="pix-status-text" style="font-size: 1.1rem; font-weight: 700; color: var(--aviso); margin: 0;">Aguardando pagamento</p>
        </div>

        <div style="background: var(--cinza-medio); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; text-align:left;">
          <p style="color: var(--texto-medio); margin-bottom: 0.5rem; font-size: 0.9rem;">PIX copia e cola:</p>
          <div style="background: rgba(0,0,0,0.35); border: 1px solid var(--borda); border-radius: 8px; padding: 10px; color: #fff; word-break: break-all; font-size: 0.85rem;">${codigoEsc || '---'}</div>
          <button
            onclick="copyTextSafe('${codigoClipboard}')"
            style="margin-top: 0.75rem; padding: 0.6rem 1rem; background: var(--vermelho-claro); color: white; border: none; border-radius: 8px; cursor: pointer;">
            Copiar código PIX
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    modal.classList.add('active');

    // Polling até aprovado (fallback caso webhook demore)
    try {
        localStorage.setItem('vetera_pix_intent_pendente', JSON.stringify({ intentId, createdAt: Date.now() }));
    } catch (e) {}

    const startedAt = Date.now();
    const timeoutMs = 120000;
    const intervalMs = 2500;

    while (Date.now() - startedAt < timeoutMs) {
        let data = null;
        try {
            const resp = await fetch(window.location.origin + '/api/mercadopago/webhook?intentId=' + encodeURIComponent(intentId));
            data = resp.ok ? await resp.json().catch(() => null) : null;
        } catch (e) {
            data = null;
        }

        const status = String(data && data.status ? data.status : '').toLowerCase();
        const orderId = data && (data.orderId || data.pedidoId) ? data.orderId || data.pedidoId : null;

        const statusEl = document.getElementById('pix-status-text');
        if (statusEl) {
            if (status === 'approved') statusEl.textContent = 'Pagamento aprovado';
            else if (status === 'rejected' || status === 'cancelled') statusEl.textContent = 'Pagamento recusado';
            else statusEl.textContent = 'Aguardando pagamento';
        }

        if (status === 'approved' && orderId) {
            try { localStorage.removeItem('vetera_pix_intent_pendente'); } catch (e) {}
            try {
                adicionarPedidoIdClienteLocal(orderId);
            } catch (e) {}
            try {
                if (typeof db !== 'undefined' && typeof db.carregarPedidosServidor === 'function') {
                    await db.carregarPedidosServidor();
                }
            } catch (e) {}
            try {
                container.innerHTML = `
                  <div class="pix-container" style="text-align: center; padding: 2rem;">
                    <h3 style="color: var(--sucesso); margin-bottom: 1rem;">Pagamento finalizado</h3>
                    <div style="background: var(--cinza-medio); padding: 1.25rem; border-radius: 10px; margin: 0 auto; max-width: 520px;">
                      <p style="margin: 0; color: var(--texto-claro); font-weight: 700; font-size: 1.05rem;">PIX aprovado com sucesso.</p>
                      <p style="margin: 10px 0 0; color: var(--texto-medio);">Seu pedido foi registrado e já está em andamento.</p>
                      <p style="margin: 10px 0 0; color: var(--texto-medio); font-size: 0.9rem;">Pedido #<strong style="color:#fff;">${String(orderId)}</strong></p>
                    </div>
                  </div>
                `;
            } catch (e) {}
            try {
                const statusEl2 = document.getElementById('pix-status-text');
                if (statusEl2) {
                    statusEl2.textContent = 'Pagamento aprovado';
                    statusEl2.style.color = 'var(--sucesso)';
                }
            } catch (e) {}
            try {
                setTimeout(() => {
                    try { fecharModal('modal-pix'); } catch (e2) {}
                }, 1500);
            } catch (e) {}
            try {
                mostrarNotificacaoInApp('Pagamento', 'Pagamento aprovado! Seu pedido já está em andamento.', '✅');
            } catch (e) {}
            return;
        }

        await new Promise(r => setTimeout(r, intervalMs));
    }
}

// Fechar modal PIX
function fecharModalPix() {
    const modal = document.getElementById('modal-pix');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Tornar funções globais
window.abrirCheckoutModal = abrirCheckoutModal;
window.processarPedidoCheckout = processarPedidoCheckout;
window.atualizarTotaisCheckout = atualizarTotaisCheckout;
window.mostrarQRCodePix = mostrarQRCodePix;
window.fecharModalPix = fecharModalPix;

// Abrir modal de login/registro de cliente
function abrirModalLoginCliente() {
    const modal = document.getElementById('modal-cliente-auth');
    if (modal) {
        // Resetar para modo login
        if (typeof window.alternarModoCliente === 'function') {
            window.alternarModoCliente('login');
        }
        modal.classList.add('active');
    }
}

// Fechar modal de cliente
function fecharModalCliente() {
    const modal = document.getElementById('modal-cliente-auth');
    const mensagem = document.getElementById('cliente-mensagem');
    if (modal) modal.classList.remove('active');
    if (mensagem) mensagem.textContent = '';
}

// Tornar funções globais
window.abrirModalLoginCliente = abrirModalLoginCliente;
window.fecharModalCliente = fecharModalCliente;

// Alternar entre login e registro
// Função já está no script inline do HTML

// Fazer login/registro de cliente
async function processarClienteAuth(event) {
    event.preventDefault();
    const container = document.getElementById('cliente-auth-container');
    if (!container) {
        console.error('Container de autenticação não encontrado');
        return;
    }
    
    const modo = container.dataset.modo;
    const mensagemEl = modo === 'registro' 
        ? document.getElementById('cliente-mensagem-registro') 
        : document.getElementById('cliente-mensagem');

    if (modo === 'login') {
        const telefone = document.getElementById('cliente-telefone-login').value.trim();
        const senha = document.getElementById('cliente-senha-login').value;

        if (!telefone || !senha) {
            mensagemEl.textContent = 'Preencha todos os campos!';
            mensagemEl.style.color = 'var(--vermelho-claro)';
            return;
        }

        if (typeof window.clienteAuth === 'undefined') {
            mensagemEl.textContent = 'Sistema de autenticação não carregado!';
            mensagemEl.style.color = 'var(--vermelho-claro)';
            return;
        }

        const result = await window.clienteAuth.login(telefone, senha);
        if (result.success) {
            mensagemEl.textContent = 'Login realizado com sucesso!';
            mensagemEl.style.color = 'var(--sucesso)';
            
            // Atualizar menu imediatamente
            if (typeof window.atualizarMenuCliente === 'function') {
                window.atualizarMenuCliente();
            }
            
            setTimeout(() => {
                if (typeof window.fecharModalCliente === 'function') {
                    window.fecharModalCliente();
                }
                location.reload();
            }, 1000);
        } else {
            mensagemEl.textContent = result.message || 'Erro ao fazer login';
            mensagemEl.style.color = 'var(--vermelho-claro)';
            console.error('[MAIN] ❌ Erro no login:', result.message);
        }
    } else {
        const nome = document.getElementById('cliente-nome-registro').value.trim();
        const telefone = document.getElementById('cliente-telefone-registro').value.trim();
        const email = document.getElementById('cliente-email-registro').value.trim();
        const senha = document.getElementById('cliente-senha-registro').value;
        const endereco = document.getElementById('cliente-endereco-registro').value.trim();
        const bairro = document.getElementById('cliente-bairro-registro')?.value.trim() || '';
        const cep = document.getElementById('cliente-cep-registro')?.value.trim() || '';

        if (!nome || !telefone || !senha || !endereco || !bairro || !cep) {
            mensagemEl.textContent = 'Preencha todos os campos obrigatórios!';
            mensagemEl.style.color = 'var(--vermelho-claro)';
            return;
        }

        if (typeof window.clienteAuth === 'undefined') {
            mensagemEl.textContent = 'Sistema de autenticação não carregado!';
            mensagemEl.style.color = 'var(--vermelho-claro)';
            return;
        }

        // Registrar é async agora
        mensagemEl.textContent = 'Criando conta...';
        mensagemEl.style.color = 'var(--texto-medio)';
        
        
        window.clienteAuth.registrar(nome, telefone, email, senha, endereco, bairro, cep)
            .then(result => {
                console.log('[MAIN] Resultado do registro:', result);
                if (result && result.success) {
                    mensagemEl.textContent = 'Conta criada e login realizado!';
                    mensagemEl.style.color = 'var(--sucesso)';
                    
                    // Atualizar menu imediatamente para mostrar "Olá, Nome"
                    if (typeof window.atualizarMenuCliente === 'function') {
                        window.atualizarMenuCliente();
                    }
                    
                    setTimeout(() => {
                        if (typeof window.fecharModalCliente === 'function') {
                            window.fecharModalCliente();
                        }
                        location.reload();
                    }, 1500);
                } else {
                    const mensagem = result ? (result.message || 'Erro ao criar conta') : 'Erro desconhecido ao criar conta';
                    const erroDetalhado = result?.erro ? ` | Erro: ${result.erro}` : '';
                    mensagemEl.textContent = mensagem;
                    mensagemEl.style.color = 'var(--vermelho-claro)';
                    console.error('[MAIN] ❌ Erro no registro:', mensagem, erroDetalhado);
                    if (result?.erro) {
                        console.error('[MAIN] ❌ Detalhes do erro:', result.erro);
                    }
                }
            })
            .catch(error => {
                console.error('[MAIN] ❌ Exceção ao registrar:', error);
                console.error('[MAIN] ❌ Stack trace:', error.stack);
                console.error('[MAIN] ❌ Detalhes:', {
                    nome: error.name,
                    mensagem: error.message,
                    erro: error
                });
                mensagemEl.textContent = `Erro ao criar conta: ${error.message || 'Erro desconhecido'}`;
                mensagemEl.style.color = 'var(--vermelho-claro)';
            });
    }
}

// Tornar função global
window.processarClienteAuth = processarClienteAuth;

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ============================================
// SISTEMA DE REGRAS CONDICIONAIS (para checkout)
// ============================================

// ============================================
// SISTEMA DE HORÁRIOS (para checkout)
// ============================================

// Inicializar horários no banco de dados se não existir ou se estiver malformado
function inicializarHorarios() {
    if (!db) db = { data: {} };
    if (!db.data) db.data = {};

    let h = db.data.horarios;
    // Migrar arrays legados para o primeiro elemento
    if (Array.isArray(h)) {
        if (h.length > 0) {
            db.data.horarios = h[0];
            h = db.data.horarios;
        } else {
            db.data.horarios = null;
            h = null;
        }
    }

    if (!h || typeof h !== 'object' || !h.dias || typeof h.dias !== 'object') {
        db.data.horarios = {
            ativo: true,
            fuso: 'America/Sao_Paulo',
            statusManual: null,
            dias: {
                domingo: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                segunda: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                terca: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                quarta: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                quinta: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                sexta: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                sabado: { aberto: true, abertura: '18:30', fechamento: '23:30' }
            }
        };
        db.saveData();
        return;
    }

    const diasPadrao = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
    diasPadrao.forEach(d => {
        if (!db.data.horarios.dias[d] || typeof db.data.horarios.dias[d] !== 'object') {
            db.data.horarios.dias[d] = { aberto: true, abertura: '18:30', fechamento: '23:30' };
        } else {
            const cd = db.data.horarios.dias[d];
            if (typeof cd.aberto !== 'boolean') cd.aberto = true;
            if (!cd.abertura) cd.abertura = '18:30';
            if (!cd.fechamento) cd.fechamento = '23:30';
        }
    });
    db.saveData();
}

// Carregar horários do servidor (versão para main.js)
async function carregarHorariosDoServidorMain() {
    try {
        const response = await fetch(window.location.origin + '/api/horarios');
        if (response.ok) {
            let horarios = await response.json();
            // Se o servidor retornar uma lista, usar o primeiro elemento
            if (Array.isArray(horarios)) {
                horarios = horarios.length > 0 ? horarios[0] : null;
            }
            if (horarios) {
                if (!db || !db.data) return false;
                // Garantir que a estrutura mínima exista
                if (!horarios.dias || typeof horarios.dias !== 'object') {
                    horarios.dias = {
                        domingo: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                        segunda: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                        terca: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                        quarta: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                        quinta: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                        sexta: { aberto: true, abertura: '18:30', fechamento: '23:30' },
                        sabado: { aberto: true, abertura: '18:30', fechamento: '23:30' }
                    };
                }
                db.data.horarios = horarios;
                db.saveData();
                console.log('[HORARIOS] ✅ Horários carregados do servidor');
                return true;
            }
        } else if (response.status === 503) {
            // Service Unavailable - usar dados locais
            console.warn('[HORARIOS] ⚠️ Servidor indisponível (503), usando dados locais');
            if (db && db.data && db.data.horarios) {
                return true;
            }
        }
    } catch (e) {
        console.warn('[HORARIOS] ⚠️ Erro ao carregar do servidor:', e);
        // Em caso de erro, usar dados locais se disponíveis
        if (db && db.data && db.data.horarios) {
            return true;
        }
    }
    return false;
}

// Verificar se a loja está aberta (versão para main.js)
window.verificarStatusLoja = function() {
    if (!db || !db.data) {
        // Se não tiver db, assumir que está aberta
        return { aberta: true, mensagem: 'Loja aberta' };
    }
    
    inicializarHorarios();
    const horarios = db.data.horarios;
    
    // Verificar status manual primeiro (tem prioridade)
    if (horarios.statusManual !== null && horarios.statusManual !== undefined) {
        if (horarios.statusManual) {
            return {
                aberta: true,
                mensagem: 'Loja aberta',
                proximoFechamento: null,
                statusManual: true
            };
        } else {
            return {
                aberta: false,
                mensagem: 'No momento estamos fechados. Aguarde abertura.',
                proximoFechamento: null,
                statusManual: false
            };
        }
    }
    
    // Se sistema de horários estiver desativado, loja sempre aberta
    if (horarios.ativo === false) {
        return {
            aberta: true,
            mensagem: 'Loja sempre aberta',
            proximoFechamento: null
        };
    }
    
    // Obter data/hora atual no fuso horário configurado
    const agora = new Date();
    const fuso = horarios.fuso || 'America/Sao_Paulo';
    
    // Converter para o fuso horário configurado
    const dataLocal = new Date(agora.toLocaleString('en-US', { timeZone: fuso }));
    
    const diaSemana = dataLocal.getDay(); // 0 = domingo, 6 = sábado
    const horaAtual = dataLocal.getHours();
    const minutoAtual = dataLocal.getMinutes();
    const horaAtualMinutos = horaAtual * 60 + minutoAtual;
    
    // Mapear dia da semana para chave
    const diasMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaAtual = diasMap[diaSemana];
    const configDia = horarios.dias[diaAtual];
    
    if (!configDia || !configDia.aberto) {
        // Loja fechada hoje, encontrar próximo dia aberto
        let proximoDiaAberto = null;
        let proximaAbertura = null;
        
        for (let i = 1; i <= 7; i++) {
            const proximoDiaIndex = (diaSemana + i) % 7;
            const proximoDia = diasMap[proximoDiaIndex];
            const configProximo = horarios.dias[proximoDia];
            
            if (configProximo && configProximo.aberto) {
                proximoDiaAberto = proximoDia;
                proximaAbertura = configProximo.abertura;
                break;
            }
        }
        
        const nomesDias = {
            domingo: 'Domingo',
            segunda: 'Segunda-feira',
            terca: 'Terça-feira',
            quarta: 'Quarta-feira',
            quinta: 'Quinta-feira',
            sexta: 'Sexta-feira',
            sabado: 'Sábado'
        };
        
        return {
            aberta: false,
            mensagem: proximaAbertura 
                ? `Abrimos novamente ${nomesDias[proximoDiaAberto]} às ${proximaAbertura}`
                : 'Loja fechada hoje',
            proximoFechamento: null,
            proximaAbertura: proximaAbertura,
            proximoDia: proximoDiaAberto
        };
    }
    
    // Converter horários de abertura e fechamento para minutos
    const [horaAbertura, minutoAbertura] = configDia.abertura.split(':').map(Number);
    const [horaFechamento, minutoFechamento] = configDia.fechamento.split(':').map(Number);
    const aberturaMinutos = horaAbertura * 60 + minutoAbertura;
    const fechamentoMinutos = horaFechamento * 60 + minutoFechamento;
    
    // Verificar se está dentro do horário
    if (horaAtualMinutos >= aberturaMinutos && horaAtualMinutos < fechamentoMinutos) {
        return {
            aberta: true,
            mensagem: 'Loja aberta',
            proximoFechamento: configDia.fechamento
        };
    } else if (horaAtualMinutos < aberturaMinutos) {
        // Ainda não abriu hoje
        return {
            aberta: false,
            mensagem: `Abrimos hoje às ${configDia.abertura}`,
            proximoFechamento: null,
            proximaAbertura: configDia.abertura
        };
    } else {
        // Já fechou hoje, encontrar próximo dia aberto
        let proximoDiaAberto = null;
        let proximaAbertura = null;
        
        for (let i = 1; i <= 7; i++) {
            const proximoDiaIndex = (diaSemana + i) % 7;
            const proximoDia = diasMap[proximoDiaIndex];
            const configProximo = horarios.dias[proximoDia];
            
            if (configProximo && configProximo.aberto) {
                proximoDiaAberto = proximoDia;
                proximaAbertura = configProximo.abertura;
                break;
            }
        }
        
        const nomesDias = {
            domingo: 'Domingo',
            segunda: 'Segunda-feira',
            terca: 'Terça-feira',
            quarta: 'Quarta-feira',
            quinta: 'Quinta-feira',
            sexta: 'Sexta-feira',
            sabado: 'Sábado'
        };
        
        return {
            aberta: false,
            mensagem: proximaAbertura 
                ? `Abrimos novamente ${nomesDias[proximoDiaAberto]} às ${proximaAbertura}`
                : 'Loja fechada',
            proximoFechamento: null,
            proximaAbertura: proximaAbertura,
            proximoDia: proximoDiaAberto
        };
    }
};

// Obter condicionais do banco de dados
function getCondicionais() {
    if (!db || !db.data) return [];
    if (!db.data.condicionais) {
        db.data.condicionais = [];
        db.saveData();
    }
    return db.data.condicionais || [];
}

// Obter condicionais ativas ordenadas por prioridade
function getCondicionaisAtivas() {
    return getCondicionais()
        .filter(c => c.ativo !== false)
        .sort((a, b) => (a.prioridade || 999) - (b.prioridade || 999));
}

// Aplicar regras condicionais (usado no checkout)
window.aplicarRegrasCondicionais = function(contexto) {
    const { formaPagamento, subtotal, quantidadeItens } = contexto;
    
    let descontoTotal = 0;
    let freteGratis = false;
    let distanciaMaxFreteGratis = null;
    
    const regrasAtivas = getCondicionaisAtivas();
    
    for (const regra of regrasAtivas) {
        // Verificar condições
        let condicoesAtendidas = true;
        
        if (regra.pagamento && regra.pagamento !== formaPagamento) {
            condicoesAtendidas = false;
        }
        
        if (regra.valorMinimo && subtotal < regra.valorMinimo) {
            condicoesAtendidas = false;
        }
        
        if (regra.quantidadeMinima && quantidadeItens < regra.quantidadeMinima) {
            condicoesAtendidas = false;
        }
        
        // Se todas as condições foram atendidas, aplicar ação
        if (condicoesAtendidas) {
            if (regra.acaoTipo === 'desconto_percentual' && regra.acaoValor) {
                descontoTotal += subtotal * (regra.acaoValor / 100);
            } else if (regra.acaoTipo === 'desconto_fixo' && regra.acaoValor) {
                descontoTotal += regra.acaoValor;
            } else if (regra.acaoTipo === 'frete_gratis') {
                freteGratis = true;
                if (regra.distanciaMaxFreteGratis) {
                    distanciaMaxFreteGratis = regra.distanciaMaxFreteGratis;
                }
            } else if (regra.acaoTipo === 'desconto_percentual_frete_gratis' && regra.acaoValor) {
                descontoTotal += subtotal * (regra.acaoValor / 100);
                freteGratis = true;
                if (regra.distanciaMaxFreteGratis) {
                    distanciaMaxFreteGratis = regra.distanciaMaxFreteGratis;
                }
            }
        }
    }
    
    return {
        desconto: descontoTotal,
        freteGratis: freteGratis,
        distanciaMaxFreteGratis: distanciaMaxFreteGratis
    };
};

// ============================================
// VALIDAÇÕES DE TELEFONE E CEP
// ============================================

// Validar formato de telefone brasileiro
function validarTelefone(telefone) {
    if (!telefone) return false;
    
    // Remover caracteres não numéricos
    const numeros = telefone.replace(/\D/g, '');
    
    // Verificar se tem 10 ou 11 dígitos (com DDD)
    if (numeros.length < 10 || numeros.length > 11) return false;
    
    // Verificar se começa com DDD válido (11-99)
    const ddd = parseInt(numeros.substring(0, 2));
    if (ddd < 11 || ddd > 99) return false;
    
    // Verificar se não é um número genérico/falso comum
    const numero = numeros.substring(2);
    
    // Rejeitar números com todos os dígitos iguais (ex: 1111111111)
    if (/^(\d)\1+$/.test(numero)) return false;
    
    // Rejeitar números sequenciais (ex: 1234567890)
    if (/^(0123456789|9876543210)$/.test(numero)) return false;
    
    // Verificar formato básico: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    const formatoCompleto = /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(telefone);
    const formatoSimples = /^\d{10,11}$/.test(numeros);
    
    return formatoCompleto || formatoSimples;
}

// Validar formato de CEP brasileiro
function validarCEP(cep) {
    if (!cep) return false;
    
    // Remover caracteres não numéricos
    const numeros = cep.replace(/\D/g, '');
    
    // CEP deve ter 8 dígitos
    if (numeros.length !== 8) return false;
    
    // Verificar formato: 00000-000 ou 00000000
    const formatoCompleto = /^\d{5}-?\d{3}$/.test(cep);
    const formatoSimples = /^\d{8}$/.test(numeros);
    
    // Rejeitar CEPs genéricos/falsos comuns
    // CEPs inválidos: 00000000, 11111111, 12345678, etc.
    if (/^(\d)\1+$/.test(numeros)) return false; // Todos iguais
    if (numeros === '12345678') return false; // Sequencial
    
    return formatoCompleto || formatoSimples;
}

// ==============================
// DESTAQUES (Combos natalinos)
// ==============================

async function fetchDestaques() {
    try {
        const resp = await fetch(window.location.origin + '/api/destaques');
        if (!resp.ok) {
            db.data = db.data || {};
            db.data.destaques = [];
            db.saveData();
            // Garantir que a renderização dos produtos seja atualizada caso tenha mudado
            try { renderizarProdutos(); } catch(e) {}
            return renderizarDestaques([]);
        }
        const dados = await resp.json();
        // Normalizar resposta para garantir que `destaques` seja um array
        function normalizeDestaquesPayload(d) {
            if (Array.isArray(d)) return d;
            if (!d) return [];
            if (typeof d === 'object') {
                if (Array.isArray(d.destaques)) return d.destaques;
                if (Array.isArray(d.docs)) return d.docs;
                if (d.success && typeof d.total === 'number') return [];
                if (d.produtos) return [d];
                const vals = Object.values(d).filter(v => v && (v.produtos || v.nome || v.id));
                if (vals.length > 0) return vals;
            }
            return [];
        }
        const destaquesNorm = normalizeDestaquesPayload(dados);
        // Persistir destaques no db para uso pelo renderizador de produtos
        db.data = db.data || {};
        db.data.destaques = destaquesNorm;
        db.saveData();
        // Aplicar ordem para produtos em destaque (persistir somente se necessário)
        try { aplicarOrdemDestaque(); } catch(e) { console.warn('[DESTAQUE] Erro ao aplicar ordem:', e); }
        // Atualizar produtos para refletir badges
        try { renderizarProdutos(); } catch(e) {}
        return renderizarDestaques(destaquesNorm);
    } catch (err) {
        console.error('[DESTAQUES] ❌', err);
        db.data = db.data || {};
        db.data.destaques = [];
        db.saveData();
        try { renderizarProdutos(); } catch(e) {}
        return renderizarDestaques([]);
    }
} 

function renderizarDestaques(destaques) {
    const container = document.getElementById('destaque-top');
    if (!container) return;

    // Não mostramos mais o banner separado — destaques serão exibidos inline com badge "DESTAQUE"
    container.style.display = 'none';
    return;
}

// Aplicar ordem dos produtos com destaque ativo (coloca-os no topo como ordens 0..n-1) e persiste se necessário
function aplicarOrdemDestaque() {
    try {
        if (!db || !db.data) return;
        const destaquesRaw = db.data.destaques;
        const destaques = Array.isArray(destaquesRaw) ? destaquesRaw : (destaquesRaw && typeof destaquesRaw === 'object' ? (Array.isArray(destaquesRaw.destaques) ? destaquesRaw.destaques : (destaquesRaw.produtos ? [destaquesRaw] : Object.values(destaquesRaw))) : []);
        const ativo = (destaques || []).find(d => d.ativo) || (destaques && destaques[0]);
        if (!ativo || !Array.isArray(ativo.produtos) || ativo.produtos.length === 0) return;

        const produtos = Array.isArray(db.data.produtos) ? db.data.produtos.slice() : [];
        // Mapar produtos destacados na ordem definida no destaque
        const destaqueIds = ativo.produtos.map(id => parseInt(id)).filter(id => !isNaN(id));
        const featured = destaqueIds.map(id => produtos.find(p => p.id === id)).filter(Boolean);
        if (featured.length === 0) return;

        const featuredSet = new Set(featured.map(p => p.id));
        const others = produtos.filter(p => !featuredSet.has(p.id)).sort((a, b) => {
            const ao = (typeof a.ordem === 'number') ? a.ordem : 0;
            const bo = (typeof b.ordem === 'number') ? b.ordem : 0;
            return ao - bo;
        });

        const novoArray = featured.concat(others);

        // Verificar se ordens precisam ser atualizadas
        let precisaAtualizar = false;
        for (let i = 0; i < novoArray.length; i++) {
            if (novoArray[i].ordem !== i) {
                precisaAtualizar = true;
                novoArray[i].ordem = i;
            }
        }

        if (!precisaAtualizar) return; // nada a fazer

        // Aplicar atualização local e salvar
        db.data.produtos = novoArray;
        db.saveData();

        // Persistir no servidor (substitui coleção)
        fetch(window.location.origin + '/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db.data.produtos || [])
        }).then(resp => {
            if (!resp.ok) console.warn('[DESTAQUE] Não foi possível atualizar ordem no servidor');
            else console.log('[DESTAQUE] Ordem dos produtos atualizada no servidor');
        }).catch(e => console.warn('[DESTAQUE] Erro ao persistir ordem:', e));

    } catch (err) {
        console.warn('[DESTAQUE] aplicarOrdemDestaque falhou:', err);
    }
}

// Verificar se CEP existe via API ViaCEP
async function verificarCEPExistente(cep) {
    try {
        // Limpar CEP (apenas números)
        const cepLimpo = cep.replace(/\D/g, '');
        
        if (cepLimpo.length !== 8) return false;
        
        // Consultar ViaCEP
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        
        if (!response.ok) {
            // Se a API falhar, aceitar o CEP se o formato estiver correto
            return validarCEP(cep);
        }
        
        const data = await response.json();
        
        // Se retornar erro, CEP não existe
        if (data.erro) {
            return false;
        }
        
        // Se retornar dados válidos, CEP existe
        return data.cep && data.cep.replace(/\D/g, '') === cepLimpo;
    } catch (error) {
        console.warn('[CHECKOUT] Erro ao verificar CEP:', error);
        // Se a API falhar, aceitar o CEP se o formato estiver correto
        return validarCEP(cep);
    }
}

// Mostrar erro no campo do checkout
function mostrarErroCheckout(campoId, mensagem) {
    const campo = document.getElementById(campoId);
    if (!campo) return;
    
    // Remover erros anteriores
    const erroAnterior = campo.parentElement.querySelector('.erro-checkout');
    if (erroAnterior) erroAnterior.remove();
    
    // Adicionar estilo de erro
    campo.style.borderColor = 'var(--erro)';
    campo.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
    
    // Criar mensagem de erro
    const erroDiv = document.createElement('div');
    erroDiv.className = 'erro-checkout';
    erroDiv.style.cssText = 'color: var(--erro); font-size: 0.85rem; margin-top: 5px; display: flex; align-items: center; gap: 5px;';
    erroDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${mensagem}`;
    
    campo.parentElement.appendChild(erroDiv);
    
    // Focar no campo com erro
    campo.focus();
    
    // Remover estilo de erro após 5 segundos ou quando o usuário começar a digitar
    const removerErro = () => {
        campo.style.borderColor = '';
        campo.style.boxShadow = '';
        if (erroDiv.parentElement) {
            erroDiv.remove();
        }
    };
    
    campo.addEventListener('input', removerErro, { once: true });
    setTimeout(removerErro, 5000);
}

// Adicionar máscara de telefone
function aplicarMascaraTelefone(input) {
    input.addEventListener('input', function(e) {
        let valor = e.target.value.replace(/\D/g, '');
        
        if (valor.length <= 11) {
            if (valor.length <= 2) {
                valor = valor.replace(/(\d{2})/, '($1) ');
            } else if (valor.length <= 7) {
                valor = valor.replace(/(\d{2})(\d{4})/, '($1) $2-');
            } else {
                valor = valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
            }
        }
        
        e.target.value = valor;
    });
}

// Adicionar máscara de CEP
function aplicarMascaraCEP(input) {
    input.addEventListener('input', function(e) {
        let valor = e.target.value.replace(/\D/g, '');
        
        if (valor.length <= 8) {
            valor = valor.replace(/(\d{5})(\d{3})/, '$1-$2');
        }
        
        e.target.value = valor;
    });
}

async function carregarPedidosClienteServidor() {
    try {
        const ids = (typeof getPedidoIdsClienteLocal === 'function') ? (getPedidoIdsClienteLocal() || []) : [];
        const idsLimpos = (ids || []).map(v => String(v)).filter(Boolean);
        const qs = idsLimpos.length > 0 ? ('?ids=' + encodeURIComponent(idsLimpos.join(','))) : '';
        const resp = await fetch(window.location.origin + '/api/pedidos' + qs);
        if (!resp.ok) return null;
        const pedidos = await resp.json();
        if (!Array.isArray(pedidos)) return null;
        return pedidos;
    } catch (e) {
        return null;
    }
}

function abrirModalMeusPedidos() {
    const modal = document.getElementById('modal-meus-pedidos');
    if (!modal) return;
    modal.classList.add('active');
    renderizarMeusPedidos();
}

function fecharModalMeusPedidos() {
    const modal = document.getElementById('modal-meus-pedidos');
    if (modal) modal.classList.remove('active');
}

function formatarStatusPedidoCliente(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'concluido') return 'Concluído';
    if (s === 'finalizado') return 'Concluído';
    if (s === 'cancelado') return 'Cancelado';
    if (s === 'recusado') return 'Recusado';
    if (s === 'em_preparo') return 'Em preparo';
    if (s === 'aguardando_aprovacao') return 'Aguardando aprovação';
    return status || 'Pendente';
}

async function renderizarMeusPedidos() {
    const container = document.getElementById('meus-pedidos-lista');
    if (!container) return;

    const telefone = getTelefoneClienteAtual();
    const meusIds = getPedidoIdsClienteLocal();
    if ((!telefone || !normalizarTelefone(telefone)) && meusIds.length === 0) {
        container.innerHTML = '<div style="color: var(--texto-medio); text-align:center; padding: 1.5rem;">Faça um pedido para aparecer aqui.</div>';
        return;
    }

    container.innerHTML = '<div style="color: var(--texto-medio); text-align:center; padding: 1.5rem;">Carregando...</div>';

    // Tentar atualizar do servidor, mas SEMPRE filtrar pelos IDs locais (ou por telefone como fallback)
    const pedidosServidor = await carregarPedidosClienteServidor();
    const pedidosBase = Array.isArray(pedidosServidor)
        ? pedidosServidor
        : (typeof db !== 'undefined' && typeof db.getPedidos === 'function' ? db.getPedidos() : []);

    let meus = [];
    if (meusIds.length > 0) {
        const setIds = new Set(meusIds.map(v => Number(v)));
        meus = (pedidosBase || []).filter(p => setIds.has(Number(p && p.id)));
    } else {
        const telNorm = normalizarTelefone(telefone);
        meus = (pedidosBase || []).filter(p => normalizarTelefone(p && p.clienteTelefone) === telNorm);
    }

    meus.sort((a, b) => {
        const ta = new Date(a.dataCriacao || a.data || a.timestamp || 0).getTime();
        const tb = new Date(b.dataCriacao || b.data || b.timestamp || 0).getTime();
        return tb - ta;
    });

    if (meus.length === 0) {
        container.innerHTML = '<div style="color: var(--texto-medio); text-align:center; padding: 1.5rem;">Nenhum pedido encontrado para este telefone.</div>';
        return;
    }

    container.innerHTML = meus.map(p => {
        const dataMs = new Date(p.dataCriacao || p.data || p.timestamp || Date.now()).getTime();
        const dentro10 = (Date.now() - dataMs) <= 10 * 60 * 1000;
        const status = String(p.status || '').toLowerCase();
        const podeCancelar = dentro10 && status !== 'concluido' && status !== 'recusado' && status !== 'cancelado';
        const total = Number(p.total) || 0;
        const dataFmt = new Date(dataMs).toLocaleString('pt-BR');
        return '<div style="background: rgba(0,0,0,0.25); border: 1px solid var(--borda); border-radius: 12px; padding: 14px; margin-bottom: 10px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">' +
                '<div style="color:#fff; font-weight:700;">Pedido #' + (p.id || '') + '</div>' +
                '<div style="color: var(--texto-medio); font-weight:600;">' + formatarStatusPedidoCliente(p.status) + '</div>' +
            '</div>' +
            '<div style="margin-top:6px; color: var(--texto-medio); font-size: 0.9rem;">' + dataFmt + '</div>' +
            '<div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:10px;">' +
                '<div style="color: var(--vermelho-claro); font-weight:800;">R$ ' + total.toFixed(2) + '</div>' +
                (podeCancelar ? '<button class="btn btn-secondary" onclick="cancelarPedidoCliente(' + p.id + ')">Cancelar (até 10 min)</button>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

async function cancelarPedidoCliente(pedidoId) {
    if (!confirm('Deseja cancelar este pedido?')) return;
    try {
        if (typeof db === 'undefined' || typeof db.atualizarPedido !== 'function') return;

        const pedido = db.getPedido(pedidoId);
        if (!pedido) return;
        const dataMs = new Date(pedido.dataCriacao || pedido.data || pedido.timestamp || Date.now()).getTime();
        const dentro10 = (Date.now() - dataMs) <= 10 * 60 * 1000;
        const status = String(pedido.status || '').toLowerCase();
        if (!dentro10 || status === 'concluido' || status === 'recusado' || status === 'cancelado') {
            alert('Este pedido não pode mais ser cancelado.');
            return;
        }

        await db.atualizarPedido(pedidoId, {
            status: 'cancelado',
            statusPagamento: pedido.statusPagamento || 'pendente',
            dataCancelamento: new Date().toISOString(),
            canceladoPor: 'cliente'
        });

        renderizarMeusPedidos();

        const config = (typeof db.getConfiguracoes === 'function') ? db.getConfiguracoes() : {};
        const telLoja = String(config.telefone || '').replace(/\D/g, '');
        if (telLoja) {
            const msg = encodeURIComponent('Olá! Cancelei o pedido #' + pedidoId + ' no site.');
            window.open('https://wa.me/55' + telLoja + '?text=' + msg, '_blank');
        } else {
            alert('Pedido cancelado. Entre em contato pelo WhatsApp para confirmar.');
        }
    } catch (e) {
        console.error('[MAIN] Erro ao cancelar pedido:', e);
        alert('Erro ao cancelar pedido. Tente novamente.');
    }
}

window.abrirModalMeusPedidos = abrirModalMeusPedidos;
window.fecharModalMeusPedidos = fecharModalMeusPedidos;
window.renderizarMeusPedidos = renderizarMeusPedidos;
window.cancelarPedidoCliente = cancelarPedidoCliente;

// --- Overlay de carregamento e fallback de ícones
const _siteLoadingOverlayShownAt = Date.now();
function hideSiteLoadingOverlay() {
    const overlay = document.getElementById('site-loading-overlay');
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
    }
}
window.addEventListener('load', function() {
    const elapsed = Date.now() - _siteLoadingOverlayShownAt;
    const remaining = Math.max(2000 - elapsed, 0);
    setTimeout(hideSiteLoadingOverlay, remaining);
});
setTimeout(hideSiteLoadingOverlay, 8000);

function isFontAwesomeAvailable() {
    try {
        const test = document.createElement('i');
        test.className = 'fas fa-question-circle';
        test.style.display = 'none';
        document.body.appendChild(test);
        const computed = window.getComputedStyle ? window.getComputedStyle(test) : null;
        const fontFamily = computed ? (computed.fontFamily || '') : '';
        test.remove();
        return /Font Awesome|FontAwesome|Font Awesome 6 Free/i.test(fontFamily);
    } catch (e) {
        return false;
    }
}

function applyIconFallbacks() {
    if (isFontAwesomeAvailable()) {
        // Font Awesome presente — não executar fallback
        console.info('[ICON FALLBACK] Font Awesome detectado — fallback ignorado');
        return;
    }

    document.querySelectorAll('i[class*="fa-"]').forEach(el => {
        const classes = Array.from(el.classList);
        const nameClass = classes.find(c => c.startsWith('fa-') && !['fas','far','fal','fab','fad'].includes(c));
        if (!nameClass) return;
        const name = nameClass.replace('fa-', '');
        const mapSvg = {
            'fish':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12z"/></svg>',
            'shopping-cart':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 4h-2l-1 2v2h2l3.6 7.59L9.25 18A2 2 0 0 0 11 20h8v-2h-7.42a1 1 0 0 1-.93-.63L8.1 8H19V6H7z"/></svg>',
            'user':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 3-9 6v2h18v-2c0-3-4-6-9-6z"/></svg>',
            'times':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'image':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="#fff"/><path d="M21 21l-6-6-4 4-3-3-4 4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'photo':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"/><path d="M8 9l3 3 5-5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'camera':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3" fill="#fff"/></svg>',
            'plus':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'star':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 .587l3.668 7.431L23 9.753l-5.5 5.356L18.333 24 12 20.201 5.667 24l1.833-8.891L1 9.753l7.332-1.735L12 .587z"/></svg>',
            'ticket-alt':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" ry="2"/><path d="M7 12h10" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'clipboard-list':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 2h6v2H9z"/><rect x="6" y="6" width="12" height="16" rx="2" ry="2"/><path d="M9 11h6M9 15h6" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'eye':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>',
            'info-circle':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8h.01M11 12h2v4h-2z" fill="#fff"/></svg>'
        };
        let svg = mapSvg[name];
        if (!svg) {
            // fallback genérico para nomes não mapeados (ex.: eye-slash, sliders-h, cog)
            svg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" ry="2"/></svg>';
        }
        el.innerHTML = svg;
        el.style.fontStyle = 'normal';
        el.setAttribute('aria-hidden', 'true');
    });
}

document.addEventListener('DOMContentLoaded', applyIconFallbacks);
setTimeout(applyIconFallbacks, 2000);


