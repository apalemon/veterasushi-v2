// ============================================
// DASHBOARD / PÁGINA INICIAL
// ============================================

window.carregarDashboard = function() {
    try {
        // Carregar estatísticas do dia - usando fuso horário de São Paulo
        const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const pedidos = db.getPedidos() || [];
        const pedidosHoje = pedidos.filter(p => {
            if (!p.data && !p.timestamp) return false;
            const dataRef = p.data || (p.timestamp ? new Date(p.timestamp).toISOString() : null);
            if (!dataRef) return false;
            const dataPedido = new Date(dataRef).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            return dataPedido === hoje;
        });
        
        const totalPedidosHoje = pedidosHoje.length;
        const faturamentoHoje = pedidosHoje.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
        const pedidosPendentes = pedidos.filter(p => 
            p.status === 'aguardando_pagamento' || p.status === 'em_preparo'
        ).length;
        
        // Atualizar estatísticas
        const elPedidos = document.getElementById('stats-pedidos-hoje');
        const elFaturamento = document.getElementById('stats-faturamento-hoje');
        const elPendentes = document.getElementById('stats-pedidos-pendentes');
        if (elPedidos) elPedidos.textContent = totalPedidosHoje;
        if (elFaturamento) elFaturamento.textContent = 'R$ ' + faturamentoHoje.toFixed(2).replace('.', ',');
        if (elPendentes) elPendentes.textContent = pedidosPendentes;
        
        // Combo mais pedido
        const itensPorProduto = {};
        pedidos.forEach(p => {
            (p.itens || []).forEach(item => {
                const id = item.produtoId || item.id;
                if (!itensPorProduto[id]) {
                    itensPorProduto[id] = { quantidade: 0, nome: item.nome || 'Produto', id };
                }
                itensPorProduto[id].quantidade += Number(item.quantidade) || 0;
            });
        });
        
        const produtosOrdenados = Object.values(itensPorProduto).sort((a, b) => b.quantidade - a.quantidade);
        const comboMaisPedido = produtosOrdenados[0];
        
        const elCombo = document.getElementById('combo-mais-pedido');
        if (elCombo) {
            if (comboMaisPedido) {
                elCombo.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="flex: 1;">
                            <div style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 5px;">
                                ${comboMaisPedido.nome}
                            </div>
                            <div style="font-size: 14px; color: var(--texto-medio);">
                                ${comboMaisPedido.quantidade} pedidos realizados
                            </div>
                        </div>
                        <div style="font-size: 32px; font-weight: 700; color: var(--vermelho-claro);">
                            ${comboMaisPedido.quantidade}
                        </div>
                    </div>
                `;
            } else {
                elCombo.innerHTML = '<div style="text-align: center; color: var(--texto-medio);">Nenhum pedido ainda</div>';
            }
        }
        
        // Gráfico de pedidos (últimos 7 dias)
        const ultimos7Dias = [];
        for (let i = 6; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            const dataStr = data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const pedidosDia = pedidos.filter(p => {
                if (!p.data && !p.timestamp) return false;
                const dataRef = p.data || (p.timestamp ? new Date(p.timestamp).toISOString() : null);
                if (!dataRef) return false;
                const dataPedido = new Date(dataRef).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                return dataPedido === dataStr;
            }).length;
            ultimos7Dias.push({
                dia: data.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }),
                quantidade: pedidosDia
            });
        }
        
        const canvas = document.getElementById('grafico-pedidos');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const width = canvas.offsetWidth;
            const height = 300;
            canvas.width = width;
            canvas.height = height;
            
            // Limpar canvas
            ctx.clearRect(0, 0, width, height);
            
            const maxQuantidade = Math.max(...ultimos7Dias.map(d => d.quantidade), 1);
            const padding = 40;
            const graphWidth = width - padding * 2;
            const graphHeight = height - padding * 2;
            const barWidth = graphWidth / ultimos7Dias.length - 10;
            
            // Eixos
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, height - padding);
            ctx.lineTo(width - padding, height - padding);
            ctx.stroke();
            
            // Barras
            ultimos7Dias.forEach((item, index) => {
                const barHeight = (item.quantidade / maxQuantidade) * graphHeight;
                const x = padding + index * (graphWidth / ultimos7Dias.length) + 5;
                const y = height - padding - barHeight;
                
                // Gradiente
                const gradient = ctx.createLinearGradient(x, y, x, height - padding);
                gradient.addColorStop(0, 'rgba(220, 38, 38, 0.8)');
                gradient.addColorStop(1, 'rgba(220, 38, 38, 0.3)');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, y, barWidth, barHeight);
                
                // Texto
                ctx.fillStyle = '#fff';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(item.dia.toUpperCase(), x + barWidth / 2, height - padding + 20);
                ctx.fillText(item.quantidade.toString(), x + barWidth / 2, y - 5);
            });
        }
    } catch (e) {
        console.error('[DASHBOARD] Erro:', e);
    }
};

// ============================================
// COMPLEMENTOS
// ============================================

window.carregarComplementos = function() {
    try {
        const complementos = db.getComplementos() || [];
        const container = document.getElementById('complementos-abas-container');
        if (!container) return;
        
        if (complementos.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--texto-medio); padding: 20px;">Nenhuma aba de complementos criada ainda. Clique em "Adicionar Aba" para começar.</div>';
            return;
        }
        
        container.innerHTML = complementos.map((aba, index) => {
            return `
                <div style="background: var(--bg-primary); border: 1px solid var(--borda); border-radius: 12px; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div>
                            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary);">
                                Aba ${index + 1}: ${aba.nome || 'Sem nome'}
                            </h3>
                        </div>
                        <button class="btn btn-secondary" onclick="removerAbaComplemento(${index})" style="padding: 8px 16px;">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nome da Aba</label>
                        <input type="text" class="form-input" value="${(aba.nome || '').replace(/"/g, '&quot;')}" 
                               onchange="atualizarNomeAbaComplemento(${index}, this.value)" 
                               placeholder="Ex: Pack Completo">
                    </div>
                    <div style="margin-top: 15px;">
                        <label class="form-label">Itens do Complemento</label>
                        <div id="complementos-itens-${index}" style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                            ${(aba.itens || []).map((item, itemIndex) => `
                                <div style="display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                                    <input type="text" class="form-input" value="${(item.nome || '').replace(/"/g, '&quot;')}" 
                                           placeholder="Nome do item" style="flex: 1;"
                                           onchange="atualizarItemComplemento(${index}, ${itemIndex}, 'nome', this.value)">
                                    <input type="number" step="0.01" class="form-input" value="${item.preco || 0}" 
                                           placeholder="Preço" style="width: 120px;"
                                           onchange="atualizarItemComplemento(${index}, ${itemIndex}, 'preco', this.value)">
                                    <button class="btn btn-secondary" onclick="removerItemComplemento(${index}, ${itemIndex})" style="padding: 8px 12px;">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-secondary" onclick="adicionarItemComplemento(${index})" style="margin-top: 10px;">
                            <i class="fas fa-plus"></i> Adicionar Item
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro:', e);
    }
};

window.adicionarAbaComplemento = function() {
    try {
        let complementos = db.getComplementos() || [];
        if (complementos.length >= 5) {
            alert('Você pode ter no máximo 5 abas de complementos.');
            return;
        }
        
        complementos.push({
            nome: 'Nova Aba',
            itens: []
        });
        
        db.salvarComplementos(complementos);
        window.carregarComplementos();
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro ao adicionar aba:', e);
    }
};

window.removerAbaComplemento = function(index) {
    if (!confirm('Deseja remover esta aba de complementos?')) return;
    
    try {
        let complementos = db.getComplementos() || [];
        complementos.splice(index, 1);
        db.salvarComplementos(complementos);
        window.carregarComplementos();
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro ao remover aba:', e);
    }
};

window.atualizarNomeAbaComplemento = function(index, nome) {
    try {
        let complementos = db.getComplementos() || [];
        if (complementos[index]) {
            complementos[index].nome = nome;
            db.salvarComplementos(complementos);
        }
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro ao atualizar nome:', e);
    }
};

window.adicionarItemComplemento = function(abaIndex) {
    try {
        let complementos = db.getComplementos() || [];
        if (complementos[abaIndex]) {
            if (!complementos[abaIndex].itens) {
                complementos[abaIndex].itens = [];
            }
            complementos[abaIndex].itens.push({
                nome: '',
                preco: 0
            });
            db.salvarComplementos(complementos);
            window.carregarComplementos();
        }
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro ao adicionar item:', e);
    }
};

window.removerItemComplemento = function(abaIndex, itemIndex) {
    try {
        let complementos = db.getComplementos() || [];
        if (complementos[abaIndex] && complementos[abaIndex].itens) {
            complementos[abaIndex].itens.splice(itemIndex, 1);
            db.salvarComplementos(complementos);
            window.carregarComplementos();
        }
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro ao remover item:', e);
    }
};

window.atualizarItemComplemento = function(abaIndex, itemIndex, campo, valor) {
    try {
        let complementos = db.getComplementos() || [];
        if (complementos[abaIndex] && complementos[abaIndex].itens && complementos[abaIndex].itens[itemIndex]) {
            if (campo === 'preco') {
                complementos[abaIndex].itens[itemIndex][campo] = Number(valor) || 0;
            } else {
                complementos[abaIndex].itens[itemIndex][campo] = valor;
            }
            db.salvarComplementos(complementos);
        }
    } catch (e) {
        console.error('[COMPLEMENTOS] Erro ao atualizar item:', e);
    }
};
