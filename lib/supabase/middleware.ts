import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Deriva o subdomínio do host contra a raiz (NEXT_PUBLIC_ROOT_DOMAIN).
// Retorna null em localhost / preview Vercel / apex — nesses casos o roteamento
// é por PATH (dev e E2E não quebram). Pura e determinística (testável).
export function subdomainFor(host: string | null | undefined, root: string | null | undefined): string | null {
  if (!host || !root) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const r = root.toLowerCase();
  if (hostname === r || hostname === `www.${r}`) return null;
  if (!hostname.endsWith(`.${r}`)) return null; // localhost, *.vercel.app, etc.
  const sub = hostname.slice(0, -(r.length + 1));
  return sub || null;
}

// Caminhos que, no host `crm.<root>`, são servidos como estão — não recebem o
// prefixo `/app`. `/app…` já é a área logada; `/admin` é o admin da plataforma
// (vive fora de /app). Pura e determinística.
export function isCrmPassthrough(path: string): boolean {
  return ["/app", "/admin"].some((p) => path === p || path.startsWith(`${p}/`));
}

// Rotas que EXISTIRAM e foram removidas de propósito. Respondem 410 Gone, não
// 404: para o buscador, 410 é o sinal mais forte de remoção definitiva — 404
// pode ser erro temporário, 410 diz "não volte". Sem isto, o guard de sessão
// mandaria /crm para /login, sugerindo que a página existe e só está protegida.
const GONE_PATHS = ["/crm"] as const;

export function isGone(path: string): boolean {
  return GONE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

function copyCookies(target: NextResponse, from: NextResponse): NextResponse {
  from.cookies.getAll().forEach((c) => target.cookies.set(c));
  return target;
}

// Renova a sessão do Supabase, reescreve por subdomínio e protege as áreas.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ---- Roteamento por host (produção). Em dev/preview segue por path. --------
  const sub = subdomainFor(request.headers.get("host"), process.env.NEXT_PUBLIC_ROOT_DOMAIN);
  const url = request.nextUrl.clone();
  const rawPath = url.pathname;
  let rewrote = false;

  // Arquivos servidos como estão em QUALQUER host — nunca reescritos por
  // subdomínio. robots.txt e sitemap.xml entram aqui porque são lidos por
  // crawler anônimo: sem isso, o guard de sessão os mandava para /login e o
  // buscador nunca via as regras de indexação.
  const isAsset =
    rawPath.startsWith("/api") ||
    rawPath.startsWith("/_next") ||
    rawPath.startsWith("/icon") ||
    rawPath.startsWith("/favicon") ||
    rawPath === "/robots.txt" ||
    rawPath === "/sitemap.xml";
  // Rotas públicas de topo (login/convite/proposta/assinatura) são servidas como
  // estão em QUALQUER host — não podem ser reescritas para /app ou /portal, senão
  // os links profissionais (crm.<root>/convite, <root>/proposta) quebrariam.
  const isPublicTop =
    rawPath === "/login" ||
    rawPath.startsWith("/convite") ||
    rawPath.startsWith("/proposta") ||
    rawPath.startsWith("/sign") ||
    rawPath.startsWith("/portal/convite");
  if (!isAsset && !isPublicTop) {
    if (sub === "crm") {
      // crm.<root> é ferramenta interna e NÃO tem página pública: a raiz cai
      // direto na área logada, que manda o anônimo para /login. `/admin` passa
      // direto — sem isso, `crm.<root>/admin` viraria `/app/admin` (404).
      if (rawPath === "/") {
        url.pathname = "/app";
        rewrote = true;
      } else if (!isCrmPassthrough(rawPath)) {
        url.pathname = `/app${rawPath}`;
        rewrote = true;
      }
    } else if (sub === "app" && !rawPath.startsWith("/portal")) {
      url.pathname = rawPath === "/" ? "/portal" : `/portal${rawPath}`;
      rewrote = true;
    }
    // apex/www (sub === null) → site público (landing, /media, /portfolio):
    // nada a reescrever.
  }

  // A landing do CRM foi removida: responde 410 em qualquer host, antes de
  // qualquer guard de sessão.
  if (isGone(rawPath)) {
    return copyCookies(
      new NextResponse("Gone", { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } }),
      response,
    );
  }

  // Caminho "lógico" (pós-rewrite) usado pelos guards.
  const path = url.pathname;

  const isPublic =
    path === "/" ||
    path === "/login" ||
    path.startsWith("/portfolio") ||
    path.startsWith("/media") ||
    path.startsWith("/manual-marca") ||
    path.startsWith("/convite") ||
    path.startsWith("/portal/convite") ||
    path.startsWith("/sign") ||
    path.startsWith("/proposta") ||
    path.startsWith("/api/proposta") ||
    path.startsWith("/api/site") ||
    path.startsWith("/api/health") ||
    path.startsWith("/api/webhooks") ||
    path.startsWith("/api/whatsapp/webhook") ||
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.startsWith("/icon") ||
    path === "/robots.txt" ||
    path === "/sitemap.xml";

  const redirectTo = (pathname: string) => {
    const u = request.nextUrl.clone();
    u.pathname = pathname;
    u.search = "";
    return copyCookies(NextResponse.redirect(u), response);
  };

  // Não logado em área privada → login.
  if (!user && !isPublic) return redirectTo("/login");

  // Guards de área: distinguem usuário-CRM (tem membership) de usuário-portal
  // (tem client_user). Só consultam o banco quando logado e na área relevante.
  if (user && (path.startsWith("/app") || (path.startsWith("/portal") && !path.startsWith("/portal/convite")) || path === "/login")) {
    const isPortalArea = path.startsWith("/portal") && !path.startsWith("/portal/convite");
    const isCrmArea = path.startsWith("/app");

    const { data: mem } = await supabase.from("memberships").select("org_id").eq("user_id", user.id).limit(1);
    const isCrmUser = (mem?.length ?? 0) > 0;

    // Usuário-CRM tentando o portal → volta pro CRM.
    if (isPortalArea && isCrmUser) return redirectTo("/app");

    // Usuário-portal (sem membership) tentando o CRM ou /login → seu portal.
    if ((isCrmArea || path === "/login") && !isCrmUser) {
      const { data: cu } = await supabase
        .from("client_users")
        .select("client_accounts(slug)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const slug = (cu?.client_accounts as { slug?: string } | null)?.slug;
      if (slug) return redirectTo(`/portal/${slug}`);
    }

    // Logado em /login sendo usuário-CRM → CRM.
    if (path === "/login" && isCrmUser) return redirectTo("/app");
  }

  if (rewrote) return copyCookies(NextResponse.rewrite(url), response);
  return response;
}
