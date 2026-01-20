// ============================================
// SISTEMA DE NOTIFICAÇÕES DO NAVEGADOR
// ============================================

// Solicitar permissão de notificações
async function solicitarPermissaoNotificacoes() {
    if (!('Notification' in window)) {
        console.log('Este navegador não suporta notificações');
        return false;
    }
    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

function _getEscolhaNotificacoesCliente() {
    try {
        const raw = localStorage.getItem('vetera_notificacoes_escolha');
        return raw ? String(raw) : '';
    } catch (e) {
        return '';
    }
}

function _setEscolhaNotificacoesCliente(v) {
    try {
        localStorage.setItem('vetera_notificacoes_escolha', String(v || ''));
    } catch (e) {}
}

async function exigirEscolhaNotificacoesCliente() {
    try {
        const ja = _getEscolhaNotificacoesCliente();
        if (ja === 'ativar' || ja === 'risco') return ja;

        let overlay = document.getElementById('modal-notificacoes-obrigatorio');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'modal-notificacoes-obrigatorio';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.78);';

        const card = document.createElement('div');
        card.style.cssText = 'width:min(520px,95vw);border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#1a1a1f,#0f0f12);border:1px solid rgba(255,255,255,0.10);box-shadow:0 25px 90px rgba(0,0,0,0.65);';

        const header = document.createElement('div');
        header.style.cssText = 'padding:22px 20px 14px;background:linear-gradient(180deg,rgba(220,38,38,0.18) 0%,transparent 100%);display:flex;flex-direction:column;gap:6px;';
        header.innerHTML = '<div style="font-weight:900;color:#fff;font-size:18px;">Ative as notificações</div>' +
            '<div style="color:rgba(255,255,255,0.72);font-size:13px;line-height:1.45;">Para acompanhar seu pedido e qualquer pendência (ex.: aprovação, mensagens do atendimento), recomendamos ativar as notificações.</div>';

        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px 20px;display:flex;flex-direction:column;gap:12px;';

        const info = document.createElement('div');
        info.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;color:rgba(255,255,255,0.85);font-size:13px;line-height:1.5;';
        info.innerHTML = '<div style="font-weight:800;margin-bottom:6px;">Importante</div>' +
            '<div>Se você não ativar, pode não ver mensagens do gestor ou atualizações do pedido.</div>';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;';

        const btnAtivar = document.createElement('button');
        btnAtivar.type = 'button';
        btnAtivar.textContent = 'Ativar';
        btnAtivar.style.cssText = 'flex:1;min-width:200px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:#fff;border-radius:12px;padding:12px 14px;font-weight:900;cursor:pointer;';

        const btnRisco = document.createElement('button');
        btnRisco.type = 'button';
        btnRisco.textContent = 'Aceito o risco';
        btnRisco.style.cssText = 'flex:1;min-width:200px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:12px;padding:12px 14px;font-weight:800;cursor:pointer;';

        actions.appendChild(btnAtivar);
        actions.appendChild(btnRisco);

        body.appendChild(info);
        body.appendChild(actions);

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        return await new Promise((resolve) => {
            const close = (choice) => {
                try { _setEscolhaNotificacoesCliente(choice); } catch (e) {}
                try { overlay.remove(); } catch (e) {}
                resolve(choice);
            };

            btnRisco.addEventListener('click', () => close('risco'));

            btnAtivar.addEventListener('click', async () => {
                try {
                    const ok = await solicitarPermissaoNotificacoes();
                    if (ok) {
                        close('ativar');
                    } else {
                        mostrarNotificacaoInApp('Notificações', 'Não foi possível ativar. Você pode tentar novamente ou aceitar o risco.');
                    }
                } catch (e) {
                    mostrarNotificacaoInApp('Notificações', 'Não foi possível ativar. Você pode aceitar o risco.');
                }
            });
        });
    } catch (e) {
        return 'risco';
    }
}

// Mostrar notificação (com emoji opcional)
function mostrarNotificacao(titulo, mensagem, emoji = '🔔') {
    const fullTitulo = (emoji ? emoji + ' ' : '') + (titulo || 'Notificação');

    // Se Notification API disponível e permitida, usar notificações nativas
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
            new Notification(fullTitulo, {
                body: mensagem || '',
                icon: '/favicon.ico',
                tag: 'vetera-pedido',
                requireInteraction: false
            });
            return;
        } catch (e) {
            console.warn('[NOTIF] Falha ao criar Notification:', e);
        }
    }

    // Fallback: mostrar notificação in-app (banner discreto)
    mostrarNotificacaoInApp(fullTitulo, mensagem || '');
}

// Mostrar notificação in-app quando Notification API não estiver disponível ou sem permissão
function mostrarNotificacaoInApp(titulo, mensagem) {
    try {
        let container = document.getElementById('notificacoes-in-app-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificacoes-in-app-container';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = 3000;
            document.body.appendChild(container);
        }

        const el = document.createElement('div');
        el.className = 'notificacao-in-app';
        el.style.background = 'linear-gradient(135deg, rgba(0,0,0,0.8), rgba(0,0,0,0.95))';
        el.style.color = '#fff';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '12px';
        el.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
        el.style.marginTop = '10px';
        el.style.minWidth = '240px';
        el.style.maxWidth = '360px';
        el.style.fontWeight = '600';

        el.innerHTML = '<div style="margin-bottom:6px; font-weight:700;">' + (titulo || '') + '</div>' +
                       '<div style="font-weight:400; font-size:0.95rem; color: rgba(255,255,255,0.9);">' + (mensagem || '') + '</div>';

        container.appendChild(el);

        // Auto remover após 6s
        setTimeout(() => {
            el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-8px)';
            setTimeout(() => el.remove(), 350);
        }, 6000);
    } catch (e) {
        console.warn('[NOTIF] Erro ao mostrar notificação in-app:', e);
    }
}

// Verificar e sugerir notificações ao criar pedido
function sugerirNotificacoes() {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'default') {
        // Mostrar mensagem sugerindo notificações (UI amigável)
        mostrarNotificacaoInApp('Receber notificações?', 'Deseja receber notificações quando seu pedido for aprovado? <button id="aceitar-notif-btn" style="margin-left:8px; padding:6px 8px; border-radius:8px; border:none; background:var(--vermelho-claro); color:#fff; cursor:pointer;">Ativar</button>');

        // Delegar evento do botão quando disponível
        setTimeout(() => {
            const btn = document.getElementById('aceitar-notif-btn');
            if (btn) {
                btn.addEventListener('click', async () => {
                    const permitido = await solicitarPermissaoNotificacoes();
                    if (permitido) {
                        mostrarNotificacaoInApp('Notificações ativadas!', 'Você receberá notificações quando seu pedido for aprovado.');
                    } else {
                        mostrarNotificacaoInApp('Notificações bloqueadas', 'Não foi possível ativar notificações. Verifique as configurações do navegador.');
                    }
                });
            }
        }, 300);
    } else if (Notification.permission === 'denied') {
        // Sugestão para desbloquear via instruções
        mostrarNotificacaoInApp('Notificações bloqueadas', 'Ative as notificações nas configurações do navegador para receber avisos.');
    }
}

// Verificar status de pedidos e notificar quando aprovado
async function verificarStatusPedido(pedidoId) {
    if (!pedidoId) return;
    
    // Listener para eventos de atualização de pedido
    const handlePedidoAtualizado = (event) => {
        const { pedidoId: updatedId, pedidoNovo } = event.detail || {};
        if (updatedId === pedidoId && pedidoNovo) {
            // Se pedido foi aprovado (pagamento confirmado ou em preparo)
            if (pedidoNovo.statusPagamento === 'pago' || pedidoNovo.status === 'em_preparo') {
                window.removeEventListener('pedidoAtualizado', handlePedidoAtualizado);
                clearInterval(intervalId);
                
                // Mostrar notificação mesmo sem permissão (usando in-app)
                mostrarNotificacao(
                    '✅ Pedido Aprovado!',
                    `Seu pedido #${pedidoNovo.id} foi aprovado e está sendo preparado!`,
                    '✅'
                );
                
                // Mostrar notificação do navegador se permitido
                if (Notification.permission === 'granted') {
                    new Notification('Pedido Aprovado!', {
                        body: `Seu pedido #${pedidoNovo.id} foi aprovado e está sendo preparado!`,
                        icon: '/logo.png',
                        tag: `pedido-${pedidoNovo.id}`
                    });
                }
            }
            
            // Se pedido foi recusado
            if (pedidoNovo.status === 'recusado') {
                window.removeEventListener('pedidoAtualizado', handlePedidoAtualizado);
                clearInterval(intervalId);
                
                mostrarNotificacao(
                    '❌ Pedido Recusado',
                    `Seu pedido #${pedidoNovo.id} foi recusado.`,
                    '❌'
                );
                
                if (Notification.permission === 'granted') {
                    new Notification('Pedido Recusado', {
                        body: `Seu pedido #${pedidoNovo.id} foi recusado.`,
                        icon: '/logo.png',
                        tag: `pedido-${pedidoNovo.id}`
                    });
                }
            }
        }
    };
    
    window.addEventListener('pedidoAtualizado', handlePedidoAtualizado);
    
    const intervalId = setInterval(async () => {
        try {
            const pedidos = db.getPedidos();
            const pedido = pedidos.find(p => p.id === pedidoId);
            
            if (pedido) {
                // Se pedido foi aprovado (pagamento confirmado ou em preparo)
                if (pedido.statusPagamento === 'pago' || pedido.status === 'em_preparo') {
                    clearInterval(intervalId);
                    window.removeEventListener('pedidoAtualizado', handlePedidoAtualizado);
                    
                    // Mostrar notificação mesmo sem permissão (usando in-app)
                    mostrarNotificacao(
                        '✅ Pedido Aprovado!',
                        `Seu pedido #${pedido.id} foi aprovado e está sendo preparado!`,
                        '✅'
                    );
                    
                    // Mostrar notificação do navegador se permitido
                    if (Notification.permission === 'granted') {
                        new Notification('Pedido Aprovado!', {
                            body: `Seu pedido #${pedido.id} foi aprovado e está sendo preparado!`,
                            icon: '/logo.png',
                            tag: `pedido-${pedido.id}`
                        });
                    }
                }
                
                // Se pedido foi recusado
                if (pedido.status === 'recusado') {
                    clearInterval(intervalId);
                    window.removeEventListener('pedidoAtualizado', handlePedidoAtualizado);
                    
                    mostrarNotificacao(
                        '❌ Pedido Recusado',
                        `Seu pedido #${pedido.id} foi recusado.`,
                        '❌'
                    );
                    
                    if (Notification.permission === 'granted') {
                        new Notification('Pedido Recusado', {
                            body: `Seu pedido #${pedido.id} foi recusado.`,
                            icon: '/logo.png',
                            tag: `pedido-${pedido.id}`
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao verificar status do pedido:', error);
        }
    }, 5000); // Verificar a cada 5 segundos
    
    // Parar após 30 minutos
    setTimeout(() => {
        clearInterval(intervalId);
        window.removeEventListener('pedidoAtualizado', handlePedidoAtualizado);
    }, 30 * 60 * 1000);
}

// Exportar funções
window.solicitarPermissaoNotificacoes = solicitarPermissaoNotificacoes;
window.mostrarNotificacao = mostrarNotificacao;
window.mostrarNotificacaoInApp = mostrarNotificacaoInApp;
window.sugerirNotificacoes = sugerirNotificacoes;
window.verificarStatusPedido = verificarStatusPedido;
window.exigirEscolhaNotificacoesCliente = exigirEscolhaNotificacoesCliente;

