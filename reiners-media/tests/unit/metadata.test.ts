/**
 * TCK-022 — testes dos helpers de SEO (`src/lib/metadata.ts`).
 *
 * O ambiente é injetado por parâmetro (`env`) em vez de mexer em
 * `process.env` global: os testes ficam independentes de ordem e o mesmo
 * caminho de código é exercitado (o default do parâmetro é a única parte que lê
 * `process.env`, coberta pelos casos de fallback).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_SITE_URL,
  DEFAULT_TITLE,
  MissingSiteUrlError,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  PORTFOLIO_PATH,
  SITE_LOCALE,
  SITE_NAME,
  TITLE_TEMPLATE,
  type SiteUrlEnv,
  absoluteUrl,
  breadcrumbJsonLd,
  buildHomeMetadata,
  buildMetadata,
  buildPodcastMetadata,
  buildPortfolioMetadata,
  formatTitle,
  getSiteUrl,
  jsonLdScriptProps,
  organizationJsonLd,
  podcastBreadcrumbJsonLd,
  podcastEpisodeJsonLd,
  podcastPath,
  podcastSeriesJsonLd,
  resolveSiteUrl,
  serializeJsonLd,
  toIso8601Duration,
  truncate,
} from '@/lib/metadata';
import type { Episode, Podcast } from '@/types/api';

/** Nenhum spy vaza entre testes (há spies de console.error em vários deles). */
afterEach(() => {
  vi.restoreAllMocks();
});

const SITE = 'https://reiners.media';
const env: SiteUrlEnv = { NEXT_PUBLIC_SITE_URL: SITE, NODE_ENV: 'test' };

/** Título hostil: fecha a tag `<script>` e injeta código. Vem do banco. */
const XSS_TITLE = '</script><script>alert(1)</script>';

const podcast: Podcast = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'horizonte-digital',
  title: 'Horizonte Digital',
  tagline: 'Tecnologia sem hype',
  description: 'Conversas semanais sobre tecnologia, produto e cultura digital no Brasil.',
  coverImage: '/images/podcasts/horizonte-digital-cover.jpg',
  heroImage: '/images/podcasts/horizonte-digital-hero.jpg',
  category: 'Tecnologia',
  status: 'ACTIVE',
  visualStyle: 'PHOTO_REAL',
  year: 2024,
  accentColor: '#d87dff',
  hosts: [
    { name: 'Marina Reiners', initial: 'MR', photo: '/images/hosts/marina.jpg', bio: 'Produtora.' },
    { name: 'Caio Prado', initial: 'CP', photo: null, bio: null },
  ],
  socialLinks: { instagram: 'https://instagram.com/horizonte', website: null },
  featured: true,
  displayOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
};

const episode: Episode = {
  id: '22222222-2222-4222-8222-222222222222',
  podcastId: podcast.id,
  number: 12,
  title: 'A economia dos criadores',
  description: 'Como criadores independentes viraram mídia.',
  thumbnail: '/images/episodes/12.jpg',
  duration: '45:30',
  publishedAt: '2024-05-10T12:00:00Z',
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  youtubeEmbed: 'dQw4w9WgXcQ',
  spotifyUrl: null,
  spotifyEmbed: null,
  createdAt: '2024-05-10T12:00:00Z',
};

/* -------------------------------------------------------------------------- */
/* Resolução da URL pública                                                   */
/* -------------------------------------------------------------------------- */

describe('resolveSiteUrl / getSiteUrl', () => {
  it('usa NEXT_PUBLIC_SITE_URL e remove a barra final', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://reiners.media/' })).toEqual({
      url: SITE,
      source: 'env',
    });
  });

  it('assume https quando o domínio vem sem protocolo', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'reiners.media' }).url).toBe(SITE);
  });

  it('ignora valor inválido e cai no próximo candidato', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: '   ',
        VERCEL_PROJECT_PRODUCTION_URL: 'reiners-media.vercel.app',
      }),
    ).toEqual({ url: 'https://reiners-media.vercel.app', source: 'vercel-production' });
  });

  it('usa o domínio efêmero do preview quando é o único disponível', () => {
    expect(resolveSiteUrl({ VERCEL_URL: 'reiners-abc123.vercel.app' })).toEqual({
      url: 'https://reiners-abc123.vercel.app',
      source: 'vercel-preview',
    });
  });

  it('cai no default de desenvolvimento sem lançar', () => {
    expect(getSiteUrl({ NODE_ENV: 'development' })).toBe(DEFAULT_SITE_URL);
  });

  it('LANÇA em runtime de produção sem origem configurada', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => getSiteUrl({ NODE_ENV: 'production' })).toThrow(MissingSiteUrlError);
    expect(() => getSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });

  it('NÃO lança durante `next build` (fase de build) nem em preview', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      getSiteUrl({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }),
    ).toBe(DEFAULT_SITE_URL);
    expect(getSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(DEFAULT_SITE_URL);
    // A degradação nunca é silenciosa.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('não lança quando a produção está corretamente configurada', () => {
    expect(getSiteUrl({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: SITE })).toBe(SITE);
  });
});

describe('absoluteUrl', () => {
  it('resolve caminho root-relativo contra a origem', () => {
    expect(absoluteUrl('/portfolio', env)).toBe(`${SITE}/portfolio`);
    expect(absoluteUrl('portfolio', env)).toBe(`${SITE}/portfolio`);
    expect(absoluteUrl('/', env)).toBe(`${SITE}/`);
  });

  it('preserva URL já absoluta (capa hospedada no Storage)', () => {
    const remote = 'https://xyz.supabase.co/storage/v1/object/public/capa.jpg';
    expect(absoluteUrl(remote, env)).toBe(remote);
  });
});

/* -------------------------------------------------------------------------- */
/* buildMetadata                                                              */
/* -------------------------------------------------------------------------- */

describe('buildMetadata', () => {
  const metadata = buildMetadata({
    title: 'Portfólio',
    description: 'Catálogo completo.',
    path: PORTFOLIO_PATH,
    image: '/images/og/portfolio.jpg',
    env,
  });

  it('define metadataBase e canonical absoluto', () => {
    expect(metadata.metadataBase?.toString()).toBe(`${SITE}/`);
    expect(metadata.alternates?.canonical).toBe(`${SITE}/portfolio`);
  });

  it('preenche Open Graph completo', () => {
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: `${SITE}/portfolio`,
      siteName: SITE_NAME,
      title: 'Portfólio · Reiners Media',
      description: 'Catálogo completo.',
      locale: SITE_LOCALE,
    });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: `${SITE}/images/og/portfolio.jpg`,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: 'Portfólio · Reiners Media',
      },
    ]);
  });

  it('preenche Twitter Card com imagem absoluta', () => {
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Portfólio · Reiners Media',
      description: 'Catálogo completo.',
    });
    expect(metadata.twitter).toHaveProperty('images', [`${SITE}/images/og/portfolio.jpg`]);
  });

  it('é indexável por padrão e bloqueável sob demanda', () => {
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    const hidden = buildMetadata({ title: 'X', description: 'Y', noIndex: true, env });
    expect(hidden.robots).toMatchObject({ index: false, follow: false });
  });

  it('usa a imagem padrão quando nenhuma é informada', () => {
    const fallback = buildMetadata({ title: 'X', description: 'Y', env });
    expect(fallback.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${SITE}${DEFAULT_OG_IMAGE}` }),
    ]);
  });

  it('aplica o template do título e respeita `absoluteTitle`', () => {
    expect(formatTitle('Portfólio')).toBe('Portfólio · Reiners Media');
    expect(metadata.title).toBe('Portfólio');
    const home = buildMetadata({ title: DEFAULT_TITLE, description: 'x', absoluteTitle: true, env });
    expect(home.title).toEqual({ absolute: DEFAULT_TITLE });
    expect(home.openGraph?.title).toBe(DEFAULT_TITLE);
  });

  it('propaga publishedTime apenas em og:type article', () => {
    const article = buildMetadata({
      title: 'X',
      description: 'Y',
      type: 'article',
      publishedTime: '2024-05-10T12:00:00Z',
      env,
    });
    expect(article.openGraph).toMatchObject({ type: 'article', publishedTime: '2024-05-10T12:00:00Z' });
    const site = buildMetadata({ title: 'X', description: 'Y', publishedTime: '2024-05-10T12:00:00Z', env });
    expect(site.openGraph).not.toHaveProperty('publishedTime');
  });

  it('espelha o template de título do root layout', async () => {
    const layout = await import('@/app/layout');
    const title = layout.metadata.title as { template?: string };
    expect(title.template).toBe(TITLE_TEMPLATE);
  });
});

describe('helpers por tipo de página', () => {
  it('home usa título absoluto e canonical raiz', () => {
    const home = buildHomeMetadata({ env });
    expect(home.title).toEqual({ absolute: DEFAULT_TITLE });
    expect(home.description).toBe(DEFAULT_DESCRIPTION);
    expect(home.alternates?.canonical).toBe(`${SITE}/`);
  });

  it('portfólio aponta para /portfolio', () => {
    const portfolio = buildPortfolioMetadata({ env });
    expect(portfolio.alternates?.canonical).toBe(`${SITE}/portfolio`);
    expect(portfolio.openGraph?.title).toBe('Portfólio · Reiners Media');
  });

  it('programa usa tagline, heroImage e canonical do slug', () => {
    const meta = buildPodcastMetadata(podcast, { env: env });
    expect(meta.alternates?.canonical).toBe(`${SITE}/portfolio/horizonte-digital`);
    expect(meta.description).toBe('Tecnologia sem hype');
    expect(meta.openGraph).toMatchObject({ type: 'article', title: 'Horizonte Digital · Reiners Media' });
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: `${SITE}/images/podcasts/horizonte-digital-hero.jpg`,
        alt: 'Capa do programa Horizonte Digital',
      }),
    ]);
  });

  it('programa sem tagline cai na descrição truncada', () => {
    const longDescription = `${'palavra '.repeat(60)}fim`;
    const meta = buildPodcastMetadata({ ...podcast, tagline: null, description: longDescription }, { env });
    const description = meta.description as string;
    expect(description.length).toBeLessThanOrEqual(200);
    expect(description.endsWith('…')).toBe(true);
  });
});

describe('truncate', () => {
  it('mantém texto curto intacto e normaliza espaços', () => {
    expect(truncate('  um   dois  ', 200)).toBe('um dois');
  });

  it('não parte palavra nem deixa pontuação órfã', () => {
    expect(truncate('alfa bravo charlie delta', 12)).toBe('alfa bravo…');
  });
});

/* -------------------------------------------------------------------------- */
/* JSON-LD                                                                    */
/* -------------------------------------------------------------------------- */

describe('JSON-LD', () => {
  it('Organization aponta para a origem pública', () => {
    const node = organizationJsonLd({ sameAs: ['https://instagram.com/reinersmedia'], env });
    expect(node).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE}/`,
      sameAs: ['https://instagram.com/reinersmedia'],
    });
  });

  it('PodcastSeries descreve o catálogo com hosts, gênero e episódios', () => {
    const node = podcastSeriesJsonLd({ ...podcast, episodes: [episode] }, { env });
    expect(node).toMatchObject({
      '@type': 'PodcastSeries',
      '@id': `${SITE}/portfolio/horizonte-digital#podcast`,
      name: 'Horizonte Digital',
      url: `${SITE}/portfolio/horizonte-digital`,
      image: `${SITE}/images/podcasts/horizonte-digital-cover.jpg`,
      genre: 'Tecnologia',
      inLanguage: 'pt-BR',
      numberOfEpisodes: 1,
      sameAs: ['https://instagram.com/horizonte'],
    });
    expect(node.author).toEqual([
      {
        '@type': 'Person',
        name: 'Marina Reiners',
        description: 'Produtora.',
        image: `${SITE}/images/hosts/marina.jpg`,
      },
      { '@type': 'Person', name: 'Caio Prado' },
    ]);
  });

  it('PodcastEpisode amarra o episódio à série e converte a duração', () => {
    const node = podcastEpisodeJsonLd(episode, podcast, { env });
    expect(node).toMatchObject({
      '@type': 'PodcastEpisode',
      '@id': `${SITE}/portfolio/horizonte-digital#episode-12`,
      episodeNumber: 12,
      datePublished: '2024-05-10T12:00:00Z',
      timeRequired: 'PT45M30S',
      thumbnailUrl: `${SITE}/images/episodes/12.jpg`,
      partOfSeries: {
        '@type': 'PodcastSeries',
        '@id': `${SITE}/portfolio/horizonte-digital#podcast`,
        name: 'Horizonte Digital',
        url: `${SITE}/portfolio/horizonte-digital`,
      },
    });
    expect(node.associatedMedia).toEqual([
      { '@type': 'MediaObject', contentUrl: 'https://youtu.be/dQw4w9WgXcQ' },
    ]);
  });

  it('BreadcrumbList numera as posições a partir de 1', () => {
    const node = podcastBreadcrumbJsonLd(podcast, { env });
    expect(node.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Portfólio', item: `${SITE}/portfolio` },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Horizonte Digital',
        item: `${SITE}/portfolio/horizonte-digital`,
      },
    ]);
    expect(breadcrumbJsonLd([{ name: 'Início', path: '/' }], { env })['@type']).toBe(
      'BreadcrumbList',
    );
  });

  it('remove campos vazios em vez de emitir null', () => {
    const node = podcastSeriesJsonLd({ ...podcast, socialLinks: {} }, { env });
    expect(node).not.toHaveProperty('sameAs');
    expect(JSON.stringify(node)).not.toContain('null');
  });

  it('toIso8601Duration cobre MM:SS, H:MM:SS e entrada inválida', () => {
    expect(toIso8601Duration('45:30')).toBe('PT45M30S');
    expect(toIso8601Duration('1:02:03')).toBe('PT1H2M3S');
    expect(toIso8601Duration('00:00')).toBe('PT0S');
    expect(toIso8601Duration('abc')).toBeUndefined();
    expect(toIso8601Duration(null)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Escape do JSON-LD — XSS armazenado                                         */
/* -------------------------------------------------------------------------- */

describe('serializeJsonLd (escape obrigatório)', () => {
  it('neutraliza `</script>` vindo do título do programa', () => {
    const html = serializeJsonLd(podcastSeriesJsonLd({ ...podcast, title: XSS_TITLE }, { env }));

    // O que fecharia a tag e executaria código:
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('<');
    expect(html).not.toContain('>');
    expect(html).not.toContain('&');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).toContain('\\u003c');

    // ...e ainda assim o dado chega íntegro para o crawler.
    const parsed = JSON.parse(html) as { name: string };
    expect(parsed.name).toBe(XSS_TITLE);
  });

  it('escapa os separadores de linha U+2028/U+2029 (JSON válido, JS inválido)', () => {
    const html = serializeJsonLd({ '@type': 'Thing', name: 'a\u2028b\u2029c' });
    expect(html).not.toContain('\u2028');
    expect(html).not.toContain('\u2029');
    expect(html).toContain('\\u2028');
    expect(JSON.parse(html).name).toBe('a\u2028b\u2029c');
  });

  it('escapa `&` para impedir reintrodução por entidade HTML', () => {
    const html = serializeJsonLd({ '@type': 'Thing', name: 'Rock & Roll' });
    expect(html).toContain('\\u0026');
    expect(JSON.parse(html).name).toBe('Rock & Roll');
  });

  it('jsonLdScriptProps entrega o HTML já escapado', () => {
    const props = jsonLdScriptProps(breadcrumbJsonLd([{ name: XSS_TITLE, path: '/' }], { env }));
    expect(props.type).toBe('application/ld+json');
    expect(props.dangerouslySetInnerHTML.__html).not.toContain('</script>');
    expect(JSON.parse(props.dangerouslySetInnerHTML.__html)['@type']).toBe('BreadcrumbList');
  });
});

describe('podcastPath', () => {
  it('é a única forma de montar o caminho de um programa', () => {
    expect(podcastPath('horizonte-digital')).toBe('/portfolio/horizonte-digital');
  });
});
