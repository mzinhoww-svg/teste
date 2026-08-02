/**
 * `GET|PATCH|DELETE /api/episodes/:id` — CONTRACT-007 (TCK-006).
 *
 * Contrato: `contracts/api/episodes.yaml` (`getEpisodeById`, `updateEpisode`,
 * `deleteEpisode`). RBAC e rate limit ficam no middleware de TCK-004.
 *
 * O ponto sensível desta rota é BR-004 no PATCH: `episodeUpdateSchema` é
 * parcial e só consegue avaliar a regra quando `youtubeUrl` e `spotifyUrl`
 * chegam JUNTOS. Um `PATCH {"youtubeUrl": null}` num episódio que só tinha
 * YouTube passa no schema e zeraria a última trilha. Por isso o handler mescla
 * o estado persistido com o patch (`mergeEpisodeTracks`) e roda
 * `validateEpisodeTracks` sobre o resultado, devolvendo 409.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  episodeResponseSchema,
  episodeUpdateSchema,
  idParamSchema,
  validateEpisodeTracks,
} from '@/lib/schemas';
import { deriveEpisodeEmbeds, mergeEpisodeTracks } from '@/lib/url-parser';

import { episodeNumberTaken, serializeEpisode } from '../_lib/episodes';
import { requireAdmin, requireEditor } from '../_lib/guard';
import {
  conflict,
  internalError,
  notFound,
  readJsonBody,
  ruleConflict,
  validationError,
} from '../_lib/http';

export const dynamic = 'force-dynamic';

/** Contexto de rota do App Router: `params` já vem resolvido no Next 14. */
interface RouteContext {
  params: { id: string };
}

/** `P2025` = "record not found" do Prisma, numa corrida entre leitura e escrita. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025';
}

/** Episódio por id. Rota pública. */
export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const params = idParamSchema.safeParse(context.params);
    if (!params.success) {
      return validationError(params.error, 'Identificador de episódio inválido');
    }

    const episode = await prisma.episode.findUnique({ where: { id: params.data.id } });
    if (episode === null) {
      return notFound('Episódio não encontrado');
    }

    const body = episodeResponseSchema.parse({ data: serializeEpisode(episode) });
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error('[GET /api/episodes/:id]', error);
    return internalError();
  }
}

/**
 * Atualização parcial.
 *
 * `podcastId` não é aceito no body (decisão 9 do contrato: mover episódio entre
 * programas exige delete + create) — o schema é `.strict()`, então enviá-lo é
 * 422. Os embeds são sempre re-derivados das URLs mescladas: assim
 * `youtubeEmbed` nunca sobrevive à remoção da `youtubeUrl` que o originou.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const auth = await requireEditor(request);
    if (!auth.ok) return auth.response;

    const params = idParamSchema.safeParse(context.params);
    if (!params.success) {
      return validationError(params.error, 'Identificador de episódio inválido');
    }

    const json = await readJsonBody(request);
    if (!json.ok) return json.response;

    const parsed = episodeUpdateSchema.safeParse(json.value);
    if (!parsed.success) {
      return validationError(parsed.error, 'Não foi possível atualizar o episódio');
    }

    const patch = parsed.data;
    const current = await prisma.episode.findUnique({ where: { id: params.data.id } });
    if (current === null) {
      return notFound('Episódio não encontrado');
    }

    // BR-004 sobre o estado MESCLADO — obrigação do handler, não do schema.
    const tracks = mergeEpisodeTracks(current, patch);
    const violations = validateEpisodeTracks(tracks);
    if (violations.length > 0) {
      return ruleConflict(violations);
    }

    if (patch.number !== undefined && patch.number !== current.number) {
      if (await episodeNumberTaken(current.podcastId, patch.number, current.id)) {
        return conflict(`Já existe um episódio número ${patch.number} neste programa`, {
          field: 'number',
          podcastId: current.podcastId,
          number: patch.number,
        });
      }
    }

    const embeds = deriveEpisodeEmbeds(tracks);
    const data: Prisma.EpisodeUpdateInput = {
      youtubeUrl: tracks.youtubeUrl,
      spotifyUrl: tracks.spotifyUrl,
      youtubeEmbed: embeds.youtubeEmbed,
      spotifyEmbed: embeds.spotifyEmbed,
    };
    if (patch.number !== undefined) data.number = patch.number;
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if ('thumbnail' in patch) data.thumbnail = patch.thumbnail ?? null;
    if (patch.duration !== undefined) data.duration = patch.duration;
    if (patch.publishedAt !== undefined) data.publishedAt = new Date(patch.publishedAt);

    const updated = await prisma.episode.update({ where: { id: current.id }, data });
    const body = episodeResponseSchema.parse({ data: serializeEpisode(updated) });
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return notFound('Episódio não encontrado');
    }
    console.error('[PATCH /api/episodes/:id]', error);
    return internalError();
  }
}

/**
 * Remoção definitiva.
 *
 * `Episode` não tem `deletedAt` no schema Prisma (diferente de `Podcast`), logo
 * o delete é físico. A resposta devolve o episódio removido para o painel
 * conseguir oferecer desfazer/registro sem uma segunda leitura.
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    // BR-002: EDITOR não apaga. O guard devolve 403 antes de qualquer leitura.
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const params = idParamSchema.safeParse(context.params);
    if (!params.success) {
      return validationError(params.error, 'Identificador de episódio inválido');
    }

    const episode = await prisma.episode.findUnique({ where: { id: params.data.id } });
    if (episode === null) {
      return notFound('Episódio não encontrado');
    }

    await prisma.episode.delete({ where: { id: params.data.id } });

    const body = episodeResponseSchema.parse({ data: serializeEpisode(episode) });
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return notFound('Episódio não encontrado');
    }
    console.error('[DELETE /api/episodes/:id]', error);
    return internalError();
  }
}
