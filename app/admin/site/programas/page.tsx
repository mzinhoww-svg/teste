import { listAllPrograms } from "@/lib/site/admin";
import { SiteCard } from "@/components/site/card";
import { SiteButton } from "@/components/site/button";
import { SiteInput, SiteTextarea } from "@/components/site/input";
import { SiteCheckbox } from "@/components/site/admin/checkbox";
import { PORTFOLIO_ENABLED } from "@/lib/site/features";
import { deleteProgram, saveProgram } from "../actions";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function ProgramForm({ item }: { item?: Row }) {
  const key = item?.id ?? "novo";
  return (
    <SiteCard variant="plain">
      <form action={saveProgram} className="flex flex-col gap-5">
        <input type="hidden" name="id" defaultValue={item?.id ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`p-title-${key}`} name="title" label="Título" placeholder="Ex.: Conversas que Cooperam" defaultValue={item?.title ?? ""} required />
          <SiteInput id={`p-slug-${key}`} name="slug" label="Slug" helper="Vazio = gerado do título." placeholder="Ex.: conversas-que-cooperam" defaultValue={item?.slug ?? ""} />
          <SiteInput id={`p-client-${key}`} name="client" label="Cliente" placeholder="Ex.: Sicredi MT" defaultValue={item?.client ?? ""} />
          <SiteInput id={`p-cat-${key}`} name="category" label="Categoria" placeholder="Ex.: Corporativo" defaultValue={item?.category ?? ""} />
        </div>

        <SiteTextarea
          id={`p-desc-${key}`}
          name="description"
          label="Descrição"
          placeholder="Ex.: Série institucional gravada no estúdio corporativo permanente."
          defaultValue={item?.description ?? ""}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`p-poster-${key}`} name="poster_url" label="URL da capa" placeholder="Ex.: https://…/storage/v1/object/public/site/capa.jpg" defaultValue={item?.poster_url ?? ""} />
          <SiteInput id={`p-listen-${key}`} name="listen_url" label="URL para ouvir" placeholder="Ex.: https://open.spotify.com/show/…" defaultValue={item?.listen_url ?? ""} />
          <SiteInput id={`p-order-${key}`} name="display_order" label="Ordem" type="number" placeholder="Ex.: 1" defaultValue={item?.display_order ?? 0} />
        </div>

        <div className="flex flex-wrap gap-6">
          <SiteCheckbox id={`p-feat-${key}`} name="featured" label="Aparece na landing" defaultChecked={item?.featured ?? true} />
          <SiteCheckbox id={`p-pub-${key}`} name="published" label="Publicado" defaultChecked={item?.published ?? true} />
        </div>

        <SiteButton type="submit">{item ? "Salvar programa" : "Criar programa"}</SiteButton>
      </form>

      {item && (
        <form action={deleteProgram} className="mt-4 border-t border-site-border-muted/[0.06] pt-4">
          <input type="hidden" name="id" value={item.id} />
          <SiteButton type="submit" variant="ghost" size="sm" className="text-site-danger hover:text-site-danger">
            Excluir
          </SiteButton>
        </form>
      )}
    </SiteCard>
  );
}

export default async function SiteAdminPrograms() {
  const items = await listAllPrograms();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-site-h2 font-medium text-site-text-primary">Programas</h1>
        <p className="mt-2 text-site-base text-site-text-primary/60">
          Alimentam o teaser da landing (marcados como “aparece na landing”) e a página /portfolio.
        </p>
        {!PORTFOLIO_ENABLED && (
          <p
            role="note"
            className="mt-4 rounded-site-md border border-site-border-muted/15 bg-site-surface-raised px-4 py-3 text-site-sm text-site-text-primary/70"
          >
            O portfólio está <strong className="font-medium">oculto no site</strong> por enquanto: dá para
            cadastrar os programas agora, mas eles só aparecem publicamente quando a seção for ativada
            (<code className="font-mono">PORTFOLIO_ENABLED</code> em <code className="font-mono">lib/site/features.ts</code>).
          </p>
        )}
      </div>

      {items.map((item) => (
        <ProgramForm key={item.id} item={item} />
      ))}

      <div>
        <h2 className="mb-3 text-site-2xl font-medium text-site-text-primary">Novo programa</h2>
        <ProgramForm />
      </div>
    </div>
  );
}
