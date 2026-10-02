# Enriquecimento de telefones de decisores (treg)

Desenho aprovado pela Letícia em 02/10/2026 (texto dela, organizado). Alvo: Central de disparo (https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum), coleção `leads`.

## Objetivo
Toda vez que ela digitar `/enriquecer-leads` ou clicar em "Enriquecer base" na aba Leads: arrumar a base, mostrar o custo estimado e buscar, via treg, o celular do decisor de cada lead ainda não buscado. Teto de US$10 por execução; a execução segue sozinha enquanto o acerto se mantiver em 30% ou mais.

## Piloto (outra sessão)
- 127 leads; 86 sem telefone/e-mail direto de decisor; 205 decisores em `lead.decisores[]`, só 8 com `linkedin`; 120 com `site`.
- `treg.people.phone.find` com `{"linkedin_url": ...}`: provedores baratos (quickenrich, aiark) erraram nos 3 perfis de Cuiabá; wiza achou 1 celular por US$0,125. Erro não é cobrado. Estimativa inicial: 33% de acerto, US$0,125 por acerto.
- NÃO mandar campos extras junto com `linkedin_url` (com nome e domínio no mesmo corpo o roteador tentou um provedor de US$0,245 e recusou pelo teto).
- Davi Hoffmann Ferreira (R0008, Olimpo Engenharia): call id `7d851c9cab7541689190e348fe3ad27b`. Recuperar de graça com `GET https://treg.to/calls/7d851c9cab7541689190e348fe3ad27b/result` e gravar como resultado desse lead, sem nova consulta.

## Setup
1. Token do segredo `TREG_TOKEN` (ou da configuração do CLI em `~/.treg/config.json`). Nunca gravar o token no repositório, na página ou no banco.
2. CLI: `curl -fsSL https://treg.to/install.sh | sh -s -- --token "$TREG_TOKEN"`; conferir com `treg balance`.
3. `CLAUDE.md` do projeto: "No início de cada turno, leia `config/enriquecimento` no banco da Central de disparo; se `status == "pedido"`, rode `/enriquecer-leads` antes de responder."

## Peças
- `.claude/skills/enriquecer-leads/SKILL.md`: orquestra uma execução (lê a base com `ArtifactData list` + `out_dir`, chama o script, grava resultados e status na central).
- `tools/prospeccao/scripts/enriquecer_leads.py` (lógica testável; subcomandos `limpar`, `planejar`, `executar`; flag `--simular`). Fala com o treg por HTTP: `POST https://treg.to/call/<endpoint-id>` com `X-Treg-Token`, `X-Treg-Route-Max-Cost`, `Idempotency-Key: <execucaoId>-<leadId>-<passo>`; lê `X-Treg-Cost-Micro` e `X-Treg-Call-Id`. Não acessa o banco: recebe e devolve JSON.
- `tools/prospeccao/tests/test_enriquecer_leads.py` (pytest, respostas falsas).
- Página, aba Leads: botão "Enriquecer base" grava `config/enriquecimento` com `status: "pedido"` e `pedidoEm`; cartão de andamento ao vivo (onSnapshot) com estado, estimativa, lote, consultados, achados, taxa, gasto, motivo de parada; botão desabilitado enquanto `pedido | estimando | executando`. Conferir com `as_level: "interact"` se quem usa a página grava em `config/enriquecimento`; senão, usar outro caminho permitido.

## Fluxo
1. Limpar: telefones de `contatos[]` → 55 + DDD + número (regra do `limparTelefone` da página: 10 ou 11 dígitos, prefixa 55). Remover contatos duplicados pelo telefone dentro do lead. Marcar inválido (sem apagar) o que não normalizar. Ignorar leads com `situacao` `sair` ou `fechou`.
2. Selecionar: um decisor por lead — primeiro nome bate com `saudacao`; senão o primeiro de `decisores[]`. Fora: lead com `buscaTreg.em` < 90 dias, ou que já tem contato direto de decisor com telefone. Ordem: faixa A primeiro, score decrescente, `etapa == 0`.
3. Estimar: candidatos × taxa × custo médio por acerto + US$0,0026 por busca de LinkedIn. Histórico real (`historicoExecucoes`) quando existir; senão o piloto. Gravar `status: "estimando"` com a estimativa e mostrar no chat. Se saldo < min(estimativa, US$10): `status: "parado"`, `motivoParada: "saldo insuficiente"`, pedir `treg topup`.
4. Executar em lotes de 10:
   - Decisor sem `linkedin`: `treg.people.enrich` com `{"domain": <host do site>, "full_name": <nome>}`, teto US$0,01; descobrir na primeira resposta o campo da URL do LinkedIn.
   - Com LinkedIn: `treg.people.phone.find` com `{"linkedin_url": ...}` apenas, teto US$0,15.
   - Sem LinkedIn: `treg.people.phone.find` com `{"domain", "first_name", "last_name"}`, teto US$0,15.
   - Aceitar só número brasileiro válido depois de normalizado.
5. Verificação: depois de cada lote, acerto acumulado ≥ 30% segue; abaixo para com `motivoParada: "acerto abaixo de 30%"`. Antes de cada chamada, parar se gasto + US$0,15 > US$10 ou se o saldo não cobrir. 503 com `treg_saturated`: esperar `Retry-After` e repetir com a mesma chave; outro 4xx/5xx marca o lead como erro e segue.
6. Ao fim de cada lote: gravar resultados e `config/enriquecimento.progresso`.

## Gravação
- Número achado → contato novo: `id "k<n+1>"`, `papel "decisor"`, `nome`, `cargo`, `telefone` normalizado, `whatsapp "?"`, `fonte "treg · <provedor> · call <callId>"`, `confianca "média"`. LinkedIn ganho → `decisores[i].linkedin`.
- Todo lead consultado: `buscaTreg: {em, execucaoId, resultado: "achou"|"nao_achou"|"erro", custoMicro, callIds}`; `historico` + `{em, texto: "Busca de telefone (treg): <resultado>", tipo: "enriquecimento"}` (máx. 100); atualizar `pendencias`, `enriquecimento.status`, `enriquecimento.atualizadoEm`.
- Nunca alterar `contatoAtivo`.
- `ArtifactData batch` (até 50) com `if_version`; conflito → reler só aquele lead, reaplicar, gravar; nunca sobrescrever edição dela.
- `config/enriquecimento` no fim: `status "concluido"|"parado"` + `motivoParada`; `historicoExecucoes` (últimos 20) `{execucaoId, em, candidatos, consultados, achados, taxa, gastoMicro, motivoParada}`; mesmo resumo no chat.

## Testes antes de rodar de verdade
1. Pytest: limpeza, deduplicação, seleção, estimativa, parada por acerto < 30%, por teto, por saldo.
2. `--simular` na base toda gravando só no card TESTE.
3. Clicar no botão, confirmar o pedido; mandar mensagem e confirmar que a execução começa.
4. Primeira execução real: mostrar a estimativa e rodar.

## Regras
Celular de sócio é dado pessoal (LGPD, interesse legítimo B2B). Não consultar quem pediu para sair. Fonte rastreável pelo call id. Commit na branch de trabalho, PR de rascunho atualizado. No fim: link da central e resumo da execução.

## Decisões do controlador
- Caminhos: script em `tools/prospeccao/scripts/` e testes em `tools/prospeccao/tests/` (onde já vive o pytest do projeto), em vez de `scripts/` e `tests/` na raiz (que são do app Next).
- Token: o script lê `TREG_TOKEN` e, se ausente, `~/.treg/config.json` (onde o instalador guardou o token desta sessão).
