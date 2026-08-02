/**
 * TCK-016 — `/portfolio/[slug]`: página individual de programa (FR-012, NFR-004).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. POR QUE PRISMA DIRETO, E NÃO `fetch('/api/podcasts/:slug')`
 * ═════════════════════════════════════════════════════════════════════════════
 * Este arquivo é um Server Component: ele já roda no mesmo processo que a rota
 * de API. Chamar a própria API pela rede acrescentaria um round-trip HTTP, uma
 * serialização/desserialização JSON e uma dependência de `NEXT_PUBLIC_SITE_URL`
 * estar correto durante o BUILD (quando não existe servidor ouvindo ainda) —
 * três modos de falha para obter exatamente a mesma linha. Além disso,
 * `GET /api/podcasts/:idOrSlug` é `force-dynamic` e tem rate limit: pré-render
 * de 5 programas consumiria o balde do próprio deploy.
 *
 * O contrato continua sendo respeitado: a consulta usa o MESMO `where`
 * (`deletedAt: null`), a MESMA ordenação de episódios e os MESMOS
 * serializadores públicos da rota de API.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 2. A ARMADILHA DO `deletedAt` (contracts/README.md)
 * ═════════════════════════════════════════════════════════════════════════════
 * `podcastSchema` é `.strict()` e NÃO tem `deletedAt`; toda linha do Prisma
 * traz. Passar a linha crua adiante estoura com `unrecognized_keys` — 500 numa
 * rota pública. Por isso o render consome `toPublicPodcastWithEpisodes(row)`,
 * que descarta `deletedAt`, converte `Date` em ISO-8601 e normaliza
 * `hosts`/`socialLinks` nulos. Nenhum campo do Prisma chega cru ao JSX.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 3. 404 DE VERDADE, EM DOIS PORTÕES
 * ═════════════════════════════════════════════════════════════════════════════
 * Slug inexistente, slug malformado e programa soft-deletado respondem
 * `notFound()` — 404 real, com `robots: noindex` na metadata. Os dois portões
 * (o `where` e `isPubliclyVisible`) estão em `components/programa/query.ts`,
 * testáveis sem banco.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 4. ISR
 * ═════════════════════════════════════════════════════════════════════════════
 * `revalidate = 3600` — o catálogo muda por publicação editorial, não por
 * requisição. `generateStaticParams` pré-renderiza os programas VIVOS no build;
 * `dynamicParams = true` faz um programa criado depois do deploy ser gerado sob
 * demanda na primeira visita, em vez de 404.
 *
 * O `try/catch` de `generateStaticParams` é deliberado: sem banco acessível
 * (CI, preview sem `DATABASE_URL`) a lista fica vazia e TODA rota passa a ser
 * gerada sob demanda — degradação, não quebra. Falhar o build inteiro porque o
 * banco não respondeu no minuto do deploy seria trocar uma página fria por um
 * deploy morto. O `catch` NÃO se estende ao render: ali um erro de banco tem
 * que virar 500 visível, não um 404 silencioso que o buscador desindexa.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 5. SERVER vs CLIENT
 * ═════════════════════════════════════════════════════════════════════════════
 * Página e hero: Server Components, zero JS. A única ilha de cliente é
 * `ProgramaTabs`, que recebe o conteúdo dos painéis já renderizado no servidor.
 * O modal de player é do TCK-015; aqui as trilhas são links diretos.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  EPISODE_ORDER_BY,
  PUBLIC_PODCAST_FILTER,
  EpisodeList,
  ProgramaAbout,
  ProgramaHero,
  ProgramaSocialLinks,
  ProgramaTabs,
  buildNotFoundMetadata,
  buildProgramaMetadata,
  formatEpisodeCount,
  isPubliclyVisible,
  publicPodcastWhere,
} from '@/components/programa';
import { jsonLdScriptProps, podcastBreadcrumbJsonLd, podcastSeriesJsonLd } from '@/lib/metadata';
import { prisma } from '@/lib/prisma';
import { slugSchema, toPublicPodcastWithEpisodes } from '@/lib/schemas';
import type { PodcastWithEpisodes } from '@/types/api';

/** ISR: uma hora. Publicação editorial não precisa de janela menor. */
export const revalidate = 3600;

/** Programa criado depois do build é gerado sob demanda, não vira 404. */
export const dynamicParams = true;

interface ProgramaPageProps {
  params: { slug: string };
}

/**
 * `cache()` do React deduplica a consulta entre `generateMetadata` e o render
 * da mesma requisição: sem ele o Prisma seria chamado duas vezes por página.
 */
const getPodcast = cache(async (slug: string): Promise<PodcastWithEpisodes | null> => {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;

  const row = (await prisma.podcast.findFirst({
    where: publicPodcastWhere(parsed.data),
    include: { episodes: { orderBy: [...EPISODE_ORDER_BY] } },
  })) as Record<string, unknown> | null;

  // Segundo portão: mesmo que o `where` mude, soft-deletado não passa.
  if (!isPubliclyVisible(row)) return null;

  return toPublicPodcastWithEpisodes(row as Record<string, unknown>);
});

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  try {
    const rows = await prisma.podcast.findMany({
      // Mesmo filtro do detalhe: programa soft-deletado nunca vira rota estática.
      where: { ...PUBLIC_PODCAST_FILTER },
      select: { slug: true },
      orderBy: { displayOrder: 'asc' },
    });
    return rows.map((row) => ({ slug: row.slug }));
  } catch {
    // Ver nota 4 do cabeçalho: sem banco, tudo vira geração sob demanda.
    return [];
  }
}

export async function generateMetadata({ params }: ProgramaPageProps): Promise<Metadata> {
  const podcast = await getPodcast(params.slug);
  return podcast ? buildProgramaMetadata(podcast) : buildNotFoundMetadata();
}

export default async function ProgramaPage({ params }: ProgramaPageProps) {
  const podcast = await getPodcast(params.slug);
  if (!podcast) notFound();

  const episodeCount = podcast.episodes.length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-6">
      {/*
        JSON-LD vem inteiro de `@/lib/metadata` (TCK-022), inclusive a
        serialização: `serializeJsonLd` escapa `<`, `>`, `&` e U+2028/29, então
        um título de programa que contenha `</script>` não fecha a tag. NUNCA
        troque isto por `JSON.stringify` direto.
      */}
      <script {...jsonLdScriptProps(podcastSeriesJsonLd(podcast))} />
      <script {...jsonLdScriptProps(podcastBreadcrumbJsonLd(podcast))} />

      <nav aria-label="Trilha de navegação">
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-content-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
        >
          Voltar ao portfólio
        </Link>
      </nav>

      <ProgramaHero podcast={podcast} />

      <ProgramaTabs
        label={`Conteúdo do programa ${podcast.title}`}
        sections={[
          {
            value: 'sobre',
            label: 'Sobre',
            heading: `Sobre ${podcast.title}`,
            content: <ProgramaAbout podcast={podcast} episodeCount={episodeCount} />,
          },
          {
            value: 'episodios',
            label: 'Episódios',
            heading: `Episódios de ${podcast.title} — ${formatEpisodeCount(episodeCount)}`,
            content: <EpisodeList episodes={podcast.episodes} podcastTitle={podcast.title} />,
          },
          {
            value: 'redes',
            label: 'Redes',
            heading: `Redes sociais de ${podcast.title}`,
            content: (
              <ProgramaSocialLinks links={podcast.socialLinks} podcastTitle={podcast.title} />
            ),
          },
        ]}
      />
    </main>
  );
}
