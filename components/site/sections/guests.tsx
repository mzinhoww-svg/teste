import { SiteCarousel } from "../carousel";
import { SiteBadge } from "../badge";
import { initials, type Guest } from "@/lib/site/content";

// Seção — quem já gravou no estúdio.
//
// Prova social FACTUAL: sem aspas, sem afirmar recomendação. Diz que a pessoa
// esteve no estúdio, o que é verificável. Depoimento (com aspas) é outra
// seção, e exige a frase real de quem falou.
//
// Sem ninguém publicado, a seção não existe — nada de "em breve" ocupando
// espaço com credencial vazia.
export function GuestsSection({ guests }: { guests: Guest[] }) {
  if (guests.length === 0) return null;

  return (
    <section className="bg-site-surface-base px-6 py-24" aria-labelledby="convidados-title">
      <div className="mx-auto max-w-6xl">
        <SiteBadge>Convidados</SiteBadge>
        <h2 id="convidados-title" className="mt-4 text-site-h2 font-medium text-site-text-primary">
          Quem já gravou no estúdio
        </h2>

        <div className="mt-12">
          <SiteCarousel
            label="Convidados que gravaram no estúdio"
            itemClassName="w-[60vw] sm:w-[36vw] md:w-[calc((100%-4.5rem)/4)]"
          >
            {guests.map((g) => (
              <figure key={g.id} className="flex flex-col gap-4">
                <div className="aspect-square overflow-hidden rounded-site-lg border border-site-border-muted/[0.06] bg-site-surface-raised">
                  {g.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre)
                    <img
                      src={g.photoUrl}
                      alt={`${g.name} no estúdio da Reiners Media`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid h-full w-full place-items-center text-site-h2 font-medium text-site-text-primary/30"
                    >
                      {initials(g.name)}
                    </span>
                  )}
                </div>
                <figcaption>
                  <span className="block text-site-base font-medium text-site-text-primary">{g.name}</span>
                  {g.role && (
                    <span className="mt-0.5 block text-site-sm text-site-text-primary/55">{g.role}</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </SiteCarousel>
        </div>
      </div>
    </section>
  );
}
