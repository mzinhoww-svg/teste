---
name: enriquecer-leads
description: Enriquece a base da Central de disparo da Reiners com o celular do decisor de cada lead via treg (limpa, estima, executa em lotes com teto de US$10 e parada por acerto abaixo de 30%). Use quando a Letícia digitar /enriquecer-leads, clicar em "Enriquecer base" (config/enriquecimento.status == "pedido") ou pedir para buscar telefones de decisores.
---

# Enriquecer leads (telefone do decisor via treg)

Desenho aprovado: `docs/superpowers/specs/2026-10-02-enriquecer-leads.md`. Toda a lógica está em `tools/prospeccao/scripts/enriquecer_leads.py`; esta skill só lê e grava o banco e conversa com a Letícia.

Central: `https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum`. Pasta de trabalho: `WS=/tmp/enriq/<execucaoId>` (fora do repositório; contém dados pessoais). `execucaoId` = `E` + data/hora UTC `YYYYMMDDHHMMSS`.

## Regras que não mudam
- Token só de `TREG_TOKEN` ou de `~/.treg/config.json`. Nunca escrever o token em arquivo do repositório, na página, no banco ou no chat.
- Celular de sócio é dado pessoal (LGPD, interesse legítimo B2B). Não consultar lead com `situacao` `sair` ou `fechou`. Cada número carrega o call id na `fonte`.
- Nunca alterar `contatoAtivo`. Nunca sobrescrever edição da Letícia: toda escrita usa `if_version` da versão lida.
- Teto de US$10 por execução. Saldo menor que min(estimativa, US$10) → parar com "saldo insuficiente" e pedir `treg topup`.

## Passos
1. **Status.** `ArtifactData get config/enriquecimento`. Se `status` já for `estimando` ou `executando` com `progresso.atualizadoEm` de menos de 15 min, não começar outra: avisar que há uma execução em andamento.
2. **Ler a base.** `ArtifactData list leads` com `query.limit: 200` e `out_dir: $WS/db`. Juntar os documentos (sem `TESTE`) num array `$WS/leads.json`, guardando a `version` de cada um em `$WS/versoes.json`.
3. **Limpar.** `cd tools/prospeccao && python3 -m scripts.enriquecer_leads limpar --entrada $WS/leads.json --saida $WS/limpos.json --alteracoes $WS/alteracoes.json`. Gravar as alterações de `contatos` (só leads com alteração) em lotes de até 50 com `ArtifactData batch` (`op: update`, `if_version`). Em conflito: reler o lead, reaplicar `limpar` só nele e gravar de novo.
4. **Planejar.** `python3 -m scripts.enriquecer_leads planejar --entrada $WS/limpos.json --config $WS/config.json --saida $WS/plano.json` (`config.json` = o documento `config/enriquecimento` lido no passo 1). Gravar em `config/enriquecimento`: `status: "estimando"`, `execucaoId`, `estimativa` (do plano) e `progresso: {lote: 0, consultados: 0, achados: 0, taxa: null, gastoMicro: 0, atualizadoEm}`. Mostrar no chat: candidatos, buscas de LinkedIn, taxa usada, custo estimado e quantos leads ficaram de fora (sem decisor, sem site e sem LinkedIn, já buscados).
5. **Saldo.** `treg balance` (ou a ferramenta `balance` do conector treg). Se o saldo for menor que min(estimativa, US$10): gravar `status: "parado"`, `motivoParada: "saldo insuficiente"`, registrar em `historicoExecucoes` e dizer à Letícia para rodar `treg topup`. Parar aqui.
6. **Executar.** Gravar `status: "executando"`. Rodar `python3 -m scripts.enriquecer_leads executar --plano $WS/plano.json --entrada $WS/limpos.json --saldo-micro <saldo> --execucao <execucaoId> --saida $WS/resultado.json` (em teste: `--simular`). O script grava `$WS/progresso.json` ao fim de cada lote de 10 e `$WS/atualizados.json` com os leads consultados.
   - Execução longa: rodar em segundo plano e, a cada lote (progresso.json mudou), gravar `config/enriquecimento.progresso` e os leads do lote (passo 7).
7. **Gravar os leads.** Para cada lead em `atualizados.json`: `ArtifactData batch` com `op: update` e só os campos `contatos`, `decisores`, `buscaTreg`, `historico`, `pendencias`, `enriquecimento`, cada um com o `if_version` lido. Em conflito: reler só aquele lead, reaplicar o resultado dele com `aplicar` (o script expõe a função) sobre a versão nova e gravar de novo.
8. **Fechar.** Gravar `config/enriquecimento`: `status: "concluido"` (todos consultados) ou `"parado"` com `motivoParada` ("acerto abaixo de 30%", "teto de US$10", "saldo insuficiente", "erros consecutivos"), `progresso` final e `historicoExecucoes` = anteriores + `{execucaoId, em, candidatos, consultados, achados, taxa, gastoMicro, motivoParada}` (últimos 20). Mostrar o mesmo resumo no chat, com o link da central.
9. **Limpar a pasta.** `rm -rf $WS`.

## Teste sem custo
`--simular` com a base inteira, mas gravando só no documento `leads/TESTE` (aplicar o resultado de um lead simulado com achado ao TESTE) e o cartão de andamento em `config/enriquecimento`. Depois voltar `config/enriquecimento.status` para `ocioso`.
