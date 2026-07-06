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
2. `components/TenantThemeVars` (no `Nav`) injeta `--tenant-primary` /
   `--tenant-accent` no `<html>` e marca `data-tenant-themed` — pós-mount, sem
   mismatch de hidratação.
3. `app/globals.css`, sob `[data-tenant-themed]`, remapeia as classes brand-*
   de ação (`bg-brand-600`, `hover:bg-brand-700`, `text-brand-600/700`,
   `border-brand-600`, `ring-brand-400`, `accent-brand-600`) para as variáveis.

Resultado: **qualquer tenant com `brand.primary` re-tematiza o app inteiro**,
sem alterar componentes. Sem `brand`, mantém o índigo padrão.

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
