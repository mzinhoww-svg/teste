/**
 * TCK-016 — Montagem da metadata (NFR-004) e decisão de 404.
 *
 * `generateMetadata` e `notFound()` só rodam dentro de um render de rota do
 * Next; o que dá para isolar — e é onde os erros de SEO realmente moram — é a
 * MONTAGEM do objeto e o PREDICADO de visibilidade. Ambos são funções puras
 * exportadas por `src/components/programa/`, e é isso que estes testes cobrem.
 */
import { describe, expect, it } from 'vitest';

import {
  PORTFOLIO_PATH as LIB_PORTFOLIO_PATH,
  SITE_NAME as LIB_SITE_NAME,
  podcastPath,
} from '@/lib/metadata';
import {
  MAX_DESCRIPTION_LENGTH,
  PORTFOLIO_PATH,
  SITE_NAME,
  buildNotFoundMetadata,
  buildProgramaDescription,
  buildProgramaMetadata,
  podcastCanonicalPath,
  truncateForMeta,
} from '@/components/programa/metadata';
import {
  EPISODE_ORDER_BY,
  PUBLIC_PODCAST_FILTER,
  isPubliclyVisible,
  publicPodcastWhere,
} from '@/components/programa/query';
import { makePodcast } from './fixtures';

const SITE = 'https://reiners.media';

describe('truncateForMeta', () => {
  it('mantém texto curto intacto', () => {
    expect(truncateForMeta('Uma frase curta.')).toBe('Uma frase curta.');
  });

  it('normaliza espaços e quebras de linha', () => {
    expect(truncateForMeta('duas\n\nlinhas   com   espaço')).toBe('duas linhas com espaço');
  });

  it('corta em fronteira de palavra e cabe no orçamento', () => {
    const long = 'palavra '.repeat(60);
    const result = truncateForMeta(long);

    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(result.endsWith('…')).toBe(true);
    // Não corta no meio de uma palavra.
    expect(result.replace('…', '').trim().endsWith('palavra')).toBe(true);
  });
});

describe('buildProgramaDescription', () => {
  it('prefere o tagline, que já foi escrito como frase-resumo', () => {
    const podcast = makePodcast();
    expect(buildProgramaDescription(podcast)).toBe(podcast.tagline);
  });

  it('cai para a description quando não há tagline', () => {
    const podcast = makePodcast({ tagline: null });
    const description = buildProgramaDescription(podcast);

    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(description).toContain('Uma conversa longa');
  });
});

describe('buildProgramaMetadata', () => {
  const podcast = makePodcast();
  const metadata = buildProgramaMetadata(podcast, { siteUrl: SITE });

  it('usa só o nome do programa no título (o template do layout completa)', () => {
    expect(metadata.title).toBe('Ofício');
    expect(String(metadata.title)).not.toContain('Reiners Media');
  });

  it('declara canonical apontando para a própria rota', () => {
    expect(metadata.alternates?.canonical).toBe('/portfolio/oficio');
    expect(podcastCanonicalPath('oficio')).toBe('/portfolio/oficio');
  });

  it('não redeclara rota nem marca — herda de @/lib/metadata (TCK-022)', () => {
    // Um canonical divergente do sitemap é o defeito de SEO mais caro e mais
    // silencioso que existe: as duas pontas têm que sair da MESMA constante.
    expect(podcastCanonicalPath('oficio')).toBe(podcastPath('oficio'));
    expect(PORTFOLIO_PATH).toBe(LIB_PORTFOLIO_PATH);
    expect(SITE_NAME).toBe(LIB_SITE_NAME);
    expect(metadata.openGraph?.siteName).toBe(LIB_SITE_NAME);
  });

  it('usa o coverImage como OG image, com alt descritivo', () => {
    const images = metadata.openGraph?.images;
    expect(Array.isArray(images)).toBe(true);
    const [image] = images as Array<{ url: string; alt: string }>;

    expect(image?.url).toBe(podcast.coverImage);
    expect(image?.alt).toBe('Capa do programa Ofício');
  });

  it('declara metadataBase para que a capa root-relativa vire URL absoluta', () => {
    expect(metadata.metadataBase?.toString()).toBe(`${SITE}/`);
  });

  it('omite metadataBase (em vez de estourar) quando a origem é inválida', () => {
    const semBase = buildProgramaMetadata(podcast, { siteUrl: 'não é uma url' });
    expect(semBase.metadataBase).toBeUndefined();
  });

  it('preenche o twitter card grande com a mesma capa', () => {
    // `Metadata['twitter']` é uma união discriminada por `card`; o cast estreita
    // para a variante que este ticket declara.
    const twitter = metadata.twitter as { card: string; images: string[] } | undefined;
    expect(twitter?.card).toBe('summary_large_image');
    expect(twitter?.images).toEqual([podcast.coverImage]);
  });

  it('publica categoria, situação e contagem de episódios', () => {
    expect(metadata.other).toMatchObject({
      'podcast:category': 'Documental',
      'podcast:status': 'Em produção',
      'podcast:year': '2024',
      'podcast:episodes': '1 episódio',
    });
  });
});

describe('buildNotFoundMetadata', () => {
  it('marca noindex — página de erro não deve ser indexada', () => {
    const metadata = buildNotFoundMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe('Programa não encontrado');
  });
});

describe('decisão de 404', () => {
  it('o filtro da consulta exclui soft delete', () => {
    expect(PUBLIC_PODCAST_FILTER).toEqual({ deletedAt: null });
    expect(publicPodcastWhere('oficio')).toEqual({ slug: 'oficio', deletedAt: null });
  });

  it('linha ausente não é visível', () => {
    expect(isPubliclyVisible(null)).toBe(false);
    expect(isPubliclyVisible(undefined)).toBe(false);
  });

  it('programa soft-deletado NÃO é visível, mesmo que a consulta o traga', () => {
    expect(isPubliclyVisible({ deletedAt: new Date('2025-01-01T00:00:00Z') })).toBe(false);
    expect(isPubliclyVisible({ deletedAt: '2025-01-01T00:00:00.000Z' })).toBe(false);
  });

  it('programa vivo é visível, com deletedAt nulo ou ausente', () => {
    expect(isPubliclyVisible({ deletedAt: null })).toBe(true);
    expect(isPubliclyVisible({})).toBe(true);
  });

  it('ordena episódios como a rota de API (mais recente primeiro)', () => {
    expect(EPISODE_ORDER_BY).toEqual([{ publishedAt: 'desc' }, { number: 'desc' }]);
  });
});
