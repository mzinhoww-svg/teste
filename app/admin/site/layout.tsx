import Link from "next/link";
import { getSiteSession } from "@/lib/site/admin";

export const metadata = { title: "CMS do site — Reiners Media" };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/site", label: "Dashboard" },
  { href: "/admin/site/planos", label: "Planos" },
  { href: "/admin/site/depoimentos", label: "Depoimentos" },
  { href: "/admin/site/programas", label: "Programas" },
  { href: "/admin/site/configuracoes", label: "Configurações" },
];

// CMS da landing pública. Usa os MESMOS tokens do site (site-root) — o painel
// é escuro por definição. Auth: `site_admins` (ADMIN | EDITOR).
export default async function SiteAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSiteSession();

  if (!session.ok) {
    return (
      <div className="site-root grid min-h-screen place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-site-h2 font-medium text-site-text-primary">Área restrita</h1>
          <p className="mt-4 text-site-base text-site-text-primary/70">
            {session.reason === "anon"
              ? "Entre com uma conta autorizada para editar o site."
              : `A conta ${session.email} não é editora do site. Peça a um ADMIN para incluí-la em site_admins.`}
          </p>
          <p className="mt-8 flex justify-center gap-6">
            <Link href="/login" className="text-site-base text-site-text-inverse hover:brightness-110">
              Entrar
            </Link>
            <Link href="/" className="text-site-base text-site-text-primary/60 hover:text-site-text-inverse">
              Voltar ao site
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="site-root flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-site-border-muted/[0.06] bg-site-surface-raised p-6 md:flex">
        <Link href="/" className="text-site-4xl font-medium text-site-text-primary hover:text-site-text-inverse">
          Reiners Media
        </Link>
        <p className="mt-1 text-site-xs font-medium uppercase text-site-text-inverse">CMS do site</p>

        <nav aria-label="Seções do CMS" className="mt-8 flex flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[44px] items-center rounded-site-md px-3 text-site-base text-site-text-primary/70 transition-colors duration-fast hover:bg-site-surface-strong hover:text-site-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <p className="mt-auto pt-8 text-site-sm text-site-text-primary/40">
          {session.email}
          <br />
          <span className="text-site-xs uppercase text-site-text-inverse">{session.role}</span>
        </p>
      </aside>

      <div className="flex-1">
        {/* Navegação equivalente no mobile (a sidebar some abaixo de md) */}
        <nav
          aria-label="Seções do CMS"
          className="flex gap-1 overflow-x-auto border-b border-site-border-muted/[0.06] bg-site-surface-raised px-4 py-2 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[44px] shrink-0 items-center rounded-site-md px-3 text-site-sm text-site-text-primary/70 hover:text-site-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
