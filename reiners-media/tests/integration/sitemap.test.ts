// @vitest-environment node
/**
 * TCK-022 — testes de integração das rotas de metadata `/sitemap.xml` e
 * `/robots.txt`.
 *
 * São "integração" porque exercitam os módulos de rota do App Router de ponta a
 * ponta: o export default real, a resolução de origem de `@/lib/metadata` e o
 * acesso ao Prisma. A única fronteira duplada é o `PrismaClient` — o ambiente
 * não tem PostgreSQL. Nada aqui reimplementa lógica de produção.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { podcast: { findMany: vi.fn() } },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock, default: prismaMock }));

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

const SITE = 'https://reiners.media';

interface PodcastRow {
  slug: string;
  status: string;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Linhas como o banco as tem — inclusive as que o sitemap deve ignorar. */
const ROWS: PodcastRow[] = [
  { slug: 'horizonte-digital', status: 'ACTIVE', updatedAt: new Date('2024-06-01T10:00:00Z'), deletedAt: null },
  { slug: 'pausa-criativa', status: 'HIATUS', updatedAt: new Date('2024-03-02T10:00:00Z'), deletedAt: null },
  { slug: 'temporada-final', status: 'ENDED', updatedAt: new Date('2023-12-20T10:00:00Z'), deletedAt: null },
  {
    slug: 'programa-removido',
    status: 'ACTIVE',
    updatedAt: new Date('2024-05-05T10:00:00Z'),
    deletedAt: new Date('2024-05-06T10:00:00Z'),
  },
];

/**
 * Duplo fiel do Prisma: aplica de verdade o `where` que a rota mandou. Se a rota
 * esquecer `deletedAt: null`, o programa removido volta na lista e o teste
 * quebra — que é exatamente o ponto.
 */
function findManyFake(args: { where?: { deletedAt?: null } }) {
  const rows = args?.where && 'deletedAt' in args.where ? ROWS.filter((r) => r.deletedAt === null) : ROWS;
  return Promise.resolve(rows.map(({ slug, status, updatedAt }) => ({ slug, status, updatedAt })));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE);
  prismaMock.podcast.findMany.mockReset();
  prismaMock.podcast.findMany.mockImplementation(findManyFake);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sitemap', () => {
  it('inclui home e /portfolio com URL absoluta', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls.slice(0, 2)).toEqual([`${SITE}/`, `${SITE}/portfolio`]);
    expect(entries[0]).toMatchObject({ changeFrequency: 'weekly', priority: 1 });
    expect(entries[1]).toMatchObject({ changeFrequency: 'daily', priority: 0.9 });
  });

  it('gera uma entrada por programa, com lastModified vindo de updatedAt', async () => {
    const entries = await sitemap();
    const entry = entries.find((item) => item.url === `${SITE}/portfolio/horizonte-digital`);

    expect(entry).toBeDefined();
    expect(entry?.lastModified).toEqual(new Date('2024-06-01T10:00:00Z'));
    expect(entry).toMatchObject({ priority: 0.8, changeFrequency: 'weekly' });
  });

  it('EXCLUI programa soft-deletado (consulta filtra deletedAt: null)', async () => {
    const entries = await sitemap();
    const urls = entries.map((item) => item.url);

    expect(urls).not.toContain(`${SITE}/portfolio/programa-removido`);
    expect(urls).toHaveLength(5); // 2 estáticas + 3 programas vivos
    expect(prismaMock.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it('INCLUI ENDED e HIATUS, com peso menor para o encerrado', async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((item) => [item.url, item]));

    expect(byUrl.get(`${SITE}/portfolio/pausa-criativa`)).toMatchObject({ priority: 0.8 });
    expect(byUrl.get(`${SITE}/portfolio/temporada-final`)).toMatchObject({
      priority: 0.5,
      changeFrequency: 'yearly',
    });
  });

  it('sobrevive a banco indisponível devolvendo o sitemap mínimo', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.podcast.findMany.mockRejectedValue(new Error("Can't reach database server"));

    const entries = await sitemap();

    expect(entries.map((item) => item.url)).toEqual([`${SITE}/`, `${SITE}/portfolio`]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('sobrevive ao módulo do Prisma falhando na avaliação (DATABASE_URL ausente)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    vi.doMock('@/lib/prisma', () => {
      throw new Error('Environment variable not found: DATABASE_URL');
    });

    try {
      const { default: freshSitemap } = await import('@/app/sitemap');
      const entries = await freshSitemap();
      expect(entries.map((item) => item.url)).toEqual([`${SITE}/`, `${SITE}/portfolio`]);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      vi.doUnmock('@/lib/prisma');
      vi.resetModules();
    }
  });
});

describe('robots', () => {
  it('libera o público e bloqueia /admin e /api', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const wildcard = rules.find((rule) => rule.userAgent === '*');

    expect(wildcard?.allow).toBe('/');
    const disallow = wildcard?.disallow;
    const disallowList = Array.isArray(disallow) ? disallow : [disallow];
    expect(disallowList).toContain('/admin');
    expect(disallowList).toContain('/api');
  });

  it('referencia o sitemap na origem pública', () => {
    const result = robots();
    expect(result.sitemap).toBe(`${SITE}/sitemap.xml`);
    expect(result.host).toBe(SITE);
  });
});
