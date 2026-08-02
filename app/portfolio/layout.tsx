import type { Metadata } from "next";
import { getSiteConfig } from "@/lib/portfolio/data";
import { portfolioCssVars } from "@/lib/portfolio/tokens";
import { PortfolioNav } from "@/components/portfolio/PortfolioNav";
import "./portfolio.css";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const title = config.seoTitle ?? `Portfólio — ${config.siteName}`;
  const description =
    config.seoDescription ??
    `Catálogo de programas da ${config.siteName}. ${config.tagline}.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    icons: config.faviconUrl ? { icon: config.faviconUrl } : undefined,
  };
}

/**
 * Escapa `<` para que um CSS salvo no admin não possa fechar a tag <style> e
 * injetar markup. O campo é restrito a administradores, mas defesa em
 * profundidade é barata aqui.
 */
function safeCss(css: string | null): string {
  return css ? css.replace(/</g, "\\3C ") : "";
}

export default async function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getSiteConfig();

  return (
    <div className="pf-root">
      {/* Tokens do design system. Emitidos a partir de lib/portfolio/tokens.ts
          — este é o único ponto de entrada dos valores no CSS. */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `${portfolioCssVars(".pf-root")}\n${safeCss(config.customCss)}`,
        }}
      />

      <a href="#programas" className="pf-skip-link">
        Pular para lista de programas
      </a>

      <PortfolioNav siteName={config.siteName} logoUrl={config.logoUrl} />

      {children}

      <footer className="border-t border-pf-muted/[0.06] px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-pf-xl font-medium text-pf-primary">{config.siteName}</p>
          <p className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            {config.tagline}
          </p>
        </div>
      </footer>
    </div>
  );
}
