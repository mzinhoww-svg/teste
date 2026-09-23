import { CameraGlyph, CardGlyph, PlayGlyph, WavesGlyph } from "../social-icons";
import { WhatsappGlyph } from "../whatsapp-icon";
import { SiteLink } from "../link";
import { FLOATING_WHATSAPP_MESSAGE, formatWhatsappNumber, whatsappUrl } from "@/lib/site/whatsapp";
import type { Program, SiteConfig } from "@/lib/site/content";
// O <symbol> do símbolo já é definido uma vez por <ReinersMarkDefs> na navbar
// (presente em toda página pública) — aqui só o <use>, via <ReinersMark>.
import { ReinersMark } from "@/components/brand-manual/mark";

// Seção 7 — Footer. 4 colunas no desktop, 1 no mobile.
//
// Banda escura de propósito — Tinta, não Navy: mesma distinção do manual de
// marca (Manifesto em Navy, Footer em Tinta). Por isso os overrides
// manual-* em cada texto abaixo, em vez dos tokens site-* (que agora são a
// versão CLARA do site).

const NAV = [
  { href: "/#planos", label: "Planos" },
  { href: "/portfolio", label: "Portfólio" },
  { href: "/#sobre", label: "Sobre" },
  { href: "/#contato", label: "Contato" },
];

/** Só entra no rodapé a rede que tem URL no CMS. */
function socialLinks(config: SiteConfig) {
  return [
    { href: config.instagramUrl, label: "Instagram", Icon: CameraGlyph },
    { href: config.linkedinUrl, label: "LinkedIn", Icon: CardGlyph },
    { href: config.youtubeUrl, label: "YouTube", Icon: PlayGlyph },
    { href: config.spotifyUrl, label: "Spotify", Icon: WavesGlyph },
  ].filter((s): s is { href: string; label: string; Icon: typeof CameraGlyph } => Boolean(s.href));
}

export function FooterSection({
  config,
  programs,
}: {
  config: SiteConfig;
  programs: Program[];
}) {
  const { siteName, location, whatsappNumber } = config;
  const waHref = whatsappUrl(whatsappNumber, FLOATING_WHATSAPP_MESSAGE);
  const social = socialLinks(config);

  return (
    <footer className="border-t border-manual-ouro/10 bg-manual-tinta px-6 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div>
          <p className="flex items-center gap-2.5 font-serif text-site-4xl font-bold tracking-[0.02em] text-manual-creme">
            <ReinersMark theme="dark" size={26} className="shrink-0" />
            {siteName}
          </p>
          <p className="mt-2 max-w-[220px] text-site-sm text-manual-claro">
            Estúdio de podcast premium em {location}.
          </p>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-site-sm font-medium text-manual-ouro-claro hover:brightness-110"
            >
              <WhatsappGlyph className="h-4 w-4" />
              {formatWhatsappNumber(whatsappNumber)}
            </a>
          )}
        </div>

        <nav aria-label="Rodapé">
          <h2 className="font-manual-mono text-site-xs font-medium uppercase tracking-[0.14em] text-manual-ouro-claro">Navegar</h2>
          <ul className="mt-4 flex flex-col">
            {NAV.map((l) => (
              <li key={l.href}>
                <SiteLink
                  href={l.href}
                  variant="muted"
                  touch
                  className="flex text-site-sm text-manual-claro hover:text-manual-ouro-claro"
                >
                  {l.label}
                </SiteLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Programas">
          <h2 className="font-manual-mono text-site-xs font-medium uppercase tracking-[0.14em] text-manual-ouro-claro">Programas</h2>
          <ul className="mt-4 flex flex-col">
            {programs.slice(0, 5).map((p) => (
              <li key={p.id}>
                <SiteLink
                  href={`/portfolio#${p.slug}`}
                  variant="muted"
                  touch
                  className="flex text-site-sm text-manual-claro hover:text-manual-ouro-claro"
                >
                  {p.title}
                </SiteLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={waHref || social.length ? "" : "hidden"}>
          <h2 className="font-manual-mono text-site-xs font-medium uppercase tracking-[0.14em] text-manual-ouro-claro">Social</h2>
          <ul className="mt-4 flex gap-2">
            {waHref && (
              <li>
                <a
                  href={waHref}
                  aria-label="WhatsApp"
                  rel="noopener noreferrer"
                  target="_blank"
                  className="grid h-11 w-11 place-items-center rounded-site-md text-manual-ouro-claro transition-colors duration-fast hover:brightness-110"
                >
                  <WhatsappGlyph />
                </a>
              </li>
            )}
            {social.map(({ href, label, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  aria-label={label}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="grid h-11 w-11 place-items-center rounded-site-md text-manual-claro/60 transition-colors duration-fast hover:text-manual-ouro-claro"
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-6xl border-t border-manual-ouro/10 pt-6">
        <p className="text-site-xs normal-case tracking-normal text-manual-claro/80">
          © 2026 {siteName}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
