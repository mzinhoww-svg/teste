import { ReinersMark } from "./mark";

// 00 — Capa. Fundo navy com textura de pontos em CSS (radial-gradient), não
// vídeo: o handoff de design confirma que o protótipo nunca teve vídeo de
// fundo aqui — só essa textura estática — então é isso que a fidelidade
// visual pede.
export function BrandManualCover() {
  return (
    <header className="relative grid min-h-[calc(100vh-60px)] grid-rows-[auto_1fr_auto] overflow-hidden bg-manual-navy px-6 pb-10 pt-12 text-manual-creme sm:px-14">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-claro) / 0.10) 1px, transparent 0)",
          backgroundSize: "34px 34px",
        }}
      />

      <div className="relative flex items-start justify-between font-manual-mono text-[10px] uppercase tracking-[0.2em] text-manual-claro">
        <span>Manual de Identidade Visual</span>
        <span>Edição 01 · 2026</span>
      </div>

      <div className="relative flex flex-col items-center justify-center gap-[30px] text-center">
        <ReinersMark theme="dark" size={124} fill="rgba(196,161,90,0.07)" />
        <div>
          <div className="pl-[0.2em] font-manual-serif text-[clamp(40px,7vw,84px)] font-bold leading-none tracking-[0.2em]">
            REINERS <span className="text-manual-ouro-claro">MEDIA</span>
          </div>
          <div className="mx-auto my-[22px] h-px w-[54px] bg-manual-ouro" />
          <div className="font-manual-serif text-[clamp(16px,2.4vw,26px)] italic text-manual-ouro">
            Presença que posiciona.
          </div>
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-1 font-manual-mono text-[9px] uppercase tracking-[0.14em] text-manual-claro sm:flex-row sm:items-end sm:justify-between">
        <span>Studio de Comunicação Estratégica Institucional</span>
        <span>Cuiabá · Mato Grosso · Brasil</span>
      </div>
    </header>
  );
}
