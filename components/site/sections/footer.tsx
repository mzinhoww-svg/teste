import { CameraGlyph, CardGlyph, PlayGlyph, WavesGlyph } from "../social-icons";
import { SiteLink } from "../link";
import type { Program } from "@/lib/site/content";

// Seção 7 — Footer. 4 colunas no desktop, 1 no mobile.

const NAV = [
  { href: "/#planos", label: "Planos" },
  { href: "/portfolio", label: "Portfólio" },
  { href: "/#sobre", label: "Sobre" },
  { href: "/#contato", label: "Contato" },
];

const SOCIAL = [
  { href: "https://instagram.com", label: "Instagram", Icon: CameraGlyph },
  { href: "https://linkedin.com", label: "LinkedIn", Icon: CardGlyph },
  { href: "https://youtube.com", label: "YouTube", Icon: PlayGlyph },
  { href: "https://open.spotify.com", label: "Spotify", Icon: WavesGlyph },
];

export function FooterSection({
  siteName,
  programs,
}: {
  siteName: string;
  programs: Program[];
}) {
  return (
    <footer className="border-t border-site-border-muted/[0.06] bg-site-surface-base px-6 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div>
          <p className="text-site-4xl font-medium text-site-text-primary">{siteName}</p>
          <p className="mt-2 max-w-[220px] text-site-sm text-site-text-primary/50">
            Estúdio de podcast premium em São Paulo.
          </p>
        </div>

        <nav aria-label="Rodapé">
          <h2 className="text-site-xs font-medium uppercase text-site-text-inverse">Navegar</h2>
          <ul className="mt-4 flex flex-col">
            {NAV.map((l) => (
              <li key={l.href}>
                <SiteLink href={l.href} variant="muted" touch className="flex text-site-sm">
                  {l.label}
                </SiteLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Programas">
          <h2 className="text-site-xs font-medium uppercase text-site-text-inverse">Programas</h2>
          <ul className="mt-4 flex flex-col">
            {programs.slice(0, 5).map((p) => (
              <li key={p.id}>
                <SiteLink
                  href={`/portfolio#${p.slug}`}
                  variant="muted"
                  touch
                  className="flex text-site-sm"
                >
                  {p.title}
                </SiteLink>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-site-xs font-medium uppercase text-site-text-inverse">Social</h2>
          <ul className="mt-4 flex gap-2">
            {SOCIAL.map(({ href, label, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  aria-label={label}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="grid h-11 w-11 place-items-center rounded-site-md text-site-text-primary/40 transition-colors duration-fast hover:text-site-text-inverse"
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-site-border-muted/[0.06] pt-6">
        <p className="text-site-xs normal-case tracking-normal text-site-text-primary/55">
          © 2026 {siteName}. Todos os direitos reservados.
        </p>
        {/* Ponte para o produto CRM: a landing do CRM agora mora em /crm. */}
        <SiteLink href="/crm" variant="muted" className="text-site-sm">
          CRM AI Studio
        </SiteLink>
      </div>
    </footer>
  );
}
