# 🔧 Solução para "Cannot GET" na Vercel

## Problema
Ao acessar o site na Vercel, aparece o erro "Cannot GET".

## Causa
A Vercel pode estar tentando usar o `server.js` como servidor, mas na Vercel não precisamos de um servidor Express - os arquivos estáticos são servidos automaticamente.

## Solução

### 1. Verificar se o `index.html` está na raiz
✅ O arquivo `index.html` está na raiz do projeto.

### 2. Configuração do Vercel

Na Vercel, você precisa configurar o projeto como **Static Site**:

1. Acesse o painel da Vercel
2. Vá em **Settings** > **General**
3. Em **Build & Development Settings**:
   - **Framework Preset**: Selecione "Other" ou "Static Site"
   - **Build Command**: Deixe vazio ou remova
   - **Output Directory**: Deixe vazio ou coloque `.` (ponto)
   - **Install Command**: `npm install` (se tiver dependências)

### 3. Verificar estrutura de pastas

Certifique-se de que:
- ✅ `index.html` está na raiz
- ✅ `api/` contém as funções serverless
- ✅ `vercel.json` está configurado corretamente

### 4. Deploy

1. Faça commit das alterações:
   ```bash
   git add .
   git commit -m "Fix: Configuração Vercel para arquivos estáticos"
   git push
   ```

2. A Vercel fará o deploy automaticamente

### 5. Verificar logs

Se ainda não funcionar:
1. Vá em **Deployments** na Vercel
2. Clique no último deployment
3. Veja os **Function Logs** para verificar erros

## Estrutura esperada na Vercel

```
/
├── index.html          ← Servido automaticamente em /
├── gestor.html         ← Servido automaticamente em /gestor.html
├── pdv.html            ← Servido automaticamente em /pdv.html
├── api/                ← Funções serverless em /api/*
│   ├── produtos.js     → /api/produtos
│   ├── pedidos.js      → /api/pedidos
│   └── ...
├── js/                 ← Arquivos estáticos
├── css/                ← Arquivos estáticos
├── Fotos/              ← Arquivos estáticos
└── vercel.json         ← Configuração
```

## Teste

Após o deploy, acesse:
- `https://seu-projeto.vercel.app/` → Deve mostrar o `index.html`
- `https://seu-projeto.vercel.app/gestor.html` → Deve mostrar o gestor
- `https://seu-projeto.vercel.app/api/produtos` → Deve retornar JSON (erro 405 se GET não permitido, mas significa que a função está funcionando)

## Se ainda não funcionar

1. **Verifique se o `index.html` está sendo enviado para o GitHub**
2. **Verifique os logs do deployment na Vercel**
3. **Tente fazer um redeploy manual** (Deployments > ... > Redeploy)
4. **Verifique se há erros de build** nos logs

