import { BookingTrigger } from "../booking-trigger";

// Seção 6 — CTA final. Um único botão (pill, radius step7).
//
// Banda escura de propósito, como o Manifesto do manual de marca: fecha a
// landing com o mesmo gesto — fundo navy, textura de pontos, texto grande em
// serifa leve. Ver Hero (mesma técnica) e Footer (fecho tinta) para as outras
// bandas escuras do site.

export function FinalCtaSection({
  whatsappNumber,
  location,
}: {
  whatsappNumber: string;
  location: string;
}) {
  return (
    <section
      id="contato"
      className="relative overflow-hidden bg-manual-navy px-6 py-[120px] text-center"
      aria-labelledby="contato-title"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgb(var(--manual-ouro-claro) / 0.10) 1px, transparent 0)",
          backgroundSize: "34px 34px",
        }}
      />
      <div className="relative mx-auto max-w-2xl">
        <h2 id="contato-title" className="font-serif text-site-h2-lg font-normal text-manual-creme">
          Pronto para começar seu podcast?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-site-base text-manual-creme/75">
          Agende uma visita ao estúdio em {location} — ou chame a equipe para gravar na sua sede.
        </p>
        <div className="mt-10 flex justify-center">
          <BookingTrigger
            label="final_cta"
            whatsappNumber={whatsappNumber}
            variant="pill"
            size="lg"
            className="bg-manual-ouro-claro text-manual-navy"
          >
            Agendar sessão gratuita
          </BookingTrigger>
        </div>
      </div>
    </section>
  );
}
