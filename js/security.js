// ============================================
// FUNÇÕES DE SEGURANÇA
// ============================================

// Sanitizar strings para prevenir XSS
function sanitizeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Escapar HTML para uso em atributos
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
}

// Validar entrada de texto (remover caracteres perigosos)
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    // Remover tags HTML e scripts
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

// Validar número
function sanitizeNumber(value, defaultValue = 0) {
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
}

// Validar ID (apenas números)
function sanitizeId(value) {
    const id = parseInt(value);
    return isNaN(id) || id <= 0 ? null : id;
}

// Exportar funções
if (typeof window !== 'undefined') {
    window.sanitizeHTML = sanitizeHTML;
    window.escapeHTML = escapeHTML;
    window.sanitizeInput = sanitizeInput;
    window.sanitizeNumber = sanitizeNumber;
    window.sanitizeId = sanitizeId;
}
