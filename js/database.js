// ============================================
// GERENCIAMENTO DE BANCO DE DADOS JSON
// ============================================

class Database {
  constructor() {
    this.data = null;
    // Opção B: no site público, não persistir banco no localStorage.
    // Somente telas administrativas (gestor/pdv) podem usar vetera_database como cache.
    try {
      const path = String(window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
      const isAdminUi = path.includes('gestor') || path.includes('pdv');
      this._useLocalStorage = !!isAdminUi;
    } catch (e) {
      this._useLocalStorage = false;
    }

    // Limpeza simples (não agressiva) do que não deve existir no cliente público
    try {
      if (!this._useLocalStorage) {
        localStorage.removeItem('vetera_database');
        localStorage.removeItem('vetera_usuarios_json');
      }
    } catch (e) {}

    this.loadData();
  }

  _normalizarImagemUrl(valor) {
    try {
      if (!valor || typeof valor !== 'string') return valor;
      const v = valor.trim();
      if (!v) return v;
      // Base64 desativado: nunca retornar data URL.
      // Se vier data:image..., remover.
      if (v.startsWith('data:image')) return '';

      // URLs absolutas e paths absolutos são mantidos.
      if (v.startsWith('http') || v.startsWith('/')) return v;

      // Se for um base64 "puro" (sem prefixo), remover.
      if (v.length > 200 && /^[A-Za-z0-9+/=]+$/.test(v)) {
        return '';
      }

      // Caso seja só nome de arquivo, manter (render irá prefixar /Fotos/ quando necessário)
      return v;
    } catch (e) {
      return valor;
    }
  }

  // Carregar dados do JSON
  loadData() {
    try {
      if (this._useLocalStorage) {
        const stored = localStorage.getItem('vetera_database');
        if (stored) {
          try {
            this.data = JSON.parse(stored);
          } catch (parseError) {
            // Se erro ao parsear, usar estrutura vazia
            this.data = {
              produtos: [],
              categorias: [], // será migrado para objeto
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
      } else {
        // Site público: iniciar vazio e carregar do servidor.
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
      
      // Garantir que todas as propriedades existem
      if (!this.data.produtos) this.data.produtos = [];
      if (!this.data.complementos) this.data.complementos = [];
      if (!this.data.categorias) this.data.categorias = [];
      if (!this.data.pedidos) this.data.pedidos = [];
      if (!this.data.clientes) this.data.clientes = [];
      if (!this.data.cupons) this.data.cupons = [];
      if (!this.data.condicionais) this.data.condicionais = [];
      if (!this.data.horarios) this.data.horarios = null; // Será inicializado quando necessário
      if (!this.data.configuracoes) this.data.configuracoes = {};
      if (!this.data.usuarios) this.data.usuarios = [];
      if (!this.data.complementos) this.data.complementos = [];
      
      // SEMPRE inicializar produtos manualmente (ignorar MongoDB)
      this.inicializarProdutosManualmente();
      
      // SEMPRE recarregar do arquivo para garantir dados atualizados (async)
      // Mas produtos sempre serão sobrescritos pelos manuais
      this.fetchInitialData().catch((err) => {
        console.error('[DATABASE] Erro ao buscar dados iniciais:', err);
        // Manter dados atuais em memória
      });

      // No cliente público, pedidos são tratados via main.js (por IDs), para não baixar lista inteira.
      if (this._useLocalStorage) {
        // SEMPRE carregar pedidos do servidor (fonte principal)
        this.carregarPedidosServidor().catch((err) => {
          console.error('[DATABASE] Erro ao carregar pedidos:', err);
          // Se falhar, manter pedidos do localStorage
        });
      }
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
      if (this._useLocalStorage) this.carregarPedidosServidor().catch(() => {});
    }
  }

  // Carregar pedidos do servidor (pedidos.json) - SEMPRE usar servidor como fonte principal
  async carregarPedidosServidor() {
    try {
      const token = (() => {
        try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
      })();
      const apiUrl = (window.ENV?.apiBaseUrl || window.location.origin) + '/api/pedidos';
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
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
      // Usar endpoint baseado no ambiente
      const apiUrl = (window.ENV?.apiBaseUrl || window.location.origin) + '/api/database?' + Date.now();

      const token = (() => {
        try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
      })();

      const doFetch = async (timeoutMs) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            },
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
      };

      let response;
      try {
        response = await doFetch(45000);
      } catch (e) {
        if (e && (e.name === 'AbortError' || String(e).includes('AbortError'))) {
          response = await doFetch(90000);
        } else {
          throw e;
        }
      }
      
      if (response.ok) {
        const dataFromFile = await response.json();

        // Garantir estrutura para produtos pausados (fallback local)
        if (!this.data) this.data = {};
        if (!Array.isArray(this.data.produtosPausados)) this.data.produtosPausados = [];
        
        // SEMPRE usar cupons do arquivo (fonte principal)
        // O servidor é a fonte da verdade para cupons
        const cuponsDoArquivo = dataFromFile.cupons || [];
        
        // IGNORAR COMPLETAMENTE produtos do MongoDB - sempre usar produtos manuais do código
        // Produtos manuais serão inicializados DEPOIS e sobrescreverão qualquer coisa
        console.log('[DATABASE] ⚠️ Produtos do MongoDB ignorados - usando apenas produtos manuais');

        // Preservar categorias e outras configurações do servidor, mas produtos SEMPRE manuais
        const categoriasServidor = dataFromFile.categorias || [];
        const categoriasManuais = ['Monte seu Combo', 'Pokes'];
        
        // Mesclar categorias (manuais têm prioridade)
        const categoriasUnicas = [...new Set([...categoriasManuais, ...categoriasServidor])];

        this.data = {
          ...this.data, // Preservar dados locais (usuários, pedidos, etc)
          produtos: [], // SEMPRE usar produtos manuais - ignorar MongoDB
          categorias: categoriasUnicas,
          cupons: cuponsDoArquivo,
          configuracoes: dataFromFile.configuracoes || this.data.configuracoes || {},
          produtosPausados: this.data.produtosPausados || []
        };
        
        // SEMPRE inicializar produtos manualmente DEPOIS de carregar do servidor
        // Isso garante que produtos manuais SEMPRE sobrescrevem qualquer coisa do MongoDB
        this.inicializarProdutosManualmente();

        // Sincronizar condicionais do servidor (promoções/regras)
        try {
          const token = (() => {
            try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
          })();
          const respCond = await fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/condicionais', {
            headers: {
              ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            }
          });
          if (respCond.ok) {
            const cond = await respCond.json();
            if (Array.isArray(cond)) {
              this.data.condicionais = cond;
            }
          }
        } catch (e) {
          // Ignorar falhas e manter condicionais locais
        }

        // Tentar mesclar configurações persistidas no servidor (/api/configuracoes)
        (async () => {
          try {
            const token = (() => {
              try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
            })();
            const resp = await fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/configuracoes', {
              headers: {
                ...(token ? { 'Authorization': 'Bearer ' + token } : {})
              }
            });
            if (resp.ok) {
              const cfg = await resp.json();
              this.data.configuracoes = { ...(this.data.configuracoes || {}), ...(cfg || {}) };
              this.saveData();
            }
          } catch (e) {
            // Ignorar falhas ao mesclar configurações do servidor
          }
        })();
        
        // Carregar categorias do servidor (se disponível)
        try {
          const token = (() => {
            try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
          })();
          const respCat = await fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/categorias', {
            headers: {
              ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            }
          });
          if (respCat.ok) {
            const cats = await respCat.json();
            if (Array.isArray(cats) && cats.length > 0) {
              this.data.categorias = cats;
            }
          }
        } catch (e) {
          // Ignorar erro ao carregar categorias
        }
        
        // Garantir que categorias existam
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
      try {
        console.error('[DATABASE] Erro ao buscar dados:', error);
        console.error('[DATABASE] Debug fetchInitialData url:', (window.ENV?.apiBaseUrl || window.location.origin) + '/api/database');
      } catch (e) {}
      
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

  // Salvar categorias no servidor
  async salvarCategorias() {
    if (!this._useLocalStorage) return;
    
    try {
      const token = (() => {
        try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
      })();
      const response = await fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/categorias', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify(this.data.categorias || [])
      });
      
      if (!response.ok) {
        console.warn('[DATABASE] Erro ao salvar categorias no servidor:', response.status);
      }
    } catch (e) {
      console.warn('[DATABASE] Erro ao salvar categorias:', e);
    }
  }

  // Salvar dados no localStorage
  saveData() {
    try {
      if (!this._useLocalStorage) return;
      localStorage.setItem('vetera_database', JSON.stringify(this.data));
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
    }
  }

  // ============================================
  // PRODUTOS
  // ============================================

  getProduto(produtoId) {
    try {
      if (!this.data || !Array.isArray(this.data.produtos)) return null;
      const id = parseInt(produtoId);
      if (!id) return null;
      
      const produto = this.data.produtos.find(p => p && p.id === id);
      if (!produto) return null;
      
      // Normalizar imagem
      if (produto.imagem) {
        const img = this._normalizarImagemUrl(produto.imagem);
        return img === produto.imagem ? produto : { ...produto, imagem: img };
      }
      
      return produto;
    } catch (e) {
      console.error('[DATABASE] Erro ao buscar produto:', e);
      return null;
    }
  }

  getProdutos(categoria = null) {
    try {
      if (!this.data || !Array.isArray(this.data.produtos)) return [];

      // Copiar
      let produtos = [...this.data.produtos];

      // Filtrar por categoria (se solicitado)
      if (categoria) {
        const cat = String(categoria).trim();
        if (cat) {
          produtos = produtos.filter(p => p && String(p.categoria || '').trim() === cat);
        }
      }

      // Ordenar por ordem (quando existir)
      produtos.sort((a, b) => {
        const ao = (a && typeof a.ordem === 'number') ? a.ordem : 0;
        const bo = (b && typeof b.ordem === 'number') ? b.ordem : 0;
        return ao - bo;
      });

      // Normalizar imagem (base64 desativado)
      return (produtos || []).map(p => {
        if (!p || typeof p !== 'object') return p;
        if (!p.imagem) return p;
        const img = this._normalizarImagemUrl(p.imagem);
        if (!img) {
          const copy = { ...p };
          delete copy.imagem;
          return copy;
        }
        return img === p.imagem ? p : { ...p, imagem: img };
      });
    } catch (e) {
      return [];
    }
  }

  getCategorias() {
    if (!this.data) return [];
    
    // Migrar categorias de array para objeto com ordem e divisória (se necessário)
    if (Array.isArray(this.data.categorias) && this.data.categorias.length > 0) {
      // Verificar se já é o novo formato (array de objetos)
      if (typeof this.data.categorias[0] === 'object' && this.data.categorias[0].nome) {
        // Já é o novo formato, ordenar por ordem
        return this.data.categorias
          .filter(c => c && c.nome)
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
          .map(c => c.nome);
      } else {
        // Formato antigo (array de strings), migrar para novo formato
        this.data.categorias = this.data.categorias.map((nome, index) => ({
          nome: nome,
          ordem: index,
          divisoria: false // padrão sem divisória
        }));
        this.saveData();
        this.salvarCategorias(); // Salvar no servidor
        return this.data.categorias.map(c => c.nome);
      }
    }
    
    // Se não tiver categorias, extrair dos produtos (legado)
    if (this.data.produtos && this.data.produtos.length > 0) {
      const categoriasUnicas = [...new Set(this.data.produtos.map(p => p.categoria).filter(Boolean))];
      // Migrar para novo formato
      this.data.categorias = categoriasUnicas.map((nome, index) => ({
        nome: nome,
        ordem: index,
        divisoria: false
      }));
      this.saveData();
      this.salvarCategorias(); // Salvar no servidor
      return categoriasUnicas;
    }
    
    return [];
  }

  // Obter dados completos das categorias (com ordem e divisória)
  getCategoriasDados() {
    if (!this.data || !Array.isArray(this.data.categorias)) return [];
    
    // Garantir que todas as categorias tenham as propriedades necessárias
    return this.data.categorias.map((cat, index) => ({
      nome: cat.nome || cat,
      ordem: typeof cat.ordem === 'number' ? cat.ordem : index,
      divisoria: Boolean(cat.divisoria)
    }));
  }

  // ============================================
  // PEDIDOS
  // ============================================

  getPedidos(status = null) {
    if (!this.data) return [];
    let pedidosArr = this.data.pedidos;
    // Normalizar casos onde pedidos não é um array (p.ex. objeto por erro)
    if (!Array.isArray(pedidosArr)) {
      if (!pedidosArr) {
        pedidosArr = [];
      } else if (typeof pedidosArr === 'object') {
        // Converter objeto para array de valores
        pedidosArr = Object.values(pedidosArr);
      } else {
        pedidosArr = [];
      }
      // Persistir estrutura normalizada
      this.data.pedidos = pedidosArr;
      this.saveData();
    }

    let pedidos = [...pedidosArr];
    if (status) {
      pedidos = pedidos.filter(p => p.status === status);
    }
    return pedidos.sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  getPedido(id) {
    if (!this.data || !this.data.pedidos) return null;
    const idStr = String(id);
    const idNum = Number(id);
    return this.data.pedidos.find(p => {
      if (!p) return false;
      if (p.id === id) return true;
      if (String(p.id) === idStr) return true;
      if (Number.isFinite(idNum) && Number(p.id) === idNum) return true;
      return false;
    });
  }

  criarPedido(pedidoData) {
    try {
      if (!this.data.pedidos) {
        this.data.pedidos = [];
      }
      
      // Verificar se já existe pedido com mesmo ID (evitar duplicação)
      const idTemporario = (Date.now() * 1000) + Math.floor(Math.random() * 1000);
      const pedidoExistente = this.data.pedidos.find(p => p.id === idTemporario);
      if (pedidoExistente) {
        // Pedido com ID já existe, usando timestamp único
        // Usar timestamp mais preciso para evitar duplicação
        const novoId = (Date.now() * 1000) + Math.floor(Math.random() * 1000);
        pedidoData.id = novoId;
      }
      
      const novoPedido = {
        id: idTemporario,
        data: new Date().toISOString(),
        timestamp: idTemporario,
        status: 'aguardando_pagamento',
        statusPagamento: 'pendente',
        ...pedidoData  // pedidoData sobrescreve os valores padrão acima
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
        const apiUrl = (window.ENV?.apiBaseUrl || window.location.origin) + '/api/pedidos';
        const token = (() => {
          try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
        })();
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
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

    const idStr = String(id);
    const idNum = Number(id);
    const index = this.data.pedidos.findIndex(p => {
      if (!p) return false;
      if (p.id === id) return true;
      if (String(p.id) === idStr) return true;
      if (Number.isFinite(idNum) && Number(p.id) === idNum) return true;
      return false;
    });
    if (index === -1) {
      console.error('[DATABASE] ❌ Pedido não encontrado:', id);
      return null;
    }
    
    const pedidoAntigo = { ...this.data.pedidos[index] };
    
    // Atualizar pedido localmente
    this.data.pedidos[index] = {
      ...this.data.pedidos[index],
      ...atualizacoes
    };
    this.saveData();
    
    // Disparar evento de pedido atualizado para notificar clientes
    try {
      const evento = new CustomEvent('pedidoAtualizado', {
        detail: {
          pedidoId: id,
          pedidoAntigo: pedidoAntigo,
          pedidoNovo: this.data.pedidos[index],
          atualizacoes: atualizacoes
        },
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(evento);
      if (typeof document !== 'undefined') {
        document.dispatchEvent(evento);
      }
    } catch (e) {
      console.warn('[DATABASE] Erro ao disparar evento pedidoAtualizado:', e);
    }
    
    // Salvar TODOS os pedidos no servidor (MongoDB)
    try {
      const apiUrl = (window.ENV?.apiBaseUrl || window.location.origin) + '/api/pedidos';
      const token = (() => {
        try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
      })();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
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

    // Persistir no servidor (fonte de verdade) - não bloquear o fluxo
    try {
      const token = (() => {
        try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
      })();
      fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/usuarios', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify([novoCliente])
      }).catch(() => {});
    } catch (e) {}
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

      // Persistir no servidor (fonte de verdade) - não bloquear o fluxo
      try {
        const token = (() => {
          try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
        })();
        fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/usuarios', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          },
          body: JSON.stringify([this.data.clientes[index]])
        }).catch(() => {});
      } catch (e) {}
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

  async salvarCupom(cupom) {
    if (!this.data) this.data = {};
    if (!this.data.cupons) this.data.cupons = [];
    
    // Verificar se já existe cupom com mesmo código
    const index = this.data.cupons.findIndex(c => c.codigo === cupom.codigo);
    if (index !== -1) {
      this.data.cupons[index] = cupom;
    } else {
      cupom.id = cupom.id || Date.now();
      this.data.cupons.push(cupom);
    }
    
    // Salvar localmente
    this.saveData();
    
    // Salvar no servidor também
    try {
      const token = (() => {
        try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
      })();
      const response = await fetch(window.location.origin + '/api/cupons', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify(this.data.cupons || [])
      });
      if (response.ok) {
        await this.fetchInitialData();
      }
    } catch (e) {
      // Servidor não disponível, cupom salvo apenas localmente
    }
    
    return cupom;
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
        const token = (() => {
          try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
        })();
        await fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/configuracoes', {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          },
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
  // COMPLEMENTOS
  // ============================================

  getComplementos() {
    if (!this.data || !this.data.complementos) return [];
    return this.data.complementos;
  }

  // ============================================
  // INICIALIZAR PRODUTOS MANUALMENTE
  // ============================================
  
  inicializarProdutosManualmente() {
    if (!this.data) this.data = {};
    
    // SEMPRE limpar produtos existentes e usar apenas os manuais
    console.log('[DATABASE] 🔄 Inicializando produtos manuais (ignorando MongoDB)...');
    this.data.produtos = [];
    
    // Limpar e inicializar categorias no formato correto (objetos com nome, ordem, divisoria)
    // Usar apenas as categorias manuais definidas aqui
    this.data.categorias = [];
    
    // Função auxiliar para adicionar categoria no formato correto
    const adicionarCategoria = (nome, ordem) => {
      const existe = this.data.categorias.some(cat => 
        (typeof cat === 'string' ? cat === nome : cat.nome === nome)
      );
      if (!existe) {
        this.data.categorias.push({ nome, ordem, divisoria: false });
      } else {
        // Atualizar categoria existente para o formato correto
        const index = this.data.categorias.findIndex(cat => 
          (typeof cat === 'string' ? cat === nome : cat.nome === nome)
        );
        if (index >= 0) {
          this.data.categorias[index] = { nome, ordem, divisoria: false };
        }
      }
    };
    
    // Adicionar categorias manuais na ordem desejada
    adicionarCategoria('Monte seu Combo', 1);
    adicionarCategoria('Pokes', 2);
    adicionarCategoria('Rodizio', 3);
    adicionarCategoria('Temakis', 4);
    adicionarCategoria('Combinados', 5);
    adicionarCategoria('Salmão', 6);
    adicionarCategoria('Adicionais', 7);
    
    // COMBO 27 PEÇAS
    const combo27 = {
      id: 1001,
      nome: '🍱 COMBO 27 PEÇAS',
      descricao: 'Monte seu combo personalizado com 27 peças. Escolha as opções de cada parte conforme seu gosto.',
      preco: 49.90,
      categoria: 'Monte seu Combo',
      ativo: true,
      ordem: 1,
      imagem: 'combo_27.avif',
      tipo: 'combo',
      partes: [
        {
          nome: 'Utensílios',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            {
              nome: 'Quero 1 hashi + 2 sachês de shoyu + 1 sachê de wasabi + guardanapo',
              preco: 4.00
            },
            {
              nome: 'Não preciso de shoyu, hashi e wasabi',
              preco: 0
            }
          ]
        },
        {
          nome: 'Parte 1',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki de Salmão', preco: 0 },
            { nome: 'Hossomaki de Salmão Grelhado (com cream cheese e fio de tarê)', preco: 0 },
            { nome: 'Hossomaki de Pepino', preco: 0 },
            { nome: 'Hot Roll (com fio de tarê)', preco: 0 }
          ]
        },
        {
          nome: 'Parte 2',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Salmão Grelhado (com cream cheese e fio de tarê)', preco: 0 },
            { nome: 'Uramaki Salmão com Cream Cheese', preco: 0 },
            { nome: 'Uramaki Skin (pele de salmão frita, cream cheese e fio de tarê)', preco: 0 },
            { nome: 'Uramaki Califórnia (kani, pepino japonês e manga)', preco: 0 },
            { nome: 'Uramaki Shimeji (com fio de tarê)', preco: 0 }
          ]
        },
        {
          nome: 'Parte 3',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Hot Roll', preco: 0 },
            { nome: 'Sashimi de Salmão', preco: 5.90 },
            { nome: 'Jow de Salmão (topping de salmão em cubos, cream cheese e cebolinha)', preco: 9.90 },
            { nome: 'Jow Jelly (cream cheese e geleia de pimenta levemente picante)', preco: 9.90 }
          ]
        },
        {
          nome: 'Parte 4',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki de Pepino', preco: 0 },
            { nome: 'Uramaki Shimeji', preco: 0 },
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Sashimi de Salmão', preco: 5.90 },
            { nome: 'Jow Jelly', preco: 9.90 }
          ]
        },
        {
          nome: 'Parte 5',
          descricao: 'Escolha 1 opção (7 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Niguiri Skin Lemon (pele de salmão frita, cream cheese, limão, tarê e gergelim)', preco: 0 },
            { nome: 'Baterá de Salmão (salmão batido com cream cheese, gergelim e cebolinha)', preco: 0 },
            { nome: 'Niguiri de Salmão Cru', preco: 5.90 },
            { nome: 'Niguiri de Salmão Trufado (maçaricado com azeite trufado e flor de sal)', preco: 6.90 }
          ]
        }
      ],
      adicionais: [
        { nome: 'Molho Tarê Caseiro (30ml)', preco: 3.00 },
        { nome: 'Wasabi Caseiro (30g)', preco: 4.00 },
        { nome: 'Cream Cheese Extra (30g)', preco: 4.00 },
        { nome: 'Geleia de Pimenta (30ml)', preco: 3.00 }
      ],
      adicionaisMaximo: 10
    };
    
    // COMBO 32 PEÇAS
    const combo32 = {
      id: 1002,
      nome: '🍱 COMBO 32 PEÇAS',
      descricao: 'Monte seu combo personalizado com 32 peças. Escolha as opções de cada parte conforme seu gosto.',
      preco: 55.90,
      categoria: 'Monte seu Combo',
      ativo: true,
      ordem: 2,
      imagem: 'combo_32.avif',
      tipo: 'combo',
      partes: [
        {
          nome: 'Utensílios',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            {
              nome: 'Quero 1 hashi + 2 sachês de shoyu + 1 sachê de wasabi + guardanapo',
              preco: 4.00
            },
            {
              nome: 'Não preciso de shoyu, hashi e wasabi',
              preco: 0
            }
          ]
        },
        {
          nome: 'Parte 1',
          descricao: 'Escolha 1 opção (10 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki de Salmão', preco: 0 },
            { nome: 'Hossomaki de Salmão Grelhado (com tarê)', preco: 0 },
            { nome: 'Hossomaki de Pepino', preco: 0 },
            { nome: 'Hot Roll (com tarê)', preco: 0 }
          ]
        },
        {
          nome: 'Parte 2',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Salmão Grelhado', preco: 0 },
            { nome: 'Uramaki Salmão com Cream Cheese', preco: 0 },
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Uramaki Califórnia', preco: 0 },
            { nome: 'Uramaki Shimeji', preco: 0 }
          ]
        },
        {
          nome: 'Parte 3',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Hot Roll', preco: 0 },
            { nome: 'Sashimi de Salmão', preco: 5.90 },
            { nome: 'Jow de Salmão', preco: 9.90 },
            { nome: 'Jow Jelly', preco: 9.90 }
          ]
        },
        {
          nome: 'Parte 4',
          descricao: 'Escolha 1 opção (5 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki de Pepino', preco: 0 },
            { nome: 'Uramaki Shimeji', preco: 0 },
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Sashimi de Salmão', preco: 5.90 },
            { nome: 'Jow Jelly', preco: 9.90 }
          ]
        },
        {
          nome: 'Parte 5',
          descricao: 'Escolha 1 opção (7 peças)',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Niguiri Skin Lemon', preco: 0 },
            { nome: 'Baterá de Salmão', preco: 0 },
            { nome: 'Niguiri de Salmão Cru', preco: 5.90 },
            { nome: 'Niguiri de Salmão Trufado', preco: 6.90 }
          ]
        }
      ],
      adicionais: [
        { nome: 'Molho Tarê Caseiro (30ml)', preco: 3.00 },
        { nome: 'Wasabi Caseiro (30g)', preco: 4.00 },
        { nome: 'Cream Cheese Extra (30g)', preco: 4.00 },
        { nome: 'Geleia de Pimenta (30ml)', preco: 3.00 }
      ],
      adicionaisMaximo: 10
    };
    
    // COMBO 42 PEÇAS
    const combo42 = {
      id: 1003,
      nome: '🍱 COMBO 42 PEÇAS',
      descricao: 'Monte seu combo personalizado com 42 peças. Escolha as opções de cada parte conforme seu gosto.',
      preco: 68.50,
      categoria: 'Monte seu Combo',
      ativo: true,
      ordem: 3,
      imagem: 'combo_42.jpg',
      tipo: 'combo',
      partes: [
        {
          nome: 'Parte 1',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki Salmão', preco: 0 },
            { nome: 'Salmão Grelhado', preco: 0 },
            { nome: 'Pepino', preco: 0 },
            { nome: 'Hot Roll', preco: 0 }
          ]
        },
        {
          nome: 'Parte 2',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Salmão Grelhado', preco: 0 },
            { nome: 'Filadélfia', preco: 0 },
            { nome: 'Skin', preco: 0 },
            { nome: 'Califórnia', preco: 0 },
            { nome: 'Shimeji', preco: 0 }
          ]
        },
        {
          nome: 'Parte 3',
          descricao: '5 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Hot Roll', preco: 0 },
            { nome: 'Sashimi', preco: 5.90 },
            { nome: 'Jow', preco: 9.90 },
            { nome: 'Jow Jelly', preco: 9.90 }
          ]
        },
        {
          nome: 'Parte 4',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki Pepino', preco: 0 },
            { nome: 'Uramaki Shimeji', preco: 0 },
            { nome: 'Skin', preco: 0 },
            { nome: 'Sashimi', preco: 12.90 },
            { nome: 'Jow Jelly', preco: 18.90 }
          ]
        },
        {
          nome: 'Parte 5',
          descricao: '7 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Niguiri Skin Lemon', preco: 0 },
            { nome: 'Baterá de Salmão', preco: 0 },
            { nome: 'Niguiri de Salmão Cru', preco: 5.90 },
            { nome: 'Niguiri de Salmão Trufado', preco: 6.90 }
          ]
        }
      ],
      adicionais: [
        { nome: 'Molho Tarê Caseiro (30ml)', preco: 3.00 },
        { nome: 'Wasabi Caseiro (30g)', preco: 4.00 },
        { nome: 'Cream Cheese Extra (30g)', preco: 4.00 },
        { nome: 'Geleia de Pimenta (30ml)', preco: 3.00 }
      ],
      adicionaisMaximo: 10
    };
    
    // COMBO 47 PEÇAS
    const combo47 = {
      id: 1004,
      nome: '🍱 COMBO 47 PEÇAS',
      descricao: 'Monte seu combo personalizado com 47 peças. Escolha as opções de cada parte conforme seu gosto.',
      preco: 75.50,
      categoria: 'Monte seu Combo',
      ativo: true,
      ordem: 4,
      imagem: 'combo_47.avif',
      tipo: 'combo',
      partes: [
        {
          nome: 'Parte 1',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki Salmão', preco: 0 },
            { nome: 'Salmão Grelhado', preco: 0 },
            { nome: 'Pepino', preco: 0 },
            { nome: 'Hot Roll', preco: 0 }
          ]
        },
        {
          nome: 'Parte 2',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Salmão Grelhado', preco: 0 },
            { nome: 'Filadélfia', preco: 0 },
            { nome: 'Skin', preco: 0 },
            { nome: 'Califórnia', preco: 0 },
            { nome: 'Shimeji', preco: 0 }
          ]
        },
        {
          nome: 'Parte 3',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Uramaki Skin', preco: 0 },
            { nome: 'Hot Roll', preco: 0 },
            { nome: 'Sashimi', preco: 5.90 },
            { nome: 'Jow', preco: 9.90 },
            { nome: 'Jow Jelly', preco: 9.90 }
          ]
        },
        {
          nome: 'Parte 4',
          descricao: '10 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Hossomaki Pepino', preco: 0 },
            { nome: 'Uramaki Shimeji', preco: 0 },
            { nome: 'Skin', preco: 0 },
            { nome: 'Sashimi', preco: 12.90 },
            { nome: 'Jow Jelly', preco: 18.90 }
          ]
        },
        {
          nome: 'Parte 5',
          descricao: '7 peças',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: 'Niguiri Skin Lemon', preco: 0 },
            { nome: 'Baterá de Salmão', preco: 0 },
            { nome: 'Niguiri de Salmão Cru', preco: 5.90 },
            { nome: 'Niguiri de Salmão Trufado', preco: 6.90 }
          ]
        }
      ],
      adicionais: [
        { nome: 'Molho Tarê Caseiro (30ml)', preco: 3.00 },
        { nome: 'Wasabi Caseiro (30g)', preco: 4.00 },
        { nome: 'Cream Cheese Extra (30g)', preco: 4.00 },
        { nome: 'Geleia de Pimenta (30ml)', preco: 3.00 }
      ],
      adicionaisMaximo: 10
    };
    
    // Finalizações para produtos (Pokes)
    const finalizacoesPadrao = [
      { nome: 'Cebolinha', preco: 0 },
      { nome: 'Gergelim Moído', preco: 0 },
      { nome: 'Raspas de Limão Tahiti', preco: 0 },
      { nome: 'Cebola Roxa', preco: 0 },
      { nome: 'Flor de Sal', preco: 0 },
      { nome: 'Azeite Trufado', preco: 2.00 },
      { nome: 'Gengibre em Conserva', preco: 2.00 },
      { nome: 'Pimenta Biquinho em Conserva', preco: 2.00 },
      { nome: 'Wasabi', preco: 0 },
      { nome: 'Raspas de Limão Siciliano', preco: 0 },
      { nome: 'Ovas de Massagô', preco: 5.00 }
    ];
    
    // POKE SALMÃO TRADICIONAL
    const pokeTradicional = {
      id: 2001,
      nome: 'Poke Salmão Tradicional',
      descricao: 'Aquele Poke de respeito, delicioso e fresco com a combinação perfeita pra você aproveitar. Incluso: Arroz, Salmão Cru, Sunomono, Manga, Tomate Cereja, Cream Cheese, Cebola Cripsy, Molho Shoyu Clássico. Finalizações à escolha. Serve 1 pessoa.',
      preco: 32.90,
      categoria: 'Pokes',
      ativo: true,
      ordem: 1,
      imagem: 'pokesalmaotradicional.avif',
      tipo: 'poke',
      finalizacoes: finalizacoesPadrao,
      finalizacoesMinimas: 1,
      finalizacoesMaximo: 3
    };
    
    // POKE SALMÃO EMPANADO
    const pokeEmpanado = {
      id: 2002,
      nome: 'Poke Salmão Empanado',
      descricao: 'Crocância tem nome. Saboreie esse delicioso Poke com Salmão Empanado, crocante na medida certa e com uma explosão de sabores a cada mordida. Incluso: Arroz, Salmão Empanado, Sunomono, Manga, Cenoura, Cream Cheese, Chips de Batata Doce, Tarê. Finalizações à escolha. Serve 1 pessoa.',
      preco: 34.90,
      categoria: 'Pokes',
      ativo: true,
      ordem: 2,
      imagem: 'pokesalmaoempanado.avif',
      tipo: 'poke',
      finalizacoes: finalizacoesPadrao,
      finalizacoesMinimas: 1,
      finalizacoesMaximo: 3
    };
    
    // POKE SPICY
    const pokeSpicy = {
      id: 2003,
      nome: 'Poke Spicy',
      descricao: 'A picância perfeita com os sabores mais frescos e leves dos ingredientes naturais fazem com que este Poke tenha várias sensações de sabores. Incluso: Arroz, Salmão, Tomate Cereja, Pepino, Palha de Nori, Chips de Mandioquinha, Maionese Spicy. Finalizações à sua escolha. Serve 1 pessoa.',
      preco: 33.90,
      categoria: 'Pokes',
      ativo: true,
      ordem: 3,
      imagem: 'pokescpicy.avif',
      tipo: 'poke',
      finalizacoes: finalizacoesPadrao,
      finalizacoesMinimas: 1,
      finalizacoesMaximo: 3
    };
    
    
    // COMBO 50 PEÇAS (RODIZIO)
    const combo50 = {
      id: 3001,
      nome: '🍱 Combo 50 (Entrada, Sushi, Temaki e Sobremesa) + 1 Bebida',
      descricao: 'Entrada: 1 porção de sunomono (pepino japonês 100gr) e 1 temaki. Quentes: 1 rolinho primavera queijo, 1 guioza, 1 porção shimeji (100gr) ou 2 bolinhos de salmão. Sushis: 4 sashimis de salmão, 2 uramakis de salmão com cream cheese, 5 hossomaki de salmão, 1 niguiri de salmão, 1 jow de salmão, 5 hotholl de salmão com cream cheese. Sobremesa: 2 rolinho primavera doce. Já acompanha hashi, shoyo e wabaki. Serve 1 pessoa.',
      preco: 109.90,
      precoOriginal: 129.90,
      categoria: 'Rodizio',
      ativo: true,
      ordem: 1,
      imagem: 'combo50_rodizio.avif',
      tipo: 'combo',
      partes: [
        {
          nome: 'Temaki qual sabor?',
          descricao: 'Escolha 1 opção.',
          obrigatorio: true,
          escolhaMinima: 1,
          escolhaMaxima: 1,
          opcoes: [
            { nome: '88 - Temaki Califórnia (130gr) - Temaki com kani, manga e pepino japonês.', preco: 0 },
            { nome: '89 - Temaki de Shimeji (130gr) - Temaki feito com shimeji refogado na manteiga, com cream cheese e cebolinha, regado no tarê.', preco: 0 },
            { nome: '90 - Temaki de Salmão Completo (130gr) - Temaki de salmão fresco em cubos, com cream cheese e cebolinha.', preco: 10.00 },
            { nome: '91 - Temaki de Salmão Grelhado (130gr) - Temaki de salmão grelhado misturado com cream cheese, temperos orientais, salpicado na cebolinha e regado com tarê.', preco: 9.00 },
            { nome: '92 - Temaki Hot (130gr) - Delicioso temaki hot de salmão grelhado com topping de cream cheese, finalizado com tarê e cebolinha (cebolinha de acordo com disponibilidade).', preco: 12.00 }
          ]
        }
      ],
      adicionais: [],
      adicionaisMaximo: 0
    };
    
    // COMBO 60 PEÇAS (RODIZIO)
    const combo60 = {
      id: 3002,
      nome: '🍱 Combo 60 (Entrada, Sushi, Temaki e Sobremesa) + 2 Bebidas',
      descricao: 'Entrada: 1 porção de sunomono (pepino japonês 200gr) e 2 temakis. Quentes: 2 rolinho primavera queijo, 2 guioza, 1 porção de shimeji (200gr) ou 4 bolinhos de salmão. Sushis: 8 sashimis de salmão, 5 uramakis de salmão com cream cheese, 5 hossomaki de salmão, 2 niguiri de salmão, 2 jow de salmão, 10 hotholl de salmão com cream cheese. Sobremesa: 4 rolinho primavera doce. Já acompanha hashi, shoyo e wabaki. Serve 2 pessoas.',
      preco: 139.90,
      precoOriginal: 164.90,
      categoria: 'Rodizio',
      ativo: true,
      ordem: 2,
      imagem: 'combo60_rodizio.avif',
      tipo: 'combo',
      partes: [
        {
          nome: 'Temaki qual sabor?',
          descricao: 'Escolha 2 opções.',
          obrigatorio: true,
          escolhaMinima: 2,
          escolhaMaxima: 2,
          opcoes: [
            { nome: '88 - Temaki Califórnia (130gr) - Temaki com kani, manga e pepino japonês.', preco: 0 },
            { nome: '89 - Temaki de Shimeji (130gr) - Temaki feito com shimeji refogado na manteiga, com cream cheese e cebolinha, regado no tarê.', preco: 0 },
            { nome: '90 - Temaki de Salmão Completo (130gr) - Temaki de salmão fresco em cubos, com cream cheese e cebolinha.', preco: 10.00 },
            { nome: '91 - Temaki de Salmão Grelhado (130gr) - Temaki de salmão grelhado misturado com cream cheese, temperos orientais, salpicado na cebolinha e regado com tarê.', preco: 9.00 },
            { nome: '92 - Temaki Hot (130gr) - Delicioso temaki hot de salmão grelhado com topping de cream cheese, finalizado com tarê e cebolinha (cebolinha de acordo com disponibilidade).', preco: 12.00 }
          ]
        }
      ],
      adicionais: [],
      adicionaisMaximo: 0
    };
    
    // PRODUTOS TEMAKIS (sem complementos - vão direto ao carrinho)
    const temakiCalifornia = {
      id: 4001,
      nome: 'Temaki Califórnia',
      descricao: 'Recheado com suculento kani, manga doce e refrescante e o frescor crocante do pepino, cada mordida é uma experiência única. A harmonia desses ingredientes, cuidadosamente selecionados, proporciona um gosto levemente fresco e irresistivelmente delicioso. É uma indulgência saudável que agrada aos amantes da cozinha japonesa mais exigentes. Este prato é a expressão máxima de sabor e qualidade no universo dos temakis. Serve 1 pessoa. (150g)',
      preco: 32.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 1,
      imagem: 'temakicalifornia.avif',
      tipo: 'produto'
    };
    
    const temakiShimeji = {
      id: 4002,
      nome: 'Temaki de Shimeji com Cream Cheese',
      descricao: 'Preparado com shimeji perfeitamente temperado, adornado com um toque generoso de manteiga derretida. A cremosidade e o sabor intenso do cream cheese são harmoniosamente equilibrados com a frescura da cebolinha. Por fim, é finalizado com um banho do autêntico molho tarê, que proporciona um sabor agridoce irresistível. Cada mordida é uma explosão de sabores que irá te transportar diretamente para o Japão. Um prato imperdível para os amantes da culinária nipônica. Serve 1 pessoa.',
      preco: 33.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 2,
      imagem: 'temakishimeji.jpg',
      tipo: 'produto'
    };
    
    const temakiSalmãoGrelhado = {
      id: 4003,
      nome: 'Temaki de Salmão Grelhado',
      descricao: 'O salmão, grelhado à perfeição e temperado com um blend exclusivo de temperos orientais, traz a autenticidade e sabor inconfundível. A suavidade da cebolinha e a textura crocante do gergelim criam um contraste perfeito, enquanto o cream cheese adiciona uma cremosidade irresistível. Uma experiência gastronômica única, repleta de sabores e texturas.',
      preco: 34.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 3,
      imagem: 'temakidesalmaogrelhado.avif',
      tipo: 'produto'
    };
    
    const temakiHot = {
      id: 4004,
      nome: 'Temaki Hot',
      descricao: 'Feito com salmão cuidadosamente grelhado, realçando sua suculência e sabor inconfundível. O arroz, sempre fresquinho e no ponto certo, serve de base para a elegante cremosidade do cream cheese. A cebolinha adiciona um toque fresco e picante, enquanto o molho tarê empresta um sabor adocicado e complexo à mistura. Finalizamos com um empanado perfeitamente crocante, que garante uma textura surpreendente a cada mordida. Experimente e apaixone-se por esta obra-prima de sabor e textura!',
      preco: 38.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 4,
      imagem: 'temakihot.avif',
      tipo: 'produto'
    };
    
    const temakiSalmãoSpicy = {
      id: 4005,
      nome: 'Temaki de Salmão Spicy',
      descricao: 'Salmão fresco em cubos, pimenta da casa e cebolinha na base de um delicioso arroz japonês',
      preco: 38.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 5,
      imagem: 'temakisalmaospicy.avif',
      tipo: 'produto'
    };
    
    const temakiSalmãoCreamCheese = {
      id: 4006,
      nome: 'Temaki de Salmão com Cream Cheese',
      descricao: 'Elaborado com salmão fresco cortado em cubinhos, combinado com arroz de alta qualidade, cream cheese cremoso, cebolinha fresca e gergelim tostado. A combinação proporciona uma textura irresistível e um sabor autêntico e inesquecível.',
      preco: 39.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 6,
      imagem: 'temakisalmaocreamchese.avif',
      tipo: 'produto'
    };
    
    const temakiSalmãoTrufado = {
      id: 4007,
      nome: 'Temaki de Salmão Trufado com Amêndoas',
      descricao: 'Salmão fresco em cubos com amêndoas laminada, com fio de azeite trufado e flor de sal, cebolinha, com base de arroz japonês.',
      preco: 39.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 7,
      imagem: 'temakisalmaotrufadocomamendoas.avif',
      tipo: 'produto'
    };
    
    const temakiCamarão = {
      id: 4008,
      nome: 'Temaki de Camarão',
      descricao: 'Temaki de camarão salteado na manteiga com alho, sal e temperos caseiro, com uma base de arroz japonês macio.',
      preco: 39.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 8,
      imagem: 'temakidecamarao.avif',
      tipo: 'produto'
    };
    
    const temakiCamarãoEmpanado = {
      id: 4009,
      nome: 'Temaki de Camarão Empanado',
      descricao: 'Temaki de camarão temperado e empanado, regado com tarê e gergelim, podendo ser adicionado gergelim.',
      preco: 39.90,
      categoria: 'Temakis',
      ativo: true,
      ordem: 9,
      imagem: 'temakicamaraoempanado.avif',
      tipo: 'produto'
    };
    
    // PRODUTOS COMBINADOS (sem complementos - vão direto ao carrinho)
    const comboNadaCru = {
      id: 5001,
      nome: '806 - Nada Cru (25 un)',
      descricao: '10 uramaki de salmão grelhado com tarê, 10 hotroll de salmão grelhado com tarê, 5 niguiri skin lemon com tarê.',
      preco: 52.90,
      categoria: 'Combinados',
      ativo: true,
      ordem: 1,
      imagem: '806.avif',
      tipo: 'produto'
    };
    
    const comboIceHoll = {
      id: 5002,
      nome: '802 - Combo Ice & Holl (30 un)',
      descricao: '5 niguiri de salmão, 5 hossomaki de pepino, 10 uramaki de salmão skin com tarê, 10 hotroll com tarê.',
      preco: 43.90,
      categoria: 'Combinados',
      ativo: true,
      ordem: 2,
      imagem: '802.avif',
      tipo: 'produto'
    };
    
    const comboBrutoMesmo = {
      id: 5003,
      nome: '805 - Combo Bruto Mesmo (35 un)',
      descricao: '10 uramaki de salmão com cream cheese, 10 hossomaki de salmão, 10 uramaki de salmão skin com tarê, 5 niguiri salmão skin lemon com tarê.',
      preco: 57.90,
      categoria: 'Combinados',
      ativo: true,
      ordem: 3,
      imagem: '805.avif',
      tipo: 'produto'
    };
    
    const comboComSashimi = {
      id: 5004,
      nome: '800 - Combo com sashimi (30 un)',
      descricao: '5 sashimi de salmão, 5 uramaki salmão com cream cheese, 5 niguiri de salmão, 10 hossomaki de salmão cru, 5 hossomaki de pepino.',
      preco: 59.90,
      categoria: 'Combinados',
      ativo: true,
      ordem: 4,
      imagem: '800.avif',
      tipo: 'produto'
    };
    
    const comboBruto = {
      id: 5005,
      nome: '804 - Combo Bruto (30 un)',
      descricao: '10 hotroll com tarê, 10 uramaki salmão com cream cheese, 5 hossomaki de pepino, 5 uramaki skin com tarê.',
      preco: 59.90,
      categoria: 'Combinados',
      ativo: true,
      ordem: 5,
      imagem: '804.avif',
      tipo: 'produto'
    };
    
    const comboSuperIceHoll = {
      id: 5006,
      nome: '803 - Combo Super Ice & Holl (35 un)',
      descricao: '5 niguiri de salmão, 10 uramaki de salmão skin com tarê, 10 hossomaki de salmão, 10 hotroll com tarê.',
      preco: 62.99,
      categoria: 'Combinados',
      ativo: true,
      ordem: 6,
      imagem: '803.jpg',
      tipo: 'produto'
    };
    
    const comboEspecialSashimi = {
      id: 5007,
      nome: '801 - Combo Especial com Sashimi (35 un)',
      descricao: '5 sashimi de salmão, 5 niguiri de salmão, 5 uramaki skin com tarê, 10 hossomaki de salmão, 10 uramaki de salmão com cream cheese.',
      preco: 68.90,
      categoria: 'Combinados',
      ativo: true,
      ordem: 7,
      imagem: '801.avif',
      tipo: 'produto'
    };
    
    // Adicionar produtos
    this.data.produtos = [
      combo27, combo32, combo42, combo47, 
      pokeTradicional, pokeEmpanado, pokeSpicy,
      combo50, combo60,
      temakiCalifornia, temakiShimeji, temakiSalmãoGrelhado, temakiHot,
      temakiSalmãoSpicy, temakiSalmãoCreamCheese, temakiSalmãoTrufado,
      temakiCamarão, temakiCamarãoEmpanado,
      comboNadaCru, comboIceHoll, comboBrutoMesmo, comboComSashimi,
      comboBruto, comboSuperIceHoll, comboEspecialSashimi
    ];
    
    // PRODUTOS SALMÃO (sem complementos - vão direto ao carrinho)
    const niguiriSkinLemon = {
      id: 6001,
      nome: 'Niguiri Skin Lemon (6 un)',
      descricao: 'Fatia de salmão frito, por cima de uma bolinha de arroz japones, com fatia de limão e cream cheese, sendo regado com leve fio de tarê caseiro e gergelim moído.',
      preco: 20.00,
      categoria: 'Salmão',
      ativo: true,
      ordem: 1,
      imagem: 'niguiriskinlemon.avif',
      tipo: 'produto'
    };
    
    const jowJellySpicy = {
      id: 6002,
      nome: 'Jow Jelly Spicy (6 un)',
      descricao: 'Envolta em uma delicada bolinha de arroz, encontra-se uma fatia de salmão fresco, brilhante e de sabor inconfundível. O toque final fica por conta do topping de cream cheese cremoso, que oferece uma textura suave e rica ao paladar. Para incrementar ainda mais a experiência, uma geleia de pimenta doce é delicadamente espalhada por cima, proporcionando um leve toque apimentado ao prato. Uma combinação perfeitamente equilibrada de sabores e texturas que irá encantar os seus sentidos.',
      preco: 25.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 2,
      imagem: 'jowjellyspicy.avif',
      tipo: 'produto'
    };
    
    const jowShimeji = {
      id: 6003,
      nome: 'Jow Shimeji com Cream Cheese (6 un)',
      descricao: 'Delicioso jow com shimeji e cream cheese.',
      preco: 25.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 3,
      imagem: 'jowshimejicomcreamchese.avif',
      tipo: 'produto'
    };
    
    const niguiriSalmão = {
      id: 6004,
      nome: 'Niguiri de Salmão (6 un)',
      descricao: 'Fatia de salmão fresco por cima uma bolinha de arroz japonês.',
      preco: 27.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 4,
      imagem: 'niguiridesalmao.avif',
      tipo: 'produto'
    };
    
    const niguiriSalmãoTrufado = {
      id: 6005,
      nome: 'Niguiri de Salmão Maçaricado Trufado (6 un)',
      descricao: 'Fatia de salmão fresco por cima uma bolinha de arroz japonês, salmão maçaricado e regado com leve fio de azeite trufado e flor de sal.',
      preco: 28.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 5,
      imagem: 'niguiridesalmaomacaricadotrufado.avif',
      tipo: 'produto'
    };
    
    const jowSalmão = {
      id: 6006,
      nome: 'Jow de Salmão (6 un)',
      descricao: 'Uma composição harmoniosa de salmão fresco, cuidadosamente envolvido numa delicada bolinha de arroz. Acrescentamos um topping de salmão de alta qualidade, que intensifica o sabor inconfundível do mar. Para finalizar, uma generosa camada de cream cheese, que adiciona um toque suave e cremoso a cada mordida. Uma delícia irresistível que vai encantar o seu paladar.',
      preco: 29.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 6,
      imagem: 'jowdesalmao.avif',
      tipo: 'produto'
    };
    
    const sashimiSalmãoTrufado = {
      id: 6007,
      nome: 'Sashimi de Salmão Maçaricado Trufado (8 fatias)',
      descricao: '8 deliciosas fatias de salmão fresco, maçaricado e salteado com flor de sal, finlizado com azeite trufado uma delicia. *azeite trufado contem um cheiro e gosto amadeirado forte*',
      preco: 49.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 7,
      imagem: 'sashimidesalmaomacaricadotrufado.avif',
      tipo: 'produto'
    };
    
    const niguiriCamarão = {
      id: 6008,
      nome: 'Niguiri Camarão (6 un)',
      descricao: 'Delicioso niguiri de camarão.',
      preco: 36.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 8,
      imagem: 'niguiricamarao.avif',
      tipo: 'produto'
    };
    
    const niguiriCamarãoEmpanado = {
      id: 6009,
      nome: 'Niguiri de Camarão Empanado (6 un)',
      descricao: 'Delicioso niguiri de camarão empanado.',
      preco: 38.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 9,
      imagem: 'niguiridecamaraoempanado.avif',
      tipo: 'produto'
    };
    
    const jowCamarãoTrufado = {
      id: 6010,
      nome: 'Jow de Camarão com Cream Cheese Trufado (6 un)',
      descricao: 'Delicioso jow de camarão com cream cheese trufado.',
      preco: 39.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 10,
      imagem: 'jowdecamaraocomcreamchesetrufado.avif',
      tipo: 'produto'
    };
    
    const sashimiSalmão = {
      id: 6011,
      nome: 'Sashimi de Salmão (8 fatias)',
      descricao: 'Deleite-se com nosso saboroso Sashimi de Salmão. O prato é meticulosamente preparado com 8 fatias primorosamente cortadas de salmão fresco, apresentando um sabor inigualável e uma textura suave que derrete na boca. Uma delícia rara que promete uma experiência culinária memorável.',
      preco: 48.90,
      categoria: 'Salmão',
      ativo: true,
      ordem: 11,
      imagem: 'sashimidesalmao.avif',
      tipo: 'produto'
    };
    
    // PRODUTOS ADICIONAIS (sem complementos - vão direto ao carrinho)
    const sunomono = {
      id: 7001,
      nome: 'Sunomono',
      descricao: 'Cada fatia é cuidadosamente conservada para preservar seu frescor e sabor autêntico. Com cada mordida, você experimentará uma explosão de sabores, uma harmonia perfeita que surpreende e agrada ao paladar.',
      preco: 18.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 1,
      imagem: '',
      tipo: 'produto'
    };
    
    const guioza = {
      id: 7002,
      nome: 'Guioza (4 un)',
      descricao: 'Uma deslumbrante entrada oriental. São irresistíveis guiozas meticulosamente fritos até atingirem uma textura divinamente crocante. Cada um é cuidadosamente temperado com nosso exclusivo e leve tempero da casa, realçando o sabor autêntico e proporcionando uma experiência culinária memorável. Importante: Imagem meramente ilustrativa. Molho não acompanha a porção.',
      preco: 23.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 2,
      imagem: 'guioza.jpg',
      tipo: 'produto'
    };
    
    const rolinhoPrimaveraLegumes = {
      id: 7003,
      nome: 'Mini Rolinho Primavera de Legumes (4 un)',
      descricao: 'Quatro rolinhos recheados com uma variedade de legumes frescos e crocantes, cada rolinho é uma explosão de sabor que desperta o paladar. A textura externa crocante contrasta perfeitamente com o recheio suave e saboroso, criando uma experiência gastronômica inesquecível. Importante: Imagem meramente ilustrativa. Molho não acompanha a porção.',
      preco: 23.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 3,
      imagem: 'minirolinhoprimaveradelegumes.avif',
      tipo: 'produto'
    };
    
    const rolinhoPrimaveraQueijo = {
      id: 7004,
      nome: 'Mini Rolinho Primavera de Queijo (4 un)',
      descricao: 'Composta por 4 mini pastéis japoneses, é uma delícia irresistível. Cada rolinho é cuidadosamente preparado para garantir a crocância perfeita por fora, enquanto revela um interior recheado com queijo derretido. Inesquecível.',
      preco: 23.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 4,
      imagem: 'minirolinhoprimaveradequeijo.avif',
      tipo: 'produto'
    };
    
    const carpaccioSalmão = {
      id: 7005,
      nome: 'Carpaccio de Salmão (10 fatias)',
      descricao: 'Desfrute de nosso Carpaccio de Salmão, um prato requintado que consiste em dez fatias delicadamente finas de salmão fresco, cuidadosamente regadas com nosso autêntico molho Ponzu caseiro. Para aprimorar ainda mais o sabor, o prato é salpicado com a exótica pimenta Togarashi japonesa, que confere um toque levemente picante. Completando a obra, ingredientes importados primorosamente selecionados e uma base de shoyo de qualidade superior. Um prato que é uma verdadeira celebração dos sabores do Oriente.',
      preco: 26.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 5,
      imagem: 'carpacciodesalmao.avif',
      tipo: 'produto'
    };
    
    const bolinhoSalmão = {
      id: 7006,
      nome: 'Bolinho de Salmão (4 un)',
      descricao: 'Uma entrada sublime. Esta opção traz para você quatro unidades de bolinhos de salmão ricamente temperados com ingredientes frescos. Eles são cuidadosamente fritos até atingirem a perfeição crocante. O melhor da culinária. Acredite, é sério, isso é uma maravilha!',
      preco: 29.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 6,
      imagem: 'bolinhodesalmao.avif',
      tipo: 'produto'
    };
    
    const shimejiManteiga = {
      id: 7007,
      nome: 'Shimeji na Manteiga',
      descricao: 'Deleite-se com a nossa "Shimeji na Manteiga", uma entrada sofisticada e irresistível. Esta generosa porção de shimeji, um cogumelo de sabor distinto e textura suculenta, é cuidadosamente preparada e abundantemente regada com manteiga de qualidade superior, realçando seu sabor natural. Para um toque final perfeito e uma explosão adicional de sabor, é delicadamente finalizado com cebolinha fresca, cuidadosamente selecionada. Uma combinação perfeita de sabores que promete encantar seu paladar.',
      preco: 34.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 7,
      imagem: 'shimejinamanteiga.avif',
      tipo: 'produto'
    };
    
    const hotRollShimeji = {
      id: 7008,
      nome: 'Hot-Roll de Shimeji (10 un)',
      descricao: '10 unidades de hot-roll de shimeji.',
      preco: 35.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 8,
      imagem: 'hotrolldeshimeji.avif',
      tipo: 'produto'
    };
    
    const hotRollSalmãoGrelhado = {
      id: 7009,
      nome: 'Hot-Roll de Salmão Grelhado (10 un)',
      descricao: '10 unidades de delicados enrolados de Hot-Roll, cuidadosamente recheados com salmão finamente grelhado e temperado com ingredientes frescos e um tempero exclusivo, criado especialmente para exaltar a essência do peixe. A textura cremosa do cream cheese adiciona uma camada de sabor extravagante, enquanto um finalizador de fio de tarê agrega uma doçura sutil, criando uma explosão de sabores irresistíveis. Uma verdadeira experiência culinária! Importante: Imagem meramente ilustrativa. Molho não acompanha a porção.',
      preco: 36.90,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 9,
      imagem: 'hotrolldesalmaogrelhado.avif',
      tipo: 'produto'
    };

    const teste = {
      id: 7010,
      nome: 'Teste',
      descricao: 'Teste',
      preco: 1.00,
      categoria: 'Adicionais',
      ativo: true,
      ordem: 10,
    };
    
    // Adicionar todos os produtos ao array
    this.data.produtos = [
      combo27, combo32, combo42, combo47, 
      pokeTradicional, pokeEmpanado, pokeSpicy,
      combo50, combo60,
      temakiCalifornia, temakiShimeji, temakiSalmãoGrelhado, temakiHot,
      temakiSalmãoSpicy, temakiSalmãoCreamCheese, temakiSalmãoTrufado,
      temakiCamarão, temakiCamarãoEmpanado,
      comboNadaCru, comboIceHoll, comboBrutoMesmo, comboComSashimi,
      comboBruto, comboSuperIceHoll, comboEspecialSashimi,
      niguiriSkinLemon, jowJellySpicy, jowShimeji, niguiriSalmão, niguiriSalmãoTrufado,
      jowSalmão, sashimiSalmãoTrufado, niguiriCamarão, niguiriCamarãoEmpanado,
      jowCamarãoTrufado, sashimiSalmão,
      sunomono, guioza, rolinhoPrimaveraLegumes, rolinhoPrimaveraQueijo,
      carpaccioSalmão, bolinhoSalmão, shimejiManteiga, hotRollShimeji, hotRollSalmãoGrelhado, teste
    ];
    
    // Garantir que todas as categorias dos produtos existam
    const categoriasDosProdutos = [...new Set(this.data.produtos.map(p => p.categoria).filter(Boolean))];
    categoriasDosProdutos.forEach(catNome => {
      adicionarCategoria(catNome, 
        catNome === 'Monte seu Combo' ? 1 :
        catNome === 'Pokes' ? 2 :
        catNome === 'Rodizio' ? 3 :
        catNome === 'Temakis' ? 4 :
        catNome === 'Combinados' ? 5 :
        catNome === 'Salmão' ? 6 :
        catNome === 'Adicionais' ? 7 : 99
      );
    });
    
    // Salvar
    this.saveData();
    this.salvarCategorias(); // Salvar categorias no servidor também
    
    console.log('[DATABASE] ✅ Produtos inicializados manualmente:', this.data.produtos.length);
    console.log('[DATABASE] ✅ Categorias:', this.data.categorias.map(c => typeof c === 'string' ? c : c.nome));
  }

  salvarComplementos(complementos) {
    if (!this.data) this.data = {};
    this.data.complementos = complementos || [];
    this.saveData();
    
    // Tentar persistir no servidor
    (async () => {
      try {
        const token = (() => {
          try { return localStorage.getItem('vetera_admin_token'); } catch (e) { return null; }
        })();
        await fetch((window.ENV?.apiBaseUrl || window.location.origin) + '/api/complementos', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          },
          body: JSON.stringify(complementos)
        });
      } catch (e) {
        console.warn('[DATABASE] Não foi possível sincronizar complementos com o servidor.', e);
      }
    })();
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
