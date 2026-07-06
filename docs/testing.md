# Testes E2E (Playwright) e CI

## Visão geral

Os testes ficam em `tests/e2e/` e usam [Playwright](https://playwright.dev).
A suíte cobre a **superfície pública e as guardas de acesso** — landing, login,
redirecionamento de área privada, health e webhook — e roda **sem segredos**,
por isso é estável no CI.

| Arquivo | O que cobre |
| --- | --- |
| `landing.spec.ts` | Landing pública: título, pilares de funcionalidade, CTA, ausência de erro de runtime. |
| `auth.spec.ts` | `/app` e `/app/studio` redirecionam para `/login` quando deslogado; formulário de login; validação de senha. |
| `api.spec.ts` | `/api/health` responde ok; webhook OpenSign recusa payload sem segredo (401); rotas privadas exigem autenticação. |

## Rodando localmente

```bash
npm install
npm run build
npm run test:e2e          # headless
npm run test:e2e:ui       # modo interativo (Playwright UI)
```

O `playwright.config.ts` sobe o app com `npm run start` automaticamente (a menos
que `E2E_BASE_URL` esteja definido) usando variáveis Supabase de placeholder —
o suficiente para a app subir; sem sessão real as rotas privadas redirecionam
para `/login`, que é justamente o que os testes verificam.

### Browser do Playwright

Em CI, o browser é baixado com `npx playwright install --with-deps chromium`.
Em ambientes que já trazem o Chromium pré-instalado, aponte para ele:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/caminho/para/chrome npm run test:e2e
```

## Testando fluxos autenticados

Os cenários com login real (board, studio, contratos) não rodam no CI porque
exigem um Supabase provisionado. Para exercitá-los localmente ou contra um
preview da Vercel:

```bash
export E2E_BASE_URL=https://seu-preview.vercel.app
export E2E_EMAIL=usuario-de-teste@exemplo.com
export E2E_PASSWORD=senha-de-teste
npm run test:e2e
```

Com `E2E_BASE_URL` definido, o Playwright **não** sobe o servidor local — ele
testa a URL informada. Crie o usuário de teste com antecedência (signup cria a
organização automaticamente).

## CI (GitHub Actions)

O workflow `.github/workflows/ci.yml` roda em todo push e PR, em dois jobs:

1. **Lint & build** — `npm ci`, `npm run lint`, `npm run build`.
2. **E2E** — instala o Chromium, faz build e roda `npm run test:e2e`. O
   relatório HTML é publicado como artefato em caso de falha.

Ambos usam variáveis Supabase de placeholder — nenhum segredo é necessário para
o CI ficar verde.
