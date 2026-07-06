# Plano de refinamento de design — CRM AI Studio

> Elaborado com apoio de 3 skills instaladas neste ambiente: **`ui-ux-pro-max`**
> (161 paletas WCAG-corrigidas, 99 guidelines de UX, 57 pares tipográficos),
> **`transitions-dev`** (21 microinterações portáveis com guarda de
> `prefers-reduced-motion`) e **`impeccable`** (45 detectores determinísticos +
> anti-padrões de "AI slop"). O plano cobre **landing → área logada (`/app*`) →
> admin da plataforma (`/admin*`)** e prioriza os erros reais reportados:
> **contraste, aplicação de cores e o tema por-tenant no modo escuro.**

---

## 0. TL;DR — diagnóstico em uma frase

O tema por-tenant está **meio-aplicado**: `TenantThemeVars` remapeia só ~6 classes
de ação para navy/dourado, enquanto **todo o resto da escala `brand-*` continua
índigo**. Resultado visível: botões navy ao lado de chips índigo, *hover* virando
dourado ilegível (branco sobre `#C9A227` ≈ **1.9:1**, reprova AA), e no modo
escuro texto navy sobre fundo quase-preto. A correção estrutural é **uma única**:
tornar a escala `brand` inteira (50→900) e as superfícies dark **dirigidas por
tokens CSS**, com uma rampa navy/dourado WCAG-correta por tenant.

---

## 1. Causa-raiz (com evidência no código)

### 1.1 A escala `brand` é índigo fixa; o tenant só troca 6 classes

`tailwind.config.ts` define `brand` como um ramp **índigo** (`600 #4f46e5`,
`700 #4338ca`, `50 #eef2ff` …). Todos os componentes assumem esse ramp:
`bg-brand-600 text-white`, `text-brand-700`, `bg-brand-50`, `bg-brand-400`
(barra de engajamento), `ring-brand-200` (drag-over), `dark:text-brand-300`.

`app/globals.css` (bloco *Tema por tenant*, Fase M) só remapeia, sob
`[data-tenant-themed]`:

| Classe remapeada | Vira | Problema |
|---|---|---|
| `.bg-brand-600` | `--tenant-primary` (navy) | OK isolado |
| `.hover:bg-brand-700` | **`--tenant-accent` (dourado #C9A227)** | ❌ branco sobre dourado ≈ 1.9:1 — todo *hover* de botão primário fica ilegível |
| `.text-brand-600/700` | navy | OK no claro; some no escuro |
| `.border-brand-600`, `.ring-brand-400`, `.accent-brand-600` | navy/dourado | parcial |

**Não remapeadas** (continuam índigo mesmo no tenant navy):
`bg-brand-50` (chips de score, chip de agente, drag-over), `bg-brand-400`
(barra `Board.tsx:67`), `text-brand-300`, `border-brand-200/300`,
`bg-brand-950`, `bg-brand-50 text-brand-700` (Board.tsx:65,77;
CreateLeadSheet.tsx:174-175). → **dois azuis de marca na mesma tela** (navy +
índigo). É o "erro de aplicação das cores" dos screenshots.

### 1.2 Dourado usado como *fundo de ação* — reprova contraste

`--tenant-accent = #C9A227` é aplicado como `background` no *hover* e como cor de
foco. Dourado é uma cor de **realce pequeno** (barra superior, ícone, sublinhado),
nunca superfície sob texto branco. A base `ui-ux-pro-max` confirma: nas paletas
institucionais (Legal/Banking, linhas 40/42 de `colors.csv`) o dourado é
**`#B45309`/`#A16207`** (ajustado para WCAG ≥3:1), não `#C9A227`.

### 1.3 Modo escuro é um *remap* frágil de `!important`, não tokens

`.dark .bg-white{…!important}` etc. cobrem só neutros slate. Componentes
adicionam `dark:` à mão de forma inconsistente (`CreateLeadSheet` mistura
`dark:bg-brand-950/30` índigo com painéis âmbar/rosa). Quando **tenant + dark**
coexistem: `bg-brand-600`→navy `#0B2A4A` sobre `.dark body` slate-950 `#020617`
= separação de superfície ≈ 1.3:1 (botão "desaparece" no fundo). É o que o
screenshot do "Novo lead" mostra.

### 1.4 Sinais de "AI slop" / impeccable a corrigir

- **Cinza sobre cor**: `text-slate-400` sobre painéis coloridos e chips
  `bg-brand-50` (Board.tsx:53 nome da empresa; sidebar de enriquecimento) —
  reprova impeccable "no gray text on colored backgrounds".
- **Aninhamento de cards**: sidebar "Leitura do CRM" aninha painéis dentro de
  painéis (CreateLeadSheet 174-197) — impeccable "don't nest cards".
- **Fonte**: Geist Sans é boa, mas para marca institucional a base sugere par
  com display (autoridade). Baixa prioridade.
- **Gradiente índigo/roxo** no hero da landing pode ler como *template default* —
  re-tintar para navy institucional.

---

## 2. Solução estrutural — tokens de marca dirigidos por tenant

Trocar o "remap de 6 classes" por **escala `brand` inteira em variáveis CSS**,
mais **superfícies semânticas** para dark. Um tenant passa a re-tintar **tudo**,
coerentemente, sem tocar em componente.

### 2.1 `brand` vira variável (Tailwind → CSS vars)

```ts
// tailwind.config.ts — brand passa a referenciar vars com fallback índigo
brand: {
  50:  "var(--brand-50, #eef2ff)",
  100: "var(--brand-100, #e0e7ff)",
  200: "var(--brand-200, #c7d2fe)",
  300: "var(--brand-300, #a5b4fc)",
  400: "var(--brand-400, #818cf8)",
  500: "var(--brand-500, #6366f1)",
  600: "var(--brand-600, #4f46e5)",
  700: "var(--brand-700, #4338ca)",
  800: "var(--brand-800, #3730a3)",
  900: "var(--brand-900, #312e81)",
  950: "var(--brand-950, #1e1b4b)",
},
accent: { DEFAULT: "var(--accent, #4f46e5)", fg: "var(--accent-fg, #ffffff)" },
```

Sem tenant, os *fallbacks* mantêm o índigo atual → **zero regressão** para orgs
sem marca. Isso elimina os blocos `[data-tenant-themed] .bg-brand-*` do
`globals.css` (ficam obsoletos).

### 2.2 `TenantThemeVars` injeta a **rampa inteira**, não 2 cores

Hoje injeta `--tenant-primary/--tenant-accent`. Passa a receber a rampa completa
já calculada no servidor (determinística — sem `Math.random`, compatível com
SSR) e setar `--brand-50…--brand-950 + --accent + --accent-fg`.

- Geração da rampa: função `lib/brand-ramp.ts` que, a partir de `brand.primary`,
  deriva 50→950 por mistura com branco/preto em espaço perceptual (OKLCH), com
  o passo **600 = primary** e **700/800 = hovers mais escuros** (nunca dourado).
- `accent` (dourado) fica **separado da rampa**: usado só em realces
  (barra superior do `Nav`, sublinhados, ícones), com `--accent-fg` calculado
  para contraste (texto escuro sobre dourado).

### 2.3 Superfícies semânticas para dark (fim do remap `!important`)

Introduzir tokens de superfície e migrar os componentes-chave para eles:

```css
:root {
  --surface:      #ffffff;  --surface-2: #f8fafc;  --surface-3: #f1f5f9;
  --text:         #1e293b;  --text-muted: #64748b;  --border: #e2e8f0;
}
.dark {
  --surface:      #0f172a;  --surface-2: #020617;  --surface-3: #1e293b;
  --text:         #e2e8f0;  --text-muted: #94a3b8;  --border: #293548;
}
```

Classes utilitárias `bg-surface`, `text-body`, `text-muted`, `border-default`
substituem `bg-white dark:bg-slate-900` repetido. Reduz drift e garante
contraste ≥ 4.5:1 em ambos os modos por construção.

---

## 3. Paleta institucional Reiners — corrigida por evidência

Fonte: `ui-ux-pro-max/data/colors.csv`, linhas **40 (Legal — autoridade navy +
ouro de confiança)** e **42 (Banking — navy + ouro premium, ajustado WCAG)**.

| Token | Antes | **Depois (WCAG-safe)** | Uso |
|---|---|---|---|
| `brand-600` (primary) | `#0B2A4A` | `#0F2A4A` (mantém navy) | botões, links, chip ativo |
| `brand-700` (hover) | dourado ❌ | `#0A1F38` (navy mais escuro) | hover de ação |
| `accent` (dourado) | `#C9A227` ❌ | `#A16207` | barra topo, realce, ícone |
| `accent-fg` | branco ❌ | `#1E293B` | texto sobre dourado |
| `on-primary` | — | `#FFFFFF` (11:1 no navy) | texto no botão |

Regra de ouro que passa a valer: **dourado nunca é fundo de texto branco.**
É fio/realce. O navy carrega as ações; o dourado carrega a *identidade*.

`docs/tenant-design.md` será atualizado para descrever `brand.primary` +
`brand.accent` + a nota "accent só para realce" e o novo mecanismo de rampa.

---

## 4. Backlog priorizado (impeccable severity)

### P0 — Contraste e cor (bloqueadores, visíveis nos screenshots)
1. **Escala `brand` em vars + fallback índigo** (§2.1) — `tailwind.config.ts`.
2. **`lib/brand-ramp.ts` + `TenantThemeVars` injeta rampa completa** (§2.2).
3. **Corrigir accent dourado**: parar de usá-lo como `hover:bg`; aplicar
   `--accent-fg` (§1.2, §3). Remove o *hover* ilegível.
4. **Tokens de superfície dark** (§2.3) aplicados primeiro em `CreateLeadSheet`
   e `Board` (as duas telas do print), depois `DealDrawer`.
5. **Remover cinza sobre cor**: trocar `text-slate-400` sobre chips/painéis por
   `text-brand-700/…` ou `text-muted` legível (Board.tsx:53; sidebar).

### P1 — Consistência de componentes
6. `ui/button` `default` usa `bg-brand-600 hover:bg-brand-700` — com §2.1 já
   fica correto; auditar `outline/ghost` em dark (hoje `hover:bg-slate-50`).
7. Foco: `focus-visible:ring-brand-400` → garantir offset com `--surface` (não
   branco fixo) para não sumir no dark.
8. Chips/badges: unificar via `ui/badge` (variantes `brand/muted/success/warn`)
   em vez de `bg-brand-50 text-brand-700` solto em cada arquivo.
9. Desaninhar a sidebar "Leitura do CRM" (§1.4): seções com divisórias, não
   cards dentro de cards.

### P2 — Landing e admin
10. **Landing** (`app/page.tsx`): re-tintar hero para navy institucional
    (remover leitura de "template roxo"); garantir contraste do `KanbanPreview`;
    CTA `bg-brand-600` já herda o tenant se logado, mas a landing é pública →
    fixar navy institucional explícito.
11. **Admin** (`app/admin/*`): usa `bg-brand-600` nos CTAs e `bg-slate-50` de
    fundo — como admin **não** monta `Nav`/`TenantThemeVars`, fica no índigo
    padrão (correto e intencional). Auditar só contraste dos badges e do
    `HealthItem` (amber/emerald sobre branco — OK).

### P3 — Movimento e deleite (transitions-dev)
12. `DealDrawer`/painéis: **panel reveal** (07) e **tabs sliding** (16) para as
    abas Visão/Proposta/Contratos.
13. Kanban: **card resize** (01) suave no drag; **success check** (10) ao mover
    para "Fechado ganho".
14. `CreateLeadSheet`: **error state shake** (12) em validação; **skeleton
    reveal** (14) no carregamento do enriquecimento; **texts reveal** (18) no
    header. Todos já trazem guarda `prefers-reduced-motion`.
15. Notificações: **notification badge** (03) no sino (`NotificationBell`).

### P4 — Tipografia e marca (baixa)
16. Avaliar par tipográfico institucional (display + Inter/Geist) para autoridade
    — opcional, sem bloquear.

---

## 5. Sequência de execução (PRs pequenos e verificáveis)

| PR | Escopo | Arquivos-núcleo | Critério de aceite |
|---|---|---|---|
| **R1 — Fundação de tokens** | §2.1–2.3, `lib/brand-ramp.ts`, superfícies dark | `tailwind.config.ts`, `globals.css`, `TenantThemeVars.tsx`, `lib/brand-ramp.ts` | orgs sem marca **idênticas** (índigo); Reiners re-tinta tudo em navy; nenhum índigo residual |
| **R2 — Telas do print** | §4 P0#4-5, P1#8-9 | `CreateLeadSheet.tsx`, `Board.tsx` | contraste AA em claro **e** dark; sem cinza-sobre-cor; sem card aninhado |
| **R3 — Sistema de componentes** | §4 P1#6-7, drawer | `ui/button`, `ui/badge`, `DealDrawer.tsx` | foco visível nos 2 modos; badges unificados |
| **R4 — Landing + admin** | §4 P2 | `app/page.tsx`, `app/admin/*` | hero navy; landing pública AA; admin auditado |
| **R5 — Movimento** | §4 P3 | drawer, board, sheet, sino | microinterações 150–300ms, easing sem bounce, reduced-motion respeitado |

Cada PR fecha com o **checklist de verificação** (§6) rodado nas telas tocadas.

---

## 6. Definition of Done — checklist derivado das skills

**Acessibilidade (impeccable #36/#76 + ui-ux-pro-max P1)**
- [ ] Texto normal ≥ **4.5:1**; texto grande ≥ 3:1 — em **claro e escuro**.
- [ ] Nenhum `text-slate-400`/cinza sobre superfície colorida.
- [ ] Dourado (accent) nunca como fundo de texto branco; usa `--accent-fg`.
- [ ] Foco visível (ring 2px) em ambos os modos, offset via `--surface`.
- [ ] Informação nunca só por cor (ícone/rótulo junto).

**Cor e tema (causa-raiz)**
- [ ] Nenhuma classe `brand-*` fica índigo quando o tenant tem marca.
- [ ] Um único azul de marca por tela (sem navy + índigo juntos).
- [ ] Org sem marca = índigo padrão, pixel-idêntico ao atual.

**Layout / impeccable anti-slop**
- [ ] Sem cards aninhados dentro de cards.
- [ ] Sem gradiente roxo "de template" na landing.
- [ ] Alvos de toque ≥ 44×44px; espaçamento ≥ 8px.

**Movimento (transitions-dev + ui-ux-pro-max P7)**
- [ ] Durações 150–300ms; easing sem bounce/elastic.
- [ ] Todo componente animado respeita `prefers-reduced-motion`.

---

## 7. Skills instaladas (referência de uso contínuo)

Instaladas em `~/.claude/skills/`:

- **`ui-ux-pro-max`** — consultar paletas/tipografia/UX:
  `python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>"`.
  Base já usada aqui: `data/colors.csv` (linhas 40/42 → paleta Reiners).
- **`transitions-dev`** — 21 snippets `t-*` (`~/.claude/skills/transitions-dev/`),
  cada um com guarda `prefers-reduced-motion`. Usar em R5.
- **`impeccable`** — princípios obtidos do repositório (clone bloqueado pela
  política de egress deste ambiente; critérios extraídos via web e incorporados
  no checklist §6). 45 detectores + anti-padrões de "AI slop".

> Nota de ambiente: o clone de `github.com/pbakaus/impeccable` retornou **403**
> (política de egress da sessão). Os princípios foram capturados e já estão
> refletidos no checklist — quando a política permitir, clonar em
> `~/.claude/skills/impeccable` para rodar os detectores automáticos.
