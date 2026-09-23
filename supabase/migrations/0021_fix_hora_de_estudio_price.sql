-- ==========================================================================
-- Migration 0021 — corrige preço e destaca as 2h do plano "Hora de Estúdio"
-- ==========================================================================
-- O seed da 0016 registrou o pacote como R$ 890 "/hora" avulsa. O preço
-- correto é R$ 1.390 por um pacote de 2 horas de gravação — e essas 2 horas
-- são um diferencial do pacote, por isso entram em negrito na descrição
-- (mesmo parser `**negrito**` do fecho de serviço, ver
-- components/site/emphasized.tsx) e como primeiro item da lista de features.
--
-- UPDATE, não INSERT condicional: ao contrário da 0016 (que só semeia uma
-- tabela vazia), aqui o objetivo é corrigir uma linha que já existe. Se o
-- plano já foi renomeado via CMS, o WHERE não casa e a migration não faz
-- nada — comportamento seguro, nunca atualiza a linha errada.
-- ==========================================================================

update public.site_plans
set
  price = 'R$ 1.390',
  period = '/2h',
  description = 'Para quem já tem pauta e equipe: **2 horas de gravação** inclusas, com toda a estrutura do nosso estúdio.',
  features = '["2 horas de gravação incluídas","Estúdio com tratamento acústico","Até 3 câmeras 4K","Operador de áudio incluso","Arquivos brutos no mesmo dia"]'::jsonb,
  updated_at = now()
where name = 'Hora de Estúdio';
