import Link from "next/link";

// Navbar do catálogo: sticky, 64px, surface.base com blur e borda inferior a 6%.
// Mesma estrutura da landing page, mas sob os tokens do PodFactory.

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/portfolio#programas", label: "Programas" },
  { href: "/portfolio#sobre", label: "Sobre" },
  { href: "/portfolio#contato", label: "Contato" },
];

export function PortfolioNav({
  siteName,
  logoUrl,
}: {
  siteName: string;
  logoUrl?: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-pf-muted/[0.06] bg-pf-base/80 backdrop-blur">
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <Link
          href="/portfolio"
          className="flex items-center gap-2 rounded-pf-sm text-pf-xl font-medium text-pf-primary"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" aria-hidden className="h-7 w-auto" />
          ) : (
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-pf-sm bg-pf-inverse/15 text-pf-xs font-medium text-pf-inverse"
            >
              RM
            </span>
          )}
          {siteName}
        </Link>

        <ul className="flex items-center">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                // min-h 44px + padding garantem alvo de toque conforme a11y §6.
                className="flex min-h-[44px] items-center rounded-pf-sm px-3 text-pf-xl text-pf-primary/70 transition-colors duration-pf-fast ease-pf hover:text-pf-primary"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
