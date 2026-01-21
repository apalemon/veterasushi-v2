# Vetera Print App (Epson TM-T88V)

App Python local para **imprimir automaticamente** cupom **não fiscal** quando um pedido PIX for aprovado no sistema.

## Como funciona

- O sistema (backend) expõe uma fila de impressão:
  - `GET /api/print/queue` retorna pedidos `statusPagamento='pago'` e `printStatus` pendente.
  - `POST /api/print/ack` marca um pedido como `printed` (ou `error`).
- Este app roda no seu PC e:
  - consulta a fila periodicamente
  - imprime o cupom na **Epson TM-T88V** (Windows)
  - confirma (ack) no servidor

## Requisitos

- Windows
- Impressora instalada no Windows (nome exatamente igual ao do Painel de Controle)
- Python 3.10+

## Configuração

Crie um arquivo `.env` dentro da pasta `app/` com:

- `SERVER_BASE_URL` = URL do seu sistema (ex.: `https://seusite.com`)
- `PRINT_APP_TOKEN` = o mesmo token configurado no servidor (Vercel) em `PRINT_APP_TOKEN`
- `PRINTER_NAME` = nome da impressora no Windows (ex.: `EPSON TM-T88V Receipt`)
- `STORE_NAME` = nome do restaurante (topo do cupom)
- `DISCOUNT_URL_BASE` = URL base do cardápio para QR (ex.: `https://seusite.com`)

Exemplo:

```env
SERVER_BASE_URL=https://seusite.com
PRINT_APP_TOKEN=coloque-um-token-grande-aqui
PRINTER_NAME=EPSON TM-T88V Receipt
STORE_NAME=Vetera Sushi
DISCOUNT_URL_BASE=https://seusite.com
```

## Instalação

Dentro da pasta `app/`:

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

## Rodar

```bash
python app.py
```

Por padrão o app:

- roda um servidor local (para status): `http://127.0.0.1:5055`
- faz polling a cada 3s

## Observações

- Este é um **cupom não fiscal**.
- O QR Code do desconto usa o campo `cupom` do pedido (quando existir) no formato:
  - `DISCOUNT_URL_BASE + "?cupom=" + cupom`

