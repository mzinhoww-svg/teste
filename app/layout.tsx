import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/toaster";
import { siteBaseUrl } from "@/lib/site/seo";
import { cormorantGaramond, dmSans, dmMono } from "@/components/brand-manual/fonts";
import "./globals.css";

// Cormorant Garamond / DM Sans / DM Mono carregadas aqui (não em cada page)
// para o resto do app não pagar o custo: as classes `.variable` só definem
// as CSS custom properties (--font-manual-*) no <html>; os arquivos de fonte
// só são baixados pelas páginas cujo CSS de fato referencia essas variáveis
// (site público e /manual-marca) — CRM/admin continuam em Geist Sans.

// O apex é a vitrine do estúdio, então o padrão do documento é a marca
// Reiners Media. As áreas privadas (CRM, portal, admin) sobrescrevem título e
// descrição nos próprios layouts — e saem do índice por lá. Ver lib/site/seo.ts.
export const metadata: Metadata = {
  metadataBase: new URL(siteBaseUrl()),
  title: "Reiners Media — Estúdio de podcast em Cuiabá/MT",
  description:
    "Estúdio de podcast em Cuiabá/MT: gravação, edição, mixagem, identidade visual e distribuição. Também gravamos na sua sede.",
};

export const viewport: Viewport = {
  themeColor: "#14243E",
};

// Evita "flash" do tema errado: aplica a classe `dark` antes da hidratação,
// lendo a preferência salva ou a do sistema.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${cormorantGaramond.variable} ${dmSans.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
