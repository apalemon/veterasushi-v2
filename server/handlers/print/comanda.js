const { getCollection } = require('../../mongodb');

function safeStr(v) {
  return String(v == null ? '' : v);
}

function escapeHtml(s) {
  return safeStr(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizePedidoIdQuery(pedidoId) {
  const idNum = Number(pedidoId);
  if (Number.isFinite(idNum)) {
    return { $or: [{ id: idNum }, { id: String(idNum) }] };
  }
  return { $or: [{ id: String(pedidoId) }, { id: Number(pedidoId) }] };
}

function money(v) {
  const n = Number(v);
  const val = Number.isFinite(n) ? n : 0;
  return 'R$ ' + val.toFixed(2).replace('.', ',');
}

function formatDatePtBr(v) {
  try {
    const d = v ? new Date(v) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR');
  } catch (e) {
    return '';
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const u = new URL(String(req.url || ''), 'http://localhost');
    const pedidoId = safeStr(u.searchParams.get('pedidoId') || u.searchParams.get('id')).trim();
    if (!pedidoId) return res.status(400).send('pedidoId é obrigatório');

    const pedidosCol = await getCollection('pedidos');
    const pedido = await pedidosCol.findOne(normalizePedidoIdQuery(pedidoId));
    if (!pedido) return res.status(404).send('Pedido não encontrado');

    // HTML imprimível
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const linhasItens = itens
      .map((it) => {
        const nome = escapeHtml(it && it.nome ? it.nome : '');
        const qtd = Number(it && it.quantidade != null ? it.quantidade : 0) || 0;
        const preco = Number(it && it.preco != null ? it.preco : 0) || 0;
        const subtotal = qtd * preco;
        return `
          <tr>
            <td style="padding:6px 0;">${qtd}x ${nome}</td>
            <td style="padding:6px 0; text-align:right; white-space:nowrap;">${money(subtotal)}</td>
          </tr>
        `;
      })
      .join('');

    const total = money(pedido.total);
    const data = formatDatePtBr(pedido.dataPagamento || pedido.dataCriacao || pedido.data);

    const clienteNome = escapeHtml(pedido.clienteNome || '');
    const clienteTel = escapeHtml(pedido.clienteTelefone || '');
    const endereco = escapeHtml(pedido.clienteEndereco || '');

    const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Comanda #${escapeHtml(pedidoId)}</title>
  <style>
    @media print {
      button { display: none !important; }
      body { margin: 0; }
    }
    body {
      font-family: Arial, sans-serif;
      padding: 16px;
      color: #111;
    }
    .wrap {
      max-width: 380px;
      margin: 0 auto;
    }
    .title {
      text-align: center;
      font-weight: 800;
      font-size: 18px;
      margin-bottom: 6px;
    }
    .sub {
      text-align: center;
      font-size: 12px;
      margin-bottom: 10px;
      color: #444;
    }
    .hr { border-top: 1px dashed #444; margin: 10px 0; }
    .row { font-size: 12px; margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .total { font-size: 16px; font-weight: 800; text-align: right; }
    .printbar { display:flex; gap:8px; justify-content:center; margin: 12px 0; }
    .btn { padding:10px 12px; border:1px solid #111; background:#111; color:#fff; border-radius:8px; cursor:pointer; }
    .btn2 { padding:10px 12px; border:1px solid #111; background:#fff; color:#111; border-radius:8px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="title">Vetera Sushi</div>
    <div class="sub">Comanda #${escapeHtml(pedidoId)} • ${escapeHtml(data)}</div>

    <div class="printbar">
      <button class="btn" onclick="window.print()">Imprimir</button>
      <button class="btn2" onclick="window.close()">Fechar</button>
    </div>

    <div class="hr"></div>

    <div class="row"><strong>Cliente:</strong> ${clienteNome}</div>
    <div class="row"><strong>Telefone:</strong> ${clienteTel}</div>
    <div class="row"><strong>Endereço:</strong> ${endereco}</div>

    <div class="hr"></div>

    <table>
      <tbody>
        ${linhasItens}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="total">TOTAL: ${escapeHtml(total)}</div>

    <div class="hr"></div>

    <div class="row" style="text-align:center; font-size: 11px; color:#444;">
      Cupom de desconto: <strong>VETERA5FY003</strong>
    </div>
  </div>

  <script>
    try {
      setTimeout(() => { window.print(); }, 250);
      setTimeout(() => { window.close(); }, 1500);
    } catch (e) {}
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).send('Erro ao gerar comanda');
  }
};
