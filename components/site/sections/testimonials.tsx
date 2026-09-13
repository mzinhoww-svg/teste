import { SiteCard } from "../card";
import { SiteCarousel } from "../carousel";
import { initials, type Testimonial } from "@/lib/site/content";

// Seção 4 — Depoimentos. Carrossel: a grade fixa de 3 não escalava conforme
// chegam mais clientes.
//
// Sem depoimento publicado a seção SOME, em vez de mostrar "em breve". Um
// título "O que dizem nossos clientes" sobre um vazio afirma que existem
// clientes dizendo algo — e essa é justamente a afirmação que ainda não
// podemos fazer. A prova social no ar é a de convidados, que afirma presença.
export function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;

  return (
    <section className="bg-site-surface-raised px-6 py-24" aria-labelledby="depoimentos-title">
      <div className="mx-auto max-w-6xl">
        <h2 id="depoimentos-title" className="text-site-h2 font-medium text-site-text-primary">
          O que dizem sobre o estúdio
        </h2>

        <div className="mt-12">
          <SiteCarousel label="Depoimentos sobre o estúdio">
            {testimonials.map((t) => (
                <SiteCard key={t.id} variant="testimonial" className="flex h-full flex-col">
                  <blockquote className="text-site-base italic text-site-text-primary/85">
                    “{t.quote}”
                  </blockquote>

                  <div className="mt-auto flex items-center gap-4 pt-8">
                    {t.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre)
                      <img
                        src={t.avatarUrl}
                        alt={t.name}
                        className="h-16 w-16 rounded-site-step8 object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="grid h-16 w-16 place-items-center rounded-site-step8 bg-site-surface-strong text-site-base font-medium text-site-text-primary/70"
                      >
                        {initials(t.name)}
                      </span>
                    )}
                    <span className="flex flex-col">
                      <span className="text-site-base font-medium text-site-text-primary">{t.name}</span>
                      <span className="text-site-sm text-site-text-primary/50">{t.role}</span>
                    </span>
                  </div>
                </SiteCard>
              ))}
          </SiteCarousel>
        </div>
      </div>
    </section>
  );
}
