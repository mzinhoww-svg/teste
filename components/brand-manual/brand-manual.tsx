import { cn } from "@/lib/utils";
import { SitePageView } from "@/components/site/page-view";
import { cormorantGaramond, dmSans, dmMono } from "./fonts";
import { ReinersMarkDefs } from "./mark";
import { BrandManualSmoothScroll } from "./smooth-scroll";
import { BrandManualNav } from "./nav";
import { BrandManualCover } from "./cover";
import { BrandManualFooter } from "./footer";
import { EssenciaSection } from "./sections/essencia";
import { LogoSection } from "./sections/logo";
import { PaletaSection } from "./sections/paleta";
import { TipografiaSection } from "./sections/tipografia";
import { IconesSection } from "./sections/icones";
import { PadroesSection } from "./sections/padroes";
import { AplicacoesSection } from "./sections/aplicacoes";
import { SpecsSection } from "./sections/specs";
import { ManifestoSection } from "./sections/manifesto";

// Manual de identidade visual da Reiners Media (`/manual-marca`) — página
// única e autocontida, com sistema de tokens e tipografia próprios (Navy/
// Ouro/Creme, Cormorant Garamond/DM Sans/DM Mono). Isolada de propósito do
// tema PodFactory (site-*) do resto do site: é um documento de marca, não uma
// página do site público. Ver app/globals.css (`.manual-marca`) e
// tailwind.config.ts (`colors.manual`, `fontFamily["manual-*"]`).
export function BrandManual() {
  return (
    <div
      className={cn(
        cormorantGaramond.variable,
        dmSans.variable,
        dmMono.variable,
        "manual-marca bg-manual-creme font-manual-sans text-manual-tinta",
      )}
    >
      <ReinersMarkDefs />
      <BrandManualSmoothScroll />
      <BrandManualNav />
      <BrandManualCover />

      <main>
        <EssenciaSection />
        <LogoSection />
        <PaletaSection />
        <TipografiaSection />
        <IconesSection />
        <PadroesSection />
        <AplicacoesSection />
        <SpecsSection />
        <ManifestoSection />
      </main>

      <BrandManualFooter />
      <SitePageView />
    </div>
  );
}
