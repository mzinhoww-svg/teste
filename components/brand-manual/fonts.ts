import { Cormorant_Garamond, DM_Sans, DM_Mono } from "next/font/google";

// Tipografia do manual de marca (Reiners Media DS 2026) — isolada do Geist/
// Borna usados no resto do site. Só é importada pela rota `/manual-marca`
// (components/brand-manual/brand-manual.tsx), então o resto do site não paga
// o custo dessas três famílias.

export const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-manual-serif",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-manual-sans",
});

export const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-manual-mono",
});
