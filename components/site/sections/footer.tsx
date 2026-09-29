import { CameraGlyph, CardGlyph, PlayGlyph, WavesGlyph } from "../social-icons";
import { WhatsappGlyph } from "../whatsapp-icon";
import { SiteLink } from "../link";
import { FLOATING_WHATSAPP_MESSAGE, formatWhatsappNumber, whatsappUrl } from "@/lib/site/whatsapp";
import { PORTFOLIO_ENABLED } from "@/lib/site/features";
import { instagramHandle } from "@/lib/site/social";
import type { Program, SiteConfig } from "@/lib/site/content";
import { BrandLockup } from "../brand";

// Seção 7 — Footer. 3 colunas no desktop (4 quando o portfólio está no ar e há
// programas para listar), 1 no mobile.
//
// Banda escura de propósito — Tinta, não Navy: mesma distinção do manual de
// marca (Manifesto em Navy, Footer em Tinta). Por isso os overrides
// manual-* em cada texto abaixo, em vez dos tokens site-* (que agora são a
// versão CLARA do site).

const NAV = [
  { href: "/#planos", label: "Planos" },
  // Portfólio oculto: ver PORTFOLIO_ENABLED em lib/site/features.ts.
  ...(PORTFOLIO_ENABLED ? [{ href: "/portfolio", label: "Portfólio" }] : []),
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
  programs = [],
}: {
  config: SiteConfig;
  /** Só é listada com o portfólio no ar (PORTFOLIO_ENABLED) e ao menos um programa. */
  programs?: Program[];
}) {
  const { siteName, location, whatsappNumber } = config;
  const waHref = whatsappUrl(whatsappNumber, FLOATING_WHATSAPP_MESSAGE);
  const social = socialLinks(config);
  const showPrograms = PORTFOLIO_ENABLED && programs.length > 0;
  const instagram = config.instagramUrl;
  const handle = instagramHandle(instagram);

  // pb-24 no mobile: o botão flutuante do WhatsApp (fixo, canto inferior
  // direito) cobria o fim da linha de copyright quando a página chegava ao final.
  return (
    <footer className="border-t border-manual-ouro/10 bg-manual-tinta px-6 pb-24 pt-12 md:pb-12">
      <div className={`mx-auto grid max-w-6xl gap-10 ${showPrograms ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <div>
          {/* Rodapé escuro (Tinta) → símbolo creme, 48px. Assinatura em 18px para
              caber na coluna de ~246px; 16px entre símbolo e texto. */}
          <BrandLockup onDark symbolHeight={48} signatureClassName="text-[18px]" />
          <p className="mt-4 max-w-[220px] text-site-sm text-manual-claro">
            Estúdio de podcast premium em {location}.
          </p>
          {/* Canais de contato com texto visível: WhatsApp (número) e Instagram
              (@usuário). Os ícones da coluna "Social" repetem os mesmos links. */}
          {(waHref || (instagram && handle)) && (
            <ul className="mt-4 flex flex-col">
              {waHref && (
                <li>
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 text-site-sm font-medium text-manual-ouro-claro hover:brightness-110"
                  >
                    <WhatsappGlyph className="h-4 w-4" />
                    {formatWhatsappNumber(whatsappNumber)}
                  </a>
                </li>
              )}
              {instagram && handle && (
                <li>
                  <a
                    href={instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 text-site-sm font-medium text-manual-ouro-claro hover:brightness-110"
                  >
                    <CameraGlyph className="h-4 w-4" />
                    <span className="sr-only">Instagram: </span>
                    {handle}
                  </a>
                </li>
              )}
            </ul>
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

        {showPrograms && (
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
        )}

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
                  className="grid h-11 w-11 place-items-center rounded-site-md text-manual-claro transition-colors duration-fast hover:text-manual-ouro-claro"
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-6xl border-t border-manual-ouro/10 pt-6">
        <p className="text-site-sm normal-case tracking-normal text-manual-claro">
          © 2026 {siteName}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
