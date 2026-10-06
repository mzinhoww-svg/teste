# Prospecção por decisores: achar a pessoa certa, enriquecer e entrar na cadência

Data: 07/10/2026. Estado: **desenho para revisão** (Letícia e Mazinho). Roda na VPS, dentro do `tools/atendente`. Depende de: `2026-10-06-wa-vps-migration-design.md` (atendente, cadência, WhatsApp) e `2026-10-02-enriquecer-leads.md` (enriquecimento via treg).
O repositório é público: nenhum dado de lead, telefone, e-mail ou chave no Git.

## 1. Objetivo
Falar com empresas pela recepção ou por robôs não funciona. Em vez disso, o sistema acha **o dono ou quem decide** em cada empresa, enriquece essa pessoa (celular e e-mail principal) e a coloca na cadência de WhatsApp já falando com ela pelo nome. Tudo automático, estável e com custo controlado.

Sucesso:
1. Para um segmento de Mato Grosso escolhido, o sistema entrega, sem comando manual, leads com **pessoa certa + celular com WhatsApp confirmado** na fila.
2. Custo por lead entregue abaixo de **US$ 0,50** e teto diário respeitado.
3. Nenhum lead repetido, nenhum lead que pediu para sair e nenhum cliente entram.
4. A taxa de resposta da pessoa certa é medida e comparada com a abordagem pela empresa (aprendizado em `aprendizados.md`).

## 2. Decisões (Letícia e Mazinho, 07/10/2026)
- **Escopo: Mato Grosso.** Cidades e regiões de MT; nada de país aberto.
- **Fonte de busca e enriquecimento: treg** (não a Explee). A Explee fica só como **base de lógica**: segmentos, personas, faixas A/B/C e classificação das campanhas (`classificar_base.py`).
- **Regra de pessoa por porte (editável):** pequena = dono ou sócio; média = marketing ou comunicação, com dono como reserva; grande = RH e marketing. O RH entra quando a oferta é para pessoas (podcast interno, employer branding).
- **Canal agora: WhatsApp.** O **e-mail principal é só coletado e guardado**. O envio de e-mail fica **fora desta entrega**; quando vier, a ideia é importar os leads nas campanhas da Explee (decisão registrada, não implementada).
- O saldo do treg será recarregado pelo Mazinho antes do teste.

## 3. Fases
- **F0 · Teste de bancada (antes de codar o ciclo):** 30 a 50 pessoas de MT passam por cada provedor de celular e e-mail do treg. Mede acerto e custo por provedor, e a cascata da seção 5 sai desse resultado. Orçamento do teste: até US$ 3. Resultado vira um relatório curto no repositório (sem dados pessoais).
- **F1 · Ciclo manual com botão:** uma campanha de busca, do segmento à entrada na cadência, disparada por botão na aba Prospecção, com parada e progresso.
- **F2 · Automático:** o ciclo roda sozinho em horário fixo, com teto por dia e por campanha.
- **F3 · Medição:** painel de funil e custo por etapa; aprendizados dos primeiros 30 dias.

## 4. Peças
Cada peça tem uma função só e é testável sozinha (todas em `tools/atendente/atendente/`).

| Peça | Função |
|---|---|
| `prospeccao/campanha.py` | Define a campanha: segmento, cidades de MT, tamanho, regra de pessoa por porte, teto de gasto, meta de leads por dia. |
| `prospeccao/empresas.py` | Acha empresas: Google Maps do treg para negócios locais; `companies.search` para empresas maiores. Devolve empresa com nome, site, cidade, telefone geral. |
| `prospeccao/pessoas.py` | Acha o decisor pela regra de porte: sócios do CNPJ (dado que já guardamos) mais `people.search` e `decision_makers` do treg. Devolve pessoa com cargo e LinkedIn quando houver. |
| `prospeccao/contatos.py` | Enriquece e-mail e celular em cascata de provedores. Só paga se achar. |
| `prospeccao/qualificar.py` | Normaliza o celular (55 + DDD), checa duplicidade (domínio, LinkedIn, telefone) contra leads, Base e clientes, e checa quem pediu para sair. Confirma WhatsApp pelo WA-AKG (grátis). |
| `prospeccao/promover.py` | Cria o lead no formato da Central com a pessoa certa como `contatoAtivo` (`saudacao` com o nome dela) e põe na cadência. |
| `prospeccao/ciclo.py` | Orquestra uma rodada: estados por etapa, teto de gasto, parada e retomada. Uma rodada por vez. |
| `api_prospeccao.py` e `web/leva5.js` | Rotas e aba **Prospecção** (campanhas, funil, custo, iniciar/pausar). |

## 5. Fluxo e cascata
1. **Empresa:** Google Maps (≈ US$ 0,002 por busca) com palavra do segmento + cidade de MT; empresas maiores por `companies.search` (≈ US$ 0,0004 a 0,004).
2. **Pessoa:** sócios do CNPJ primeiro (grátis); depois `people.search` e `decision_makers` por domínio (buscas grátis); cargos pela regra de porte.
3. **E-mail:** `people.email.find` (≈ US$ 0,005; trykitt/quickenrich).
4. **Celular:** `people.phone.find` roteado (≈ US$ 0,005), depois aiark (≈ US$ 0,026), dropleads (≈ US$ 0,054) e wiza (≈ US$ 0,12). A ordem final vem da F0.
5. **WhatsApp:** o número só vale se o WA-AKG confirmar que tem WhatsApp. Sem WhatsApp, o lead não entra na cadência; fica guardado com e-mail e telefone para outro canal.
6. **Promoção:** lead com pessoa, celular válido e WhatsApp confirmado entra na cadência; senão volta para a Base com o motivo.

Estados por prospecto: `empresa` → `pessoa` → `contato` → `qualificado` → `promovido` ou `descartado(motivo)`. Cada passo grava a fonte (provedor e id da chamada) e o custo.

## 6. Estabilidade
- Uma rodada por vez (thread única); outra tentativa responde 409.
- Idempotente: a chave de cada prospecto é domínio + LinkedIn (ou nome + empresa); repetir a rodada não duplica nem paga duas vezes.
- Retoma de onde parou depois de queda ou reinício; uma falha de empresa não derruba a rodada.
- Teto de gasto por dia e por campanha (padrão sugerido: **US$ 10/dia e US$ 30/campanha**, ajustável na tela); passa do teto, para e avisa. Sem saldo no treg, para com mensagem clara.
- `config.status` `parado` e o botão **Parar tudo** valem aqui também.
- Backoff em erro de rede e limite de chamadas por minuto.
- Tudo registrado, com fonte de cada contato.

## 7. Cadência e primeira mensagem
A cadência já existente (50 envios por dia, 9h a 17h de Cuiabá, seg a sex) segue igual. O primeiro toque muda de texto: fala com a pessoa pelo nome e pelo papel (dono, marketing, RH). Os textos por persona entram em `tools/prospeccao/msg/` e são aprovados pela Letícia antes de ligar. Respostas continuam pelo atendente atual.

## 8. Tela (aba Prospecção)
Lista de campanhas; para cada uma, funil com contagens (empresas, pessoas, com celular, com WhatsApp, entraram na cadência), custo acumulado e por lead, botões iniciar, pausar e editar teto. Nada de jargão: "Achamos 120 empresas, 84 donos, 51 com WhatsApp".

## 9. Dados e privacidade
- Tabelas novas no SQLite (acréscimo): `campanhas` e `prospectos`.
- Celular e e-mail de pessoa são dado pessoal (LGPD, interesse legítimo B2B): não vão para log nem para o Git; quem pediu para sair nunca é consultado nem contatado.
- Chaves só no `.env` da VPS (`TREG_TOKEN`).

## 10. Testes
- Unidade por peça com respostas falsas do treg no **formato real** das respostas (não inventado), incluindo erro 402 de saldo, resposta vazia e telefone inválido.
- Fluxo completo com treg falso e WA-AKG falso: segmento → lead promovido; repetir não duplica; teto para; saldo insuficiente para.
- Contra amostra real, fora do Git: F0 com chamadas reais e custo conhecido.
- Playwright: aba Prospecção (iniciar, parar, funil, tela de 390 px).

## 11. Riscos
- **Cobertura no Brasil** (piloto de setembro: provedores baratos erraram em Cuiabá). Mitigação: F0 antes de fechar a cascata.
- **Saldo do treg** baixo (US$ 0,87 em 07/10): recarga antes de F0.
- **Número errado ou de recepção** tratado como celular da pessoa: a checagem de WhatsApp e a mensagem com o nome da pessoa reduzem o dano; resposta "não sou eu" cai no aprendizado.
- **Ritmo:** 50 envios/dia limita o ganho; o ciclo produz só o que a cadência consegue enviar.

## 12. Fora do escopo
Envio de e-mail; outros estados; LinkedIn automatizado; qualquer uso da Explee para achar empresas ou pessoas.
