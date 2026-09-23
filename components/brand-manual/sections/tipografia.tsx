import * as React from "react";
import { SectionHeading, GoldWord } from "../section-heading";

const ALPHABET = "A B C D E F G · a b c d e f g · 0 1 2 3 4 5 6 7 8 9";

function Specimen({
  label,
  family,
  weights,
  borderBottom,
  children,
}: {
  label: string;
  family: string;
  weights: React.ReactNode;
  borderBottom?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid items-start gap-10 border-t border-manual-ouro-claro/30 py-[34px] sm:grid-cols-[180px_1fr] ${
        borderBottom ? "border-b" : ""
      }`}
    >
      <div>
        <div className="font-manual-mono text-[10px] uppercase tracking-[0.16em] text-manual-ouro-claro">{label}</div>
        <div className="mt-2 font-manual-serif text-2xl font-semibold text-manual-creme">{family}</div>
        <div className="mt-2.5 font-manual-mono text-[11px] leading-[1.7] text-manual-claro">{weights}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function TipografiaSection() {
  return (
    <section id="s04" className="scroll-mt-[60px] bg-manual-navy px-6 py-24 text-manual-creme sm:px-14">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          theme="dark"
          kicker="04 — Tipografia"
          eyebrow="A voz escrita"
          title={
            <>
              Serifa que impõe, <GoldWord theme="dark">sans</GoldWord> que informa.
            </>
          }
        />

        <Specimen
          label="Display / Títulos"
          family="Cormorant Garamond"
          weights={
            <>
              Light · Regular
              <br />
              Medium · SemiBold
              <br />
              Italic
            </>
          }
        >
          <div className="font-manual-serif text-[64px] font-light leading-none text-manual-creme">Aa Bb Cc</div>
          <div className="mt-4 font-manual-serif text-[22px] text-manual-ouro-palido">
            A autoridade se lê antes de se ouvir.
          </div>
          <div className="mt-3.5 font-manual-mono text-[11px] tracking-[0.05em] text-manual-claro">{ALPHABET}</div>
        </Specimen>

        <Specimen
          label="Texto / Interface"
          family="DM Sans"
          weights={
            <>
              Light · Regular
              <br />
              Medium · Bold
              <br />
              Italic
            </>
          }
        >
          <div className="font-manual-sans text-5xl font-medium leading-none text-manual-creme">Aa Bb Cc</div>
          <div className="mt-4 max-w-[52ch] font-manual-sans text-base leading-[1.7] text-manual-ouro-palido">
            Texto corrido, legendas e conteúdo institucional. Neutra, de leitura confortável em tela e impresso,
            equilibra a expressividade da serifa.
          </div>
          <div className="mt-3.5 font-manual-mono text-[11px] tracking-[0.05em] text-manual-claro">{ALPHABET}</div>
        </Specimen>

        <Specimen label="Detalhe / Kicker" family="DM Mono" weights="Regular · Medium" borderBottom>
          <div className="font-manual-mono text-4xl font-medium leading-none tracking-[0.04em] text-manual-creme">
            Aa Bb Cc
          </div>
          <div className="mt-[18px] font-manual-mono text-xs uppercase tracking-[0.2em] text-manual-ouro-claro">
            Numeração · Etiquetas · Metadados
          </div>
        </Specimen>

        <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
          <div>
            <div className="mb-3 font-manual-mono text-[10px] uppercase tracking-[0.16em] text-manual-ouro-claro">
              Hierarquia sugerida
            </div>
            <div className="font-manual-serif text-xl font-semibold text-manual-creme">H1 · Cormorant 300 · 72px</div>
            <div className="mt-1.5 font-manual-serif text-[17px] font-semibold text-manual-ouro-palido">
              H2 · Cormorant 600 · 40px
            </div>
            <div className="mt-1.5 font-manual-sans text-[15px] font-medium text-manual-ouro-palido">
              H3 · DM Sans 500 · 20px
            </div>
            <div className="mt-1.5 font-manual-sans text-sm text-manual-claro">Corpo · DM Sans 400 · 16px / 1.7</div>
          </div>
          <div>
            <div className="mb-3 font-manual-mono text-[10px] uppercase tracking-[0.16em] text-manual-ouro-claro">
              Princípios
            </div>
            <p className="font-manual-sans text-sm leading-[1.7] text-manual-ouro-palido">
              Títulos em serifa fina e larga entrelinha. Texto em sans com boa respiração. Mono apenas em pequenas
              etiquetas — nunca em blocos de leitura.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
