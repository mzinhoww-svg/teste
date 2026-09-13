import { listAllGuests } from "@/lib/site/admin";
import { SiteCard } from "@/components/site/card";
import { SiteButton } from "@/components/site/button";
import { SiteInput } from "@/components/site/input";
import { SiteCheckbox } from "@/components/site/admin/checkbox";
import { deleteGuest, saveGuest } from "../actions";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function GuestForm({ item }: { item?: Row }) {
  const key = item?.id ?? "novo";
  return (
    <SiteCard variant="plain">
      <form action={saveGuest} className="flex flex-col gap-5">
        <input type="hidden" name="id" defaultValue={item?.id ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`g-name-${key}`} name="name" label="Nome" placeholder="Ex.: Letícia Andrade" defaultValue={item?.name ?? ""} required />
          <SiteInput id={`g-role-${key}`} name="role" label="Descrição" helper="Livre: cargo, programa ou o que identifica a pessoa." placeholder="Ex.: convidada do Domo Cast" defaultValue={item?.role ?? ""} />
          <SiteInput id={`g-photo-${key}`} name="photo_url" label="URL da foto" helper="Quadrada, sugerido 800x800. Sem foto, mostramos as iniciais." placeholder="Ex.: https://…/storage/v1/object/public/site/convidada.webp" defaultValue={item?.photo_url ?? ""} />
          <SiteInput id={`g-order-${key}`} name="display_order" label="Ordem" type="number" placeholder="Ex.: 1" defaultValue={item?.display_order ?? 0} />
        </div>

        <SiteCheckbox id={`g-pub-${key}`} name="published" label="Publicado" defaultChecked={item?.published ?? false} />

        <SiteButton type="submit">{item ? "Salvar convidado" : "Adicionar convidado"}</SiteButton>
      </form>

      {item && (
        <form action={deleteGuest} className="mt-4 border-t border-site-border-muted/[0.06] pt-4">
          <input type="hidden" name="id" value={item.id} />
          <SiteButton type="submit" variant="ghost" size="sm" className="text-site-danger hover:text-site-danger">
            Excluir
          </SiteButton>
        </form>
      )}
    </SiteCard>
  );
}

export default async function SiteAdminGuests() {
  const items = await listAllGuests();
  const publicados = items.filter((g: Row) => g.published).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-site-h2 font-medium text-site-text-primary">Convidados</h1>
        <p className="mt-2 text-site-base text-site-text-primary/60">
          Quem já gravou no estúdio. É prova social factual: mostra que a pessoa esteve aqui,
          sem afirmar que ela recomenda — isso é o campo de Depoimentos, e exige a frase real
          de quem falou.
        </p>
        <p className="mt-3 text-site-sm text-site-text-primary/55">
          {publicados === 0
            ? "A seção está oculta no site: ela só aparece quando houver ao menos um convidado publicado."
            : `A seção está visível no site com ${publicados} ${publicados === 1 ? "convidado" : "convidados"}.`}
        </p>
      </div>

      {items.map((item: Row) => (
        <GuestForm key={item.id} item={item} />
      ))}

      <div>
        <h2 className="mb-3 text-site-2xl font-medium text-site-text-primary">Novo convidado</h2>
        <GuestForm />
      </div>
    </div>
  );
}
