-- ==========================================================================
-- Migration 0022 — preço da "Hora de Estúdio" (R$ 1.350) e descrição do BTS
-- ==========================================================================
-- 1) "Hora de Estúdio": o preço passa de R$ 1.390 para R$ 1.350. Período
--    (/2h), descrição (com as "2 horas de gravação" em negrito) e lista de
--    itens continuam como na 0021 — só o preço muda.
--
-- 2) "BTS Recorrente": a descrição passa a explicar a sigla (Build to Suit,
--    o produto sob medida da Reiners) em negrito. Preço e lista de itens não
--    mudam. Texto anterior, para reverter se preciso:
--      'Presença institucional contínua: pauta, gravação e distribuição todo mês.'
--
-- UPDATE por nome, como na 0021: se o plano foi renomeado via CMS, o WHERE
-- não casa e a migration não faz nada (nunca atualiza a linha errada).
-- ==========================================================================

update public.site_plans
set
  price = 'R$ 1.350',
  updated_at = now()
where name = 'Hora de Estúdio';

update public.site_plans
set
  description = '**Build to Suit (BTS):** presença institucional contínua, desenhada sob medida para a sua marca — pauta, gravação e distribuição todo mês.',
  updated_at = now()
where name = 'BTS Recorrente';
