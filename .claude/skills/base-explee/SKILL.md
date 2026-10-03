---
name: base-explee
description: Monta os leads da Central de disparo da Reiners a partir dos pedidos do funil Base (coleção base, faixas B e C da Explee, status "pedido"), põe cada um na fila do enriquecimento e marca a base como "na_cadencia". Use quando houver documentos em base com status == "pedido" no início do turno, ou quando a Letícia pedir para montar os cards da Base.
---

# Base Explee: pedidos viram leads

A página nunca cria lead: o botão "Enriquecer e iniciar cadência" (por linha ou dos filtrados, até 50 por clique) grava só `status: "pedido"` e `pedidoEm` em `base/{id}`. Este passo monta os leads completos. Toda a lógica está em `tools/prospeccao/scripts/base_explee.py`; aqui só se lê e grava o banco.

Central: `https://claude.ai/artifact/91a7c2U3k1kV9PZYY7zvum`. Pasta de trabalho: `WS=/tmp/base/<YYYYMMDDHHMMSS>` (fora do repositório; dados pessoais).

## Passos
1. **Pedidos.** `ArtifactData query` em `base` com `query: {where: [["status", "==", "pedido"]], limit: 1000}` e `out_dir: $WS/db`. Sem nenhum: parar aqui, sem dizer nada além da resposta normal. Juntar os documentos num array `$WS/pedidos.json` (`[{id, data}]`) e guardar a `version` de cada um em `$WS/versoes_base.json`.
2. **Leads.** `ArtifactData list` em `leads` com `query.limit: 1000` (seguir `next_cursor` se vier) e `out_dir: $WS/db`. Juntar em `$WS/leads.json` (`[{id, ...}]`). Serve para não duplicar empresa e para continuar a numeração `B`.
3. **Processar.** `cd tools/prospeccao && python3 -m scripts.base_explee processar --pedidos $WS/pedidos.json --existentes $WS/leads.json --saida $WS/processar.json`. Se `dados/explee/base.json` existir, somar `--base dados/explee/base.json` (traz todas as pessoas da empresa, não só o decisor). A saída tem `novosLeads` (`[{id, data}]`, ids `B` depois do maior existente, com `enriquecimento: {status: "bruto", migradoSemEnriquecer: true, fila: true}`), `baseUpdates` (`[{id, data: {status: "na_cadencia", leadId, migradoEm}}]` para quem virou lead e `[{id, data: {status: "sem_cadencia", motivo}}]` para cada pulado) e `pulados` (sem domínio, segmento sem cadência ou copy reprovada, só para o resumo).
4. **Gravar os leads.** `ArtifactData batch` com `op: "set"`, `collection: "leads"`, um documento por entrada de `novosLeads` (sem `if_version`: são novos), até 50 por batch e no máximo 1 MiB por batch (um lead tem até ~18 KB; use `file_path` com um JSON por lead). Se um id `B` já existir (alguém criou no meio do caminho), reler os leads e rodar o passo 3 de novo.
5. **Atualizar a base.** Só depois que o lead foi gravado: `ArtifactData batch` com `op: "update"`, `collection: "base"`, os dados de `baseUpdates` e o `if_version` lido no passo 1. Isso inclui as atualizações `sem_cadencia` dos pulados, para nenhum pedido ficar "pedido" para sempre (a página mostra "Sem cadência: <motivo>" na aba própria). Conflito (a Letícia mexeu no documento): reler aquele documento e, se ainda estiver `pedido`, gravar de novo; se não, deixar como está.
6. **Responder.** Resumo curto no chat: quantos leads entraram (ids e empresas), quantos já estavam na central, quantos pulados e por quê, e que eles estão na aba **Sem contato** do Aquecimento até o celular aparecer. Lembrar que o próximo "Enriquecer base" (ou `/enriquecer-leads`) busca esses primeiro (`enriquecimento.fila`), e que quando o celular aparecer ela usa **Usar na cadência** na própria linha de Sem contato para mandar o lead para Para hoje. Por fim, `rm -rf $WS`.

## Regras
- Nunca gravar `contatoAtivo`, `etapa` ou `enviadoN` em lead existente; este passo só cria leads novos.
- Nunca mudar `status` de documento da base que não esteja `pedido`. `sem_cadencia` é terminal: para tentar de novo (copy corrigida, segmento novo), voltar o documento para `status: "base"` à mão.
- Não rodar o enriquecimento aqui: ele só começa quando a Letícia clica em "Enriquecer base" ou pede `/enriquecer-leads`.
