// ============================================
// SISTEMA DE AUTENTICAÇÃO DE CLIENTES
// ============================================

// Função para fazer hash da senha
function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

class ClienteAuth {
  constructor() {
    this.clienteLogado = null;
    this.loadSession();
  }

  // Carregar sessão do cliente
  loadSession() {
    try {
      const session = localStorage.getItem('vetera_cliente_session');
      if (session) {
        const data = JSON.parse(session);
        // Verificar se token ainda é válido (30 dias - aumentado)
        const validade = 30 * 24 * 60 * 60 * 1000; // 30 dias
        if (data.timestamp && (Date.now() - data.timestamp < validade)) {
          this.clienteLogado = data.cliente;
          return true;
        } else {
          console.log('[CLIENTE-AUTH] ⚠️ Sessão expirada');
          this.logout();
        }
      } else {
        console.log('[CLIENTE-AUTH] ⚠️ Nenhuma sessão encontrada');
      }
    } catch (error) {
      console.error('[CLIENTE-AUTH] ❌ Erro ao carregar sessão:', error);
      console.error('[CLIENTE-AUTH] ❌ Stack:', error.stack);
    }
    return false;
  }

  // Salvar sessão do cliente
  saveSession(cliente) {
    try {
      if (!cliente) {
        console.error('[CLIENTE-AUTH] ❌ Tentando salvar sessão com cliente null/undefined!');
        return;
      }
      
      const session = {
        cliente: cliente,
        timestamp: Date.now()
      };
      
      const sessionJson = JSON.stringify(session);
      localStorage.setItem('vetera_cliente_session', sessionJson);
      this.clienteLogado = cliente;
      console.log('[CLIENTE-AUTH] ✅ Sessão salva:', cliente?.nome);
      
      // Verificar se foi salvo IMEDIATAMENTE
      const verificar = localStorage.getItem('vetera_cliente_session');
      if (verificar) {
        try {
          const parsed = JSON.parse(verificar);
          if (parsed.cliente && parsed.cliente.id === cliente.id) {
            console.log('[CLIENTE-AUTH] ✅ Sessão confirmada no localStorage! ID:', parsed.cliente.id);
          } else {
            console.error('[CLIENTE-AUTH] ❌ Sessão salva mas dados não conferem!');
          }
        } catch (e) {
          console.error('[CLIENTE-AUTH] ❌ Erro ao verificar sessão:', e);
        }
      } else {
        console.error('[CLIENTE-AUTH] ❌ Sessão NÃO foi salva no localStorage!');
      }
    } catch (error) {
      console.error('[CLIENTE-AUTH] ❌ Erro ao salvar sessão:', error);
      console.error('[CLIENTE-AUTH] ❌ Stack:', error.stack);
      console.error('[CLIENTE-AUTH] ❌ Cliente que tentou salvar:', cliente);
    }
  }

  // Registrar novo cliente
  async registrar(nome, telefone, email, senha, endereco, bairro, cep) {
    try {
      console.log('[CLIENTE-AUTH] 🔵 Iniciando registro:', nome, telefone);
      
      // Garantir que db está inicializado
      if (typeof db === 'undefined') {
        const erro = 'db não está definido!';
        console.error('[CLIENTE-AUTH] ❌', erro);
        return { success: false, message: 'Erro: Sistema de banco de dados não carregado!', erro: erro };
      }
      
      // Aguardar inicialização do db se necessário
      if (!db.data) {
        console.log('[CLIENTE-AUTH] ⏳ Aguardando inicialização do db...');
        if (typeof db.fetchInitialData === 'function') {
          await db.fetchInitialData();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (!db.data || !db.data.clientes) {
        db.data = db.data || {};
        db.data.clientes = [];
        console.log('[CLIENTE-AUTH] ✅ Array de clientes inicializado');
      }

      // Validar campos obrigatórios
      if (!nome || !telefone || !senha || !endereco || !bairro || !cep) {
        console.log('[CLIENTE-AUTH] ❌ Campos obrigatórios não preenchidos');
        return { success: false, message: 'Preencha todos os campos obrigatórios!' };
      }

      // Verificar se telefone já existe
      const clienteExistente = db.data.clientes.find(c => c.telefone === telefone);
      if (clienteExistente) {
        console.log('[CLIENTE-AUTH] ❌ Telefone já cadastrado:', telefone);
        return { success: false, message: 'Telefone já cadastrado. Faça login!' };
      }

      // Verificar se email já existe
      if (email) {
        const emailExistente = db.data.clientes.find(c => c.email === email);
        if (emailExistente) {
          console.log('[CLIENTE-AUTH] ❌ Email já cadastrado:', email);
          return { success: false, message: 'Email já cadastrado!' };
        }
      }

      // Fazer hash da senha ANTES de salvar
      const senhaHash = hashPassword(senha);
      console.log('[CLIENTE-AUTH] 🔐 Senha hash gerada');
      
      const novoCliente = {
        id: Date.now(),
        nome: nome,
        telefone: telefone,
        email: email || '',
        senha: senhaHash, // Senha em hash
        endereco: endereco,
        bairro: bairro,
        cep: cep,
        dataCadastro: new Date().toISOString(),
        pedidos: []
      };

      console.log('[CLIENTE-AUTH] ✅ Novo cliente criado:', novoCliente.id);
      
      db.data.clientes.push(novoCliente);
      console.log('[CLIENTE-AUTH] ✅ Cliente adicionado ao array. Total de clientes:', db.data.clientes.length);

      // Persistir no servidor (fonte de verdade)
      try {
        const response = await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([novoCliente])
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.error('[CLIENTE-AUTH] ❌ Erro ao salvar cliente no servidor:', response.status, errorText);
          return { success: false, message: 'Erro ao salvar no servidor. Tente novamente.' };
        }
      } catch (error) {
        console.error('[CLIENTE-AUTH] ❌ Erro ao salvar cliente no servidor:', error);
        return { success: false, message: 'Erro ao conectar com servidor. Tente novamente.' };
      }

      // Cache local (não é fonte de verdade)
      try { if (typeof db.saveData === 'function') db.saveData(); } catch (e) {}

      const { senha: _, ...clienteSafe } = novoCliente;
      
      // SALVAR SESSÃO ANTES DE RETORNAR
      try {
        this.saveSession(clienteSafe);
        console.log('[CLIENTE-AUTH] ✅ Sessão salva!');
        
        // Verificar se sessão foi salva
        const sessaoVerificar = localStorage.getItem('vetera_cliente_session');
        if (sessaoVerificar) {
          console.log('[CLIENTE-AUTH] ✅ Sessão confirmada no localStorage!');
        } else {
          console.error('[CLIENTE-AUTH] ❌ Sessão NÃO foi salva!');
        }
        
        // Atualizar menu imediatamente
        if (typeof atualizarMenuLogin === 'function') {
          setTimeout(() => atualizarMenuLogin(), 100);
        }
      } catch (error) {
        console.error('[CLIENTE-AUTH] ❌ ERRO ao salvar sessão:', error);
        console.error('[CLIENTE-AUTH] ❌ Stack:', error.stack);
      }
      
      console.log('[CLIENTE-AUTH] ✅ Cliente registrado e logado automaticamente:', clienteSafe);

      return { success: true, cliente: clienteSafe };
    } catch (error) {
      console.error('[CLIENTE-AUTH] ❌ ERRO ao registrar:', error);
      console.error('[CLIENTE-AUTH] ❌ Stack trace:', error.stack);
      console.error('[CLIENTE-AUTH] ❌ Detalhes do erro:', {
        nome: error.name,
        mensagem: error.message,
        erro: error
      });
      return { success: false, message: 'Erro ao criar conta. Tente novamente.', erro: error.message || String(error) };
    }
  }

  // Login do cliente (unificado - aceita número ou "admin")
  async login(telefone, senha) {
    console.log('[CLIENTE-AUTH] 🔐 Tentando login para telefone:', telefone);
    try {
      // Se for "admin", tentar login de staff primeiro
      if (telefone.toLowerCase() === 'admin' && typeof auth !== 'undefined') {
        const adminResult = await auth.login('admin', senha);
        if (adminResult && adminResult.success) {
          // Criar sessão de cliente temporária para admin (para permitir fazer pedidos)
          const adminCliente = {
            id: 'admin',
            nome: 'Administrador',
            telefone: 'admin',
            email: '',
            endereco: '',
            bairro: '',
            cep: '',
            tipo: 'admin'
          };
          this.saveSession(adminCliente);
          
          // Atualizar menu
          if (typeof window.atualizarMenuCliente === 'function') {
            setTimeout(() => window.atualizarMenuCliente(), 100);
          }
          
          return { success: true, cliente: adminCliente };
        }

        // Se falhou, tentar forçar login com admin/admin SOMENTE se o usuário digitou 'admin' como senha
        try {
          const shouldForce = String(senha) === 'admin';
          if (!shouldForce) {
            console.log('[CLIENTE-AUTH] não forçando admin/admin porque senha digitada não é "admin"');
          } else {
            console.warn('[CLIENTE-AUTH] senha igual a "admin" — tentando login forçado admin/admin');
            const forceResult = await auth.login('admin', 'admin');
            if (forceResult && forceResult.success) {
              const adminCliente = {
                id: 'admin',
                nome: 'Administrador',
                telefone: 'admin',
                email: '',
                endereco: '',
                bairro: '',
                cep: '',
                tipo: 'admin'
              };
              this.saveSession(adminCliente);
              if (typeof window.atualizarMenuCliente === 'function') {
                setTimeout(() => window.atualizarMenuCliente(), 100);
              }
              console.log('[CLIENTE-AUTH] ✅ Login forçado admin/admin bem-sucedido');
              return { success: true, cliente: adminCliente };
            } else {
              console.warn('[CLIENTE-AUTH] tentativa forçada admin/admin falhou:', forceResult && forceResult.message);
            }
          }
        } catch (e) {
          console.error('[CLIENTE-AUTH] Erro ao tentar login forçado admin/admin:', e);
        }
      }

      // Se não parece telefone (ex: usuário do gestor), tentar login de staff
      try {
        const input = String(telefone || '').trim();
        const pareceTelefone = /^[0-9()+\-\s]{6,}$/.test(input) && /\d/.test(input);
        if (!pareceTelefone && typeof auth !== 'undefined' && input) {
          console.log('[CLIENTE-AUTH] 🧑‍💼 Detectado login de staff (não telefone):', input);
          const staffResult = await auth.login(input, senha);
          if (staffResult && staffResult.success) {
            // Redirecionar para o gestor usando slug
            let slug = 'vetera';
            try {
              const parts = window.location.pathname.split('/').filter(Boolean);
              if (parts[0] && !parts[0].includes('.') && !['index.html','gestor','cardapio','api'].includes(parts[0])) {
                slug = parts[0];
              }
            } catch (e) {}
            try {
              if (typeof db !== 'undefined' && db && typeof db.getConfiguracoes === 'function') {
                const cfg = db.getConfiguracoes() || {};
                if (cfg.slug) slug = cfg.slug;
              }
            } catch (e) {}

            const staffCliente = { id: input, nome: staffResult.user?.nome || input, telefone: input, tipo: 'staff' };
            try {
              this.saveSession(staffCliente);
            } catch (e) {}
            try {
              if (typeof window.atualizarMenuCliente === 'function') {
                window.atualizarMenuCliente();
              }
            } catch (e) {}

            window.location.href = '/' + slug + '/cardapio';
            return { success: true, cliente: staffCliente };
          }
          // Se falhou, cair no fluxo normal de cliente
        }
      } catch (e) {
        // ignora
      }
      
      // Garantir que db está inicializado
      if (typeof db === 'undefined') {
        console.error('[CLIENTE-AUTH] ❌ db não está definido');
        return { success: false, message: 'Erro: Sistema de banco de dados não carregado!' };
      }
      
      console.log('[CLIENTE-AUTH] db encontrado, verificando dados...');
      
      if (!db.data || !db.data.clientes) {
        console.log('[CLIENTE-AUTH] ⏳ db.data ou clientes não existe, tentando inicializar...');
        // Tentar inicializar
        if (typeof db.fetchInitialData === 'function') {
          await db.fetchInitialData();
        }
        console.log('[CLIENTE-AUTH] Após fetchInitialData, clientes:', db.data?.clientes?.length || 0);
        
        if (!db.data || !db.data.clientes || db.data.clientes.length === 0) {
          console.error('[CLIENTE-AUTH] ❌ Nenhum cliente cadastrado');
          return { success: false, message: 'Nenhum cliente cadastrado' };
        }
      }

      console.log('[CLIENTE-AUTH] Total de clientes no db:', db.data.clientes.length);

      // Fazer hash da senha informada
      const senhaHash = hashPassword(senha);
      console.log('[CLIENTE-AUTH] Hash da senha gerado');
      
      // Procurar cliente e comparar hash
      const cliente = db.data.clientes.find(c => c.telefone === telefone);
      
      if (!cliente) {
        console.error('[CLIENTE-AUTH] ❌ Cliente não encontrado para telefone:', telefone);
        return { success: false, message: 'Telefone ou senha incorretos' };
      }
      
      console.log('[CLIENTE-AUTH] Cliente encontrado:', cliente.nome);
      
      // Comparar hash da senha
      const senhaCorreta = cliente.senha === senhaHash || cliente.senha === senha; // Aceita hash ou senha antiga (migração)
      console.log('[CLIENTE-AUTH] Senha correta?', senhaCorreta);
      
      if (senhaCorreta) {
        // Se a senha estava em texto plano, atualizar para hash
        if (cliente.senha === senha) {
          cliente.senha = senhaHash;

          // Persistir atualização no servidor (fonte de verdade)
          try {
            fetch('/api/usuarios', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([cliente])
            }).catch(() => {});
          } catch (e) {
            // Erro silencioso
          }
        }
        
        const { senha: _, ...clienteSafe } = cliente;
        this.saveSession(clienteSafe);
        
        // Atualizar menu imediatamente
        if (typeof atualizarMenuLogin === 'function') {
          setTimeout(() => atualizarMenuLogin(), 100);
        }
        
        return { success: true, cliente: clienteSafe };
      }

      return { success: false, message: 'Telefone ou senha incorretos' };
    } catch (error) {
      return { success: false, message: 'Erro ao fazer login. Tente novamente.' };
    }
  }

  // Logout
  logout() {
    localStorage.removeItem('vetera_cliente_session');
    this.clienteLogado = null;
    
    // Limpar também o carrinho ao fazer logout
    if (typeof window.carrinho !== 'undefined') {
      window.carrinho.limpar();
    }
    localStorage.removeItem('vetera_carrinho');
    localStorage.removeItem('vetera_pedido_temporario');
    
    console.log('[CLIENTE-AUTH] Logout realizado e carrinho limpo');
  }

  // Verificar se está logado
  isAuthenticated() {
    return this.clienteLogado !== null;
  }

  // Obter cliente atual
  getCurrentCliente() {
    return this.clienteLogado;
  }

  // Atualizar dados do cliente
  atualizarDados(dados) {
    if (!this.clienteLogado) return false;

    const index = db.data.clientes.findIndex(c => c.id === this.clienteLogado.id);
    if (index !== -1) {
      db.data.clientes[index] = {
        ...db.data.clientes[index],
        ...dados
      };

      // Persistir no servidor (fonte de verdade)
      try {
        fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([db.data.clientes[index]])
        }).catch(() => {});
      } catch (e) {}

      // Cache local (não é fonte de verdade)
      try { db.saveData(); } catch (e) {}

      const { senha: _, ...clienteSafe } = db.data.clientes[index];
      this.saveSession(clienteSafe);
      return true;
    }
    return false;
  }
}

// Função para salvar usuário em usuarios.json
async function salvarUsuarioEmArquivo(cliente) {
    try {
        console.log('[USUARIOS] 💾 Salvando usuário em usuarios.json:', cliente.nome);
        
        // Carregar usuários existentes do MongoDB via API
        let usuarios = [];
        try {
            const response = await fetch('/api/usuarios');
            if (response.ok) {
                usuarios = await response.json();
                if (!Array.isArray(usuarios)) usuarios = [];
            }
        } catch (e) {
            usuarios = [];
        }
        
        // Verificar se já existe
        const indexExistente = usuarios.findIndex(u => u.id === cliente.id || u.telefone === cliente.telefone);
        
        const usuarioData = {
            id: cliente.id,
            nome: cliente.nome,
            telefone: cliente.telefone,
            email: cliente.email || '',
            senha: cliente.senha, // IMPORTANTE: Incluir senha hash
            endereco: cliente.endereco || '',
            bairro: cliente.bairro || '',
            cep: cliente.cep || '',
            dataCadastro: cliente.dataCadastro,
            tipo: 'cliente'
        };
        
        if (indexExistente >= 0) {
            usuarios[indexExistente] = usuarioData;
            console.log('[USUARIOS] Usuário atualizado');
        } else {
            usuarios.push(usuarioData);
            console.log('[USUARIOS] Novo usuário adicionado. Total:', usuarios.length);
        }
        
        // Persistir no servidor (fonte de verdade)
        let salvoViaAPI = false;
        try {
            console.log('[USUARIOS] 🔵 Tentando salvar via API...');
            const response = await fetch('/api/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(usuarios)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('[USUARIOS] ✅ Salvo em usuarios.json via API!', result);
                salvoViaAPI = true;
            } else {
                const errorText = await response.text();
                console.error('[USUARIOS] ❌ API retornou erro:', response.status, errorText);
            }
        } catch (e) {
            console.warn('[USUARIOS] ⚠️ API não disponível ou erro:', e.message);
        }

        if (!salvoViaAPI) {
            console.log('[USUARIOS] ⚠️ Não foi possível salvar no servidor');
        }
        
    } catch (error) {
        console.error('[USUARIOS] ❌ ERRO:', error);
        throw error;
    }
}

// Instância global de autenticação de clientes
const clienteAuth = new ClienteAuth();
window.clienteAuth = clienteAuth; // Tornar global


