# Status · Prospecção, pós-venda e central · Reiners Media

Atualizado em 02/10/2026.

## Mensagens e central

| Item | Resultado |
|---|---|
| Leads pesquisados | 128 em Cuiabá e Várzea Grande, com telefone, e-mail e Instagram tirados do site oficial de cada um (URL na coluna "Fonte do dado") |
| Fila com canal | 127 (105 WhatsApp, 22 e-mail) |
| Fora da fila | 1 sem canal (Imo Odonto: o WhatsApp do site aparece truncado e não há e-mail) e 1 duplicado (AB3 apareceu em dois segmentos) |
| Segmentos | Saúde 24, Jurídico e contábil 27, Empresas, agro e entidades 27, Mentores e imobiliário 25, Médio porte 24 |
| Faixa | A 89, B 31, C 7 |
| Checagem e rubrica | 0 erros nos 381 textos (127 leads × 3 toques); frases todas diferentes; maior WhatsApp com 583 caracteres |
| Fonte da frase | Especialidade 100, Trajetória 21, Neutra 3, Instagram 2, Reputação 1 |
| Planilha | `dados/Reiners_Leads_Cuiaba.xlsx`, com abas Leads (dados, frase e os três toques) e Copy |
| Central de disparo | https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum |
| Banco da central | 129 documentos: 127 em `leads`, o card `TESTE` e `config/meta` (meta de 20 toques por dia, esperas de 4 e 6 dias). Leads semeados com `etapa` 0 e `situacao` ativo |
| Verificação | No nível de quem usa a página: marcar o toque 1 no `TESTE`, ler de volta (`etapa` 1 com a data) e desfazer |
| Pós-venda | Funil de 7 etapas na mesma central, textos em `config/posvenda`. Nenhum cliente cadastrado ainda: entram por "Fechou negócio" ou "Novo cliente" |
| Verificação do pós-venda | No nível de quem usa a página: criar um cliente de teste, ler de volta e apagar. Texto montado pela página igual ao do Python nas 35 combinações de etapa e produto |
| Copy v2 | Parágrafos separados por linha em branco; toque 1 do WhatsApp com a linha do cenário da foto. Maior mensagem com 685 caracteres (a legenda de foto aceita 1024) |
| Fotos | 31 normalizadas e rotuladas (`dados/fotos_rotuladas/` com `rotulos.csv`), 12 curadas na central. Distribuição: Mesa com pessoa 42, Sofá aberto 17, Estante 13, Mesa pronta 12, Sofá com pessoa 8, Escritório 9, Puff 4; os 22 leads de e-mail ficam sem foto |
| Atualização do banco | Só `toques`, `foto` e `versaoCopy` de cada lead, cada escrita presa à versão lida; o envio do Charles (R0002, toque 1 às 23:00 UTC) ficou como estava |
| Enriquecimento | 128 leads pesquisados. CNPJ confirmado na Receita em 104, quem lidera em 123, contato direto (decisor ou comunicação) em 36: 19 por WhatsApp, 8 por telefone e 9 por e-mail. Status: completo 36, parcial 87, sem enriquecimento 5 |
| Por segmento (completos / contato direto) | Saúde 3/3 · Jurídico e contábil 14/14 · Entidades 7/7 · Mentores e imobiliário 11/11 · Médio porte 1/1 |
| WhatsApp do decisor | Nos 19 leads com WhatsApp direto, o número que já estava na cadência é o do próprio decisor (advogados, médicos, corretores); a mensagem já chega a quem decide |
| Alertas | 2 leads com notícia de risco separada dos sinais (Colégio São Gonçalo e Colégio Isaac Newton); a TMF tem a nota na observação |
| Hunter.io | 35 buscas (plano grátis, 50 por mês). 10 e-mails de decisor em 8 leads (3 de confiança alta, 5 média, 2 baixa) e 9 de cargo alto como contato geral; 13 leads atualizados no banco, só `contatos` e `enriquecimento`. Contato direto passou de 36 para 41 (14 por e-mail); completos 41, parciais 82 |
| Casa dos Dados | Os 104 CNPJs consultados: 28 celulares que ainda não tínhamos (9 em empresa pequena de sócio único). Fora da central até a decisão da Letícia |
| Apollo e Vibe Prospecting | Apollo grátis não libera busca nem revelação de pessoa pela API ou pelo conector; os 30 decisores estão em `dados/apollo_importar.csv` para importar no app. Vibe tem só 4 decisores com telefone em todo o MT |
| Testes | 85 passando (`python3 -m pytest -q` em `tools/prospeccao/`) |

## Pontos para a Letícia olhar

- **WhatsApp em fixo (26 leads):** o site diz que o fixo também atende no WhatsApp. Se o link não abrir conversa, é porque o número não tem WhatsApp. Nesse caso, marque "Pediu para sair" ou mande por e-mail.
- **Número de setor (6 leads):** CDL Cuiabá (WhatsApp do Certificado Digital), FAIPE (graduação), UNIFACC (inscrições), Bom Jesus (SAC), DAC (televendas) e Farma Fácil (o e-mail é do RH). A mensagem chega, mas talvez a um setor que não decide. Peça na resposta o contato de quem cuida da comunicação.
- **Confirmar número (7 leads):** Coach'tigo (o site mostra um dígito a menos), FBR Consultoria (veio de guia local) e Colégio Isaac Newton, Agro Amazônia, Aprosoja, OCB/MT e Famato (o contato veio do resumo da busca, porque o site não abriu).
- **Saudação com nome:** 51 leads são chamados pelo nome (Dra. Lara, Charles, Irmã Rose...), sempre a partir de quem o site apresenta como responsável. Se algum não for quem atende o WhatsApp, troque para "pessoal da/do" em `msg/personal_v1.py`.
- **Oferta do toque 2:** é o Diagnóstico de Presença Institucional por nossa conta, como combinado. Ele não mexe no preço dos planos, o que respeita a regra do manual comercial de não baixar preço na primeira objeção.
- **E-mail:** sai pelo botão "Abrir e-mail" (ou copiando assunto e corpo). Não criei rascunhos no Gmail porque a conta conectada aqui não é a da Reiners.
- **Notas do Google:** a pesquisa achou nota só do Anderson Gadelha (5,0 em 35). As outras frases não citam número de avaliação.

- **Clientes que já compraram:** cadastre pelo botão "Novo cliente" no pós-venda (nome, saudação, WhatsApp ou e-mail e produto). Se preferir, me passe a lista que eu semeio no banco.
- **Etapa 6 (Entrega):** pede uma frase do cliente para o site. Ela só vai ao ar com autorização, como manda o código do site (depoimento real ou nenhum).

- **Charles (Handell):** o toque 1 saiu antes da foto e caiu no atendimento automático do escritório. Se quiser, mande agora a foto da Mesa de reunião pelo card dele (Salvar foto) com uma linha curta; o toque 2 continua marcado para 05/10.

- **Saúde e médio porte**: quase todos ficaram parciais, porque clínicas, colégios e empresas só publicam canais gerais (recepção, SAC, secretaria). Nesses, o caminho é pedir na primeira resposta o contato de quem cuida da comunicação, ou buscar no LinkedIn com uma ferramenta paga.
- **12 escritórios de jurídico e contábil sem CNPJ**: a pesquisa bateu no limite de 200 buscas. Estão nas pendências de cada lead; dá para completar numa segunda rodada.
- **Gestões de entidades**: FIEMT, CDL, ACCuiabá, Aprosoja e Aprofir têm mandato terminando em 2026. Vale conferir o presidente antes do toque.
- **Já têm podcast**: Aprosoja (Apro360) e Acrismat. A conversa ali é de produção ou parceria, não de "criar um podcast".

## Bloqueios

- Nenhum. O Apify e o Tavily estão sem crédito, então a lista foi montada por busca na web e conferida no site de cada lead.

## Arquivos com dados de contato

`dados/` (listas brutas, `leads.json`, `mensagens.json` e planilha) e `central/lotes/` ficam fora do git.

## Log

- 02/10/2026: Casa dos Dados nos 104 CNPJs (local), Hunter em 35 domínios e e-mails de decisor aplicados em 13 leads da central, sem mexer em envios nem no contato da cadência.
- 01/10/2026 23:45: enriquecimento dos 128 leads (cinco pesquisas por segmento, BrasilAPI e sites), seção Leads na central, alertas de risco separados, saudação do R0100 corrigida; banco atualizado sem mexer nos envios do R0002 e do R0003.
- 01/10/2026 23:30: fotos do Drive normalizadas e rotuladas, foto por lead no toque 1, mensagens em parágrafos (copy v2); banco atualizado sem mexer nos envios.
- 01/10/2026 23:10: funil de pós-venda (7 etapas), botão Fechou negócio e formulário Novo cliente; config/posvenda semeado e verificado.
- 01/10/2026: cinco pesquisas em paralelo (uma por segmento), 128 leads, módulos e testes, central publicada, 127 frases únicas, 0 erros na checagem, banco semeado e verificado.
