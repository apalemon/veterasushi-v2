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
      
      // Salvar no database - FORÇAR salvamento DIRETO no localStorage
      try {
        // Garantir que db.data existe
        if (!db.data) {
          db.data = {};
        }
        if (!db.data.clientes) {
          db.data.clientes = [];
        }
        
        // Salvar DIRETAMENTE no localStorage
        const databaseAtual = localStorage.getItem('vetera_database');
        let dbData = databaseAtual ? JSON.parse(databaseAtual) : { clientes: [] };
        
        if (!dbData.clientes) {
          dbData.clientes = [];
        }
        
        // Verificar se já existe
        const indexExistente = dbData.clientes.findIndex(c => c.id === novoCliente.id || c.telefone === novoCliente.telefone);
        if (indexExistente >= 0) {
          dbData.clientes[indexExistente] = novoCliente;
          console.log('[CLIENTE-AUTH] Cliente atualizado no localStorage');
        } else {
          dbData.clientes.push(novoCliente);
          console.log('[CLIENTE-AUTH] Cliente adicionado ao localStorage');
        }
        
        // Salvar no localStorage
        localStorage.setItem('vetera_database', JSON.stringify(dbData));
        console.log('[CLIENTE-AUTH] ✅ Cliente salvo DIRETAMENTE no localStorage!');
        
        // Atualizar db.data também
        db.data = dbData;
        
        // Verificar se foi salvo
        const verificar = localStorage.getItem('vetera_database');
        if (verificar) {
          const parsed = JSON.parse(verificar);
          const clientesSalvos = parsed.clientes || [];
          console.log('[CLIENTE-AUTH] ✅ Verificação: Total de clientes no localStorage:', clientesSalvos.length);
          const clienteEncontrado = clientesSalvos.find(c => c.id === novoCliente.id);
          if (clienteEncontrado) {
            console.log('[CLIENTE-AUTH] ✅ Cliente confirmado no localStorage!');
          } else {
            console.error('[CLIENTE-AUTH] ❌ Cliente NÃO encontrado no localStorage após salvar!');
          }
        }
      } catch (error) {
        console.error('[CLIENTE-AUTH] ❌ ERRO ao salvar no localStorage:', error);
        console.error('[CLIENTE-AUTH] ❌ Stack:', error.stack);
      }
      
      // Também usar db.saveData se disponível
      if (typeof db.saveData === 'function') {
        try {
          db.saveData();
          console.log('[CLIENTE-AUTH] ✅ Também salvo via db.saveData()');
        } catch (e) {
          console.warn('[CLIENTE-AUTH] ⚠️ Erro ao usar db.saveData:', e);
        }
      }
      
      // Salvar também em usuarios.json - AGUARDAR para garantir que foi salvo
      try {
        await salvarUsuarioEmArquivo(novoCliente);
        console.log('[CLIENTE-AUTH] ✅ Cliente salvo em usuarios.json');
      } catch (error) {
        console.error('[CLIENTE-AUTH] ⚠️ Erro ao salvar em usuarios.json:', error);
        // Continuar mesmo se falhar, pois já foi salvo no db
      }

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
          
          // Salvar atualização no localStorage
          try {
            const databaseAtual = localStorage.getItem('vetera_database');
            if (databaseAtual) {
              const dbData = JSON.parse(databaseAtual);
              const index = dbData.clientes.findIndex(c => c.id === cliente.id);
              if (index >= 0) {
                dbData.clientes[index].senha = senhaHash;
                localStorage.setItem('vetera_database', JSON.stringify(dbData));
              }
            }
            db.saveData();
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
      db.saveData();

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
        
        // SALVAR NO ARQUIVO usuarios.json
        // Tentar via API primeiro (mas não bloquear se falhar)
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
            console.warn('[USUARIOS] ⚠️ Continuando com salvamento local...');
        }
        
        // SEMPRE salvar no localStorage também (não apenas como último recurso)
        try {
            localStorage.setItem('vetera_usuarios_json', JSON.stringify(usuarios, null, 2));
            console.log('[USUARIOS] ✅ Salvo no localStorage! Total:', usuarios.length);
            
            // Verificar se foi salvo
            const verificar = localStorage.getItem('vetera_usuarios_json');
            if (verificar) {
                const parsed = JSON.parse(verificar);
                console.log('[USUARIOS] ✅ Verificação: Total no localStorage:', parsed.length);
            }
        } catch (error) {
            console.error('[USUARIOS] ❌ Erro ao salvar no localStorage:', error);
        }
        
        if (!salvoViaAPI) {
            console.log('[USUARIOS] ⚠️ API não disponível, mas salvo no localStorage');
        }
        
    } catch (error) {
        console.error('[USUARIOS] ❌ ERRO:', error);
        // Último recurso: salvar no localStorage
        try {
            let usuarios = [];
            const stored = localStorage.getItem('vetera_usuarios_json');
            if (stored) usuarios = JSON.parse(stored);
            if (!Array.isArray(usuarios)) usuarios = [];
            
            const existe = usuarios.find(u => u.id === cliente.id || u.telefone === cliente.telefone);
            if (!existe) {
                usuarios.push({
                    id: cliente.id,
                    nome: cliente.nome,
                    telefone: cliente.telefone,
                    email: cliente.email || '',
                    endereco: cliente.endereco || '',
                    bairro: cliente.bairro || '',
                    cep: cliente.cep || '',
                    dataCadastro: cliente.dataCadastro,
                    tipo: 'cliente'
                });
                localStorage.setItem('vetera_usuarios_json', JSON.stringify(usuarios, null, 2));
                console.log('[USUARIOS] ✅ Salvo no localStorage como último recurso');
            }
        } catch (e2) {
            console.error('[USUARIOS] ❌ Erro crítico:', e2);
        }
        throw error;
    }
}

// Instância global de autenticação de clientes
const clienteAuth = new ClienteAuth();
window.clienteAuth = clienteAuth; // Tornar global


