# Script PowerShell para enviar para GitHub
# Execute este script se tiver Git instalado

Write-Host "🚀 Preparando para enviar para GitHub..." -ForegroundColor Green
Write-Host ""

# Verificar se Git está instalado
try {
    $gitVersion = git --version
    Write-Host "✅ Git encontrado: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git não está instalado!" -ForegroundColor Red
    Write-Host "📥 Baixe em: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "💡 Ou use GitHub Desktop: https://desktop.github.com/" -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "📋 Verificando status do repositório..." -ForegroundColor Cyan

# Verificar se já é um repositório Git
if (Test-Path .git) {
    Write-Host "✅ Repositório Git já inicializado" -ForegroundColor Green
} else {
    Write-Host "📦 Inicializando repositório Git..." -ForegroundColor Yellow
    git init
    Write-Host "✅ Repositório inicializado" -ForegroundColor Green
}

Write-Host ""
Write-Host "➕ Adicionando arquivos..." -ForegroundColor Cyan
git add .

Write-Host ""
Write-Host "💾 Fazendo commit..." -ForegroundColor Cyan
git commit -m "Migração para Vercel - Sistema completo"

Write-Host ""
Write-Host "✅ Commit realizado com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "📤 Próximos passos:" -ForegroundColor Yellow
Write-Host "1. Crie um repositório no GitHub: https://github.com/new" -ForegroundColor White
Write-Host "2. Execute os comandos abaixo (substitua SEU-USUARIO):" -ForegroundColor White
Write-Host ""
Write-Host "   git remote add origin https://github.com/SEU-USUARIO/vetera-v2.git" -ForegroundColor Cyan
Write-Host "   git branch -M main" -ForegroundColor Cyan
Write-Host "   git push -u origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Ou use GitHub Desktop para uma interface visual!" -ForegroundColor Yellow


