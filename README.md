# Reiners Media — site do estúdio

Site público da **Reiners Media**, estúdio de podcast e comunicação estratégica
institucional em Cuiabá/MT: landing e um CMS próprio para editar o conteúdo
sem deploy. (O portfólio de programas existe no código, mas está **oculto** até
haver portfólio para mostrar — ver `lib/site/features.ts`.)

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Postgres,
Auth, RLS)**. Deploy na **Vercel**.

## Rotas públicas

| URL | Conteúdo |
| --- | --- |
| `reiners.agency` | Landing do estúdio |
| `reiners.agency/portfolio` | *Oculta:* responde 404 e fica fora do sitemap (`PORTFOLIO_ENABLED`) |
| `reiners.agency/media` | Mesma landing, endereço alternativo (canônica: `/`) |
| `reiners.agency/manual-marca` | Manual de identidade visual da marca |
| `reiners.agency/admin/site` | CMS da landing (login obrigatório) |

Roteamento por host em [`docs/vercel-domain.md`](docs/vercel-domain.md); design
system, CMS e regras de indexação em
[`docs/site-landing.md`](docs/site-landing.md).

## O site

- **Landing** com hero, serviços, planos, fotos do estúdio (cenários e
  bastidores), sobre e CTA — o conteúdo editável vem do CMS, com defaults no
  código para a página nunca quebrar por causa do banco.
- **Design system próprio** em tokens semânticos (nenhum hex cru nos
  componentes), escuro, acessível (WCAG 2.2 AA) e testado.
- **WhatsApp como canal principal**: botão flutuante, contato no rodapé e o
  formulário de agendamento, que **abre o WhatsApp direto com a mensagem pronta**
  (`wa.me`) e avisa a equipe por e-mail pela Brevo — sem gravar em banco.
  **Instagram [@reinersmedia](https://instagram.com/reinersmedia)** é o segundo
  canal: ícone e @ no rodapé e uma linha na seção de contato.
- **CMS em `/admin/site`**: planos, depoimentos, programas e configurações, com
  KPIs de visita e clique coletados sem cookie e sem terceiros.

## Rodando localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm run test:unit  # vitest
npm run test:e2e   # Playwright — ver docs/testing.md
```

Sem Supabase configurado o site sobe e renderiza normalmente, usando os defaults
de `lib/site/content.ts`.

## Setup

1. Crie um projeto Supabase e rode as migrations de `supabase/migrations`.
2. Defina as variáveis de `.env.example` — no mínimo
   `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Para editar o site, inclua seu e-mail em `site_admins`
   (ver [`docs/site-landing.md`](docs/site-landing.md)).

## Arquitetura

```
app/
  page.tsx              Landing do estúdio
  portfolio/            Portfólio de programas (oculto: 404 — PORTFOLIO_ENABLED)
  not-found.tsx         404 da marca, em português
  admin/site/           CMS da landing
  api/site/             Formulário de agendamento e coleta de eventos
  robots.ts, sitemap.ts Indexação (só a vitrine entra)
components/site/        Design system do site + seções da landing
lib/site/
  content.ts            Tipos e defaults do conteúdo (puro, testável)
  data.ts               Leitura pública (anônima, cacheável)
  seo.ts                Rotas privadas, noindex e domínio canônico
  features.ts           Chaves de recurso (PORTFOLIO_ENABLED)
  social.ts             Instagram padrão (@reinersmedia) e extração do @
  whatsapp.ts           Link click-to-chat e mensagem pré-preenchida
supabase/migrations/    Schema versionado
```

## Documentação

| Tema | Arquivo |
| --- | --- |
| Site público — design system, CMS e indexação | [`docs/site-landing.md`](docs/site-landing.md) |
| Deploy na Vercel e roteamento por domínio | [`docs/vercel-domain.md`](docs/vercel-domain.md) |
| Testes (unit + E2E) e CI | [`docs/testing.md`](docs/testing.md) |
| E-mail transacional (Brevo) | [`docs/email-brevo.md`](docs/email-brevo.md) |

## Deploy na Vercel

O `vercel.json` já define framework e comandos. Aponte o domínio em
**Settings → Domains** e defina `NEXT_PUBLIC_ROOT_DOMAIN` para ativar o
roteamento por host.

---

## Ferramentas internas

O mesmo deploy hospeda ferramentas comerciais **internas da agência** — funil,
propostas e contratos com assinatura digital, isolados por organização via RLS.
Não fazem parte do site: vivem em `crm.reiners.agency` e `app.reiners.agency`,
**não têm página pública**, exigem login e estão fora de buscador.

Documentação em [`docs/agents.md`](docs/agents.md),
[`docs/admin.md`](docs/admin.md),
[`docs/contracts-signature.md`](docs/contracts-signature.md),
[`docs/opensign.md`](docs/opensign.md),
[`docs/notifications.md`](docs/notifications.md),
[`docs/cadences.md`](docs/cadences.md) e
[`docs/whatsapp-bridge.md`](docs/whatsapp-bridge.md).

**Prospecção B2B** — [`tools/prospeccao/`](tools/prospeccao/README.md): lista de
leads de Cuiabá por segmento, cadência de três mensagens assinadas pela Letícia
(visita, diagnóstico e piloto) e uma central de disparo publicada como Artifact.
Python à parte, fora do build e do deploy; os dados de contato ficam fora do git.
