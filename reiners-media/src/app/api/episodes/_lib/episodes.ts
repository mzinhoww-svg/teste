/**
 * Acesso a dados e serialização compartilhados pelas rotas de episódio (TCK-006).
 */
import type { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { type episodeSchema, toPublicEpisode } from '@/lib/schemas';

export type PublicEpisode = z.infer<typeof episodeSchema>;

/**
 * ARMADILHA (contracts/README.md): nunca entregue a linha crua do Prisma ao
 * schema de resposta. `episodeSchema` é `.strict()` e espera ISO-8601, enquanto
 * a linha traz `Date` em `publishedAt`/`createdAt` — e qualquer coluna nova
 * viraria `unrecognized_keys` e 500 numa rota pública. `toPublicEpisode` resolve
 * os dois casos; esta função existe só para concentrar a conversão de tipo.
 */
export function serializeEpisode(row: object): PublicEpisode {
  return toPublicEpisode({ ...row });
}

/**
 * `true` quando o programa existe e não está soft-deleted.
 *
 * Episódio órfão é impossível pelo FK, mas sem esta checagem um `podcastId`
 * inexistente viraria erro do Prisma (500) em vez do 404 documentado no YAML.
 */
export async function podcastExists(podcastId: string): Promise<boolean> {
  const podcast = await prisma.podcast.findFirst({
    where: { id: podcastId, deletedAt: null },
    select: { id: true },
  });
  return podcast !== null;
}

/**
 * `true` quando o programa já tem outro episódio com este `number`.
 *
 * O banco não tem índice único `(podcastId, number)`, então a unicidade é
 * fechada aqui — o YAML documenta 409 para o caso.
 */
export async function episodeNumberTaken(
  podcastId: string,
  numberValue: number,
  excludeEpisodeId?: string,
): Promise<boolean> {
  const duplicate = await prisma.episode.findFirst({
    where: {
      podcastId,
      number: numberValue,
      ...(excludeEpisodeId === undefined ? {} : { id: { not: excludeEpisodeId } }),
    },
    select: { id: true },
  });
  return duplicate !== null;
}
