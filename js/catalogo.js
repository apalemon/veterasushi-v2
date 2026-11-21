// Catálogo publicado do cardápio.
window.VETERA_CATALOGO = {
  "produtos": [
    {
      "id": 3001,
      "nome": "Big Hot Hot Recheado",
      "descricao": "Hot Roll Filadélfia recheado com salmão e cream cheese, finalizado com molho tarê.",
      "preco": 50.90,
      "categoria": "Hot's",
      "ativo": true,
      "ordem": 1,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 3002,
      "nome": "Hot Roll Filadélfia (10 pcs)",
      "descricao": "10 unidades com salmão e cream cheese.",
      "preco": 27.90,
      "categoria": "Hot's",
      "ativo": true,
      "ordem": 2,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 3003,
      "nome": "Hot Roll Filadélfia (20 pcs)",
      "descricao": "20 unidades com salmão e cream cheese.",
      "preco": 54.90,
      "categoria": "Hot's",
      "ativo": true,
      "ordem": 3,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 3004,
      "nome": "Temaki Hot Salmão Cozido",
      "descricao": "Temaki crocante, empanado e frito, com arroz temperado e alga.",
      "preco": 43.90,
      "categoria": "Hot's",
      "ativo": true,
      "ordem": 4,
      "imagem": "temakihot.avif",
      "tipo": "produto"
    },
    {
      "id": 7001,
      "nome": "Sunomono Salada Japonesa de Pepino",
      "descricao": "Pepino fatiado com molho agridoce oriental.",
      "preco": 22.90,
      "categoria": "Entradas",
      "ativo": true,
      "ordem": 1,
      "imagem": "sunomono.jpg",
      "tipo": "produto"
    },
    {
      "id": 7002,
      "nome": "Bolinho de Salmão 4 Unidades",
      "descricao": "Quatro bolinhos de salmão temperados e fritos; molho não acompanha.",
      "preco": 25.90,
      "categoria": "Entradas",
      "ativo": true,
      "ordem": 2,
      "imagem": "bolinhodesalmao.avif",
      "tipo": "produto"
    },
    {
      "id": 9001,
      "nome": "Pedido teste (não compre)",
      "descricao": "Item para testar o fluxo de pedido.",
      "preco": 1.00,
      "categoria": "Entradas",
      "ativo": true,
      "ordem": 3,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 8001,
      "nome": "Onigiri Filadélfia Salmão com Cream Cheese",
      "descricao": "Bolinho triangular de arroz com salmão, cream cheese, cebolinha, alga nori e gergelim.",
      "preco": 38.90,
      "categoria": "Onigiris",
      "ativo": true,
      "ordem": 1,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 8002,
      "nome": "Onigiri Salmão Grelhado",
      "descricao": "Bolinho triangular de arroz com salmão grelhado e desfiado, envolto em alga nori.",
      "preco": 32.90,
      "categoria": "Onigiris",
      "ativo": true,
      "ordem": 2,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 1001,
      "nome": "Combo Personalizado 27 Peças à Sua Escolha",
      "descricao": "Monte o combo escolhendo suas peças.",
      "preco": 84.90,
      "categoria": "Monte seu Combo",
      "ativo": true,
      "ordem": 1,
      "imagem": "combo_27.avif",
      "tipo": "combo",
      "partes": [
        {
          "nome": "Utensílios",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Não, obrigado", "preco": 0 },
            { "nome": "Hashi, 2 shoyos e guardanapo", "preco": 2.00 }
          ]
        },
        {
          "nome": "Parte 1",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de salmão", "preco": 0 },
            { "nome": "Hossomaki de salmão grelhado", "preco": 0 },
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 2",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki de salmão grelhado", "preco": 0 },
            { "nome": "Uramaki de salmão com cream cheese", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Uramaki Califórnia", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 3",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow de salmão", "preco": 9.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 4",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 5",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Niguiri skin lemon", "preco": 0 },
            { "nome": "Baterá de salmão", "preco": 0 },
            { "nome": "Niguiri de salmão cru", "preco": 5.90 },
            { "nome": "Niguiri de salmão trufado com flor de sal", "preco": 7.00 }
          ]
        }
      ],
      "adicionais": [
        { "nome": "Wasabi", "preco": 3.00 },
        { "nome": "Molho tarê", "preco": 3.00 },
        { "nome": "Cream cheese extra", "preco": 2.00 }
      ],
      "adicionaisMaximo": 3
    },
    {
      "id": 1002,
      "nome": "Combo Personalizado 32 Peças à Sua Escolha",
      "descricao": "Monte o combo escolhendo suas peças. Possui as mesmas opções do combo de 27 peças.",
      "preco": 92.90,
      "categoria": "Monte seu Combo",
      "ativo": true,
      "ordem": 2,
      "imagem": "combo_32.avif",
      "tipo": "combo",
      "partes": [
        {
          "nome": "Utensílios",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Não, obrigado", "preco": 0 },
            { "nome": "Hashi, 2 shoyos e guardanapo", "preco": 2.00 }
          ]
        },
        {
          "nome": "Parte 1",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de salmão", "preco": 0 },
            { "nome": "Hossomaki de salmão grelhado", "preco": 0 },
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 2",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki de salmão grelhado", "preco": 0 },
            { "nome": "Uramaki de salmão com cream cheese", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Uramaki Califórnia", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 3",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow de salmão", "preco": 9.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 4",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 5",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Niguiri skin lemon", "preco": 0 },
            { "nome": "Baterá de salmão", "preco": 0 },
            { "nome": "Niguiri de salmão cru", "preco": 5.90 },
            { "nome": "Niguiri de salmão trufado com flor de sal", "preco": 7.00 }
          ]
        }
      ],
      "adicionais": [
        { "nome": "Wasabi", "preco": 3.00 },
        { "nome": "Molho tarê", "preco": 3.00 },
        { "nome": "Cream cheese extra", "preco": 2.00 }
      ],
      "adicionaisMaximo": 3
    },
    {
      "id": 1003,
      "nome": "Combo Personalizado 37 Peças à Sua Escolha",
      "descricao": "Monte o combo escolhendo suas peças. Possui as mesmas opções do combo de 27 peças.",
      "preco": 103.90,
      "categoria": "Monte seu Combo",
      "ativo": true,
      "ordem": 3,
      "imagem": "combo_37.avif",
      "tipo": "combo",
      "partes": [
        {
          "nome": "Utensílios",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Não, obrigado", "preco": 0 },
            { "nome": "Hashi, 2 shoyos e guardanapo", "preco": 2.00 }
          ]
        },
        {
          "nome": "Parte 1",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de salmão", "preco": 0 },
            { "nome": "Hossomaki de salmão grelhado", "preco": 0 },
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 2",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki de salmão grelhado", "preco": 0 },
            { "nome": "Uramaki de salmão com cream cheese", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Uramaki Califórnia", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 3",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow de salmão", "preco": 9.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 4",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 5",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Niguiri skin lemon", "preco": 0 },
            { "nome": "Baterá de salmão", "preco": 0 },
            { "nome": "Niguiri de salmão cru", "preco": 5.90 },
            { "nome": "Niguiri de salmão trufado com flor de sal", "preco": 7.00 }
          ]
        }
      ],
      "adicionais": [
        { "nome": "Wasabi", "preco": 3.00 },
        { "nome": "Molho tarê", "preco": 3.00 },
        { "nome": "Cream cheese extra", "preco": 2.00 }
      ],
      "adicionaisMaximo": 3
    },
    {
      "id": 1004,
      "nome": "Combo Personalizado 42 Peças à Sua Escolha",
      "descricao": "Monte o combo escolhendo suas peças. Possui as mesmas opções, com partes 3 a 5 entre R$ 0,00 e R$ 16,00.",
      "preco": 137.90,
      "categoria": "Monte seu Combo",
      "ativo": true,
      "ordem": 4,
      "imagem": "combo_42.jpg",
      "tipo": "combo",
      "partes": [
        {
          "nome": "Utensílios",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Não, obrigado", "preco": 0 },
            { "nome": "Hashi, 2 shoyos e guardanapo", "preco": 2.00 }
          ]
        },
        {
          "nome": "Parte 1",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de salmão", "preco": 0 },
            { "nome": "Hossomaki de salmão grelhado", "preco": 0 },
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 2",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki de salmão grelhado", "preco": 0 },
            { "nome": "Uramaki de salmão com cream cheese", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Uramaki Califórnia", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 }
          ]
        },
        {
          "nome": "Parte 3",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Hot roll", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 5.90 },
            { "nome": "Jow de salmão", "preco": 9.90 },
            { "nome": "Jow jelly", "preco": 9.90 }
          ]
        },
        {
          "nome": "Parte 4",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Hossomaki de pepino", "preco": 0 },
            { "nome": "Uramaki shimeji", "preco": 0 },
            { "nome": "Uramaki skin", "preco": 0 },
            { "nome": "Sashimi de salmão", "preco": 12.90 },
            { "nome": "Jow jelly", "preco": 16.00 }
          ]
        },
        {
          "nome": "Parte 5",
          "descricao": "Escolha 1 opção",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Niguiri skin lemon", "preco": 0 },
            { "nome": "Baterá de salmão", "preco": 0 },
            { "nome": "Niguiri de salmão cru", "preco": 5.90 },
            { "nome": "Niguiri de salmão trufado com flor de sal", "preco": 7.00 }
          ]
        }
      ],
      "adicionais": [
        { "nome": "Wasabi", "preco": 3.00 },
        { "nome": "Molho tarê", "preco": 3.00 },
        { "nome": "Cream cheese extra", "preco": 2.00 }
      ],
      "adicionaisMaximo": 3
    },
    {
      "id": 2001,
      "nome": "Poke Tradicional Salmão",
      "descricao": "Arroz, salmão cru, sunomono, manga, tomate-cereja, cream cheese e crispy de alho-poró.",
      "preco": 50.90,
      "categoria": "Pokes",
      "ativo": true,
      "ordem": 1,
      "imagem": "pokesalmaotradicional.avif",
      "tipo": "produto",
      "partes": [
        {
          "nome": "Utensílios",
          "obrigatorio": true,
          "escolhaMinima": 1,
          "escolhaMaxima": 1,
          "opcoes": [
            { "nome": "Não, obrigado", "preco": 0 },
            { "nome": "Hashi, shoyo e guardanapo", "preco": 2.00 }
          ]
        }
      ],
      "adicionais": [
        { "nome": "Abacate", "preco": 0 },
        { "nome": "Manga", "preco": 0 },
        { "nome": "Cebolinha", "preco": 0 },
        { "nome": "Gergelim", "preco": 0 },
        { "nome": "Flor de sal", "preco": 0 },
        { "nome": "Azeite trufado", "preco": 0 },
        { "nome": "Gengibre", "preco": 0 },
        { "nome": "Wasabi", "preco": 0 },
        { "nome": "Cebola roxa", "preco": 0, "disponivel": false },
        { "nome": "Pimenta biquinho", "preco": 0, "disponivel": false }
      ]
    },
    {
      "id": 2002,
      "nome": "Poke Primavera Camarão Frito",
      "descricao": "Camarões fritos e crocantes com acompanhamentos frescos.",
      "preco": 61.90,
      "categoria": "Pokes",
      "ativo": true,
      "ordem": 2,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 4001,
      "nome": "Temaki Califórnia",
      "descricao": "Kani, pepino e manga com arroz temperado e alga.",
      "preco": 32.90,
      "categoria": "Temakis",
      "ativo": true,
      "ordem": 1,
      "imagem": "temakicalifornia.avif",
      "tipo": "produto"
    },
    {
      "id": 4002,
      "nome": "Temaki Filadélfia",
      "descricao": "Salmão fresco, arroz, cream cheese, cebolinha e gergelim tostado.",
      "preco": 42.90,
      "categoria": "Temakis",
      "ativo": true,
      "ordem": 2,
      "imagem": "temakisalmaocreamchese.avif",
      "tipo": "produto"
    },
    {
      "id": 5001,
      "nome": "Hakone (32 pcs)",
      "descricao": "10 Hot Filadélfia, 4 Jow de salmão, 4 Nigiri de salmão, 10 Uramaki Filadélfia e 5 lâminas de sashimi.",
      "preco": 103.00,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 1,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5002,
      "nome": "Matsue (14 pcs)",
      "descricao": "2 Nigiri de salmão, 2 Nigiri skin, 5 Uramaki Filadélfia e 5 Hossomaki de salmão.",
      "preco": 35.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 2,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5003,
      "nome": "Miyazaki (23 pcs)",
      "descricao": "8 Baterá de salmão, 5 lâminas de sashimi, 5 Uramaki Filadélfia e 5 Jow de salmão.",
      "preco": 59.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 3,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5004,
      "nome": "Osaka (28 pcs)",
      "descricao": "2 Nigiri de salmão, 2 Nigiri skin, 10 Hossomaki de salmão, 5 Uramaki Filadélfia, 5 Uramaki skin e 4 Jow de salmão.",
      "preco": 54.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 4,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5005,
      "nome": "Atami (38 pcs)",
      "descricao": "4 Nigiri de salmão, 10 Hossomaki de salmão, 4 Jow de salmão, 10 Uramaki de salmão e 10 Hot Roll Filadélfia.",
      "preco": 71.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 5,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5006,
      "nome": "Kyoto (40 pcs)",
      "descricao": "8 Nigiri de salmão, 4 Jow de salmão, 8 lâminas de sashimi, 10 Uramaki de salmão com camarão e 10 Hot Filadélfia.",
      "preco": 103.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 6,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5007,
      "nome": "Nara (28 pcs)",
      "descricao": "2 Nigiri skin, 2 Nigiri de salmão, 5 Uramaki Filadélfia, 5 Uramaki skin, 4 Jow de salmão e 10 Hot Roll Filadélfia.",
      "preco": 54.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 7,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 5008,
      "nome": "Yokohama (40 pcs)",
      "descricao": "10 Hot Roll, 5 Hossomaki de salmão, 5 Hossomaki de kani, 5 Hossomaki de pepino, 10 Uramaki Filadélfia e 5 Futomaki Filadélfia skin.",
      "preco": 79.90,
      "categoria": "Combos",
      "ativo": true,
      "ordem": 8,
      "imagem": "",
      "tipo": "produto"
    },
    {
      "id": 6001,
      "nome": "Jow Jelly Spicy 6 Unidades",
      "descricao": "Bolinha de arroz com salmão fresco, cream cheese e geleia de pimenta doce.",
      "preco": 44.90,
      "categoria": "Salmão",
      "ativo": true,
      "ordem": 1,
      "imagem": "jowjellyspicy.avif",
      "tipo": "produto"
    },
    {
      "id": 6002,
      "nome": "Niguiri de Salmão 6 Unidades",
      "descricao": "Fatia de salmão fresco sobre bolinha de arroz japonês.",
      "preco": 44.90,
      "categoria": "Salmão",
      "ativo": true,
      "ordem": 2,
      "imagem": "niguiridesalmao.avif",
      "tipo": "produto"
    },
    {
      "id": 6003,
      "nome": "Jow de Salmão 6 Unidades",
      "descricao": "Bolinha de arroz com salmão fresco, topping de salmão e cream cheese.",
      "preco": 44.90,
      "categoria": "Salmão",
      "ativo": true,
      "ordem": 3,
      "imagem": "jowdesalmao.avif",
      "tipo": "produto"
    },
    {
      "id": 6004,
      "nome": "Carpaccio de Salmão (10 fatias)",
      "descricao": "10 fatias de salmão fresco com molho ponzu, pimenta togarashi e shoyu.",
      "preco": 46.90,
      "categoria": "Salmão",
      "ativo": true,
      "ordem": 4,
      "imagem": "carpacciodesalmao.avif",
      "tipo": "produto"
    },
    {
      "id": 6005,
      "nome": "Sashimi de Salmão Fresco 8 Fatias",
      "descricao": "Oito fatias de salmão fresco.",
      "preco": 42.90,
      "categoria": "Salmão",
      "ativo": true,
      "ordem": 5,
      "imagem": "sashimidesalmao.avif",
      "tipo": "produto"
    },
    {
      "id": 6006,
      "nome": "Gunkan Six",
      "descricao": "2 Gunkan com gorgonzola, 2 com crispy de couve e 2 com crispy de alho-poró.",
      "preco": 50.00,
      "categoria": "Salmão",
      "ativo": true,
      "ordem": 6,
      "imagem": "",
      "tipo": "produto"
    }
  ],
  "categorias": [
    { "nome": "Hot's", "ordem": 0, "divisoria": false },
    { "nome": "Entradas", "ordem": 1, "divisoria": false },
    { "nome": "Onigiris", "ordem": 2, "divisoria": false },
    { "nome": "Monte seu Combo", "ordem": 3, "divisoria": false },
    { "nome": "Pokes", "ordem": 4, "divisoria": false },
    { "nome": "Combos", "ordem": 5, "divisoria": false },
    { "nome": "Salmão", "ordem": 6, "divisoria": false },
    { "nome": "Temakis", "ordem": 7, "divisoria": false }
  ],
  "complementos": []
};
