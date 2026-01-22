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

function parseSubitensFromNome(nomeCompleto, nomeOriginal) {
  try {
    const full = safeStr(nomeCompleto);
    const base = safeStr(nomeOriginal);

    // padrão usado no carrinho: "NomeOriginal - a, b + c, d"
    const start = base && full.toLowerCase().startsWith(base.toLowerCase())
      ? full.slice(base.length)
      : full;

    const cleaned = safeStr(start).trim();
    if (!cleaned) return [];

    // remove prefixos esperados
    const s = cleaned.replace(/^[-–—]\s*/g, '').trim();
    if (!s) return [];

    // separa partes e adicionais
    const chunks = s.split(' + ');
    const partStr = chunks[0] || '';
    const addStr = chunks.length > 1 ? chunks.slice(1).join(' + ') : '';

    const out = [];
    partStr.split(',').forEach(p => {
      const t = safeStr(p).trim();
      if (t) out.push(t);
    });
    addStr.split(',').forEach(a => {
      const t = safeStr(a).trim();
      if (t) out.push(t);
    });
    return out;
  } catch (e) {
    return [];
  }
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

function normalizeSelecoes(it) {
  try {
    const sel = it && it.selecoes ? it.selecoes : null;
    if (!sel || typeof sel !== 'object') return null;
    const partes = Array.isArray(sel.partes) ? sel.partes : [];
    const adicionais = Array.isArray(sel.adicionais) ? sel.adicionais : [];
    const kitHashi = !!sel.kitHashi;
    return { partes, adicionais, kitHashi };
  } catch (e) {
    return null;
  }
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

    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const observacoes = safeStr(pedido.observacoes || '').trim();
    const kitHashiPedido = !!(pedido.kitHashi || (itens[0] && itens[0].kitHashi));

    function renderItens(tipoVia) {
      // tipoVia: 'cozinha' | 'cliente'
      return itens
        .map((it) => {
          const qtd = Number(it && it.quantidade != null ? it.quantidade : 0) || 0;
          const preco = Number(it && it.preco != null ? it.preco : 0) || 0;
          const subtotal = qtd * preco;

          const sel = normalizeSelecoes(it);
          const nomeBase = escapeHtml(it && it.nomeOriginal ? it.nomeOriginal : (it && it.nome ? it.nome : ''));
          const isCombo = String(it && it.tipo ? it.tipo : '').toLowerCase() === 'combo' || !!sel;

          const kitItem = sel && typeof sel.kitHashi === 'boolean'
            ? !!sel.kitHashi
            : !!(it && it.kitHashi);
          const kitFinal = (sel && ('kitHashi' in sel)) || (it && ('kitHashi' in it)) ? kitItem : kitHashiPedido;

          let linhas = '';
          if (isCombo && sel) {
            const partes = sel.partes
              .map(p => safeStr(p && (p.opcao || p.nome || p.parte))).filter(Boolean);
            const adicionais = sel.adicionais
              .map(a => safeStr(a && (a.nome || a.opcao))).filter(Boolean);
            const sub = [...partes, ...adicionais]
              .map(s => `<div class="subitem">- ${escapeHtml(s)}</div>`)
              .join('');
            linhas = sub ? `<div class="sublist">${sub}</div>` : '';
          } else if (isCombo) {
            // fallback: pedidos antigos podem não ter selecoes, mas o nome vem com resumo
            const subs = parseSubitensFromNome(it && it.nome ? it.nome : '', it && it.nomeOriginal ? it.nomeOriginal : '');
            const sub = subs.map(s => `<div class="subitem">- ${escapeHtml(s)}</div>`).join('');
            linhas = sub ? `<div class="sublist">${sub}</div>` : '';
          }

          if (tipoVia === 'cozinha') {
            return `
              <div class="item">
                <div class="itemrow"><span>${qtd}x ${nomeBase}</span></div>
                <div class="subitem">- Kit: ${kitFinal ? 'SIM' : 'NÃO'}</div>
                ${linhas}
              </div>
            `;
          }

          return `
            <div class="item">
              <div class="itemrow"><span>${qtd}x ${nomeBase}</span><span class="price">${money(subtotal)}</span></div>
              ${linhas}
            </div>
          `;
        })
        .join('');
    }

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
      .pagebreak { page-break-after: always; break-after: page; }
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
    .total { font-size: 16px; font-weight: 800; text-align: right; }
    .qr { display:flex; justify-content:center; margin-top: 10px; }
    .qr img { width: 160px; height: 160px; }
    .coupon { text-align:center; font-size: 12px; font-weight: 800; margin-top: 6px; }
    .coupon small { display:block; font-weight: 400; color:#444; margin-top: 2px; }
    .via { margin-bottom: 0; }
    .viahead { text-align:center; font-weight:900; font-size: 13px; margin-top: 2px; }
    .item { margin: 6px 0; }
    .itemrow { display:flex; justify-content:space-between; gap:10px; font-size: 12px; }
    .price { white-space:nowrap; }
    .sublist { margin-top: 4px; }
    .subitem { font-size: 11px; color: #333; margin: 2px 0 0 10px; }
    .obs { font-size: 11px; color:#111; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="wrap via">
    <div class="title">COMANDA #${escapeHtml(pedidoId)}</div>
    <div class="viahead">VIA COZINHA</div>
    <div class="sub">${escapeHtml(data)}</div>

    <div class="hr"></div>

    <div class="row"><strong>Kit (geral):</strong> ${kitHashiPedido ? 'SIM (hashi + 2 shoyos + wasabi)' : 'NÃO'}</div>
    ${observacoes ? `<div class="row"><strong>Obs:</strong></div><div class="obs">${escapeHtml(observacoes)}</div>` : ''}

    <div class="hr"></div>

    ${renderItens('cozinha')}
  </div>

  <div class="pagebreak"></div>

  <div class="wrap via">
    <div class="title">COMANDA #${escapeHtml(pedidoId)}</div>
    <div class="viahead">VIA CLIENTE</div>
    <div class="sub">${escapeHtml(data)}</div>

    <div class="hr"></div>

    ${clienteNome ? `<div class="row"><strong>Cliente:</strong> ${clienteNome}</div>` : ''}
    ${clienteTel ? `<div class="row"><strong>Telefone:</strong> ${clienteTel}</div>` : ''}
    ${endereco ? `<div class="row"><strong>Endereço:</strong> ${endereco}</div>` : ''}

    <div class="hr"></div>

    ${renderItens('cliente')}

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
