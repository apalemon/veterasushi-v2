# 📦 Guia para Enviar para o GitHub

## Opção 1: Usando GitHub Desktop (Mais Fácil)

1. **Baixar GitHub Desktop**
   - Acesse: https://desktop.github.com/
   - Instale o aplicativo

2. **Conectar com sua conta GitHub**
   - Abra o GitHub Desktop
   - Faça login com sua conta GitHub

3. **Adicionar o repositório**
   - Clique em "File" > "Add Local Repository"
   - Selecione a pasta: `C:\Users\BetoPC\Desktop\Vetera - V2`
   - Se não for um repositório Git ainda, clique em "Create a repository"
     - Nome: `vetera-v2`
     - Local path: `C:\Users\BetoPC\Desktop\Vetera - V2`
     - Marque "Initialize this repository with a README" (opcional)

4. **Fazer commit**
   - No GitHub Desktop, você verá todos os arquivos modificados
   - Na parte inferior, escreva uma mensagem: "Migração para Vercel - Sistema completo"
   - Clique em "Commit to main"

5. **Publicar no GitHub**
   - Clique em "Publish repository"
   - Escolha um nome (ex: `vetera-v2`)
   - Marque "Keep this code private" se quiser privado
   - Clique em "Publish repository"

---

## Opção 2: Usando Git no Terminal (Se tiver instalado)

### Passo 1: Instalar Git (se não tiver)
- Baixe em: https://git-scm.com/download/win
- Instale com as opções padrão

### Passo 2: Abrir Terminal na pasta do projeto
1. Abra o PowerShell ou CMD
2. Navegue até a pasta:
   ```powershell
   cd "C:\Users\BetoPC\Desktop\Vetera - V2"
   ```

### Passo 3: Inicializar repositório Git (se ainda não tiver)
```bash
git init
``

### Passo 4: Adicionar todos os arquivos
```bash
git add .
```

### Passo 5: Fazer commit
```bash
git commit -m "Migração para Vercel - Sistema completo"
```

### Passo 6: Criar repositório no GitHub
1. Acesse: https://github.com/new
2. Nome do repositório: `vetera-v2`
3. Escolha se será público ou privado
4. **NÃO** marque "Initialize with README" (já temos um)
5. Clique em "Create repository"

### Passo 7: Conectar e enviar
```bash
git remote add origin https://github.com/SEU-USUARIO/vetera-v2.git
git branch -M main
git push -u origin main
```

**Substitua `SEU-USUARIO` pelo seu nome de usuário do GitHub!**

---

## Opção 3: Usando VS Code (Visual Studio Code)

1. **Instalar VS Code**
   - Baixe em: https://code.visualstudio.com/
   - Instale a extensão "Git" (já vem instalada)

2. **Abrir a pasta no VS Code**
   - File > Open Folder
   - Selecione: `C:\Users\BetoPC\Desktop\Vetera - V2`

3. **Fazer commit**
   - Clique no ícone de Git na barra lateral (ou Ctrl+Shift+G)
   - Clique em "Initialize Repository" se necessário
   - Digite uma mensagem: "Migração para Vercel"
   - Clique em "✓ Commit"

4. **Publicar no GitHub**
   - Clique em "Publish Branch"
   - Escolha se será público ou privado
   - Escolha um nome: `vetera-v2`
   - Clique em "OK"

---

## 📋 Checklist Antes de Enviar

- [ ] Verificar se `.gitignore` está criado (já está ✅)
- [ ] Verificar se `node_modules/` não será enviado (está no .gitignore ✅)
- [ ] Verificar se arquivos sensíveis não serão enviados
- [ ] Verificar se todas as pastas importantes estão incluídas:
  - [x] `api/` - Funções Vercel
  - [x] `js/` - JavaScript
  - [x] `css/` - Estilos
  - [x] `Fotos/` - Imagens
  - [x] `index.html`, `gestor.html`, `pdv.html`
  - [x] `vercel.json`
  - [x] `package.json`
  - [x] `README.md`

---

## ⚠️ Arquivos que NÃO devem ser enviados (já no .gitignore)

- `node_modules/` - Dependências (serão instaladas na Vercel)
- `.env` - Variáveis de ambiente (configure na Vercel)
- Arquivos temporários e de build

---

## 🚀 Depois de Enviar para o GitHub

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "Add New Project"
3. Conecte com GitHub
4. Selecione o repositório `vetera-v2`
5. Configure as variáveis de ambiente:
   - `MONGODB_URI`
   - `MONGODB_DB_NAME` (opcional)
6. Clique em "Deploy"

---

## 💡 Dica

Se você já tem um repositório no GitHub e quer atualizar:
```bash
git add .
git commit -m "Migração para Vercel"
git push
```

