import { listAllPlans } from "@/lib/site/admin";
import { SiteCard } from "@/components/site/card";
import { SiteButton } from "@/components/site/button";
import { SiteInput, SiteTextarea } from "@/components/site/input";
import { SiteCheckbox } from "@/components/site/admin/checkbox";
import { deletePlan, movePlan, savePlan } from "../actions";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function PlanForm({ plan }: { plan?: Row }) {
  const key = plan?.id ?? "novo";
  const features: string[] = Array.isArray(plan?.features) ? plan!.features : [];

  return (
    <SiteCard variant="plain">
      <form action={savePlan} className="flex flex-col gap-5">
        <input type="hidden" name="id" defaultValue={plan?.id ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`name-${key}`} name="name" label="Nome do plano" placeholder="Ex.: Podcast In Loco" defaultValue={plan?.name ?? ""} required />
          <SiteInput id={`order-${key}`} name="display_order" label="Ordem" type="number" placeholder="Ex.: 1" defaultValue={plan?.display_order ?? 0} />
          <SiteInput id={`price-${key}`} name="price" label="Preço" placeholder="Ex.: R$ 2.190" defaultValue={plan?.price ?? ""} required />
          <SiteInput id={`period-${key}`} name="period" label="Período" placeholder="Ex.: /episódio" defaultValue={plan?.period ?? "/mês"} />
        </div>

        <SiteTextarea
          id={`desc-${key}`}
          name="description"
          label="Descrição"
          placeholder="Ex.: Gravamos na sua sede, com estrutura de estúdio montada no local."
          defaultValue={plan?.description ?? ""}
        />

        <SiteTextarea
          id={`features-${key}`}
          name="features"
          label="Itens inclusos"
          helper="Um por linha."
          placeholder={"Ex.: Episódio editado + 5 cortes\nEntrega em 48h"}
          defaultValue={features.join("\n")}
        />

        <div className="flex flex-wrap gap-6">
          <SiteCheckbox id={`feat-${key}`} name="is_featured" label="Mais popular" defaultChecked={plan?.is_featured ?? false} />
          <SiteCheckbox id={`pub-${key}`} name="published" label="Publicado" defaultChecked={plan?.published ?? true} />
        </div>

        <div className="flex flex-wrap gap-3">
          <SiteButton type="submit">{plan ? "Salvar plano" : "Criar plano"}</SiteButton>
        </div>
      </form>

      {plan && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-site-border-muted/[0.06] pt-4">
          <form action={movePlan}>
            <input type="hidden" name="id" value={plan.id} />
            <input type="hidden" name="direction" value="up" />
            <SiteButton type="submit" variant="ghost" size="sm">↑ Subir</SiteButton>
          </form>
          <form action={movePlan}>
            <input type="hidden" name="id" value={plan.id} />
            <input type="hidden" name="direction" value="down" />
            <SiteButton type="submit" variant="ghost" size="sm">↓ Descer</SiteButton>
          </form>
          <form action={deletePlan}>
            <input type="hidden" name="id" value={plan.id} />
            <SiteButton type="submit" variant="ghost" size="sm" className="text-site-danger hover:text-site-danger">
              Excluir
            </SiteButton>
          </form>
        </div>
      )}
    </SiteCard>
  );
}

export default async function SiteAdminPlans() {
  const plans = await listAllPlans();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-site-h2 font-medium text-site-text-primary">Planos</h1>
        <p className="mt-2 text-site-base text-site-text-primary/60">
          Ordem, destaque e publicação controlam o que aparece na seção “Planos” da landing.
        </p>
      </div>

      {plans.map((plan) => (
        <PlanForm key={plan.id} plan={plan} />
      ))}

      <div>
        <h2 className="mb-3 text-site-2xl font-medium text-site-text-primary">Novo plano</h2>
        <PlanForm />
      </div>
    </div>
  );
}
