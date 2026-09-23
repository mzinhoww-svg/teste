import type { Metadata } from "next";
import { BrandManual } from "@/components/brand-manual/brand-manual";

export const metadata: Metadata = {
  title: "Manual de Identidade Visual — Reiners Media",
  description:
    "Manual de marca da Reiners Media: essência, logo, paleta, tipografia, ícones, padrões, aplicações, especificações técnicas e manifesto.",
};

export default function ManualMarcaPage() {
  return <BrandManual />;
}
