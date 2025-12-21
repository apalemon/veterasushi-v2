// ============================================
// GERENCIAMENTO DE BANCO DE DADOS JSON
// ============================================

class Database {
  constructor() {
    this.data = null;
    this.loadData();
  }

  // Carregar dados do JSON
  loadData() {
    try {
      const stored = localStorage.getItem('vetera_database');
      if (stored) {
        try {
          this.data = JSON.parse(stored);
        } catch (parseError) {
          // Se erro ao parsear, usar estrutura vazia
          this.data = {
            produtos: [],
            categorias: [],
            pedidos: [],
            clientes: [],
            cupons: [],
            condicionais: [],
            configuracoes: {},
            usuarios: []
          };
        }
      } else {
        this.data = {
          produtos: [],
          categorias: [],
          pedidos: [],
          clientes: [],
          cupons: [],
          configuracoes: {},
          usuarios: []
        };
      }
      
      // Garantir que todas as propriedades existem
      if (!this.data.produtos) this.data.produtos = [];
      if (!this.data.categorias) this.data.categorias = [];
      if (!this.data.pedidos) this.data.pedidos = [];
      if (!this.data.clientes) this.data.clientes = [];
      if (!this.data.cupons) this.data.cupons = [];
      if (!this.data.condicionais) this.data.condicionais = [];
      if (!this.data.horarios) this.data.horarios = null; // Será inicializado quando necessário
      if (!this.data.configuracoes) this.data.configuracoes = {};
      if (!this.data.usuarios) this.data.usuarios = [];
      
      // SEMPRE recarregar do arquivo para garantir dados atualizados (async)
      this.fetchInitialData().catch((err) => {
        console.error('[DATABASE] Erro ao buscar dados iniciais:', err);
        // Se falhar, manter dados do localStorage
      });
      // SEMPRE carregar pedidos do servidor (fonte principal)
      this.carregarPedidosServidor().catch((err) => {
        console.error('[DATABASE] Erro ao carregar pedidos:', err);
        // Se falhar, manter pedidos do localStorage
      });
    } catch (error) {
      // Em caso de erro, inicializar estrutura vazia
      this.data = {
        produtos: [],
        categorias: [],
        pedidos: [],
        clientes: [],
        cupons: [],
        configuracoes: {},
        usuarios: []
      };
      // Tentar carregar do servidor (sem bloquear)
      this.fetchInitialData().catch(() => {});
      this.carregarPedidosServidor().catch(() => {});
    }
  }

  // Carregar pedidos do servidor (pedidos.json) - SEMPRE usar servidor como fonte principal
  async carregarPedidosServidor() {
    try {
      const apiUrl = window.location.origin + '/api/pedidos';
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const pedidosServidor = await response.json();
        if (Array.isArray(pedidosServidor)) {
          if (!this.data) this.data = {};
          
          // REMOVER DUPLICATAS baseado no ID
          const pedidosUnicos = [];
          const idsVistos = new Set();
          
          pedidosServidor.forEach(pedido => {
            if (pedido && pedido.id && !idsVistos.has(pedido.id)) {
              idsVistos.add(pedido.id);
              pedidosUnicos.push(pedido);
            }
          });
          
          this.data.pedidos = pedidosUnicos;
          this.saveData();
          return pedidosUnicos;
        }
      }
    } catch (e) {
      // Servidor não disponível, usar localStorage (não quebrar o carregamento)
    }
    return this.data?.pedidos || [];
  }

  // Buscar dados iniciais do arquivo JSON
  async fetchInitialData() {
    try {
      // Usar endpoint seguro em vez de arquivo direto
      const apiUrl = window.location.origin + '/api/database?' + Date.now();
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const dataFromFile = await response.json();
        
        // SEMPRE usar cupons do arquivo (fonte principal)
        // O servidor é a fonte da verdade para cupons
        const cuponsDoArquivo = dataFromFile.cupons || [];
        
        // Atualizar dados do arquivo (endpoint não retorna usuários)
        this.data = {
          ...this.data, // Preservar dados locais (usuários, pedidos, etc)
          produtos: dataFromFile.produtos || this.data.produtos || [],
          categorias: dataFromFile.categorias || this.data.categorias || [],
          cupons: cuponsDoArquivo,
          configuracoes: dataFromFile.configuracoes || this.data.configuracoes || {}
        };

        // Tentar mesclar configurações persistidas no servidor (/api/configuracoes)
        (async () => {
          try {
            const resp = await fetch(window.location.origin + '/api/configuracoes');
            if (resp.ok) {
              const cfg = await resp.json();
              this.data.configuracoes = { ...(this.data.configuracoes || {}), ...(cfg || {}) };
              this.saveData();
            }
          } catch (e) {
            // Ignorar falhas ao mesclar configurações do servidor
          }
        })();
        
        // Garantir que categorias existem
        if (!this.data.categorias || this.data.categorias.length === 0) {
          this.data.categorias = this.data.produtos 
            ? [...new Set(this.data.produtos.map(p => p.categoria).filter(Boolean))]
            : [];
        }
        this.saveData();
      } else {
        if (response.status !== 200) {
          console.error('[DATABASE] Erro ao carregar dados:', response.status);
        }
        
        // Se API falhar (404, 500, etc), usar dados do localStorage
        if (this.data && this.data.produtos && this.data.produtos.length > 0) {
          // Já temos dados no localStorage, usar eles
          return;
        }
        // Se não temos dados, garantir estrutura mínima
        if (!this.data || !this.data.produtos) {
          this.data = {
            produtos: this.data?.produtos || [],
            categorias: this.data?.categorias || [],
            pedidos: this.data?.pedidos || [],
            clientes: this.data?.clientes || [],
            cupons: this.data?.cupons || [],
            configuracoes: this.data?.configuracoes || {},
            usuarios: this.data?.usuarios || []
          };
        }
      }
    } catch (error) {
      console.error('[DATABASE] Erro ao buscar dados:', error);
      
      // Se erro de rede ou qualquer outro, usar dados do localStorage
      if (this.data && this.data.produtos && this.data.produtos.length > 0) {
        // Já temos dados, continuar
        return;
      }
      // Se não temos dados, inicializar estrutura vazia
      if (!this.data || !this.data.produtos) {
        this.data = {
          produtos: this.data?.produtos || [],
          categorias: this.data?.categorias || [],
          pedidos: this.data?.pedidos || [],
          clientes: this.data?.clientes || [],
          cupons: this.data?.cupons || [],
          configuracoes: this.data?.configuracoes || {},
          usuarios: this.data?.usuarios || []
        };
      }
    }
  }

  // Salvar dados no localStorage
  saveData() {
    try {
      localStorage.setItem('vetera_database', JSON.stringify(this.data));
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
    }
  }

  // ============================================
  // PRODUTOS
  // ============================================

  getProdutos(categoria = null) {
    if (!this.data || !this.data.produtos) return [];
    // Retornar cópia e ordenar por campo `ordem` quando disponível
    let produtos = [...this.data.produtos].filter(p => p.ativo !== false);
    produtos.sort((a, b) => {
      const ao = (typeof a.ordem === 'number') ? a.ordem : 0;
      const bo = (typeof b.ordem === 'number') ? b.ordem : 0;
      return ao - bo;
    });
    if (categoria) {
      produtos = produtos.filter(p => p.categoria === categoria);
    }
    return produtos;
  }

  getProduto(id) {
    if (!this.data || !this.data.produtos) return null;
    return this.data.produtos.find(p => p.id === id);
  }

  getCategorias() {
    if (!this.data) return [];
    
    // Se não tiver categorias no array, extrair dos produtos
    if (!this.data.categorias || this.data.categorias.length === 0) {
      if (this.data.produtos && this.data.produtos.length > 0) {
        const categoriasUnicas = [...new Set(this.data.produtos.map(p => p.categoria).filter(Boolean))];
        this.data.categorias = categoriasUnicas;
        this.saveData();
        return categoriasUnicas;
      }
      return [];
    }
    
    return this.data.categorias;
  }

  // ============================================
  // PEDIDOS
  // ============================================

  getPedidos(status = null) {
    if (!this.data || !this.data.pedidos) return [];
    let pedidos = [...this.data.pedidos];
    if (status) {
      pedidos = pedidos.filter(p => p.status === status);
    }
    return pedidos.sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  getPedido(id) {
    if (!this.data || !this.data.pedidos) return null;
    return this.data.pedidos.find(p => p.id === id);
  }

  criarPedido(pedidoData) {
    try {
      if (!this.data.pedidos) {
        this.data.pedidos = [];
      }
      
      // Verificar se já existe pedido com mesmo ID (evitar duplicação)
      const idTemporario = Date.now();
      const pedidoExistente = this.data.pedidos.find(p => p.id === idTemporario);
      if (pedidoExistente) {
        // Pedido com ID já existe, usando timestamp único
        // Usar timestamp mais preciso para evitar duplicação
        const novoId = Date.now() + Math.random();
        pedidoData.id = novoId;
      }
      
      const novoPedido = {
        id: idTemporario,
        ...pedidoData,
        data: new Date().toISOString(),
        timestamp: idTemporario,
        status: 'aguardando_pagamento',
        statusPagamento: 'pendente'
      };

      // Verificar duplicação antes de adicionar
      const jaExiste = this.data.pedidos.some(p => 
        p.id === novoPedido.id || 
        (p.clienteTelefone === novoPedido.clienteTelefone && 
         p.timestamp === novoPedido.timestamp)
      );
      
      if (!jaExiste) {
        this.data.pedidos.push(novoPedido);
        this.saveData();
        
        // Salvar no servidor
        this.salvarPedidoEmArquivo(novoPedido);
        
        // Disparar evento para notificar PDV/Gestor
        try {
          localStorage.setItem('vetera_novo_pedido', JSON.stringify({
            pedidoId: novoPedido.id,
            timestamp: Date.now()
          }));
          
          const evento = new CustomEvent('novoPedidoCriado', { 
            detail: { pedido: novoPedido },
            bubbles: true,
            cancelable: true
          });
          
          window.dispatchEvent(evento);
          if (typeof document !== 'undefined') {
            document.dispatchEvent(evento);
          }
        } catch (e) {
          console.error('[DATABASE] Erro ao disparar evento:', e);
        }
      } else {
        // Pedido duplicado detectado, ignorando
      }
      
      return novoPedido;
    } catch (error) {
      console.error('[DATABASE] Erro ao criar pedido:', error);
      throw error;
    }
  }
  
  // Salvar pedido em arquivo JSON - SEMPRE salvar TODOS os pedidos
  async salvarPedidoEmArquivo(pedido) {
    try {
      // Garantir que o pedido está no array local
      if (!this.data.pedidos) this.data.pedidos = [];
      const indexLocal = this.data.pedidos.findIndex(p => p.id === pedido.id);
      if (indexLocal >= 0) {
        this.data.pedidos[indexLocal] = pedido;
      } else {
        this.data.pedidos.push(pedido);
      }
      this.saveData();
      
      // Salvar TODOS os pedidos via API (servidor é fonte principal)
      try {
        const apiUrl = window.location.origin + '/api/pedidos';
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(this.data.pedidos)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[DATABASE] Erro ao salvar pedidos:', response.status);
        }
      } catch (e) {
        console.error('[DATABASE] Erro ao salvar pedidos:', e);
        // Pedido já está salvo localmente, mas tentar novamente depois
      }
    } catch (error) {
      console.error('[DATABASE] Erro ao salvar pedido:', error);
    }
  }
  

  async atualizarPedido(id, atualizacoes) {
    if (!this.data || !this.data.pedidos) {
      console.error('[DATABASE] ❌ data.pedidos não existe');
      return null;
    }
    
    const index = this.data.pedidos.findIndex(p => p.id === id);
    if (index === -1) {
      console.error('[DATABASE] ❌ Pedido não encontrado:', id);
      return null;
    }
    
    // Atualizar pedido localmente
    this.data.pedidos[index] = {
      ...this.data.pedidos[index],
      ...atualizacoes
    };
    this.saveData();
    
    // Salvar TODOS os pedidos no servidor (MongoDB)
    try {
      const apiUrl = window.location.origin + '/api/pedidos';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(this.data.pedidos)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DATABASE] ✅ Pedidos salvos no servidor:', result);
        return this.data.pedidos[index];
      } else if (response.status === 503) {
        // Service Unavailable - avisar mas continuar com dados locais
        console.warn('[DATABASE] ⚠️ Servidor indisponível (503), pedido salvo localmente');
        // Retornar mesmo assim, pois foi salvo localmente
        return this.data.pedidos[index];
      } else {
        const errorText = await response.text();
        console.error('[DATABASE] ❌ Erro ao atualizar pedido no servidor:', response.status, errorText);
        // Retornar mesmo assim, pois foi salvo localmente
        return this.data.pedidos[index];
      }
    } catch (e) {
      console.error('[DATABASE] ❌ Erro ao salvar pedido no servidor:', e);
      // Retornar mesmo assim, pois foi salvo localmente
      return this.data.pedidos[index];
    }
  }

  // ============================================
  // CLIENTES
  // ============================================

  getClientes() {
    if (!this.data || !this.data.clientes) return [];
    return this.data.clientes;
  }

  getCliente(id) {
    if (!this.data || !this.data.clientes) return null;
    return this.data.clientes.find(c => c.id === id);
  }

  criarCliente(clienteData) {
    if (!this.data.clientes) this.data.clientes = [];
    
    const novoCliente = {
      id: Date.now(),
      ...clienteData,
      dataCadastro: new Date().toISOString(),
      pedidos: []
    };

    this.data.clientes.push(novoCliente);
    this.saveData();
    return novoCliente;
  }

  atualizarCliente(id, atualizacoes) {
    if (!this.data || !this.data.clientes) return null;
    
    const index = this.data.clientes.findIndex(c => c.id === id);
    if (index !== -1) {
      this.data.clientes[index] = {
        ...this.data.clientes[index],
        ...atualizacoes
      };
      this.saveData();
      return this.data.clientes[index];
    }
    return null;
  }

  // ============================================
  // CUPONS
  // ============================================

  getCupons() {
    if (!this.data || !this.data.cupons) return [];
    return this.data.cupons.filter(c => c.ativo === true || c.ativo === undefined);
  }

  getCupom(codigo) {
    if (!this.data || !this.data.cupons) return null;
    const codigoUpper = codigo.toUpperCase().trim();
    // Buscar cupom (comparar códigos em maiúsculas)
    const cupom = this.data.cupons.find(c => {
      const codigoCupom = (c.codigo || '').toUpperCase().trim();
      return codigoCupom === codigoUpper && (c.ativo === true || c.ativo === undefined);
    });
    return cupom || null;
  }

  validarCupom(codigo, valorTotal) {
    // Garantir que dados estão carregados
    if (!this.data) {
      this.loadData();
    }
    
    const cupom = this.getCupom(codigo);
    if (!cupom) {
      return { valido: false, mensagem: 'Cupom não encontrado ou inativo' };
    }

    // Verificar se está ativo
    if (cupom.ativo === false) {
      return { valido: false, mensagem: 'Cupom inativo' };
    }

    // Verificar validade
    if (cupom.validade) {
      const dataValidade = new Date(cupom.validade);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      dataValidade.setHours(0, 0, 0, 0);
      
      if (dataValidade < hoje) {
        return { valido: false, mensagem: 'Cupom expirado' };
      }
    }

    // Verificar valor mínimo
    if (cupom.valorMinimo && valorTotal < cupom.valorMinimo) {
      return { valido: false, mensagem: `Valor mínimo de R$ ${cupom.valorMinimo.toFixed(2)}` };
    }

    // Verificar usos máximos (limiteUsos ou usosMaximos)
    const limite = cupom.limiteUsos || cupom.usosMaximos;
    if (limite && (cupom.usosAtuais || 0) >= limite) {
      return { valido: false, mensagem: 'Cupom esgotado' };
    }

    return { valido: true, cupom };
  }

  aplicarCupom(codigo) {
    const validacao = this.validarCupom(codigo, 0);
    if (validacao.valido) {
      validacao.cupom.usosAtuais = (validacao.cupom.usosAtuais || 0) + 1;
      this.saveData();
    }
    return validacao;
  }

  // ============================================
  // CONFIGURAÇÕES
  // ============================================

  getConfiguracoes() {
    if (!this.data || !this.data.configuracoes) {
      return {
        chavePix: '',
        nomeEstabelecimento: 'Vetera Sushi',
        telefone: '',
        endereco: '',
        taxaEntrega: 0,
        tempoPreparo: 30
      };
    }
    return this.data.configuracoes;
  }

  atualizarConfiguracoes(config) {
    if (!this.data.configuracoes) this.data.configuracoes = {};
    this.data.configuracoes = { ...this.data.configuracoes, ...config };
    this.saveData();

    // Tentar persistir no servidor (não bloquear se falhar)
    (async () => {
      try {
        await fetch(window.location.origin + '/api/configuracoes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.data.configuracoes)
        });
      } catch (e) {
        // Silencioso — servidor pode não estar disponível
        console.warn('[DATABASE] Não foi possível sincronizar configurações com o servidor.', e);
      }
    })();

    return this.data.configuracoes;
  }

  // ============================================
  // USUÁRIOS
  // ============================================

  validarLogin(usuario, senha) {
    if (!this.data || !this.data.usuarios) return null;
    const user = this.data.usuarios.find(
      u => u.usuario === usuario && u.senha === senha && u.ativo !== false
    );
    return user || null;
  }

}

// Instância global do banco de dados
const db = new Database();
window.db = db; // Tornar global
