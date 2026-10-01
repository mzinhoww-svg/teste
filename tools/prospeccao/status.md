# Status · Prospecção e central · Reiners Media

Atualizado em 01/10/2026.

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
| Testes | 22 passando (`python3 -m pytest -q` em `tools/prospeccao/`) |

## Pontos para a Letícia olhar

- **WhatsApp em fixo (26 leads):** o site diz que o fixo também atende no WhatsApp. Se o link não abrir conversa, é porque o número não tem WhatsApp. Nesse caso, marque "Pediu para sair" ou mande por e-mail.
- **Número de setor (6 leads):** CDL Cuiabá (WhatsApp do Certificado Digital), FAIPE (graduação), UNIFACC (inscrições), Bom Jesus (SAC), DAC (televendas) e Farma Fácil (o e-mail é do RH). A mensagem chega, mas talvez a um setor que não decide. Peça na resposta o contato de quem cuida da comunicação.
- **Confirmar número (7 leads):** Coach'tigo (o site mostra um dígito a menos), FBR Consultoria (veio de guia local) e Colégio Isaac Newton, Agro Amazônia, Aprosoja, OCB/MT e Famato (o contato veio do resumo da busca, porque o site não abriu).
- **Saudação com nome:** 51 leads são chamados pelo nome (Dra. Lara, Charles, Irmã Rose...), sempre a partir de quem o site apresenta como responsável. Se algum não for quem atende o WhatsApp, troque para "pessoal da/do" em `msg/personal_v1.py`.
- **Oferta do toque 2:** é o Diagnóstico de Presença Institucional por nossa conta, como combinado. Ele não mexe no preço dos planos, o que respeita a regra do manual comercial de não baixar preço na primeira objeção.
- **E-mail:** sai pelo botão "Abrir e-mail" (ou copiando assunto e corpo). Não criei rascunhos no Gmail porque a conta conectada aqui não é a da Reiners.
- **Notas do Google:** a pesquisa achou nota só do Anderson Gadelha (5,0 em 35). As outras frases não citam número de avaliação.

## Bloqueios

- Nenhum. O Apify e o Tavily estão sem crédito, então a lista foi montada por busca na web e conferida no site de cada lead.

## Arquivos com dados de contato

`dados/` (listas brutas, `leads.json`, `mensagens.json` e planilha) e `central/lotes/` ficam fora do git.

## Log

- 01/10/2026: cinco pesquisas em paralelo (uma por segmento), 128 leads, módulos e testes, central publicada, 127 frases únicas, 0 erros na checagem, banco semeado e verificado.
