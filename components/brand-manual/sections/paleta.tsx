import * as React from "react";
import { SectionHeading, GoldWord } from "../section-heading";
import { TableGrid } from "../table-grid";

const PRIMARY_COLORS = [
  { name: "Navy Reiners", bgClass: "bg-manual-navy", hex: "#14243E", rgb: "20·36·62", cmyk: "92·77·46·46", nameClass: "text-manual-creme", specsClass: "text-manual-ouro-palido" },
  { name: "Ouro", bgClass: "bg-manual-ouro", hex: "#9A7B35", rgb: "154·123·53", cmyk: "30·42·92·18", nameClass: "text-white", specsClass: "text-white/80" },
  { name: "Creme", bgClass: "bg-manual-creme", hex: "#FAF7F2", rgb: "250·247·242", cmyk: "1·2·4·0", nameClass: "text-manual-tinta", specsClass: "text-manual-medio" },
  { name: "Tinta", bgClass: "bg-manual-tinta", hex: "#1A1510", rgb: "26·21·16", cmyk: "60·62·70·75", nameClass: "text-manual-creme", specsClass: "text-manual-claro" },
] as const;

const SUPPORT_COLORS = [
  { name: "Aço", bgClass: "bg-manual-aco", hex: "#2C4A72", nameClass: "text-white", hexClass: "text-white/75" },
  { name: "Ouro claro", bgClass: "bg-manual-ouro-claro", hex: "#C4A15A", nameClass: "text-manual-tinta", hexClass: "text-manual-tinta" },
  { name: "Ouro pálido", bgClass: "bg-manual-ouro-palido", hex: "#E8D9B5", nameClass: "text-manual-tinta", hexClass: "text-manual-medio" },
  { name: "Pergaminho", bgClass: "bg-manual-pergaminho", hex: "#F0EBE1", nameClass: "text-manual-tinta", hexClass: "text-manual-medio" },
  { name: "Médio", bgClass: "bg-manual-medio", hex: "#5E5549", nameClass: "text-white", hexClass: "text-white/70" },
] as const;

const USAGE_SPLIT = [
  { label: "60% Creme", flex: 60, bgClass: "bg-manual-creme" },
  { label: "28% Navy", flex: 28, bgClass: "bg-manual-navy" },
  { label: "12% Ouro", flex: 12, bgClass: "bg-manual-ouro" },
] as const;

function GroupLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-manual-mono text-[10px] font-medium uppercase tracking-[0.2em] text-manual-ouro ${className}`}>
      {children}
    </div>
  );
}

export function PaletaSection() {
  return (
    <section id="s03" className="scroll-mt-[60px] bg-manual-creme px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="03 — Paleta"
          eyebrow="Cor com hierarquia"
          title={
            <>
              Sóbria por fora, <GoldWord>dourada</GoldWord> no detalhe.
            </>
          }
        />

        <GroupLabel className="mb-5">Cores principais</GroupLabel>
        <TableGrid className="grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          {PRIMARY_COLORS.map((c) => (
            <div key={c.name} className={`flex min-h-[200px] flex-col justify-end px-6 pb-[22px] pt-[26px] ${c.bgClass}`}>
              <div className={`font-manual-serif text-xl font-semibold ${c.nameClass}`}>{c.name}</div>
              <div className={`mt-2.5 font-manual-mono text-[11px] leading-[1.7] ${c.specsClass}`}>
                <div>HEX {c.hex}</div>
                <div>RGB {c.rgb}</div>
                <div>CMYK {c.cmyk}</div>
              </div>
            </div>
          ))}
        </TableGrid>

        <GroupLabel className="mb-5 mt-11">Cores de apoio</GroupLabel>
        <TableGrid className="grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
          {SUPPORT_COLORS.map((c) => (
            <div key={c.name} className={`flex min-h-[120px] flex-col justify-end px-[18px] py-5 ${c.bgClass}`}>
              <div className={`font-manual-sans text-sm font-semibold ${c.nameClass}`}>{c.name}</div>
              <div className={`mt-1.5 font-manual-mono text-[10px] ${c.hexClass}`}>{c.hex}</div>
            </div>
          ))}
        </TableGrid>

        <div className="mt-12 grid gap-10 sm:grid-cols-2">
          <div className="border-t-2 border-manual-navy pt-5">
            <div className="font-manual-serif text-[22px] font-semibold text-manual-navy">Proporção de uso</div>
            <div className="mt-4 flex h-11 border border-manual-ouro-palido">
              {USAGE_SPLIT.map((s) => (
                <div key={s.label} className={s.bgClass} style={{ flex: s.flex }} />
              ))}
            </div>
            <div className="mt-2 flex justify-between font-manual-mono text-[10px] text-manual-claro">
              {USAGE_SPLIT.map((s) => (
                <span key={s.label}>{s.label}</span>
              ))}
            </div>
          </div>
          <div className="border-t-2 border-manual-navy pt-5">
            <div className="font-manual-serif text-[22px] font-semibold text-manual-navy">Regra de ouro</div>
            <p className="mt-3.5 font-manual-sans text-sm leading-[1.7] text-manual-medio">
              O dourado é acento, nunca base. Reservado a fios, detalhes tipográficos e destaques — jamais como
              preenchimento de grandes áreas.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
