import { ReinersMark } from "../mark";

export function ManifestoSection() {
  return (
    <section
      id="s09"
      className="relative scroll-mt-[60px] overflow-hidden bg-manual-navy px-6 py-[120px] text-manual-creme sm:px-14"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-claro) / 0.10) 1px, transparent 0)",
          backgroundSize: "34px 34px",
        }}
      />

      <div className="relative mx-auto max-w-[900px] text-center">
        <div className="mb-2 flex items-center justify-center gap-[18px]">
          <span className="h-px w-10 bg-manual-ouro" />
          <span className="font-manual-mono text-[11px] font-medium uppercase tracking-[0.2em] text-manual-ouro-claro">
            09 — Manifesto
          </span>
          <span className="h-px w-10 bg-manual-ouro" />
        </div>

        <div className="mt-10 font-manual-serif text-[clamp(30px,4.6vw,52px)] font-light leading-[1.3]">
          Acreditamos que <span className="italic text-manual-ouro-claro">reputação</span> não se improvisa.
          <br />
          Que autoridade é feita de <span className="italic text-manual-ouro-claro">presença</span>, não de sorte.
          <br />
          Que grandes organizações merecem ser vistas
          <br />
          como realmente são.
        </div>

        <div className="mx-auto my-12 h-px w-[54px] bg-manual-ouro" />

        <p className="mx-auto max-w-[56ch] font-manual-sans text-[clamp(16px,2vw,19px)] font-light leading-[1.8] text-manual-ouro-palido">
          Não produzimos para o feed do dia. Produzimos para a memória institucional. Cada peça é uma linha na
          história de quem lidera — escrita com o rigor de um estúdio e a paciência de quem constrói para durar.
        </p>

        <div className="mt-16 flex flex-col items-center gap-6">
          <ReinersMark size={72} theme="dark" fill="rgb(var(--manual-ouro-claro) / 0.07)" />
          <div className="font-manual-serif text-[clamp(20px,3vw,30px)] italic text-manual-ouro-claro">
            Presença que posiciona.
          </div>
        </div>
      </div>
    </section>
  );
}
