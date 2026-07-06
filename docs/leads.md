# Leads — criação e edição

## Criação (Novo lead)

`components/leads/CreateLeadSheet.tsx` — um **Sheet** de intake comercial, com dois
modos:

- **Rápido**: nome, telefone, empresa, produto, título, valor, estágio.
- **Completo**: 4 seções — Identidade do contato, Oportunidade, Contexto comercial
  e Próxima ação — com progресso visual e helper text.

Sidebar de **enriquecimento/IA** (ao vivo, sem chamada externa):
- telefone normalizado para `wa.me`;
- produto sugerido (heurística por tipo de cliente/evento);
- **agente recomendado** para o momento (via `suggestAgentKind`);
- dados que ainda faltam para uma proposta;
- **duplicidade provável** (por telefone/e-mail/empresa/nome via `findLeadDuplicates`),
  com opção de abrir o lead existente ou criar mesmo assim.

Ações: **Criar e abrir lead**, **Criar e abrir WhatsApp**, **Criar sem abrir**.

### O que `createLead` faz (server action)
- Resolve o funil **dentro da org ativa** (nunca cai em outra org).
- Normaliza o telefone (BR), grava contato e deal, com os campos comerciais em
  `contacts.custom` / `deals.custom`.
- Registra a **timeline** (lead criado, origem, próxima ação, dados faltantes).
- Cria uma **notificação com agente sugerido** quando falta próxima ação ou a
  criação pede notificação.
- Retorna `dealId` — o board abre o drawer do lead recém-criado.

## Edição completa (depois de criado)

No `DealDrawer`, **Editar** abre um formulário que cobre tudo:
- título, valor, engajamento, **estágio**, **probabilidade**, temperatura,
  próxima ação (data), origem;
- **produto** (catálogo) e **produto de interesse** (Reiners);
- tags;
- **Contexto comercial** (expansível): dor, objetivo, objeção, decisor,
  orçamento, urgência, data de evento/gravação, local e **motivo de perda**.

Os campos comerciais vivem em `deals.custom` e são **mesclados** (não sobrescrevem
o que não foi tocado). `updateDealFull` valida `org_id` e garante que o estágio
pertence ao mesmo funil do deal.

O contato é editável na sua própria caixa (`updateContact`), com validação de
telefone para WhatsApp.

Toda edição relevante registra atividade na timeline. Exclusão de deal/contato
exige `ConfirmDialog` com o nome do registro e do tenant.
