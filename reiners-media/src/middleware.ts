/**
 * Reiners Media Podcast Studio — middleware de sessão e segurança (TCK-004).
 *
 * Responsabilidades, nesta ordem:
 * 1. aplicar cabeçalhos de segurança (CSP e cia.) a TODA resposta, inclusive às
 *    de erro que o próprio middleware gera;
 * 2. renovar o token do Supabase (o `getUser()` faz o refresh e o client de
 *    middleware grava o cookie novo na resposta);
 * 3. proteger `/admin/*` — não autenticado vira redirect para o login com o
 *    parâmetro `next`;
 * 4. proteger as rotas de API MUTANTES — sem sessão devolve 401 no envelope
 *    padronizado `{ error: { code, message } }`;
 * 5. aplicar BR-001/BR-002 na borda, com a mesma função `authorize` que os
 *    route handlers usam (defesa em profundidade, nunca substituição: um
 *    handler não pode confiar só no middleware).
 *
 * FR-006, NFR-005, SEC-001/002/003.
 */
import { NextResponse, type NextRequest } from 'next/server';

import {
  authorize,
  errorResponse,
  isMutatingMethod,
  mapSupabaseUser,
} from '@/lib/auth-helpers';
import { createMiddlewareSupabaseClient } from '@/lib/supabase';

/* -------------------------------------------------------------------------- */
/* Rotas                                                                      */
/* -------------------------------------------------------------------------- */

/** Página de login do painel (TCK-017). Protegê-la criaria loop de redirect. */
export const ADMIN_LOGIN_PATH = '/admin/login';

/** Query param com o destino original, consumido pelo formulário de login. */
export const NEXT_PARAM = 'next';

/**
 * Rotas de API que aceitam mutação SEM sessão:
 * - `POST /api/auth/login` — é o próprio ato de criar a sessão;
 * - `POST /api/events` — ingestão pública de analytics (docs/API_CONTRACTS.md),
 *   protegida por rate limit no handler (TCK-021), não por autenticação.
 */
export const PUBLIC_MUTATION_PATHS: readonly string[] = ['/api/auth/login', '/api/events'];

function isAdminPage(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isPublicMutation(pathname: string): boolean {
  return PUBLIC_MUTATION_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/* -------------------------------------------------------------------------- */
/* Cabeçalhos de segurança (NFR-005 / docs/SECURITY.md)                       */
/* -------------------------------------------------------------------------- */

/**
 * CSP do produto.
 *
 * Base obrigatória de docs/SECURITY.md: `default-src 'self'` e
 * `script-src 'self' 'unsafe-inline'` — `unsafe-inline` é exigido pelos scripts
 * de bootstrap inline do Next.js App Router; remover exige migrar para nonce por
 * requisição, o que está fora do escopo de TCK-004.
 *
 * Acréscimos do produto, todos justificados:
 * - `frame-src` YouTube/Spotify — FR-011 embeda os players em modal;
 * - `connect-src` Supabase (`https`+`wss`) — auth e realtime;
 * - `img-src https:` — capas vêm do Storage, de `i.ytimg.com` e de `i.scdn.co`
 *   (ver `next.config.js`);
 * - `frame-ancestors 'none'` + `object-src 'none'` — clickjacking e plugins;
 * - `form-action 'self'` — impede exfiltração de credenciais do form de login.
 */
export function buildContentSecurityPolicy(isProduction: boolean): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com",
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com',
  ];

  /* Em dev o upgrade forçado quebraria `http://localhost`. */
  if (isProduction) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

export function securityHeaders(isProduction: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildContentSecurityPolicy(isProduction),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'X-DNS-Prefetch-Control': 'off',
  };

  /* HSTS só faz sentido sob TLS; em dev prenderia o browser em https. */
  if (isProduction) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }

  return headers;
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = securityHeaders(process.env.NODE_ENV === 'production');
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * Transfere para `target` os cookies que o Supabase gravou em `source`.
 *
 * Sem isto, um refresh de token que acontece exatamente na requisição em que o
 * usuário é redirecionado (ou barrado) seria perdido, e a sessão poderia cair.
 */
function carryOverCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

/* -------------------------------------------------------------------------- */
/* Redirects                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Redireciona para o login preservando o destino em `?next=`.
 *
 * Só o pathname + querystring da requisição atual entram no parâmetro (sempre
 * começando por `/`), nunca uma URL absoluta: a página de login precisa apenas
 * recusar valores que não comecem com `/` para ficar imune a open redirect.
 */
export function buildLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL(ADMIN_LOGIN_PATH, request.nextUrl.origin);
  loginUrl.searchParams.set(NEXT_PARAM, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

/* -------------------------------------------------------------------------- */
/* Middleware                                                                 */
/* -------------------------------------------------------------------------- */

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const response = applySecurityHeaders(
    NextResponse.next({ request: { headers: request.headers } }),
  );

  const adminPage = isAdminPage(pathname);
  const guardedApi =
    pathname.startsWith('/api/') && isMutatingMethod(request.method) && !isPublicMutation(pathname);

  /* Página pública, asset ou leitura de API pública: só cabeçalhos. */
  if (!adminPage && !guardedApi) return response;

  /* A própria página de login não pode exigir sessão. */
  if (adminPage && pathname === ADMIN_LOGIN_PATH) return response;

  /**
   * FAIL CLOSED: env ausente ou Supabase fora do ar viram "não autenticado",
   * nunca um 500 com stack trace (docs/SECURITY.md — "Logs de erro sem stack
   * traces em produção"). Falhar aberto aqui liberaria o painel inteiro.
   */
  let user = null as ReturnType<typeof mapSupabaseUser>;
  try {
    const supabase = createMiddlewareSupabaseClient(request, response);
    const { data, error } = await supabase.auth.getUser();
    user = error ? null : mapSupabaseUser(data?.user);
  } catch {
    user = null;
  }

  if (!user) {
    return carryOverCookies(
      response,
      applySecurityHeaders(
        adminPage ? buildLoginRedirect(request) : errorResponse('UNAUTHORIZED'),
      ),
    );
  }

  const decision = authorize(user.role, request.method, pathname);
  if (!decision.allowed) {
    if (adminPage) {
      const fallback = new URL('/admin', request.nextUrl.origin);
      fallback.searchParams.set('error', 'forbidden');
      return carryOverCookies(response, applySecurityHeaders(NextResponse.redirect(fallback)));
    }

    return carryOverCookies(
      response,
      applySecurityHeaders(
        errorResponse('FORBIDDEN', decision.message, { details: { rule: decision.rule } }),
      ),
    );
  }

  return response;
}

/**
 * Matcher: tudo, EXCETO assets e arquivos estáticos.
 *
 * Rodar o middleware em `/_next/static/*` ou em imagens custaria uma invocação
 * edge por asset e ainda faria uma chamada de auth por arquivo. A negativa
 * cobre os diretórios internos do Next, os arquivos servidos de `public/` e
 * qualquer caminho com extensão de asset.
 *
 * O literal fica inline porque o Next.js só analisa `config` estaticamente.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|images/|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|txt|xml|json|woff|woff2|ttf|otf)$).*)',
  ],
};
