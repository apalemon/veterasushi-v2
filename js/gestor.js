// ============================================
// GESTOR DE PEDIDOS
// ============================================

// Formatação de moeda (definir no início para evitar erros de inicialização)
const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

let pedidosVistos = new Set();
let pedidosOcultos = new Set();
let ultimoPedidoId = 0;
let filtroStatus = 'todos';
let termoBusca = '';
let menuItemsPDV = [];
let orderPDV = [];

// Inicializar gestor
document.addEventListener('DOMContentLoaded', async function() {
    // Aguardar carregamento do db
    if (!db.data) {
        await db.fetchInitialData();
    }
    
    // IMPORTANTE: Carregar cupons do servidor
    try {
        const response = await fetch(window.location.origin + '/api/cupons');
        if (response.ok) {
            const cupons = await response.json();
            if (Array.isArray(cupons)) {
                if (!db.data) db.data = {};
                db.data.cupons = cupons;
                db.saveData();
            }
        }
    } catch (e) {
        // Erro ao carregar cupons do servidor
    }

    // IMPORTANTE: Carregar destaques do servidor
    try {
        const resp = await fetch(window.location.origin + '/api/destaques');
        if (resp.ok) {
            const dados = await resp.json();
            if (Array.isArray(dados)) {
                if (!db.data) db.data = {};
                db.data.destaques = dados;
                db.saveData();
            }
        }
    } catch (e) {
        // Ignorar erro de destaques
    }
    
    // IMPORTANTE: Carregar pedidos do servidor ANTES de tudo
    // Aguardar carregamento completo antes de renderizar
    await carregarPedidosDoServidor();
    
    // Verificar se os pedidos foram carregados
    const pedidosCarregados = db.getPedidos();
    
    if (pedidosCarregados.length === 0) {
        // Tentar novamente se não carregou
        await carregarPedidosDoServidor();
    }

    // Carregar pedidos já vistos
    const visto = localStorage.getItem('vetera_pedidos_vistos');
    if (visto) {
        try {
            pedidosVistos = new Set(JSON.parse(visto));
        } catch (e) {
            pedidosVistos = new Set();
        }
    }

    // Carregar pedidos ocultos
    const ocultos = localStorage.getItem('vetera_pedidos_ocultos');
    if (ocultos) {
        try {
            pedidosOcultos = new Set(JSON.parse(ocultos));
        } catch (e) {
            pedidosOcultos = new Set();
        }
    }

    // Obter último ID de pedido visto
    const pedidos = db.getPedidos();
    if (pedidos.length > 0) {
        const ids = pedidos.map(function(p) { return p.id || 0; });
        ultimoPedidoId = Math.max.apply(null, ids);
    }

    atualizarStatusBanco();
    renderizarPedidos();
    renderizarPedidosOcultos();
    renderizarProdutos();
    renderizarDestaques();
    renderizarCupons();
    renderizarCategorias();
    renderizarUsuarios();
    renderizarCondicionais();
    
    // Carregar horários do servidor antes de renderizar
    await carregarHorariosDoServidor();
    renderizarHorarios();
    
    carregarConfiguracoes();
    
    // Verificar status da loja periodicamente
    setInterval(async () => {
        await carregarHorariosDoServidor();
        atualizarStatusHorarios();
        atualizarBotoesAbrirFechar();
    }, 30000); // A cada 30 segundos
    inicializarNovaVenda();
    inicializarDetalhes();

    // Verificar novos pedidos a cada 3 segundos
    setInterval(function() {
        verificarNovosPedidos().catch(e => {});
    }, 3000);
        
        // Verificar quando a página ganha foco
        window.addEventListener('focus', function() {
            carregarPedidosDoServidor().then(() => {
                verificarNovosPedidos();
                renderizarPedidos();
            });
        });
        
        // Verificar quando o storage muda (para pedidos criados em outras abas)
        window.addEventListener('storage', function(e) {
            if (e.key === 'vetera_database' || e.key === 'vetera_novo_pedido') {
                carregarPedidosDoServidor().then(() => {
                    verificarNovosPedidos();
                    renderizarPedidos();
                });
            }
        });

        // Atualizar contador de pedidos a cada 5 segundos
        setInterval(function() {
            renderizarPedidos();
            atualizarContadorNovos();
        }, 5000);
});

// Carregar pedidos do servidor - SEMPRE usar servidor como fonte principal
async function carregarPedidosDoServidor() {
    try {
        const apiUrl = window.location.origin + '/api/pedidos?' + Date.now(); // Cache bust
        const response = await fetch(apiUrl);
        
        if (response.ok) {
            const pedidosServidor = await response.json();
            
            if (Array.isArray(pedidosServidor)) {
                if (!db.data) db.data = {};
                
                // REMOVER DUPLICATAS baseado no ID
                const pedidosUnicos = [];
                const idsVistos = new Set();
                
                pedidosServidor.forEach(pedido => {
                    if (pedido && pedido.id && !idsVistos.has(pedido.id)) {
                        idsVistos.add(pedido.id);
                        pedidosUnicos.push(pedido);
                    }
                });
                
                // Atualizar dados
                db.data.pedidos = pedidosUnicos;
                db.saveData();
                
                return pedidosUnicos;
            }
        } else if (response.status === 503) {
            // Service Unavailable - tentar usar dados locais
            console.warn('[GESTOR] ⚠️ Servidor indisponível (503), usando dados locais');
            if (db.data && db.data.pedidos) {
                return db.data.pedidos;
            }
        } else {
            console.error('[GESTOR] ❌ Erro ao carregar pedidos:', response.status, response.statusText);
        }
    } catch (e) {
        console.error('[GESTOR] ❌ Erro ao carregar pedidos do servidor:', e);
        // Em caso de erro, tentar usar dados locais
        if (db.data && db.data.pedidos) {
            console.warn('[GESTOR] ⚠️ Usando dados locais devido ao erro');
            return db.data.pedidos;
        }
        // Servidor não disponível, usar localStorage
        const pedidosLocal = db.data?.pedidos || [];
        return pedidosLocal;
    }
    return db.data?.pedidos || [];
}

// Atualizar status do banco
function atualizarStatusBanco() {
    const pedidos = db.getPedidos();
    const statusEl = document.getElementById('db-status');
    if (statusEl) {
        const count = pedidos.length;
        const textoPedido = count === 1 ? 'pedido' : 'pedidos';
        statusEl.innerHTML = 
            '<span class="status-indicator"></span>' +
            '<span>Banco ativo (' + count + ' ' + textoPedido + ')</span>';
    }
}

// Verificar novos pedidos
async function verificarNovosPedidos() {
    if (typeof db === 'undefined') return;
    
    // Buscar pedidos do servidor
    await carregarPedidosDoServidor();
    
    const pedidos = db.getPedidos();
    if (!pedidos || pedidos.length === 0) return;

    // Encontrar novos pedidos
    const novosPedidos = pedidos.filter(function(p) { 
        return p && p.id && p.id > ultimoPedidoId && !pedidosVistos.has(p.id); 
    });
    
    // Verificar flag no localStorage
    try {
        const novoPedidoFlag = localStorage.getItem('vetera_novo_pedido');
        if (novoPedidoFlag) {
            const flagData = JSON.parse(novoPedidoFlag);
            const pedidoFlag = pedidos.find(p => p && p.id === flagData.pedidoId);
            if (pedidoFlag && !pedidosVistos.has(pedidoFlag.id)) {
                if (!novosPedidos.find(p => p.id === pedidoFlag.id)) {
                    novosPedidos.push(pedidoFlag);
                }
            }
            localStorage.removeItem('vetera_novo_pedido');
        }
    } catch (e) {}
    
    if (novosPedidos.length > 0) {
        // Marcar pedidos como vistos ANTES de tocar notificação (evitar loop)
        novosPedidos.forEach(function(p) {
            pedidosVistos.add(p.id);
        });
        
        // Salvar pedidos vistos imediatamente
        try {
            localStorage.setItem('vetera_pedidos_vistos', JSON.stringify(Array.from(pedidosVistos)));
        } catch (e) {
            // Erro ao salvar pedidos vistos
        }
        
        // Atualizar último ID
        const ids = novosPedidos.map(function(p) { return p.id || 0; });
        ultimoPedidoId = Math.max.apply(null, [ultimoPedidoId].concat(ids));
        
        // Tocar notificação apenas uma vez (não por pedido)
        tocarNotificacao();
        
        // Atualizar interface
        atualizarContadorNovos();
        renderizarPedidos();
        
        // Mostrar notificação visual
        mostrarNotificacaoNovoPedido(novosPedidos.length);
    }
}

// Ouvir evento de novo pedido - RECARREGAR IMEDIATAMENTE DO SERVIDOR
let processandoNovoPedido = false;
window.addEventListener('novoPedidoCriado', async function(event) {
    if (processandoNovoPedido) return; // Evitar processamento duplicado
    processandoNovoPedido = true;
    
    // Recarregar pedidos do servidor imediatamente
    await carregarPedidosDoServidor();
    renderizarPedidos();
    
    // Verificar novos pedidos (que já vai tocar notificação se necessário)
    await verificarNovosPedidos();
    
    processandoNovoPedido = false;
});

// Storage event para sincronizar entre abas
window.addEventListener('storage', function(e) {
    if (e.key === 'vetera_novo_pedido' || e.key === 'vetera_database') {
        setTimeout(function() {
            carregarPedidosDoServidor().then(() => {
                verificarNovosPedidos();
                renderizarPedidos();
            });
        }, 500);
    }
});


// Mostrar notificação visual de novo pedido
function mostrarNotificacaoNovoPedido(quantidade) {
    let notif = document.getElementById('notificacao-novo-pedido');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'notificacao-novo-pedido';
        notif.style.position = 'fixed';
        notif.style.top = '100px';
        notif.style.right = '20px';
        notif.style.background = 'linear-gradient(135deg, var(--vermelho-claro) 0%, var(--vermelho-escuro) 100%)';
        notif.style.color = 'white';
        notif.style.padding = '1.5rem 2rem';
        notif.style.borderRadius = '15px';
        notif.style.boxShadow = '0 8px 30px var(--sombra-vermelha)';
        notif.style.zIndex = '3000';
        notif.style.animation = 'slideInRight 0.5s ease';
        notif.style.fontWeight = '700';
        notif.style.fontSize = '1.1rem';
        document.body.appendChild(notif);
    }

    const texto = quantidade === 1 ? 'novo pedido' : 'novos pedidos';
    notif.innerHTML = quantidade + ' ' + texto + '!';
    notif.style.display = 'block';

    setTimeout(function() {
        notif.style.display = 'none';
    }, 5000);
}

// Variável global para AudioContext (iniciada após primeira interação)
let audioContextGlobal = null;

// Inicializar AudioContext após primeira interação do usuário
function inicializarAudioContext() {
    if (!audioContextGlobal) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            
            audioContextGlobal = new AudioContextClass();
            
            // Se estiver suspenso, tentar resumir
            if (audioContextGlobal.state === 'suspended') {
                audioContextGlobal.resume().catch(err => {
                    console.warn('[GESTOR] Erro ao resumir AudioContext:', err);
                });
            }
        } catch (error) {
            console.warn('[GESTOR] Erro ao criar AudioContext:', error);
            return null;
        }
    }
    
    // Se estiver suspenso, tentar resumir
    if (audioContextGlobal && audioContextGlobal.state === 'suspended') {
        audioContextGlobal.resume().catch(err => {
            console.warn('[GESTOR] Erro ao resumir AudioContext:', err);
        });
    }
    
    return audioContextGlobal;
}

// Inicializar AudioContext na primeira interação do usuário
document.addEventListener('click', function() {
    inicializarAudioContext();
}, { once: true });

// Tocar notificação sonora (melhorada)
function tocarNotificacao() {
    try {
        const audioContext = inicializarAudioContext();
        if (!audioContext) return;
        
        // Garantir que está rodando
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                tocarBeeps(audioContext);
            }).catch(err => {
                console.warn('[GESTOR] Erro ao resumir AudioContext para tocar:', err);
            });
        } else {
            tocarBeeps(audioContext);
        }
    } catch (error) {
        console.warn('[GESTOR] Erro ao tocar notificação:', error);
    }
}

// Função auxiliar para tocar os beeps
function tocarBeeps(audioContext) {
    // Sequência de beeps mais agradável
    function beep(freq, duration, delay) {
        delay = delay || 0;
        setTimeout(function() {
            try {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = freq;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + duration);
            } catch (err) {
                console.warn('[GESTOR] Erro ao criar beep:', err);
            }
        }, delay);
    }

    // Sequência: beep alto, beep médio, beep alto (padrão de notificação)
    beep(1000, 0.2, 0);    // Beep 1
    beep(800, 0.15, 150);  // Beep 2
    beep(1000, 0.2, 300);  // Beep 3
}

// Atualizar contador de novos pedidos
function atualizarContadorNovos() {
    const pedidos = db.getPedidos();
    const novos = pedidos.filter(function(p) { return !pedidosVistos.has(p.id); });
    const badge = document.getElementById('novos-pedidos-badge');
    const count = document.getElementById('novos-pedidos-count');

    if (badge && count) {
        if (novos.length > 0) {
            badge.style.display = 'flex';
            count.textContent = novos.length;
        } else {
            badge.style.display = 'none';
        }
    }
}

// Marcar pedido como visto
function marcarPedidoVisto(pedidoId) {
    pedidosVistos.add(pedidoId);
    const arrayVistos = Array.from(pedidosVistos);
    localStorage.setItem('vetera_pedidos_vistos', JSON.stringify(arrayVistos));
    atualizarContadorNovos();
}

// Toggle frete grátis
function toggleFreteGratis() {
    const checkbox = document.getElementById('cupom-frete-gratis');
    const container = document.getElementById('cupom-distancia-container');
    if (checkbox && container) {
        container.style.display = checkbox.checked ? 'block' : 'none';
    }
}

// Tornar função global
window.toggleFreteGratis = toggleFreteGratis;

// Mostrar seção
function mostrarSecao(secao) {
    document.querySelectorAll('.gestor-section').forEach(function(sec) {
        sec.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.classList.remove('active');
    });

    const secaoEl = document.getElementById('sec-' + secao);
    if (secaoEl) {
        secaoEl.classList.add('active');
    }

    // Atualizar item ativo no menu
    const nomesSecoes = {
        'nova-venda': 'Nova Venda',
        'pedidos': 'Pedidos',
        'ocultos': 'Ocultos',
        'detalhes': 'Detalhes',
        'produtos': 'Produtos',
        'cupons': 'Cupons',
        'categorias': 'Categorias',
        'usuarios': 'Usuários',
        'configuracoes': 'Configurações'
    };
    
    // Se for a seção de ocultos, renderizar pedidos ocultos
    if (secao === 'ocultos') {
        renderizarPedidosOcultos();
    }
    const nomeSecao = nomesSecoes[secao] || secao;
    
    document.querySelectorAll('.nav-item').forEach(function(item) {
        if (item.textContent && item.textContent.includes(nomeSecao)) {
            item.classList.add('active');
        }
    });
}

// Tornar função global
window.mostrarSecao = mostrarSecao;

// Filtrar por status
function filtrarPorStatus(status) {
    filtroStatus = status;
    
    document.querySelectorAll('.filtro-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    renderizarPedidos();
}

// Filtrar pedidos (busca)
function filtrarPedidos() {
    const searchInput = document.getElementById('search-pedidos');
    termoBusca = searchInput ? searchInput.value.toLowerCase() : '';
    renderizarPedidos();
}

// Tornar funções globais
window.filtrarPorStatus = filtrarPorStatus;
window.filtrarPedidos = filtrarPedidos;

// Renderizar pedidos
function renderizarPedidos() {
    const container = document.getElementById('pedidos-grid');
    if (!container) return;

    // Garantir que temos os pedidos mais recentes
    const pedidosDisponiveis = db.getPedidos();

    let pedidos = filtroStatus === 'todos' 
        ? pedidosDisponiveis 
        : pedidosDisponiveis.filter(function(p) { return p.status === filtroStatus; });

    // FILTRAR: Pedidos recusados e ocultos NÃO aparecem na lista principal
    pedidos = pedidos.filter(function(p) {
        return p.status !== 'recusado' && !pedidosOcultos.has(p.id);
    });

    // Aplicar busca
    if (termoBusca) {
        pedidos = pedidos.filter(function(p) {
            const nome = (p.clienteNome || '').toLowerCase();
            const telefone = (p.clienteTelefone || '');
            const id = (p.id || '').toString();
            return nome.includes(termoBusca) || telefone.includes(termoBusca) || id.includes(termoBusca);
        });
    }

    if (pedidos.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); padding: 3rem; grid-column: 1 / -1;">Nenhum pedido encontrado</p>';
        return;
    }

    container.innerHTML = pedidos.map(function(pedido) {
        // Garantir que status existe e tem valor padrão
        const status = pedido.status || 'pendente';
        const statusPagamento = pedido.statusPagamento || 'pendente';
        
        const statusClass = 'status-' + status;
        const statusText = formatarStatus(status);
        const dataFormatada = new Date(pedido.data || pedido.dataCriacao || Date.now()).toLocaleString('pt-BR');
        const isNovo = !pedidosVistos.has(pedido.id);
        const classeNovo = isNovo ? 'novo' : '';
        
        
        let html = '<div class="pedido-card-gestor ' + classeNovo + '" onclick="abrirDetalhesPedido(' + pedido.id + ')">';
        html += '<div class="pedido-header-gestor">';
        html += '<div class="pedido-id-gestor">#' + pedido.id + '</div>';
        html += '<div class="pedido-status-badge ' + statusClass + '">' + statusText + '</div>';
        html += '</div>';
        // Sanitizar dados para segurança
        const clienteNomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteNome || 'Não informado') : String(pedido.clienteNome || 'Não informado').replace(/[<>]/g, '');
        const clienteTelefoneSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteTelefone || 'Não informado') : String(pedido.clienteTelefone || 'Não informado').replace(/[<>]/g, '');
        
        html += '<div class="pedido-info-gestor"><strong>Cliente:</strong> ' + clienteNomeSeguro + '</div>';
        html += '<div class="pedido-info-gestor"><strong>Telefone:</strong> ' + clienteTelefoneSeguro + '</div>';
        html += '<div class="pedido-info-gestor"><strong>Data:</strong> ' + dataFormatada + '</div>';
        html += '<div class="pedido-info-gestor"><strong>Pagamento:</strong> ' + formatarFormaPagamento(pedido.formaPagamento) + ' - ';
        html += '<span style="color: ' + (statusPagamento === 'pago' ? 'var(--sucesso)' : 'var(--aviso)') + ';">';
        html += (statusPagamento === 'pago' ? '<i class="fas fa-check-circle"></i> Pago' : '<i class="fas fa-clock"></i> Pendente') + '</span></div>';
        html += '<div class="pedido-total-gestor">Total: R$ ' + pedido.total.toFixed(2) + '</div>';
        html += '</div>';
        
        return html;
    }).join('');
}

// Abrir detalhes do pedido
function abrirDetalhesPedido(pedidoId) {
    const pedido = db.getPedido(pedidoId);
    if (!pedido) return;

    marcarPedidoVisto(pedidoId);

    const modal = document.getElementById('modal-pedido');
    const titulo = document.getElementById('modal-pedido-titulo');
    const conteudo = document.getElementById('modal-pedido-conteudo');

    if (!modal || !titulo || !conteudo) return;

    titulo.textContent = 'Pedido #' + pedido.id;
    
    const statusClass = 'status-' + pedido.status;
    const statusText = formatarStatus(pedido.status);
    const dataFormatada = new Date(pedido.data).toLocaleString('pt-BR');

    // Construir HTML de forma segura
    let html = '<div style="margin-bottom: 2rem;">';
    html += '<div class="pedido-status-badge ' + statusClass + '" style="display: inline-block; margin-bottom: 1rem;">' + statusText + '</div>';
    html += '</div>';

    // Sanitizar dados do cliente para segurança
    const clienteNomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteNome || 'Não informado') : String(pedido.clienteNome || 'Não informado').replace(/[<>]/g, '');
    const clienteTelefoneSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteTelefone || 'Não informado') : String(pedido.clienteTelefone || 'Não informado').replace(/[<>]/g, '');
    const clienteEnderecoSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteEndereco || 'Não informado') : String(pedido.clienteEndereco || 'Não informado').replace(/[<>]/g, '');
    
    html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
    html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-user"></i> Informações do Cliente</h3>';
    html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Nome:</strong> ' + clienteNomeSeguro + '</p>';
    html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Telefone:</strong> ' + clienteTelefoneSeguro + '</p>';
    html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Endereço:</strong> ' + clienteEnderecoSeguro + '</p>';
    html += '<p style="color: var(--texto-claro);"><strong>Data:</strong> ' + dataFormatada + '</p>';
    html += '</div>';

    html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
    html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-shopping-basket"></i> Itens do Pedido</h3>';
    if (pedido.itens && pedido.itens.length > 0) {
        pedido.itens.forEach(function(item) {
            // Buscar produto para obter imagem
            const produto = db.getProduto(item.produtoId);
            let imagem = produto?.imagem || null;
            if (imagem && !imagem.startsWith('http') && !imagem.startsWith('/')) {
                imagem = '/Fotos/' + imagem;
            } else if (!imagem) {
                imagem = '/Fotos/produto-' + item.produtoId + '.png';
            }
            
            // Sanitizar nome para segurança
            const nomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(item.nome) : String(item.nome || '').replace(/[<>]/g, '');
            const imagemSegura = typeof escapeHTML !== 'undefined' ? escapeHTML(imagem) : String(imagem || '').replace(/[<>'"]/g, '');
            
            html += '<div style="display: flex; gap: 1rem; padding: 1rem; background: var(--cinza-escuro); border-radius: 8px; margin-bottom: 0.5rem; align-items: center;">';
            html += '<div style="flex-shrink: 0;"><img src="' + imagemSegura + '" alt="' + nomeSeguro + '" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 2px solid var(--borda);" onerror="this.src=\'logo.png\'; this.style.width=\'60px\'; this.style.height=\'60px\';"></div>';
            html += '<div style="flex: 1;"><strong style="color: var(--texto-claro);">' + nomeSeguro + '</strong><br>';
            html += '<span style="color: var(--texto-medio);">R$ ' + item.preco.toFixed(2) + ' x ' + item.quantidade + '</span></div>';
            html += '<div style="color: var(--vermelho-claro); font-weight: bold; font-size: 1.1rem;">R$ ' + (item.preco * item.quantidade).toFixed(2) + '</div>';
            html += '</div>';
        });
    }
    html += '</div>';

    html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
    html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-credit-card"></i> Informações de Pagamento</h3>';
    html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Forma:</strong> ' + formatarFormaPagamento(pedido.formaPagamento) + '</p>';
    html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Status:</strong> <span style="color: ' + (pedido.statusPagamento === 'pago' ? 'var(--sucesso)' : 'var(--aviso)') + ';">' + (pedido.statusPagamento === 'pago' ? '<i class="fas fa-check-circle"></i> Pago' : '<i class="fas fa-clock"></i> Pendente') + '</span></p>';
    html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Subtotal:</strong> R$ ' + pedido.subtotal.toFixed(2) + '</p>';
    if (pedido.desconto > 0) {
        html += '<p style="color: var(--texto-claro); margin-bottom: 0.5rem;"><strong>Desconto:</strong> - R$ ' + pedido.desconto.toFixed(2) + '</p>';
    }
    html += '<p style="color: var(--vermelho-claro); font-size: 1.3rem; font-weight: bold; margin-top: 1rem;"><strong>Total:</strong> R$ ' + pedido.total.toFixed(2) + '</p>';
    html += '</div>';

    if (pedido.observacoes) {
        html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
        html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-sticky-note"></i> Observações</h3>';
        const observacoesSeguras = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.observacoes) : String(pedido.observacoes || '').replace(/[<>]/g, '');
        html += '<p style="color: var(--texto-claro);">' + observacoesSeguras + '</p>';
        html += '</div>';
    }

    html += '<div style="display: flex; gap: 1rem; flex-wrap: wrap;">';
    
    if (pedido.statusPagamento === 'pendente') {
        html += '<button class="btn btn-success" onclick="confirmarPagamento(' + pedido.id + ')" style="flex: 1; min-width: 200px;"><i class="fas fa-check"></i> Confirmar Pagamento</button>';
        html += '<button class="btn btn-danger" onclick="recusarPedido(' + pedido.id + ')" style="flex: 1; min-width: 200px;"><i class="fas fa-times"></i> Recusar Pedido</button>';
    }
    
    if (pedido.statusPagamento === 'pago' && pedido.status === 'aguardando_pagamento') {
        html += '<button class="btn btn-primary" onclick="iniciarPreparo(' + pedido.id + ')" style="flex: 1; min-width: 200px;">Iniciar Preparo</button>';
    }
    
    if (pedido.status === 'em_preparo') {
        html += '<button class="btn btn-success" onclick="finalizarPedidoGestor(' + pedido.id + ')" style="flex: 1; min-width: 200px;"><i class="fas fa-check-circle"></i> Concluir Pedido</button>';
    }
    
    html += '<button class="btn btn-secondary" onclick="gerarNotaFiscal(' + pedido.id + ')" style="flex: 1; min-width: 200px;"><i class="fas fa-file-pdf"></i> Gerar Nota Fiscal</button>';
    html += '<button class="btn btn-secondary" onclick="ocultarPedido(' + pedido.id + ')" style="flex: 1; min-width: 200px;"><i class="fas fa-eye-slash"></i> Ocultar Pedido</button>';
    html += '<button class="btn btn-primary" onclick="editarPedido(' + pedido.id + ')" style="flex: 1; min-width: 200px;"><i class="fas fa-edit"></i> Editar Pedido</button>';
    html += '</div>';

    conteudo.innerHTML = html;
    modal.classList.add('active');
    renderizarPedidos();
}

// Renderizar pedidos ocultos
function renderizarPedidosOcultos() {
    const container = document.getElementById('pedidos-ocultos-grid');
    if (!container) return;

    const pedidosDisponiveis = db.getPedidos();
    const pedidosOcultosArray = pedidosDisponiveis.filter(function(p) {
        return pedidosOcultos.has(p.id);
    });

    if (pedidosOcultosArray.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); padding: 3rem; grid-column: 1 / -1;">Nenhum pedido oculto</p>';
        return;
    }

    container.innerHTML = pedidosOcultosArray.map(function(pedido) {
        const status = pedido.status || 'pendente';
        const statusPagamento = pedido.statusPagamento || 'pendente';
        const statusClass = 'status-' + status;
        const statusText = formatarStatus(status);
        const dataFormatada = new Date(pedido.data || pedido.dataCriacao || Date.now()).toLocaleString('pt-BR');
        
        const clienteNomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteNome || 'Não informado') : String(pedido.clienteNome || 'Não informado').replace(/[<>]/g, '');
        const clienteTelefoneSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(pedido.clienteTelefone || 'Não informado') : String(pedido.clienteTelefone || 'Não informado').replace(/[<>]/g, '');
        
        let html = '<div class="pedido-card-gestor" onclick="abrirDetalhesPedido(' + pedido.id + ')">';
        html += '<div class="pedido-header-gestor">';
        html += '<div class="pedido-id-gestor">#' + pedido.id + '</div>';
        html += '<div class="pedido-status-badge ' + statusClass + '">' + statusText + '</div>';
        html += '</div>';
        html += '<div class="pedido-info-gestor"><strong>Cliente:</strong> ' + clienteNomeSeguro + '</div>';
        html += '<div class="pedido-info-gestor"><strong>Telefone:</strong> ' + clienteTelefoneSeguro + '</div>';
        html += '<div class="pedido-info-gestor"><strong>Data:</strong> ' + dataFormatada + '</div>';
        html += '<div class="pedido-info-gestor"><strong>Pagamento:</strong> ' + formatarFormaPagamento(pedido.formaPagamento) + ' - ';
        html += '<span style="color: ' + (statusPagamento === 'pago' ? 'var(--sucesso)' : 'var(--aviso)') + ';">';
        html += (statusPagamento === 'pago' ? '<i class="fas fa-check-circle"></i> Pago' : '<i class="fas fa-clock"></i> Pendente') + '</span></div>';
        html += '<div class="pedido-total-gestor">Total: R$ ' + pedido.total.toFixed(2) + '</div>';
        html += '<div style="margin-top: 1rem; display: flex; gap: 0.5rem;">';
        html += '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); mostrarPedido(' + pedido.id + ')">Mostrar</button>';
        html += '</div>';
        html += '</div>';
        
        return html;
    }).join('');
}

// Ocultar pedido
function ocultarPedido(pedidoId) {
    pedidosOcultos.add(pedidoId);
    localStorage.setItem('vetera_pedidos_ocultos', JSON.stringify(Array.from(pedidosOcultos)));
    fecharModalPedido();
    renderizarPedidos();
    renderizarPedidosOcultos();
}

// Mostrar pedido (remover dos ocultos)
function mostrarPedido(pedidoId) {
    pedidosOcultos.delete(pedidoId);
    localStorage.setItem('vetera_pedidos_ocultos', JSON.stringify(Array.from(pedidosOcultos)));
    renderizarPedidos();
    renderizarPedidosOcultos();
}

// Filtrar pedidos ocultos
function filtrarPedidosOcultos() {
    const termo = document.getElementById('search-ocultos')?.value.toLowerCase() || '';
    renderizarPedidosOcultos();
}

// Editar pedido
function editarPedido(pedidoId) {
    const pedido = db.getPedido(pedidoId);
    if (!pedido) return;

    const modal = document.getElementById('modal-pedido');
    const titulo = document.getElementById('modal-pedido-titulo');
    const conteudo = document.getElementById('modal-pedido-conteudo');

    if (!modal || !titulo || !conteudo) return;

    titulo.textContent = 'Editar Pedido #' + pedido.id;
    
    let html = '<form id="form-editar-pedido" onsubmit="salvarEdicaoPedido(event, ' + pedido.id + ')">';
    
    // Informações do Cliente
    html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
    html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-user"></i> Informações do Cliente</h3>';
    html += '<div class="form-group"><label class="form-label">Nome *</label>';
    html += '<input type="text" class="form-input" id="edit-cliente-nome" value="' + (pedido.clienteNome || '') + '" required></div>';
    html += '<div class="form-group"><label class="form-label">Telefone *</label>';
    html += '<input type="tel" class="form-input" id="edit-cliente-telefone" value="' + (pedido.clienteTelefone || '') + '" required></div>';
    html += '<div class="form-group"><label class="form-label">Endereço</label>';
    html += '<input type="text" class="form-input" id="edit-cliente-endereco" value="' + (pedido.clienteEndereco || '') + '"></div>';
    html += '</div>';

    // Itens do Pedido
    html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
    html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-shopping-basket"></i> Itens do Pedido</h3>';
    html += '<div id="edit-itens-container">';
    if (pedido.itens && pedido.itens.length > 0) {
        pedido.itens.forEach(function(item, index) {
            html += '<div style="display: flex; gap: 1rem; padding: 1rem; background: var(--cinza-escuro); border-radius: 8px; margin-bottom: 0.5rem; align-items: center;">';
            html += '<div style="flex: 1;"><strong>' + (item.nome || 'Item') + '</strong><br>';
            html += '<span style="color: var(--texto-medio);">R$ <input type="number" step="0.01" class="form-input" style="width: 100px; display: inline-block;" id="edit-item-preco-' + index + '" value="' + (item.preco || 0) + '"> x <input type="number" class="form-input" style="width: 60px; display: inline-block;" id="edit-item-qtd-' + index + '" value="' + (item.quantidade || 1) + '"></span></div>';
            html += '<div style="color: var(--vermelho-claro); font-weight: bold;">R$ <span id="edit-item-subtotal-' + index + '">' + ((item.preco || 0) * (item.quantidade || 1)).toFixed(2) + '</span></div>';
            html += '<button type="button" class="btn btn-danger btn-small" onclick="removerItemEdicao(' + index + ')">Remover</button>';
            html += '</div>';
        });
    }
    html += '</div>';
    html += '</div>';

    // Valores
    html += '<div style="background: var(--cinza-medio); padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem;">';
    html += '<h3 style="color: var(--vermelho-claro); margin-bottom: 1rem;"><i class="fas fa-dollar-sign"></i> Valores</h3>';
    html += '<div class="form-grid">';
    html += '<div class="form-group"><label class="form-label">Subtotal (R$)</label>';
    html += '<input type="number" step="0.01" class="form-input" id="edit-subtotal" value="' + (pedido.subtotal || 0) + '"></div>';
    html += '<div class="form-group"><label class="form-label">Desconto (R$)</label>';
    html += '<input type="number" step="0.01" class="form-input" id="edit-desconto" value="' + (pedido.desconto || 0) + '"></div>';
    html += '<div class="form-group"><label class="form-label">Taxa de Entrega (R$)</label>';
    html += '<input type="number" step="0.01" class="form-input" id="edit-taxa" value="' + (pedido.taxaEntrega || 0) + '"></div>';
    html += '<div class="form-group"><label class="form-label">Total (R$)</label>';
    html += '<input type="number" step="0.01" class="form-input" id="edit-total" value="' + (pedido.total || 0) + '" required></div>';
    html += '</div>';
    html += '</div>';

    html += '<div style="display: flex; gap: 1rem;">';
    html += '<button type="submit" class="btn btn-primary" style="flex: 1;">Salvar Alterações</button>';
    html += '<button type="button" class="btn btn-secondary" onclick="fecharModalPedido()" style="flex: 1;">Cancelar</button>';
    html += '</div>';
    html += '</form>';

    conteudo.innerHTML = html;
    modal.classList.add('active');
    
    // Atualizar subtotais quando valores mudarem
    if (pedido.itens) {
        pedido.itens.forEach(function(item, index) {
            const precoInput = document.getElementById('edit-item-preco-' + index);
            const qtdInput = document.getElementById('edit-item-qtd-' + index);
            const subtotalSpan = document.getElementById('edit-item-subtotal-' + index);
            
            if (precoInput && qtdInput && subtotalSpan) {
                const atualizarSubtotal = function() {
                    const preco = parseFloat(precoInput.value) || 0;
                    const qtd = parseInt(qtdInput.value) || 0;
                    subtotalSpan.textContent = (preco * qtd).toFixed(2);
                    atualizarTotalEdicao();
                };
                
                precoInput.addEventListener('input', atualizarSubtotal);
                qtdInput.addEventListener('input', atualizarSubtotal);
            }
        });
    }
    
    // Atualizar total quando valores mudarem
    const subtotalInput = document.getElementById('edit-subtotal');
    const descontoInput = document.getElementById('edit-desconto');
    const taxaInput = document.getElementById('edit-taxa');
    const totalInput = document.getElementById('edit-total');
    
    if (subtotalInput && descontoInput && taxaInput && totalInput) {
        const atualizarTotal = function() {
            const subtotal = parseFloat(subtotalInput.value) || 0;
            const desconto = parseFloat(descontoInput.value) || 0;
            const taxa = parseFloat(taxaInput.value) || 0;
            totalInput.value = (subtotal - desconto + taxa).toFixed(2);
        };
        
        subtotalInput.addEventListener('input', atualizarTotal);
        descontoInput.addEventListener('input', atualizarTotal);
        taxaInput.addEventListener('input', atualizarTotal);
    }
}

// Atualizar total na edição
function atualizarTotalEdicao() {
    const container = document.getElementById('edit-itens-container');
    if (!container) return;
    
    let subtotal = 0;
    const itens = container.querySelectorAll('[id^="edit-item-subtotal-"]');
    itens.forEach(function(span) {
        subtotal += parseFloat(span.textContent) || 0;
    });
    
    const subtotalInput = document.getElementById('edit-subtotal');
    if (subtotalInput) {
        subtotalInput.value = subtotal.toFixed(2);
        const descontoInput = document.getElementById('edit-desconto');
        const taxaInput = document.getElementById('edit-taxa');
        const totalInput = document.getElementById('edit-total');
        
        if (descontoInput && taxaInput && totalInput) {
            const desconto = parseFloat(descontoInput.value) || 0;
            const taxa = parseFloat(taxaInput.value) || 0;
            totalInput.value = (subtotal - desconto + taxa).toFixed(2);
        }
    }
}

// Remover item na edição
function removerItemEdicao(index) {
    const container = document.getElementById('edit-itens-container');
    if (!container) return;
    
    const itemDiv = container.querySelector(`[id^="edit-item-preco-${index}"]`)?.closest('div');
    if (itemDiv) {
        itemDiv.remove();
        atualizarTotalEdicao();
    }
}

// Salvar edição do pedido
async function salvarEdicaoPedido(event, pedidoId) {
    event.preventDefault();
    
    const pedido = db.getPedido(pedidoId);
    if (!pedido) {
        alert('Pedido não encontrado!');
        return;
    }
    
    // Atualizar informações do cliente
    const clienteNome = document.getElementById('edit-cliente-nome').value;
    const clienteTelefone = document.getElementById('edit-cliente-telefone').value;
    const clienteEndereco = document.getElementById('edit-cliente-endereco').value;
    
    // Atualizar itens
    const container = document.getElementById('edit-itens-container');
    const itensAtualizados = [];
    if (container) {
        const itemDivs = container.querySelectorAll('[id^="edit-item-preco-"]');
        itemDivs.forEach(function(precoInput) {
            const index = precoInput.id.replace('edit-item-preco-', '');
            const qtdInput = document.getElementById('edit-item-qtd-' + index);
            const itemOriginal = pedido.itens[parseInt(index)];
            
            if (itemOriginal && precoInput && qtdInput) {
                itensAtualizados.push({
                    ...itemOriginal,
                    preco: parseFloat(precoInput.value) || 0,
                    quantidade: parseInt(qtdInput.value) || 1
                });
            }
        });
    }
    
    // Atualizar valores
    const subtotal = parseFloat(document.getElementById('edit-subtotal').value) || 0;
    const desconto = parseFloat(document.getElementById('edit-desconto').value) || 0;
    const taxaEntrega = parseFloat(document.getElementById('edit-taxa').value) || 0;
    const total = parseFloat(document.getElementById('edit-total').value) || 0;
    
    // Atualizar pedido
    await db.atualizarPedido(pedidoId, {
        clienteNome: clienteNome,
        clienteTelefone: clienteTelefone,
        clienteEndereco: clienteEndereco,
        itens: itensAtualizados.length > 0 ? itensAtualizados : pedido.itens,
        subtotal: subtotal,
        desconto: desconto,
        taxaEntrega: taxaEntrega,
        total: total
    });
    
    await carregarPedidosDoServidor();
    fecharModalPedido();
    renderizarPedidos();
    renderizarPedidosOcultos();
    alert('Pedido atualizado com sucesso!');
}

// Tornar funções globais
window.abrirDetalhesPedido = abrirDetalhesPedido;
window.ocultarPedido = ocultarPedido;
window.mostrarPedido = mostrarPedido;
window.editarPedido = editarPedido;
window.salvarEdicaoPedido = salvarEdicaoPedido;
window.removerItemEdicao = removerItemEdicao;
window.filtrarPedidosOcultos = filtrarPedidosOcultos;

function fecharModalPedido() {
    document.getElementById('modal-pedido').classList.remove('active');
}

// Ações do pedido - SEM CONFIRMAÇÃO (ação direta)
async function confirmarPagamento(pedidoId) {
    try {
        // Atualizar pedido
        const pedido = await db.atualizarPedido(pedidoId, { 
            statusPagamento: 'pago',
            status: 'em_preparo' // Ao confirmar pagamento, já inicia preparo
        });
        
        if (!pedido) {
            alert('Erro ao aprovar pedido. Tente novamente.');
            return;
        }
        
        // Aguardar um pouco para garantir que o servidor salvou
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Recarregar pedidos do servidor para garantir sincronização
        await carregarPedidosDoServidor();
        
        // Verificar se o pedido foi atualizado corretamente
        const pedidoAtualizado = db.getPedido(pedidoId);
        if (!pedidoAtualizado) {
            // Tentar mais uma vez
            await new Promise(resolve => setTimeout(resolve, 1000));
            await carregarPedidosDoServidor();
        }
        
        // Atualizar interface
        renderizarPedidos();
        
        // Fechar e reabrir modal para mostrar dados atualizados
        fecharModalPedido();
        setTimeout(() => {
            abrirDetalhesPedido(pedidoId);
        }, 200);
    } catch (error) {
        console.error('[GESTOR] ❌ Erro ao aprovar pedido:', error);
        alert('Erro ao aprovar pedido: ' + error.message);
    }
}

async function iniciarPreparo(pedidoId) {
    const pedido = await db.atualizarPedido(pedidoId, { status: 'em_preparo' });
    if (pedido) {
        // Recarregar pedidos do servidor para garantir sincronização
        await carregarPedidosDoServidor();
        renderizarPedidos();
        abrirDetalhesPedido(pedidoId);
    }
}

async function finalizarPedidoGestor(pedidoId) {
    const pedido = await db.atualizarPedido(pedidoId, { 
        status: 'concluido',
        statusPagamento: 'pago',
        dataConclusao: new Date().toISOString()
    });
    if (pedido) {
        // Recarregar pedidos do servidor para garantir sincronização
        await carregarPedidosDoServidor();
        renderizarPedidos();
        abrirDetalhesPedido(pedidoId);
    }
}

async function recusarPedido(pedidoId) {
    const pedido = await db.atualizarPedido(pedidoId, { 
        status: 'recusado',
        statusPagamento: 'recusado',
        dataRecusado: new Date().toISOString()
    });
    if (pedido) {
        // Recarregar pedidos do servidor para garantir sincronização
        await carregarPedidosDoServidor();
        fecharModalPedido();
        renderizarPedidos();
    }
}

// Tornar funções globais
window.confirmarPagamento = confirmarPagamento;
window.iniciarPreparo = iniciarPreparo;
window.finalizarPedidoGestor = finalizarPedidoGestor;
window.recusarPedido = recusarPedido;

// Função fmt do PDV
function fmt(val) {
    return parseFloat(val || 0).toFixed(2).replace('.', ',');
}

// Função getStoreLogo do PDV - Carrega logo.png se não houver no localStorage
async function getStoreLogo() {
    try {
        const logoLocalStorage = localStorage.getItem('vetera_store_logo');
        if (logoLocalStorage) {
            return logoLocalStorage;
        }
        
        // Tentar carregar logo.png
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            // Logo não encontrado, usar texto
        }
        
        return null;
    } catch (e) {
        console.error('Erro ao carregar logo:', e);
        return null;
    }
}

// Gerar nota fiscal idêntica ao PDV
async function gerarNotaFiscal(pedidoId) {
    
    const pedido = db.getPedido(pedidoId);
    if (!pedido) return;
    
    const config = db.getConfiguracoes();
    const now = new Date(pedido.data || new Date());
    const dateStr = now.toLocaleString('pt-BR');
    
    // Calcular valores
    const orderSubtotal = pedido.subtotal || 0;
    const discount = pedido.desconto || 0;
    const deliveryFee = pedido.taxaEntrega || 0;
    const finalTotal = pedido.total || 0;
    
    // Calcular altura necessária
    const lineHeight = 7;
    const headerHeight = 50;
    const footerHeight = 40;
    const linesNeeded = (pedido.itens ? pedido.itens.length : 0) * 1.2 + 8;
    const pageHeight = Math.max(150, headerHeight + footerHeight + linesNeeded * lineHeight);
    
    // Verificar se jsPDF está disponível
    if (typeof window.jspdf === 'undefined') {
        alert('Biblioteca jsPDF não encontrada. Carregando...');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = function() {
            gerarNotaFiscal(pedidoId);
        };
        document.head.appendChild(script);
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'mm',
        format: [80, pageHeight]
    });
    
    const margin = 5;
    let y = margin;
    
    // Header - Com logo ou texto (igual ao PDV)
    let storeLogo = localStorage.getItem('vetera_store_logo');
    if (!storeLogo) {
        // Tentar carregar logo.png
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                storeLogo = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            // Logo não encontrado, usar texto
        }
    }
    
    if (storeLogo) {
        try {
            let format = 'PNG';
            if (storeLogo.includes('data:image/jpeg') || storeLogo.includes('data:image/jpg')) {
                format = 'JPEG';
            } else if (storeLogo.includes('data:image/png')) {
                format = 'PNG';
            }
            
            const logoWidth = 30;
            const logoHeight = 30;
            doc.addImage(storeLogo, format, 40 - logoWidth/2, y, logoWidth, logoHeight);
            y += logoHeight + 5;
        } catch (e) {
            // Erro ao adicionar logo, usar texto
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(24);
            doc.setTextColor(0, 0, 0);
            doc.text(config.nomeEstabelecimento || 'VETERA SUSHI', 40, y + 7, {align:'center'});
            y += 12;
        }
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(0, 0, 0);
        doc.text(config.nomeEstabelecimento || 'VETERA SUSHI', 40, y + 7, {align:'center'});
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (config.endereco) {
            doc.text(config.endereco, 40, y + 14, {align:'center'});
        }
        if (config.telefone) {
            doc.text('Tel: ' + config.telefone, 40, y + 20, {align:'center'});
        }
        y += 32;
    }
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, y, 80 - margin, y);
    y += 6;
    
    // Data e Cliente
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Data/Hora: ' + dateStr, margin, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Cliente: ' + (pedido.clienteNome || ''), margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (pedido.clienteEndereco) {
        const addressLines = splitTextToSize(pedido.clienteEndereco, 30);
        addressLines.forEach(line => {
            doc.text('Endereco: ' + line, margin, y);
            y += 5;
        });
    }
    y += 5;
    
    // Tabela de itens
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('PRODUTO', margin, y);
    doc.text('QTD', 48, y);
    doc.text('VL.UN', 58, y);
    doc.text('TOTAL', 80 - margin, y, {align:'right'});
    y += 5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, 80 - margin, y);
    y += 6;
    
    // Itens
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    if (pedido.itens && pedido.itens.length > 0) {
        pedido.itens.forEach(function(item) {
            const lines = splitTextToSize(item.nome, 18);
            doc.text(lines.join(' '), margin, y);
            doc.text(String(item.quantidade), 48, y);
            doc.text('R$' + fmt(item.preco), 58, y);
            doc.text('R$' + fmt(item.preco * item.quantidade), 80 - margin, y, {align:'right'});
            y += 6;
        });
    }
    
    // Totais
    y += 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, 80 - margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    if (discount > 0) {
        doc.text('Desconto:', margin, y);
        doc.text('R$' + fmt(discount), 80 - margin, y, {align:'right'});
        y += 6;
    }
    if (deliveryFee > 0) {
        doc.text('Taxa de Entrega:', margin, y);
        doc.text('R$' + fmt(deliveryFee), 80 - margin, y, {align:'right'});
        y += 6;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    y += 2;
    doc.text('TOTAL:', margin, y);
    doc.text('R$' + fmt(finalTotal), 80 - margin, y, {align:'right'});
    y += 10;
    
    // Forma de pagamento
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Forma de Pagamento:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(formatarFormaPagamento(pedido.formaPagamento), margin, y + 5);
    y += 10;
    
    // Rodapé
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Obrigado pela preferencia!', 40, y, {align:'center'});
    doc.text('Volte sempre!', 40, y + 5, {align:'center'});
    
    // Abrir no navegador ao invés de baixar
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
    
    // Também salvar no sistema (não criar pedido, apenas adicionar registro)
    const notaFiscal = {
        id: Date.now(),
        pedidoId: pedido.id,
        data: new Date().toISOString(),
        timestamp: Date.now(),
        clienteNome: pedido.clienteNome,
        total: finalTotal,
        itens: pedido.itens || []
    };
    
    // Salvar em localStorage como histórico
    try {
        let historicoNotas = JSON.parse(localStorage.getItem('vetera_notas_fiscais') || '[]');
        historicoNotas.push(notaFiscal);
        localStorage.setItem('vetera_notas_fiscais', JSON.stringify(historicoNotas));
    } catch (e) {
        // Erro silencioso
    }
    
    // Funções auxiliares
    function splitTextToSize(text, maxChars) {
        if (!text) return [''];
        if (text.length <= maxChars) return [text];
        const parts = [];
        let i = 0;
        while (i < text.length) {
            parts.push(text.substr(i, maxChars));
            i += maxChars;
        }
        return parts;
    }
    
    function formatFilenameDate(d) {
        const pad = n => String(n).padStart(2, '0');
        return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + 
               pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    }
}

// Tornar função global
window.gerarNotaFiscal = gerarNotaFiscal;

window.confirmarPagamento = confirmarPagamento;
window.iniciarPreparo = iniciarPreparo;
window.finalizarPedidoGestor = finalizarPedidoGestor;
window.abrirDetalhesPedido = abrirDetalhesPedido;
window.filtrarPorStatus = filtrarPorStatus;
window.filtrarPedidos = filtrarPedidos;
window.mostrarSecao = mostrarSecao;

// Formatar status
function formatarStatus(status) {
    if (!status) return 'Pendente';
    
    const statusMap = {
        'pendente': 'Pendente',
        'aguardando_pagamento': 'Aguardando Pagamento',
        'pago': 'Pago',
        'em_preparo': 'Em Preparo',
        'em preparo': 'Em Preparo', // Variante
        'preparo': 'Em Preparo',
        'concluido': 'Concluído',
        'concluído': 'Concluído',
        'finalizado': 'Finalizado',
        'recusado': 'Recusado'
    };
    
    const statusLower = (status || '').toLowerCase().trim();
    return statusMap[statusLower] || statusMap[status] || status;
}

// Formatar forma de pagamento
function formatarFormaPagamento(forma) {
    const formasMap = {
        'pix': 'PIX',
        'dinheiro': 'Dinheiro',
        'cartao': 'Cartão'
    };
    return formasMap[forma] || forma;
}

// Renderizar produtos
function renderizarProdutos() {
    const container = document.getElementById('produtos-admin-grid');
    if (!container) return;

    const produtos = db.getProdutos();
    
    container.innerHTML = produtos.map(function(produto) {
        let html = '<div class="produto-card-admin">';
        
        if (produto.imagem) {
            const imagemUrl = produto.imagem.startsWith('http') || produto.imagem.startsWith('/') ? produto.imagem : '/Fotos/' + produto.imagem;
            html += '<div style="width: 100%; height: 150px; border-radius: 10px; overflow: hidden; margin-bottom: 1rem; background: var(--cinza-escuro); position: relative;">';
            html += '<img src="' + imagemUrl + '" alt="' + produto.nome + '" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">';
            html += '<div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 1rem; color: var(--texto-medio);">Sem imagem</div>';
            html += '</div>';
        } else {
            html += '<div style="width: 100%; height: 150px; border-radius: 10px; margin-bottom: 1rem; background: var(--cinza-escuro); display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--texto-medio);">Sem imagem</div>';
        }
        
        html += '<h3 style="color: var(--texto-claro); margin-bottom: 0.5rem;">' + produto.nome + '</h3>';
        html += '<p style="color: var(--texto-medio); font-size: 0.9rem; margin-bottom: 1rem;">' + produto.descricao + '</p>';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">';
        html += '<span style="color: var(--vermelho-claro); font-size: 1.3rem; font-weight: bold;">R$ ' + produto.preco.toFixed(2) + '</span>';
        html += '<span style="color: var(--texto-medio); font-size: 0.9rem;">' + produto.categoria + '</span>';
        html += '</div>';
        html += '<div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">';
        html += '<button class="btn btn-small" onclick="moverProdutoUp(' + produto.id + ')" title="Mover para cima" style="padding:6px 10px;">↑</button>';
        html += '<button class="btn btn-small" onclick="moverProdutoDown(' + produto.id + ')" title="Mover para baixo" style="padding:6px 10px;">↓</button>';
        html += '<button class="btn btn-primary btn-small" onclick="editarProdutoGestor(' + produto.id + ')" style="flex: 1; min-width: 100px;">Editar</button>';
        html += '<button class="btn" onclick="abrirModalProduto(' + produto.id + '); setTimeout(function(){ document.getElementById(\'produto-imagem-input\').click(); }, 300);" style="background: var(--cinza-medio); color: #fff; border: 1px solid var(--borda); padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 0.9rem;" title="Adicionar/Editar Foto">Foto</button>';
        html += '<button class="btn btn-secondary btn-small" onclick="excluirProdutoGestor(' + produto.id + ')" style="flex: 1; min-width: 100px;">Excluir</button>';
        html += '</div>';
        html += '</div>';
        
        return html;
    }).join('');
}

// Mover produto para cima (ordem) e persistir
function moverProdutoUp(produtoId) {
    const todos = db.data?.produtos || [];
    const idx = todos.findIndex(p => p.id === produtoId);
    if (idx > 0) {
        const aux = todos[idx - 1];
        todos[idx - 1] = todos[idx];
        todos[idx] = aux;
        // atualizar ordem baseada na posição dentro do array completo
        todos.forEach((p, i) => p.ordem = i);
        db.data.produtos = todos;
        db.saveData();
        // Persistir no servidor (enviar array completo)
        fetch(window.location.origin + '/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(todos)
        }).then(resp => {
            if (!resp.ok) console.warn('Não foi possível atualizar ordem no servidor');
        }).catch(e => console.warn('Erro ao atualizar ordem:', e));
        renderizarProdutos();
    }
}

// Mover produto para baixo (ordem) e persistir
function moverProdutoDown(produtoId) {
    const todos = db.data?.produtos || [];
    const idx = todos.findIndex(p => p.id === produtoId);
    if (idx !== -1 && idx < todos.length - 1) {
        const aux = todos[idx + 1];
        todos[idx + 1] = todos[idx];
        todos[idx] = aux;
        todos.forEach((p, i) => p.ordem = i);
        db.data.produtos = todos;
        db.saveData();
        fetch(window.location.origin + '/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(todos)
        }).then(resp => {
            if (!resp.ok) console.warn('Não foi possível atualizar ordem no servidor');
        }).catch(e => console.warn('Erro ao atualizar ordem:', e));
        renderizarProdutos();
    }
}

// Renderizar cupons
function renderizarCupons() {
    const container = document.getElementById('cupons-grid');
    if (!container) return;

    const cupons = db.getCupons();
    
    if (cupons.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); padding: 3rem;">Nenhum cupom cadastrado</p>';
        return;
    }

    container.innerHTML = cupons.map(function(cupom) {
        let html = '<div class="cupom-card-admin">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">';
        html += '<h3 style="color: var(--vermelho-claro); font-size: 1.5rem;">' + cupom.codigo + '</h3>';
        html += '<span class="pedido-status-badge ' + (cupom.ativo ? 'status-pago' : 'status-finalizado') + '">';
        html += (cupom.ativo ? 'Ativo' : 'Inativo') + '</span>';
        html += '</div>';
        html += '<div style="color: var(--texto-claro); font-size: 1.3rem; font-weight: bold; margin-bottom: 0.5rem;">';
        html += (cupom.tipo === 'percentual' ? cupom.valor + '% OFF' : 'R$ ' + cupom.valor.toFixed(2) + ' OFF');
        html += '</div>';
        html += '<div style="color: var(--texto-medio); font-size: 0.9rem; margin-bottom: 1rem;">';
        html += '<div>Usos: ' + (cupom.usosAtuais || 0) + ' / ' + (cupom.usosMaximos || cupom.limiteUsos || '∞') + '</div>';
        html += '<div>Validade: ' + (cupom.validade || 'Sem validade') + '</div>';
        if (cupom.valorMinimo > 0) {
            html += '<div>Mínimo: R$ ' + cupom.valorMinimo.toFixed(2) + '</div>';
        }
        if (cupom.freteGratis) {
            html += '<div style="color: var(--sucesso); font-weight: bold;"><i class="fas fa-truck"></i> Frete Grátis';
            if (cupom.distanciaMaxFreteGratis) {
                html += ' (até ' + cupom.distanciaMaxFreteGratis + 'km)';
            }
            html += '</div>';
        }
        html += '</div>';
        html += '<div style="display: flex; gap: 0.5rem;">';
        html += '<button class="btn btn-primary btn-small" onclick="editarCupomGestor(' + cupom.id + ')" style="flex: 1;">Editar</button>';
        html += '<button class="btn btn-secondary btn-small" onclick="excluirCupomGestor(' + cupom.id + ')" style="flex: 1;">Excluir</button>';
        html += '</div>';
        html += '</div>';
        
        return html;
    }).join('');
}

function abrirModalCupomGestor(cupomId = null) {
    const modal = document.getElementById('modal-cupom');
    const titulo = document.getElementById('modal-cupom-titulo');
    
    // Limpar formulário
    document.getElementById('cupom-id').value = '';
    document.getElementById('cupom-codigo-input').value = '';
    document.getElementById('cupom-tipo').value = 'percentual';
    document.getElementById('cupom-valor').value = '';
    document.getElementById('cupom-minimo').value = '';
    document.getElementById('cupom-limite').value = '';
    document.getElementById('cupom-validade').value = '';
    document.getElementById('cupom-ativo').checked = true;
    
    if (cupomId) {
        // Editar cupom existente
        titulo.textContent = 'Editar Cupom';
        const cupom = db.data.cupons?.find(c => c.id === cupomId);
        if (cupom) {
            document.getElementById('cupom-id').value = cupom.id;
            document.getElementById('cupom-codigo-input').value = cupom.codigo || '';
            document.getElementById('cupom-tipo').value = cupom.tipo || 'percentual';
            document.getElementById('cupom-valor').value = cupom.valor || '';
            document.getElementById('cupom-minimo').value = cupom.valorMinimo || '';
            document.getElementById('cupom-limite').value = cupom.limiteUsos || '';
            document.getElementById('cupom-validade').value = cupom.validade || '';
            document.getElementById('cupom-ativo').checked = cupom.ativo !== false;
            document.getElementById('cupom-frete-gratis').checked = cupom.freteGratis === true;
            document.getElementById('cupom-distancia-max').value = cupom.distanciaMaxFreteGratis || '';
            if (cupom.freteGratis === true) {
                document.getElementById('cupom-distancia-container').style.display = 'block';
            }
        }
    } else {
        titulo.textContent = 'Adicionar Cupom';
    }
    
    modal.classList.add('active');
}

function editarCupomGestor(id) {
    abrirModalCupomGestor(id);
}

function excluirCupomGestor(id) {
    if (!confirm('Deseja realmente excluir este cupom?')) return;
    if (db.data.cupons) {
        db.data.cupons = db.data.cupons.filter(function(c) { return c.id !== id; });
        db.saveData();
        renderizarCupons();
    }
}

async function salvarCupomGestor(event) {
    event.preventDefault();
    
    const id = document.getElementById('cupom-id').value;
    const codigo = document.getElementById('cupom-codigo-input').value.toUpperCase().trim();
    const tipo = document.getElementById('cupom-tipo').value;
    const valor = parseFloat(document.getElementById('cupom-valor').value) || 0;
    const valorMinimo = parseFloat(document.getElementById('cupom-minimo').value) || 0;
    const limiteUsos = parseInt(document.getElementById('cupom-limite').value) || null;
    const validade = document.getElementById('cupom-validade').value || null;
    const ativo = document.getElementById('cupom-ativo').checked;
    const freteGratis = document.getElementById('cupom-frete-gratis').checked;
    const distanciaMax = document.getElementById('cupom-distancia-max').value ? parseFloat(document.getElementById('cupom-distancia-max').value) : null;
    
    if (!codigo || (valor <= 0 && !freteGratis)) {
        alert('Preencha o código e o valor do cupom (ou marque frete grátis)!');
        return;
    }
    
    if (!db.data.cupons) db.data.cupons = [];
    
    const cupomData = {
        codigo,
        tipo,
        valor,
        valorMinimo,
        limiteUsos,
        validade,
        ativo,
        freteGratis: freteGratis || false,
        distanciaMaxFreteGratis: freteGratis ? distanciaMax : null,
        usosAtuais: 0
    };
    
    if (id) {
        // Atualizar existente
        const index = db.data.cupons.findIndex(c => c.id === parseInt(id));
        if (index !== -1) {
            cupomData.id = parseInt(id);
            cupomData.usosAtuais = db.data.cupons[index].usosAtuais || 0;
            // Preservar campos antigos se não foram alterados
            if (!cupomData.freteGratis && db.data.cupons[index].freteGratis) {
                cupomData.freteGratis = false;
            }
            db.data.cupons[index] = cupomData;
        }
    } else {
        // Criar novo
        cupomData.id = Date.now();
        db.data.cupons.push(cupomData);
    }
    
    // Salvar no banco de dados
    db.saveData();
    
    // IMPORTANTE: Salvar também no database.json via API
    try {
        const response = await fetch(window.location.origin + '/api/cupons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db.data.cupons || [])
        });
        
        if (response.ok) {
            // Cupons salvos no servidor
            // Recarregar cupons do servidor para garantir sincronização
            await db.fetchInitialData();
        } else {
            // Erro ao salvar cupons no servidor, mas salvos localmente
        }
    } catch (e) {
        // Servidor não disponível, cupons salvos apenas localmente
    }
    
    fecharModal('modal-cupom');
    renderizarCupons();
}

// Tornar funções globais
window.abrirModalCupomGestor = abrirModalCupomGestor;
window.editarCupomGestor = editarCupomGestor;
window.excluirCupomGestor = excluirCupomGestor;
window.salvarCupomGestor = salvarCupomGestor;

// Função será sobrescrita no script inline do gestor.html
function abrirModalProduto(produtoId = null) {
    // Esta função será sobrescrita pelo script inline
    // Abrir modal produto
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Tornar função global
window.fecharModal = fecharModal;

function editarProdutoGestor(id) {
    if (typeof window.abrirModalProduto === 'function') {
        window.abrirModalProduto(id);
    } else {
        abrirModalProduto(id);
    }
}

function excluirProdutoGestor(id) {
    if (!confirm('Deseja realmente excluir este produto?')) return;
    if (db.data.produtos) {
        db.data.produtos = db.data.produtos.filter(function(p) { return p.id !== id; });
        db.saveData();
        renderizarProdutos();
    }
}

// Tornar funções globais
window.editarProdutoGestor = editarProdutoGestor;
window.excluirProdutoGestor = excluirProdutoGestor;

// Função para alternar campos de desconto
window.toggleDescontoProduto = function() {
    const checkbox = document.getElementById('produto-desconto-ativo');
    const campos = document.getElementById('produto-desconto-campos');
    
    if (checkbox && campos) {
        campos.style.display = checkbox.checked ? 'block' : 'none';
        if (!checkbox.checked) {
            // Limpar campos quando desativar
            document.getElementById('produto-desconto-tipo').value = 'percentual';
            document.getElementById('produto-desconto-valor').value = '';
        }
    }
};

// Função para atualizar label do campo de desconto
window.atualizarCampoDesconto = function() {
    const tipo = document.getElementById('produto-desconto-tipo').value;
    const label = document.getElementById('produto-desconto-valor-label');
    
    if (label) {
        if (tipo === 'percentual') {
            label.textContent = 'Valor do Desconto (%)';
        } else {
            label.textContent = 'Valor do Desconto (R$)';
        }
    }
};


// Renderizar categorias
function renderizarCategorias() {
    const container = document.getElementById('categorias-list');
    if (!container) return;

    const categorias = db.getCategorias();
    
    if (categorias.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); padding: 3rem;">Nenhuma categoria cadastrada</p>';
        return;
    }
    
    container.innerHTML = categorias.map(function(categoria) {
        return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--cinza-medio); border-radius: 8px; margin-bottom: 1rem;">' +
            '<span style="color: var(--texto-claro); font-weight: bold;">' + categoria + '</span>' +
            '<button class="btn btn-secondary btn-small" onclick="excluirCategoria(\'' + categoria + '\')">Excluir</button>' +
            '</div>';
    }).join('');
}

function abrirModalCategoria() {
    const nome = prompt('Digite o nome da categoria:');
    if (!nome || !nome.trim()) return;
    
    const nomeCategoria = nome.trim();
    if (!db.data.categorias) db.data.categorias = [];
    
    if (db.data.categorias.includes(nomeCategoria)) {
        return; // Categoria já existe
    }
    
    db.data.categorias.push(nomeCategoria);
    db.saveData();
    renderizarCategorias();
}

function excluirCategoria(nome) {
    if (!confirm('Deseja realmente excluir a categoria "' + nome + '"?')) return;
    
    if (db.data.categorias) {
        db.data.categorias = db.data.categorias.filter(function(c) { return c !== nome; });
        db.saveData();
        renderizarCategorias();
    }
}

// Renderizar usuários
function renderizarUsuarios() {
    const tbody = document.getElementById('tabela-usuarios');
    if (!tbody) return;

    const usuarios = db.data.usuarios || [];
    
    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--texto-medio); padding: 3rem;">Nenhum usuário cadastrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = usuarios.map(function(usuario) {
        return '<tr>' +
            '<td>' + usuario.id + '</td>' +
            '<td>' + usuario.usuario + '</td>' +
            '<td>' + usuario.nome + '</td>' +
            '<td>' + usuario.nivel + '</td>' +
            '<td>' + (usuario.ativo ? '<span style="color: var(--sucesso);">Ativo</span>' : '<span style="color: var(--aviso);">Inativo</span>') + '</td>' +
            '<td><button class="btn btn-primary btn-small" onclick="editarUsuarioGestor(' + usuario.id + ')">Editar</button></td>' +
            '</tr>';
    }).join('');
}

function abrirModalUsuario() {
    const id = prompt('ID do usuário (deixe vazio para novo):');
    if (id === null) return;
    
    if (id === '') {
        // Novo usuário
        const usuario = prompt('Nome de usuário:');
        if (!usuario) return;
        const nome = prompt('Nome completo:');
        if (!nome) return;
        const senha = prompt('Senha:');
        if (!senha) return;
        const nivel = prompt('Nível (gerente/admin):', 'gerente');
        if (!nivel) return;
        
        if (!db.data.usuarios) db.data.usuarios = [];
        
        const novoId = db.data.usuarios.length > 0 
            ? Math.max.apply(null, db.data.usuarios.map(function(u) { return u.id || 0; })) + 1 
            : 1;
        
        db.data.usuarios.push({
            id: novoId,
            usuario: usuario,
            nome: nome,
            senha: senha,
            nivel: nivel,
            ativo: true
        });
        
        db.saveData();
        renderizarUsuarios();
    } else {
        // Editar usuário
        editarUsuarioGestor(parseInt(id));
    }
}

function editarUsuarioGestor(id) {
    const usuario = (db.data.usuarios || []).find(function(u) { return u.id === id; });
    if (!usuario) return;
    
    const novoNome = prompt('Nome completo (atual: ' + usuario.nome + '):', usuario.nome);
    if (novoNome === null) return;
    
    const novoNivel = prompt('Nível (atual: ' + usuario.nivel + '):', usuario.nivel);
    if (novoNivel === null) return;
    
    const novoAtivo = confirm('Usuário ativo? (atual: ' + (usuario.ativo ? 'Sim' : 'Não') + ')');
    
    usuario.nome = novoNome;
    usuario.nivel = novoNivel;
    usuario.ativo = novoAtivo;
    
    db.saveData();
    renderizarUsuarios();
}

// Tornar funções globais
window.abrirModalCategoria = abrirModalCategoria;
window.excluirCategoria = excluirCategoria;
window.abrirModalUsuario = abrirModalUsuario;
window.editarUsuarioGestor = editarUsuarioGestor;
// Destaques (gestor)
function abrirModalDestaque(destaque = null) {
    const nome = destaque ? (destaque.nome || '') : '';
    const produtosSelecionados = destaque ? (destaque.produtos || []) : [];

    const inputNome = prompt('Nome do destaque (ex: Combos natalinos):', nome);
    if (inputNome === null) return;

    // Selecionar produtos por IDs separados por vírgula
    const produtosStr = prompt('IDs dos produtos separados por vírgula (ex: 1,2,3):', produtosSelecionados.join(','));
    if (produtosStr === null) return;

    const listaIds = produtosStr.split(',').map(s => parseInt(s.trim())).filter(Boolean);

    if (!db.data.destaques) db.data.destaques = [];
    const novo = { id: Date.now(), nome: inputNome.trim(), produtos: listaIds, ativo: true };
    db.data.destaques.push(novo);
    db.saveData();

    // Salvar no servidor
    fetch(window.location.origin + '/api/destaques', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db.data.destaques)
    }).catch(e => console.warn('[DESTAQUES] Erro ao salvar no servidor:', e));

    renderizarDestaques();
}

function renderizarDestaques() {
    const container = document.getElementById('destaques-list');
    if (!container) return;

    const destaques = db.data.destaques || [];
    if (destaques.length === 0) {
        container.innerHTML = '<p style="color:var(--texto-medio); padding:12px;">Nenhum destaque cadastrado.</p>';
        return;
    }

    container.innerHTML = destaques.map(function(d) {
        const nomes = (d.produtos || []).map(id => (db.getProduto(id) || {}).nome || ('#' + id)).join(', ');
        return '<div style="display:flex; justify-content:space-between; align-items:center; padding: 12px; background: var(--bg-primary); border-radius:8px; margin-bottom:8px;">' +
            '<div style="flex:1;"><strong style="color:var(--texto-claro);">' + (d.nome || '') + '</strong><div style="color:var(--texto-medio); font-size:0.9rem;">' + nomes + '</div></div>' +
            '<div style="display:flex; gap:8px;">' +
            '<button class="btn" onclick="toggleAtivoDestaque(' + d.id + ')">' + (d.ativo ? 'Desativar' : 'Ativar') + '</button>' +
            '<button class="btn btn-secondary" onclick="excluirDestaque(' + d.id + ')">Excluir</button>' +
            '</div></div>';
    }).join('');
}

function toggleAtivoDestaque(id) {
    if (!db.data.destaques) return;
    const idx = db.data.destaques.findIndex(d => d.id === id);
    if (idx === -1) return;
    db.data.destaques[idx].ativo = !db.data.destaques[idx].ativo;
    db.saveData();
    fetch(window.location.origin + '/api/destaques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db.data.destaques) }).catch(()=>{});
    renderizarDestaques();
}

function excluirDestaque(id) {
    if (!confirm('Deseja realmente excluir este destaque?')) return;
    if (!db.data.destaques) return;
    db.data.destaques = db.data.destaques.filter(d => d.id !== id);
    db.saveData();
    fetch(window.location.origin + '/api/destaques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db.data.destaques) }).catch(()=>{});
    renderizarDestaques();
}

// Remover foto de produto (apenas limpa referência e salva no servidor)
function removerFotoProduto(produtoId = null) {
    // Se chamado sem id, tentar ler do modal
    let id = produtoId;
    if (!id) {
        const idField = document.getElementById('produto-id');
        if (idField && idField.value) id = parseInt(idField.value);
    }
    if (!id) return alert('ID do produto não identificado. Abra o produto e tente novamente.');

    const produto = db.getProduto(id);
    if (!produto) return alert('Produto não encontrado.');

    if (!confirm('Remover foto deste produto? Esta ação apenas limpa a referência da imagem.')) return;
    produto.imagem = '';
    db.saveData();

    // Salvar no servidor (substituir produtos)
    fetch(window.location.origin + '/api/produtos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db.data.produtos) }).catch(e => console.warn('[PRODUTOS] Erro ao salvar:', e));

    // Atualizar preview e botões
    const preview = document.getElementById('produto-imagem-preview');
    if (preview) {
        preview.innerHTML = '<div class="image-preview-placeholder">Foto</div>';
    }
    const removerBtn = document.getElementById('produto-remover-foto');
    if (removerBtn) removerBtn.style.display = 'none';
    renderizarProdutos();
}

window.abrirModalDestaque = abrirModalDestaque;
window.renderizarDestaques = renderizarDestaques;
window.toggleAtivoDestaque = toggleAtivoDestaque;
window.excluirDestaque = excluirDestaque;
window.removerFotoProduto = removerFotoProduto;

// Preview de imagem no modal do gestor
window.previewImagemProdutoGestor = function(event) {
    try {
        const input = event.target;
        if (!input || !input.files || input.files.length === 0) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('produto-imagem-preview');
            if (preview) {
                preview.innerHTML = '<img src="' + e.target.result + '" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">';
            }
            const removerBtn = document.getElementById('produto-remover-foto');
            if (removerBtn) removerBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    } catch (err) {
        console.warn('Erro ao mostrar preview da imagem:', err);
    }
};

// ============================================
// NOVA VENDA (igual ao PDV)
// ============================================

// Inicializar Nova Venda
function inicializarNovaVenda() {
    // Carregar produtos do banco de dados
    const produtos = db.getProdutos();
    menuItemsPDV = produtos.map(function(produto) {
        return {
            id: produto.id,
            name: produto.nome,
            price: produto.preco
        };
    });
    
    renderizarMenuPDV();
    atualizarPedidoPDV();
    
    // Event listeners
    const searchInput = document.getElementById('product-search-pdv');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filtrarProdutosPDV(e.target.value);
        });
    }
    
    // Atualizar pedido quando mudar quantidades
    const menuList = document.getElementById('menu-list-pdv');
    if (menuList) {
        menuList.addEventListener('change', function(e) {
            if (e.target.type === 'number') {
                atualizarPedidoPDV();
            }
        });
    }
    
    // Atualizar quando mudar desconto ou taxa
    const discountInput = document.getElementById('discount-pdv');
    const discountType = document.getElementById('discount-type-pdv');
    const deliveryFee = document.getElementById('delivery-fee-pdv');
    const paymentMethod = document.getElementById('payment-method-pdv');
    
    if (discountInput) discountInput.addEventListener('input', atualizarPedidoPDV);
    if (discountType) discountType.addEventListener('change', atualizarPedidoPDV);
    if (deliveryFee) deliveryFee.addEventListener('input', atualizarPedidoPDV);
    if (paymentMethod) paymentMethod.addEventListener('change', atualizarPedidoPDV);
}

// Renderizar menu de produtos
function renderizarMenuPDV() {
    const container = document.getElementById('menu-list-pdv');
    if (!container) return;
    
    if (menuItemsPDV.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--texto-medio); padding: 3rem;">Nenhum produto cadastrado</div>';
        return;
    }
    
    container.innerHTML = menuItemsPDV.map(function(item) {
        return '<div class="menu-item-pdv" data-name="' + item.name.toLowerCase() + '" style="display: flex; align-items: center; gap: 12px; background: rgba(255, 255, 255, 0.03); padding: 15px; border-radius: 10px; border: 1px solid rgba(220, 38, 38, 0.1); transition: all 0.3s ease;">' +
            '<div class="name" style="flex: 1; font-size: 14px; color: #fff;">' + item.name + '</div>' +
            '<div class="price" style="font-weight: 600; color: var(--vermelho-claro); width: 90px; text-align: right;">R$ ' + item.price.toFixed(2).replace('.', ',') + '</div>' +
            '<input type="number" min="0" step="1" value="0" data-id="' + item.id + '" style="width: 70px; padding: 8px; border-radius: 6px; border: 1px solid rgba(220, 38, 38, 0.3); background: rgba(0, 0, 0, 0.5); color: #fff; text-align: center;">' +
            '</div>';
    }).join('');
}

// Filtrar produtos
function filtrarProdutosPDV(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const items = document.querySelectorAll('.menu-item-pdv');
    
    items.forEach(function(item) {
        const name = item.getAttribute('data-name') || '';
        if (term === '' || name.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Atualizar pedido
function atualizarPedidoPDV() {
    const qtyInputs = Array.from(document.querySelectorAll('#menu-list-pdv input[type="number"]'));
    orderPDV = [];
    
    qtyInputs.forEach(function(inp) {
        const q = Math.max(0, Math.floor(Number(inp.value) || 0));
        const id = parseInt(inp.dataset.id);
        if (q > 0) {
            const item = menuItemsPDV.find(function(x) { return x.id === id; });
            if (item) {
                orderPDV.push({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    qty: q,
                    total: q * item.price
                });
            }
        }
    });
    
    renderizarOrderLinesPDV();
}

// Renderizar linhas do pedido
function renderizarOrderLinesPDV() {
    const container = document.getElementById('order-lines-pdv');
    if (!container) return;
    
    if (orderPDV.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--texto-medio); font-size: 13px;">Nenhum item no pedido.</div>';
        atualizarTotaisPDV();
        return;
    }
    
    container.innerHTML = orderPDV.map(function(o) {
        return '<div class="order-row-pdv" style="display: flex; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(220, 38, 38, 0.1);">' +
            '<div style="flex: 1;"><strong style="color: #fff;">' + o.name + '</strong><div style="font-size: 13px; color: var(--texto-medio);">R$ ' + o.price.toFixed(2).replace('.', ',') + ' x ' + o.qty + '</div></div>' +
            '<div style="width: 90px; text-align: right;"><strong style="color: var(--vermelho-claro);">R$ ' + o.total.toFixed(2).replace('.', ',') + '</strong></div>' +
            '</div>';
    }).join('');
    
    atualizarTotaisPDV();
}

// Atualizar totais
function atualizarTotaisPDV() {
    let subtotal = 0;
    orderPDV.forEach(function(o) {
        subtotal += o.total;
    });
    
    // Desconto
    const discountType = document.getElementById('discount-type-pdv')?.value || 'amount';
    const discountValue = Math.max(0, Number(document.getElementById('discount-pdv')?.value || 0));
    let manualDiscount = 0;
    
    if (discountType === 'percent') {
        manualDiscount = subtotal * (discountValue / 100);
    } else {
        manualDiscount = discountValue;
    }
    
    // Desconto da forma de pagamento
    const paymentMethod = document.getElementById('payment-method-pdv')?.value || 'Dinheiro';
    let paymentDiscountPct = 0;
    if (paymentMethod === 'Cartão - Crédito') {
        paymentDiscountPct = 3.10;
    } else if (paymentMethod === 'Cartão - Débito') {
        paymentDiscountPct = 0.99;
    }
    const paymentDiscount = subtotal * (paymentDiscountPct / 100);
    
    const totalDiscount = manualDiscount + paymentDiscount;
    
    // Taxa de entrega
    const deliveryFee = Math.max(0, Number(document.getElementById('delivery-fee-pdv')?.value || 0));
    
    // Total
    const total = Math.max(0, subtotal - totalDiscount + deliveryFee);
    
    // Atualizar display
    const subtotalEl = document.getElementById('subtotal-pdv');
    const discountEl = document.getElementById('discount-display-pdv');
    const deliveryEl = document.getElementById('delivery-fee-display-pdv');
    const totalEl = document.getElementById('total-display-pdv');
    
    if (subtotalEl) subtotalEl.textContent = 'R$ ' + subtotal.toFixed(2).replace('.', ',');
    if (discountEl) discountEl.textContent = 'R$ ' + totalDiscount.toFixed(2).replace('.', ',');
    if (deliveryEl) deliveryEl.textContent = 'R$ ' + deliveryFee.toFixed(2).replace('.', ',');
    if (totalEl) totalEl.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
}

// Limpar pedido
function limparPedidoPDV() {
    Array.from(document.querySelectorAll('#menu-list-pdv input[type="number"]')).forEach(function(i) {
        i.value = 0;
    });
    if (document.getElementById('delivery-fee-pdv')) {
        document.getElementById('delivery-fee-pdv').value = 0;
    }
    atualizarPedidoPDV();
}

// Gerar nota fiscal do PDV
async function gerarNotaFiscalPDV() {
    const order = orderPDV;
    if (order.length === 0) {
        alert('Pedido vazio. Adicione itens antes de gerar.');
        return;
    }
    
    const customerName = (document.getElementById('customer-name-pdv')?.value || '').trim();
    if (!customerName) {
        alert('Por favor, informe o nome do cliente.');
        return;
    }
    
    const customerAddress = (document.getElementById('customer-address-pdv')?.value || '').trim();
    if (!customerAddress) {
        alert('Por favor, informe o endereço do cliente.');
        return;
    }
    
    const payment = document.getElementById('payment-method-pdv')?.value || 'Dinheiro';
    
    // Calcular valores
    let orderSubtotal = 0;
    order.forEach(function(o) {
        orderSubtotal += o.total;
    });
    
    const discountType = document.getElementById('discount-type-pdv')?.value || 'amount';
    const discountValue = Math.max(0, Number(document.getElementById('discount-pdv')?.value || 0));
    let manualDiscount = 0;
    
    if (discountType === 'percent') {
        manualDiscount = orderSubtotal * (discountValue / 100);
    } else {
        manualDiscount = discountValue;
    }
    
    const paymentDiscountPct = getPaymentDiscountPDV(payment);
    const paymentDiscountAmount = orderSubtotal * (paymentDiscountPct / 100);
    const discount = manualDiscount + paymentDiscountAmount;
    const deliveryFee = Math.max(0, Number(document.getElementById('delivery-fee-pdv')?.value || 0));
    
    const now = new Date();
    const dateStr = now.toLocaleString('pt-BR');
    
    // Calcular altura
    const lineHeight = 7;
    const headerHeight = 50;
    const footerHeight = 40;
    const linesNeeded = order.length * 1.2 + 8;
    const pageHeight = Math.max(150, headerHeight + footerHeight + linesNeeded * lineHeight);
    
    if (typeof window.jspdf === 'undefined') {
        alert('Biblioteca jsPDF não encontrada. Carregando...');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = function() {
            gerarNotaFiscalPDV();
        };
        document.head.appendChild(script);
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'mm',
        format: [80, pageHeight]
    });
    
    const margin = 5;
    let y = margin;
    
    // Header
    let storeLogo = localStorage.getItem('vetera_store_logo');
    if (!storeLogo) {
        // Tentar carregar logo.png
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                storeLogo = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            // Logo não encontrado, usar texto
        }
    }
    const config = db.getConfiguracoes();
    
    if (storeLogo) {
        try {
            let format = 'PNG';
            if (storeLogo.includes('data:image/jpeg') || storeLogo.includes('data:image/jpg')) {
                format = 'JPEG';
            } else if (storeLogo.includes('data:image/png')) {
                format = 'PNG';
            }
            
            const logoWidth = 30;
            const logoHeight = 30;
            doc.addImage(storeLogo, format, 40 - logoWidth/2, y, logoWidth, logoHeight);
            y += logoHeight + 5;
        } catch (e) {
            // Erro ao adicionar logo, usar texto
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(24);
            doc.setTextColor(0, 0, 0);
            doc.text(config.nomeEstabelecimento || 'VETERA SUSHI', 40, y + 7, {align:'center'});
            y += 12;
        }
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(0, 0, 0);
        doc.text(config.nomeEstabelecimento || 'VETERA SUSHI', 40, y + 7, {align:'center'});
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (config.endereco) {
            doc.text(config.endereco, 40, y + 14, {align:'center'});
        }
        if (config.telefone) {
            doc.text('Tel: ' + config.telefone, 40, y + 20, {align:'center'});
        }
        y += 32;
    }
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, y, 80 - margin, y);
    y += 6;
    
    // Data e Cliente
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Data/Hora: ' + dateStr, margin, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Cliente: ' + customerName, margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const addressLines = splitTextToSizePDV(customerAddress, 30);
    addressLines.forEach(function(line) {
        doc.text('Endereco: ' + line, margin, y);
        y += 5;
    });
    y += 5;
    
    // Tabela
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('PRODUTO', margin, y);
    doc.text('QTD', 48, y);
    doc.text('VL.UN', 58, y);
    doc.text('TOTAL', 80 - margin, y, {align:'right'});
    y += 5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, 80 - margin, y);
    y += 6;
    
    // Itens
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    order.forEach(function(o) {
        const lines = splitTextToSizePDV(o.name, 18);
        doc.text(lines.join(' '), margin, y);
        doc.text(String(o.qty), 48, y);
        doc.text('R$' + fmt(o.price), 58, y);
        doc.text('R$' + fmt(o.total), 80 - margin, y, {align:'right'});
        y += 6;
    });
    
    // Totais
    y += 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, 80 - margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    if (paymentDiscountPct > 0) {
        doc.text('Desconto ' + payment + ' (' + paymentDiscountPct + '%):', margin, y);
        doc.text('R$' + fmt(paymentDiscountAmount), 80 - margin, y, {align:'right'});
        y += 6;
    }
    
    if (manualDiscount > 0) {
        doc.text('Desconto Manual:', margin, y);
        doc.text('R$' + fmt(manualDiscount), 80 - margin, y, {align:'right'});
        y += 6;
    }
    
    if (discount > 0 && paymentDiscountPct > 0 && manualDiscount > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('Total Desconto:', margin, y);
        doc.text('R$' + fmt(discount), 80 - margin, y, {align:'right'});
        doc.setFont('helvetica', 'normal');
        y += 6;
    }
    
    if (deliveryFee > 0) {
        doc.text('Taxa de Entrega:', margin, y);
        doc.text('R$' + fmt(deliveryFee), 80 - margin, y, {align:'right'});
        y += 6;
    }
    
    const finalTotal = Math.max(0, orderSubtotal - discount + deliveryFee);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    y += 2;
    doc.text('TOTAL:', margin, y);
    doc.text('R$' + fmt(finalTotal), 80 - margin, y, {align:'right'});
    y += 10;
    
    // Forma de pagamento
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Forma de Pagamento:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(payment, margin, y + 5);
    y += 10;
    
    // Rodapé
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Obrigado pela preferencia!', 40, y, {align:'center'});
    doc.text('Volte sempre!', 40, y + 5, {align:'center'});
    
    // Mostrar mensagem de início
    
    // Abrir no navegador ao invés de baixar
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
    
    // Criar pedido completo e salvar em pedidos.json
    const pedidoId = Date.now();
    const itensPedido = order.map(o => {
        const produto = menuItemsPDV.find(p => p.id === o.id);
        return {
            produtoId: o.id,
            nome: o.name,
            preco: o.price,
            quantidade: o.qty
        };
    });
    
    const novoPedido = {
        id: pedidoId,
        clienteId: null,
        clienteNome: customerName,
        clienteTelefone: '',
        clienteEndereco: customerAddress,
        itens: itensPedido,
        subtotal: orderSubtotal,
        desconto: discount,
        taxaEntrega: deliveryFee,
        total: finalTotal,
        formaPagamento: payment.toLowerCase(),
        observacoes: '',
        cupom: null,
        data: new Date().toISOString(),
        timestamp: pedidoId,
        status: 'concluido',
        statusPagamento: 'pago',
        dataConclusao: new Date().toISOString(),
        origem: 'pdv'
    };
    
    // Salvar pedido diretamente (já que db.criarPedido sobrescreve status)
    try {
        if (!db.data.pedidos) {
            db.data.pedidos = [];
        }
        
        // Verificar se já existe
        const jaExiste = db.data.pedidos.some(p => p.id === novoPedido.id);
        if (!jaExiste) {
            db.data.pedidos.push(novoPedido);
            db.saveData();
            
            // Salvar no servidor
            await db.salvarPedidoEmArquivo(novoPedido);
        }
    } catch (e) {
        // Erro silencioso
    }
    
    // Adicionar ao sistema (não criar pedido no gestor, apenas registro)
    const notaFiscal = {
        id: pedidoId,
        tipo: 'pdv',
        data: new Date().toISOString(),
        timestamp: pedidoId,
        clienteNome: customerName,
        clienteEndereco: customerAddress,
        total: finalTotal,
        subtotal: orderSubtotal,
        desconto: discount,
        taxaEntrega: deliveryFee,
        formaPagamento: payment,
        itens: order.map(function(o) {
            return {
                nome: o.name,
                preco: o.price,
                quantidade: o.qty
            };
        })
    };
    
    // Salvar em localStorage como histórico
    try {
        let historicoNotas = JSON.parse(localStorage.getItem('vetera_notas_fiscais') || '[]');
        historicoNotas.push(notaFiscal);
        localStorage.setItem('vetera_notas_fiscais', JSON.stringify(historicoNotas));
    } catch (e) {
        console.error('[GESTOR] Erro ao salvar nota fiscal:', e);
    }
    
    alert('Nota fiscal gerada e aberta no navegador!');
    limparPedidoPDV();
}

// Funções auxiliares PDV
function getPaymentDiscountPDV(paymentMethod) {
    if (paymentMethod === 'Cartão - Crédito') {
        return 3.10;
    } else if (paymentMethod === 'Cartão - Débito') {
        return 0.99;
    }
    return 0;
}

function splitTextToSizePDV(text, maxChars) {
    if (!text) return [''];
    if (text.length <= maxChars) return [text];
    const parts = [];
    let i = 0;
    while (i < text.length) {
        parts.push(text.substr(i, maxChars));
        i += maxChars;
    }
    return parts;
}

function formatFilenameDatePDV(d) {
    const pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + 
           pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

// Criar pedido do PDV
function criarPedidoPDV(customerName, customerAddress, payment, subtotal, discount, deliveryFee, total, items) {
    const pedido = db.criarPedido({
        clienteId: null,
        clienteNome: customerName,
        clienteTelefone: '',
        clienteEndereco: customerAddress,
        itens: items.map(function(o) {
            return {
                produtoId: o.id,
                nome: o.name,
                preco: o.price,
                quantidade: o.qty
            };
        }),
        subtotal: subtotal,
        desconto: discount,
        total: total,
        formaPagamento: payment.toLowerCase().replace('cartão - crédito', 'cartao_credito').replace('cartão - débito', 'cartao_debito').replace('pago pelo ifood', 'ifood'),
        observacoes: '',
        status: 'pago',
        statusPagamento: 'pago'
    });
    
    alert('Pedido #' + pedido.id + ' criado com sucesso!');
    limparPedidoPDV();
    renderizarPedidos();
}

// Tornar funções globais
window.atualizarPedidoPDV = atualizarPedidoPDV;
window.limparPedidoPDV = limparPedidoPDV;
window.gerarNotaFiscalPDV = gerarNotaFiscalPDV;

// ============================================
// SEÇÃO DETALHES (Relatório)
// ============================================

// currencyFmt já definido no início do arquivo

function inicializarDetalhes() {
    const monthFilter = document.getElementById('month-filter-detalhes');
    if (monthFilter) {
        const pedidos = db.getPedidos();
        const meses = Array.from(new Set(pedidos.map(p => getMonthKey(p.data || p.timestamp))));
        meses.sort().reverse();
        
        if (meses.length === 0) {
            const todayKey = getMonthKey(new Date().toISOString());
            meses.push(todayKey);
        }
        
        monthFilter.innerHTML = meses.map(key => 
            `<option value="${key}">${formatMonthLabel(key)}</option>`
        ).join('');
        
        monthFilter.addEventListener('change', () => {
            renderizarDetalhes();
        });
        
        renderizarDetalhes();
    }
}

function getMonthKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key) {
    const [year, month] = key.split('-');
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
}

async function renderizarDetalhes() {
    const monthFilter = document.getElementById('month-filter-detalhes');
    const selectedKey = monthFilter ? monthFilter.value : getMonthKey(new Date().toISOString());
    
    // IMPORTANTE: SEMPRE carregar pedidos DIRETAMENTE de pedidos.json via API
    try {
        const response = await fetch(window.location.origin + '/api/pedidos');
        let pedidos = [];
        
        if (response.ok) {
            pedidos = await response.json();
            
            // Atualizar db.data.pedidos com os pedidos do servidor
            if (!db.data) db.data = {};
            db.data.pedidos = pedidos;
            db.saveData();
        } else {
            // Fallback: usar pedidos do db
            pedidos = db.getPedidos();
        }
        
        // Em relatórios, mostrar TODOS os pedidos (incluindo recusados)
        const filtered = pedidos.filter(p => {
            if (!p || (!p.data && !p.timestamp)) return false;
            const pedidoKey = getMonthKey(p.data || p.timestamp || new Date().toISOString());
            return pedidoKey === selectedKey;
        });
        
        renderizarResumoDetalhes(filtered);
        renderizarTabelaDetalhes(filtered);
        renderizarResumoItensDetalhes(filtered);
    } catch (error) {
        // Fallback: usar pedidos do db
        const pedidos = db.getPedidos();
        const filtered = pedidos.filter(p => {
            if (!p || (!p.data && !p.timestamp)) return false;
            const pedidoKey = getMonthKey(p.data || p.timestamp || new Date().toISOString());
            return pedidoKey === selectedKey;
        });
        
        renderizarResumoDetalhes(filtered);
        renderizarTabelaDetalhes(filtered);
        renderizarResumoItensDetalhes(filtered);
    }
}

function renderizarResumoDetalhes(pedidos) {
    const totalPedidos = pedidos.length;
    const bruto = pedidos.reduce((sum, p) => sum + (p.subtotal || 0), 0);
    const descontos = pedidos.reduce((sum, p) => sum + (p.desconto || 0), 0);
    const total = pedidos.reduce((sum, p) => sum + (p.total || 0), 0);
    
    const pedidosEl = document.getElementById('summary-pedidos');
    const brutoEl = document.getElementById('summary-bruto');
    const descontosEl = document.getElementById('summary-descontos');
    const totalEl = document.getElementById('summary-total');
    
    if (pedidosEl) pedidosEl.textContent = totalPedidos;
    if (brutoEl) brutoEl.textContent = currencyFmt.format(bruto);
    if (descontosEl) descontosEl.textContent = currencyFmt.format(descontos);
    if (totalEl) totalEl.textContent = currencyFmt.format(total);
}

function renderizarTabelaDetalhes(pedidos) {
    const container = document.getElementById('sales-table-container-detalhes');
    if (!container) return;
    
    if (pedidos.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--texto-medio); padding: 2rem;">Nenhuma venda registrada para este mês.</div>';
        return;
    }
    
    // Agrupar por dia
    const groupedByDay = new Map();
    pedidos.forEach(p => {
        const date = new Date(p.data || p.timestamp);
        const dayKey = date.toLocaleDateString('pt-BR');
        if (!groupedByDay.has(dayKey)) {
            groupedByDay.set(dayKey, []);
        }
        groupedByDay.get(dayKey).push(p);
    });
    
    const sortedDays = Array.from(groupedByDay.keys()).sort((a, b) => 
        new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-'))
    );
    
    let html = '';
    sortedDays.forEach(dayKey => {
        const dayPedidos = groupedByDay.get(dayKey);
        const dayTotal = dayPedidos.reduce((sum, p) => sum + (p.total || 0), 0);
        const date = new Date(dayKey.split('/').reverse().join('-'));
        const dayName = date.toLocaleDateString('pt-BR', { weekday: 'long' });
        
        html += `<div style="margin-bottom: 35px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(220, 38, 38, 0.15); border-radius: 12px; padding: 20px;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: rgba(220, 38, 38, 0.1); border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(220, 38, 38, 0.2);">`;
        html += `<div style="display: flex; align-items: center; gap: 12px; font-size: 16px; font-weight: 600;">`;
        html += `<i class="fas fa-calendar-day" style="color: var(--vermelho-claro); font-size: 18px; margin-right: 8px;"></i>`;
        html += `<span style="color: #fff; text-transform: capitalize;">${dayName}</span>`;
        html += `<span style="color: var(--texto-medio); font-weight: 400; font-size: 14px;">${dayKey}</span>`;
        html += `</div>`;
        html += `<div style="display: flex; align-items: center; gap: 20px;">`;
        html += `<span style="color: var(--texto-medio); font-size: 13px; font-weight: 500;">${dayPedidos.length} pedido${dayPedidos.length !== 1 ? 's' : ''}</span>`;
        html += `<span style="color: #fff; font-size: 18px; font-weight: 700; background: rgba(220, 38, 38, 0.2); padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(220, 38, 38, 0.3);">${currencyFmt.format(dayTotal)}</span>`;
        html += `</div>`;
        html += `</div>`;
        
        html += `<table style="width: 100%; border-collapse: collapse; margin-top: 0; font-size: 13px;">`;
        html += `<thead><tr style="background: rgba(0, 0, 0, 0.3); border-bottom: 2px solid rgba(220, 38, 38, 0.2);">`;
        html += `<th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Hora</th>`;
        html += `<th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Cliente</th>`;
        html += `<th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Itens</th>`;
        html += `<th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Total</th>`;
        html += `<th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Ações</th>`;
        html += `</tr></thead><tbody>`;
        
        dayPedidos.forEach(p => {
            const hora = new Date(p.data || p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const itensList = (p.itens || []).map(i => `${i.nome} (${i.quantidade})`).join(', ');
            const clienteNomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(p.clienteNome || 'N/A') : String(p.clienteNome || 'N/A').replace(/[<>]/g, '');
            const itensListSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(itensList || 'N/A') : String(itensList || 'N/A').replace(/[<>]/g, '');
            
            html += `<tr style="transition: background 0.2s ease;" onmouseover="this.style.background='rgba(220, 38, 38, 0.05)'" onmouseout="this.style.background='transparent'">`;
            html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); color: #fff;">${hora}</td>`;
            html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); color: #fff;">${clienteNomeSeguro}</td>`;
            html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); color: var(--texto-medio); font-size: 12px;">${itensListSeguro}</td>`;
            html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); text-align: right; color: var(--vermelho-claro); font-weight: 600;">${currencyFmt.format(p.total || 0)}</td>`;
            html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); text-align: center;">`;
            html += `<div style="display: flex; gap: 8px; justify-content: center; align-items: center;">`;
            html += `<button onclick="editarPedidoDetalhes(${p.id})" style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 14px;" onmouseover="this.style.background='rgba(59, 130, 246, 0.3)'; this.style.borderColor='rgba(59, 130, 246, 0.6)'" onmouseout="this.style.background='rgba(59, 130, 246, 0.2)'; this.style.borderColor='rgba(59, 130, 246, 0.4)'" title="Editar pedido">`;
            html += `<i class="fas fa-pencil-alt"></i>`;
            html += `</button>`;
            html += `<button onclick="excluirPedidoDetalhes(${p.id})" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 14px;" onmouseover="this.style.background='rgba(239, 68, 68, 0.3)'; this.style.borderColor='rgba(239, 68, 68, 0.6)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.borderColor='rgba(239, 68, 68, 0.4)'" title="Excluir pedido">`;
            html += `<i class="fas fa-trash"></i>`;
            html += `</button>`;
            html += `<button onclick="gerarNotaFiscal(${p.id})" style="background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 14px;" onmouseover="this.style.background='rgba(34, 197, 94, 0.3)'; this.style.borderColor='rgba(34, 197, 94, 0.6)'" onmouseout="this.style.background='rgba(34, 197, 94, 0.2)'; this.style.borderColor='rgba(34, 197, 94, 0.4)'" title="Imprimir nota fiscal">`;
            html += `<i class="fas fa-print"></i>`;
            html += `</button>`;
            html += `</div>`;
            html += `</td>`;
            html += `</tr>`;
        });
        
        html += `</tbody></table>`;
        html += `</div>`;
    });
    
    container.innerHTML = html;
}

// Editar pedido da seção detalhes
function editarPedidoDetalhes(pedidoId) {
    // Usar a mesma função de edição que já existe
    editarPedido(pedidoId);
}

// Excluir pedido da seção detalhes
async function excluirPedidoDetalhes(pedidoId) {
    if (!confirm('Deseja realmente excluir este pedido? Esta ação não pode ser desfeita.')) {
        return;
    }
    
    try {
        // Primeiro, excluir do MongoDB
        let excluidoMongoDB = false;
        try {
            const response = await fetch(window.location.origin + '/api/pedidos', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pedidoId: pedidoId })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.deletedCount > 0) {
                    excluidoMongoDB = true;
                }
            } else {
                const errorText = await response.text();
                console.error('[GESTOR] Erro ao excluir pedido no MongoDB:', response.status, errorText);
            }
        } catch (e) {
            console.error('[GESTOR] Erro ao excluir pedido no servidor:', e);
        }
        
        // Remover do banco de dados local
        let excluidoLocal = false;
        if (db.data && db.data.pedidos) {
            const antes = db.data.pedidos.length;
            db.data.pedidos = db.data.pedidos.filter(p => {
                // Comparar tanto por id quanto por string para garantir
                const idMatch = p.id === pedidoId || String(p.id) === String(pedidoId);
                return !idMatch;
            });
            const depois = db.data.pedidos.length;
            
            excluidoLocal = antes > depois;
            console.log(`[GESTOR] 📝 Pedido removido localmente: ${antes} -> ${depois} pedidos (excluído: ${excluidoLocal})`);
            
            if (!excluidoLocal) {
                console.warn('[GESTOR] ⚠️ Pedido não encontrado localmente para exclusão');
            }
            
            db.saveData();
        }
        
        // Remover dos pedidos ocultos se estiver lá
        if (pedidosOcultos.has(pedidoId)) {
            pedidosOcultos.delete(pedidoId);
            localStorage.setItem('vetera_pedidos_ocultos', JSON.stringify(Array.from(pedidosOcultos)));
        }
        
        // Aguardar um pouco para garantir que o MongoDB processou
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Recarregar pedidos do servidor para garantir sincronização
        await carregarPedidosDoServidor();
        
        // Verificar se o pedido foi realmente excluído
        const pedidoAindaExiste = db.getPedido(pedidoId);
        if (pedidoAindaExiste) {
            // Tentar excluir novamente localmente
            if (db.data && db.data.pedidos) {
                db.data.pedidos = db.data.pedidos.filter(p => {
                    return p.id !== pedidoId && String(p.id) !== String(pedidoId);
                });
                db.saveData();
            }
        }
        
        // Recarregar a seção de detalhes
        const monthFilter = document.getElementById('month-filter-detalhes');
        if (monthFilter) {
            renderizarDetalhes();
        }
        
        // Recarregar pedidos na lista principal
        renderizarPedidos();
        renderizarPedidosOcultos();
        
        // Mensagem de sucesso
        if (excluidoMongoDB || excluidoLocal) {
            alert('Pedido excluído com sucesso!');
        } else {
            alert('Aviso: Pedido pode não ter sido encontrado para exclusão. Verifique se foi realmente excluído.');
        }
    } catch (error) {
        console.error('[GESTOR] Erro ao excluir pedido:', error);
        alert('Erro ao excluir pedido. Tente novamente.');
    }
}

// Tornar funções globais
window.editarPedidoDetalhes = editarPedidoDetalhes;
window.excluirPedidoDetalhes = excluirPedidoDetalhes;

function renderizarResumoItensDetalhes(pedidos) {
    const container = document.getElementById('items-summary-container-detalhes');
    if (!container) return;
    
    const itemsMap = new Map();
    pedidos.forEach(p => {
        (p.itens || []).forEach(item => {
            const key = item.nome;
            if (!itemsMap.has(key)) {
                itemsMap.set(key, { nome: key, quantidade: 0, total: 0 });
            }
            const entry = itemsMap.get(key);
            entry.quantidade += item.quantidade || 0;
            entry.total += (item.preco || 0) * (item.quantidade || 0);
        });
    });
    
    if (itemsMap.size === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--texto-medio); padding: 2rem;">Nenhum item encontrado.</div>';
        return;
    }
    
    const items = Array.from(itemsMap.values()).sort((a, b) => b.quantidade - a.quantidade);
    
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
    html += '<thead><tr style="background: rgba(0, 0, 0, 0.3); border-bottom: 2px solid rgba(220, 38, 38, 0.2);">';
    html += '<th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Item</th>';
    html += '<th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Quantidade</th>';
    html += '<th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--texto-medio); font-weight: 600;">Total</th>';
    html += '</tr></thead><tbody>';
    
    items.forEach(item => {
        html += '<tr style="transition: background 0.2s ease;">';
        html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); color: #fff;">${item.nome}</td>`;
        html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); text-align: right; color: #fff;">${item.quantidade}</td>`;
        html += `<td style="padding: 12px; border-bottom: 1px solid rgba(220, 38, 38, 0.1); text-align: right; color: var(--vermelho-claro); font-weight: 600;">${currencyFmt.format(item.total)}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function exportarDetalhesCSV() {
    const monthFilter = document.getElementById('month-filter-detalhes');
    const selectedKey = monthFilter ? monthFilter.value : getMonthKey(new Date().toISOString());
    
    const pedidos = db.getPedidos();
    const filtered = pedidos.filter(p => {
        const pedidoKey = getMonthKey(p.data || p.timestamp || new Date().toISOString());
        return pedidoKey === selectedKey;
    });
    
    let csv = 'Data,Hora,Cliente,Telefone,Itens,Subtotal,Desconto,Taxa Entrega,Total,Forma Pagamento\n';
    filtered.forEach(p => {
        const date = new Date(p.data || p.timestamp);
        const dataStr = date.toLocaleDateString('pt-BR');
        const horaStr = date.toLocaleTimeString('pt-BR');
        const itensStr = (p.itens || []).map(i => `${i.nome} (${i.quantidade})`).join('; ');
        csv += `"${dataStr}","${horaStr}","${p.clienteNome || ''}","${p.clienteTelefone || ''}","${itensStr}","${p.subtotal || 0}","${p.desconto || 0}","${p.taxaEntrega || 0}","${p.total || 0}","${p.formaPagamento || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vetera_vendas_${selectedKey}.csv`;
    link.click();
}

window.exportarDetalhesCSV = exportarDetalhesCSV;

// Fazer backup completo de todos os dados
async function fazerBackup() {
    try {
        // Carregar todos os dados atualizados do servidor
        await carregarPedidosDoServidor();
        
        // Buscar cupons do servidor
        try {
            const responseCupons = await fetch(window.location.origin + '/api/cupons');
            if (responseCupons.ok) {
                const cupons = await responseCupons.json();
                if (Array.isArray(cupons)) {
                    if (!db.data) db.data = {};
                    db.data.cupons = cupons;
                }
            }
        } catch (e) {
            // Erro ao carregar cupons
        }
        
        // Buscar produtos do servidor
        try {
            const responseDatabase = await fetch(window.location.origin + '/api/database');
            if (responseDatabase.ok) {
                const dadosPublicos = await responseDatabase.json();
                if (!db.data) db.data = {};
                db.data.produtos = dadosPublicos.produtos || db.data.produtos || [];
                db.data.categorias = dadosPublicos.categorias || db.data.categorias || [];
                db.data.configuracoes = dadosPublicos.configuracoes || db.data.configuracoes || {};
            }
        } catch (e) {
            // Erro ao carregar produtos
        }
        
        // Buscar usuários do servidor (se disponível)
        try {
            const responseUsuarios = await fetch(window.location.origin + '/api/usuarios');
            if (responseUsuarios.ok) {
                const usuarios = await responseUsuarios.json();
                if (Array.isArray(usuarios)) {
                    if (!db.data) db.data = {};
                    db.data.usuarios = usuarios;
                }
            }
        } catch (e) {
            // Endpoint pode não existir, usar dados locais
        }
        
        // Preparar dados do backup
        const backupData = {
            versao: '1.0',
            dataBackup: new Date().toISOString(),
            timestamp: Date.now(),
            dados: {
                pedidos: db.getPedidos() || [],
                produtos: db.data.produtos || [],
                categorias: db.data.categorias || [],
                cupons: db.data.cupons || [],
                usuarios: db.data.usuarios || [],
                clientes: db.data.clientes || [],
                condicionais: db.data.condicionais || [],
                configuracoes: db.getConfiguracoes() || {}
            },
            informacoes: {
                totalPedidos: (db.getPedidos() || []).length,
                totalProdutos: (db.data.produtos || []).length,
                totalCupons: (db.data.cupons || []).length,
                totalUsuarios: (db.data.usuarios || []).length,
                totalClientes: (db.data.clientes || []).length
            }
        };
        
        // Criar arquivo JSON
        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
        
        // Criar link de download
        const link = document.createElement('a');
        const dataAtual = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const horaAtual = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
        link.href = URL.createObjectURL(blob);
        link.download = `vetera_backup_${dataAtual}_${horaAtual}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Limpar URL do objeto
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
        
        // Mostrar mensagem de sucesso
        const mensagem = `Backup criado com sucesso!\n\n` +
            `Total de pedidos: ${backupData.informacoes.totalPedidos}\n` +
            `Total de produtos: ${backupData.informacoes.totalProdutos}\n` +
            `Total de cupons: ${backupData.informacoes.totalCupons}\n` +
            `Total de usuários: ${backupData.informacoes.totalUsuarios}\n` +
            `Total de clientes: ${backupData.informacoes.totalClientes}`;
        
        alert(mensagem);
        
    } catch (error) {
        // Erro ao criar backup
        alert('Erro ao criar backup. Verifique o console para mais detalhes.');
    }
}

window.fazerBackup = fazerBackup;

// Carregar configurações
function carregarConfiguracoes() {
    const config = db.getConfiguracoes();
    const nomeEl = document.getElementById('config-nome');
    const pixEl = document.getElementById('config-pix');
    const telefoneEl = document.getElementById('config-telefone');
    const enderecoEl = document.getElementById('config-endereco');
    const taxaEl = document.getElementById('config-taxa');
    const tempoEl = document.getElementById('config-tempo');
    
    if (nomeEl) nomeEl.value = config.nomeEstabelecimento || '';
    if (pixEl) pixEl.value = config.chavePix || '';
    if (telefoneEl) telefoneEl.value = config.telefone || '';
    if (enderecoEl) enderecoEl.value = config.endereco || '';
    if (taxaEl) taxaEl.value = config.taxaEntrega || 0;
    if (tempoEl) tempoEl.value = config.tempoPreparo || 30;
}

// Salvar configurações
const formConfig = document.getElementById('form-config');
if (formConfig) {
    formConfig.addEventListener('submit', function(e) {
        e.preventDefault();
        db.atualizarConfiguracoes({
            nomeEstabelecimento: document.getElementById('config-nome').value,
            chavePix: document.getElementById('config-pix').value,
            telefone: document.getElementById('config-telefone').value,
            endereco: document.getElementById('config-endereco').value,
            taxaEntrega: parseFloat(document.getElementById('config-taxa').value) || 0,
            tempoPreparo: parseInt(document.getElementById('config-tempo').value) || 30
        });
        alert('Configurações salvas!');
        atualizarStatusBanco();
    });
}

// ============================================
// SISTEMA DE REGRAS CONDICIONAIS
// ============================================

// Inicializar condicionais no banco de dados se não existir
function inicializarCondicionais() {
    if (!db.data) db.data = {};
    if (!db.data.condicionais) {
        db.data.condicionais = [];
        db.saveData();
    }
}

// Obter todas as condicionais
function getCondicionais() {
    inicializarCondicionais();
    return db.data.condicionais || [];
}

// Obter condicionais ativas ordenadas por prioridade
function getCondicionaisAtivas() {
    return getCondicionais()
        .filter(c => c.ativo !== false)
        .sort((a, b) => (a.prioridade || 999) - (b.prioridade || 999));
}

// Renderizar lista de condicionais
function renderizarCondicionais() {
    inicializarCondicionais();
    const container = document.getElementById('lista-condicionais');
    if (!container) return;
    
    const condicionais = getCondicionais();
    
    if (condicionais.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--texto-medio);">
                <i class="fas fa-sliders-h" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>Nenhuma regra condicional cadastrada.</p>
                <p style="font-size: 14px; margin-top: 10px;">Clique em "Nova Regra" para criar sua primeira regra.</p>
            </div>
        `;
        return;
    }
    
    // Ordenar por prioridade
    const condicionaisOrdenadas = [...condicionais].sort((a, b) => (a.prioridade || 999) - (b.prioridade || 999));
    
    container.innerHTML = condicionaisOrdenadas.map(cond => {
        const condicoes = [];
        if (cond.pagamento) condicoes.push(`Pagamento: ${cond.pagamento.toUpperCase()}`);
        if (cond.valorMinimo) condicoes.push(`Valor mínimo: R$ ${cond.valorMinimo.toFixed(2)}`);
        if (cond.quantidadeMinima) condicoes.push(`Qtd. mínima: ${cond.quantidadeMinima} itens`);
        
        const acoes = [];
        if (cond.acaoTipo === 'desconto_percentual') {
            acoes.push(`Desconto: ${cond.acaoValor}%`);
        } else if (cond.acaoTipo === 'desconto_fixo') {
            acoes.push(`Desconto: R$ ${cond.acaoValor.toFixed(2)}`);
        } else if (cond.acaoTipo === 'frete_gratis') {
            acoes.push('Frete Grátis');
            if (cond.distanciaMaxFreteGratis) {
                acoes.push(`(até ${cond.distanciaMaxFreteGratis}km)`);
            }
        } else if (cond.acaoTipo === 'desconto_percentual_frete_gratis') {
            acoes.push(`Desconto: ${cond.acaoValor}% + Frete Grátis`);
            if (cond.distanciaMaxFreteGratis) {
                acoes.push(`(até ${cond.distanciaMaxFreteGratis}km)`);
            }
        }
        
        return `
            <div style="background: var(--bg-primary); border: 2px solid ${cond.ativo !== false ? 'var(--vermelho-claro)' : 'var(--borda)'}; border-radius: 12px; padding: 20px; transition: all 0.3s ease;" 
                 onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(220, 38, 38, 0.2)'" 
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <h3 style="color: var(--text-primary); margin: 0 0 8px 0; font-size: 18px; display: flex; align-items: center; gap: 10px;">
                            ${cond.nome}
                            ${cond.ativo === false ? '<span style="background: var(--texto-medio); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: normal;">Inativa</span>' : ''}
                            <span style="background: var(--vermelho-claro); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: normal;">
                                Prioridade: ${cond.prioridade || 999}
                            </span>
                        </h3>
                        <div style="color: var(--texto-medio); font-size: 14px; margin-top: 10px;">
                            <div style="margin-bottom: 8px;">
                                <strong style="color: var(--text-primary);">Condições:</strong> 
                                ${condicoes.length > 0 ? condicoes.join(' • ') : 'Sem condições específicas'}
                            </div>
                            <div>
                                <strong style="color: var(--text-primary);">Ações:</strong> 
                                ${acoes.join(' • ')}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" onclick="abrirModalCondicional(${cond.id})" style="padding: 8px 12px; font-size: 14px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger" onclick="excluirCondicional(${cond.id})" style="padding: 8px 12px; font-size: 14px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Abrir modal de condicional
window.abrirModalCondicional = function(condicionalId = null) {
    const modal = document.getElementById('modal-condicional');
    const titulo = document.getElementById('modal-condicional-titulo');
    const form = document.getElementById('form-condicional');
    
    if (condicionalId) {
        const cond = getCondicionais().find(c => c.id === condicionalId);
        if (cond) {
            titulo.textContent = 'Editar Regra Condicional';
            document.getElementById('condicional-id').value = cond.id;
            document.getElementById('condicional-nome').value = cond.nome;
            document.getElementById('condicional-prioridade').value = cond.prioridade || 1;
            document.getElementById('condicional-pagamento').value = cond.pagamento || '';
            document.getElementById('condicional-valor-min').value = cond.valorMinimo || '';
            document.getElementById('condicional-qtd-min').value = cond.quantidadeMinima || '';
            document.getElementById('condicional-acao-tipo').value = cond.acaoTipo || 'desconto_percentual';
            document.getElementById('condicional-acao-valor').value = cond.acaoValor || '';
            document.getElementById('condicional-distancia-max').value = cond.distanciaMaxFreteGratis || '';
            document.getElementById('condicional-ativo').checked = cond.ativo !== false;
            
            atualizarCamposCondicional();
        }
    } else {
        titulo.textContent = 'Nova Regra Condicional';
        form.reset();
        document.getElementById('condicional-id').value = '';
        document.getElementById('condicional-prioridade').value = 1;
        document.getElementById('condicional-ativo').checked = true;
        atualizarCamposCondicional();
    }
    
    if (modal) {
        modal.style.display = 'flex';
    }
};

// Atualizar campos do formulário baseado no tipo de ação
function atualizarCamposCondicional() {
    const tipoAcao = document.getElementById('condicional-acao-tipo').value;
    const valorContainer = document.getElementById('condicional-valor-container');
    const valorLabel = document.getElementById('condicional-valor-label');
    const valorInput = document.getElementById('condicional-acao-valor');
    const distanciaContainer = document.getElementById('condicional-distancia-container');
    
    if (tipoAcao === 'frete_gratis') {
        valorContainer.style.display = 'none';
        valorInput.removeAttribute('required');
        distanciaContainer.style.display = 'block';
    } else if (tipoAcao === 'desconto_percentual_frete_gratis') {
        valorContainer.style.display = 'block';
        valorLabel.textContent = 'Valor do Desconto (%) *';
        valorInput.setAttribute('required', 'required');
        distanciaContainer.style.display = 'block';
    } else {
        valorContainer.style.display = 'block';
        distanciaContainer.style.display = 'none';
        valorInput.setAttribute('required', 'required');
        if (tipoAcao === 'desconto_percentual') {
            valorLabel.textContent = 'Valor do Desconto (%) *';
        } else {
            valorLabel.textContent = 'Valor do Desconto (R$) *';
        }
    }
}

// Event listener para mudança no tipo de ação
document.addEventListener('DOMContentLoaded', function() {
    const acaoTipo = document.getElementById('condicional-acao-tipo');
    if (acaoTipo) {
        acaoTipo.addEventListener('change', atualizarCamposCondicional);
    }
});

// --- Overlay de carregamento e fallback de ícones (gestor)
function hideSiteLoadingOverlayGestor() {
    const overlay = document.getElementById('site-loading-overlay');
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
    }
}
window.addEventListener('load', hideSiteLoadingOverlayGestor);
setTimeout(hideSiteLoadingOverlayGestor, 8000);

function applyIconFallbacksGestor() {
    document.querySelectorAll('i[class*="fa-"]').forEach(el => {
        const classes = Array.from(el.classList);
        const nameClass = classes.find(c => c.startsWith('fa-') && !['fas','far','fal','fab','fad'].includes(c));
        if (!nameClass) return;
        const name = nameClass.replace('fa-', '');
        const map = {
            'fish':'🐟','shopping-cart':'🛒','user':'👤','times':'✖️','image':'🖼️','photo':'🖼️','camera':'🖼️','plus':'➕','star':'⭐','ticket-alt':'🎟️','clipboard-list':'📋','eye':'👁️','info-circle':'ℹ️'
        };
        const emoji = map[name] || '';
        if (emoji) {
            el.textContent = emoji;
            el.style.fontStyle = 'normal';
        }
    });
}

document.addEventListener('DOMContentLoaded', applyIconFallbacksGestor);
setTimeout(applyIconFallbacksGestor, 2000);

// Salvar condicional
window.salvarCondicional = function(event) {
    event.preventDefault();
    
    inicializarCondicionais();
    
    const id = document.getElementById('condicional-id').value;
    const nome = document.getElementById('condicional-nome').value;
    const prioridade = parseInt(document.getElementById('condicional-prioridade').value) || 1;
    const pagamento = document.getElementById('condicional-pagamento').value || null;
    const valorMinimo = parseFloat(document.getElementById('condicional-valor-min').value) || null;
    const quantidadeMinima = parseInt(document.getElementById('condicional-qtd-min').value) || null;
    const acaoTipo = document.getElementById('condicional-acao-tipo').value;
    const acaoValor = parseFloat(document.getElementById('condicional-acao-valor').value) || null;
    const distanciaMaxFreteGratis = parseFloat(document.getElementById('condicional-distancia-max').value) || null;
    const ativo = document.getElementById('condicional-ativo').checked;
    
    // Validar campos obrigatórios baseado no tipo de ação
    if (acaoTipo !== 'frete_gratis' && !acaoValor) {
        alert('Preencha o valor do desconto!');
        return;
    }
    
    const condicionais = getCondicionais();
    let condicional;
    
    if (id) {
        // Editar existente
        const index = condicionais.findIndex(c => c.id === parseInt(id));
        if (index !== -1) {
            condicional = {
                ...condicionais[index],
                nome,
                prioridade,
                pagamento,
                valorMinimo,
                quantidadeMinima,
                acaoTipo,
                acaoValor,
                distanciaMaxFreteGratis,
                ativo
            };
            condicionais[index] = condicional;
        }
    } else {
        // Novo
        const novoId = condicionais.length > 0 ? Math.max(...condicionais.map(c => c.id || 0)) + 1 : 1;
        condicional = {
            id: novoId,
            nome,
            prioridade,
            pagamento,
            valorMinimo,
            quantidadeMinima,
            acaoTipo,
            acaoValor,
            distanciaMaxFreteGratis,
            ativo,
            dataCriacao: new Date().toISOString()
        };
        condicionais.push(condicional);
    }
    
    db.data.condicionais = condicionais;
    db.saveData();
    
    // Salvar no servidor se disponível
    salvarCondicionaisNoServidor(condicionais).catch(e => {
        console.warn('Erro ao salvar condicionais no servidor:', e);
    });
    
    renderizarCondicionais();
    fecharModal('modal-condicional');
    alert('Regra condicional salva com sucesso!');
};

// Excluir condicional
window.excluirCondicional = function(id) {
    if (!confirm('Tem certeza que deseja excluir esta regra condicional?')) {
        return;
    }
    
    inicializarCondicionais();
    const condicionais = getCondicionais();
    const index = condicionais.findIndex(c => c.id === id);
    
    if (index !== -1) {
        condicionais.splice(index, 1);
        db.data.condicionais = condicionais;
        db.saveData();
        
        // Salvar no servidor
        salvarCondicionaisNoServidor(condicionais).catch(e => {
            console.warn('Erro ao salvar condicionais no servidor:', e);
        });
        
        renderizarCondicionais();
        alert('Regra condicional excluída!');
    }
};

// Salvar condicionais no servidor
async function salvarCondicionaisNoServidor(condicionais) {
    try {
        // Tentar salvar via API se disponível
        const response = await fetch(window.location.origin + '/api/condicionais', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(condicionais)
        });
        
        if (response.ok) {
            console.log('[CONDICIONAIS] ✅ Condicionais salvas no servidor');
        } else if (response.status === 503) {
            // Service Unavailable - salvar localmente
            console.warn('[CONDICIONAIS] ⚠️ Servidor indisponível (503), salvando localmente');
            localStorage.setItem('vetera_condicionais', JSON.stringify(condicionais));
        } else {
            throw new Error('Erro ao salvar no servidor');
        }
    } catch (e) {
        // Se não houver API, salvar no localStorage
        console.warn('[CONDICIONAIS] ⚠️ Erro ao salvar no servidor, salvando localmente:', e);
        localStorage.setItem('vetera_condicionais', JSON.stringify(condicionais));
    }
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
// SISTEMA DE HORÁRIOS DE FUNCIONAMENTO
// ============================================

// Carregar horários do servidor
async function carregarHorariosDoServidor() {
    try {
        const response = await fetch(window.location.origin + '/api/horarios');
        if (response.ok) {
            const horarios = await response.json();
            if (horarios) {
                if (!db.data) db.data = {};
                db.data.horarios = horarios;
                db.saveData();
                console.log('[HORARIOS] ✅ Horários carregados do servidor');
                return true;
            }
        } else if (response.status === 503) {
            // Service Unavailable - usar dados locais
            console.warn('[HORARIOS] ⚠️ Servidor indisponível (503), usando dados locais');
            if (db.data && db.data.horarios) {
                return true;
            }
        }
    } catch (e) {
        console.warn('[HORARIOS] ⚠️ Erro ao carregar do servidor:', e);
        // Em caso de erro, usar dados locais se disponíveis
        if (db.data && db.data.horarios) {
            return true;
        }
    }
    return false;
}

// Inicializar horários no banco de dados se não existir
function inicializarHorarios() {
    if (!db.data) db.data = {};
    if (!db.data.horarios) {
        // Horário padrão: 18:30 às 23:00 todos os dias
        db.data.horarios = {
            ativo: true,
            fuso: 'America/Sao_Paulo',
            statusManual: null, // null = usar horários automáticos, true/false = status manual
            dias: {
                domingo: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                segunda: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                terca: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                quarta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                quinta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                sexta: { aberto: true, abertura: '18:30', fechamento: '23:00' },
                sabado: { aberto: true, abertura: '18:30', fechamento: '23:00' }
            }
        };
        db.saveData();
    }
}

// Obter configuração de horários
function getHorarios() {
    inicializarHorarios();
    return db.data.horarios;
}

// Obter nome do dia da semana em português
function getNomeDia(dia) {
    const nomes = {
        domingo: 'Domingo',
        segunda: 'Segunda-feira',
        terca: 'Terça-feira',
        quarta: 'Quarta-feira',
        quinta: 'Quinta-feira',
        sexta: 'Sexta-feira',
        sabado: 'Sábado'
    };
    return nomes[dia] || dia;
}

// Renderizar interface de horários
function renderizarHorarios() {
    inicializarHorarios();
    const container = document.getElementById('horarios-dias');
    const statusContainer = document.getElementById('horarios-status');
    if (!container) return;
    
    const horarios = getHorarios();
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    
    // Renderizar campos para cada dia
    container.innerHTML = dias.map(dia => {
        const config = horarios.dias[dia] || { aberto: true, abertura: '18:30', fechamento: '23:00' };
        return `
            <div style="display: grid; grid-template-columns: 200px 1fr 1fr 1fr; gap: 15px; align-items: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px;">
                <div style="font-weight: 600; color: var(--text-primary);">${getNomeDia(dia)}</div>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="horario-${dia}-aberto" ${config.aberto ? 'checked' : ''} onchange="atualizarStatusHorarios()">
                    <span style="color: var(--text-primary);">Aberto</span>
                </label>
                <div>
                    <label class="form-label" style="font-size: 12px; margin-bottom: 5px;">Abertura</label>
                    <input type="time" class="form-input" id="horario-${dia}-abertura" value="${config.abertura || '18:30'}" ${!config.aberto ? 'disabled' : ''} onchange="atualizarStatusHorarios()">
                </div>
                <div>
                    <label class="form-label" style="font-size: 12px; margin-bottom: 5px;">Fechamento</label>
                    <input type="time" class="form-input" id="horario-${dia}-fechamento" value="${config.fechamento || '23:00'}" ${!config.aberto ? 'disabled' : ''} onchange="atualizarStatusHorarios()">
                </div>
            </div>
        `;
    }).join('');
    
    // Atualizar campos do formulário
    const ativoCheckbox = document.getElementById('horarios-ativo');
    const fusoSelect = document.getElementById('horarios-fuso');
    if (ativoCheckbox) ativoCheckbox.checked = horarios.ativo !== false;
    if (fusoSelect) fusoSelect.value = horarios.fuso || 'America/Sao_Paulo';
    
    // Adicionar listeners para habilitar/desabilitar campos
    dias.forEach(dia => {
        const checkbox = document.getElementById(`horario-${dia}-aberto`);
        const abertura = document.getElementById(`horario-${dia}-abertura`);
        const fechamento = document.getElementById(`horario-${dia}-fechamento`);
        
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                if (abertura) abertura.disabled = !this.checked;
                if (fechamento) fechamento.disabled = !this.checked;
                atualizarStatusHorarios();
            });
        }
    });
    
    // Atualizar status e botões
    atualizarStatusHorarios();
    atualizarBotoesAbrirFechar();
}

// Atualizar botões de abrir/fechar loja
function atualizarBotoesAbrirFechar() {
    const btnAbrir = document.getElementById('btn-abrir-loja');
    const btnFechar = document.getElementById('btn-fechar-loja');
    const btnAutomatico = document.getElementById('btn-voltar-automatico');
    
    if (!btnAbrir || !btnFechar) return;
    
    const horarios = getHorarios();
    const status = verificarStatusLoja();
    
    // Se há status manual, mostrar botão oposto e botão de voltar ao automático
    if (horarios.statusManual !== null && horarios.statusManual !== undefined) {
        if (btnAutomatico) btnAutomatico.style.display = 'block';
        
        if (horarios.statusManual) {
            // Loja está aberta manualmente, mostrar botão fechar
            btnAbrir.style.display = 'none';
            btnFechar.style.display = 'block';
        } else {
            // Loja está fechada manualmente, mostrar botão abrir
            btnAbrir.style.display = 'block';
            btnFechar.style.display = 'none';
        }
    } else {
        // Sem status manual, mostrar botão baseado no status atual
        if (btnAutomatico) btnAutomatico.style.display = 'none';
        
        if (status.aberta) {
            btnAbrir.style.display = 'none';
            btnFechar.style.display = 'block';
        } else {
            btnAbrir.style.display = 'block';
            btnFechar.style.display = 'none';
        }
    }
}

// Atualizar status atual da loja
function atualizarStatusHorarios() {
    const statusContainer = document.getElementById('horarios-status');
    if (!statusContainer) return;
    
    const status = verificarStatusLoja();
    
    if (status.aberta) {
        statusContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="width: 12px; height: 12px; background: var(--sucesso); border-radius: 50%; animation: pulse 2s infinite;"></div>
                <div>
                    <strong style="color: var(--sucesso); font-size: 16px;">Loja Aberta</strong>
                    <div style="color: var(--texto-medio); font-size: 14px; margin-top: 5px;">
                        Fecha às ${status.proximoFechamento}
                    </div>
                </div>
            </div>
        `;
    } else {
        statusContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="width: 12px; height: 12px; background: var(--vermelho-claro); border-radius: 50%;"></div>
                <div>
                    <strong style="color: var(--vermelho-claro); font-size: 16px;">Loja Fechada</strong>
                    <div style="color: var(--texto-medio); font-size: 14px; margin-top: 5px;">
                        ${status.mensagem}
                    </div>
                </div>
            </div>
        `;
    }
}

// Salvar horários
window.salvarHorarios = async function(event) {
    event.preventDefault();
    
    inicializarHorarios();
    const horarios = getHorarios();
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    
    horarios.ativo = document.getElementById('horarios-ativo').checked;
    horarios.fuso = document.getElementById('horarios-fuso').value;
    
    dias.forEach(dia => {
        const aberto = document.getElementById(`horario-${dia}-aberto`).checked;
        const abertura = document.getElementById(`horario-${dia}-abertura`).value;
        const fechamento = document.getElementById(`horario-${dia}-fechamento`).value;
        
        horarios.dias[dia] = {
            aberto: aberto,
            abertura: abertura,
            fechamento: fechamento
        };
    });
    
    db.data.horarios = horarios;
    db.saveData();
    
    // Salvar no servidor
    await salvarHorariosNoServidor(horarios);
    
    atualizarStatusHorarios();
    atualizarBotoesAbrirFechar();
    alert('Horários salvos com sucesso!');
};

// Salvar horários no servidor
async function salvarHorariosNoServidor(horarios) {
    try {
        const response = await fetch(window.location.origin + '/api/horarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(horarios)
        });
        
        if (response.ok) {
            console.log('[HORARIOS] ✅ Horários salvos no servidor');
            return true;
        } else if (response.status === 503) {
            // Service Unavailable - salvar localmente
            console.warn('[HORARIOS] ⚠️ Servidor indisponível (503), salvando localmente');
            if (db && db.data) {
                db.data.horarios = horarios;
                db.saveData();
            }
            return false;
        } else {
            throw new Error('Erro ao salvar no servidor');
        }
    } catch (e) {
        console.warn('[HORARIOS] ⚠️ Erro ao salvar no servidor:', e);
        // Salvar localmente em caso de erro
        if (db && db.data) {
            db.data.horarios = horarios;
            db.saveData();
        }
        return false;
    }
}

// Abrir loja manualmente
window.abrirLojaManual = async function() {
    if (!confirm('Deseja abrir a loja manualmente? Isso irá sobrescrever os horários automáticos.')) {
        return;
    }
    
    try {
        const response = await fetch(window.location.origin + '/api/horarios', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statusManual: true })
        });
        
        if (response.ok) {
            // Recarregar horários do servidor
            await carregarHorariosDoServidor();
            atualizarStatusHorarios();
            atualizarBotoesAbrirFechar();
            alert('✅ Loja aberta manualmente!');
        } else if (response.status === 503) {
            // Service Unavailable - atualizar localmente
            console.warn('[HORARIOS] ⚠️ Servidor indisponível (503), atualizando localmente');
            if (db && db.data && db.data.horarios) {
                db.data.horarios.statusManual = true;
                db.data.horarios.aberta = true;
                db.saveData();
                atualizarStatusHorarios();
                atualizarBotoesAbrirFechar();
                alert('⚠️ Loja aberta localmente (servidor indisponível).');
            } else {
                alert('Erro: servidor indisponível e não há dados locais.');
            }
        } else {
            throw new Error('Erro ao atualizar status');
        }
    } catch (e) {
        console.error('[HORARIOS] ❌ Erro ao abrir loja:', e);
        alert('Erro ao abrir loja. Tente novamente.');
    }
};

// Fechar loja manualmente
window.fecharLojaManual = async function() {
    if (!confirm('Deseja fechar a loja manualmente? Isso irá bloquear todas as compras até que você abra novamente.')) {
        return;
    }
    
    try {
        const response = await fetch(window.location.origin + '/api/horarios', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statusManual: false })
        });
        
        if (response.ok) {
            // Recarregar horários do servidor
            await carregarHorariosDoServidor();
            atualizarStatusHorarios();
            atualizarBotoesAbrirFechar();
            alert('🔒 Loja fechada manualmente!');
        } else if (response.status === 503) {
            // Service Unavailable - atualizar localmente
            console.warn('[HORARIOS] ⚠️ Servidor indisponível (503), atualizando localmente');
            if (db && db.data && db.data.horarios) {
                db.data.horarios.statusManual = false;
                db.data.horarios.aberta = false;
                db.saveData();
                atualizarStatusHorarios();
                atualizarBotoesAbrirFechar();
                alert('⚠️ Loja fechada localmente (servidor indisponível).');
            } else {
                alert('Erro: servidor indisponível e não há dados locais.');
            }
        } else {
            throw new Error('Erro ao atualizar status');
        }
    } catch (e) {
        console.error('[HORARIOS] ❌ Erro ao fechar loja:', e);
        alert('Erro ao fechar loja. Tente novamente.');
    }
};

// Voltar ao modo automático (remover status manual)
window.voltarModoAutomatico = async function() {
    if (!confirm('Deseja voltar ao modo automático? A loja seguirá os horários configurados.')) {
        return;
    }
    
    try {
        // Atualizar localmente primeiro
        const horarios = getHorarios();
        horarios.statusManual = null;
        db.data.horarios = horarios;
        db.saveData();
        
        // Salvar no servidor
        await salvarHorariosNoServidor(horarios);
        
        atualizarStatusHorarios();
        atualizarBotoesAbrirFechar();
        alert('✅ Modo automático ativado!');
    } catch (e) {
        console.error('[HORARIOS] ❌ Erro ao voltar ao automático:', e);
        alert('Erro ao voltar ao modo automático. Tente novamente.');
    }
};

// Verificar se a loja está aberta
window.verificarStatusLoja = function() {
    inicializarHorarios();
    const horarios = getHorarios();
    
    // Verificar status manual primeiro (tem prioridade)
    if (horarios.statusManual !== null && horarios.statusManual !== undefined) {
        if (horarios.statusManual) {
            return {
                aberta: true,
                mensagem: 'Loja aberta manualmente',
                proximoFechamento: null,
                statusManual: true
            };
        } else {
            return {
                aberta: false,
                mensagem: 'Loja fechada manualmente. Aguarde abertura.',
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
        
        return {
            aberta: false,
            mensagem: proximaAbertura 
                ? `Abrimos novamente ${getNomeDia(proximoDiaAberto)} às ${proximaAbertura}`
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
        
        return {
            aberta: false,
            mensagem: proximaAbertura 
                ? `Abrimos novamente ${getNomeDia(proximoDiaAberto)} às ${proximaAbertura}`
                : 'Loja fechada',
            proximoFechamento: null,
            proximaAbertura: proximaAbertura,
            proximoDia: proximoDiaAberto
        };
    }
};

// Atualizar status periodicamente
setInterval(() => {
    if (document.getElementById('horarios-status')) {
        atualizarStatusHorarios();
    }
}, 60000); // Atualizar a cada minuto
