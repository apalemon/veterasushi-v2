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

    const brindeCode = 'VETERA5FY003';
    const brindeUrl = 'https://veterasushi.bar/brinde.html?codigo=' + encodeURIComponent(brindeCode);
    const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(brindeUrl);

    const html = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Comanda #${escapeHtml(pedidoId)}</title>
  <style>
    @media print {
      body { margin: 0; }
    }
    body {
      font-family: Arial, sans-serif;
      padding: 10px;
      color: #111;
    }
    .wrap {
      max-width: 320px;
      margin: 0 auto;
    }
    .title { text-align: center; font-weight: 800; font-size: 16px; }
    .sub { text-align: center; font-size: 11px; color: #444; margin-top: 2px; }
    .hr { border-top: 1px dashed #444; margin: 8px 0; }
    .row { font-size: 11px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .total { font-size: 16px; font-weight: 800; text-align: right; }
    .qr { display:flex; justify-content:center; margin-top: 10px; }
    .qr img { width: 160px; height: 160px; }
    .coupon { text-align:center; font-size: 12px; font-weight: 800; margin-top: 6px; }
    .coupon small { display:block; font-weight: 400; color:#444; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="title">COMANDA #${escapeHtml(pedidoId)}</div>
    <div class="sub">${escapeHtml(data)}</div>

    <div class="hr"></div>

    ${clienteNome ? `<div class="row"><strong>Cliente:</strong> ${clienteNome}</div>` : ''}
    ${clienteTel ? `<div class="row"><strong>Telefone:</strong> ${clienteTel}</div>` : ''}
    ${endereco ? `<div class="row"><strong>Endereço:</strong> ${endereco}</div>` : ''}

    <div class="hr"></div>

    <table>
      <tbody>
        ${linhasItens}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="total">TOTAL: ${escapeHtml(total)}</div>

    <div class="hr"></div>

    <div class="qr"><img src="${qrImg}" alt="QR Code" /></div>
    <div class="coupon">${escapeHtml(brindeCode)}<small>Escaneie para ver o cupom</small></div>
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
