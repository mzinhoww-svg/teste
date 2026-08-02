import { BookingTrigger } from "../booking-trigger";

// Seção 6 — CTA final. Um único botão (pill, radius step7), gradiente
// surface.base → surface.raised.

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
      className="bg-gradient-to-b from-site-surface-base to-site-surface-raised px-6 py-[120px] text-center"
      aria-labelledby="contato-title"
    >
      <div className="mx-auto max-w-2xl">
        <h2 id="contato-title" className="text-site-h2-lg font-medium text-site-text-primary">
          Pronto para começar seu podcast?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-site-base text-site-text-primary/70">
          Agende uma visita ao estúdio em {location} — ou chame a equipe para gravar na sua sede.
        </p>
        <div className="mt-10 flex justify-center">
          <BookingTrigger label="final_cta" whatsappNumber={whatsappNumber} variant="pill" size="lg">
            Agendar sessão gratuita
          </BookingTrigger>
        </div>
      </div>
    </section>
  );
}
