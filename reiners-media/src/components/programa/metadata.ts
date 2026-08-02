/**
 * TCK-016 — Montagem da metadata por programa (NFR-004).
 *
 * Fica FORA do `page.tsx` porque `generateMetadata` só é executável dentro de
 * um render de rota do Next: extrair a montagem para uma função pura é o que
 * torna o contrato de SEO testável (título, descrição, canonical, OG image)
 * sem subir o App Router inteiro.
 *
 * Decisões:
 *
 * 1. **`title` é só o nome do programa.** O root layout já declara
 *    `template: '%s · Reiners Media'`; repetir a marca aqui produziria
 *    "Podcast X · Reiners Media · Reiners Media".
 *
 * 2. **A descrição tem teto de 160 caracteres** e corta em fronteira de
 *    palavra. `description` no Prisma vai até 5000; jogar isso inteiro numa
 *    meta tag faz o buscador truncar no meio de uma palavra. O `tagline`
 *    (<= 160 por schema) tem precedência quando existe, porque foi escrito
 *    justamente para ser a frase-resumo.
 *
 * 3. **A OG image sai do `coverImage`.** `imageRefSchema` aceita URL absoluta
 *    (upload no Supabase) OU caminho root-relativo (`/capa.jpg`, o que o seed
 *    grava). Caminho relativo em `og:image` não é resolvível por crawler
 *    externo, então declaramos `metadataBase` e deixamos o Next absolutizar.
 *    Sem `NEXT_PUBLIC_SITE_URL` o campo fica `undefined` — o Next avisa e usa
 *    `localhost` em dev, o que é preferível a estourar o build com `new URL`.
 *
 * 4. **`notFound` tem metadata própria com `robots: noindex`.** Um 404 que
 *    responde com o título genérico do site convida o buscador a indexar a
 *    página de erro.
 */
import type { Metadata } from 'next';

import { formatEpisodeCount } from './format';
import { podcastStatusPresentation } from './status';
import {
  PORTFOLIO_PATH,
  SITE_LOCALE,
  SITE_NAME,
  podcastPath,
  resolveSiteUrl,
} from '@/lib/metadata';
import type { PodcastWithEpisodes } from '@/types/api';

/** Teto de caracteres de uma meta description antes do corte dos buscadores. */
export const MAX_DESCRIPTION_LENGTH = 160;

// Rota, marca e locale vêm de `@/lib/metadata` (TCK-022), que é a fonte de
// verdade de SEO do produto. Reexportados aqui só para quem já importa deste
// módulo — nunca redeclarados, sob pena de o canonical desta página divergir do
// que o sitemap publica.
export { PORTFOLIO_PATH, SITE_NAME };

export interface ProgramaMetadataOptions {
  /** Origem absoluta do site. Default: resolução de `@/lib/metadata`. */
  readonly siteUrl?: string | undefined;
}

/** `/portfolio/<slug>` — usado no canonical e em `og:url`. */
export function podcastCanonicalPath(slug: string): string {
  return podcastPath(slug);
}

/**
 * Corta em fronteira de palavra e acrescenta reticências. Nunca devolve string
 * maior que `max` (as reticências entram DENTRO do orçamento).
 */
export function truncateForMeta(value: string, max: number = MAX_DESCRIPTION_LENGTH): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;

  const hardCut = normalized.slice(0, max - 1);
  const lastSpace = hardCut.lastIndexOf(' ');
  const body = lastSpace > 0 ? hardCut.slice(0, lastSpace) : hardCut;

  return `${body.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** Recorte do programa que a metadata consome. */
export type ProgramaMetadataSource = Pick<
  PodcastWithEpisodes,
  'slug' | 'title' | 'tagline' | 'description' | 'coverImage' | 'category' | 'status' | 'year'
> & { readonly episodes?: PodcastWithEpisodes['episodes'] };

/** Frase-resumo do programa, já dentro do teto de meta description. */
export function buildProgramaDescription(podcast: ProgramaMetadataSource): string {
  const source =
    podcast.tagline && podcast.tagline.trim().length > 0 ? podcast.tagline : podcast.description;
  return truncateForMeta(source);
}

/** `new URL` que não derruba o build quando a variável de ambiente está torta. */
function safeUrl(value: string | undefined): URL | undefined {
  if (!value || value.trim().length === 0) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Metadata completa de `/portfolio/[slug]`: título, descrição, canonical,
 * Open Graph (com a capa) e Twitter card.
 */
export function buildProgramaMetadata(
  podcast: ProgramaMetadataSource,
  options: ProgramaMetadataOptions = {},
): Metadata {
  const description = buildProgramaDescription(podcast);
  const canonical = podcastCanonicalPath(podcast.slug);
  // `resolveSiteUrl` (e não `getSiteUrl`) de propósito: o irmão LANÇA em
  // runtime de produção sem `NEXT_PUBLIC_SITE_URL`, e derrubar a página inteira
  // por causa de uma meta tag seria trocar um canonical errado por um 500.
  const metadataBase = safeUrl(options.siteUrl ?? resolveSiteUrl().url);
  const status = podcastStatusPresentation(podcast.status);
  const episodeCount = podcast.episodes?.length ?? 0;

  return {
    // O template do root layout acrescenta "· Reiners Media".
    title: podcast.title,
    description,
    keywords: [podcast.title, podcast.category, 'podcast', SITE_NAME],
    ...(metadataBase ? { metadataBase } : {}),
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title: podcast.title,
      description,
      url: canonical,
      images: [
        {
          url: podcast.coverImage,
          alt: `Capa do programa ${podcast.title}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: podcast.title,
      description,
      images: [podcast.coverImage],
    },
    other: {
      // Metadados de catálogo — úteis para rich results e para depuração do
      // ISR (dá para ver, no HTML servido, qual revalidação gerou a página).
      'podcast:category': podcast.category,
      'podcast:status': status.label,
      'podcast:year': String(podcast.year),
      'podcast:episodes': formatEpisodeCount(episodeCount),
    },
  };
}

/** Metadata de slug inexistente ou soft-deletado: sem indexação. */
export function buildNotFoundMetadata(): Metadata {
  return {
    title: 'Programa não encontrado',
    description: 'Este programa não está disponível no portfólio da Reiners Media.',
    robots: { index: false, follow: false },
  };
}
