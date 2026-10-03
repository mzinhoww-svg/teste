---
target: central de disparo
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-10-02T04-57-41Z
slug: tools-prospeccao-central-index-html
---
# Critique: central de disparo (tools/prospeccao/central/index.html)

Score 24/40 (Acceptable). Heuristics: status 3, real world 3, control 2, consistency 2, error prevention 2, recognition 3, flexibility 1, minimalism 2, recovery 3, help 3.

Anti-patterns: mostly not slop (navy/gold ledger identity, concrete copy). Tells: stock DM Sans/DM Mono/Cormorant trio, letter-spaced 10.5px mono caps on almost every label, pill chips for everything, 4-number placar strip. Detector CLI clean; live overlay flagged cream-palette (#FAF7F2, deliberate brand token, light mode only).

Priority issues:
- [P1] 740px column wastes notebook (49% empty at 1440px); inline profile ~1700px pushes the queue away. Fix: rail + queue + detail pane at >=1280, list+detail 1024-1279, drawer 760-1023, sheet <760. (layout, adapt)
- [P1] 5-8 equal-weight buttons per card; outcome actions mixed with send; e-mail send split in 4 buttons; WhatsApp click silently marks sent. Fix: primary + Copiar; Resultado control; Desfazer in toast. (distill, clarify)
- [P1] render() rebuilds #lista on every write; aria-live on whole list; focus lost. Fix: drop aria-live on list, restore focus / patch card. (harden)
- [P2] 10.5-12px labels, opacity .62 faded cards (~2.9:1), input borders 1.39:1 (fails 1.4.11). (typeset, audit)
- [P2] Sticky header ~240px of 844 on phone; goal metric underweighted, no "meta batida". (adapt, bolder, delight)

Measurements: no horizontal overflow; 48/50 tap targets <44px at 390px (summary rows 20px tall); smallest font 10.5px (27 elements).

Personas: Alex - no j/k, no next-lead, no bulk, search only in Leads. Sam - focus loss, color-only trilho state, faded cards. Letícia (20 touches/day) - scroll/expand/click/re-render loop per touch; e-mail 3-4 clicks.

Minor: "veio da prospecção ()" when leadId empty; paused clients sort first in Todos; repeated serif frase on every card; Buscar misaligned 2px; alert chip uses neutral gold; Leads tab would scan better as a table.
