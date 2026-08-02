/**
 * Tradução de `podcastQuerySchema` para argumentos do Prisma (TCK-005).
 *
 * POR QUE ISTO NÃO MORA NO `route.ts`: um módulo de rota do App Router só pode
 * exportar os verbos HTTP (`GET`, `POST`, ...) e um conjunto fechado de campos
 * de configuração (`runtime`, `dynamic`, `revalidate`, `fetchCache`,
 * `preferredRegion`, `maxDuration`). Qualquer outro export quebra o
 * `next build` com "X is not a valid Route export field" — erro que nem o
 * `tsc --noEmit` nem os testes pegam, porque é regra sobre o FORMATO do módulo
 * de rota, não sobre tipos. `_lib/` não é rota, então aqui o export é livre.
 */
import type { podcastQuerySchema } from '@/lib/schemas';
import type { z } from 'zod';

export type PodcastQuery = z.infer<typeof podcastQuerySchema>;

/**
 * Monta o `where` do Prisma a partir dos filtros já validados.
 * `deletedAt: null` é fixo: soft delete é invisível para qualquer listagem.
 */
export function buildPodcastWhere(query: PodcastQuery): Record<string, unknown> {
  const where: Record<string, unknown> = { deletedAt: null };
  if (query.status !== undefined) where.status = query.status;
  if (query.featured !== undefined) where.featured = query.featured;
  if (query.category !== undefined) {
    where.category = { equals: query.category, mode: 'insensitive' };
  }
  return where;
}

/** Ordenação estável: o critério pedido + `id` como desempate determinístico. */
export function buildPodcastOrderBy(query: PodcastQuery): Record<string, string>[] {
  return [{ [query.sort]: query.order }, { id: 'asc' }];
}
