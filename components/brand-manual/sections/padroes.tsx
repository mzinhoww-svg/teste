import { SectionHeading, GoldWord } from "../section-heading";

export function PadroesSection() {
  return (
    <section id="s06" className="scroll-mt-[60px] bg-manual-pergaminho px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="06 — Padrões"
          eyebrow="Texturas e grafismos"
          title={
            <>
              Elementos que <GoldWord>assinam</GoldWord> sem falar.
            </>
          }
        />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
          <div>
            <div
              className="h-[200px] border border-manual-ouro-palido bg-manual-navy"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-claro) / 0.22) 1px, transparent 0)",
                backgroundSize: "22px 22px",
              }}
            />
            <div className="mt-3 font-manual-mono text-[10px] uppercase tracking-[0.14em] text-manual-ouro">
              Malha de pontos
            </div>
            <p className="mt-1 font-manual-sans text-[13px] leading-[1.6] text-manual-medio">
              Textura de fundo para capas e áreas escuras. Discreta, evoca precisão e método.
            </p>
          </div>

          <div>
            <div className="relative h-[200px] overflow-hidden border border-manual-ouro-palido bg-manual-creme">
              <div className="absolute left-0 top-0 h-10 w-10 border-l-[3px] border-t-[3px] border-manual-ouro" />
              <div className="absolute bottom-0 right-0 h-10 w-10 border-b-[3px] border-r-[3px] border-manual-ouro" />
              <div className="absolute inset-[22px] border border-dashed border-manual-ouro-claro" />
            </div>
            <div className="mt-3 font-manual-mono text-[10px] uppercase tracking-[0.14em] text-manual-ouro">
              Moldura de cantos
            </div>
            <p className="mt-1 font-manual-sans text-[13px] leading-[1.6] text-manual-medio">
              Cantos ativos dourados — cita a moldura do símbolo. Emoldura fotos e destaques.
            </p>
          </div>

          <div>
            <div className="flex h-[200px] flex-col justify-center gap-3.5 border border-manual-ouro-palido bg-manual-creme px-[30px]">
              <div className="h-px bg-manual-ouro" />
              <div className="h-px bg-manual-ouro-claro/70" />
              <div className="h-px bg-manual-ouro-palido" />
              <div className="h-px bg-manual-ouro-claro/70" />
              <div className="h-px bg-manual-ouro" />
            </div>
            <div className="mt-3 font-manual-mono text-[10px] uppercase tracking-[0.14em] text-manual-ouro">
              Fios finos
            </div>
            <p className="mt-1 font-manual-sans text-[13px] leading-[1.6] text-manual-medio">
              Linhas de 1px separam seções e sustentam etiquetas. Sempre em tons de ouro.
            </p>
          </div>
        </div>

        <div className="relative mt-10 overflow-hidden bg-manual-navy px-10 py-11">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-claro) / 0.12) 1px, transparent 0)",
              backgroundSize: "30px 30px",
            }}
          />
          <div className="relative font-manual-mono text-[10px] uppercase tracking-[0.2em] text-manual-ouro-claro">
            Aplicação combinada
          </div>
          <p className="relative mt-[18px] max-w-[24ch] font-manual-serif text-[clamp(24px,3.4vw,38px)] font-light italic leading-[1.25] text-manual-creme">
            Malha, moldura e fio nunca competem — um domina, os outros acompanham.
          </p>
        </div>
      </div>
    </section>
  );
}
