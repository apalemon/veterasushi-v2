// ============================================
// GERENCIAMENTO DE CARRINHO
// ============================================

class Carrinho {
  constructor() {
    // Carregar carrinho do localStorage (mantém itens ao atualizar página)
    this.itens = this.carregarCarrinho();
    // Aguardar um pouco antes de renderizar para garantir que DOM está pronto
    setTimeout(() => this.renderizar(), 100);
  }

  // Carregar carrinho do localStorage
  carregarCarrinho() {
    try {
      const stored = localStorage.getItem('vetera_carrinho');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Erro ao carregar carrinho:', error);
      return [];
    }
  }

  // Salvar carrinho no localStorage
  salvarCarrinho() {
    try {
      // Garantir que todos os itens tenham dados válidos antes de salvar
      const itensParaSalvar = this.itens.map(item => ({
        produtoId: item.produtoId,
        nome: item.nome,
        preco: parseFloat(item.preco) || 0,
        quantidade: parseInt(item.quantidade) || 0,
        imagem: item.imagem || null // Preservar imagem
      })).filter(item => item.quantidade > 0 && item.preco > 0);
      
      localStorage.setItem('vetera_carrinho', JSON.stringify(itensParaSalvar));
      // Atualizar this.itens com os dados normalizados
      this.itens = itensParaSalvar;
    } catch (error) {
      console.error('Erro ao salvar carrinho:', error);
    }
  }

  // Adicionar item ao carrinho
  adicionarItem(produtoId, quantidade = 1) {
    // Rate limiting (se disponível)
    try {
      if (typeof window.rateLimiter !== 'undefined' && typeof window.clienteAuth !== 'undefined') {
        const clienteId = window.clienteAuth.isAuthenticated() ? window.clienteAuth.getCurrentCliente()?.id : 'guest';
        const rateCheck = window.rateLimiter.canPerform('adicionarCarrinho', clienteId);
        if (!rateCheck.allowed) {
          this.mostrarFeedback(`Aguarde ${rateCheck.retryAfter}s antes de adicionar mais itens`);
          return false;
        }
      }
    } catch (e) {
      // Continuar se rate limiting não estiver disponível
    }

    const produto = db.getProduto(produtoId);
    if (!produto) {
      console.error('Produto não encontrado:', produtoId);
      return false;
    }

    // Calcular preço final (com desconto se houver)
    const precoOriginal = parseFloat(produto.preco) || 0;
    let precoFinal = precoOriginal;
    
    if (produto.desconto && produto.desconto.ativo && produto.desconto.valor) {
      if (produto.desconto.tipo === 'percentual') {
        precoFinal = precoOriginal * (1 - produto.desconto.valor / 100);
      } else if (produto.desconto.tipo === 'fixo') {
        precoFinal = precoOriginal - produto.desconto.valor;
        if (precoFinal < 0) precoFinal = 0;
      }
    }

    // Garantir que quantidade seja um número válido e positivo
    quantidade = Math.max(1, Math.floor(parseFloat(quantidade)) || 1);

    // IMPORTANTE: Recarregar itens do localStorage ANTES de adicionar
    // Isso garante que sempre trabalhamos com o estado mais atualizado
    const itensAtuais = this.carregarCarrinho();
    this.itens = itensAtuais;

    // Buscar item existente (usar findIndex para garantir que encontramos o correto)
    const itemIndex = this.itens.findIndex(item => item.produtoId === produtoId);

    if (itemIndex !== -1) {
      // Item já existe - SOMAR quantidade e atualizar preço (caso desconto tenha mudado)
      const itemExistente = this.itens[itemIndex];
      const quantidadeAtual = parseInt(itemExistente.quantidade) || 0;
      const novaQuantidade = quantidadeAtual + quantidade;
      itemExistente.quantidade = novaQuantidade;
      itemExistente.preco = precoFinal; // Atualizar para preço com desconto
    } else {
      // Novo item - adicionar ao carrinho
      this.itens.push({
        produtoId: produto.id,
        nome: produto.nome,
        preco: precoFinal, // Usar preço com desconto
        quantidade: quantidade,
        imagem: produto.imagem || null // Salvar imagem do produto
      });
    }
    
    // Garantir que item existente também tenha imagem se não tiver
    if (itemIndex !== -1 && !this.itens[itemIndex].imagem && produto.imagem) {
      this.itens[itemIndex].imagem = produto.imagem;
    }

    // Salvar e renderizar
    this.salvarCarrinho();
    
    // Forçar atualização imediata do contador
    const totalItens = this.contarItens();
    
    // Renderizar carrinho (atualiza contador visual)
    this.renderizar();
    
    // Atualizar quantidades visíveis nos produtos IMEDIATAMENTE
    // Usar setTimeout para garantir que o DOM foi atualizado
    setTimeout(() => {
      if (typeof atualizarQuantidadesVisiveis === 'function') {
        atualizarQuantidadesVisiveis();
      }
      
      // Atualizar contador do produto específico que foi adicionado
      const qtdElement = document.getElementById(`qtd-${produtoId}`);
      if (qtdElement) {
        const itemNoCarrinho = this.itens.find(item => item.produtoId === produtoId);
        if (itemNoCarrinho) {
          qtdElement.textContent = itemNoCarrinho.quantidade;
        }
      }
    }, 50);
    
    this.mostrarFeedback(`${quantidade} ${quantidade === 1 ? 'item' : 'itens'} adicionado${quantidade === 1 ? '' : 's'}! Total no carrinho: ${totalItens} itens`);
    return true;
  }

  // Remover item do carrinho
  removerItem(produtoId) {
    this.itens = this.itens.filter(item => item.produtoId !== produtoId);
    this.salvarCarrinho();
    this.renderizar();
  }

  // Atualizar quantidade de um item
  atualizarQuantidade(produtoId, quantidade) {
    if (quantidade <= 0) {
      this.removerItem(produtoId);
      return;
    }

    const item = this.itens.find(item => item.produtoId === produtoId);
    if (item) {
      item.quantidade = quantidade;
      this.salvarCarrinho();
      this.renderizar();
    }
  }

  // Limpar carrinho
  limpar() {
    this.itens = [];
    // Remover completamente do localStorage
    localStorage.removeItem('vetera_carrinho');
    this.renderizar();
  }

  // Calcular total
  calcularTotal() {
    return this.itens.reduce((total, item) => {
      return total + (item.preco * item.quantidade);
    }, 0);
  }

  // Contar itens
  contarItens() {
    return this.itens.reduce((total, item) => total + item.quantidade, 0);
  }

  // Renderizar carrinho flutuante
  renderizar() {
    const carrinhoContainer = document.getElementById('carrinho-flutuante');
    if (!carrinhoContainer) {
      // Tentar novamente depois se o container não existir ainda
      setTimeout(() => this.renderizar(), 100);
      return;
    }

    // Recarregar itens do localStorage para garantir dados atualizados
    this.itens = this.carregarCarrinho();
    
    const total = this.calcularTotal();
    const quantidade = this.contarItens();

    // Atualizar informações
    const totalElement = carrinhoContainer.querySelector('.carrinho-total');
    const itensElement = carrinhoContainer.querySelector('.carrinho-itens');
    const finalizarBtn = carrinhoContainer.querySelector('.finalizar-btn');

    if (totalElement) {
      totalElement.textContent = `Total: R$ ${total.toFixed(2)}`;
    }

    if (itensElement) {
      itensElement.textContent = `${quantidade} ${quantidade === 1 ? 'item' : 'itens'}`;
    }

    if (finalizarBtn) {
      finalizarBtn.disabled = quantidade === 0;
    }

    // Mostrar/ocultar carrinho
    if (quantidade > 0) {
      carrinhoContainer.classList.remove('hidden');
    } else {
      carrinhoContainer.classList.add('hidden');
    }
    
    // Atualizar carrinho detalhado se o modal estiver aberto
    if (typeof mostrarCarrinhoDetalhado === 'function') {
      const modalCarrinho = document.getElementById('modal-carrinho');
      if (modalCarrinho && modalCarrinho.classList.contains('active')) {
        mostrarCarrinhoDetalhado();
      }
    }
  }

  // Mostrar feedback visual
  mostrarFeedback(mensagem) {
    // Criar elemento de feedback se não existir
    let feedback = document.getElementById('feedback-mensagem');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'feedback-mensagem';
      feedback.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: var(--vermelho-claro);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(255, 68, 68, 0.4);
        z-index: 3000;
        animation: slideIn 0.3s ease;
      `;
      document.body.appendChild(feedback);
    }

    feedback.textContent = mensagem;
    feedback.style.display = 'block';

    setTimeout(() => {
      feedback.style.display = 'none';
    }, 3000);
  }

  // Obter itens do carrinho
  getItens() {
    return [...this.itens];
  }
}

// Instância global do carrinho
const carrinho = new Carrinho();
window.carrinho = carrinho; // Tornar global
