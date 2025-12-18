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

// Mostrar notificação
function mostrarNotificacao(titulo, mensagem, icone = 'fas fa-bell') {
    if (Notification.permission === 'granted') {
        new Notification(titulo, {
            body: mensagem,
            icon: '/favicon.ico',
            badge: icone,
            tag: 'vetera-pedido',
            requireInteraction: false
        });
    }
}

// Verificar e sugerir notificações ao criar pedido
function sugerirNotificacoes() {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'default') {
        // Mostrar mensagem sugerindo notificações
        const aceitar = confirm(
            'Deseja receber notificações quando seu pedido for aprovado?\n\n' +
            'Você será avisado automaticamente quando o restaurante aceitar seu pedido!'
        );
        
        if (aceitar) {
            solicitarPermissaoNotificacoes().then(permitido => {
                if (permitido) {
                    alert('Notificações ativadas! Você será avisado quando seu pedido for aprovado.');
                }
            });
        }
    }
}

// Verificar status de pedidos e notificar quando aprovado
async function verificarStatusPedido(pedidoId) {
    if (!pedidoId) return;
    
    const intervalId = setInterval(async () => {
        try {
            const pedidos = db.getPedidos();
            const pedido = pedidos.find(p => p.id === pedidoId);
            
            if (pedido) {
                // Se pedido foi aprovado (pagamento confirmado ou em preparo)
                if (pedido.statusPagamento === 'pago' || pedido.status === 'em_preparo') {
                    clearInterval(intervalId);
                    
                    if (Notification.permission === 'granted') {
                        mostrarNotificacao(
                            'Pedido Aprovado!',
                            `Seu pedido #${pedido.id} foi aprovado e está sendo preparado!`,
                            ''
                        );
                    }
                    
                    // Mostrar alerta também
                    alert(`Pedido #${pedido.id} foi aprovado e está sendo preparado!`);
                }
                
                // Se pedido foi recusado
                if (pedido.status === 'recusado') {
                    clearInterval(intervalId);
                    
                    if (Notification.permission === 'granted') {
                        mostrarNotificacao(
                            'Pedido Recusado',
                            `Seu pedido #${pedido.id} foi recusado.`,
                            ''
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao verificar status do pedido:', error);
        }
    }, 5000); // Verificar a cada 5 segundos
    
    // Parar após 30 minutos
    setTimeout(() => clearInterval(intervalId), 30 * 60 * 1000);
}

// Exportar funções
window.solicitarPermissaoNotificacoes = solicitarPermissaoNotificacoes;
window.mostrarNotificacao = mostrarNotificacao;
window.sugerirNotificacoes = sugerirNotificacoes;
window.verificarStatusPedido = verificarStatusPedido;

