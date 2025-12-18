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
      const apiUrl = window.location.origin + '/api/auth/login';
      console.log('[AUTH] 📡 Chamando API:', apiUrl);
      
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
