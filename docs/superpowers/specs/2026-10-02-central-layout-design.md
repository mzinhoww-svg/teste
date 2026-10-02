# Central de disparo: layout largo, fila e detalhe

Data: 02/10/2026. Alvo: `tools/prospeccao/central/` (Artifact https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum).
Origem: crítica Impeccable de 02/10 (24/40, `.impeccable/critique/2026-10-02T04-57-41Z__tools-prospeccao-central-index-html.md`) e brainstorm com a Letícia.

## Entendimento

- **O que a Letícia pediu:** layout mais largo para o notebook que vire uma coluna no celular; melhorias tiradas da crítica; um plano para todos os processos.
- **Contexto (PRODUCT.md):** ferramenta operacional, densa e rápida. Meta de 20 toques por dia chegando a quem decide, sem pesquisar de novo. Evitar cara de CRM genérico, tela sobrecarregada e letra pequena.
- **Escolhas dela:** trilho + fila + detalhe; o clique de envio marca e oferece Desfazer; menos botões por lead; atalhos de teclado; tipografia e acessibilidade; meta do dia com estado de meta batida.
- **Premissas:** os três funis continuam (Aquecimento, Pós-venda, Leads). Os dados, os campos e o banco não mudam. Nada é enviado automaticamente; a Letícia continua mandando cada mensagem pelo WhatsApp ou e-mail dela.

## Critérios de sucesso

1. Em 1440px a central usa a largura toda (até 1600px) e mostra, ao mesmo tempo, a fila do dia e o lead selecionado com a mensagem aberta.
2. Mandar um toque leva um clique (ou Enter) e a seleção pula para o próximo lead que vence hoje.
3. Um envio por engano se desfaz em um clique durante 8 segundos, e depois pelo histórico.
4. Nenhum texto abaixo de 12px; texto corrido em 14px ou mais; bordas de campo com 3:1; alvos de toque com 44px no celular.
5. Depois de qualquer ação o foco fica no mesmo lead (ou no próximo, após envio), e o leitor de tela anuncia só o aviso.
6. Em 390px não há rolagem lateral e o topo fixo ocupa no máximo 120px.
7. A nota da próxima crítica Impeccable sobe para 30/40 ou mais.

## Arquitetura (abordagem A)

A página sai de um arquivo único (1.365 linhas) para três arquivos publicados juntos no mesmo Artifact:

| Arquivo | Papel |
|---|---|
| `central/index.html` | Estrutura: trilho, fila, detalhe, região do aviso, carregamento de `estilo.css` e `app.js` |
| `central/estilo.css` | Tokens (cores do tema claro e escuro, tipografia, espaçamentos) e componentes |
| `central/app.js` | Estado, leitura do banco, desenho, ações, atalhos |

Sem framework e sem dependências novas. O `app.js` continua um script clássico (sem módulos) organizado em seções com uma responsabilidade cada: `estado`, `banco` (assinaturas e `gravar`), `regras` (grupo, vencimento, toques, contato da cadência, mensagem, foto: as funções que já existem e funcionam), `desenho` (trilho, fila, detalhe), `acoes` (enviar, desfazer, resultado, contato, anotação), `teclado`.

**Desenho por partes.** Hoje `render()` esvazia `#lista` e reconstrói tudo a cada gravação. Passa a ser:
- `desenharTrilho()` atualiza contagens, meta e abas no lugar.
- `desenharFila()` reconcilia as linhas por id: cria as que faltam, remove as que saíram do filtro, atualiza o conteúdo das que mudaram e mantém a ordem. O elemento DOM de cada lead é reaproveitado, então o foco e a rolagem não se perdem.
- `desenharDetalhe()` redesenha só o painel do lead selecionado, e só quando o documento desse lead mudou ou a seleção mudou. Formulários abertos (anotação, novo contato) mantêm o rascunho, como hoje.

O banco, os nomes de campos e o formato dos documentos não mudam. Campos novos: nenhum. O histórico já existe (`historico`).

## Estrutura da tela

| Largura | Composição |
|---|---|
| ≥ 1280px | Grade `240px · minmax(340px, 420px) · 1fr`, largura máxima 1600px, centralizada. Trilho e detalhe fixos na altura da janela, cada coluna com rolagem própria. |
| 1024–1279px | O trilho vira uma barra no topo (funis, meta, botão Filtros que abre um painel). Fila e detalhe lado a lado. |
| 760–1023px | A fila ocupa a tela. O detalhe abre como gaveta pela direita (até 560px) sobre a fila, com Fechar e Esc. |
| < 760px | Uma coluna. Fixos no topo só os funis e a linha "6/20 toques · 14 para hoje". O detalhe abre em tela cheia com Voltar. Filtros num painel. |

### Trilho (≥ 1280px)
Marca, os três funis em lista vertical com contagem, a meta do dia, as abas de status em lista vertical com contagem (sem quebra de linha), os filtros empilhados e a busca. A contagem ao lado de cada funil passa a significar a mesma coisa nos três: itens para hoje (no Leads, leads sem enriquecimento completo, com o rótulo "a completar").

### Fila
Uma linha por item, com altura de 64 a 80px:
- Aquecimento: nome, categoria, três pontos do toque (feito, agora, depois, com rótulo de texto para leitor de tela), data ou "hoje", botões Enviar e Copiar. Chips de alerta em cor de alerta.
- Pós-venda: nome, produto, etapa atual (n/7), data, botão da mensagem da etapa.
- Leads (≥ 1024px): tabela ordenável (Empresa, Status, Lidera, Contato direto, CNPJ, Alertas). Abaixo disso, linhas como nos outros funis.

O item selecionado fica destacado por fundo e borda completa (sem faixa lateral). Clique na linha seleciona; clique no nome em telas menores abre o detalhe.

### Detalhe
Topo, nesta ordem:
1. Nome, categoria e estado.
2. A mensagem do toque atual aberta (ou da etapa, no pós-venda), com o destino: nome do contato e número ou e-mail.
3. Enviar (principal) e Copiar. Na foto do toque 1, o bloco da foto como hoje (trocar e salvar).
4. Resultado: Respondeu, Fechou negócio, Pediu para sair, como um grupo de três botões secundários. "Pediu para sair" pede confirmação no próprio grupo ("Confirmar saída" / "Cancelar"). Fechou negócio abre a escolha do produto como hoje.

Abaixo, abas: **Perfil**, **Cadência**, **Histórico**.
- Perfil em duas colunas a partir de 1280px: esquerda O que faz, Gancho, O que já tem, Empresa na Receita, Cuidado e pendências; direita Quem lidera e Contatos (Usar na cadência, Adicionar contato).
- Cadência: as três mensagens com a data de cada uma, a próxima aberta.
- Histórico: a linha do tempo e a nova anotação.
No pós-venda as abas são Etapa, Cliente e Histórico, com as datas de kickoff e gravação e Concluir etapa / Pausar.

## Envio e desfazer

- **WhatsApp:** o botão Enviar é um link para o WhatsApp. No clique: marca `enviadoN` e `etapa`, abre a conversa, mostra o aviso "Toque 2 marcado · Desfazer" por 8 segundos e seleciona o próximo lead que vence hoje.
- **E-mail:** igual, com o link `mailto:` (assunto e corpo). Sai o botão "Marcar toque N enviado".
- **Desfazer no aviso:** volta `etapa` e limpa `enviadoN`, registra "Toque N desfeito" no histórico e devolve a seleção ao lead.
- **Depois dos 8 segundos:** o Histórico mostra "Desfazer" na linha do último envio do lead.
- O botão permanente "Desfazer toque N" sai do card.
- Se a gravação falhar, o aviso de erro de hoje aparece e a seleção não avança.

## Atalhos

| Tecla | Ação |
|---|---|
| j / k | próximo / anterior na fila |
| Enter | enviar o lead selecionado |
| c | copiar a mensagem |
| / | ir para a busca |
| 1 / 2 / 3 | Aquecimento / Pós-venda / Leads |
| r | abrir Resultado |
| Esc | fechar o detalhe (gaveta ou tela cheia) e sair da busca |
| ? | mostrar e esconder a lista de atalhos |

Desligados quando o foco está em campo de texto, select ou textarea, e quando há tecla modificadora. A busca filtra os três funis por nome, CNPJ, pessoa e contato.

## Tipografia e acessibilidade

- Fonte: DM Sans para tudo; DM Mono só para números, datas e telefones. Sai a Cormorant (e o link dela no Google Fonts).
- Escala fixa: 12 / 13 / 14 / 16 / 20 / 24px. Rótulos 12px no mínimo, texto corrido 14px, títulos de lead 16px.
- Caixa alta espaçada só nos números e rótulos da meta. O resto em caixa normal.
- Novo token `--borda-campo` com contraste de 3:1 nos dois temas para campos e botões secundários.
- Item "apagado" (sem resposta, saiu) marcado por rótulo e cor de texto, sem `opacity`. Botão desativado com cor de texto própria, sem `opacity` abaixo do contraste.
- Telefones exibidos formatados: +55 (65) 99999-1111.
- Alvos de toque de 44px no celular (botões, linhas da fila, abas, resumos).
- `aria-live` sai de `#lista`; o aviso (`#toast`, `role="status"`) é a única região anunciada. Foco visível em todos os controles.
- Movimento: só transições de estado de 150–200ms (seleção, gaveta, aviso), com `prefers-reduced-motion` sem animação.

## Meta do dia

- No trilho: barra de progresso real (8px), "6 de 20 toques" e "14 para hoje".
- Ao chegar a 20: a barra muda para a cor de sucesso e o texto para "Meta do dia batida · 3 ainda vencem hoje". Sem confete nem animação.
- No celular, a mesma informação numa linha no topo.
- A meta vem de `config/meta.metaDiaria`, como hoje.

## Erros e casos de borda

- Banco fora do ar ou sem permissão: o aviso fixo de hoje, Enviar continua abrindo o WhatsApp sem marcar, como hoje.
- Fila vazia num filtro: estado vazio que diz o que fazer (trocar de aba, limpar filtros) e, para "Para hoje" zerado, mostra quando vence o próximo.
- Lead removido do filtro enquanto selecionado (ex.: marcou Respondeu na aba Para hoje): a seleção passa para o próximo item da fila.
- Corrigir "veio da prospecção ()" quando o cliente não tem lead de origem e a ordem dos pausados em Pós-venda › Todos.
- O perfil aberto em `localStorage` deixa de existir; guarda-se só o funil e o lead selecionado.

## Testes

- Python: `python3 -m pytest -q` continua passando (nenhuma regra de dados muda).
- Novo `tools/prospeccao/tests/central/teste_central.js` (Playwright, Chromium em `/opt/pw-browsers/chromium`) com banco simulado e leads fictícios, em 1440px e 390px:
  - sem rolagem lateral; topo fixo ≤ 120px em 390px;
  - Enviar marca, mostra o aviso, avança a seleção; Desfazer volta;
  - e-mail sem botão "Marcar enviado";
  - Pediu para sair pede confirmação;
  - j/k/Enter/c//, Esc;
  - foco no lead certo depois de cada ação;
  - nenhum texto abaixo de 12px; botões com 44px em 390px;
  - Leads como tabela em 1440px.
- Antes de publicar: uma olhada na página nas duas larguras e nos dois temas, depois uma leitura de volta no banco.
- Depois de publicar: `/impeccable critique` de novo para comparar com 24/40.

## Publicação

O mesmo Artifact (mesmo link), agora com `files` para `estilo.css` e `app.js`. As capacidades `db` e `downloads` continuam. As fotos continuam em `fotos/`.

## Fora desta rodada

Ações em lote, quadro de etapas no Pós-venda, mudanças nos dados ou nas mensagens, envio automático.
