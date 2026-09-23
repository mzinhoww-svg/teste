import { ReinersMark } from "../mark";
import { SectionHeading, GoldWord } from "../section-heading";

const DOT_GRID_10 = {
  backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-claro) / 0.10) 1px, transparent 0)",
};

export function AplicacoesSection() {
  return (
    <section id="s07" className="scroll-mt-[60px] bg-manual-creme px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="07 — Aplicações"
          eyebrow="A marca no mundo"
          title={
            <>
              Do cartão ao <GoldWord>feed.</GoldWord>
            </>
          }
        />

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Cartão de visita — frente */}
          <div
            className="relative flex aspect-[1.75/1] flex-col justify-between overflow-hidden rounded-md bg-manual-navy p-7"
            style={{ ...DOT_GRID_10, backgroundSize: "24px 24px" }}
          >
            <div className="relative flex items-center gap-3">
              <ReinersMark size={34} theme="dark" fill="none" />
              <div className="font-manual-serif text-[15px] font-bold tracking-[0.16em] text-manual-creme">
                REINERS <span className="text-manual-ouro-claro">MEDIA</span>
              </div>
            </div>
            <div className="relative font-manual-serif text-[15px] italic text-manual-ouro-claro">
              Presença que posiciona.
            </div>
          </div>

          {/* Cartão de visita — verso */}
          <div className="flex aspect-[1.75/1] flex-col justify-center rounded-md border border-manual-ouro-palido bg-manual-creme p-7">
            <div className="font-manual-serif text-xl font-semibold text-manual-navy">Nome do Contato</div>
            <div className="mt-1 font-manual-mono text-[11px] uppercase tracking-[0.1em] text-manual-ouro">
              Direção · Reiners Media
            </div>
            <div className="my-4 h-px w-8 bg-manual-ouro" />
            <div className="font-manual-sans text-xs leading-[1.8] text-manual-medio">
              contato@reinersmedia.com.br
              <br />
              +55 65 0000-0000 · Cuiabá / MT
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {/* Post institucional */}
          <div>
            <div
              className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-md bg-manual-navy p-[26px]"
              style={{ ...DOT_GRID_10, backgroundSize: "22px 22px" }}
            >
              <div className="relative font-manual-mono text-[9px] uppercase tracking-[0.18em] text-manual-ouro-claro">
                Institucional
              </div>
              <div className="relative font-manual-serif text-2xl font-light leading-[1.2] text-manual-creme">
                Autoridade se constrói com <span className="italic text-manual-ouro-claro">presença.</span>
              </div>
              <div className="relative flex items-center gap-2">
                <ReinersMark size={22} theme="dark" fill="none" />
                <span className="font-manual-serif text-[11px] font-bold tracking-[0.14em] text-manual-creme">
                  REINERS MEDIA
                </span>
              </div>
            </div>
            <div className="mt-3 font-manual-mono text-[10px] uppercase tracking-[0.12em] text-manual-claro">
              Post · fundo escuro
            </div>
          </div>

          {/* Post foto + moldura */}
          <div>
            <div
              className="relative flex aspect-square items-end overflow-hidden rounded-md"
              style={{ backgroundImage: "repeating-linear-gradient(45deg,#e6ddcd,#e6ddcd 10px,#ded4c0 10px,#ded4c0 20px)" }}
            >
              <div className="absolute left-3.5 top-3.5 h-[30px] w-[30px] border-l-2 border-t-2 border-manual-creme" />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-manual-mono text-[10px] tracking-[0.1em] text-manual-medio">
                [ FOTO INSTITUCIONAL ]
              </div>
              <div
                className="relative w-full px-5 pb-[18px] pt-[22px]"
                style={{ backgroundImage: "linear-gradient(transparent, rgb(var(--manual-navy) / 0.92))" }}
              >
                <div className="font-manual-serif text-[17px] text-manual-creme">Cooperativa em campo</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <ReinersMark size={16} theme="dark" fill="none" />
                  <span className="font-manual-mono text-[8px] tracking-[0.12em] text-manual-ouro-palido">
                    REINERS MEDIA
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 font-manual-mono text-[10px] uppercase tracking-[0.12em] text-manual-claro">
              Post · foto + moldura
            </div>
          </div>

          {/* Post dado / claro */}
          <div>
            <div className="flex aspect-square flex-col justify-between rounded-md border border-manual-ouro-palido bg-manual-creme p-[26px]">
              <div className="font-manual-mono text-[9px] uppercase tracking-[0.18em] text-manual-ouro">Dado</div>
              <div>
                <div className="font-manual-serif text-[52px] font-semibold leading-none text-manual-navy">+120</div>
                <div className="mt-2 font-manual-sans text-[13px] text-manual-medio">
                  peças institucionais produzidas por ciclo mensal.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ReinersMark size={20} theme="light" fill="none" />
                <span className="font-manual-serif text-[11px] font-bold tracking-[0.14em] text-manual-navy">
                  REINERS MEDIA
                </span>
              </div>
            </div>
            <div className="mt-3 font-manual-mono text-[10px] uppercase tracking-[0.12em] text-manual-claro">
              Post · dado / claro
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
