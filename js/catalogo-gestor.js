(function () {
    let adicionaisRascunho = [];

    function escaparHtml(valor) {
        return String(valor == null ? '' : valor).replace(/[&<>"']/g, caractere => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[caractere]);
    }

    function formatarPreco(valor) {
        return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function podeEditar() {
        return !!window.db && window.db.catalogoStatus === 'local';
    }

    function atualizarStatusCatalogo() {
        const container = document.getElementById('catalogo-status');
        if (!container || !window.db) return;

        const status = window.db.catalogoStatus;
        const produtos = window.db.data && Array.isArray(window.db.data.produtos) ? window.db.data.produtos : [];
        const bloquearEdicao = !podeEditar();
        const botaoProduto = document.getElementById('btn-add-produto');
        const botaoCategoria = document.querySelector('.catalogo-header-actions button');
        if (botaoProduto) botaoProduto.disabled = bloquearEdicao;
        if (botaoCategoria) botaoCategoria.disabled = bloquearEdicao;
        container.className = 'catalogo-status catalogo-status-' + status;
        container.replaceChildren();

        const texto = document.createElement('span');
        texto.textContent = `Catálogo local do projeto · ${produtos.length} itens. As alterações ficam como rascunho neste navegador até você baixar e publicar o arquivo.`;
        container.appendChild(texto);
    }

    function atualizarFiltrosCategorias() {
        const filtro = document.getElementById('catalogo-filtro-categoria');
        if (!filtro || !window.db) return;

        const categoriaAtual = filtro.value;
        const categorias = window.db.getCategorias().slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
        filtro.innerHTML = '<option value="">Todas as categorias</option>' +
            categorias.map(categoria => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`).join('');
        if (categorias.includes(categoriaAtual)) filtro.value = categoriaAtual;
    }

    function criarBotao(texto, classe, acao, disabled) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = classe;
        botao.textContent = texto;
        botao.disabled = !!disabled;
        botao.addEventListener('click', acao);
        return botao;
    }

    function criarCard(produto, indice, total, disabled) {
        const card = document.createElement('article');
        card.className = 'produto-card-admin catalogo-product-card';
        const imagem = typeof produto.imagem === 'string' && produto.imagem
            ? (produto.imagem.startsWith('http') || produto.imagem.startsWith('/') ? produto.imagem : '/Fotos/' + produto.imagem)
            : '';
        const quantidadeAdicionais = Array.isArray(produto.adicionais) ? produto.adicionais.length : 0;
        const disponivel = produto.ativo !== false;
        const adicionaisLabel = quantidadeAdicionais === 1 ? '1 complemento' : `${quantidadeAdicionais} complementos`;

        card.innerHTML = `
            <div class="catalogo-product-image">
                ${imagem
                    ? `<img src="${escaparHtml(imagem)}" alt="${escaparHtml(produto.nome)}" loading="lazy">`
                    : '<span aria-hidden="true"><i class="fas fa-utensils"></i></span>'}
                <span class="catalogo-product-status ${disponivel ? 'is-active' : 'is-paused'}">${disponivel ? 'Disponível' : 'Pausado'}</span>
            </div>
            <div class="catalogo-product-content">
                <div class="catalogo-product-meta">
                    <span>${escaparHtml(produto.categoria || 'Sem categoria')}</span>
                    <span>${adicionaisLabel}</span>
                </div>
                <h3>${escaparHtml(produto.nome || 'Item sem nome')}</h3>
                <p>${escaparHtml(produto.descricao || 'Sem descrição')}</p>
                <div class="catalogo-product-price">${formatarPreco(produto.preco)}</div>
                <div class="catalogo-product-actions"></div>
            </div>
        `;

        const acoes = card.querySelector('.catalogo-product-actions');
        const produtoId = produto.id;
        acoes.appendChild(criarBotao('↑', 'btn btn-secondary btn-small', () => window.moverProdutoUp(produtoId), disabled || indice === 0));
        acoes.appendChild(criarBotao('↓', 'btn btn-secondary btn-small', () => window.moverProdutoDown(produtoId), disabled || indice === total - 1));
        acoes.appendChild(criarBotao('Editar', 'btn btn-primary btn-small', () => window.editarProdutoGestor(produtoId), disabled));
        acoes.appendChild(criarBotao(disponivel ? 'Pausar' : 'Ativar', 'btn btn-secondary btn-small', () => window.toggleProdutoAtivo(produtoId), disabled));
        acoes.appendChild(criarBotao('Excluir', 'btn btn-danger btn-small', () => window.excluirProdutoGestor(produtoId), disabled));
        return card;
    }

    window.renderizarCatalogo = function () {
        const container = document.getElementById('produtos-admin-grid');
        if (!container || !window.db) return;

        const produtos = window.db.getProdutos();
        const busca = String(document.getElementById('catalogo-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
        const categoria = document.getElementById('catalogo-filtro-categoria')?.value || '';
        const status = document.getElementById('catalogo-filtro-status')?.value || '';
        const filtrados = produtos.filter(produto => {
            const texto = `${produto.nome || ''} ${produto.descricao || ''}`.toLocaleLowerCase('pt-BR');
            if (busca && !texto.includes(busca)) return false;
            if (categoria && produto.categoria !== categoria) return false;
            if (status === 'ativo' && produto.ativo === false) return false;
            if (status === 'pausado' && produto.ativo !== false) return false;
            return true;
        });

        document.getElementById('catalogo-stat-total').textContent = String(produtos.length);
        document.getElementById('catalogo-stat-ativos').textContent = String(produtos.filter(p => p.ativo !== false).length);
        document.getElementById('catalogo-stat-categorias').textContent = String(new Set(produtos.map(p => p.categoria).filter(Boolean)).size);
        atualizarFiltrosCategorias();
        atualizarStatusCatalogo();

        container.replaceChildren();
        if (filtrados.length === 0) {
            const vazio = document.createElement('div');
            vazio.className = 'catalogo-empty';
            vazio.textContent = produtos.length ? 'Nenhum item corresponde aos filtros.' : 'Ainda não há itens cadastrados.';
            container.appendChild(vazio);
            return;
        }

        const editavel = podeEditar();
        filtrados.forEach(produto => {
            const indice = produtos.findIndex(item => String(item.id) === String(produto.id));
            container.appendChild(criarCard(produto, indice, produtos.length, !editavel));
        });
    };

    window.exportarCatalogo = function () {
        if (!window.db) return;
        const catalogo = window.db.obterCatalogoAtual();
        const conteudo = '// Gerado pela aba Catálogo do Gestor. Publique este arquivo em js/catalogo.js.\n' +
            'window.VETERA_CATALOGO = ' + JSON.stringify(catalogo, null, 2) + ';\n';
        const arquivo = new Blob([conteudo], { type: 'text/javascript;charset=utf-8' });
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'catalogo.js';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        alert('Arquivo catalogo.js baixado. Substitua js/catalogo.js no projeto e publique na Vercel para atualizar o cardápio de todos.');
    };

    window.adicionarCategoriaCatalogo = async function () {
        if (!podeEditar()) {
            alert('Não foi possível editar o catálogo local.');
            return;
        }
        const nome = window.prompt('Nome da nova categoria:');
        if (!nome || !nome.trim()) return;

        const categoriasDados = window.db.getCategoriasDados();
        if (categoriasDados.some(categoria => categoria.nome.toLocaleLowerCase('pt-BR') === nome.trim().toLocaleLowerCase('pt-BR'))) {
            alert('Essa categoria já existe.');
            return;
        }

        const categorias = categoriasDados.concat({
            nome: nome.trim(),
            ordem: categoriasDados.length,
            divisoria: false
        });
        try {
            await window.db.salvarCategorias(categorias);
            window.renderizarCatalogo();
        } catch (erro) {
            console.error('[CATÁLOGO] Falha ao criar categoria local:', erro);
        }
    };

    function renderizarEditorAdicionais() {
        const container = document.getElementById('produto-adicionais-editor');
        if (!container) return;
        container.replaceChildren();

        adicionaisRascunho.forEach((adicional, index) => {
            const linha = document.createElement('div');
            linha.className = 'catalogo-adicional-row';
            linha.innerHTML = `
                <label>
                    <span>Nome do complemento</span>
                    <input class="form-input" type="text" maxlength="80" value="${escaparHtml(adicional.nome)}" placeholder="Ex.: Cream cheese extra">
                </label>
                <label>
                    <span>Preço adicional (R$)</span>
                    <input class="form-input" type="number" min="0" step="0.01" value="${Number(adicional.preco || 0)}">
                </label>
                <button class="btn btn-secondary btn-small" type="button" aria-label="Remover complemento">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            const campos = linha.querySelectorAll('input');
            campos[0].addEventListener('input', () => { adicionaisRascunho[index].nome = campos[0].value; });
            campos[1].addEventListener('input', () => {
                adicionaisRascunho[index].preco = Math.max(0, Number(campos[1].value) || 0);
            });
            linha.querySelector('button').addEventListener('click', () => {
                adicionaisRascunho.splice(index, 1);
                renderizarEditorAdicionais();
            });
            container.appendChild(linha);
        });
    }

    window.prepararAdicionaisProduto = function (adicionais, maximo) {
        adicionaisRascunho = Array.isArray(adicionais)
            ? adicionais.map(item => ({ nome: String(item.nome || ''), preco: Math.max(0, Number(item.preco) || 0) }))
            : [];
        const limite = document.getElementById('produto-adicionais-maximo');
        if (limite) limite.value = String(Math.max(0, Number(maximo) || 0));
        renderizarEditorAdicionais();
    };

    window.adicionarAdicionalProduto = function () {
        adicionaisRascunho.push({ nome: '', preco: 0 });
        renderizarEditorAdicionais();
    };

    window.limparAdicionaisProduto = function () {
        adicionaisRascunho = [];
        const limite = document.getElementById('produto-adicionais-maximo');
        if (limite) limite.value = '0';
        renderizarEditorAdicionais();
    };

    window.coletarAdicionaisProduto = function () {
        const adicionais = adicionaisRascunho
            .map(item => ({ nome: item.nome.trim(), preco: Math.max(0, Number(item.preco) || 0) }))
            .filter(item => item.nome);
        const limite = Math.max(0, parseInt(document.getElementById('produto-adicionais-maximo')?.value, 10) || 0);
        return { adicionais, adicionaisMaximo: adicionais.length ? limite : 0 };
    };

    window.addEventListener('vetera:catalogo-atualizado', () => window.renderizarCatalogo());
    document.addEventListener('DOMContentLoaded', () => {
        ['catalogo-busca', 'catalogo-filtro-categoria', 'catalogo-filtro-status'].forEach(id => {
            const campo = document.getElementById(id);
            if (campo) campo.addEventListener(id === 'catalogo-busca' ? 'input' : 'change', window.renderizarCatalogo);
        });
        window.renderizarCatalogo();
    });
})();
