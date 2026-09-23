import { SectionHeading, GoldWord } from "../section-heading";
import { TableGrid } from "../table-grid";

const SPEC_TABLES = [
  {
    title: "Grade & espaçamento",
    rows: [
      ["Base modular", "8px"],
      ["Colunas (desktop)", "12"],
      ["Margem de seção", "96px"],
      ["Largura máx. de leitura", "1180px"],
    ],
  },
  {
    title: "Tipografia",
    rows: [
      ["Entrelinha corpo", "1.7"],
      ["Tracking mono/label", "0.2em"],
      ["Corpo mínimo (web)", "14px"],
      ["Corpo mínimo (print)", "10pt"],
    ],
  },
  {
    title: "Logo",
    rows: [
      ["Área de proteção", "1x símbolo"],
      ["Mínimo digital", "24px"],
      ["Mínimo impresso", "12mm"],
      ["Malha de construção", "11 un."],
    ],
  },
  {
    title: "Ícones & fios",
    rows: [
      ["Grade de ícone", "24px"],
      ["Traço de ícone", "1.5px"],
      ["Fio divisor", "1px"],
      ["Raio de canto (cards)", "6px"],
    ],
  },
] as const;

const CLOSING_BLOCKS = [
  {
    title: "Formatos de arquivo",
    text: "SVG e PDF para vetor · PNG transparente para digital · EPS/CMYK para gráfica.",
  },
  {
    title: "Acessibilidade",
    text: "Contraste mínimo AA. Ouro só em texto grande ou detalhe — nunca em corpo pequeno sobre creme.",
  },
  {
    title: "Nomenclatura",
    text: "reinersmedia_logo_navy.svg · _creme · _mono — sempre em minúsculas, com sufixo de variação.",
  },
] as const;

export function SpecsSection() {
  return (
    <section id="s08" className="scroll-mt-[60px] bg-manual-pergaminho px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="08 — Specs"
          eyebrow="Referência técnica"
          title={
            <>
              Os números que <GoldWord>garantem</GoldWord> consistência.
            </>
          }
        />

        <TableGrid className="grid-cols-1 sm:grid-cols-2">
          {SPEC_TABLES.map((t) => (
            <div key={t.title} className="bg-manual-pergaminho px-[30px] py-8">
              <div className="mb-[18px] font-manual-mono text-[10px] uppercase tracking-[0.2em] text-manual-ouro">
                {t.title}
              </div>
              <div className="divide-y divide-manual-ouro-palido font-manual-mono text-[13px] leading-[2] text-manual-medio">
                {t.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="text-manual-navy">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </TableGrid>

        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
          {CLOSING_BLOCKS.map((b) => (
            <div key={b.title} className="border-t-2 border-manual-navy pt-4">
              <div className="font-manual-mono text-[10px] uppercase tracking-[0.16em] text-manual-ouro">
                {b.title}
              </div>
              <p className="mt-2.5 font-manual-sans text-[13px] leading-[1.7] text-manual-medio">{b.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
