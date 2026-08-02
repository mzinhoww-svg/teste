import { SiteCard, SiteCardEmpty } from "../card";
import { initials, type Testimonial } from "@/lib/site/content";

// Seção 4 — Depoimentos. Grade de 3 no desktop; no mobile vira carrossel com
// scroll-snap (mesma marcação, sem JS).

export function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section className="bg-site-surface-raised px-6 py-24" aria-labelledby="depoimentos-title">
      <div className="mx-auto max-w-6xl">
        <h2 id="depoimentos-title" className="text-site-h2 font-medium text-site-text-primary">
          O que dizem nossos clientes
        </h2>

        {testimonials.length === 0 ? (
          <SiteCardEmpty>Depoimentos em breve.</SiteCardEmpty>
        ) : (
          <ul className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
            {testimonials.map((t) => (
              <li key={t.id} className="w-[85vw] shrink-0 snap-start md:w-auto">
                <SiteCard variant="testimonial" className="flex h-full flex-col">
                  <blockquote className="text-site-base italic text-site-text-primary/85">
                    “{t.quote}”
                  </blockquote>

                  <div className="mt-auto flex items-center gap-4 pt-8">
                    {t.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre)
                      <img
                        src={t.avatarUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-12 w-12 rounded-site-step8 object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="grid h-12 w-12 place-items-center rounded-site-step8 bg-site-surface-strong text-site-sm font-medium text-site-text-primary/70"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
