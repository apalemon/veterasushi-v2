# Vetera Sushi - Sistema de Gestão

Sistema completo de gestão para restaurante de sushi, incluindo cardápio online, gestão de pedidos, PDV e painel administrativo.

## 🚀 Deploy na Vercel

### Pré-requisitos

- Conta no [Vercel](https://vercel.com)
- Conta no [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Node.js 18+ (para desenvolvimento local)

### Passo a Passo

1. **Fazer push para o GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <seu-repositorio-github>
   git push -u origin main
   ```

2. **Conectar com a Vercel**
   - Acesse [vercel.com](https://vercel.com)
   - Clique em "Add New Project"
   - Importe seu repositório do GitHub
   - A Vercel detectará automaticamente as configurações

3. **Configurar Variáveis de Ambiente**
   
   No painel da Vercel, vá em **Settings > Environment Variables** e adicione:
   
   - `MONGODB_URI`: String de conexão do MongoDB Atlas
     - Formato: `mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority`
   - `MONGODB_DB_NAME`: Nome do banco de dados (opcional, padrão: `vetera`)

4. **Deploy**
   - A Vercel fará o deploy automaticamente
   - Aguarde a conclusão do build
   - Seu site estará disponível em `https://seu-projeto.vercel.app`

## 📁 Estrutura do Projeto

```
├── api/                    # Serverless Functions (Vercel)
│   ├── mongodb.js         # Helper de conexão MongoDB
│   ├── pedidos.js         # API de pedidos
│   ├── produtos.js        # API de produtos
│   ├── usuarios.js        # API de usuários
│   ├── horarios.js        # API de horários
│   ├── condicionais.js    # API de regras condicionais
│   ├── cupons.js          # API de cupons
│   ├── cupons/
│   │   └── validar.js     # API de validação de cupons
│   ├── auth/
│   │   └── login.js       # API de autenticação (/api/auth/login)
│   ├── database.js        # API de dados públicos
│   └── upload-imagem.js  # API de upload de imagens
├── js/                    # JavaScript do cliente
├── css/                   # Estilos
├── Fotos/                 # Imagens dos produtos
├── index.html             # Cardápio online
├── gestor.html            # Painel administrativo
├── pdv.html               # PDV (Ponto de Venda)
├── vercel.json            # Configuração da Vercel
└── package.json           # Dependências

```

## 🔧 Configuração Local (Opcional)

Para rodar localmente:

```bash
# Instalar dependências
npm install

# Rodar servidor local (se necessário)
npm start
```

## 📝 Notas Importantes

- **MongoDB Atlas**: Certifique-se de que o IP `0.0.0.0/0` está na whitelist do MongoDB Atlas para permitir conexões da Vercel
- **Variáveis de Ambiente**: Nunca commite arquivos `.env` no repositório
- **Imagens**: As imagens devem estar no repositório na pasta `Fotos/` ou usar um serviço externo como Cloudinary

## 🆘 Suporte

Em caso de problemas:
1. Verifique os logs na Vercel (Deployments > View Function Logs)
2. Confirme que as variáveis de ambiente estão configuradas
3. Verifique a conexão com o MongoDB Atlas

## 📄 Licença

ISC


