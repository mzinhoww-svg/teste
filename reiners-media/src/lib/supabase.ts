/**
 * Reiners Media Podcast Studio — clients Supabase SSR (TCK-004).
 *
 * Três superfícies distintas do App Router precisam de um client diferente,
 * porque cada uma tem uma forma diferente de LER e ESCREVER cookies:
 *
 * | Superfície                    | Lê cookies de        | Escreve cookies em      |
 * |-------------------------------|----------------------|-------------------------|
 * | Client Component (browser)    | `document.cookie`    | `document.cookie`       |
 * | Server Component / RSC        | `next/headers`       | NÃO PODE (só leitura)   |
 * | Route Handler / Server Action | `next/headers`       | `next/headers`          |
 * | Middleware (edge)             | `NextRequest`        | `NextResponse`          |
 *
 * REGRA CRÍTICA: `next/headers` é importado DINAMICAMENTE nas funções de
 * servidor. Um `import` estático quebraria o middleware — que roda no edge
 * runtime e não tem acesso a `next/headers` — assim que `src/middleware.ts`
 * importasse este módulo. Por isso `createMiddlewareSupabaseClient` é a única
 * função síncrona: ela não toca em `next/headers`.
 *
 * SEGURANÇA (docs/SECURITY.md — "JWT em cookie httpOnly, secure, SameSite=strict"):
 * `hardenCookieOptions` é aplicado a TODA escrita de cookie feita pelo
 * `@supabase/ssr`. A biblioteca não define `httpOnly` por padrão (ela suporta
 * leitura no browser); aqui o cookie de sessão é deliberadamente invisível para
 * JavaScript, o que remove a superfície de roubo de token por XSS. O preço é
 * que nenhum código de browser consegue ler a sessão — a UI deve consultar
 * `GET /api/auth/session`.
 */
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';

/* -------------------------------------------------------------------------- */
/* Ambiente                                                                   */
/* -------------------------------------------------------------------------- */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Lê as variáveis públicas do Supabase.
 *
 * A anon key é pública por design (protegida por RLS, docs/SECURITY.md), mas a
 * mensagem de erro NUNCA ecoa valores — só o nome da variável ausente — para
 * que um erro de configuração não vire vazamento em log de produção.
 *
 * @throws {Error} quando `NEXT_PUBLIC_SUPABASE_URL` ou
 *   `NEXT_PUBLIC_SUPABASE_ANON_KEY` não estão definidas.
 */
export function readSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error(`Configuração Supabase ausente: ${missing.join(', ')}`);
  }

  return { url, anonKey };
}

/* -------------------------------------------------------------------------- */
/* Cookies                                                                    */
/* -------------------------------------------------------------------------- */

/** `true` apenas em produção — `secure: true` inviabilizaria `http://localhost`. */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Flags de segurança impostas a todo cookie de sessão emitido pelo Supabase.
 *
 * `sameSite: 'strict'` vem de docs/SECURITY.md. O fluxo de login é same-site
 * (form do painel -> `/api/auth/login` -> redirect para `/admin`), então
 * `strict` não quebra nada e elimina CSRF em requisições cross-site.
 *
 * O spread vem PRIMEIRO de propósito: `httpOnly`, `sameSite` e `secure`
 * sobrescrevem o que o chamador mandou e não são negociáveis. Só `path` é
 * escolha de quem chama. Inverter essa ordem devolveria ao `@supabase/ssr` (ou
 * a qualquer chamador) o poder de desligar o `httpOnly`.
 *
 * Coberto por `tests/unit/auth-helpers.test.ts` tanto na função quanto na
 * CHAMADA de cada adaptador — remover qualquer uma das duas derruba teste.
 */
export function hardenCookieOptions(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: options.path ?? '/',
  };
}

/** Cookie de expiração imediata, usado no logout. */
export const EXPIRED_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  maxAge: 0,
};

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

type NextHeadersModule = typeof import('next/headers');
type CookieStore = Awaited<ReturnType<NextHeadersModule['cookies']>>;

/** Import dinâmico: ver "REGRA CRÍTICA" no topo do arquivo. */
async function readCookieStore(): Promise<CookieStore> {
  const { cookies } = await import('next/headers');
  return cookies();
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Client para Client Components. Só enxerga cookies não-`httpOnly`, portanto
 * NÃO recupera a sessão emitida pelo login — use-o apenas para chamadas que não
 * dependem de sessão. A fonte de verdade da sessão no browser é
 * `GET /api/auth/session`.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  const { url, anonKey } = readSupabaseEnv();
  return createBrowserClient(url, anonKey);
}

/**
 * Client para Server Components / `generateMetadata` / layouts.
 *
 * Um RSC não pode escrever cookies: `cookieStore.set` lança. O `setAll` engole
 * a exceção de propósito — a renovação do token acontece no middleware, que
 * roda antes e tem uma resposta mutável em mãos.
 */
export async function createServerComponentSupabaseClient(): Promise<SupabaseClient> {
  const { url, anonKey } = readSupabaseEnv();
  const cookieStore = await readCookieStore();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
      setAll: () => {
        /* Server Components são read-only: o middleware renova a sessão. */
      },
    },
  });
}

/**
 * Client para Route Handlers (`src/app/api/**`) e Server Actions — a única
 * superfície de servidor que pode LER e ESCREVER cookies.
 */
export async function createRouteHandlerSupabaseClient(): Promise<SupabaseClient> {
  const { url, anonKey } = readSupabaseEnv();
  const cookieStore = await readCookieStore();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (cookiesToSet: CookieToSet[]) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, hardenCookieOptions(options));
        }
      },
    },
  });
}

/**
 * Client para o middleware (edge runtime).
 *
 * Escreve o cookie renovado nos DOIS lados de propósito:
 * - `request.cookies` para que o Route Handler / RSC executado logo em seguida
 *   nesta mesma requisição já enxergue o token novo;
 * - `response.cookies` para que o browser receba o `Set-Cookie`.
 *
 * Omitir o primeiro causa o bug clássico de "usuário deslogado por um request"
 * na virada do refresh token.
 */
export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse,
): SupabaseClient {
  const { url, anonKey } = readSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (cookiesToSet: CookieToSet[]) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenCookieOptions(options));
        }
      },
    },
  });
}
