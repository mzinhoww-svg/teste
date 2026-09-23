import { BRAND_ICON_SET } from "../icons";
import { SectionHeading, GoldWord } from "../section-heading";
import { TableGrid } from "../table-grid";

const SPECS = [
  "Grade de 24 × 24px, com 2px de margem interna",
  "Traço de 1,5px, uniforme e sem preenchimento",
  "Terminações e junções arredondadas",
  "Cor única: Ouro sobre claro, Ouro claro sobre escuro",
];

const AVOID = [
  "Ícones preenchidos ou com sombra",
  "Múltiplas cores no mesmo ícone",
  "Detalhe excessivo em tamanhos pequenos",
  "Misturar com pictogramas de outras bibliotecas",
];

export function IconesSection() {
  return (
    <section id="s05" className="scroll-mt-[60px] bg-manual-creme px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="05 — Ícones"
          eyebrow="Sistema de linha"
          titleClassName="mb-5"
          title={
            <>
              Traço fino, <GoldWord>geometria</GoldWord> serena.
            </>
          }
        />
        <p className="mb-12 max-w-[52ch] font-manual-sans text-base leading-[1.7] text-manual-medio">
          Ícones lineares de 1,5px, cantos levemente arredondados, sobre grade de 24px. Mesmo peso visual do símbolo
          da marca.
        </p>

        <TableGrid className="grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {BRAND_ICON_SET.map(({ Icon, label }) => (
            <div key={label} className="bg-manual-creme px-6 py-[34px] text-center">
              <Icon className="mx-auto h-10 w-10 text-manual-ouro" />
              <div className="mt-4 font-manual-mono text-[10px] uppercase tracking-[0.14em] text-manual-medio">
                {label}
              </div>
            </div>
          ))}
        </TableGrid>

        <div className="mt-11 grid gap-10 sm:grid-cols-2">
          <div className="border-t-2 border-manual-navy pt-5">
            <div className="font-manual-serif text-[22px] font-semibold text-manual-navy">Especificações</div>
            <ul className="mt-3 list-disc space-y-0 pl-[18px] font-manual-sans text-sm leading-[1.9] text-manual-medio">
              {SPECS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="border-t-2 border-manual-navy pt-5">
            <div className="font-manual-serif text-[22px] font-semibold text-manual-navy">Evitar</div>
            <ul className="mt-3 list-disc space-y-0 pl-[18px] font-manual-sans text-sm leading-[1.9] text-manual-medio">
              {AVOID.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
