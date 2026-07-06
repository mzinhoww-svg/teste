# Design por tenant (branding replicável)

Cada tenant pode ter identidade visual própria — a Reiners Media usa navy/dourado,
e qualquer outro tenant pode ter a sua. O tema é **dado**, não código: fica em
`orgs.settings` e é aplicado automaticamente pelo app.

## Onde fica a config

Em `orgs.settings` (JSON):

```jsonc
{
  "brand": {
    "primary": "#0B2A4A",   // cor primária (botões, links, chips de ação)
    "accent":  "#C9A227",   // hover / realces
    "logoUrl": "https://.../logo.png"
  },
  "design_system": {          // gerado/refinado por LLM para o PDF de proposta
    "primary": "#0B2A4A",
    "accent":  "#C9A227",
    "heading": "Reiners Media",
    "tagline": "Presença que posiciona",
    "tone":    "institucional"
  }
}
```

- **`brand`** tematiza o **app** (shell, botões, acentos) — ver abaixo.
- **`design_system`** tematiza o **PDF da proposta** (`lib/tenant-design.ts`),
  gerado por LLM na primeira vez e cacheado.

## Como o app aplica (replicável, sem tocar em componentes)

1. `getAuthContext` carrega `brand` do tenant ativo.
2. `components/TenantThemeVars` (no `Nav`) deriva a **escala de marca inteira**
   (`--brand-50` … `--brand-950`, em canais `R G B`) a partir de `brand.primary`
   via `lib/brand-ramp.ts` — rampa determinística em HSL, preservando a matiz e
   garantindo tints coloridos (não cinzas) e passos escuros distintos (hover
   visível). Injeta também `--accent`/`--accent-foreground` (realce + texto
   legível calculado por contraste). Pós-mount, sem mismatch de hidratação.
3. `tailwind.config.ts` define `brand-*` como `rgb(var(--brand-N) / <alpha-value>)`
   com **fallback índigo** — então cada classe `brand-*` (bg, text, border, ring,
   e os modificadores de opacidade como `bg-brand-950/40`) re-tinta sozinha, em
   claro **e** escuro.

Resultado: **qualquer tenant com `brand.primary` re-tematiza o app inteiro**,
sem alterar componentes. Sem `brand`, mantém o índigo padrão (os fallbacks).

### Accent (realce) — regra de contraste

`brand.accent` (ex.: dourado da Reiners) é **realce**, nunca fundo de texto
branco. O app publica `--accent-foreground` calculado por contraste (slate-800
sobre dourado claro, branco sobre cor escura). Botões/hover usam o navy da rampa
(`brand-600/700`), não o accent — por isso não há mais o "hover dourado ilegível".

## Adicionar um novo tenant com identidade

Basta gravar `settings.brand` (e opcionalmente `design_system`) na org:

```sql
update public.orgs
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb), '{brand}',
  '{"primary":"#0B2A4A","accent":"#C9A227"}'::jsonb, true)
where id = '<org_id>';
```

O app passa a usar essas cores no próximo carregamento — nenhuma alteração de
código é necessária. É o mesmo mecanismo da Reiners, replicável para os demais.

## Escopo

- O tema vale apenas na área logada (`/app*`, onde o `Nav` monta). A landing
  pública e `/admin` da plataforma mantêm o padrão.
- Para acessibilidade, escolha `primary` com bom contraste sobre branco e
  `accent` levemente mais escuro/vivo para hover.
