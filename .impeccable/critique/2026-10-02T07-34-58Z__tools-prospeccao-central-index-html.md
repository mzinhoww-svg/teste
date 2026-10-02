---
target: central de disparo
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-10-02T07-34-58Z
slug: tools-prospeccao-central-index-html
---
# Critique: central de disparo (tools/prospeccao/central/index.html)

Score **28/40 (Good)**, up from 24. The redesign goal was ≥30, so it falls 2 points short. The method followed the reference: Assessment A (source read plus screenshots at 1440/1100/900/390, light and dark, with the detail open), recorded before Assessment B (detector CLI plus the browser detector injected into the harness page). The context script reported NO_PRODUCT_MD because it does not look in `tools/prospeccao/PRODUCT.md`, so that file was read directly (register: product).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Ao vivo", real goal bar, aria-current row, 8 s toast. Writes show no saving state, and the failure toast lasts 2.4 s |
| 2 | Match System / Real World | 3 | Plain Portuguese domain copy (toque, cadência, etapa). Internal IDs leak ("R0004 · Clínica", "veio da prospecção (R0001)") |
| 3 | User Control and Freedom | 3 | Undo in toast and in history, inline "Confirmar saída", Esc and Voltar. Respondeu, Pausar and Concluir etapa have no inline undo |
| 4 | Consistency and Standards | 3 | One button vocabulary. The rail shows the Aquecimento goal ("0 de 20 · 4 para hoje") inside Pós-venda next to "2 Para hoje" |
| 5 | Error Prevention | 2 | When a write fails, the WhatsApp or e-mail link still opens and the toast says "Tente de novo", which invites a double send. Row Enviar sends a message the user never saw |
| 6 | Recognition Rather Than Recall | 3 | Labels and counts everywhere. The three-dot touch indicator has no visible legend (screen-reader label only) |
| 7 | Flexibility and Efficiency | 3 | j/k/Enter/c///1-3/r/Esc/?, search across all three funnels, sortable Leads table, Enter-to-send with auto-advance |
| 8 | Aesthetic and Minimalist Design | 3 | The 1100 px layout is clean. The 1440 rail repeats "para hoje" four times; six filled primary buttons on screen |
| 9 | Error Recovery | 3 | Form errors are specific ("precisa ter DDD, como (65) 99999-0000"), drafts survive, DB-loss banner says what still works. The send-failure message is wrong (see 5) |
| 10 | Help and Documentation | 2 | Good teaching empty states and photo steps. The shortcut list exists but nothing on screen reveals it (only "?") |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop. It reads as a working ledger: restrained navy and gold, one sans plus mono for numbers, no gradients, no glass, no side stripes, selection shown by fill plus full border. Remaining tells:
- The 2×2 "placar" (24 px mono numbers over 12 px uppercase tracked mono labels, estilo.css:91-94) is the hero-metric echo, and it contradicts the spec's "caixa alta só na meta".
- The rail's seven bordered status buttons read as a stack of form controls rather than a nav list.
- The cream body (#FAF7F2) is a legacy brand token.

**Deterministic scan:**
- CLI on `index.html`: 0 findings (the markup is JS-generated).
- CLI on the folder: 1 finding, `layout-transition` at estilo.css:98 (`transition: width` on `::-webkit-progress-value`). Real but low-impact.

**Browser detector** (injected into the harness page at 1440 light/dark, Pós-venda, Leads and 390 with detail; preflight mutation OK; no server):

| Finding | Where | Verdict |
|---|---|---|
| `line-length` | `.msg`, about 107 ch/line in the 1440 detail | Real. Missed in A |
| `cream-palette` | #FAF7F2 body, light only | Real, but a deliberate legacy brand token |
| `flat-type-hierarchy` | 12–20 px scale | False positive for the product register, which prescribes a tight fixed scale |
| `text-overflow` | `span.sub` at 390 | False positive: intentional ellipsis |
| `tight-leading` | `label.campo` at 1.2 | Minor: single-line 12 px labels |
| `gradient-text`, `theater-slop-phrase` | BODY | False positives: the detector matched its own inlined source. Neither string exists in the project |

The detector did not catch the toast contrast failure or the double-send path, both found in A. No user-visible overlay tab exists: injection ran in headless Playwright.

## Overall Impression

A real step up. Every P1 from 24/40 is gone:
- The notebook width is used.
- Send is one click with Desfazer.
- Rows reconcile in place, keeping focus.
- Type is ≥12 px, field borders are 3:1, and touch targets are 44 px on phone.

What holds it below 30 is the safety net of the core action. The undo link is unreadable in dark mode, and a failed save tells Letícia to repeat a send she probably already made. The biggest opportunity is to make the send/undo/failure loop airtight, then quiet the rail.

## What's Working

- **The detail's top block is the task.** Message, recipient, Enviar and Copiar, then Resultado, then tabs. It answers "what do I send now" before any background, matching the first design principle exactly.
- **Responsive structure is real, not fluid.** The 3-column layout at ≥1280, top bar at 1024–1279, drawer with véu, inert and focus return at 760–1023, and full-screen with Voltar under 760. There is no horizontal scroll at any width (scrollWidth equals the viewport at 1440/1100/900/390).
- **Keyboard and accessibility plumbing.**
  - Roving tabs with arrow, Home and End.
  - Sortable table with aria-sort.
  - Focus trap in the drawer.
  - Only `#toast` is live.
  - Gold focus ring at 3.74:1 (light) and 7.35:1 (dark).
  - Inline confirmation for "Pediu para sair".

## Priority Issues

**[P1] The undo link in the toast fails contrast, worst in dark mode.**
- **What:** `#toast .desfazer { color: var(--ouro) }` (estilo.css:263) sits on `background: var(--navy)` (estilo.css:261). The toast inverts per theme, but the link color does not. Measured contrast is 2.06:1 in dark (#C4A15A on #F0EBE1) and 3.89:1 in light. 14 px/600 needs 4.5:1.
- **Why it matters:** "Desfazer" is the safety net behind one-click send, and it lives for only 8 s.
- **Fix:** add a token `--toast-acao: #E0C27F` in `:root` (9.0:1 on navy) and `--toast-acao: #6E5726` in both dark blocks (5.8:1 on #F0EBE1), then use `color: var(--toast-acao)`.
- **Command:** /impeccable audit

**[P1] A failed save after Enviar invites a double send.**
- **What:** Enviar is an `<a href=wa.me|mailto target=_blank>` (app.js:411-412, 518-520). `enviar()` (app.js:151-163) writes after the link has already opened. On failure, `falhou()` shows the generic "Não foi possível salvar. Tente de novo em instantes." (app.js:122) for 2.4 s (app.js:72). The conversation is open and the message is probably sent, but nothing is recorded. "Tente de novo" means clicking Enviar again, which re-opens WhatsApp.
- **Fix:** give `enviar` its own failure branch. Show a persistent toast (no timeout): "A conversa abriu, mas o toque N não foi marcado." Add a "Marcar como enviado" button that calls only `gravar(...)` with the same `dados` and never re-opens the link. Keep the selection on the lead. Use the same pattern in `marcarPV` (app.js:1108-1114).
- **Command:** /impeccable harden

**[P2] The rail repeats itself and mixes funnels.**
- **What:** At ≥1024 the same "para hoje" count appears four times: funnel badge (app.js:1469), placar (index.html:25, app.js:449), status tab, and meta text (app.js:1427). In Pós-venda the placar says "2 Para hoje" while the meta line beneath says "0 de 20 toques · 4 para hoje" (Aquecimento numbers).
- **Fix:**
  - Drop the "Para hoje" placar cell and the uppercase tracked labels (estilo.css:94; use 13 px sans, sentence case).
  - Label the goal block "Meta de toques (Aquecimento)" or hide it outside Aquecimento.
  - Render the seven status filters as a quiet list (no per-item border, selected row filled) rather than seven bordered buttons (estilo.css:111, 382-383).
- **Commands:** /impeccable distill, /impeccable quieter

**[P2] Hidden shortcuts and diluted primary buttons.**
- **What:** The shortcut panel (index.html:67) opens only with "?" (app.js:760), and nothing on screen tells you it exists. Every queue row also carries a filled Enviar, so 1440 shows six identical dark primaries. A row's Enviar fires a message the user hasn't read in the detail.
- **Fix:**
  - Add a small "Atalhos ?" text button in the rail footer and top bar.
  - Make row Enviar a secondary (outlined) button, or show it only on the selected row and on hover/focus. Keep the filled primary in the detail only.
- **Commands:** /impeccable onboard, /impeccable distill

**[P2] The message preview runs to about 107 characters per line (detector).**
- **What:** `.toque-atual .msg` (estilo.css:175) spans the whole detail column at 1440.
- **Fix:** add `max-width: 68ch` to `.toque-atual .msg` and `.toques .msg`. It also previews the message closer to how it renders in WhatsApp.
- **Command:** /impeccable typeset

## Persona Red Flags

**Alex (power user):**
- The shortcuts are good but undiscoverable.
- Enter on a focused row sends at ≥1024 but opens the detail below 1024. The same key does different things by width.
- Respondeu, Pausar and Concluir etapa have no toast undo, unlike Enviar.
- No bulk actions (out of scope by spec).

**Sam (screen reader / keyboard):**
- The Desfazer link is 2.06:1 in dark mode.
- Undo is a time-limited action (8 s) inside a role=status region, mitigated only by the history "Desfazer".
- The dot indicator is role=img with a good label (fine).
- The tab order starts with funnels, then 7 status buttons, then filters before reaching the queue. There is no skip link to the queue or detail.

**Casey (phone between meetings):**
- At 390 the 7 status pills wrap into 3 rows. The first lead starts at y≈367 of 844, and "Filtros" adds another full-width row.
- Voltar sits top-left, out of thumb reach (standard, acceptable).
- Enlarged Desfazer target below 760 (good).

## Minor Observations

- Contact phones are unformatted (+5565911110004) at app.js:802. The spec asks for +55 (65) 99999-1111; `Regras.telefoneFormatado` exists.
- Pós-venda step list: the current step shows "agora · depois que o kickoff estiver marcado" even when the kickoff date is set (app.js:1215-1217; prefer "kickoff dd/mm hh:mm").
- The Leads table at 1440 wraps company names ("Clínica Modelo / 1") because the detail takes 420 px. Give the name column `white-space: nowrap` with a min-width, or narrow the detail on Leads.
- `transition: width` on the progress value (estilo.css:98). Harmless, but drop it or use transform.
- "Salvar foto" spans the full figcaption width and outweighs Copiar; size it to content.
- The Pós-venda client tab shows "veio da prospecção (R0001)", an ID with no meaning to Letícia. Show the lead's name.

## Questions to Consider

- Does the queue need an Enviar on every row, or is "select, read, Enter" the real flow, with row buttons as noise?
- What if the rail showed one number (the goal) and the status list carried the rest?
- Should a failed write block the link from opening at all (write first, then `window.open`)?
