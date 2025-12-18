// ============================================
// SISTEMA PRINCIPAL - CARDÁPIO ONLINE
// ============================================

let categoriaSelecionada = 'Todas';
let cupomAplicado = null;

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
    if (typeof db === 'undefined') {
        // Tentar novamente após um delay
        setTimeout(() => {
            if (typeof db !== 'undefined') {
                inicializarCardapio();
                atualizarStatusLojaIndicador();
            }
        }, 1000);
        return;
    }
    
    await inicializarCardapio();
    
    // Carregar horários do servidor
    await carregarHorariosDoServidorMain();
    atualizarStatusLojaIndicador();
    
    // Atualizar status e recarregar horários periodicamente
    setInterval(async () => {
        await carregarHorariosDoServidorMain();
        atualizarStatusLojaIndicador();
    }, 30000); // A cada 30 segundos
});

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
                <div style="width: 10px; height: 10px; background: var(--sucesso); border-radius: 50%; animation: pulse 2s infinite;"></div>
                <span style="color: var(--sucesso); font-weight: 600; font-size: 14px;">Loja Aberta</span>
                <span style="color: var(--texto-medio); font-size: 12px;">• Fecha às ${status.proximoFechamento || '23:00'}</span>
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
                <div style="width: 10px; height: 10px; background: var(--vermelho-claro); border-radius: 50%;"></div>
                <span style="color: var(--vermelho-claro); font-weight: 600; font-size: 14px;">Loja Fechada</span>
            `;
            indicador.style.background = 'rgba(220, 38, 38, 0.1)';
            indicador.style.borderColor = 'rgba(220, 38, 38, 0.3)';
        }
    } else {
        // Esconder mensagem se não conseguir verificar
        if (mensagemFechada) mensagemFechada.style.display = 'none';
        
        indicador.innerHTML = `
            <div style="width: 10px; height: 10px; background: var(--sucesso); border-radius: 50%;"></div>
            <span style="color: var(--sucesso); font-weight: 600; font-size: 14px;">Loja Aberta</span>
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
        } catch (e) {
            console.error('[MAIN] ❌ Erro ao buscar dados:', e);
            // Se falhar, usar dados do localStorage (já carregados)
        }
        
        // Garantir que categorias existem (extrair de produtos se necessário)
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
    const container = document.getElementById('categorias-container');
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

// Renderizar produtos
function renderizarProdutos() {
    const container = document.getElementById('produtos-container');
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
    
    let produtos = categoriaSelecionada === 'Todas' 
        ? db.getProdutos() 
        : db.getProdutos(categoriaSelecionada);


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

    container.innerHTML = produtos.map(produto => {
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
        const imagemUrl = produto.imagem ? (produto.imagem.startsWith('http') || produto.imagem.startsWith('/') ? produto.imagem : '/Fotos/' + produto.imagem).replace(/[<>'"]/g, '') : '';
        
        return '<div class="produto-card">' +
            '<div class="produto-imagem-container">' +
            (produto.imagem ? 
                '<img src="' + imagemUrl + '" alt="' + nomeSeguro + '" class="produto-imagem" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">' +
                '<div class="produto-imagem-placeholder" style="display: none;">Foto</div>' :
                '<div class="produto-imagem-placeholder">Foto</div>'
            ) +
            '</div>' +
            '<div class="produto-conteudo">' +
            '<h3 class="produto-nome">' + nomeSeguro + '</h3>' +
            '<p class="produto-descricao">' + descricaoSegura + '</p>' +
            descontoInfo +
            '<div class="produto-controles">' +
            '<div class="quantidade-controle">' +
            '<button class="quantidade-btn" onclick="diminuirQuantidade(' + produto.id + ')">-</button>' +
            '<span class="quantidade-valor" id="qtd-' + produto.id + '">0</span>' +
            '<button class="quantidade-btn" onclick="aumentarQuantidade(' + produto.id + ')">+</button>' +
            '</div>' +
            '<button class="adicionar-btn" onclick="adicionarAoCarrinho(' + produto.id + ')">Adicionar</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    }).join('');

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
    const qtdElement = document.getElementById(`qtd-${produtoId}`);
    if (!qtdElement) return;
    let quantidade = parseInt(qtdElement.textContent) || 0;
    quantidade++;
    qtdElement.textContent = quantidade;
}

// Diminuir quantidade
function diminuirQuantidade(produtoId) {
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
        if (imagem && !imagem.startsWith('http') && !imagem.startsWith('/')) {
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

// Abrir modal de checkout
function abrirCheckoutModal() {
    // Verificar se a loja está aberta
    if (typeof verificarStatusLoja === 'function') {
        const status = verificarStatusLoja();
        if (!status.aberta) {
            // Não usar alert, apenas não abrir o modal
            // A mensagem já está visível na tela
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
            if (imagem && !imagem.startsWith('http') && !imagem.startsWith('/')) {
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
    
    // Atualizar totais
    atualizarTotaisCheckout();
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
            // Não usar alert, apenas não processar
            // A mensagem já está visível na tela
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
    const bairro = document.getElementById('checkout-bairro')?.value.trim();
    const cep = document.getElementById('checkout-cep')?.value.trim();
    const observacoes = document.getElementById('checkout-observacoes')?.value.trim();
    const formaPagamento = document.querySelector('input[name="checkout-pagamento"]:checked')?.value || 'pix';
    
    if (!nome || !telefone || !endereco || !bairro || !cep) {
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
    
    // Preparar itens
    const itensParaPedido = itens.map(item => ({
        produtoId: item.produtoId,
        nome: item.nome,
        preco: parseFloat(item.preco) || 0,
        quantidade: parseInt(item.quantidade) || 0
    }));
    
    // Cliente não precisa estar logado - usar dados do formulário
    const clienteId = null;
    
    // Criar pedido
    const enderecoCompleto = `${endereco}, ${bairro} - CEP: ${cep}`;
    
    
    if (typeof db === 'undefined' || typeof db.criarPedido !== 'function') {
        console.error('[MAIN] ❌ db ou db.criarPedido não está disponível!');
        alert('Erro: Sistema de banco de dados não disponível. Recarregue a página.');
        return;
    }
    
    let pedido;
    try {
        pedido = db.criarPedido({
            clienteId: clienteId,
            clienteNome: nome,
            clienteTelefone: telefone,
            clienteEndereco: enderecoCompleto,
            itens: itensParaPedido,
            subtotal: subtotal,
            desconto: desconto + descontoCondicional,
            taxaEntrega: taxaEntrega,
            total: total,
            formaPagamento: formaPagamento,
            observacoes: observacoes,
            cupom: cupomAplicado ? cupomAplicado.codigo : null
        });
        
        console.log('[MAIN] ✅ Pedido criado com sucesso! ID:', pedido.id);
        
        // Sugerir notificações do navegador
        if (typeof window.sugerirNotificacoes === 'function') {
            window.sugerirNotificacoes();
        }
        
        // Iniciar verificação de status do pedido
        if (typeof window.verificarStatusPedido === 'function') {
            window.verificarStatusPedido(pedido.id);
        }
        
        // Notificar PDV/Gestor sobre novo pedido (disparar beep)
        try {
            // PRIMEIRO: Salvar flag no localStorage
            localStorage.setItem('vetera_novo_pedido', JSON.stringify({
                pedidoId: pedido.id,
                timestamp: Date.now()
            }));
            
            // DEPOIS: Disparar evento para gestor.js ouvir
            const evento = new CustomEvent('novoPedidoCriado', { 
                detail: { pedido: pedido },
                bubbles: true,
                cancelable: true
            });
            
            // Disparar em window e document
            window.dispatchEvent(evento);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(evento);
            }
        } catch (e) {
            console.error('[MAIN] ❌ Erro ao notificar PDV:', e);
        }
    } catch (error) {
        console.error('[MAIN] ❌ Erro ao criar pedido:', error);
        alert('Erro ao criar pedido. Tente novamente.');
        return;
    }
    
    // Limpar carrinho
    if (typeof window.carrinho !== 'undefined') {
        window.carrinho.limpar();
    }
    localStorage.removeItem('vetera_carrinho');
    localStorage.removeItem('vetera_pedido_temporario');
    
    // Fechar modal de checkout
    fecharModal('modal-checkout');
    
    // Mostrar QR Code PIX
    if (formaPagamento === 'pix' && pedido) {
        mostrarQRCodePix(pedido);
    } else if (pedido) {
        alert(`Pedido #${pedido.id} criado com sucesso!`);
    }
}

// Mostrar QR Code PIX
function mostrarQRCodePix(pedido) {
    // Usar a chave PIX fixa do Mercado Pago
    const chavePixFixa = pixPayment.getChavePixFixa();
    const modal = document.getElementById('modal-pix');
    const container = document.getElementById('pix-container');
    
    if (!modal || !container) return;
    
    pixPayment.renderizarQRCode('pix-container', chavePixFixa, pedido.total, `Pedido #${pedido.id} - Vetera Sushi`);
    modal.classList.add('active');
    localStorage.setItem('vetera_pedido_aguardando_pix', pedido.id);
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

// Inicializar horários no banco de dados se não existir
function inicializarHorarios() {
    if (!db || !db.data) return;
    if (!db.data.horarios) {
        // Horário padrão: 18:30 às 23:00 todos os dias
        db.data.horarios = {
            ativo: true,
            fuso: 'America/Sao_Paulo',
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

// Carregar horários do servidor (versão para main.js)
async function carregarHorariosDoServidorMain() {
    try {
        const response = await fetch(window.location.origin + '/api/horarios');
        if (response.ok) {
            const horarios = await response.json();
            if (horarios) {
                if (!db || !db.data) return false;
                db.data.horarios = horarios;
                db.saveData();
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


