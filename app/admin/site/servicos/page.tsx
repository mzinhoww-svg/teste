import { listAllServices } from "@/lib/site/admin";
import { SiteCard } from "@/components/site/card";
import { SiteButton } from "@/components/site/button";
import { SiteInput, SiteTextarea } from "@/components/site/input";
import { SiteCheckbox } from "@/components/site/admin/checkbox";
import { deleteService, saveService } from "../actions";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function ServiceForm({ item }: { item?: Row }) {
  const key = item?.id ?? "novo";
  const images: string[] = Array.isArray(item?.images) ? item.images : [];

  return (
    <SiteCard variant="plain">
      <form action={saveService} className="flex flex-col gap-5">
        <input type="hidden" name="id" defaultValue={item?.id ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`s-title-${key}`} name="title" label="Título" placeholder="Ex.: Cobertura de evento" defaultValue={item?.title ?? ""} required />
          <SiteInput id={`s-badge-${key}`} name="badge" label="Selo" helper="Opcional, ao lado do título na lista." placeholder="Ex.: Estúdio próprio" defaultValue={item?.badge ?? ""} />
        </div>

        <SiteTextarea id={`s-desc-${key}`} name="description" label="Descrição" helper="Dois ou três períodos. Aparece logo abaixo do título." placeholder="Ex.: Feira, congresso ou convenção: levamos filmmaker e estrutura de podcast." defaultValue={item?.description ?? ""} />

        <SiteInput id={`s-foot-${key}`} name="footnote" label="Linha de fecho" helper="Abaixo da mídia. Use **asteriscos duplos** para negritar um trecho." placeholder="Ex.: Episódio gravado **ao vivo**, no estande ou no palco." defaultValue={item?.footnote ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`s-video-${key}`} name="video_url" label="URL do vídeo" helper="MP4 16:9. Tendo vídeo, as imagens são ignoradas." placeholder="Ex.: https://…/storage/v1/object/public/site/evento.mp4" defaultValue={item?.video_url ?? ""} />
          <SiteInput id={`s-poster-${key}`} name="poster_url" label="Pôster do vídeo" helper="Primeiro frame, 1920x1080. Sem ele o player abre preto." placeholder="Ex.: https://…/storage/v1/object/public/site/evento.jpg" defaultValue={item?.poster_url ?? ""} />
        </div>

        <SiteTextarea id={`s-imgs-${key}`} name="images" label="Imagens" helper="Uma URL por linha, no máximo 3. Usadas só quando não há vídeo." placeholder={"https://…/estudio-1.webp\nhttps://…/estudio-2.webp"} defaultValue={images.join("\n")} />

        <div className="grid gap-5 sm:grid-cols-2">
          <SiteInput id={`s-order-${key}`} name="display_order" label="Ordem" helper="Define a numeração 01, 02, 03… na lista." type="number" placeholder="Ex.: 1" defaultValue={item?.display_order ?? 0} />
          <div className="flex items-end pb-2">
            <SiteCheckbox id={`s-pub-${key}`} name="published" label="Publicado" defaultChecked={item?.published ?? true} />
          </div>
        </div>

        <SiteButton type="submit">{item ? "Salvar frente" : "Adicionar frente"}</SiteButton>
      </form>

      {item && (
        <form action={deleteService} className="mt-4 border-t border-site-border-muted/[0.06] pt-4">
          <input type="hidden" name="id" value={item.id} />
          <SiteButton type="submit" variant="ghost" size="sm" className="text-site-danger hover:text-site-danger">
            Excluir
          </SiteButton>
        </form>
      )}
    </SiteCard>
  );
}

export default async function SiteAdminServices() {
  const items = await listAllServices();
  const publicados = items.filter((s: Row) => s.published).length;
  const semMidia = items.filter((s: Row) => s.published && !s.video_url && !(Array.isArray(s.images) && s.images.length)).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-site-h2 font-medium text-site-text-primary">O que fazemos</h1>
        <p className="mt-2 text-site-base text-site-text-primary/60">
          As frentes que o estúdio entrega, navegadas por abas na landing. Responde o que dá
          para contratar — quanto custa é a página de Planos.
        </p>
        <p className="mt-3 text-site-sm text-site-text-primary/55">
          {publicados === 0
            ? "A seção está oculta no site: nenhuma frente publicada."
            : `${publicados} ${publicados === 1 ? "frente publicada" : "frentes publicadas"}.`}
          {semMidia > 0 && ` ${semMidia} ainda sem vídeo nem imagem — a aba aparece só com texto, sem moldura vazia.`}
        </p>
      </div>

      {items.map((item: Row) => (
        <ServiceForm key={item.id} item={item} />
      ))}

      <div>
        <h2 className="mb-3 text-site-2xl font-medium text-site-text-primary">Nova frente</h2>
        <ServiceForm />
      </div>
    </div>
  );
}
