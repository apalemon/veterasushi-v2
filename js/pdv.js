// ============================================
// SISTEMA PDV - GERENCIAMENTO DE PEDIDOS
// ============================================

let pedidoSelecionado = null;
let filtroAtivo = 'todos';

// Inicializar PDV
document.addEventListener('DOMContentLoaded', () => {
    const init = async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!db.data) {
            await db.fetchInitialData();
        }
        renderizarPedidos();
    };
    
    init();
    
    // Atualizar a cada 5 segundos
    setInterval(() => {
        renderizarPedidos();
        if (pedidoSelecionado) {
            atualizarDetalhesPedido(pedidoSelecionado);
        }
    }, 5000);
});

// Filtrar pedidos
function filtrarPedidos(status) {
    filtroAtivo = status;
    
    // Atualizar botões ativos
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(status.replace('_', ' ')) || 
            (status === 'todos' && btn.textContent === 'Todos')) {
            btn.classList.add('active');
        }
    });
    
    renderizarPedidos();
}

// Renderizar lista de pedidos
function renderizarPedidos() {
    const container = document.getElementById('pedidos-lista');
    if (!container) return;

    let pedidos = filtroAtivo === 'todos' 
        ? db.getPedidos() 
        : db.getPedidos().filter(p => p.status === filtroAtivo);

    if (pedidos.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--texto-medio); padding: 2rem;">Nenhum pedido encontrado</p>';
        return;
    }

    container.innerHTML = pedidos.map(pedido => {
        const statusClass = `status-${pedido.status}`;
        const statusText = formatarStatus(pedido.status);
        const dataFormatada = new Date(pedido.data).toLocaleString('pt-BR');
        
        return `
            <div class="pedido-card ${pedidoSelecionado?.id === pedido.id ? 'selecionado' : ''}" 
                 onclick="selecionarPedido(${pedido.id})">
                <div class="pedido-header">
                    <div class="pedido-id">#${pedido.id}</div>
                    <div class="pedido-status ${statusClass}">${statusText}</div>
                </div>
                <div class="pedido-info">
                    <strong>Cliente:</strong> ${pedido.clienteNome || 'Não informado'}
                </div>
                <div class="pedido-info">
                    <strong>Telefone:</strong> ${pedido.clienteTelefone || 'Não informado'}
                </div>
                <div class="pedido-info">
                    <strong>Data:</strong> ${dataFormatada}
                </div>
                <div class="pedido-info">
                    <strong>Pagamento:</strong> ${formatarFormaPagamento(pedido.formaPagamento)} - 
                    <span style="color: ${pedido.statusPagamento === 'pago' ? 'var(--sucesso)' : 'var(--aviso)'};">
                        ${pedido.statusPagamento === 'pago' ? 'Pago' : 'Pendente'}
                    </span>
                </div>
                <div class="pedido-total">
                    Total: R$ ${(Number(pedido.total) || 0).toFixed(2)}
                </div>
            </div>
        `;
    }).join('');
}

// Selecionar pedido
function selecionarPedido(pedidoId) {
    const pedido = db.getPedido(pedidoId);
    if (!pedido) return;

    pedidoSelecionado = pedido;
    renderizarPedidos(); // Atualizar para mostrar seleção
    atualizarDetalhesPedido(pedido);
}

// Atualizar detalhes do pedido
function atualizarDetalhesPedido(pedido) {
    const container = document.getElementById('pedido-detalhes');
    if (!container) return;

    const statusClass = `status-${pedido.status}`;
    const statusText = formatarStatus(pedido.status);
    const dataFormatada = new Date(pedido.data).toLocaleString('pt-BR');

    container.innerHTML = `
        <div class="detalhes-header">
            <h2 class="detalhes-titulo">Pedido #${pedido.id}</h2>
            <div class="pedido-status ${statusClass}" style="display: inline-block;">
                ${statusText}
            </div>
        </div>

        <div class="detalhes-item">
            <div class="detalhes-item-nome"><i class="fas fa-user"></i> Informações do Cliente</div>
            <div class="detalhes-item-info">
                <strong>Nome:</strong> ${pedido.clienteNome || 'Não informado'}<br>
                <strong>Telefone:</strong> ${pedido.clienteTelefone || 'Não informado'}<br>
                <strong>Endereço:</strong> ${pedido.clienteEndereco || 'Não informado'}<br>
                <strong>Data do Pedido:</strong> ${dataFormatada}
            </div>
        </div>

        <div class="detalhes-item">
            <div class="detalhes-item-nome"><i class="fas fa-shopping-basket"></i> Itens do Pedido</div>
            <div class="detalhes-item-info">
                ${pedido.itens.map(item => {
                    // Buscar produto para obter imagem
                    const produto = db.getProduto(item.produtoId);
                    let imagem = produto?.imagem || null;
                    if (imagem && !imagem.startsWith('http') && !imagem.startsWith('/')) {
                        imagem = '/Fotos/' + imagem;
                    } else if (!imagem) {
                        imagem = '/Fotos/produto-' + item.produtoId + '.png';
                    }
                    
                    // Sanitizar nome
                    const nomeSeguro = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(item.nome) : String(item.nome || '').replace(/[<>]/g, '');
                    const imagemSegura = typeof escapeHTML !== 'undefined' ? escapeHTML(imagem) : String(imagem || '').replace(/[<>'"]/g, '');
                    
                    return `
                    <div style="display: flex; gap: 12px; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--borda); align-items: center;">
                        <div style="flex-shrink: 0;">
                            <img src="${imagemSegura}" alt="${nomeSeguro}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 2px solid var(--borda);" onerror="this.src='logo.png'; this.style.width='50px'; this.style.height='50px';">
                        </div>
                        <div style="flex: 1;">
                            <strong>${nomeSeguro}</strong><br>
                            <span style="color: var(--texto-escuro);">R$ ${(Number(item.preco) || 0).toFixed(2)} x ${item.quantidade}</span>
                        </div>
                        <div style="color: var(--vermelho-claro); font-weight: bold;">
                            R$ ${(Number(item.preco) * Number(item.quantidade) || 0).toFixed(2)}
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        </div>

        <div class="detalhes-item">
            <div class="detalhes-item-nome"><i class="fas fa-credit-card"></i> Informações de Pagamento</div>
            <div class="detalhes-item-info">
                <strong>Forma de Pagamento:</strong> ${formatarFormaPagamento(pedido.formaPagamento)}<br>
                <strong>Status do Pagamento:</strong> 
                <span style="color: ${pedido.statusPagamento === 'pago' ? 'var(--sucesso)' : 'var(--aviso)'};">
                    ${pedido.statusPagamento === 'pago' ? '<i class="fas fa-check-circle"></i> Pago' : '<i class="fas fa-clock"></i> Pendente'}
                </span><br>
                <strong>Subtotal:</strong> R$ ${(Number(pedido.subtotal) || 0).toFixed(2)}<br>
                ${pedido.desconto > 0 ? `<strong>Desconto:</strong> - R$ ${(Number(pedido.desconto) || 0).toFixed(2)}<br>` : ''}
                <strong>Total:</strong> R$ ${(Number(pedido.total) || 0).toFixed(2)}
            </div>
        </div>

        ${pedido.observacoes ? `
        <div class="detalhes-item">
            <div class="detalhes-item-nome"><i class="fas fa-sticky-note"></i> Observações</div>
            <div class="detalhes-item-info">${pedido.observacoes}</div>
        </div>
        ` : ''}

        <div class="acoes-pedido">
            ${pedido.statusPagamento === 'pendente' ? `
                <button class="btn btn-success" onclick="confirmarPagamento(${pedido.id})" style="width: 100%;">
                    <i class="fas fa-check"></i> Confirmar Pagamento
                </button>
            ` : ''}

            ${pedido.statusPagamento === 'pago' && pedido.status === 'aguardando_pagamento' ? `
                <button class="btn btn-primary" onclick="iniciarPreparo(${pedido.id})" style="width: 100%;">
                    <i class="fas fa-play-circle"></i> Iniciar Preparo
                </button>
            ` : ''}

            ${pedido.status === 'em_preparo' ? `
                <button class="btn btn-success" onclick="finalizarPedido(${pedido.id})" style="width: 100%;">
                    <i class="fas fa-check-circle"></i> Finalizar Pedido
                </button>
            ` : ''}

            ${pedido.status === 'finalizado' ? `
                <button class="btn btn-secondary" onclick="imprimirNota(${pedido.id})" style="width: 100%;">
                    🖨️ Imprimir Nota
                </button>
            ` : ''}

            <button class="btn btn-secondary" onclick="gerarNotaFiscal(${pedido.id})" style="width: 100%;">
                <i class="fas fa-file-pdf"></i> Gerar Nota Fiscal
            </button>
        </div>
    `;
}

// Confirmar pagamento
function confirmarPagamento(pedidoId) {
    if (!confirm('Confirmar pagamento deste pedido?')) return;

    const pedido = db.atualizarPedido(pedidoId, {
        statusPagamento: 'pago'
    });

    if (pedido) {
        alert('Pagamento confirmado com sucesso!');
        selecionarPedido(pedidoId);
        renderizarPedidos();
    }
}

// Iniciar preparo
function iniciarPreparo(pedidoId) {
    if (!confirm('Iniciar preparo deste pedido?')) return;

    const pedido = db.atualizarPedido(pedidoId, {
        status: 'em_preparo'
    });

    if (pedido) {
        alert('Preparo iniciado!');
        selecionarPedido(pedidoId);
        renderizarPedidos();
    }
}

// Finalizar pedido
function finalizarPedido(pedidoId) {
    if (!confirm('Finalizar este pedido?')) return;

    const pedido = db.atualizarPedido(pedidoId, {
        status: 'finalizado'
    });

    if (pedido) {
        alert('Pedido finalizado com sucesso!');
        selecionarPedido(pedidoId);
        renderizarPedidos();
        
        // Imprimir nota automaticamente
        imprimirNota(pedidoId);
    }
}

// Imprimir nota
function imprimirNota(pedidoId) {
    const pedido = db.getPedido(pedidoId);
    if (!pedido) return;

    const config = db.getConfiguracoes();
    
    const nota = `
        ====================================
        ${config.nomeEstabelecimento || 'Vetera Sushi'}
        ====================================
        Pedido #${pedido.id}
        Data: ${new Date(pedido.data).toLocaleString('pt-BR')}
        ====================================
        
        CLIENTE:
        ${pedido.clienteNome}
        ${pedido.clienteTelefone}
        ${pedido.clienteEndereco}
        
        ====================================
        ITENS:
        ${pedido.itens.map(item => `
        ${item.nome}
        ${item.quantidade}x R$ ${(Number(item.preco) || 0).toFixed(2)} = R$ ${(Number(item.preco) * Number(item.quantidade) || 0).toFixed(2)}
        `).join('')}
        
        ====================================
        Subtotal: R$ ${pedido.subtotal.toFixed(2)}
        ${pedido.desconto > 0 ? `Desconto: - R$ ${pedido.desconto.toFixed(2)}\n` : ''}
        TOTAL: R$ ${pedido.total.toFixed(2)}
        ====================================
        
        Forma de Pagamento: ${formatarFormaPagamento(pedido.formaPagamento)}
        Status: ${formatarStatus(pedido.status)}
        
        ${pedido.observacoes ? `\nObservações: ${pedido.observacoes}\n` : ''}
        
        ====================================
        Obrigado pela preferência!
        ====================================
    `;

    // Abrir janela de impressão
    const janela = window.open('', '_blank');
    janela.document.write(`
        <html>
            <head>
                <title>Nota Fiscal - Pedido #${pedido.id}</title>
                <style>
                    body {
                        font-family: monospace;
                        padding: 20px;
                        background: white;
                        color: black;
                    }
                    pre {
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                </style>
            </head>
            <body>
                <pre>${nota}</pre>
                <script>
                    window.onload = function() {
                        window.print();
                    }
                </script>
            </body>
        </html>
    `);
}

// Gerar nota fiscal (função removida - usar a do gestor)
function gerarNotaFiscal(pedidoId) {
    // Redirecionar para gestor ou usar função similar
    alert('Use o gestor para gerar nota fiscal');
}

// Formatar status
function formatarStatus(status) {
    const statusMap = {
        'aguardando_pagamento': 'Aguardando Pagamento',
        'pago': 'Pago',
        'em_preparo': 'Em Preparo',
        'finalizado': 'Finalizado'
    };
    return statusMap[status] || status;
}

// Formatar forma de pagamento
function formatarFormaPagamento(forma) {
    if (!forma) return '';
    const parts = String(forma).split(':');
    const base = parts[0];
    const detalhe = parts[1] || null;
    const formasMap = {
        'pix': 'PIX',
        'pix_manual': 'PIX (manual)',
        'dinheiro': 'Dinheiro',
        'cartao': 'Cartão',
        'pagamento_na_entrega': 'Pagamento na entrega'
    };
    let label = formasMap[base] || base;
    if (detalhe) {
        label += ` (${detalhe.toUpperCase()})`;
    }
    return label;
}


