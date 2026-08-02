/**
 * TCK-022 — `/sitemap.xml` dinâmico (FR-019).
 *
 * O App Router gera o XML a partir do array devolvido pelo export default. Este
 * arquivo é uma ROTA de metadata: só o `export default` pode sair daqui — nomes
 * extras não são reconhecidos pelo Next e poluem o módulo de rota.
 *
 * ---------------------------------------------------------------------------
 * O QUE ENTRA NO SITEMAP — decisão registrada
 * ---------------------------------------------------------------------------
 * - Soft delete (`deletedAt != null`): NUNCA entra. O programa foi removido do
 *   produto; indexá-lo produziria 404 (ou pior, conteúdo que o dono já retirou
 *   do ar) e derruba a confiança do crawler no sitemap inteiro.
 * - `status: 'ENDED'`: ENTRA, deliberadamente. Programa encerrado continua tendo
 *   valor de catálogo — é portfólio, é a prova social que a página de vendas
 *   promete — e a página segue existindo e respondendo 200. O que muda é o peso:
 *   `priority` menor e `changeFrequency` mais rara, sinalizando ao crawler que
 *   ali não nasce conteúdo novo. `HIATUS` é tratado como ativo: pausa não é fim.
 *
 * ---------------------------------------------------------------------------
 * BANCO INDISPONÍVEL
 * ---------------------------------------------------------------------------
 * Um sitemap que devolve 500 é pior do que um sitemap enxuto: o Google marca a
 * fonte como quebrada e pode descartar o que já havia lido dela. Por isso a
 * consulta é isolada em try/catch e a rota degrada para as rotas estáticas.
 * O `import()` do Prisma é dinâmico DE PROPÓSITO: sem `DATABASE_URL` o cliente
 * falha já na construção, durante a avaliação do módulo — um import estático
 * jogaria essa exceção fora do alcance do try/catch e derrubaria a rota.
 */
import type { MetadataRoute } from 'next';

import { HOME_PATH, PORTFOLIO_PATH, absoluteUrl, podcastPath } from '@/lib/metadata';

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

interface StaticRoute {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

/** Rotas públicas que existem independentemente do conteúdo do banco. */
const STATIC_ROUTES: readonly StaticRoute[] = [
  { path: HOME_PATH, changeFrequency: 'weekly', priority: 1 },
  { path: PORTFOLIO_PATH, changeFrequency: 'daily', priority: 0.9 },
];

/** Programa encerrado: indexável, porém com peso menor (ver cabeçalho). */
const ENDED_ROUTE = { changeFrequency: 'yearly' as ChangeFrequency, priority: 0.5 };
const LIVE_ROUTE = { changeFrequency: 'weekly' as ChangeFrequency, priority: 0.8 };

interface PodcastSitemapRow {
  slug: string;
  status: string;
  updatedAt: Date;
}

/**
 * Programas indexáveis, em ordem de exibição. Devolve `[]` — e nunca lança — se
 * o banco estiver fora.
 */
async function loadIndexablePodcasts(): Promise<PodcastSitemapRow[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const rows = await prisma.podcast.findMany({
      // Único filtro de negócio: soft delete. Todo status é indexável.
      where: { deletedAt: null },
      select: { slug: true, status: true, updatedAt: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows as PodcastSitemapRow[];
  } catch (error) {
    console.error('[sitemap] falha ao carregar programas; degradando para rotas estáticas', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const podcasts = await loadIndexablePodcasts();
  const podcastEntries: MetadataRoute.Sitemap = podcasts.map((podcast) => {
    const weight = podcast.status === 'ENDED' ? ENDED_ROUTE : LIVE_ROUTE;
    return {
      url: absoluteUrl(podcastPath(podcast.slug)),
      lastModified: podcast.updatedAt,
      changeFrequency: weight.changeFrequency,
      priority: weight.priority,
    };
  });

  return [...staticEntries, ...podcastEntries];
}
