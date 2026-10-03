---
target: tools/prospeccao/central/index.html
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-10-02T08-28-27Z
slug: tools-prospeccao-central-index-html
---
# Critique: Central de disparo (`tools/prospeccao/central/index.html`)

Score **30/40 (Good)**, up from 28. The ≥30 goal is met, but only just: every heuristic scores 3 and none reaches 4. Method: Assessment A came first (all four source files, PRODUCT.md, and screenshots at 1440/1100/900/390 in light and dark, with the detail open, plus Pós-venda, Leads, the shortcut list, the send toast and the failed-save toast). Assessment B followed: the CLI detector, then the browser detector injected into the harness page. No server was started. `context.mjs` does not find `tools/prospeccao/PRODUCT.md`, so that file was read directly (register: product). Note: the harness blocks Google Fonts, so text measurements use the fallback sans, not DM Sans.

## Fixes confirmed from the previous round
- Toast "Desfazer" now uses `--toast-acao` (#E0C27F on navy ≈ 8.9:1; in dark, #6E5726 on #F0EBE1). It passes.
- A failed save leaves a pinned toast, "A conversa abriu, mas o toque 3 não foi marcado. Marcar como enviado · Fechar". It was still there 3 s later and does not reopen the link. It passes.
- The row "Enviar" is outlined, and only the selected row's button is filled, so the queue no longer reads as a column of primary buttons. It passes.
- "Meta de toques: 0 de 20 · 4 leads para hoje" appears outside Aquecimento. Phones show as "+55 (65) 90000-0007". It passes.
- After a send, focus moves to the next row (`linha R0007`), and the toast offers Desfazer. The `c`/Enter repeat guard and the Enter-inside-detail guard are in place (app.js:833, 851). It passes.
- "Atalhos: ?" shows at ≥1280. At 1024–1279 it is still hidden (see P3).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Ao vivo", the meta bar, toasts and a pinned failure toast are present. Saving only disables buttons and shows no visible "salvando" state |
| 2 | Match System / Real World | 3 | The task language (toque, cadência, esteira) is fluent. "Faixa" and "Contato de setor" need context |
| 3 | User Control and Freedom | 3 | Desfazer in the toast and in the history, Esc, Voltar and a confirmed "Pediu para sair" are all there. "Fechou negócio" cannot be reverted from the UI |
| 4 | Consistency and Standards | 3 | One button vocabulary. The PV date input runs full width while the message is capped. Leads detail mixes the cadence send block into the research view |
| 5 | Error Prevention | 3 | The Enter/c guards and the sair confirmation work. A lead's alert ("Telefone sem confirmação") sits below the fold, about 740px under the Enviar it concerns |
| 6 | Recognition Rather Than Recall | 3 | The dots have spoken labels, the tabs show counts and the shortcut list is one key away. The hint is missing at 1024–1279 |
| 7 | Flexibility and Efficiency | 3 | j/k/Enter/c/r/1-3// and one-click send then advance. No batch actions (expected for this flow) |
| 8 | Aesthetic and Minimalist Design | 3 | Desktop is calm. The rail repeats the "para hoje" count 4 times. On a 390 phone the first lead starts at 452px of 844 |
| 9 | Error Recovery | 3 | Plain, actionable messages and a persistent retry. Form errors are not announced and not tied to the field |
| 10 | Help and Documentation | 3 | Empty states teach, `.dica` blocks guide PV dates, and there is a shortcut dialog. No hint where the notebook keyboard is used below 1280 |
| **Total** | | **30/40** | **Good** |

## Anti-Patterns Verdict
**LLM assessment:** It does not read as AI-made. It reads as a ledger: one navy/gold system, data in mono, one primary button per view, no gradients, glass or hero cards. Two remaining tells are mild. The rail's uppercase, tracked mono metric labels ("PARA HOJE", "GRAVAÇÕES EM 7 DIAS" wrapping to 2 lines) are a small dashboard-scorecard reflex. The warm off-white `--creme`/`--pergaminho` palette sits in the saturated band, but it belongs to the Reiners identity, so identity preservation applies.

**Deterministic scan:** the CLI `detect.mjs --json` on `index.html` and on the `central/` folder returned 0 findings (exit 0). The browser detector ran on 7 views: 1440 light/dark, PV, Leads, 1100, and 390 with the detail open in light/dark.
| Rule | Where | Verdict |
|---|---|---|
| `line-length` (~87 chars/line) | `p.msg` in the detail, 1440/1100/PV | Real. `max-width: 68ch` (estilo.css:174) still measures about 87 prose characters, because `ch` is the width of the "0" glyph |
| `text-overflow` (16px) | `.linha.teste .sub` at 390 | False positive. It is deliberate ellipsis truncation |
| `flat-type-hierarchy` (12–20px, 1.7:1) | body | Mostly accepted for the product register (a tight 1.125–1.2 scale is intended). The 11/18px sizes are not in the project CSS |
| `cream-palette` | body #FAF7F2 | Advisory. This is the brand's committed palette |
| `gradient-text`, `theater-slop-phrase` | body | False positives. The detector matched its own inlined source, and neither string exists in the project |

The detector missed what A found: the buried alert, the dark placeholder contrast, the mobile chrome height and the silent form errors. No user-visible overlay tab exists, because injection ran in headless Playwright (preflight mutation OK).

## Overall Impression
The fix round worked: both P1s are gone, and the send loop (Enviar → toast with Desfazer → next lead focused → pinned retry on failure) is now trustworthy. What keeps it at 30 rather than 33+ is in the periphery: risk information sits away from the send action, the phone layout spends half the screen before the first lead, and accessibility details (placeholder in dark mode, form errors) do not yet meet the PRODUCT.md AA bar.

## What's Working
- **The send loop.** One filled Enviar per view, an 8 s Desfazer, history undo, a pinned retry that never reopens the link, and the selection advancing to the next lead due today. Trust what was sent is fully delivered.
- **Density with hierarchy at 1440.** The three columns have their own scroll. The row shows name, sub-line, cadence dots and when the next touch is due, and the detail leads with the message, recipient and action before the research.
- **Keyboard and focus.** The roving tablist, the focus trap in the drawer, focus returning to the source row, shortcuts that are off inside fields, and the repeat guard on Enter/c.

## Priority Issues
**[P2] A lead's alert is far from the button it should stop.** On R0007 the detail header shows only "Alerta no perfil". The text ("Telefone sem confirmação · Google Maps") is the last block of Perfil (app.js:994-1002), at y≈985 against Enviar at y≈247 in a 900px viewport.
- Why: the alert exists precisely to change what she sends. Out of view, it gets ignored at the moment it matters.
- Fix: in `cardLead` (app.js:482-489), render `l.alertas` as `.aviso` lines inside `.toque-atual`, right after the "Para:" line and before `.acoes`. Make the header chip (app.js:451) an anchor to that block. Keep the Perfil copy.
- Command: /impeccable clarify

**[P2] The phone spends 452px of 844 before the first lead.** It stacks the header, three funnels, the meta line, 7 pill tabs wrapping to 3 rows, and a full-width Filtros button (index.html:39-58, estilo.css:113-117).
- Why: on the phone she has "between meetings" time to send one pending touch. Two scrolls before the first row cost exactly that.
- Fix: below 760px, make `.abas` a single scrolling row (`flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x`) with Filtros as the last item of that row. Alternatively, show Para hoje / Aguardando / Todos and move the rest into the Filtros panel. Target: first lead above y≈260.
- Command: /impeccable adapt

**[P2] The placeholder fails AA in dark mode.** The browser default #757575 on `--papel` #16223A is about 3.4:1 in search and in every form field. PRODUCT.md requires AA "including labels and placeholders".
- Fix: add `input::placeholder, textarea::placeholder { color: var(--suave); opacity: 1; }` next to estilo.css:125-126/328. That gives about 7:1 in light and about 8:1 in dark.
- Command: /impeccable audit

**[P2] Form validation errors are silent for screen readers and detached from the field.** `erro` is a plain `<p hidden>` (app.js:906/913 for a new contact, app.js:1412/1421 for a new client). Nothing is announced, and focus stays on "Salvar".
- Fix: give `.erro` `role="alert"`. On failure, set `aria-invalid="true"` and `aria-describedby` on the offending field and focus it, e.g. the telephone field for the DDD message.
- Command: /impeccable harden

## Persona Red Flags
**Alex (power user, Letícia at the notebook):** at 1024–1279 (the top-bar layout, likely on a 1280 notebook with a browser sidebar or zoom), the "Atalhos: ?" hint is hidden (estilo.css:265 is only shown at :387). j/k/Enter work, but nothing tells her they exist. "Fechou negócio" has no way back from the UI after a misclick.

**Sam (keyboard / screen reader):** form errors are not announced (above). The dark placeholders are 3.4:1. On the plus side, the dots have `role="img"` with full speech, the drawer is a real dialog with a trap and focus return, and the tabs are a proper tablist.

**Casey (Letícia on the phone, outdoors):** the first lead is at 452px. In the full-screen detail, "Voltar" is top-left and Enviar is mid-screen at about y=305, which is acceptable. The ellipsis on the row sub-line cuts "Clínica · Jardim das Amé…", so the neighbourhood is lost on every row.

## Minor Observations
- [P3] The message measure is about 87 characters per line. Change estilo.css:174 `max-width: 68ch` to about `58ch`, or use `max-width: 36em`.
- [P3] The "para hoje" count appears 4 times in the ≥1024 rail: funnel badge, placar "Para hoje", meta line and the "Para hoje" tab. Drop "· 4 para hoje" from `desenharMeta` (app.js:1512/1514) when the placar is visible.
- [P3] The placar labels are uppercase, tracked mono and wrap in the 240px rail (estilo.css:98). Use sentence case 12px sans and no tracking.
- [P3] In the Leads table at 1440, "Clínica Modelo\n1" wraps. Add `white-space: nowrap` to `.tabela tbody th.nome` (estilo.css:303), or let the Lidera column wrap instead.
- [P3] The "Alerta no perfil" chip touches "Clínica" in the detail meta. Add `margin-left: 6px` to `.meta .chip` (estilo.css:165).
- [P3] The search placeholder is cut ("Empresa, pessoa, CNPJ o") in the 240px rail. Shorten it to "Empresa, pessoa ou CNPJ" (index.html:44).
- [P3] The PV date input spans the full width (about 750px) while the message is capped. Give it `max-width: 280px`.

## Questions to Consider
- Should an alert stop the send (a one-time "Enviar mesmo assim") or only sit next to it?
- On the phone, does she ever need more than "Para hoje" and search? If not, the other six tabs belong in Filtros.
- With the meta line sticky on mobile and the placar on desktop, is the placar needed at all, or could the rail lead with the queue?
