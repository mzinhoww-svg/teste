import * as React from "react";
import { ReinersMark } from "../mark";
import { SectionHeading, GoldWord } from "../section-heading";
import { TableGrid } from "../table-grid";

const MISUSES = [
  {
    caption: "Não distorcer proporções",
    render: () => <ReinersMark size={56} theme="light" fill="none" style={{ transform: "scaleX(1.7)" }} />,
    bg: "bg-manual-creme border border-manual-ouro-palido",
    x: "text-[#B4472F]",
  },
  {
    caption: "Não usar sobre cores estranhas à paleta",
    render: () => <ReinersMark size={56} theme="mono" fill="none" />,
    bg: "bg-[linear-gradient(135deg,#7a5fb0,#e0733a)]",
    x: "text-white",
  },
  {
    caption: "Não rotacionar o símbolo",
    render: () => <ReinersMark size={56} theme="light" fill="none" style={{ transform: "rotate(22deg)" }} />,
    bg: "bg-manual-creme border border-manual-ouro-palido",
    x: "text-[#B4472F]",
  },
  {
    caption: "Não reduzir o contraste",
    render: () => <ReinersMark size={56} theme="light" fill="none" style={{ filter: "grayscale(1)", opacity: 0.4 }} />,
    bg: "bg-manual-creme border border-manual-ouro-palido",
    x: "text-[#B4472F]",
  },
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-manual-mono text-[10px] font-medium uppercase tracking-[0.2em] text-manual-ouro">
      {children}
    </span>
  );
}

export function LogoSection() {
  return (
    <section id="s02" className="scroll-mt-[60px] bg-manual-pergaminho px-6 py-24 sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          kicker="02 — Logo"
          eyebrow="A marca e seu uso"
          title={
            <>
              O símbolo e a <GoldWord>assinatura.</GoldWord>
            </>
          }
        />

        <div className="grid items-stretch gap-10 sm:grid-cols-2">
          <div className="relative flex min-h-[340px] items-center justify-center bg-manual-navy p-16">
            <div className="absolute left-4 top-4 font-manual-mono text-[9px] uppercase tracking-[0.16em] text-manual-claro">
              Versão principal · fundo escuro
            </div>
            <div className="text-center">
              <ReinersMark size={96} theme="dark" className="mx-auto" />
              <div className="mt-[22px] pl-[0.2em] font-manual-serif text-2xl font-bold tracking-[0.2em] text-manual-creme">
                REINERS <span className="text-manual-ouro-claro">MEDIA</span>
              </div>
            </div>
          </div>
          <div className="relative flex min-h-[340px] items-center justify-center border border-manual-ouro-palido bg-manual-creme p-16">
            <div className="absolute left-4 top-4 font-manual-mono text-[9px] uppercase tracking-[0.16em] text-manual-claro">
              Versão alternativa · fundo claro
            </div>
            <div className="text-center">
              <ReinersMark size={96} theme="light" fill="rgba(154,123,53,0.06)" className="mx-auto" />
              <div className="mt-[22px] pl-[0.2em] font-manual-serif text-2xl font-bold tracking-[0.2em] text-manual-navy">
                REINERS <span className="text-manual-ouro">MEDIA</span>
              </div>
            </div>
          </div>
        </div>

        <TableGrid className="mt-10 grid-cols-1 sm:grid-cols-3">
          <div className="bg-manual-pergaminho px-[30px] py-[34px]">
            <FieldLabel>Área de proteção</FieldLabel>
            <div className="mt-[22px] flex h-[120px] items-center justify-center border border-dashed border-manual-ouro-claro">
              <ReinersMark size={60} theme="light" fill="rgba(154,123,53,0.06)" />
            </div>
            <p className="mt-[18px] font-manual-sans text-[13px] leading-[1.6] text-manual-medio">
              Margem mínima equivalente à altura do símbolo (1x) em todos os lados.
            </p>
          </div>

          <div className="bg-manual-pergaminho px-[30px] py-[34px]">
            <FieldLabel>Tamanho mínimo</FieldLabel>
            <div className="mt-[22px] flex h-[120px] items-end justify-center gap-5">
              <div className="text-center">
                <ReinersMark size={24} theme="light" fill="none" />
                <div className="mt-2 font-manual-mono text-[9px] text-manual-claro">24px · digital</div>
              </div>
              <div className="text-center">
                <ReinersMark size={52} theme="light" fill="none" />
                <div className="mt-2 font-manual-mono text-[9px] text-manual-claro">12mm · impresso</div>
              </div>
            </div>
            <p className="mt-[18px] font-manual-sans text-[13px] leading-[1.6] text-manual-medio">
              Abaixo desses limites o traçado interno perde legibilidade.
            </p>
          </div>

          <div className="bg-manual-pergaminho px-[30px] py-[34px]">
            <FieldLabel>Construção</FieldLabel>
            <div
              className="mt-[22px] flex h-[120px] items-center justify-center"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-palido)) 1px, transparent 0)",
                backgroundSize: "14px 14px",
              }}
            >
              <ReinersMark size={88} theme="light" fill="rgba(154,123,53,0.06)" />
            </div>
            <p className="mt-[18px] font-manual-sans text-[13px] leading-[1.6] text-manual-medio">
              Grade de moldura, microfone e onda sonora sobre malha modular de 11 unidades.
            </p>
          </div>
        </TableGrid>

        <div className="mt-14">
          <FieldLabel>Usos incorretos</FieldLabel>
          <div className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-5">
            {MISUSES.map((m) => (
              <div key={m.caption} className="text-center">
                <div className={`relative flex h-[120px] items-center justify-center overflow-hidden ${m.bg}`}>
                  {m.render()}
                  <span
                    aria-hidden="true"
                    className={`absolute right-[10px] top-2 font-manual-mono text-base ${m.x}`}
                  >
                    ✕
                  </span>
                </div>
                <p className="mt-[10px] font-manual-sans text-xs text-manual-medio">{m.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
