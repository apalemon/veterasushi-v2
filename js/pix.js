// ============================================
// GERENCIAMENTO DE PAGAMENTO PIX
// ============================================

class PixPayment {
  constructor() {
    this.qrCodeApi = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=';
  }

  // Chave PIX fixa do Mercado Pago
  getChavePixFixa() {
    return '00020101021126810014BR.GOV.BCB.PIX2559pix-qr.mercadopago.com/instore/ol/v2/3Z93NJne4o7abVEbelKUtP5204000053039865802BR592558.429.088 ROBERTO DE CAR6009SAO PAULO62080504mpis6304C09C';
  }

  // Gerar QR Code PIX
  gerarQRCode(chavePix, valor, descricao = '') {
    // Usar a chave PIX fixa do Mercado Pago (já está no formato EMV completo)
    const chavePixFixa = this.getChavePixFixa();
    
    // Se a chave fornecida for a chave fixa ou se não for fornecida, usar a chave fixa
    // Caso contrário, usar a chave fornecida (para compatibilidade)
    const pixData = chavePixFixa || this.gerarDadosPIX(chavePix, valor, descricao);
    
    // Usar API pública para gerar QR Code visual
    const qrCodeUrl = `${this.qrCodeApi}${encodeURIComponent(pixData)}`;
    
    return {
      qrCodeUrl: qrCodeUrl,
      pixData: pixData,
      chavePix: chavePixFixa || chavePix,
      valor: valor
    };
  }

  // Gerar dados PIX (formato simplificado) - mantido para compatibilidade
  gerarDadosPIX(chavePix, valor, descricao) {
    // Formato básico - em produção usar biblioteca PIX adequada
    const valorFormatado = valor.toFixed(2).replace('.', '');
    return `00020126${chavePix.length.toString().padStart(2, '0')}${chavePix}52040000530398654${valorFormatado.length.toString().padStart(2, '0')}${valorFormatado}5802BR59${descricao.length.toString().padStart(2, '0')}${descricao}6009SAO PAULO62070503***6304`;
  }

  // Renderizar QR Code no modal
  renderizarQRCode(containerId, chavePix, valor, descricao) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const qrData = this.gerarQRCode(chavePix, valor, descricao);

    // Sanitizar dados para prevenir XSS
    const chavePixSegura = typeof escapeHTML !== 'undefined' ? escapeHTML(chavePix) : String(chavePix || '').replace(/[<>'"]/g, '');
    const descricaoSegura = typeof sanitizeHTML !== 'undefined' ? sanitizeHTML(descricao) : String(descricao || '').replace(/[<>]/g, '');
    const chaveParaClipboard = chavePixSegura.replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    container.innerHTML = `
      <div class="pix-container" style="text-align: center; padding: 2rem;">
        <h3 style="color: var(--vermelho-claro); margin-bottom: 1.5rem;">Pagamento via PIX</h3>
        
        <div style="background: white; padding: 1.5rem; border-radius: 10px; display: inline-block; margin-bottom: 1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
          <img src="${qrData.qrCodeUrl}" alt="QR Code PIX" style="max-width: 300px; width: 100%;">
        </div>

        <div style="background: var(--cinza-medio); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
          <p style="color: var(--texto-medio); margin-bottom: 0.5rem;">Valor:</p>
          <p style="font-size: 1.5rem; font-weight: bold; color: var(--vermelho-claro);">
            R$ ${valor.toFixed(2)}
          </p>
        </div>

        <div style="background: var(--cinza-medio); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
          <p style="color: var(--texto-medio); margin-bottom: 0.5rem; font-size: 0.9rem;">Chave PIX:</p>
          <p style="color: var(--texto-claro); word-break: break-all; font-size: 0.9rem;">
            ${chavePixSegura}
          </p>
          <button 
            onclick="copyTextSafe('${chaveParaClipboard}').then(() => { const msg = document.createElement('div'); msg.textContent='Chave PIX copiada!'; msg.style.cssText='position:fixed;top:20px;right:20px;background:var(--sucesso);color:white;padding:1rem;border-radius:8px;z-index:10000;'; document.body.appendChild(msg); setTimeout(()=>msg.remove(),2000); }).catch(() => { const msg = document.createElement('div'); msg.textContent='Falha ao copiar'; msg.style.cssText='position:fixed;top:20px;right:20px;background:var(--aviso);color:black;padding:1rem;border-radius:8px;z-index:10000;'; document.body.appendChild(msg); setTimeout(()=>msg.remove(),2000); })"
            style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: var(--vermelho-claro); color: white; border: none; border-radius: 5px; cursor: pointer; transition: background 0.2s;">
            Copiar Chave
          </button>"
        </div>

        <div style="background: var(--aviso); padding: 1rem; border-radius: 8px; margin-top: 1.5rem;">
          <p style="color: var(--preto); font-weight: bold; margin: 0;">
            ⚠️ Aguarde a confirmação do pagamento no PDV
          </p>
        </div>
      </div>
    `;
  }

  // Validar chave PIX
  validarChavePix(chave) {
    // Validação básica
    if (!chave || chave.trim() === '') {
      return { valido: false, mensagem: 'Chave PIX não pode estar vazia' };
    }

    // Verificar se é email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(chave)) {
      return { valido: true, tipo: 'email' };
    }

    // Verificar se é CPF/CNPJ (apenas números)
    const cpfCnpjRegex = /^\d{11,14}$/;
    if (cpfCnpjRegex.test(chave.replace(/\D/g, ''))) {
      return { valido: true, tipo: 'cpf_cnpj' };
    }

    // Verificar se é telefone
    const telefoneRegex = /^\+55\d{10,11}$/;
    if (telefoneRegex.test(chave.replace(/\D/g, ''))) {
      return { valido: true, tipo: 'telefone' };
    }

    // Verificar se é chave aleatória (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(chave)) {
      return { valido: true, tipo: 'aleatoria' };
    }

    return { valido: false, mensagem: 'Formato de chave PIX inválido' };
  }
}

// Função de cópia segura (fallback para navegadores sem navigator.clipboard)
function copyTextSafe(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('execCommand failed'));
    } catch (err) {
      document.body.removeChild(ta);
      reject(err);
    }
  });
}

// Instância global do sistema PIX
const pixPayment = new PixPayment();
