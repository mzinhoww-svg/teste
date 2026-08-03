import { Check } from "lucide-react";
import { SiteBadge } from "../badge";
import { SiteCard, SiteCardEmpty } from "../card";
import { BookingTrigger } from "../booking-trigger";
import type { Plan } from "@/lib/site/content";

// Seção 2 — Planos. 3 cards (1 coluna no mobile). O card em destaque ganha
// borda accent e o badge "Mais popular".

export function PlansSection({ plans, whatsappNumber }: { plans: Plan[]; whatsappNumber: string }) {
  return (
    <section id="planos" className="bg-site-surface-raised px-6 py-24" aria-labelledby="planos-title">
      <div className="mx-auto max-w-6xl">
        <SiteBadge>Planos</SiteBadge>
        <h2 id="planos-title" className="mt-4 max-w-[640px] text-site-h2 font-medium text-site-text-primary">
          Escolha o formato ideal para o seu projeto
        </h2>

        {plans.length === 0 ? (
          <SiteCardEmpty>Nenhum plano publicado ainda.</SiteCardEmpty>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <SiteCard
                key={plan.id}
                variant="plan"
                interactive
                featured={plan.isFeatured}
                className="flex flex-col"
              >
                {plan.isFeatured && (
                  <SiteBadge variant="accent" className="absolute -top-3 left-8">
                    Mais popular
                  </SiteBadge>
                )}

                <h3 className="text-site-2xl font-medium text-site-text-primary">{plan.name}</h3>

                <p className="mt-4 flex items-baseline gap-2">
                  <span className="text-site-h2 font-medium text-site-text-inverse">{plan.price}</span>
                  <span className="text-site-sm text-site-text-primary/50">{plan.period}</span>
                </p>

                {plan.description && (
                  <p className="mt-3 text-site-base text-site-text-primary/75">{plan.description}</p>
                )}

                <ul className="mt-6 flex flex-col gap-s7">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 py-1">
                      <Check className="mt-1 h-3 w-3 shrink-0 text-site-text-inverse" aria-hidden />
                      <span className="text-site-base text-site-text-primary/75">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <BookingTrigger
                    label={`plan_${plan.name.toLowerCase().replace(/\s+/g, "_")}`}
                    whatsappNumber={whatsappNumber}
                    variant="surface"
                    block
                  >
                    Começar agora
                  </BookingTrigger>
                </div>
              </SiteCard>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
