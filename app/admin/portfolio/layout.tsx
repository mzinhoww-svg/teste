import Link from "next/link";
import { getPortfolioSession } from "@/lib/portfolio/auth";
import { portfolioCssVars } from "@/lib/portfolio/tokens";
import "../../portfolio/portfolio.css";

export const metadata = { title: "Admin do catálogo — Reiners Media" };
export const dynamic = "force-dynamic";

// Sidebar fixa de 240px, surface.raised, borda direita a 6% (spec §9).
// "Configurações" e "Usuários" só aparecem para ADMIN.
const NAV = [
  { href: "/admin/portfolio", label: "Dashboard", adminOnly: false },
  { href: "/admin/portfolio/programas", label: "Programas", adminOnly: false },
  { href: "/admin/portfolio/episodios", label: "Episódios", adminOnly: false },
  { href: "/admin/portfolio/configuracoes", label: "Configurações", adminOnly: true },
  { href: "/admin/portfolio/analytics", label: "Analytics", adminOnly: false },
  { href: "/admin/portfolio/usuarios", label: "Usuários", adminOnly: true },
];

export default async function PortfolioAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPortfolioSession();

  // O middleware já barra quem não está logado; aqui barramos quem está logado
  // mas não é admin do catálogo.
  if (!session) {
    return (
      <div className="pf-root grid min-h-screen place-items-center px-6">
        <style dangerouslySetInnerHTML={{ __html: portfolioCssVars(".pf-root") }} />
        <div className="max-w-md text-center">
          <h1 className="text-pf-2xl font-medium text-pf-primary">Área restrita</h1>
          <p className="mt-3 text-pf-base text-pf-primary/70">
            Sua conta não tem acesso ao admin do catálogo. Peça a um ADMIN para incluir seu
            e-mail em Usuários.
          </p>
          <Link
            href="/portfolio"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base"
          >
            Ir para o catálogo
          </Link>
        </div>
      </div>
    );
  }

  const items = NAV.filter((n) => !n.adminOnly || session.role === "ADMIN");

  return (
    <div className="pf-root flex min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: portfolioCssVars(".pf-root") }} />

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-pf-muted/[0.06] bg-pf-raised p-4 md:block">
        <p className="px-3 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">Catálogo</p>
        <nav aria-label="Admin do catálogo" className="mt-4">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-[44px] items-center rounded-pf-md px-3 text-pf-base text-pf-primary/70 transition-colors duration-pf-fast ease-pf hover:bg-pf-inverse/10 hover:text-pf-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 border-t border-pf-muted/[0.06] px-3 pt-4">
          <p className="truncate text-pf-sm text-pf-primary/60">{session.email}</p>
          <p className="mt-1 text-pf-xs uppercase tracking-pf-meta text-pf-inverse">
            {session.role}
          </p>
          <Link
            href="/portfolio"
            className="mt-4 inline-flex min-h-[44px] items-center text-pf-xs uppercase tracking-pf-meta text-pf-primary/50 transition-colors duration-pf-fast ease-pf hover:text-pf-inverse"
          >
            Ver catálogo →
          </Link>
        </div>
      </aside>

      {/* Navegação equivalente no mobile — a sidebar fixa some abaixo de md. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <nav
          aria-label="Admin do catálogo (mobile)"
          className="pf-scroll-x flex gap-1 border-b border-pf-muted/[0.06] bg-pf-raised px-3 md:hidden"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[44px] shrink-0 items-center px-3 text-pf-base text-pf-primary/70"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
