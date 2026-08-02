# Camada de enriquecimento dos agentes

Todos os agentes recebem, no prompt, uma camada obrigatória de enriquecimento
(`ENRICHMENT_BLOCK` em `lib/agents/reiners-context.ts`). Ela ensina o agente a
**investigar antes de responder** e a declarar incerteza — não só a gerar texto.

## Ordem de confiança das fontes

1. CRM do tenant ativo (deal, contato, empresa, estágio, valor, produto, score,
   temperatura, tags, atividades, timeline, propostas, contratos, agent_runs,
   motivo de perda/ganho, próxima ação).
2. Conversa de WhatsApp do lead (quando disponível) — intenção, objeções, tom,
   urgência, dados confirmados, perguntas sem resposta.
3. Base comercial da Reiners (manual, apresentação, tabela de produtos/preços,
   scripts, objeções, cadências, cases).
4. Arquivos anexados pelo usuário.
5. Canais próprios da Reiners.
6. Fontes públicas do lead (site, LinkedIn, Instagram, notícias, evento).
7. APIs públicas gratuitas — **BrasilAPI** para CNPJ/CEP (`BRASILAPI_BASE_URL`),
   sem chave e sem scraping agressivo.
8. Fontes setoriais e eleitorais (apenas dados públicos e relevantes).

## Regras invioláveis

- Nunca inventar preço, cargo, orçamento, prazo, decisor, evento, data, CNPJ,
  escopo ou condição.
- Em conflito, usar a fonte mais recente e oficial e sinalizar o conflito.
- Sem ferramenta de busca externa, o agente **não finge que buscou** — gera uma
  lista "Buscas recomendadas" com os termos exatos.
- LGPD: só dados necessários ao fim comercial; nada de dados sensíveis
  irrelevantes; nunca dados de outro tenant.

## Armazenamento de evidências

A tabela `lead_enrichment` (migration 0006) guarda evidências por deal/contato:
`source_type`, `source_url`, `extracted_fact`, `confidence` (high/medium/low),
`relevance` e `used_by_agent`. Assim os agentes melhoram com o tempo, sem
depender só do texto do prompt.

## Formato de saída

Além da saída específica, todo agente retorna (ver `OUTPUT_FORMAT`): dados usados,
leitura da conversa de WhatsApp, enriquecimento aplicado + confiança, dados
ausentes, buscas recomendadas, decisão tomada, alternativa segura e atualização
sugerida no CRM.
