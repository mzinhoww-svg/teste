// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  ADMIN_USER_SEED,
  DEFAULT_ADMIN_EMAIL,
  EPISODE_SEED,
  PLAN_SEED,
  PODCAST_SEED,
  SITE_CONFIG_ID,
  SITE_CONFIG_SEED,
  TESTIMONIAL_SEED,
  buildAdminUser,
  buildEpisodes,
  deterministicId,
  episodeId,
} from '../../prisma/seed';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_URI = /^spotify:episode:[A-Za-z0-9]{22}$/;
const DURATION = /^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/;
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('seed — programas', () => {
  it('define exatamente 5 programas', () => {
    expect(PODCAST_SEED).toHaveLength(5);
  });

  it('usa slugs únicos', () => {
    const slugs = PODCAST_SEED.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('cobre os programas e estilos visuais previstos em DATA_MODEL.md', () => {
    expect(
      PODCAST_SEED.map((p) => [p.title, p.category, p.visualStyle]),
    ).toEqual([
      ['Horizonte Digital', 'tech', 'PHOTO_REAL'],
      ['Ressonância', 'saúde', 'ILLUSTRATION'],
      ['Código Aberto', 'dev', 'MINIMAL'],
      ['Latitud', 'viagens', 'DUOTONE'],
      ['Ofício', 'negócios', 'COLLAGE'],
    ]);
  });

  it('usa apenas status válidos e exercita ENDED/HIATUS', () => {
    const statuses = PODCAST_SEED.map((p) => p.status);
    for (const status of statuses) {
      expect(['ACTIVE', 'ENDED', 'HIATUS']).toContain(status);
    }
    expect(statuses).toContain('ENDED');
    expect(statuses).toContain('HIATUS');
  });

  it('preenche os campos obrigatórios de apresentação', () => {
    for (const podcast of PODCAST_SEED) {
      expect(podcast.slug).toMatch(/^[a-z0-9-]+$/);
      expect(podcast.title.length).toBeGreaterThan(0);
      expect(podcast.tagline.length).toBeGreaterThan(0);
      expect(podcast.description.length).toBeGreaterThan(80);
      expect(podcast.coverImage).toMatch(/^\/images\//);
      expect(podcast.heroImage).toMatch(/^\/images\//);
      expect(podcast.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(podcast.year).toBeGreaterThanOrEqual(2015);
      expect(Object.keys(podcast.socialLinks).length).toBeGreaterThan(0);
    }
  });

  it('usa displayOrder único', () => {
    const orders = PODCAST_SEED.map((p) => p.displayOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('BR-003 — todo programa precisa de pelo menos 1 host', () => {
  it.each(PODCAST_SEED.map((p) => [p.slug, p] as const))(
    '%s tem host(s) completos',
    (_slug, podcast) => {
      expect(podcast.hosts.length).toBeGreaterThanOrEqual(1);

      for (const host of podcast.hosts) {
        expect(host.name.length).toBeGreaterThan(0);
        expect(host.initial).toMatch(/^[A-ZÀ-Ú]{1,3}$/);
        expect(host.bio.length).toBeGreaterThan(10);
        expect(host.photo).toMatch(/^\/images\/hosts\//);
      }
    },
  );
});

describe('BR-005 — no máximo 3 programas em destaque', () => {
  it('não ultrapassa o limite', () => {
    const featured = PODCAST_SEED.filter((p) => p.featured);
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.length).toBeLessThanOrEqual(3);
  });
});

describe('BR-006 — programa ENDED nunca é destaque', () => {
  it('nenhum destaque está encerrado', () => {
    const invalid = PODCAST_SEED.filter((p) => p.featured && p.status === 'ENDED');
    expect(invalid).toEqual([]);
  });
});

describe('seed — episódios', () => {
  it('define 25 episódios no total', () => {
    expect(EPISODE_SEED).toHaveLength(25);
  });

  it('define 5 episódios por programa', () => {
    for (const podcast of PODCAST_SEED) {
      const episodes = buildEpisodes(podcast.slug);
      expect(episodes).toHaveLength(5);
      expect(episodes.map((e) => e.number).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5,
      ]);
    }
  });

  it('cada episódio pertence a um programa existente', () => {
    const slugs = new Set(PODCAST_SEED.map((p) => p.slug));
    for (const episode of EPISODE_SEED) {
      expect(slugs.has(episode.podcastSlug)).toBe(true);
    }
  });

  it('usa duração no formato MM:SS ou H:MM:SS', () => {
    for (const episode of EPISODE_SEED) {
      expect(episode.duration).toMatch(DURATION);
    }
  });

  it('ordena publishedAt de forma decrescente dentro de cada programa', () => {
    for (const podcast of PODCAST_SEED) {
      const timestamps = buildEpisodes(podcast.slug).map((e) =>
        new Date(e.publishedAt).getTime(),
      );

      for (const timestamp of timestamps) {
        expect(Number.isNaN(timestamp)).toBe(false);
      }

      for (let i = 1; i < timestamps.length; i += 1) {
        expect(timestamps[i]).toBeLessThan(timestamps[i - 1]);
      }
    }
  });

  it('preenche título, descrição e thumbnail', () => {
    for (const episode of EPISODE_SEED) {
      expect(episode.title.length).toBeGreaterThan(0);
      expect(episode.description.length).toBeGreaterThan(40);
      expect(episode.thumbnail).toBe(
        `/images/episodes/${episode.podcastSlug}-${episode.number}.jpg`,
      );
    }
  });

  it('lança erro para programa desconhecido', () => {
    expect(() => buildEpisodes('nao-existe')).toThrow(/nao-existe/);
  });
});

describe('BR-004 — todo episódio precisa de pelo menos 1 trilha', () => {
  it.each(EPISODE_SEED.map((e) => [`${e.podcastSlug}#${e.number}`, e] as const))(
    '%s tem YouTube e/ou Spotify',
    (_label, episode) => {
      const hasYoutube = Boolean(episode.youtubeUrl && episode.youtubeEmbed);
      const hasSpotify = Boolean(episode.spotifyUrl && episode.spotifyEmbed);
      expect(hasYoutube || hasSpotify).toBe(true);
    },
  );

  it('exercita os três casos: só YouTube, só Spotify e ambos', () => {
    const only = (predicate: (e: (typeof EPISODE_SEED)[number]) => boolean) =>
      EPISODE_SEED.filter(predicate).length;

    expect(only((e) => !!e.youtubeEmbed && !e.spotifyEmbed)).toBeGreaterThan(0);
    expect(only((e) => !e.youtubeEmbed && !!e.spotifyEmbed)).toBeGreaterThan(0);
    expect(only((e) => !!e.youtubeEmbed && !!e.spotifyEmbed)).toBeGreaterThan(0);
  });
});

describe('BR-007 / BR-008 — formato dos embeds', () => {
  it('youtubeEmbed é um video ID de 11 caracteres coerente com a URL', () => {
    const withYoutube = EPISODE_SEED.filter((e) => e.youtubeEmbed);
    expect(withYoutube.length).toBeGreaterThan(0);

    for (const episode of withYoutube) {
      expect(episode.youtubeEmbed).toMatch(YOUTUBE_ID);
      expect(episode.youtubeEmbed).toHaveLength(11);
      expect(episode.youtubeUrl).toBe(
        `https://www.youtube.com/watch?v=${episode.youtubeEmbed}`,
      );
    }
  });

  it('spotifyEmbed é uma URI spotify:episode:<id> coerente com a URL', () => {
    const withSpotify = EPISODE_SEED.filter((e) => e.spotifyEmbed);
    expect(withSpotify.length).toBeGreaterThan(0);

    for (const episode of withSpotify) {
      expect(episode.spotifyEmbed).toMatch(SPOTIFY_URI);
      expect(episode.spotifyEmbed?.startsWith('spotify:episode:')).toBe(true);

      const id = episode.spotifyEmbed!.replace('spotify:episode:', '');
      expect(episode.spotifyUrl).toBe(`https://open.spotify.com/episode/${id}`);
    }
  });

  it('não repete IDs de trilha entre episódios', () => {
    const youtubeIds = EPISODE_SEED.map((e) => e.youtubeEmbed).filter(Boolean);
    const spotifyIds = EPISODE_SEED.map((e) => e.spotifyEmbed).filter(Boolean);

    expect(new Set(youtubeIds).size).toBe(youtubeIds.length);
    expect(new Set(spotifyIds).size).toBe(spotifyIds.length);
  });
});

describe('seed — planos, depoimentos, configuração e admin', () => {
  it('define 3 planos com no máximo 1 destaque', () => {
    expect(PLAN_SEED).toHaveLength(3);
    expect(PLAN_SEED.filter((p) => p.isFeatured)).toHaveLength(1);

    for (const plan of PLAN_SEED) {
      expect(plan.name.length).toBeGreaterThan(0);
      expect(plan.price).toMatch(/^R\$\s/);
      expect(plan.period.length).toBeGreaterThan(0);
      expect(plan.features.length).toBeGreaterThanOrEqual(3);
    }

    expect(new Set(PLAN_SEED.map((p) => p.displayOrder)).size).toBe(3);
  });

  it('define 3 depoimentos com podcastSlug válido quando presente', () => {
    expect(TESTIMONIAL_SEED).toHaveLength(3);

    const slugs = new Set(PODCAST_SEED.map((p) => p.slug));
    for (const testimonial of TESTIMONIAL_SEED) {
      expect(testimonial.quote.length).toBeGreaterThan(40);
      expect(testimonial.role.length).toBeGreaterThan(0);
      if (testimonial.podcastSlug !== null) {
        expect(slugs.has(testimonial.podcastSlug)).toBe(true);
      }
    }
  });

  it('define 1 SiteConfig alinhado à identidade da marca', () => {
    expect(SITE_CONFIG_SEED.siteName).toBe('Reiners Media');
    expect(SITE_CONFIG_SEED.tagline).toBe('Conteúdo que conecta');
    expect(SITE_CONFIG_SEED.primaryColor).toBe('#d87dff');
    expect(SITE_CONFIG_ID).toMatch(UUID_V5);
  });

  it('define 1 admin com role ADMIN e fallback de e-mail', () => {
    expect(ADMIN_USER_SEED.role).toBe('ADMIN');
    expect(ADMIN_USER_SEED.email).toMatch(/^[^@\s]+@[^@\s]+$/);

    expect(buildAdminUser({}).email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(buildAdminUser({ SEED_ADMIN_EMAIL: '  ' }).email).toBe(
      DEFAULT_ADMIN_EMAIL,
    );
    expect(
      buildAdminUser({ SEED_ADMIN_EMAIL: 'dono@reiners.media' }).email,
    ).toBe('dono@reiners.media');
    expect(buildAdminUser({ SEED_ADMIN_EMAIL: 'dono@reiners.media' }).role).toBe(
      'ADMIN',
    );
  });
});

describe('idempotência — identificadores determinísticos', () => {
  it('deterministicId gera UUID v5 estável', () => {
    expect(deterministicId('episode:latitud:1')).toMatch(UUID_V5);
    expect(deterministicId('episode:latitud:1')).toBe(
      deterministicId('episode:latitud:1'),
    );
    expect(deterministicId('episode:latitud:1')).not.toBe(
      deterministicId('episode:latitud:2'),
    );
  });

  it('cada episódio tem um id determinístico único', () => {
    const ids = EPISODE_SEED.map((e) => episodeId(e.podcastSlug, e.number));

    for (const id of ids) {
      expect(id).toMatch(UUID_V5);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('efeitos colaterais', () => {
  it('importar o seed não executa main() nem abre conexão', async () => {
    const module = await import('../../prisma/seed');
    expect(typeof module.seed).toBe('function');
    expect(module.PODCAST_SEED).toHaveLength(5);
  });
});
