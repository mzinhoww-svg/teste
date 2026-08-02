// @vitest-environment node
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  episodeCreateSchema,
  podcastCreateSchema,
  siteConfigCreateSchema,
  testimonialCreateSchema,
} from '@/lib/schemas';

import {
  ADMIN_USER_SEED,
  DEFAULT_ADMIN_EMAIL,
  EPISODE_SEED,
  LOCAL_DB_HOSTS,
  PLAN_SEED,
  PODCAST_SEED,
  PRODUCTION_SEED_OVERRIDE,
  SEED_ALLOWED_HOSTS_VAR,
  SITE_CONFIG_ID,
  SITE_CONFIG_SEED,
  TESTIMONIAL_SEED,
  assertSeedAllowed,
  buildAdminUser,
  buildEpisodes,
  databaseHost,
  deterministicId,
  episodeId,
  main,
  seed,
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

/* -------------------------------------------------------------------------- */
/* Contrato Zod — os dados do seed precisam passar pelos schemas reais da API  */
/* -------------------------------------------------------------------------- */

describe('contrato — dados do seed vs. schemas Zod de src/lib/schemas', () => {
  const fakePodcastId = (slug: string) => deterministicId(`podcast:${slug}`);

  it.each(PODCAST_SEED.map((p) => [p.slug, p] as const))(
    'programa %s satisfaz podcastCreateSchema',
    (_slug, podcast) => {
      const result = podcastCreateSchema.safeParse(podcast);

      expect(
        result.success ? null : result.error.issues,
        'seed de programa rejeitado pelo contrato Zod',
      ).toBeNull();
    },
  );

  it.each(EPISODE_SEED.map((e) => [`${e.podcastSlug}#${e.number}`, e] as const))(
    'episódio %s satisfaz episodeCreateSchema',
    (_label, episode) => {
      // `*Embed` é derivado no servidor (BR-007/BR-008) e não faz parte do create.
      const payload = {
        podcastId: fakePodcastId(episode.podcastSlug),
        number: episode.number,
        title: episode.title,
        description: episode.description,
        thumbnail: episode.thumbnail,
        duration: episode.duration,
        publishedAt: episode.publishedAt,
        youtubeUrl: episode.youtubeUrl,
        spotifyUrl: episode.spotifyUrl,
      };

      const result = episodeCreateSchema.safeParse(payload);

      expect(
        result.success ? null : result.error.issues,
        'seed de episódio rejeitado pelo contrato Zod',
      ).toBeNull();
    },
  );

  it('SITE_CONFIG_SEED satisfaz siteConfigCreateSchema', () => {
    const result = siteConfigCreateSchema.safeParse(SITE_CONFIG_SEED);

    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it.each(TESTIMONIAL_SEED.map((t) => [t.name, t] as const))(
    'depoimento de %s satisfaz testimonialCreateSchema',
    (_name, testimonial) => {
      const payload = {
        name: testimonial.name,
        role: testimonial.role,
        quote: testimonial.quote,
        avatarUrl: testimonial.avatarUrl,
        podcastId: testimonial.podcastSlug
          ? fakePodcastId(testimonial.podcastSlug)
          : null,
      };

      const result = testimonialCreateSchema.safeParse(payload);

      expect(result.success ? null : result.error.issues).toBeNull();
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Guarda de ambiente (segurança)                                             */
/* -------------------------------------------------------------------------- */

describe('assertSeedAllowed — não popula produção sem confirmação', () => {
  it('permite fora de produção', () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('bloqueia em produção sem a variável de confirmação', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      /ALLOW_PRODUCTION_SEED/,
    );
  });

  it('bloqueia em produção com confirmação inválida', () => {
    for (const value of ['', 'false', '1', 'yes', 'TRUE']) {
      expect(() =>
        assertSeedAllowed({
          NODE_ENV: 'production',
          [PRODUCTION_SEED_OVERRIDE]: value,
        }),
      ).toThrow(/Seed bloqueado/);
    }
  });

  it('libera em produção com ALLOW_PRODUCTION_SEED=true', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        [PRODUCTION_SEED_OVERRIDE]: 'true',
      }),
    ).not.toThrow();
  });
});

describe('assertSeedAllowed — host da DATABASE_URL (acidente sem NODE_ENV)', () => {
  const local = 'postgresql://u:p@localhost:5432/postgres';
  const remote =
    'postgresql://u:p@db.abcdefgh.supabase.co:6543/postgres?pgbouncer=true';

  it('libera bancos locais', () => {
    for (const host of LOCAL_DB_HOSTS) {
      const url = `postgresql://u:p@${host.includes(':') ? `[${host}]` : host}:5432/postgres`;
      expect(() => assertSeedAllowed({ DATABASE_URL: url })).not.toThrow();
    }
    expect(() => assertSeedAllowed({ DATABASE_URL: local })).not.toThrow();
  });

  it('bloqueia host remoto mesmo com NODE_ENV indefinido', () => {
    // Este é o cenário real: shell comum, NODE_ENV não setado.
    expect(() => assertSeedAllowed({ DATABASE_URL: remote })).toThrow(
      /db\.abcdefgh\.supabase\.co/,
    );
  });

  it('a mensagem ensina a saída correta', () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: remote })).toThrow(
      /SEED_ALLOWED_DB_HOSTS/,
    );
  });

  it('SEED_ALLOWED_DB_HOSTS libera o host nomeado', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: remote,
        [SEED_ALLOWED_HOSTS_VAR]: 'db.abcdefgh.supabase.co',
      }),
    ).not.toThrow();
  });

  it('aceita lista com espaços e várias entradas', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: remote,
        [SEED_ALLOWED_HOSTS_VAR]: ' outro.host , db.abcdefgh.supabase.co ',
      }),
    ).not.toThrow();
  });

  it('a allowlist NÃO vira liberação geral: trocar para produção volta a bloquear', () => {
    // O ponto do design: quem libera o banco de dev por nome continua protegido
    // se a DATABASE_URL passar a apontar para outro host.
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: 'postgresql://u:p@db.producao.supabase.co:6543/postgres',
        [SEED_ALLOWED_HOSTS_VAR]: 'db.abcdefgh.supabase.co',
      }),
    ).toThrow(/db\.producao\.supabase\.co/);
  });

  it('ALLOW_PRODUCTION_SEED=true continua sendo a válvula de escape', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: remote,
        [PRODUCTION_SEED_OVERRIDE]: 'true',
      }),
    ).not.toThrow();
  });

  it('não bloqueia quando não há DATABASE_URL utilizável', () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ DATABASE_URL: '' })).not.toThrow();
    expect(() => assertSeedAllowed({ DATABASE_URL: 'nao-e-url' })).not.toThrow();
  });

  it('databaseHost extrai o host ignorando credenciais, porta e query', () => {
    expect(databaseHost(remote)).toBe('db.abcdefgh.supabase.co');
    expect(databaseHost(local)).toBe('localhost');
    expect(databaseHost('postgresql://u:p@[::1]:5432/db')).toBe('::1');
    expect(databaseHost(undefined)).toBeNull();
    expect(databaseHost('nao-e-url')).toBeNull();
  });
});

describe('main() — a guarda é realmente invocada antes de escrever', () => {
  it('em produção: rejeita sem instanciar o client nem emitir upserts', async () => {
    const mock = createPrismaMock();
    const createClient = vi.fn(() => mock.client);

    await expect(
      main(createClient, { NODE_ENV: 'production' }),
    ).rejects.toThrow(/Seed bloqueado/);

    // Se alguém remover `assertSeedAllowed()` de main(), estes dois falham.
    expect(createClient).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it('com DATABASE_URL remota: rejeita sem emitir upserts', async () => {
    const mock = createPrismaMock();
    const createClient = vi.fn(() => mock.client);

    await expect(
      main(createClient, {
        DATABASE_URL: 'postgresql://u:p@db.producao.supabase.co:6543/postgres',
      }),
    ).rejects.toThrow(/Seed bloqueado/);

    expect(createClient).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it('controle positivo: liberado, main() de fato escreve (o assert enxerga)', async () => {
    const mock = createPrismaMock();
    const createClient = vi.fn(() => mock.client);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await main(createClient, { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    } finally {
      log.mockRestore();
    }

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(mock.calls).toHaveLength(5 + 25 + 3 + 3 + 1 + 1);
  });

  it('fecha a conexão mesmo quando o seed falha', async () => {
    const disconnect = vi.fn(() => Promise.resolve());
    const failing = {
      podcast: { upsert: vi.fn(() => Promise.reject(new Error('boom'))) },
      $disconnect: disconnect,
    } as unknown as PrismaClient;

    await expect(
      main(() => failing, { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }),
    ).rejects.toThrow('boom');

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* seed() — execução contra um PrismaClient mockado                            */
/* -------------------------------------------------------------------------- */

interface UpsertArgs {
  where: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

interface RecordedCall extends UpsertArgs {
  model: string;
}

/** id previsível devolvido pelo upsert de Podcast, para rastrear a FK. */
const mockPodcastId = (slug: string) => `podcast-row-id::${slug}`;

function createPrismaMock() {
  const calls: RecordedCall[] = [];
  const rawCreates: string[] = [];

  const model = (
    name: string,
    onUpsert: (args: UpsertArgs) => { id: string },
  ) => ({
    upsert: vi.fn((args: UpsertArgs) => {
      calls.push({ model: name, ...args });
      return Promise.resolve(onUpsert(args));
    }),
    create: vi.fn(() => {
      rawCreates.push(name);
      return Promise.resolve({ id: 'raw' });
    }),
    createMany: vi.fn(() => {
      rawCreates.push(`${name}.createMany`);
      return Promise.resolve({ count: 0 });
    }),
  });

  const podcast = {
    ...model(
      'podcast',
      (args) => ({ id: mockPodcastId(String(args.where.slug)) }),
    ),
    findUnique: vi.fn((args: { where: { slug: string } }) =>
      Promise.resolve({ id: mockPodcastId(args.where.slug) }),
    ),
  };

  const client = {
    podcast,
    episode: model('episode', () => ({ id: 'episode-row-id' })),
    plan: model('plan', () => ({ id: 'plan-row-id' })),
    testimonial: model('testimonial', () => ({ id: 'testimonial-row-id' })),
    siteConfig: model('siteConfig', () => ({ id: 'site-config-row-id' })),
    adminUser: model('adminUser', () => ({ id: 'admin-row-id' })),
    $disconnect: vi.fn(() => Promise.resolve()),
  };

  return {
    client: client as unknown as PrismaClient,
    calls,
    rawCreates,
    podcastFindUnique: podcast.findUnique,
    of: (name: string) => calls.filter((c) => c.model === name),
  };
}

describe('seed() — escrita no banco (PrismaClient mockado)', () => {
  it('faz exatamente 5 upserts de Podcast, com where por slug', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    const podcasts = mock.of('podcast');
    expect(podcasts).toHaveLength(5);
    expect(podcasts.map((c) => c.where.slug)).toEqual(
      PODCAST_SEED.map((p) => p.slug),
    );
  });

  it('faz exatamente 25 upserts de Episode, com where por id determinístico', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    const episodes = mock.of('episode');
    expect(episodes).toHaveLength(25);

    const expectedIds = EPISODE_SEED.map((e) =>
      episodeId(e.podcastSlug, e.number),
    );
    expect(episodes.map((c) => c.where.id).sort()).toEqual(expectedIds.sort());
  });

  it('grava o Podcast antes de qualquer Episode (senão a FK quebra)', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    const firstPodcast = mock.calls.findIndex((c) => c.model === 'podcast');
    const firstEpisode = mock.calls.findIndex((c) => c.model === 'episode');

    expect(firstPodcast).toBeGreaterThanOrEqual(0);
    expect(firstEpisode).toBeGreaterThan(firstPodcast);
  });

  it('cada Episode é gravado depois do SEU Podcast e com o podcastId resolvido', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    // Mapeia id determinístico do episódio -> slug esperado.
    const slugByEpisodeId = new Map(
      EPISODE_SEED.map((e) => [episodeId(e.podcastSlug, e.number), e.podcastSlug]),
    );

    for (const [index, call] of mock.calls.entries()) {
      if (call.model !== 'episode') continue;

      const slug = slugByEpisodeId.get(String(call.where.id));
      expect(slug, `episódio ${String(call.where.id)} sem programa`).toBeDefined();

      // FK aponta para o id devolvido pelo upsert do programa certo.
      expect(call.create.podcastId).toBe(mockPodcastId(slug!));
      expect(call.update.podcastId).toBe(mockPodcastId(slug!));

      const ownerIndex = mock.calls.findIndex(
        (c) => c.model === 'podcast' && c.where.slug === slug,
      );
      expect(ownerIndex).toBeGreaterThanOrEqual(0);
      expect(ownerIndex).toBeLessThan(index);
    }
  });

  it('grava planos, depoimentos, configuração e admin', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    expect(mock.of('plan')).toHaveLength(3);
    expect(mock.of('testimonial')).toHaveLength(3);
    expect(mock.of('siteConfig')).toHaveLength(1);
    expect(mock.of('adminUser')).toHaveLength(1);

    expect(mock.of('siteConfig')[0].where.id).toBe(SITE_CONFIG_ID);
    expect(mock.of('adminUser')[0].where.email).toBe(ADMIN_USER_SEED.email);
  });

  it('resolve o podcastId dos depoimentos pelo slug, e usa null quando não há', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    const testimonials = mock.of('testimonial');

    for (const [index, testimonial] of TESTIMONIAL_SEED.entries()) {
      const call = testimonials[index];
      expect(call.create.name).toBe(testimonial.name);
      expect(call.create.podcastId).toBe(
        testimonial.podcastSlug ? mockPodcastId(testimonial.podcastSlug) : null,
      );
    }

    // Só consulta o programa para os depoimentos que declaram um slug.
    const withSlug = TESTIMONIAL_SEED.filter((t) => t.podcastSlug).length;
    expect(mock.podcastFindUnique).toHaveBeenCalledTimes(withSlug);
  });

  it('nunca usa create/createMany cru — só upsert', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    expect(mock.rawCreates).toEqual([]);
    expect(mock.calls).toHaveLength(5 + 25 + 3 + 3 + 1 + 1);
  });

  it('não promove a ADMIN uma conta já existente (role fora do update)', async () => {
    const mock = createPrismaMock();
    await seed(mock.client);

    const admin = mock.of('adminUser')[0];

    expect(admin.create.role).toBe('ADMIN');
    expect(admin.update).not.toHaveProperty('role');
  });

  it('é idempotente: duas execuções emitem exatamente os mesmos where', async () => {
    const first = createPrismaMock();
    await seed(first.client);

    const second = createPrismaMock();
    await seed(second.client);

    const signature = (mock: ReturnType<typeof createPrismaMock>) =>
      mock.calls.map((c) => `${c.model}:${JSON.stringify(c.where)}`);

    expect(signature(second)).toEqual(signature(first));

    // E o where de todo upsert é uma chave estável, nunca um id aleatório.
    for (const call of first.calls) {
      const key = Object.keys(call.where);
      expect(key).toHaveLength(1);
      expect(['slug', 'id', 'email']).toContain(key[0]);
      expect(call.where[key[0]]).toBeTruthy();
    }
  });

  it('propaga erro do banco em vez de engolir', async () => {
    const mock = createPrismaMock();
    const failing = {
      ...(mock.client as unknown as Record<string, unknown>),
      podcast: {
        upsert: vi.fn(() => Promise.reject(new Error('FK violation'))),
      },
    } as unknown as PrismaClient;

    await expect(seed(failing)).rejects.toThrow('FK violation');
  });
});
