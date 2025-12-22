// ============================================
// SISTEMA DE AUTENTICAÇÃO SEGURO
// ============================================

class Auth {
  constructor() {
    this.currentUser = null;
    this.sessionToken = null;
    this.loadSession();
  }

  // Hash seguro de senha usando algoritmo melhorado
  hashPassword(password) {
    if (!password) return '';
    // Usar algoritmo mais seguro com salt fixo para consistência
    const salt = 'vetera_sushi_2024_salt_secure';
    const saltedPassword = salt + password + salt;
    
    let hash = 0;
    for (let i = 0; i < saltedPassword.length; i++) {
      const char = saltedPassword.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Adicionar mais complexidade (reversa)
    let hash2 = 0;
    for (let i = saltedPassword.length - 1; i >= 0; i--) {
      const char = saltedPassword.charCodeAt(i);
      hash2 = ((hash2 << 3) - hash2) + char;
      hash2 = hash2 & hash2;
    }
    
    // Combinar hashes de forma determinística
    const combined = Math.abs(hash) + Math.abs(hash2);
    // Converter para base36 para consistência
    return 'hashed_' + Math.abs(combined).toString(36) + Math.abs(hash).toString(36).slice(-10);
  }

  // Gerar token de sessão
  generateToken() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2) + Date.now().toString(36);
  }

  // Carregar sessão
  loadSession() {
    try {
      const session = localStorage.getItem('vetera_session');
      if (session) {
        const data = JSON.parse(session);
        // Verificar se token ainda é válido (24 horas)
        if (Date.now() - data.timestamp < 86400000) {
          this.currentUser = data.user;
          this.sessionToken = data.token;
          return true;
        } else {
          this.logout();
        }
      }
    } catch (error) {
      console.error('Erro ao carregar sessão:', error);
    }
    return false;
  }

  // Salvar sessão
  saveSession(user) {
    const token = this.generateToken();
    const session = {
      user: user,
      token: token,
      timestamp: Date.now()
    };
    localStorage.setItem('vetera_session', JSON.stringify(session));
    this.currentUser = user;
    this.sessionToken = token;
  }

  // Login - usar API segura
  async login(usuario, senha) {
    console.log('[AUTH] 🔐 Tentando login para:', usuario);
    
    // Tentar login via API primeiro (mais seguro)
    try {
      const apiUrl = '/api/auth/login';
      console.log('[AUTH] 📡 Chamando API (relativo):', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
      });
      
      console.log('[AUTH] 📡 Resposta da API:', response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[AUTH] 📦 Resultado:', result);
        
        if (result.success) {
          this.saveSession(result.user);
          console.log('[AUTH] ✅ Login bem-sucedido!');
          return { success: true, user: result.user };
        } else {
          console.log('[AUTH] ❌ Login falhou:', result.message);
          return { success: false, message: result.message || 'Credenciais inválidas' };
        }
      } else {
        console.error('[AUTH] ❌ API retornou erro:', response.status);

        // Tratar 401: credenciais inválidas. Se não houver usuários locais, criar seed admin e tentar login local.
        if (response.status === 401) {
          console.warn('[AUTH] ⚠️ Credenciais inválidas (401) da API. Tentando fallback local');
          try {
            if (db && db.data && Array.isArray(db.data.usuarios) && db.data.usuarios.length > 0) {
              console.log('[AUTH] 🔄 Tentando login local como fallback (API 401)...');
              return this.loginLocal(usuario, senha);
            }

            // Se não houver usuários locais, criar seed admin e tentar login local
            if (!db) window.db = window.db || {};
            if (!db.data) db.data = {};
            if (!Array.isArray(db.data.usuarios)) db.data.usuarios = [];
            if (db.data.usuarios.length === 0) {
              console.warn('[AUTH] ⚠️ Nenhum usuário local encontrado — criando usuário admin temporário (admin/admin) para testes. Troque a senha após entrar.');
              const adminUser = {
                id: Date.now(),
                usuario: 'admin',
                senha: this.hashPassword('admin'),
                nome: 'Administrador (seed)',
                nivel: 'admin',
                ativo: true
              };
              db.data.usuarios.push(adminUser);
              try { if (typeof db.saveData === 'function') db.saveData(); localStorage.setItem('vetera_database', JSON.stringify(db.data)); } catch(e) { console.warn('[AUTH] ⚠️ Falha ao salvar admin seed:', e); }
              try {
                const localResult = this.loginLocal(usuario, senha);
                if (localResult && localResult.success) {
                  console.log('[AUTH] ✅ Login local bem-sucedido após criar admin seed');
                  this.saveSession(localResult.user);
                  return { success: true, user: localResult.user };
                }
              } catch (e) {
                console.warn('[AUTH] ⚠️ Erro ao tentar login local após seed:', e);
              }
              return { success: false, message: 'Usuário admin temporário criado — use admin/admin para entrar e altere a senha.' };
            }
          } catch (e) {
            console.warn('[AUTH] ⚠️ Erro no fallback 401:', e);
          }

          return { success: false, message: 'Credenciais inválidas (401) - login falhou' };
        }

        // Tratar 404 explicitamente: tentar um endpoint alternativo com o prefixo da loja (ex: /<store>/api/auth/login) antes do fallback local
        if (response.status === 404) {
          console.warn('[AUTH] ⚠️ Endpoint de autenticação não encontrado (404).');
          try {
            const pathParts = window.location.pathname.split('/').filter(Boolean);
            const first = pathParts[0];
            if (first) {
              const cleaned = String(first).toLowerCase();
              const isValidStore = /^[a-z0-9_-]{1,50}$/.test(cleaned) && !cleaned.includes('.') && !['index.html','api','gestor','cardapio',''].includes(cleaned);
              if (!isValidStore) {
                console.warn('[AUTH] ⚠️ Ignorando segmento de path inválido para store:', first);
              } else {
                const altApi = '/' + cleaned + '/api/auth/login';
                console.log('[AUTH] 🔁 Tentando endpoint alternativo:', altApi);
                const altResp = await fetch(altApi, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ usuario, senha })
                });
                if (altResp.ok) {
                  const altResult = await altResp.json();
                  if (altResult.success) {
                    this.saveSession(altResult.user);
                    console.log('[AUTH] ✅ Login bem-sucedido via endpoint alternativo!');
                    return { success: true, user: altResult.user };
                  } else {
                    console.log('[AUTH] ❌ Alternativo falhou:', altResult.message);
                    return { success: false, message: altResult.message || 'Credenciais inválidas (endpoint alternativo)'};
                  }
                } else {
                  console.warn('[AUTH] ⚠️ Endpoint alternativo retornou:', altResp.status);
                }
              }
            }
          } catch (e) {
            console.warn('[AUTH] ⚠️ Erro ao tentar endpoint alternativo:', e);
          }

          return { success: false, message: 'API de autenticação não encontrada (404). No servidor não há endpoint para /api/auth/login e não há usuários locais para fallback.' };
        }        try {
          const errBody = await response.json();
          const msg = errBody && (errBody.message || errBody.error) ? (errBody.message || errBody.error) : `Erro na API: ${response.status}`;
          return { success: false, message: msg };
        } catch (e) {
          return { success: false, message: `Erro ao autenticar: ${response.status}` };
        }
      }
    } catch (error) {
      console.error('[AUTH] ❌ Erro ao chamar API:', error);
      
      // Se API falhar, tentar fallback local (apenas se db tiver usuários)
      if (db && db.data && db.data.usuarios && db.data.usuarios.length > 0) {
        console.log('[AUTH] 🔄 Tentando login local como fallback...');
        return this.loginLocal(usuario, senha);
      }
      return { success: false, message: 'Erro ao conectar com servidor. Verifique se o servidor está rodando.' };
    }
    
    return { success: false, message: 'Erro ao fazer login' };
  }
  
  // Login local (fallback)
  loginLocal(usuario, senha) {
    if (!db.data || !db.data.usuarios) return { success: false, message: 'Sistema não inicializado' };

    // Permitir login com "admin" como usuário ou número
    let user = null;
    if (usuario.toLowerCase() === 'admin') {
      user = db.data.usuarios.find(
        u => (u.usuario === 'admin' || u.nivel === 'admin') && u.ativo !== false
      );
    } else {
      user = db.data.usuarios.find(
        u => (u.usuario === usuario || u.telefone === usuario) && u.ativo !== false
      );
    }

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    // Verificar senha
    let senhaValida = false;
    
    if (user.senha && user.senha.startsWith('hashed_')) {
      const senhaHash = this.hashPassword(senha);
      senhaValida = senhaHash === user.senha;
    } else {
      const senhaHash = this.hashPassword(senha);
      const senhaArmazenadaHash = this.hashPassword(user.senha);
      senhaValida = (user.senha === senha) || (senhaHash === senhaArmazenadaHash);
      
      if (senhaValida && user.senha === senha) {
        user.senha = this.hashPassword(senha);
        if (db && db.data && db.data.usuarios) {
          const userIndex = db.data.usuarios.findIndex(u => u.id === user.id);
          if (userIndex !== -1) {
            db.data.usuarios[userIndex].senha = user.senha;
            db.saveData();
          }
        }
      }
    }

    if (senhaValida) {
      const { senha: _, ...userSafe } = user;
      this.saveSession(userSafe);
      return { success: true, user: userSafe };
    }

    return { success: false, message: 'Senha incorreta' };
  }

  // Logout
  logout() {
    localStorage.removeItem('vetera_session');
    this.currentUser = null;
    this.sessionToken = null;
  }

  // Verificar se está logado
  isAuthenticated() {
    return this.currentUser !== null && this.sessionToken !== null;
  }

  // Verificar se é admin
  isAdmin() {
    return this.isAuthenticated() && this.currentUser?.nivel === 'admin';
  }

  // Verificar se é gerente ou admin
  isManager() {
    return this.isAuthenticated() && (this.currentUser?.nivel === 'admin' || this.currentUser?.nivel === 'gerente');
  }

  // Obter usuário atual
  getCurrentUser() {
    return this.currentUser;
  }
}

// Instância global de autenticação
const auth = new Auth();
window.auth = auth; // Tornar global
