import { listAllTestimonials } from "@/lib/site/admin";
import { SiteCard } from "@/components/site/card";
import { SiteButton } from "@/components/site/button";
import { SiteInput, SiteTextarea } from "@/components/site/input";
import { SiteCheckbox } from "@/components/site/admin/checkbox";
import { deleteTestimonial, saveTestimonial } from "../actions";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function TestimonialForm({ item }: { item?: Row }) {
  const key = item?.id ?? "novo";
  return (
    <SiteCard variant="plain">
      <form action={saveTestimonial} className="flex flex-col gap-5">
        <input type="hidden" name="id" defaultValue={item?.id ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`t-name-${key}`} name="name" label="Nome" placeholder="Ex.: Ana Furtado" defaultValue={item?.name ?? ""} required />
          <SiteInput id={`t-role-${key}`} name="role" label="Cargo e empresa" placeholder="Ex.: Gerente de Comunicação · Sicredi MT" defaultValue={item?.role ?? ""} />
        </div>

        <SiteTextarea
          id={`t-quote-${key}`}
          name="quote"
          label="Depoimento"
          placeholder="Ex.: Saímos de posts avulsos para um programa próprio."
          defaultValue={item?.quote ?? ""}
          required
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput
            id={`t-avatar-${key}`}
            name="avatar_url"
            label="URL do avatar"
            helper="Opcional — sem imagem usamos as iniciais."
            placeholder="Ex.: https://…/storage/v1/object/public/site/ana.jpg"
            defaultValue={item?.avatar_url ?? ""}
          />
          <SiteInput id={`t-order-${key}`} name="display_order" label="Ordem" type="number" placeholder="Ex.: 1" defaultValue={item?.display_order ?? 0} />
        </div>

        <SiteCheckbox id={`t-pub-${key}`} name="published" label="Publicado" defaultChecked={item?.published ?? true} />

        <SiteButton type="submit">{item ? "Salvar depoimento" : "Criar depoimento"}</SiteButton>
      </form>

      {item && (
        <form action={deleteTestimonial} className="mt-4 border-t border-site-border-muted/[0.06] pt-4">
          <input type="hidden" name="id" value={item.id} />
          <SiteButton type="submit" variant="ghost" size="sm" className="text-site-danger hover:text-site-danger">
            Excluir
          </SiteButton>
        </form>
      )}
    </SiteCard>
  );
}

export default async function SiteAdminTestimonials() {
  const items = await listAllTestimonials();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-site-h2 font-medium text-site-text-primary">Depoimentos</h1>
        <p className="mt-2 text-site-base text-site-text-primary/60">
          Aparecem na seção “O que dizem nossos clientes”.
        </p>
      </div>

      {items.map((item) => (
        <TestimonialForm key={item.id} item={item} />
      ))}

      <div>
        <h2 className="mb-3 text-site-2xl font-medium text-site-text-primary">Novo depoimento</h2>
        <TestimonialForm />
      </div>
    </div>
  );
}
