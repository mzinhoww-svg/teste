import { SectionHeading, GoldWord } from "../section-heading";
import { TableGrid } from "../table-grid";

const PILLARS = [
  {
    label: "Missão",
    text: "Dar a grandes organizações de Mato Grosso uma presença institucional contínua — produzida com rigor de estúdio e pensada como estratégia, não como volume de publicações.",
  },
  {
    label: "Visão",
    text: "Ser a referência regional em comunicação institucional recorrente — o studio que presidentes e diretores procuram quando a reputação não pode ser terceirizada para o acaso.",
  },
  {
    label: "Propósito",
    text: "Existimos porque grandes organizações merecem ser vistas como realmente são — e porque autoridade se constrói com presença, não com sorte.",
  },
] as const;

const VALUES = [
  { n: "01", title: "Rigor antes de volume", text: "Preferimos uma peça precisa a dez peças irrelevantes. Cada entrega tem intenção." },
  { n: "02", title: "Presença contínua", text: "Autoridade não é um evento. É consistência mês após mês, no campo, in company." },
  { n: "03", title: "Conteúdo que dura", text: "Não produzimos para o feed do dia. Produzimos para a memória institucional." },
  { n: "04", title: "Decisor no centro", text: "Falamos com o topo da hierarquia. A estratégia nasce de quem responde pela instituição." },
] as const;

export function EssenciaSection() {
  return (
    <section id="s01" className="scroll-mt-[60px] bg-manual-creme px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="01 — Essência"
          eyebrow="A razão antes da forma"
          titleClassName="mb-2 max-w-[14ch]"
          title={
            <>
              Comunicação que <GoldWord>posiciona.</GoldWord>
            </>
          }
        />
        <p className="mb-16 max-w-[48ch] font-manual-serif text-[clamp(18px,2.4vw,24px)] italic leading-[1.4] text-manual-medio">
          Transformamos o cotidiano de cooperativas e grandes organizações em comunicação de autoridade contínua.
        </p>

        <TableGrid className="grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          {PILLARS.map((p) => (
            <div key={p.label} className="bg-manual-creme px-[34px] py-[38px]">
              <span className="font-manual-mono text-[10px] font-medium uppercase tracking-[0.2em] text-manual-ouro">
                {p.label}
              </span>
              <p className="mt-4 font-manual-sans text-base leading-[1.7] text-manual-medio">{p.text}</p>
            </div>
          ))}
        </TableGrid>

        <div className="mt-[72px] grid items-start gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="font-manual-mono text-[10px] font-medium uppercase tracking-[0.2em] text-manual-ouro">
              Valores
            </span>
            <div className="mt-6 divide-y divide-manual-ouro-palido border-t border-manual-ouro-palido">
              {VALUES.map((v) => (
                <div key={v.n} className="flex gap-5 py-5">
                  <span className="pt-[5px] font-manual-mono text-[11px] text-manual-ouro-claro">{v.n}</span>
                  <div>
                    <div className="font-manual-serif text-2xl font-semibold leading-[1.1] text-manual-navy">
                      {v.title}
                    </div>
                    <p className="mt-1.5 font-manual-sans text-sm leading-[1.65] text-manual-medio">{v.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center bg-manual-navy px-10 py-11 text-manual-creme">
            <span className="font-manual-mono text-[10px] font-medium uppercase tracking-[0.2em] text-manual-ouro-claro">
              Proposta Única de Valor
            </span>
            <p className="mt-[22px] font-manual-serif text-[clamp(28px,3.6vw,40px)] font-light leading-[1.18]">
              Não entregamos posts.
              <br />
              <span className="italic text-manual-ouro-claro">Entregamos posicionamento.</span>
            </p>
            <div className="my-7 h-px w-10 bg-manual-ouro" />
            <p className="font-manual-sans text-sm font-light leading-[1.75] text-manual-ouro-palido">
              Presença Institucional Contínua™ — contratos mensais de produção <em>in company</em> que transformam o
              cotidiano da organização em comunicação de autoridade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
