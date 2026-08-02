import { getConfigRow } from "@/lib/site/admin";
import { DEFAULT_CONFIG } from "@/lib/site/content";
import { SiteCard } from "@/components/site/card";
import { SiteButton } from "@/components/site/button";
import { SiteInput, SiteTextarea } from "@/components/site/input";
import { saveSiteConfig } from "../actions";

export const dynamic = "force-dynamic";

export default async function SiteAdminSettings() {
  const row = (await getConfigRow()) as Record<string, any> | null;
  const v = (key: string, fallback = "") => row?.[key] ?? fallback;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-site-h2 font-medium text-site-text-primary">Configurações</h1>
        <p className="mt-2 text-site-base text-site-text-primary/60">
          Identidade, hero, CTAs e SEO da landing. Vazio = usa o padrão do código.
        </p>
      </div>

      <SiteCard variant="plain">
        <form action={saveSiteConfig} className="flex flex-col gap-6">
          <input type="hidden" name="id" defaultValue={row?.id ?? ""} />

          <div className="grid gap-5 sm:grid-cols-2">
            <SiteInput id="site_name" name="site_name" label="Nome do site" placeholder="Ex.: Reiners Media" defaultValue={v("site_name", DEFAULT_CONFIG.siteName)} />
            <SiteInput id="tagline" name="tagline" label="Tagline" placeholder="Ex.: Estúdio de Podcast Premium" defaultValue={v("tagline", DEFAULT_CONFIG.tagline)} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SiteInput
              id="hero_video_url"
              name="hero_video_url"
              label="Vídeo do hero"
              helper="MP4 hospedado no Supabase Storage. Sem vídeo, usamos a imagem."
              placeholder="Ex.: https://…/storage/v1/object/public/site/hero.mp4"
              defaultValue={v("hero_video_url")}
            />
            <SiteInput
              id="hero_image_url"
              name="hero_image_url"
              label="Imagem do hero"
              helper="Também serve de pôster do vídeo."
              placeholder="Ex.: https://…/storage/v1/object/public/site/hero.jpg"
              defaultValue={v("hero_image_url")}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SiteInput id="cta_primary_text" name="cta_primary_text" label="CTA primário — texto" placeholder="Ex.: Ver planos" defaultValue={v("cta_primary_text", DEFAULT_CONFIG.ctaPrimaryText)} />
            <SiteInput id="cta_primary_url" name="cta_primary_url" label="CTA primário — destino" placeholder="Ex.: #planos" defaultValue={v("cta_primary_url", DEFAULT_CONFIG.ctaPrimaryUrl)} />
            <SiteInput id="cta_secondary_text" name="cta_secondary_text" label="CTA secundário — texto" placeholder="Ex.: Ouvir programas" defaultValue={v("cta_secondary_text", DEFAULT_CONFIG.ctaSecondaryText)} />
            <SiteInput id="cta_secondary_url" name="cta_secondary_url" label="CTA secundário — destino" placeholder="Ex.: /portfolio" defaultValue={v("cta_secondary_url", DEFAULT_CONFIG.ctaSecondaryUrl)} />
          </div>

          <SiteInput id="seo_title" name="seo_title" label="Título SEO" placeholder="Ex.: Reiners Media — Estúdio de podcast premium" defaultValue={v("seo_title")} />
          <SiteTextarea id="seo_description" name="seo_description" label="Descrição SEO" placeholder="Ex.: Gravação, edição, mixagem e distribuição em um só lugar." defaultValue={v("seo_description")} />
          <SiteInput id="analytics_id" name="analytics_id" label="ID de analytics externo" helper="Opcional — a coleta própria já roda sem isso." placeholder="Ex.: G-XXXXXXX" defaultValue={v("analytics_id")} />

          <SiteButton type="submit">Salvar configurações</SiteButton>
        </form>
      </SiteCard>

      <p className="text-site-sm text-site-text-primary/40">
        O campo <code>custom_css</code> existe no banco mas não é editável aqui: CSS arbitrário
        injetado em todas as páginas é vetor de exfiltração. Se precisar, edite direto no banco
        com revisão.
      </p>
    </div>
  );
}
